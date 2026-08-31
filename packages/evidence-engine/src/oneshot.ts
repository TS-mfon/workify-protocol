import { OneShotClient, validateWebhook, type Transaction } from "@1shotapi/client-sdk";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "./canonical";
import { WorkifyError } from "./errors";
import { getDatabase } from "./mongodb";

export const ONESHOT_CHAIN_ID = 84532;
export const RELAY_ACTIONS = [
  "importVerdict",
  "recordAttemptOutcome",
  "settle",
  "refundExpiredJob",
  "expireUnfundedAppeal",
] as const;

export type RelayAction = (typeof RELAY_ACTIONS)[number];
export type RelayParameters = Record<string, string | number | bigint | boolean | null | undefined | Record<string, unknown> | unknown[]>;

const jobIdSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/u, "jobId must be a bytes32 hex value");
const uuidSchema = z.string().uuid();
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/u);

const methodEnvironment: Record<RelayAction, string> = {
  importVerdict: "ONESHOT_IMPORT_VERDICT_METHOD_ID",
  recordAttemptOutcome: "ONESHOT_RECORD_OUTCOME_METHOD_ID",
  settle: "ONESHOT_SETTLE_METHOD_ID",
  refundExpiredJob: "ONESHOT_REFUND_EXPIRED_METHOD_ID",
  expireUnfundedAppeal: "ONESHOT_EXPIRE_APPEAL_METHOD_ID",
};

export interface OneShotAdapter {
  contractMethods: {
    execute(methodId: string, params: RelayParameters, options: { walletId: string; memo: string; value: string }): Promise<Transaction>;
  };
  transactions: { get(transactionId: string): Promise<Transaction> };
  wallets: { get(walletId: string, includeBalances?: boolean): Promise<{
    id: string;
    accountAddress: string;
    chainId: number;
    accountBalanceDetails?: { balance: string; decimals: number } | null;
  }> };
}

export interface OneShotRuntimeConfig {
  businessId: string;
  walletId: string;
  escrowAddress: `0x${string}`;
  methodIds: Record<RelayAction, string>;
}

export function getOneShotRuntimeConfig(): OneShotRuntimeConfig {
  const businessId = uuidSchema.parse(process.env.ONESHOT_BUSINESS_ID);
  const walletId = uuidSchema.parse(process.env.ONESHOT_WALLET_ID);
  const escrowAddress = addressSchema.parse(process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS) as `0x${string}`;
  const methodIds = Object.fromEntries(
    RELAY_ACTIONS.map((action) => [action, uuidSchema.parse(process.env[methodEnvironment[action]])]),
  ) as Record<RelayAction, string>;
  return { businessId, walletId, escrowAddress, methodIds };
}

export function createOneShotClient(): OneShotAdapter {
  const apiKey = process.env.ONESHOT_API_KEY;
  const apiSecret = process.env.ONESHOT_API_SECRET;
  if (!apiKey || !apiSecret) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "1Shot server credentials are not configured");
  return new OneShotClient({ apiKey, apiSecret }) as OneShotAdapter;
}

export function assertRelayJobId(jobId: string): `0x${string}` {
  return jobIdSchema.parse(jobId) as `0x${string}`;
}

export async function executeRelayAction(
  action: RelayAction,
  jobId: string,
  params: RelayParameters,
  client: OneShotAdapter = createOneShotClient(),
): Promise<Transaction> {
  if (!RELAY_ACTIONS.includes(action)) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "Unsupported 1Shot relay action");
  const normalizedJobId = assertRelayJobId(jobId);
  const config = getOneShotRuntimeConfig();
  const wallet = await client.wallets.get(config.walletId, true);
  if (wallet.chainId !== ONESHOT_CHAIN_ID) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "1Shot wallet is not on Base Sepolia");
  if (wallet.id !== config.walletId) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "1Shot returned an unexpected wallet");

  const transaction = await client.contractMethods.execute(config.methodIds[action], params, {
    walletId: config.walletId,
    value: "0",
    memo: `Workify ${action} ${normalizedJobId}`.slice(0, 256),
  });
  if (transaction.chainId !== ONESHOT_CHAIN_ID) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "1Shot transaction used the wrong chain");
  if (transaction.contractAddress.toLowerCase() !== config.escrowAddress.toLowerCase()) {
    throw new WorkifyError("RELAY_SUBMISSION_FAILED", "1Shot method does not target the configured escrow");
  }
  if (transaction.walletId !== config.walletId) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "1Shot transaction used an unexpected wallet");
  return transaction;
}

