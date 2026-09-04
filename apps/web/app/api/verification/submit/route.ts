import { submitVerification } from "@workify/evidence-engine";
import { WorkifyError } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.AUTOMATION_HMAC_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await submitVerification(await request.json()));
  } catch (error) {
    const duplicate = error instanceof WorkifyError && error.code === "DUPLICATE_SUBMISSION";
    return NextResponse.json({ error: error instanceof Error ? error.message : "Verification submission failed", code: error instanceof WorkifyError ? error.code : "VERIFICATION_SUBMISSION_FAILED", retryable: error instanceof WorkifyError ? error.retryable : false }, { status: duplicate ? 409 : 400 });
  }
}
