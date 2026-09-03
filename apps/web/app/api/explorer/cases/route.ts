import { getResolvedCases } from "@/lib/explorer";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ cases: await getResolvedCases() }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Explorer read failed" }, { status: 503 }); }
}
