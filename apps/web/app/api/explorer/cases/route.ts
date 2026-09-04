import { getResolvedCases } from "@/lib/explorer";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ cases: await getResolvedCases(), degraded: false }); }
  catch { return Response.json({ cases: [], degraded: true, message: "Live Base RPC is temporarily rate-limited. Retry shortly." }); }
}
