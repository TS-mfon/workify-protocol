"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { decodeErrorResult, encodeFunctionData, parseEther } from "viem";
import { chains, createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import { WalletButton } from "./WalletButton";
import { publicNetworkConfig } from "@/lib/network";

type Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
declare global { interface Window { ethereum?: Provider } }

const network = publicNetworkConfig();
const escrow = network.escrow;
const treasury = network.genTreasury;
const base = [{ type: "function", name: "submitOrReplaceDelivery", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }], outputs: [] }, { type: "function", name: "lockDelivery", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] }, { type: "function", name: "openAppealIntent", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] }, { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] }] as const;

async function switchChain(provider: Provider, chainId: string, params: Record<string, unknown>) {
  await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] }).catch(() => provider.request({ method: "wallet_addEthereumChain", params: [params] }));
}

async function genLayerClient(account: `0x${string}`) {
  const client = createClient({ chain: chains.testnetBradbury as never, account, provider: window.ethereum });
  await client.connect("testnetBradbury");
  return client;
}

const baseErrors = [
  { type: "error", name: "Unauthorized", inputs: [] },
  { type: "error", name: "InvalidEvidence", inputs: [] },
  { type: "error", name: "DeadlinePassed", inputs: [] },
  { type: "error", name: "InvalidState", inputs: [{ name: "expected", type: "uint8" }, { name: "actual", type: "uint8" }] },
] as const;

function friendlyBaseError(error: unknown, phase: string) {
  const raw = String((error as { data?: string; message?: string })?.data || "");
  if (raw.startsWith("0x")) {
    try {
      const decoded = decodeErrorResult({ abi: baseErrors, data: raw as `0x${string}` });
      if (decoded.errorName === "Unauthorized") return "This wallet is not the assigned worker for this job.";
      if (decoded.errorName === "InvalidEvidence") return "The evidence hash was invalid. Prepare the evidence again.";
      if (decoded.errorName === "DeadlinePassed") return "The delivery deadline has passed; this delivery cannot be submitted.";
      if (decoded.errorName === "InvalidState") return `The contract rejected ${phase} because the job state changed. Refresh the job and continue from the current step.`;
    } catch { /* fall through to a safe message */ }
  }
  return `${phase} would be rejected by the Base escrow contract. Refresh the job and verify the assigned wallet before retrying.`;
}

async function sendBaseTransaction(from: string, to: string, data: `0x${string}`, phase: string) {
  try {
    await window.ethereum?.request({ method: "eth_call", params: [{ from, to, data }, "latest"] });
  } catch (error) {
    throw new Error(friendlyBaseError(error, phase));
  }
  const hash = await window.ethereum?.request({ method: "eth_sendTransaction", params: [{ from, to, data }] }) as string | undefined;
  if (!hash) throw new Error(`${phase} did not return a transaction hash. No follow-up transaction was sent.`);
  try {
    await waitForBaseReceipt(hash);
  } catch (error) {
    throw new Error(error instanceof Error ? `${phase}: ${error.message}` : `${phase} failed on Base Sepolia.`);
  }
  return hash;
}

async function waitForBaseReceipt(hash: string) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const receipt = await window.ethereum?.request({ method: "eth_getTransactionReceipt", params: [hash] }) as { status?: string } | null;
    if (receipt) {
      if (receipt.status === "0x0") throw new Error("Base Sepolia rejected the transaction. No next transaction was sent.");
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Transaction confirmation timed out. Check BaseScan before retrying.");
}

async function readJobState(jobId: string) {
  const response = await fetch(`/api/ledger?jobId=${jobId}`, { cache: "no-store" });
  const body = await response.json() as { error?: string; status?: string; job?: { worker: string; attempts: string; appealAttempts: string } };
  if (!response.ok) throw new Error(body.error || "Could not read the current contract state");
  return body;
}

