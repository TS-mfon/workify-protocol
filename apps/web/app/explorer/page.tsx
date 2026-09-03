import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleDollarSign, FileCheck2, Radar, ShieldCheck } from "lucide-react";
import { Nav } from "@/components/Nav";
import { getResolvedCases } from "@/lib/explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Verdict Explorer", description: "Inspect settled Workify cases backed by Base and GenLayer." };
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;

export default async function Explorer() {
  const cases = await getResolvedCases();
  const settledValue = cases.reduce((total, item) => total + BigInt(item.base.reward), 0n);
  return <><Nav /><main className="shell explorer-page">
    <section className="explorer-hero">
      <span className="eyebrow"><Radar size={14} /> Public settlement ledger</span>
      <h1>Evidence in. <span>Verdict out.</span></h1>
      <p>Every record below is a settled Base escrow joined to its finalized GenLayer V8 adjudication. No fixture data, editorial overrides, or simulated outcomes.</p>
      <div className="explorer-summary">
        <div><FileCheck2 size={18}/><strong>{cases.length}</strong><span>resolved cases</span></div>
        <div><CircleDollarSign size={18}/><strong>{Number(settledValue) / 1e6}</strong><span>USDC adjudicated</span></div>
        <div><ShieldCheck size={18}/><strong>{new Set(cases.map((item) => item.policy)).size}</strong><span>active policies</span></div>
      </div>
    </section>
    {cases.length === 0 ? <section className="explorer-empty"><Radar size={25}/><h2>No settled V8 cases yet</h2><p>The explorer publishes only complete on-chain lifecycles. Cases appear after Base settlement and GenLayer finality.</p></section> :
    <section className="case-list">{cases.map((item) => <Link className="case-row" href={`/explorer/${item.jobId}`} key={item.jobId}>
      <div className="case-primary"><span className="case-policy">{item.policy}</span><h2>{item.specification.title}</h2><p>{item.specification.description}</p></div>
      <div className="case-metric"><span>Verdict</span><strong className={`decision-${item.verdict.decision.toLowerCase()}`}><CheckCircle2 size={15}/>{item.verdict.decision}</strong></div>
      <div className="case-metric"><span>Score</span><strong>{item.verdict.score}<small>/100</small></strong></div>
      <div className="case-metric"><span>Payout</span><strong>{item.verdict.payout_bps / 100}<small>%</small></strong></div>
      <div className="case-tail"><code>{short(item.jobId)}</code><ArrowUpRight size={18}/></div>
    </Link>)}</section>}
  </main></>;
}
