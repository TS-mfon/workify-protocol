"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, CircleAlert, FileCheck2, LoaderCircle, RefreshCw } from "lucide-react";

type Detail = {
  jobId: string;
  creationTransactionHash: string;
  status: string;
  job: {
    client: string;
    worker: string;
    reward: string;
    createdAt: string;
    deliveryDeadline: string;
    attempts: string;
    appealAttempts: string;
    payoutBps: string;
    specificationHash: string;
    evidenceHash: string;
  };
};

const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;
const usdc = (value: string) => (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
const date = (value: string) => value === "0" ? "—" : new Date(Number(value) * 1000).toLocaleString();
const zeroHash = `0x${"0".repeat(64)}`;

export function LiveJobDetail({ jobId }: { jobId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch(`/api/ledger?jobId=${jobId}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setDetail(body);
      setState("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this job");
      setState("error");
    }
  }, [jobId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (state === "loading") return <div className="live-ledger-empty"><LoaderCircle className="spin" size={24}/><p>Reading the job directly from Base Sepolia…</p></div>;
  if (state === "error" || !detail) return <div className="live-ledger-empty"><CircleAlert size={24}/><h3>Job unavailable</h3><p>{error || "The contract did not return this job."}</p><button className="button secondary" type="button" onClick={() => void load()}><RefreshCw size={15}/> Retry</button></div>;
  const { job } = detail;
  const nextHref = detail.status === "AWAITING_DELIVERY" ? `/app/jobs/${jobId}/deliver` : detail.status === "DELIVERY_LOCKED" ? `/app/jobs/${jobId}/verify` : `/explorer/${jobId}`;
  const nextText = detail.status === "AWAITING_DELIVERY" ? "The assigned worker must submit and lock a public evidence manifest." : detail.status === "DELIVERY_LOCKED" ? "Fund verification and request GenLayer consensus." : detail.status === "APPEAL_WINDOW" ? "Review the finalized verdict or wait five minutes before settlement." : detail.status === "SETTLEABLE" ? "The escrow is ready for deterministic settlement." : detail.status.replaceAll("_", " ");
  return <div className="job-detail-live">
    <div className="job-detail-actions"><Link className="text-button" href="/app/jobs"><ArrowLeft size={15}/> Work contracts</Link><button className="button secondary" type="button" onClick={() => void load()}><RefreshCw size={15}/> Refresh</button></div>
    <div className="job-detail-heading"><div><span className="case-policy">{detail.status.replaceAll("_", " ")}</span><h2>{short(detail.jobId)}</h2><p>Created {date(job.createdAt)} · Delivery deadline {date(job.deliveryDeadline)}</p></div><a className="button secondary" href={`https://sepolia.basescan.org/tx/${detail.creationTransactionHash}`} target="_blank" rel="noreferrer">Open creation tx <ArrowUpRight size={15}/></a></div>
    <div className="job-detail-grid"><div><span>Escrowed reward</span><strong>{usdc(job.reward)} USDC</strong></div><div><span>Attempts</span><strong>{job.attempts} / 3</strong></div><div><span>Appeal attempts</span><strong>{job.appealAttempts} / 3</strong></div><div><span>Payout</span><strong>{job.payoutBps === "0" ? "Pending" : `${Number(job.payoutBps) / 100}%`}</strong></div></div>
    <section className="job-hashes"><div><FileCheck2 size={17}/><div><span>Client</span><code>{job.client}</code></div></div><div><FileCheck2 size={17}/><div><span>Worker</span><code>{job.worker}</code></div></div><div><FileCheck2 size={17}/><div><span>Specification hash</span><code>{job.specificationHash}</code></div></div><div><FileCheck2 size={17}/><div><span>Evidence hash</span><code>{job.evidenceHash === zeroHash ? "Not submitted" : job.evidenceHash}</code></div></div></section>
    <div className="job-detail-next"><strong>Next step</strong><p>{nextText}</p><Link className="button" href={nextHref}>Continue <ArrowUpRight size={15}/></Link></div>
  </div>;
}
