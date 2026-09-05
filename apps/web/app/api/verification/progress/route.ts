import { getDatabase, publicError, runAutomationBatch } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  jobId: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
  attempt: z.coerce.number().int().min(1).max(3),
});

export async function GET(request: Request) {
  try {
    const input = schema.parse({
      jobId: new URL(request.url).searchParams.get("jobId"),
      attempt: new URL(request.url).searchParams.get("attempt"),
    });
    await runAutomationBatch(1);
    const intent = await (await getDatabase()).collection("relay_intents").findOne({
      _id: `${input.jobId}:initial:${input.attempt}` as never,
    });
    const payment = await (await getDatabase()).collection("genlayer_payments").findOne({
      _id: `${input.jobId.toLowerCase()}:verification:${input.attempt}` as never,
    });
    if (!intent) return NextResponse.json({ status: "NOT_STARTED", jobId: input.jobId, attempt: input.attempt });
    return NextResponse.json({
      status: String(intent.status || "PENDING"),
      jobId: input.jobId,
      attempt: input.attempt,
      feeTransactionHash: payment?.transactionHash || null,
      verifierTransactionHash: intent.genlayerTxHash || null,
      baseRequestTransactionHash: intent.baseRequestTransactionHash || null,
      verdictImportTransactionHash: intent.transactionHash || null,
      failureReason: intent.failureReason || intent.baseRequestFailure || null,
      updatedAt: intent.updatedAt || intent.createdAt || null,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const result = publicError(error, "Verification progress is temporarily unavailable");
    return NextResponse.json(result, { status: result.status });
  }
}
