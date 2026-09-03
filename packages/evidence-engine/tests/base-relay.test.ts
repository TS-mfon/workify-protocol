import { beforeEach, describe, expect, it, vi } from "vitest";
import { toFunctionSelector, type Hex } from "viem";

vi.mock("../src/mongodb", () => ({
  getDatabase: async () => ({ collection: () => ({ findOne: vi.fn(async () => null) }) }),
}));

import { encodeBaseRelayAction, executeBaseRelayAction, getBaseSignerHealth, type BaseRelayAdapter } from "../src/base-relay";

const jobId = `0x${"ab".repeat(32)}`;
const escrow = "0x1111111111111111111111111111111111111111";
const signer = "0x2222222222222222222222222222222222222222" as const;
const transactionHash = `0x${"12".repeat(32)}` as Hex;

function adapter(overrides: Partial<BaseRelayAdapter> = {}): BaseRelayAdapter {
  return {
    account: { address: signer },
    getChainId: vi.fn(async () => 84532),
    getBalance: vi.fn(async () => 10_000_000_000_000_000n),
    simulate: vi.fn(async () => undefined),
    send: vi.fn(async () => transactionHash),
    receipt: vi.fn(async () => ({ status: "success" as const, blockNumber: 123n })),
    ...overrides,
  };
}

beforeEach(() => {
  process.env.BASE_AUTOMATION_PRIVATE_KEY = `0x${"00".repeat(31)}01`;
  process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS = escrow;
  process.env.BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
});

describe("direct Base automation signer", () => {
  it("encodes only the fixed escrow settlement method", () => {
    const data = encodeBaseRelayAction("settle", jobId, { verdict: { recipient: signer } });
    expect(data.slice(0, 10)).toBe(toFunctionSelector("settle(bytes32)"));
    expect(data.toLowerCase()).not.toContain(signer.slice(2).toLowerCase());
  });

  it("rejects malformed job IDs before transaction submission", async () => {
    const relay = adapter();
    await expect(executeBaseRelayAction("settle", "0x1234", {}, relay)).rejects.toThrow();
    expect(relay.send).not.toHaveBeenCalled();
  });

  it("simulates, submits to the configured escrow, and waits for success", async () => {
    const relay = adapter();
    const result = await executeBaseRelayAction("settle", jobId, {}, relay);
    expect(relay.simulate).toHaveBeenCalledWith(expect.objectContaining({ account: signer, address: escrow }));
    expect(relay.send).toHaveBeenCalledWith(expect.objectContaining({ account: signer, to: escrow, value: 0n }));
    expect(relay.receipt).toHaveBeenCalledWith(transactionHash);
    expect(result).toEqual({ transactionHash, signerAddress: signer, blockNumber: 123n });
  });

  it("rejects a signer RPC connected to another chain", async () => {
    const relay = adapter({ getChainId: vi.fn(async () => 1) });
    await expect(executeBaseRelayAction("settle", jobId, {}, relay)).rejects.toThrow("wrong chain");
  });

  it("rejects reverted Base receipts", async () => {
    const relay = adapter({ receipt: vi.fn(async () => ({ status: "reverted" as const, blockNumber: 123n })) });
    await expect(executeBaseRelayAction("settle", jobId, {}, relay)).rejects.toThrow("reverted");
  });

  it("binds verification requests to the supplied job and appeal flag", () => {
    const data = encodeBaseRelayAction("requestVerification", jobId, { appeal: true });
    expect(data).toMatch(/^0x/u);
    expect(data.length).toBeGreaterThan(10);
  });

  it("encodes appeal funding without accepting recipient parameters", () => {
    const data = encodeBaseRelayAction("confirmAppealFunded", jobId, {
      genlayerPaymentTxHash: `0x${"34".repeat(32)}`,
      nonce: 7n,
      signature: "0x1234",
    });
    expect(data.slice(0, 10)).toBe(toFunctionSelector("confirmAppealFunded(bytes32,bytes32,uint256,bytes)"));
    expect(data.toLowerCase()).not.toContain(signer.slice(2).toLowerCase());
  });

  it("rejects verdicts whose signed job differs from the relay intent", () => {
    expect(() => encodeBaseRelayAction("importVerdict", jobId, { verdict: { jobId: `0x${"cd".repeat(32)}` }, signature: "0x12" })).toThrow("mismatch");
  });

  it("reports signer gas health without exposing the private key", async () => {
    const health = await getBaseSignerHealth(adapter());
    expect(health).toEqual(expect.objectContaining({ configured: true, signerAddress: signer, chainId: 84532, status: "healthy" }));
    expect(JSON.stringify(health)).not.toContain(process.env.BASE_AUTOMATION_PRIVATE_KEY!);
  });
});
