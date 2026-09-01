import { Clock3, Gavel } from "lucide-react";
import { AppealAction } from "@/components/ContractActions";
import { PageHeader } from "@/components/ProtocolUI";

export default async function Appeal({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <><PageHeader eyebrow={`Job ${jobId.slice(0, 10)}…`} title="Open an appeal" description="Challenge the finalized verdict with a bounded statement and supplemental public evidence." icon={<Gavel size={22}/>} status={<span className="status warning"><Clock3 size={14}/> Five-minute window</span>} /><AppealAction jobId={jobId as `0x${string}`}/></>;
}
