import { chains, createAccount, createClient } from "genlayer-js";
import { createPublicClient, fallback, http, type Hex } from "viem";
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
}) {
  const key = process.env.GENLAYER_OPERATOR_PRIVATE_KEY as Hex | undefined;
  const endpoint = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL;
  if (!key || !endpoint) throw new WorkifyError("GENLAYER_PREFLIGHT", "GenLayer operator is not configured");
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
  const intentId = `${input.jobId}:${input.appeal ? "appeal" : "initial"}:${input.attempt}`;
  const existing = await db.collection("relay_intents").findOne({ _id: intentId as never });
  if (existing && ["STARTING", "PENDING", "SUBMITTED", "CONFIRMED"].includes(String(existing.status))) {
    throw new WorkifyError("DUPLICATE_SUBMISSION", "This verification attempt has already been submitted or is still being processed");
  }
  try {
    await db.collection("relay_intents").insertOne({ _id: intentId as never, action: "importVerdict", jobId: input.jobId, attempt: input.attempt, appeal: input.appeal, status: "STARTING", createdAt: new Date() });
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
  let baseRequest: { transactionHash: Hex };
  try {
    baseRequest = await executeBaseRelayAction("requestVerification", input.jobId, { appeal: input.appeal });
  } catch (error) {
    await db.collection("relay_intents").updateOne({ _id: intentId as never }, { $set: { status: "FAILED", failureReason: error instanceof Error ? error.message : "Base verification request failed", updatedAt: new Date() } });
    throw error;
  }
  const client = createClient({ chain: chains.testnetBradbury as never, endpoint, account: createAccount(key) });
  const treasury = (process.env.NEXT_PUBLIC_GEN_TREASURY_ADDRESS || process.env.NEXT_PUBLIC_GENLAYER_TREASURY_ADDRESS) as `0x${string}` | undefined;
  if (!treasury) {
    const error = new WorkifyError("GENLAYER_PREFLIGHT", "GenLayer treasury is not configured");
    await failReservation(error);
    throw error;
  }
  const paymentKey = `${input.jobId}${input.appeal ? ":appeal" : `:verification:${input.attempt}`}`;
  let payment: unknown;
  try {
    payment = await client.readContract({ address: treasury, functionName: "get_payment", args: [paymentKey], jsonSafeReturn: true });
  } catch (error) {
    await failReservation(error);
    throw error;
  }
  const paymentRecord = payment as unknown as { payer?: string; amount?: string | number | bigint };
  if (!paymentRecord.payer || /^0x0{40}$/iu.test(paymentRecord.payer)) {
    const error = new WorkifyError("INSUFFICIENT_GEN", "The exact GenLayer fee is not finalized");
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
  const nonce = BigInt(`0x${crypto.getRandomValues(new Uint8Array(16)).reduce((value, byte) => value + byte.toString(16).padStart(2, "0"), "")}`).toString();
  await db.collection("verification_attempts").insertOne({
    jobId: input.jobId,
    attempt: input.attempt,
    appeal: input.appeal,
    verifierAddress: input.verifierAddress,
    genlayerTxHash: hash,
    status: "SUBMITTED",
    baseRequestTransactionHash: baseRequest.transactionHash,
    createdAt: new Date(),
  });
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
      nonce,
      status: "PENDING",
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } },
  );
  return { transactionHash: hash, baseRequestTransactionHash: baseRequest.transactionHash };
}
