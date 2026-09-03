import Link from "next/link";
import { BriefcaseBusiness, CheckCircle2, Filter, LockKeyhole, Plus, Radar, ScanSearch } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/ProtocolUI";
import { LiveJobs } from "@/components/LiveLedger";

const lifecycle = [
  { icon: LockKeyhole, label: "Funded", text: "USDC locked atomically" },
  { icon: ScanSearch, label: "Evidence", text: "Public manifest pinned" },
  { icon: Radar, label: "Consensus", text: "GenLayer adjudication" },
  { icon: CheckCircle2, label: "Settleable", text: "Appeal window elapsed" },
];

export default function Jobs() {
  return <><PageHeader eyebrow="Escrow registry" title="Work contracts" description="Create, deliver, verify, appeal, and settle without trusting either side's completion claim." icon={<BriefcaseBusiness size={22} />} status={<span className="status"><LockKeyhole size={14} /> Fund-first</span>} action={<Link className="button" href="/app/jobs/new"><Plus size={16} /> Create job</Link>} /><div className="lifecycle-rail">{lifecycle.map(({ icon: Icon, label, text }, index) => <div className="lifecycle-node" key={label}><span className="lifecycle-icon"><Icon size={18} /></span><div><small>0{index + 1}</small><strong>{label}</strong><p>{text}</p></div></div>)}</div><section className="section"><SectionHeading eyebrow="Connected wallet" title="Your active ledger" description="Live jobs are read from the deployed WorkEscrow contract and filtered by your connected address." action={<button className="button secondary" type="button"><Filter size={15} /> All statuses</button>} /><div className="glass ledger-panel"><LiveJobs /></div></section></>;
}
