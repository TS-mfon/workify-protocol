import { getResolvedCases } from "@/lib/explorer";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ cases: await getResolvedCases(), degraded: false }); }
  catch (error) {
    const text = String(error instanceof Error ? error.message : error);
    const rateLimited = /rate limit|over rate limit|429/u.test(text);
    return Response.json({ cases: [], degraded: true, retryable: true, message: rateLimited ? "Base Sepolia is temporarily rate-limited. Retry shortly." : "The live settlement ledger is temporarily unavailable. Retry shortly." }, { status: 503 });
  }
}
