import { getDatabase } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  jobId: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
  kind: z.enum(["verification", "appeal"]),
  attempt: z.number().int().min(1).max(3).optional(),
  payer: z.string().regex(/^0x[a-fA-F0-9]{40}$/u),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const key = `${input.jobId.toLowerCase()}:${input.kind}:${input.kind === "verification" ? input.attempt : "appeal"}`;
    const db = await getDatabase();
    const existing = await db.collection("genlayer_payments").findOne({ _id: key as never });
    if (existing && String(existing.transactionHash).toLowerCase() !== input.transactionHash.toLowerCase()) {
      return NextResponse.json({ error: "A payment is already recorded for this job. Duplicate payment blocked." }, { status: 409 });
    }
    await db.collection("genlayer_payments").updateOne(
      { _id: key as never },
      { $setOnInsert: { ...input, key, createdAt: new Date() } },
      { upsert: true },
    );
    return NextResponse.json({ transactionHash: existing?.transactionHash || input.transactionHash });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment record could not be saved" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const input = schema.pick({ jobId: true, kind: true, attempt: true }).parse({
      jobId: new URL(request.url).searchParams.get("jobId"),
      kind: new URL(request.url).searchParams.get("kind"),
      attempt: Number(new URL(request.url).searchParams.get("attempt") || 1),
    });
    const key = `${input.jobId.toLowerCase()}:${input.kind}:${input.kind === "verification" ? input.attempt : "appeal"}`;
    const record = await (await getDatabase()).collection("genlayer_payments").findOne({ _id: key as never });
    return NextResponse.json({ transactionHash: record?.transactionHash || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment recovery failed" }, { status: 400 });
  }
}
