import { FilePlus2, LockKeyhole } from "lucide-react";
import { NewJobForm } from "@/components/NewJobForm";
import { PageHeader } from "@/components/ProtocolUI";

export default function NewJob() {
  return <><PageHeader eyebrow="New work contract" title="Create a funded job" description="Define verifiable work, assign one worker, and lock the full USDC reward before the contract exists." icon={<FilePlus2 size={22}/>} status={<span className="status"><LockKeyhole size={14}/> Atomic funding</span>} /><NewJobForm/></>;
}
