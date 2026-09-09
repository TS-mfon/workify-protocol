import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const statement = (params.get("statement") || "").trim();
  if (!statement || statement.length > 2000) {
    return NextResponse.json({ error: "Appeal statement must be between 1 and 2000 characters." }, { status: 400 });
  }
  return NextResponse.json({
    type: "workify_appeal_context",
    version: "1",
    jobId: params.get("jobId") || "",
    statement,
  }, { headers: { "cache-control": "public, max-age=31536000, immutable" } });
}
