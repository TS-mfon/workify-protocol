import { submitVerification } from "@workify/evidence-engine";
import { WorkifyError, publicError } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
import { z } from "zod";

const inputSchema = z.object({
  jobId: z.string().regex(/^0x[a-fA-F0-9]{64}$/u),
  verifierAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/u),
  specificationUrl: z.string().url(), specificationHash: z.string().regex(/^0x?[a-fA-F0-9]{64}$/u),
  evidenceUrl: z.string().url(), evidenceHash: z.string().regex(/^0x?[a-fA-F0-9]{64}$/u),
  attempt: z.number().int().min(1).max(3), appeal: z.boolean(), appealContextUrl: z.string().url().optional(),
  policyVersion: z.string().min(1).max(128), feePayer: z.string().regex(/^0x[a-fA-F0-9]{40}$/u).optional(),
});
export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.AUTOMATION_HMAC_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await submitVerification(inputSchema.parse(await request.json()) as Parameters<typeof submitVerification>[0]));
  } catch (error) {
    const duplicate = error instanceof WorkifyError && error.code === "DUPLICATE_SUBMISSION";
    const result = publicError(error, "Verification submission failed");
    return NextResponse.json(result, { status: duplicate ? 409 : result.status });
  }
}
