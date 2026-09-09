import { getGenLayerNetworkConfig, registerDirectVerification } from "@workify/evidence-engine";
import { getDatabase } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
import { createBasePublicClient, publicNetworkConfig } from "@/lib/network";
import { z } from "zod";
import type { Hex } from "viem";

const inputSchema = z.object({
  jobId: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
  attempt: z.number().int().min(1).max(3),
  payer: z.string().regex(/^0x[a-fA-F0-9]{40}$/u),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
  appeal: z.boolean().default(false),
  appealContextUrl: z.string().url().optional(),
  network: z.enum(["bradbury", "studionet"]).optional(),
});

const prepareSchema = z.object({
  jobId: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
  attempt: z.coerce.number().int().min(1).max(3),
  network: z.enum(["bradbury", "studionet"]).default("bradbury"),
  appeal: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

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
  ] }],
}] as const;

function publicOrigin(request: Request) {
  const configured = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/u, "");
  if (process.env.VERCEL_ENV === "production") return "https://workify-protocol.vercel.app";
  return new URL(request.url).origin;
}

async function loadVerificationPayload(request: Request, input: { jobId: string; network: "bradbury" | "studionet"; appeal?: boolean; appealContextUrl?: string }) {
  const network = publicNetworkConfig();
  const base = createBasePublicClient(network.baseRpc);
  const job = await base.readContract({ address: network.escrow, abi: jobAbi, functionName: "getJob", args: [input.jobId as Hex] });
  const db = await getDatabase();
  const specificationHash = String(job.specificationHash).replace(/^0x/u, "").toLowerCase();
  const evidenceHash = String(job.evidenceHash).replace(/^0x/u, "").toLowerCase();
  const specification = await db.collection("specifications").findOne({ _id: specificationHash as never });
  const evidence = await db.collection("evidence_manifests").findOne({ _id: evidenceHash as never });
  const workType = String((specification?.document as { workType?: string } | undefined)?.workType || "");
  const policyVersion = String((specification?.document as { policyVersion?: string } | undefined)?.policyVersion || "");
  const genlayer = getGenLayerNetworkConfig(input.network);
  const useLegacyPolicy = /(?:^|-)v(?:1|2|3|4|5|6|7|8|9|10)(?:\.|-|$)/iu.test(policyVersion);
  const verifierAddress = (useLegacyPolicy ? genlayer.legacyVerifiers : genlayer.verifiers)[workType];
  const applicationFee = useLegacyPolicy && input.network === "bradbury"
    ? (input.appeal ? 1_000_000_000_000_000_000n : 100_000_000_000_000_000n)
    : (input.appeal ? genlayer.appealFee : genlayer.verificationFee);
  if (!specification || !evidence || !verifierAddress || !policyVersion) throw new Error("The locked specification or evidence manifest is unavailable for verification.");
  const origin = publicOrigin(request);
  return { verifierAddress, specificationHash: `0x${specificationHash}`, evidenceHash: `0x${evidenceHash}`, specificationUrl: `${origin}/api/specifications/${specificationHash}`, evidenceUrl: `${origin}/api/evidence/${evidenceHash}`, policyVersion, verifierVersion: useLegacyPolicy ? 10 : genlayer.version, applicationFeeWei: applicationFee.toString(), gasless: genlayer.gasless, ...(input.appealContextUrl ? { appealContextUrl: input.appealContextUrl } : {}) };
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input = prepareSchema.parse({ jobId: params.get("jobId"), attempt: params.get("attempt"), network: params.get("network") || "bradbury" });
    const payload = await loadVerificationPayload(request, input);
    return NextResponse.json({ ...input, ...payload }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Verification payload is unavailable" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const selectedNetwork = input.network || (request.headers.get("cookie") || "").match(/(?:^|;\s*)workify-genlayer-network=(studionet|bradbury)/u)?.[1] || "bradbury";
    const payload = await loadVerificationPayload(request, { jobId: input.jobId, network: selectedNetwork as "bradbury" | "studionet", ...(input.appeal ? { appeal: true } : {}), ...(input.appealContextUrl ? { appealContextUrl: input.appealContextUrl } : {}) });
    const result = await registerDirectVerification({
      jobId: input.jobId as Hex,
      ...payload,
      attempt: input.attempt,
      appeal: input.appeal,
      ...(input.appealContextUrl ? { appealContextUrl: input.appealContextUrl } : {}),
      payer: input.payer as `0x${string}`,
      transactionHash: input.transactionHash as Hex,
      network: selectedNetwork as "bradbury" | "studionet",
    });
    return NextResponse.json({ queued: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification could not be queued";
    const duplicate = /already|duplicate|being reviewed|not ready/iu.test(message);
    return NextResponse.json({ error: message, retryable: !duplicate }, { status: duplicate ? 409 : 400 });
  }
}
