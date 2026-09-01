import { Link2, PackageCheck } from "lucide-react";
import { DeliveryAction } from "@/components/ContractActions";
import { PageHeader } from "@/components/ProtocolUI";

export default async function Deliver({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <><PageHeader eyebrow={`Job ${jobId.slice(0, 10)}…`} title="Submit public evidence" description="Pin a reproducible public artifact to the delivery before verification begins." icon={<PackageCheck size={22}/>} status={<span className="status review"><Link2 size={14}/> Public URLs only</span>} /><DeliveryAction jobId={jobId as `0x${string}`}/></>;
}
