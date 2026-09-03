import { queueRelayIntent } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient, http, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { publicNetworkConfig } from "@/lib/network";

const inputSchema = z.object({
  jobId: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
  appellant: z.string().regex(/^0x[a-fA-F0-9]{40}$/u),
  genlayerPaymentTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
});

const jobAbi = [{ type: "function", name: "getJob", stateMutability: "view", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [{ type: "tuple", components: [
  { name: "client", type: "address" }, { name: "worker", type: "address" }, { name: "reward", type: "uint128" },
  { name: "createdAt", type: "uint64" }, { name: "deliveryDeadline", type: "uint64" }, { name: "retryDeadline", type: "uint64" },
  { name: "verdictAt", type: "uint64" }, { name: "appealDeadline", type: "uint64" }, { name: "appealFundingDeadline", type: "uint64" },
  { name: "deliveryVersion", type: "uint32" }, { name: "attempts", type: "uint8" }, { name: "appealAttempts", type: "uint8" },
  { name: "payoutBps", type: "uint16" }, { name: "status", type: "uint8" }, { name: "decision", type: "uint8" },
  { name: "specificationHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" },
  { name: "resultHash", type: "bytes32" }, { name: "verifierId", type: "bytes32" }, { name: "genlayerTxHash", type: "bytes32" },
  { name: "appealPaymentTxHash", type: "bytes32" }, { name: "appellant", type: "address" }, { name: "verdictAttempt", type: "uint8" },
  { name: "verdictAppeal", type: "bool" }, { name: "appealFunded", type: "bool" },
] }] }] as const;

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const network = publicNetworkConfig();
    const escrow = network.escrow;
    const base = createPublicClient({ chain: baseSepolia, transport: http(network.baseRpc) });
    const job = await base.readContract({ address: escrow, abi: jobAbi, functionName: "getJob", args: [input.jobId as Hex] });
    if (Number(job.status) !== 6) throw new Error("The job is not awaiting appeal funding");
    if (job.appellant.toLowerCase() !== input.appellant.toLowerCase()) throw new Error("Appellant does not match the onchain appeal intent");
    const nonce = BigInt(`0x${crypto.getRandomValues(new Uint8Array(16)).reduce((value, byte) => value + byte.toString(16).padStart(2, "0"), "")}`).toString();
    await queueRelayIntent({
      idempotencyKey: `${input.jobId}:confirm-appeal:${input.genlayerPaymentTxHash}`,
      action: "confirmAppealFunded",
      jobId: input.jobId,
      appellant: input.appellant,
      genlayerTxHash: input.genlayerPaymentTxHash,
      nonce,
    });
    return NextResponse.json({ queued: true, nonce });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not queue appeal confirmation" }, { status: 400 });
  }
}