export function DeliveryAction({ jobId }: { jobId: `0x${string}` }) {
  const router = useRouter(); const busy = useRef(false); const [submitting, setSubmitting] = useState(false); const [account, setAccount] = useState<`0x${string}`>(); const [status, setStatus] = useState("");
  return <form className="glass card form" style={{ marginTop: 28 }} onSubmit={async (event) => { event.preventDefault(); if (busy.current) return; const form = event.currentTarget; busy.current = true; setSubmitting(true); try { if (!account || !window.ethereum || !escrow) throw new Error("Connect the assigned worker wallet on Base Sepolia first."); const connectedAccount = account; const current = await readJobState(jobId); if (current.status !== "AWAITING_DELIVERY") throw new Error(current.status === "RETRY_WINDOW" ? "This delivery is already locked. Use the Verification page to retry adjudication." : `Delivery is unavailable while this job is ${current.status?.replaceAll("_", " ") || "being processed"}.`); if (current.job?.worker?.toLowerCase() !== connectedAccount.toLowerCase()) throw new Error("This wallet is not the assigned worker for this job. Connect the worker wallet shown on the job dashboard."); const data = new FormData(form); setStatus("Preparing immutable evidence manifest…"); const prepared = await fetch("/api/evidence/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, deliveryVersion: 1, artifacts: [{ id: "DELIVERY-01", type: "DOCUMENT", url: String(data.get("url")) }] }) }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Evidence preparation failed"); return body; }); setStatus("Submitting evidence hash…"); const submitHash = await sendBaseTransaction(connectedAccount, escrow, encodeFunctionData({ abi: base, functionName: "submitOrReplaceDelivery", args: [jobId, prepared.evidenceHash] }), "Evidence submission"); setStatus(`Evidence confirmed (${submitHash.slice(0, 10)}…). Locking evidence…`); await sendBaseTransaction(connectedAccount, escrow, encodeFunctionData({ abi: base, functionName: "lockDelivery", args: [jobId] }), "Evidence lock"); setStatus("Evidence locked. Opening the job dashboard…"); router.push(`/app/jobs/${jobId}`); } catch (error) { const walletError = error as { code?: number; message?: string }; setStatus(walletError.code === 4001 ? "Signature rejected. No further transaction was sent." : walletError.message || "Delivery transaction failed. Retry only after checking BaseScan."); } finally { busy.current = false; setSubmitting(false); } }}><WalletButton onAccount={setAccount} /><div className="field"><label>Public delivery URL</label><input name="url" type="url" required placeholder="https://github.com/owner/repo/pull/123" /></div><button className="button" type="submit" disabled={submitting}>{submitting ? "Confirming on Base…" : "Prepare and lock evidence"}</button>{status && <p className="muted">{status}</p>}</form>;
}