export async function getOneShotTransaction(transactionId: string, client: OneShotAdapter = createOneShotClient()) {
  return client.transactions.get(uuidSchema.parse(transactionId));
}

export type OneShotHealth = {
  configured: boolean;
  walletAddress?: string;
  chainId?: number;
  balanceWei?: string;
  status: "healthy" | "low" | "empty" | "unavailable";
  lastSuccessfulRelayAt?: string;
  lastWebhookAt?: string;
};

export async function getOneShotHealth(client: OneShotAdapter = createOneShotClient()): Promise<OneShotHealth> {
  try {
    const config = getOneShotRuntimeConfig();
    const wallet = await client.wallets.get(config.walletId, true);
    const balance = BigInt(wallet.accountBalanceDetails?.balance || "0");
    const lowBalance = BigInt(process.env.ONESHOT_LOW_BALANCE_WEI || "5000000000000000");
    const db = await getDatabase();
    const [successful, webhook] = await Promise.all([
      db.collection("relay_intents").findOne({ status: "CONFIRMED" }, { sort: { confirmedAt: -1 } }),
      db.collection("oneshot_webhook_events").findOne({}, { sort: { receivedAt: -1 } }),
    ]);
    return {
      configured: true,
      walletAddress: wallet.accountAddress,
      chainId: wallet.chainId,
      balanceWei: balance.toString(),
      status: balance === 0n ? "empty" : balance < lowBalance ? "low" : "healthy",
      ...(successful?.confirmedAt ? { lastSuccessfulRelayAt: new Date(successful.confirmedAt).toISOString() } : {}),
      ...(webhook?.receivedAt ? { lastWebhookAt: new Date(webhook.receivedAt).toISOString() } : {}),
    };
  } catch {
    return { configured: false, status: "unavailable" };
  }
}

function webhookTransactionId(payload: Record<string, unknown>): string | undefined {
  const nested = (payload.data && typeof payload.data === "object") ? payload.data as Record<string, unknown> : undefined;
  const transaction = (payload.transaction && typeof payload.transaction === "object") ? payload.transaction as Record<string, unknown> : undefined;
  return [payload.transactionId, nested?.transactionId, nested?.id, transaction?.id].find((value) => typeof value === "string") as string | undefined;
}

function webhookEventName(payload: Record<string, unknown>): string {
  return String(payload.eventName || payload.event || payload.type || "Unknown");
}

export async function processOneShotWebhook(
  payload: Record<string, unknown>,
  verify: typeof validateWebhook = validateWebhook,
): Promise<{ duplicate: boolean; eventName: string; transactionId?: string }> {
  const publicKey = process.env.ONESHOT_WEBHOOK_PUBLIC_KEY;
  if (!publicKey) throw new WorkifyError("AUTHORIZATION", "1Shot webhook public key is not configured");
  if (!(await verify(payload, publicKey))) throw new WorkifyError("AUTHORIZATION", "Invalid 1Shot webhook signature");

  const eventName = webhookEventName(payload);
  const transactionId = webhookTransactionId(payload);
  const timestamp = String(payload.timestamp || payload.createdAt || payload.created || "");
  const suppliedId = [payload.eventId, payload.webhookId, payload.id].find((value) => typeof value === "string");
  const eventId = String(suppliedId || createHash("sha256").update(canonicalJson({ eventName, transactionId, timestamp })).digest("hex"));
  const db = await getDatabase();
  try {
    await db.collection("oneshot_webhook_events").insertOne({ _id: eventId as never, eventName, transactionId, receivedAt: new Date() });
  } catch (error: unknown) {
    if ((error as { code?: number })?.code === 11000) return { duplicate: true, eventName, ...(transactionId ? { transactionId } : {}) };
    throw error;
  }

  if (transactionId) {
    const success = eventName === "TransactionExecutionSuccess";
    const failure = eventName === "TransactionExecutionFailure";
    if (success || failure) {
      const data = (payload.data && typeof payload.data === "object") ? payload.data as Record<string, unknown> : {};
      const transactionHash = String(data.transactionHash || payload.transactionHash || "");
      const failureReason = String(data.failureReason || payload.failureReason || "");
      await db.collection("relay_intents").updateOne(
        { oneShotTransactionId: transactionId },
        { $set: {
          status: success ? "CONFIRMED" : "FAILED",
          ...(transactionHash ? { transactionHash } : {}),
          ...(failureReason ? { failureReason } : {}),
          webhookEventId: eventId,
          ...(success ? { confirmedAt: new Date() } : {}),
          updatedAt: new Date(),
        } },
      );
    }
  }
  return { duplicate: false, eventName, ...(transactionId ? { transactionId } : {}) };
}
