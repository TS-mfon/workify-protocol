import { Bot, Radar } from "lucide-react";
import { VerificationAction } from "@/components/ContractActions";
import { PageHeader } from "@/components/ProtocolUI";

export default async function Verify({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <><PageHeader eyebrow={`Job ${jobId.slice(0, 10)}…`} title="Request verification" description="Ask StudioNet V11 validators to review the locked evidence in one direct, zero-fee wallet transaction." icon={<Radar size={22}/>} status={<span className="status"><Bot size={14}/> Direct wallet review</span>} /><VerificationAction jobId={jobId as `0x${string}`}/></>;
}