export function VerificationAction({ jobId, attempt = 1 }: { jobId: `0x${string}`; attempt?: number }) {
  const busy = useRef(false); const [submitting, setSubmitting] = useState(false); const [account, setAccount] = useState<`0x${string}`>(); const [status, setStatus] = useState("");
  async function fund() { if (busy.current) return; busy.current = true; setSubmitting(true); try { if (!account || !window.ethereum || !treasury) throw new Error("Connect a GenLayer wallet first"); const current = await readJobState(jobId); if (!["DELIVERY_LOCKED", "RETRY_WINDOW"].includes(current.status || "")) throw new Error(current.status === "VERIFYING" ? "This job is already being reviewed by GenLayer. Wait for finality before retrying." : `Verification is unavailable while this job is ${current.status?.replaceAll("_", " ") || "processing"}.`); const expectedAttempt = Number(current.job?.attempts || 0) + 1; if (attempt !== expectedAttempt) throw new Error(`Attempt ${expectedAttempt} is next; this page requested attempt ${attempt}.`); const client = await genLayerClient(account); const existing = await client.readContract({ address: treasury, functionName: "get_payment", args: [`${jobId}:verification:${attempt}`], jsonSafeReturn: true }); const payer = String((existing as { payer?: string } | undefined)?.payer || ""); if (payer && !/^0x0{40}$/iu.test(payer)) throw new Error("This verification fee has already been funded. Duplicate payment blocked."); setStatus("Funding exactly 0.1 GEN…"); const tx = await client.writeContract({ address: treasury, functionName: "fund_verification", args: [jobId, attempt], value: parseEther("0.1") }); const receipt = await client.waitForTransactionReceipt({ hash: tx, status: TransactionStatus.ACCEPTED }); if (receipt.resultName !== "AGREE" || receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") throw new Error("The GEN fee did not reach validator agreement"); setStatus(`Fee finalized: ${tx}. Workify will now submit the locked attempt for GenLayer review.`); } catch (error) { setStatus(error instanceof Error ? error.message : "Verification funding failed. No duplicate payment was sent."); } finally { busy.current = false; setSubmitting(false); } }
  return <div className="glass card" style={{ marginTop: 28 }}><WalletButton onAccount={setAccount} /><span className="status"><span className="pulse" /> Attempt {attempt} of 3</span><h2>0.1 GEN</h2><p className="muted">The exact fee is charged to Workify’s GenLayer treasury. A job already in VERIFYING cannot be submitted again.</p><button className="button" type="button" onClick={() => void fund()} disabled={submitting}>{submitting ? "Checking contract…" : "Fund and request verification"}</button>{status && <p className="muted">{status}</p>}</div>;
}

export function AppealAction({ jobId }: { jobId: `0x${string}` }) {
  const [account, setAccount] = useState<`0x${string}`>(); const [status, setStatus] = useState("");
  async function appeal() { try { if (!account || !window.ethereum || !escrow || !treasury) throw new Error("Connect a wallet first"); await switchChain(window.ethereum, "0x14a34", { chainId: "0x14a34", chainName: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://sepolia.base.org"] }); setStatus("Opening appeal intent…"); await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: account, to: escrow, data: encodeFunctionData({ abi: base, functionName: "openAppealIntent", args: [jobId] }) }] }); const client = await genLayerClient(account); setStatus("Funding exactly 1 GEN appeal bond…"); const tx = await client.writeContract({ address: treasury, functionName: "fund_appeal", args: [jobId], value: parseEther("1") }); const receipt = await client.waitForTransactionReceipt({ hash: tx, status: TransactionStatus.ACCEPTED }); if (receipt.resultName !== "AGREE" || receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") throw new Error("The appeal fee did not reach validator agreement"); setStatus("Queueing Base confirmation…"); const queued = await fetch("/api/appeal/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, appellant: account, genlayerPaymentTxHash: tx }) }); const body = await queued.json(); if (!queued.ok) throw new Error(body.error || "Appeal confirmation could not be queued"); setStatus(`Appeal fee finalized and confirmation queued: ${tx}`); } catch (error) { setStatus(error instanceof Error ? error.message : "Appeal failed"); } }
  return <div className="glass card form" style={{ marginTop: 28 }}><WalletButton onAccount={setAccount} /><div className="field"><label>Appeal statement</label><textarea rows={6} placeholder="Identify the criterion or evidence that was misinterpreted" /></div><p className="muted">Appeals must begin within five minutes and cost exactly 1 GEN. The original evidence remains immutable.</p><button className="button" type="button" onClick={appeal}>Open appeal and fund 1 GEN</button>{status && <p className="muted">{status}</p>}</div>;
}

export function SettleAction({ jobId }: { jobId: `0x${string}` }) { const [status, setStatus] = useState(""); return <button className="button secondary" type="button" onClick={async () => { try { if (!window.ethereum || !escrow) throw new Error("Connect a Base Sepolia wallet first"); const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as `0x${string}`[]; const tx = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: accounts[0], to: escrow, data: encodeFunctionData({ abi: base, functionName: "settle", args: [jobId] }) }] }); setStatus(`Settlement submitted: ${String(tx)}`); } catch (error) { setStatus(error instanceof Error ? error.message : "Settlement failed"); } }}>{status || "Settle when eligible"}</button>; }
