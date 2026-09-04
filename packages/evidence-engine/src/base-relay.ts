import { createPublicClient, createWalletClient, encodeFunctionData, fallback, http, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { WorkifyError } from "./errors";
import { getDatabase } from "./mongodb";

export const BASE_CHAIN_ID = 84532;
export const BASE_RELAY_ACTIONS = [
  "requestVerification",
  "importVerdict",
  "recordAttemptOutcome",
  "confirmAppealFunded",
  "settle",
  "refundExpiredJob",
  "expireUnfundedAppeal",
] as const;

export type BaseRelayAction = (typeof BASE_RELAY_ACTIONS)[number];
export type BaseRelayParameters = {
  appeal?: boolean;
  verdict?: Record<string, unknown>;
  outcome?: Record<string, unknown>;
  genlayerPaymentTxHash?: Hex;
  nonce?: bigint;
  signature?: Hex;
};

const jobIdSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/u, "jobId must be a bytes32 hex value");
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/u);
const privateKeySchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/u);

const escrowAbi = [
  { type: "function", name: "requestVerification", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }, { name: "appeal", type: "bool" }], outputs: [] },
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "refundExpiredJob", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "expireUnfundedAppeal", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "confirmAppealFunded", stateMutability: "nonpayable", inputs: [
    { name: "jobId", type: "bytes32" }, { name: "genlayerPaymentTxHash", type: "bytes32" },
    { name: "nonce", type: "uint256" }, { name: "signature", type: "bytes" },
  ], outputs: [] },
  { type: "function", name: "importFinalVerdict", stateMutability: "nonpayable", inputs: [
    { name: "verdict", type: "tuple", components: [
      { name: "jobId", type: "bytes32" }, { name: "verifierId", type: "bytes32" },
      { name: "genlayerTxHash", type: "bytes32" }, { name: "attempt", type: "uint8" },
      { name: "specificationHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" },
      { name: "policyHash", type: "bytes32" }, { name: "decision", type: "uint8" },
      { name: "payoutBps", type: "uint16" }, { name: "resultHash", type: "bytes32" },
      { name: "nonce", type: "uint256" }, { name: "appeal", type: "bool" },
    ] }, { name: "signature", type: "bytes" },
  ], outputs: [] },
  { type: "function", name: "recordAttemptOutcome", stateMutability: "nonpayable", inputs: [
    { name: "outcome", type: "tuple", components: [
      { name: "jobId", type: "bytes32" }, { name: "verifierId", type: "bytes32" },
      { name: "genlayerTxHash", type: "bytes32" }, { name: "attempt", type: "uint8" },
      { name: "evidenceHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" },
      { name: "outcome", type: "uint8" }, { name: "nonce", type: "uint256" },
      { name: "appeal", type: "bool" },
    ] }, { name: "signature", type: "bytes" },
  ], outputs: [] },
] as const;

export interface BaseRelayAdapter {
  account: { address: `0x${string}` };
  getChainId(): Promise<number>;
  getBalance(address: `0x${string}`): Promise<bigint>;
  simulate(request: { account: `0x${string}`; address: `0x${string}`; data: Hex }): Promise<void>;
  send(request: { account: `0x${string}`; to: `0x${string}`; data: Hex; value: bigint }): Promise<Hex>;
  receipt(hash: Hex): Promise<{ status: "success" | "reverted"; blockNumber: bigint }>;
}

export function getBaseSignerConfig() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  const escrowAddress = addressSchema.parse(process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS) as `0x${string}`;
  const privateKey = privateKeySchema.parse(process.env.BASE_AUTOMATION_PRIVATE_KEY) as Hex;
  const account = privateKeyToAccount(privateKey);
  return { rpcUrl, escrowAddress, account };
}

export function createBaseRelayAdapter(): BaseRelayAdapter {
  const { rpcUrl, account } = getBaseSignerConfig();
  const fallbackUrls = (process.env.BASE_SEPOLIA_RPC_FALLBACK_URLS || "https://base-sepolia-rpc.publicnode.com,https://base-sepolia.blockpi.network/v1/rpc/public").split(",").map((url) => url.trim()).filter(Boolean);
  const transport = fallback([http(rpcUrl), ...fallbackUrls.map((url) => http(url))], { rank: false });
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) });
  return {
    account,
    getChainId: () => publicClient.getChainId(),
    getBalance: (address) => publicClient.getBalance({ address }),
    simulate: async ({ account: from, address, data }) => { await publicClient.call({ account: from, to: address, data }); },
    send: ({ to, data, value }) => walletClient.sendTransaction({ account, to, data, value }),
    receipt: (hash) => publicClient.getTransactionReceipt({ hash }),
  };
}

