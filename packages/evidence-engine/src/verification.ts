import { chains, createAccount, createClient } from "genlayer-js";
import type { Hex } from "viem";
import { getDatabase } from "./mongodb";
import { WorkifyError } from "./errors";
import { executeBaseRelayAction } from "./base-relay";

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
  const baseRequest = await executeBaseRelayAction("requestVerification", input.jobId, { appeal: input.appeal });
  const client = createClient({ chain: chains.testnetBradbury as never, endpoint, account: createAccount(key) });
  const treasury = (process.env.NEXT_PUBLIC_GEN_TREASURY_ADDRESS || process.env.NEXT_PUBLIC_GENLAYER_TREASURY_ADDRESS) as `0x${string}` | undefined;
  if (!treasury) throw new WorkifyError("GENLAYER_PREFLIGHT", "GenLayer treasury is not configured");
  const paymentKey = `${input.jobId}${input.appeal ? ":appeal" : `:verification:${input.attempt}`}`;
  const payment = await client.readContract({
    address: treasury,
    functionName: "get_payment",
    args: [paymentKey],
    jsonSafeReturn: true,
  });
  const paymentRecord = payment as unknown as { payer?: string; amount?: string | number | bigint };
  if (!paymentRecord.payer || /^0x0{40}$/iu.test(paymentRecord.payer)) {
    throw new WorkifyError("INSUFFICIENT_GEN", "The exact GenLayer fee is not finalized");
  }
  const feePayer = paymentRecord.payer as `0x${string}`;
  if (input.feePayer && input.feePayer.toLowerCase() !== feePayer.toLowerCase()) {
    throw new WorkifyError("ATTESTATION_INVALID", "Submitted fee payer does not match the finalized treasury payment");
  }
  const hash = await client.writeContract({
    address: input.verifierAddress,
    functionName: "verify",
    args: [
      input.jobId,
      input.specificationUrl,
      input.specificationHash.replace(/^0x/u, ""),
      input.evidenceUrl,
      input.evidenceHash.replace(/^0x/u, ""),
      input.attempt,
      input.appeal,
      input.appealContextUrl ?? "",
      feePayer,
    ] as never[],
    value: 0n,
  });
  const nonce = BigInt(`0x${crypto.getRandomValues(new Uint8Array(16)).reduce((value, byte) => value + byte.toString(16).padStart(2, "0"), "")}`).toString();
  const db = await getDatabase();
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
    { _id: `${input.jobId}:${input.appeal ? "appeal" : "initial"}:${input.attempt}` as never },
    { $setOnInsert: {
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
    } },
    { upsert: true },
  );
  return { transactionHash: hash, baseRequestTransactionHash: baseRequest.transactionHash };
}
