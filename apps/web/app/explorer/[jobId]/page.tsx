import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CheckCircle2, ExternalLink, FileText, GitBranch, Scale, ShieldCheck } from "lucide-react";
import { Nav } from "@/components/Nav";
import { getResolvedCase } from "@/lib/explorer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Resolved Case", description: "Inspect a settled Workify adjudication." };
const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;
const usdc = (value: string) => (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });
const date = (value: number | null) => value ? new Date(value * 1000).toLocaleString() : "Recorded on-chain";

export default async function CaseDetail({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const item = await getResolvedCase(jobId);
  if (!item) notFound();
  const baseExplorer = process.env.NEXT_PUBLIC_BASE_EXPLORER_URL || "https://sepolia.basescan.org";
  const genlayerExplorer = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL || "https://explorer-bradbury.genlayer.com";
  return <><Nav /><main className="shell case-page">
    <Link className="back-link" href="/explorer"><ArrowLeft size={15}/> Back to explorer</Link>
    <header className="case-header">
      <div><span className="eyebrow"><Scale size={14}/> {item.policy}</span><h1>{item.specification.title}</h1><p>{item.specification.description}</p></div>
      <div className={`case-decision decision-${item.verdict.decision.toLowerCase()}`}><CheckCircle2 size={19}/><span>Final verdict</span><strong>{item.verdict.decision}</strong></div>
    </header>
    <section className="case-kpis">
      <div><span>Score</span><strong>{item.verdict.score}<small>/100</small></strong><p>{item.verdict.confidence}% validator confidence</p></div>
      <div><span>Worker payout</span><strong>{item.verdict.payout_bps / 100}<small>%</small></strong><p>{usdc(item.base.settlement?.workerAmount || "0")} USDC net</p></div>
      <div><span>Escrow</span><strong>{usdc(item.base.reward)}<small> USDC</small></strong><p>{item.base.status.toLowerCase()}</p></div>
      <div><span>Consensus</span><strong>{item.genlayer.consensus}</strong><p>{item.genlayer.finality ? "Finalized" : item.genlayer.status}</p></div>
    </section>
    <div className="case-layout">
      <div className="case-main">
        <section className="case-section"><div className="section-title"><ShieldCheck size={18}/><div><span>Public adjudication</span><h2>Why GenLayer reached this result</h2></div></div><p className="final-rationale">{item.verdict.final_rationale || "The finalized contract result contains no additional public rationale."}</p>{item.verdict.critical_failures.length > 0 && <div className="finding-alert"><strong>Critical failures</strong><p>{item.verdict.critical_failures.join(", ")}</p></div>}{item.verdict.missing_evidence.length > 0 && <div className="finding-alert neutral"><strong>Missing evidence</strong><p>{item.verdict.missing_evidence.join(" · ")}</p></div>}</section>
        <section className="case-section"><div className="section-title"><FileText size={18}/><div><span>Locked specification</span><h2>Criterion-by-criterion decision</h2></div></div><div className="criterion-records">{item.verdict.criteria.map((criterion) => <article key={criterion.id}><header><div><code>{criterion.id}</code><span>{criterion.severity}</span></div><strong className={`decision-${criterion.decision.toLowerCase()}`}>{criterion.decision}</strong></header><h3>{item.specification.criteria?.find((value: { id: string }) => value.id === criterion.id)?.requirement || "Locked acceptance criterion"}</h3><p>{criterion.rationale || "No additional public rationale was returned."}</p><div className="evidence-tags">{criterion.evidence_ids.length > 0 ? criterion.evidence_ids.map((evidenceId) => <span key={evidenceId}>{evidenceId}</span>) : <span>No supporting evidence ID</span>}</div></article>)}</div></section>
        <section className="case-section"><div className="section-title"><GitBranch size={18}/><div><span>Lifecycle</span><h2>From funded job to settlement</h2></div></div><ol className="timeline">{item.timeline.map((event, index) => <li key={`${event.label}:${index}`}><span>{index + 1}</span><div><strong>{event.label}</strong><p>{event.chain} · {date(event.timestamp)}</p></div>{event.transactionHash && <a href={`${baseExplorer}/tx/${event.transactionHash}`} target="_blank" rel="noreferrer"><ExternalLink size={14}/></a>}</li>)}</ol></section>
      </div>
      <aside className="case-sidebar">
        <section><h2>Settlement</h2><dl><div><dt>Worker</dt><dd>{short(item.base.worker)}</dd></div><div><dt>Client</dt><dd>{short(item.base.client)}</dd></div><div><dt>Worker received</dt><dd>{usdc(item.base.settlement?.workerAmount || "0")} USDC</dd></div><div><dt>Client returned</dt><dd>{usdc(item.base.settlement?.clientAmount || "0")} USDC</dd></div><div><dt>Protocol fee</dt><dd>{usdc(item.base.settlement?.protocolFee || "0")} USDC</dd></div></dl></section>
        <section><h2>Consensus record</h2><dl><div><dt>Verifier</dt><dd>{short(item.verifierAddress)}</dd></div><div><dt>Attempt</dt><dd>{item.verdict.attempt}{item.verdict.appeal ? " · Appeal" : " · Initial"}</dd></div><div><dt>Finality</dt><dd>{item.genlayer.status}</dd></div><div><dt>Execution</dt><dd>{item.genlayer.execution}</dd></div><div><dt>Result hash</dt><dd>{short(`0x${item.verdict.result_hash}`)}</dd></div></dl><a className="record-link" href={`${genlayerExplorer}/transactions/${item.genlayer.transactionHash}`} target="_blank" rel="noreferrer">Open GenLayer transaction <ArrowUpRight size={14}/></a></section>
        <section><h2>Public evidence</h2><div className="artifact-links">{item.evidence.artifacts.map((artifact: { id: string; canonicalUrl: string; type: string }) => <a href={artifact.canonicalUrl} target="_blank" rel="noreferrer" key={artifact.id}><span>{artifact.type}</span><strong>{artifact.id}</strong><ExternalLink size={13}/></a>)}</div></section>
        <section className="case-identifiers"><h2>Identifiers</h2><code>{item.jobId}</code><code>{item.escrowAddress}</code></section>
      </aside>
    </div>
  </main></>;
}
