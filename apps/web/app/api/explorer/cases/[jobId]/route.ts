import { getResolvedCase } from "@/lib/explorer";

export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    const item = await getResolvedCase(jobId);
    return item ? Response.json(item) : Response.json({ error: "Case not found" }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Explorer read failed" }, { status: 503 }); }
}
