import { randomBytes } from "node:crypto";
import { getGenLayerNetworkConfig, createServerGenLayerClient, type GenLayerNetwork } from "./genlayer-network";
import { createPublicClient, decodeFunctionData, fallback, http, parseEther, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { getDatabase } from "./mongodb";
import { WorkifyError } from "./errors";
import { executeBaseRelayAction } from "./base-relay";

const jobAbi = [{
  type: "function", name: "getJob", stateMutability: "view",
  inputs: [{ name: "jobId", type: "bytes32" }],
  outputs: [{ name: "", type: "tuple", components: [
    { name: "client", type: "address" }, { name: "worker", type: "address" }, { name: "reward", type: "uint128" },
    { name: "createdAt", type: "uint64" }, { name: "deliveryDeadline", type: "uint64" }, { name: "retryDeadline", type: "uint64" },
    { name: "verdictAt", type: "uint64" }, { name: "appealDeadline", type: "uint64" }, { name: "appealFundingDeadline", type: "uint64" },
    { name: "deliveryVersion", type: "uint32" }, { name: "attempts", type: "uint8" }, { name: "appealAttempts", type: "uint8" },
    { name: "payoutBps", type: "uint16" }, { name: "status", type: "uint8" }, { name: "decision", type: "uint8" },
    { name: "specificationHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" },
    { name: "resultHash", type: "bytes32" }, { name: "verifierId", type: "bytes32" }, { name: "genlayerTxHash", type: "bytes32" },
    { name: "appealPaymentTxHash", type: "bytes32" }, { name: "appellant", type: "address" }, { name: "verdictAttempt", type: "uint8" },
    { name: "verdictAppeal", type: "bool" }, { name: "appealFunded", type: "bool" },
  ] },],
}] as const;

const verifierAbi = [{ type: "function", name: "verify", stateMutability: "payable", inputs: [
  { name: "job_id", type: "string" }, { name: "specification_url", type: "string" }, { name: "specification_hash", type: "string" },
  { name: "evidence_url", type: "string" }, { name: "evidence_hash", type: "string" }, { name: "attempt", type: "uint32" },
  { name: "appeal", type: "bool" }, { name: "appeal_context_url", type: "string" },
], outputs: [{ name: "", type: "string" }] }] as const;

function equalAddress(left: unknown, right: string) {
  return typeof left === "string" && left.toLowerCase() === right.toLowerCase();
}

export async function validateDirectTransaction(input: {
  transactionHash: Hex; payer: `0x${string}`; verifierAddress: `0x${string}`; jobId: Hex; attempt: number; appeal: boolean;
  specificationHash: string; evidenceHash: string; network: GenLayerNetwork;
}): Promise<{ calldataAvailable: boolean }> {
  const key = process.env.GENLAYER_OPERATOR_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new WorkifyError("GENLAYER_PREFLIGHT", "GenLayer transaction inspection is not configured", true);
  const client = createServerGenLayerClient(input.network, key);
  const transaction = await client.getTransaction({ hash: input.transactionHash as never }) as unknown as Record<string, unknown>;
  const sender = transaction.from_address || transaction.sender;
  const recipient = transaction.to_address || transaction.recipient;
  if (sender && !equalAddress(sender, input.payer)) throw new WorkifyError("ATTESTATION_INVALID", "The GenLayer transaction sender does not match the connected wallet");
  if (recipient && !equalAddress(recipient, input.verifierAddress)) throw new WorkifyError("ATTESTATION_INVALID", "The GenLayer transaction targeted a different verifier");
  const networkConfig = getGenLayerNetworkConfig(input.network);
  const isLegacyVerifier = Object.values(networkConfig.legacyVerifiers).some((address) => equalAddress(address, input.verifierAddress));
  const configuredFee = isLegacyVerifier
    ? (input.network === "bradbury" ? (input.appeal ? parseEther("1") : parseEther("0.1")) : 0n)
    : (input.appeal ? networkConfig.appealFee : networkConfig.verificationFee);
  if (transaction.value !== undefined && BigInt(String(transaction.value)) !== configuredFee) throw new WorkifyError("INSUFFICIENT_GEN", `The verifier transaction must attach exactly ${configuredFee === 0n ? "0" : input.appeal ? "1" : "0.1"} GEN`);
  const rawData = [transaction.txData, transaction.data, transaction.input, transaction.calldata]
    .find((value): value is string => typeof value === "string" && value.startsWith("0x")) || "";
  if (!rawData.startsWith("0x")) {
    const status = String(transaction.statusName || transaction.status_name || transaction.status || "").toUpperCase();
    if (["CANCELED", "CANCELLED"].includes(status)) throw new WorkifyError("GENLAYER_EXECUTION_ERROR", "The GenLayer review transaction was canceled");
    return { calldataAvailable: false };
  }
  if (rawData.startsWith("0x")) {
    try {
      const decoded = decodeFunctionData({ abi: verifierAbi, data: rawData as Hex });
      const args = decoded.args as readonly [string, string, string, string, string, number | bigint, boolean, string];
      if (args[0].toLowerCase() !== input.jobId.toLowerCase() || Number(args[5]) !== input.attempt || args[6] !== input.appeal || args[2].toLowerCase() !== input.specificationHash.replace(/^0x/u, "").toLowerCase() || args[4].toLowerCase() !== input.evidenceHash.replace(/^0x/u, "").toLowerCase()) {
        throw new WorkifyError("ATTESTATION_INVALID", "The GenLayer transaction calldata does not match the locked review payload");
      }
    } catch (error) {
      if (error instanceof WorkifyError) throw error;
      throw new WorkifyError("ATTESTATION_INVALID", "The GenLayer transaction calldata could not be verified");
    }
  }
  const status = String(transaction.statusName || transaction.status_name || transaction.status || "").toUpperCase();
  if (["CANCELED", "CANCELLED"].includes(status)) throw new WorkifyError("GENLAYER_EXECUTION_ERROR", "The GenLayer review transaction was canceled");
  return { calldataAvailable: true };
}

export async function registerDirectVerification(input: {
  jobId: Hex;
  verifierAddress: `0x${string}`;
  specificationUrl: string;
  specificationHash: string;
  evidenceUrl: string;
  evidenceHash: string;
  attempt: number;
  appeal: boolean;
  policyVersion: string;
  appealContextUrl?: string;
  transactionHash: Hex;
  payer: `0x${string}`;
  network?: GenLayerNetwork;
}) {
  const selectedNetwork = input.network || "bradbury";
  const genlayer = getGenLayerNetworkConfig(selectedNetwork);
  if (!genlayer.endpoint) throw new WorkifyError("GENLAYER_PREFLIGHT", `${selectedNetwork} GenLayer is not configured`);
  if (input.attempt < 1 || input.attempt > 3) throw new WorkifyError("USER_INPUT", "Attempt must be 1-3");
  if (!/^0x[a-fA-F0-9]{64}$/u.test(input.transactionHash)) throw new WorkifyError("USER_INPUT", "Invalid GenLayer transaction hash");
  if (!/^0x[a-fA-F0-9]{40}$/u.test(input.payer)) throw new WorkifyError("USER_INPUT", "Invalid verification payer");
  const escrow = process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS as `0x${string}` | undefined;
  if (!escrow) throw new WorkifyError("GENLAYER_PREFLIGHT", "Base escrow is not configured");
  const current = await baseJobClient().readContract({ address: escrow, abi: jobAbi, functionName: "getJob", args: [input.jobId] });
  const status = Number(current.status);
  const expectedStatus = input.appeal ? 6 : (status === 2 || status === 4 ? status : 0);
  if (!expectedStatus) throw new WorkifyError("DUPLICATE_SUBMISSION", status === 3 ? "This job is already being reviewed by GenLayer" : "This job is not ready for verification");
  if (!input.appeal && input.attempt !== Number(current.attempts) + 1) throw new WorkifyError("DUPLICATE_SUBMISSION", "This verification attempt is not the next contract attempt");
  if (input.appeal && String(current.appellant).toLowerCase() !== input.payer.toLowerCase()) throw new WorkifyError("DUPLICATE_SUBMISSION", "Appeal payer must be the wallet that opened the Base appeal");
  const transactionValidation = await validateDirectTransaction({ ...input, network: selectedNetwork });
  const db = await getDatabase();
  const intentId = `${input.jobId}:${selectedNetwork}:${input.appeal ? "appeal" : "initial"}:${input.attempt}`;
  const existing = await db.collection("relay_intents").findOne({ _id: intentId as never });
  if (existing?.genlayerTxHash && String(existing.genlayerTxHash).toLowerCase() !== input.transactionHash.toLowerCase()) {
    throw new WorkifyError("DUPLICATE_SUBMISSION", "This verification attempt already has a different GenLayer transaction");
  }
  if (existing?.genlayerTxHash) return { transactionHash: String(existing.genlayerTxHash), resumed: true };
  const nonce = BigInt(`0x${randomBytes(16).toString("hex")}`).toString();
  await db.collection("relay_intents").updateOne(
    { _id: intentId as never },
    { $setOnInsert: {
      _id: intentId as never,
      action: "importVerdict",
      submissionMode: "direct_user_transaction",
      jobId: input.jobId,
      attempt: input.attempt,
      appeal: input.appeal,
      verifierAddress: input.verifierAddress,
      specificationUrl: input.specificationUrl,
      specificationHash: input.specificationHash,
      evidenceUrl: input.evidenceUrl,
      evidenceHash: input.evidenceHash,
      ...(input.appealContextUrl ? { appealContextUrl: input.appealContextUrl } : {}),
      policyVersion: input.policyVersion,
      feePayer: input.payer,
      genlayerNetwork: selectedNetwork,
      genlayerTxHash: input.transactionHash,
      nonce,
      status: "PENDING",
      lifecycle: "VERIFIER_SUBMITTED",
      attempts: 0,
      infrastructureFailures: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } },
    { upsert: true },
  );
  await db.collection("verification_attempts").updateOne(
    { jobId: input.jobId, attempt: input.attempt, appeal: input.appeal },
    { $set: { jobId: input.jobId, attempt: input.attempt, appeal: input.appeal, verifierAddress: input.verifierAddress, genlayerTxHash: input.transactionHash, payer: input.payer, submissionMode: "direct_user_transaction", status: "SUBMITTED", createdAt: new Date(), updatedAt: new Date() } },
    { upsert: true },
  );
  return { transactionHash: input.transactionHash, calldataPending: !transactionValidation.calldataAvailable };
}

function baseJobClient() {
  const primary = process.env.BASE_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const fallbacks = (process.env.BASE_SEPOLIA_RPC_FALLBACK_URLS || "https://base-sepolia-rpc.publicnode.com,https://base-sepolia.blockpi.network/v1/rpc/public").split(",").map((url) => url.trim()).filter(Boolean);
  return createPublicClient({ chain: baseSepolia, transport: fallback([primary, ...fallbacks].filter((url, index, all) => all.indexOf(url) === index).map((url) => http(url)), { rank: false }) });
}

export async function submitVerification(input: {
  jobId: Hex;
  verifierAddress: `0x${string}`;
  specificationUrl: string;
  specificationHash: string;
  evidenceUrl: string;
  evidenceHash: string;
  attempt: number;
  appeal: boolean;
  appealContextUrl?: string;
  policyVersion: string;
  feePayer?: `0x${string}`;
  network?: GenLayerNetwork;
}) {
  const key = process.env.GENLAYER_OPERATOR_PRIVATE_KEY as Hex | undefined;
  const selectedNetwork = input.network || "bradbury";
  const genlayer = getGenLayerNetworkConfig(selectedNetwork);
  if (!key || !genlayer.endpoint) throw new WorkifyError("GENLAYER_PREFLIGHT", `${selectedNetwork} GenLayer operator is not configured`);
  if (input.attempt < 1 || input.attempt > 3) throw new WorkifyError("USER_INPUT", "Attempt must be 1-3");
  const escrow = process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS as `0x${string}` | undefined;
  if (!escrow) throw new WorkifyError("GENLAYER_PREFLIGHT", "Base escrow is not configured");
  const current = await baseJobClient().readContract({ address: escrow, abi: jobAbi, functionName: "getJob", args: [input.jobId] });
  const status = Number(current.status);
  const currentAttempts = Number(current.attempts);
  const expectedStatus = input.appeal ? 6 : (status === 2 || status === 4 ? status : 0);
  if (!expectedStatus) throw new WorkifyError("DUPLICATE_SUBMISSION", status === 3 ? "This job is already being reviewed by GenLayer" : "This job is not ready for verification");
  if (!input.appeal && input.attempt !== currentAttempts + 1) throw new WorkifyError("DUPLICATE_SUBMISSION", `Verification attempt ${input.attempt} is not the next contract attempt`);
  const db = await getDatabase();
  const intentId = `${input.jobId}:${selectedNetwork}:${input.appeal ? "appeal" : "initial"}:${input.attempt}`;
  const existing = await db.collection("relay_intents").findOne({ _id: intentId as never });
  if (existing?.genlayerTxHash) return { transactionHash: String(existing.genlayerTxHash), resumed: true };
  if (existing && ["STARTING", "PENDING", "SUBMITTED", "CONFIRMED"].includes(String(existing.status))) {
    if (String(existing.status) !== "PENDING_PAYMENT") throw new WorkifyError("DUPLICATE_SUBMISSION", "This verification attempt has already been submitted or is still being processed");
  }
  try {
    await db.collection("relay_intents").updateOne({ _id: intentId as never }, { $setOnInsert: { _id: intentId as never, action: "importVerdict", jobId: input.jobId, attempt: input.attempt, appeal: input.appeal, verifierAddress: input.verifierAddress, specificationUrl: input.specificationUrl, specificationHash: input.specificationHash, evidenceUrl: input.evidenceUrl, evidenceHash: input.evidenceHash, policyVersion: input.policyVersion, feePayer: input.feePayer, genlayerNetwork: selectedNetwork, status: "STARTING", lifecycle: "PAYMENT_ACCEPTED", infrastructureFailures: 0, createdAt: new Date() } }, { upsert: true });
  } catch (error: unknown) {
    if ((error as { code?: number })?.code === 11000) throw new WorkifyError("DUPLICATE_SUBMISSION", "This verification attempt is already being processed");
    throw error;
  }
  const failReservation = async (error: unknown) => {
    await db.collection("relay_intents").updateOne(
      { _id: intentId as never, status: "STARTING" },
      { $set: { status: "FAILED", failureReason: error instanceof Error ? error.message : "Verification submission failed", updatedAt: new Date() } },
    );
  };
  const client = createServerGenLayerClient(selectedNetwork, key);
  const treasury = genlayer.treasury;
  if (!treasury) {
    const error = new WorkifyError("GENLAYER_PREFLIGHT", `${selectedNetwork} GenLayer treasury is not configured`);
    await failReservation(error);
    throw error;
  }
  const paymentKey = `${input.jobId}${input.appeal ? ":appeal" : `:verification:${input.attempt}`}`;
  let payment: unknown;
  try {
    payment = await client.readContract({ address: treasury, functionName: "get_payment", args: [paymentKey], jsonSafeReturn: true });
  } catch (error) {
    await db.collection("relay_intents").updateOne({ _id: intentId as never }, { $set: { status: "PENDING_PAYMENT", lifecycle: "PAYMENT_PENDING", failureReason: "GenLayer payment visibility is temporarily unavailable; the operator will retry automatically.", retryable: true, nextRetryAt: new Date(Date.now() + 15_000), updatedAt: new Date() } });
    return { transactionHash: null, pending: true };
  }
  let paymentRecord: { payer?: string; amount?: string | number | bigint; funded?: boolean };
  try {
    paymentRecord = typeof payment === "string"
      ? JSON.parse(payment) as { payer?: string; amount?: string | number | bigint; funded?: boolean }
      : payment as { payer?: string; amount?: string | number | bigint; funded?: boolean };
  } catch (error) {
    const parseError = new WorkifyError("GENLAYER_EXECUTION_ERROR", "The GenLayer treasury returned an invalid payment record");
    await failReservation(error);
    throw parseError;
  }
  if (!paymentRecord.payer || /^0x0{40}$/iu.test(paymentRecord.payer)) {
    await db.collection("relay_intents").updateOne({ _id: intentId as never }, { $set: { status: "PENDING_PAYMENT", lifecycle: "PAYMENT_PENDING", failureReason: "The GenLayer payment is not visible yet; the operator will retry automatically.", retryable: true, nextRetryAt: new Date(Date.now() + 15_000), updatedAt: new Date() } });
    return { transactionHash: null, pending: true };
  }
  const expectedFee = input.appeal ? genlayer.appealFee : genlayer.verificationFee;
  const funded = paymentRecord.funded ?? Boolean(paymentRecord.payer && !/^0x0{40}$/iu.test(paymentRecord.payer));
  if (!funded) {
    await db.collection("relay_intents").updateOne({ _id: intentId as never }, { $set: { status: "PENDING_PAYMENT", lifecycle: "PAYMENT_PENDING", failureReason: "The GenLayer payment record is not finalized yet; Workify will retry automatically.", retryable: true, updatedAt: new Date() } });
    return { transactionHash: null, pending: true };
  }
  if (BigInt(String(paymentRecord.amount ?? 0)) !== expectedFee) {
    const error = new WorkifyError("INSUFFICIENT_GEN", `The treasury payment must equal exactly ${Number(expectedFee) / 1e18} GEN`);
    await failReservation(error);
    throw error;
  }
  const feePayer = paymentRecord.payer as `0x${string}`;
  if (input.feePayer && input.feePayer.toLowerCase() !== feePayer.toLowerCase()) {
    const error = new WorkifyError("ATTESTATION_INVALID", "Submitted fee payer does not match the finalized treasury payment");
    await failReservation(error);
    throw error;
  }
  let hash: Hex;
  try {
    hash = await client.writeContract({ address: input.verifierAddress, functionName: "verify", args: [input.jobId, input.specificationUrl, input.specificationHash.replace(/^0x/u, ""), input.evidenceUrl, input.evidenceHash.replace(/^0x/u, ""), input.attempt, input.appeal, input.appealContextUrl ?? "", feePayer] as never[], value: 0n });
  } catch (error) {
    await failReservation(error);
    throw error;
  }
  const nonce = BigInt(`0x${randomBytes(16).toString("hex")}`).toString();
  await db.collection("relay_intents").updateOne(
    { _id: intentId as never },
    { $set: {
      action: "importVerdict",
      jobId: input.jobId,
      verifierAddress: input.verifierAddress,
      genlayerTxHash: hash,
      attempt: input.attempt,
      appeal: input.appeal,
      evidenceHash: input.evidenceHash,
      policyVersion: input.policyVersion,
      feePayer,
      genlayerNetwork: selectedNetwork,
      nonce,
      status: "PENDING",
      lifecycle: "VERIFIER_SUBMITTED",
      attempts: 0,
      infrastructureFailures: 0,
      nextRetryAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } },
  );
  try {
    await db.collection("verification_attempts").updateOne(
      { jobId: input.jobId, attempt: input.attempt, appeal: input.appeal },
      { $set: { jobId: input.jobId, attempt: input.attempt, appeal: input.appeal, verifierAddress: input.verifierAddress, genlayerTxHash: hash, status: "SUBMITTED", createdAt: new Date(), updatedAt: new Date() } },
      { upsert: true },
    );
  } catch {
    // The intent already contains the transaction hash and is sufficient for recovery.
  }
  return { transactionHash: hash };
}
