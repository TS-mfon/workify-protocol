import { getBaseSignerHealth } from "@workify/evidence-engine";
import { Activity as ActivityIcon, Fuel, Radio, RefreshCw, ServerCog, ShieldCheck } from "lucide-react";
import { MetricCard, PageHeader, SectionHeading } from "@/components/ProtocolUI";
import { LiveActivity } from "@/components/LiveLedger";

export const dynamic = "force-dynamic";

export default async function Activity() {
  const signer = await getBaseSignerHealth();
  const signerLabel = signer.status === "healthy" ? "Healthy" : signer.status === "low" ? "Low gas" : signer.status === "empty" ? "No gas" : "Unavailable";
  return <><PageHeader eyebrow="Cross-chain observability" title="Protocol activity" description="Monitor Base settlement, GenLayer finality, and the tightly scoped Vercel automation signer." icon={<ActivityIcon size={22} />} status={<span className={signer.status === "healthy" ? "status" : "status warning"}><Radio size={14} /> Signer {signerLabel}</span>} /><div className="metrics"><MetricCard icon={<ServerCog />} label="Automation signer" value={signerLabel} hint={signer.signerAddress ? `${signer.signerAddress.slice(0, 8)}…${signer.signerAddress.slice(-6)}` : "Server secret not configured"} accent /><MetricCard icon={<Fuel />} label="Base gas balance" value={signer.balanceEth ? `${Number(signer.balanceEth).toFixed(5)} ETH` : "—"} hint="Base Sepolia · manual refill" /><MetricCard icon={<Radio />} label="GenLayer Bradbury" value="Ready" hint="Consensus adjudication" /><MetricCard icon={<ShieldCheck />} label="Finality policy" value="Strict" hint="Accepted is not finalized" /></div><section className="section"><SectionHeading eyebrow="Event stream" title="Transaction history" description="Confirmed escrow events appear here directly from Base Sepolia." action={<button className="button secondary" type="button"><RefreshCw size={15} /> Refresh</button>} /><div className="glass ledger-panel"><LiveActivity /></div></section></>;
}
