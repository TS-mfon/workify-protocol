import { CircleDollarSign, FileCheck2, Radar, RotateCcw } from "lucide-react";
import { MetricCard, PageHeader, SectionHeading } from "@/components/ProtocolUI";
import { LiveJobDetail } from "@/components/LiveJobDetail";

export default async function Job({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <><PageHeader eyebrow={`Job ${jobId.slice(0, 10)}…`} title="Work contract" description="One immutable specification, one assigned worker, and one auditable settlement path." icon={<FileCheck2 size={22} />} status={<span className="status review"><Radar size={14} /> Live Base V4 state</span>} /><LiveJobDetail jobId={jobId}/><div className="metrics metrics-three"><MetricCard icon={<CircleDollarSign />} label="Escrow" value="Onchain" hint="Read from WorkEscrowV4" accent /><MetricCard icon={<Radar />} label="Consensus" value="GenLayer V12" hint="Finality-backed verification" /><MetricCard icon={<RotateCcw />} label="Retry ceiling" value="3" hint="Maximum attempts" /></div><section className="section"><SectionHeading eyebrow="State-driven workflow" title="One next action at a time" description="The dashboard only presents the action permitted by the current onchain state." /></section></>;
}
