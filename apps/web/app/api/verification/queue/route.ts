import { submitVerification } from "@workify/evidence-engine";
import { getDatabase } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
import { createBasePublicClient, publicNetworkConfig } from "@/lib/network";
import { z } from "zod";
import type { Hex } from "viem";

const inputSchema = z.object({
  jobId: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
  attempt: z.number().int().min(1).max(3),
  feePayer: z.string().regex(/^0x[a-fA-F0-9]{40}$/u),
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

const workTypeVerifier: Record<string, `0x${string}`> = {
  GITHUB_SOFTWARE: "0xe5E347406756c9FFf887E95F398c0995967CeA4D",
  WEB_APPLICATION: "0x9C3267313635606bAf70Eb9edCc115e2958026Dd",
  RESEARCH_DATA: "0x4A8eB3d7e458B1BA6faC962eAD93aD5cD2c30FCf",
  CONTENT_DOCUMENT: "0x1D5Eb59b9aC361A9547e03A3b00F39d0cD8AF25B",
  DESIGN_CREATIVE: "0x5D2A4cDEcD52641D4692E23d29157e1b9Cb222B6",
};

function publicOrigin(request: Request) {
  const configured = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/u, "");
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
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
    const verifierAddress = workTypeVerifier[workType];
    if (!specification || !evidence || !verifierAddress || !policyVersion) {
      return NextResponse.json({ error: "The locked specification or evidence manifest is unavailable for verification." }, { status: 409 });
    }
    const origin = publicOrigin(request);
    const result = await submitVerification({
      jobId: input.jobId as Hex,
      verifierAddress,
      specificationUrl: `${origin}/api/specifications/${specificationHash}`,
      specificationHash,
      evidenceUrl: `${origin}/api/evidence/${evidenceHash}`,
      evidenceHash,
      attempt: input.attempt,
      appeal: false,
      policyVersion,
      feePayer: input.feePayer as `0x${string}`,
    });
    return NextResponse.json({ queued: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification could not be queued";
    const duplicate = /already|duplicate|being reviewed|not ready/iu.test(message);
    return NextResponse.json({ error: message, retryable: !duplicate }, { status: duplicate ? 409 : 400 });
  }
}
