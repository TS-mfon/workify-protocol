"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, BriefcaseBusiness, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { useWallet } from "./WalletProvider";

type LedgerJob = { jobId: string; creationTransactionHash: string; status: string; job: { client: string; worker: string; reward: string; deliveryDeadline: string; attempts: string; payoutBps: string } };
type ActivityItem = { name: string; transactionHash: string; blockNumber: string; args: Record<string, string | boolean | undefined> };
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;
const usdc = (value: string) => (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function LiveJobs() {
  const { account } = useWallet();
  const [jobs, setJobs] = useState<LedgerJob[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!account) { setJobs([]); return; }
    setState("loading");
    try { const response = await fetch(`/api/ledger?address=${account}`, { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setJobs(body.jobs ?? []); setError(body.degraded ? "Some job reads were unavailable. Showing the records Base returned; retry to refresh the rest." : ""); setState("idle"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load Base jobs"); setState("error"); }
  }, [account]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (!account) return <div className="live-ledger-empty"><BriefcaseBusiness size={25}/><h3>Connect a wallet to load your ledger</h3><p>Work contracts are read directly from the Base escrow contract and filtered by your address.</p></div>;
  if (state === "loading") return <div className="live-ledger-empty"><LoaderCircle className="spin" size={24}/><p>Reading WorkEscrowV3 from Base Sepolia…</p></div>;
  if (state === "error") return <div className="live-ledger-empty"><CircleAlert size={24}/><h3>Ledger unavailable</h3><p>{error}</p><button className="button secondary" type="button" onClick={() => void load()}><RefreshCw size={15}/> Retry</button></div>;
  if (jobs.length === 0) return <div className="live-ledger-empty"><BriefcaseBusiness size={25}/><h3>No work contracts found</h3><p>No funded Base escrow job currently lists this wallet as client or worker.</p><Link className="button" href="/app/jobs/new">Create funded job <ArrowUpRight size={15}/></Link></div>;
  return <>{error && <p className="muted ledger-warning"><CircleAlert size={14} /> {error}</p>}<div className="live-job-list">{jobs.map(({ jobId, status, job }) => <Link className="live-job-row" href={`/app/jobs/${jobId}`} key={jobId}><div><span className="case-policy">{status.replaceAll("_", " ")}</span><h3>{short(jobId)}</h3><p>Worker {short(job.worker)} · {usdc(job.reward)} USDC</p></div><div className="live-job-meta"><span>{job.attempts}/3 attempts</span><strong>{job.payoutBps ? `${Number(job.payoutBps) / 100}%` : "Pending"}</strong><ArrowUpRight size={16}/></div></Link>)}</div></>;
}

export function LiveActivity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const load = useCallback(async () => { setState("loading"); try { const response = await fetch("/api/ledger", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setItems(body.activity ?? []); setState("ready"); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load activity"); setState("error"); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (state === "loading") return <div className="live-ledger-empty"><LoaderCircle className="spin" size={24}/><p>Reading escrow events from Base Sepolia…</p></div>;
  if (state === "error") return <div className="live-ledger-empty"><CircleAlert size={24}/><p>{error}</p><button className="button secondary" type="button" onClick={() => void load()}>Retry</button></div>;
  if (items.length === 0) return <div className="live-ledger-empty"><BriefcaseBusiness size={25}/><h3>No indexed activity yet</h3><p>Confirmed escrow events will appear here after the first funded job.</p></div>;
  return <div className="live-activity-list">{items.map((item, index) => <a className="live-activity-row" href={`https://sepolia.basescan.org/tx/${item.transactionHash}`} target="_blank" rel="noreferrer" key={`${item.transactionHash}:${index}`}><span className="activity-dot"/><div><strong>{item.name.replace(/([A-Z])/g, " $1").trim()}</strong><p>Block {item.blockNumber} · {short(String(item.args.jobId ?? ""))}</p></div><ArrowUpRight size={15}/></a>)}</div>;
}
