import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "@1shotapi/client-sdk";

const collections = new Map<string, any>();
vi.mock("../src/mongodb", () => ({
  getDatabase: async () => ({
    collection(name: string) {
      if (!collections.has(name)) collections.set(name, { insertOne: vi.fn(), updateOne: vi.fn(), findOne: vi.fn() });
      return collections.get(name);
    },
  }),
}));

import { executeRelayAction, processOneShotWebhook, type OneShotAdapter } from "../src/oneshot";

const ids = {
  business: "11111111-1111-4111-8111-111111111111",
  wallet: "22222222-2222-4222-8222-222222222222",
  importVerdict: "33333333-3333-4333-8333-333333333333",
  recordAttemptOutcome: "44444444-4444-4444-8444-444444444444",
  settle: "55555555-5555-4555-8555-555555555555",
  refundExpiredJob: "66666666-6666-4666-8666-666666666666",
  expireUnfundedAppeal: "77777777-7777-4777-8777-777777777777",
};
const escrow = "0x1111111111111111111111111111111111111111";
const jobId = `0x${"ab".repeat(32)}`;

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    contractMethodIds: [ids.settle], apiCredentialId: null, apiKey: null, userId: null,
    status: "Submitted", transactionHash: null, contractAddress: escrow, name: "Settle",
    functionName: "settle", chainId: 84532, memo: null, completed: null, walletId: ids.wallet,
    failureReason: null, from: "0x2222222222222222222222222222222222222222", to: escrow,
    gasPrice: null, gasLimit: null, maxFeePerGas: null, maxPriorityFeePerGas: null, gasUsed: null,
    logs: null, updated: Date.now(), created: Date.now(), deleted: false, ...overrides,
  };
}

function client(result = transaction()): OneShotAdapter {
  return {
    wallets: { get: vi.fn(async () => ({ id: ids.wallet, accountAddress: "0x2222222222222222222222222222222222222222", chainId: 84532, accountBalanceDetails: { balance: "1", decimals: 18 } })) },
    contractMethods: { execute: vi.fn(async () => result) },
    transactions: { get: vi.fn(async () => result) },
  };
}

beforeEach(() => {
  collections.clear();
  process.env.ONESHOT_BUSINESS_ID = ids.business;
  process.env.ONESHOT_WALLET_ID = ids.wallet;
  process.env.ONESHOT_IMPORT_VERDICT_METHOD_ID = ids.importVerdict;
  process.env.ONESHOT_RECORD_OUTCOME_METHOD_ID = ids.recordAttemptOutcome;
  process.env.ONESHOT_SETTLE_METHOD_ID = ids.settle;
  process.env.ONESHOT_REFUND_EXPIRED_METHOD_ID = ids.refundExpiredJob;
  process.env.ONESHOT_EXPIRE_APPEAL_METHOD_ID = ids.expireUnfundedAppeal;
  process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS = escrow;
  process.env.ONESHOT_WEBHOOK_PUBLIC_KEY = "public-key";
});

describe("1Shot server-wallet relay", () => {
  it("executes only the internally mapped method and wallet", async () => {
    const adapter = client();
    await executeRelayAction("settle", jobId, { jobId }, adapter);
    expect(adapter.contractMethods.execute).toHaveBeenCalledWith(ids.settle, { jobId }, expect.objectContaining({ walletId: ids.wallet, value: "0" }));
  });

  it("rejects malformed job IDs before relay execution", async () => {
    const adapter = client();
    await expect(executeRelayAction("settle", "0x1234", { jobId: "0x1234" }, adapter)).rejects.toThrow();
    expect(adapter.contractMethods.execute).not.toHaveBeenCalled();
  });

  it("rejects a method configured against another escrow", async () => {
    const adapter = client(transaction({ contractAddress: "0x9999999999999999999999999999999999999999" }));
    await expect(executeRelayAction("settle", jobId, { jobId, recipient: "0x9999999999999999999999999999999999999999" }, adapter)).rejects.toThrow("does not target");
  });

  it("records successful webhooks and updates the matching transaction", async () => {
    const result = await processOneShotWebhook({ eventId: "event-1", eventName: "TransactionExecutionSuccess", transactionId: ids.settle, transactionHash: `0x${"12".repeat(32)}`, signature: "sig" }, async () => true);
    expect(result.duplicate).toBe(false);
    expect(collections.get("relay_intents").updateOne).toHaveBeenCalledWith(
      { oneShotTransactionId: ids.settle },
      expect.objectContaining({ $set: expect.objectContaining({ status: "CONFIRMED" }) }),
    );
  });

  it("records failed webhooks without retrying recipient-changing calls", async () => {
    await processOneShotWebhook({ eventId: "event-2", eventName: "TransactionExecutionFailure", transactionId: ids.settle, failureReason: "reverted", signature: "sig" }, async () => true);
    expect(collections.get("relay_intents").updateOne).toHaveBeenCalledWith(
      { oneShotTransactionId: ids.settle },
      expect.objectContaining({ $set: expect.objectContaining({ status: "FAILED", failureReason: "reverted" }) }),
    );
  });

  it("returns success for duplicate webhook deliveries", async () => {
    collections.set("oneshot_webhook_events", { insertOne: vi.fn().mockRejectedValue({ code: 11000 }), updateOne: vi.fn(), findOne: vi.fn() });
    const result = await processOneShotWebhook({ eventId: "event-1", eventName: "TransactionExecutionSuccess", signature: "sig" }, async () => true);
    expect(result.duplicate).toBe(true);
  });

  it("rejects invalid webhook signatures", async () => {
    await expect(processOneShotWebhook({ eventName: "TransactionExecutionSuccess", signature: "bad" }, async () => false)).rejects.toThrow("Invalid 1Shot webhook signature");
  });
});
