import { getBaseSignerHealth } from "@workify/evidence-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getBaseSignerHealth(), { headers: { "cache-control": "no-store" } });
}
