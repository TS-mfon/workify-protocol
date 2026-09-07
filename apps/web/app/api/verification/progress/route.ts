import { getDatabase, publicError, runAutomationBatch } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  jobId: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
  attempt: z.coerce.number().int().min(1).max(3),
  network: z.enum(["bradbury", "studionet"]).default("bradbury"),
});

export async function GET(request: Request) {
  try {
    const input = schema.parse({
      jobId: new URL(request.url).searchParams.get("jobId"),
      attempt: new URL(request.url).searchParams.get("attempt"),
      network: new URL(request.url).searchParams.get("network") || "bradbury",
    });
    await runAutomationBatch(1);
    const db = await getDatabase();
    const intent = await db.collection("relay_intents").findOne({ _id: `${input.jobId}:${input.network}:initial:${input.attempt}` as never })
      || await db.collection("relay_intents").findOne({ _id: `${input.jobId}:initial:${input.attempt}` as never });
    const payment = await db.collection("genlayer_payments").findOne({ _id: `${input.jobId.toLowerCase()}:${input.network}:verification:${input.attempt}` as never })
      || await db.collection("genlayer_payments").findOne({ _id: `${input.jobId.toLowerCase()}:verification:${input.attempt}` as never });
    if (!intent) return NextResponse.json({ status: "NOT_STARTED", jobId: input.jobId, attempt: input.attempt });
    return NextResponse.json({
      status: String(intent.status || "PENDING"),
      jobId: input.jobId,
      attempt: input.attempt,
      network: input.network,
      feeTransactionHash: payment?.transactionHash || null,
      verifierTransactionHash: intent.genlayerTxHash || null,
      baseRequestTransactionHash: intent.baseRequestTransactionHash || null,
      verdictImportTransactionHash: intent.transactionHash || null,
      failureReason: intent.failureReason || intent.baseRequestFailure || null,
      lifecycle: intent.lifecycle || (intent.status === "PENDING_PAYMENT" ? "PAYMENT_PENDING" : intent.genlayerTxHash ? "VERIFIER_SUBMITTED" : "QUEUED"),
      retryable: Boolean(intent.retryable),
      infrastructureFailures: Number(intent.infrastructureFailures || 0),
      nextRetryAt: intent.nextRetryAt || null,
      rpcError: intent.retryable ? intent.failureReason || null : null,
      canRetryQueue: ["PENDING_PAYMENT", "FAILED"].includes(String(intent.status)),
      canRefresh: true,
      lastCheckedAt: intent.lastCheckedAt || null,
      updatedAt: intent.updatedAt || intent.createdAt || null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const result = publicError(error, "Verification progress is temporarily unavailable");
    return NextResponse.json(result, { status: result.status });
  }
}
