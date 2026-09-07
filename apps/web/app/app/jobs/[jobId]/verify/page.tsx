import { Bot, Radar } from "lucide-react";
import { VerificationAction } from "@/components/ContractActions";
import { PageHeader } from "@/components/ProtocolUI";

export default async function Verify({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <><PageHeader eyebrow={`Job ${jobId.slice(0, 10)}…`} title="Request verification" description="Lock the evidence version and ask GenLayer validators to reach consensus. StudioNet reviews are free; Bradbury costs 0.1 GEN." icon={<Radar size={22}/>} status={<span className="status"><Bot size={14}/> Network-priced review</span>} /><VerificationAction jobId={jobId as `0x${string}`}/></>;
}