export function encodeBaseRelayAction(action: BaseRelayAction, jobId: string, params: BaseRelayParameters = {}): Hex {
  const normalizedJobId = jobIdSchema.parse(jobId) as Hex;
  if (action === "requestVerification") {
    return encodeFunctionData({ abi: escrowAbi, functionName: "requestVerification", args: [normalizedJobId, Boolean(params.appeal)] });
  }
  if (action === "importVerdict") {
    if (!params.verdict || !params.signature) throw new WorkifyError("ATTESTATION_INVALID", "Verdict and signature are required");
    if (String(params.verdict.jobId).toLowerCase() !== normalizedJobId.toLowerCase()) throw new WorkifyError("ATTESTATION_INVALID", "Verdict job ID mismatch");
    return encodeFunctionData({ abi: escrowAbi, functionName: "importFinalVerdict", args: [params.verdict as never, params.signature] });
  }
  if (action === "recordAttemptOutcome") {
    if (!params.outcome || !params.signature) throw new WorkifyError("ATTESTATION_INVALID", "Outcome and signature are required");
    if (String(params.outcome.jobId).toLowerCase() !== normalizedJobId.toLowerCase()) throw new WorkifyError("ATTESTATION_INVALID", "Outcome job ID mismatch");
    return encodeFunctionData({ abi: escrowAbi, functionName: "recordAttemptOutcome", args: [params.outcome as never, params.signature] });
  }
  if (action === "confirmAppealFunded") {
    if (!params.genlayerPaymentTxHash || params.nonce === undefined || !params.signature) {
      throw new WorkifyError("RELAY_SUBMISSION_FAILED", "Appeal funding attestation is incomplete");
    }
    return encodeFunctionData({
      abi: escrowAbi,
      functionName: "confirmAppealFunded",
      args: [normalizedJobId, params.genlayerPaymentTxHash, params.nonce, params.signature],
    });
  }
  return encodeFunctionData({ abi: escrowAbi, functionName: action, args: [normalizedJobId] });
}

export async function executeBaseRelayAction(
  action: BaseRelayAction,
  jobId: string,
  params: BaseRelayParameters = {},
  adapter: BaseRelayAdapter = createBaseRelayAdapter(),
): Promise<{ transactionHash: Hex; signerAddress: `0x${string}`; blockNumber: bigint }> {
  if (!BASE_RELAY_ACTIONS.includes(action)) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "Unsupported Base relay action");
  const { escrowAddress } = getBaseSignerConfig();
  if (await adapter.getChainId() !== BASE_CHAIN_ID) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "Base signer RPC is on the wrong chain");
  const data = encodeBaseRelayAction(action, jobId, params);
  await adapter.simulate({ account: adapter.account.address, address: escrowAddress, data });
  const transactionHash = await adapter.send({ account: adapter.account.address, to: escrowAddress, data, value: 0n });
  const receipt = await adapter.receipt(transactionHash);
  if (receipt.status !== "success") throw new WorkifyError("BASE_REVERT", `Base transaction ${transactionHash} reverted`);
  return { transactionHash, signerAddress: adapter.account.address, blockNumber: receipt.blockNumber };
}

export type BaseSignerHealth = {
  configured: boolean;
  signerAddress?: string;
  chainId?: number;
  balanceWei?: string;
  balanceEth?: string;
  status: "healthy" | "low" | "empty" | "unavailable";
  lastSuccessfulRelayAt?: string;
};

export async function getBaseSignerHealth(adapter?: BaseRelayAdapter): Promise<BaseSignerHealth> {
  try {
    const activeAdapter = adapter ?? createBaseRelayAdapter();
    const chainId = await activeAdapter.getChainId();
    if (chainId !== BASE_CHAIN_ID) return { configured: true, signerAddress: activeAdapter.account.address, chainId, status: "unavailable" };
    const balance = await activeAdapter.getBalance(activeAdapter.account.address);
    const lowBalance = BigInt(process.env.BASE_AUTOMATION_LOW_BALANCE_WEI || "5000000000000000");
    let lastSuccessfulRelayAt: string | undefined;
    try {
      const successful = await (await getDatabase()).collection("relay_intents").findOne({ status: "CONFIRMED" }, { sort: { confirmedAt: -1 } });
      if (successful?.confirmedAt) lastSuccessfulRelayAt = new Date(successful.confirmedAt).toISOString();
    } catch {
      lastSuccessfulRelayAt = undefined;
    }
    return {
      configured: true,
      signerAddress: activeAdapter.account.address,
      chainId,
      balanceWei: balance.toString(),
      balanceEth: `${Number(balance) / 1e18}`,
      status: balance === 0n ? "empty" : balance < lowBalance ? "low" : "healthy",
      ...(lastSuccessfulRelayAt ? { lastSuccessfulRelayAt } : {}),
    };
  } catch {
    return { configured: false, status: "unavailable" };
  }
}
