import { processOneShotWebhook, WorkifyError } from "@workify/evidence-engine";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
  try {
    const result = await processOneShotWebhook(payload as Record<string, unknown>);
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof WorkifyError && error.code === "AUTHORIZATION") {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 403 });
    }
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
