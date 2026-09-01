import { getBaseSignerHealth } from "@workify/evidence-engine";
import { Activity as ActivityIcon, Fuel, Radio, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import { EmptyState, MetricCard, PageHeader, SectionHeading } from "@/components/ProtocolUI";

export const dynamic = "force-dynamic";

export default async function Activity() {
  const signer = await getBaseSignerHealth();
  const signerLabel = signer.status === "healthy" ? "Healthy" : signer.status === "low" ? "Low gas" : signer.status === "empty" ? "No gas" : "Unavailable";
  return <><PageHeader eyebrow="Cross-chain observability" title="Protocol activity" description="Monitor Base settlement, GenLayer finality, and the tightly scoped Vercel automation signer." icon={<ActivityIcon size={22} />} status={<span className={signer.status === "healthy" ? "status" : "status warning"}><Radio size={14} /> Signer {signerLabel}</span>} /><div className="metrics"><MetricCard icon={<ServerCog />} label="Automation signer" value={signerLabel} hint={signer.signerAddress ? `${signer.signerAddress.slice(0, 8)}…${signer.signerAddress.slice(-6)}` : "Server secret not configured"} accent /><MetricCard icon={<Fuel />} label="Base gas balance" value={signer.balanceWei ? `${signer.balanceWei} wei` : "—"} hint="Manual Base Sepolia ETH refill" /><MetricCard icon={<Radio />} label="GenLayer Bradbury" value="Ready" hint="Consensus adjudication" /><MetricCard icon={<ShieldCheck />} label="Finality policy" value="Strict" hint="Accepted is not finalized" /></div><section className="section"><SectionHeading eyebrow="Event stream" title="Transaction history" description="Confirmed automation receipts and finalized adjudication results appear here." action={<button className="button secondary" type="button"><RefreshCw size={15} /> Refresh</button>} /><div className="glass ledger-panel"><EmptyState icon={<ActivityIcon size={28} />} title="No indexed activity yet" description="The event stream activates after the first signed Base receipt or finalized GenLayer verdict." /></div></section></>;
}
