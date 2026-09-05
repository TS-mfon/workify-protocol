"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { decodeErrorResult, encodeFunctionData, parseEther, type Hash } from "viem";
import { chains, createClient } from "genlayer-js";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import { WalletButton } from "./WalletButton";
import { publicNetworkConfig } from "@/lib/network";
import { switchToBaseSepolia } from "@/lib/wallet-network";

type Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
declare global { interface Window { ethereum?: Provider } }

type JobState = { status?: string; job?: { worker?: string; attempts?: string | number; appealAttempts?: string | number } };
type GenReceipt = { status?: string | number; statusName?: string; status_name?: string; result?: string | number; resultName?: string; txExecutionResult?: string | number; txExecutionResultName?: string; executionResultName?: string; message?: string };

const network = publicNetworkConfig();
const escrow = network.escrow;
const treasury = network.genTreasury;
const base = [
  { type: "function", name: "submitOrReplaceDelivery", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "lockDelivery", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "openAppealIntent", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] },
] as const;

async function switchToBase() {
  if (!window.ethereum) throw new Error("No browser wallet detected. Install MetaMask or another EVM wallet.");
  await switchToBaseSepolia(window.ethereum);
}

async function assertActiveAccount(account: `0x${string}`) {
  if (!window.ethereum) throw new Error("No browser wallet detected.");
  const accounts = await window.ethereum.request({ method: "eth_accounts" }) as string[];
  if (!accounts[0] || accounts[0].toLowerCase() !== account.toLowerCase()) {
    throw new Error("The connected wallet changed. Reconnect the original wallet before continuing.");
  }
}

async function genLayerClient(account: `0x${string}`) {
  if (!window.ethereum) throw new Error("No browser wallet detected. Install MetaMask or another EVM wallet.");
  const client = createClient({ chain: chains.testnetBradbury as never, account, provider: window.ethereum });
  await assertActiveAccount(account);
  const expectedChainId = `0x${chains.testnetBradbury.id.toString(16)}`;
  try {
    const currentChainId = String(await window.ethereum.request({ method: "eth_chainId" })).toLowerCase();
    if (currentChainId !== expectedChainId) {
      await client.connect("testnetBradbury");
    }
  } catch (error) {
    throw new Error(formatWalletError(error, `Wallet is not connected to GenLayer Bradbury (${expectedChainId}). Switch networks in your wallet and try again.`));
  }
  const confirmedChainId = String(await window.ethereum.request({ method: "eth_chainId" })).toLowerCase();
  if (confirmedChainId !== expectedChainId) throw new Error(`Wallet is on chain ${confirmedChainId}; GenLayer Bradbury requires ${expectedChainId}.`);
  return client;
}

async function ensureGenLayerBalance(account: `0x${string}`) {
  if (!window.ethereum) throw new Error("No browser wallet detected.");
  const balance = await window.ethereum.request({ method: "eth_getBalance", params: [account, "latest"] }) as string;
  if (BigInt(balance) < parseEther("0.1")) throw new Error("This wallet has less than 0.1 GEN. Fund the wallet before requesting verification.");
}

const baseErrors = [
  { type: "error", name: "Unauthorized", inputs: [] },
  { type: "error", name: "InvalidEvidence", inputs: [] },
  { type: "error", name: "DeadlinePassed", inputs: [] },
  { type: "error", name: "InvalidState", inputs: [{ name: "expected", type: "uint8" }, { name: "actual", type: "uint8" }] },
] as const;

function errorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  const value = error as { shortMessage?: string; message?: string; details?: string; cause?: unknown; data?: unknown; error?: unknown };
  return [value.shortMessage, value.message, value.details, typeof value.data === "string" ? value.data : "", errorText(value.cause), errorText(value.error)].filter(Boolean).join(" ");
}

function formatWalletError(error: unknown, fallback: string) {
  const code = (error as { code?: number })?.code;
  const text = errorText(error);
  if (code === 4001 || /user rejected|denied|rejected the request/iu.test(text)) return "Signature rejected. No transaction was sent.";
  if (/insufficient funds|insufficient balance|not enough/iu.test(text)) return "This wallet does not have enough native token for gas or GEN for this payment.";
  if (/chain|network|wallet.*different|wrong network/iu.test(text)) return "Your wallet is on the wrong network. Workify will ask you to switch to the required network.";
  if (/already funded|already exists/iu.test(text)) return "This payment already exists. Duplicate funding was blocked.";
  if (/timeout|timed out/iu.test(text)) return "The network did not confirm this transaction in time. Check the transaction before retrying.";
  return fallback;
}

function friendlyBaseError(error: unknown, phase: string) {
  const text = errorText(error);
  const rawMatch = text.match(/0x[0-9a-f]{8,}/iu)?.[0];
  if (rawMatch?.startsWith("0x")) {
    try {
      const decoded = decodeErrorResult({ abi: baseErrors, data: rawMatch as `0x${string}` });
      if (decoded.errorName === "Unauthorized") return "This wallet is not the assigned worker for this job.";
      if (decoded.errorName === "InvalidEvidence") return "The evidence hash was invalid. Prepare the evidence again.";
      if (decoded.errorName === "DeadlinePassed") return "The delivery deadline has passed; this delivery cannot be submitted.";
      if (decoded.errorName === "InvalidState") return `The contract rejected ${phase} because the job state changed. Refresh the job and continue from the current step.`;
    } catch { /* use the safe fallback below */ }
  }
  return formatWalletError(error, `${phase} was rejected by the Base escrow contract. Refresh the job and try again.`);
}

async function waitForBaseReceipt(hash: string) {
  if (!window.ethereum) throw new Error("Wallet connection was lost while waiting for Base confirmation.");
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const receipt = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [hash] }) as { status?: string } | null;
    if (receipt) {
      if (receipt.status === "0x0") throw new Error("Base rejected the transaction. No follow-up transaction was sent.");
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Base confirmation timed out. Check BaseScan before retrying; do not submit another transaction until its status is known.");
}

async function sendBaseTransaction(from: string, data: `0x${string}`, phase: string) {
  await switchToBase();
  if (!window.ethereum) throw new Error("No browser wallet detected.");
  await assertActiveAccount(from as `0x${string}`);
  try {
    await window.ethereum.request({ method: "eth_call", params: [{ from, to: escrow, data }, "latest"] });
  } catch (error) {
    throw new Error(friendlyBaseError(error, phase));
  }
  let hash: string;
  try {
    await assertActiveAccount(from as `0x${string}`);
    hash = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from, to: escrow, data }] }) as string;
  } catch (error) {
    throw new Error(formatWalletError(error, `${phase} was not submitted. No follow-up transaction was sent.`));
  }
  if (!hash) throw new Error(`${phase} did not return a transaction hash. No follow-up transaction was sent.`);
  try {
    await waitForBaseReceipt(hash);
  } catch (error) {
    throw new Error(error instanceof Error ? `${phase}: ${error.message}` : `${phase} failed on Base Sepolia.`);
  }
  return hash;
}

async function readJobState(jobId: string): Promise<JobState> {
  const response = await fetch(`/api/ledger?jobId=${jobId}`, { cache: "no-store" });
  const body = await response.json().catch(() => ({})) as JobState & { error?: string };
  if (!response.ok) throw new Error(body.error || "Could not read the current contract state. Retry shortly.");
  return body;
}

function parsePayment(value: unknown) {
  if (typeof value === "string") {
    try { return JSON.parse(value) as { payer?: string; amount?: string | number }; } catch { return { payer: "", amount: "0" }; }
  }
  return (value || {}) as { payer?: string; amount?: string | number };
}

async function recordPayment(jobId: string, kind: "verification" | "appeal", payer: string, transactionHash: string, attempt?: number) {
  const response = await fetch("/api/payments/record", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, kind, payer, transactionHash, ...(attempt ? { attempt } : {}) }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Payment record could not be saved. Do not pay again.");
}

async function recoverPayment(jobId: string, kind: "verification" | "appeal", attempt?: number) {
  const query = new URLSearchParams({ jobId, kind, ...(attempt ? { attempt: String(attempt) } : {}) });
  const response = await fetch(`/api/payments/record?${query}`, { cache: "no-store" });
  if (!response.ok) return "";
  const body = await response.json().catch(() => ({})) as { transactionHash?: string | null };
  return body.transactionHash || "";
}

async function pollVerificationProgress(jobId: string, attempt: number, onUpdate: (progress: { status: string; verifierTransactionHash?: string | null; baseRequestTransactionHash?: string | null; verdictImportTransactionHash?: string | null; failureReason?: string | null }) => void) {
  for (let index = 0; index < 36; index += 1) {
    const response = await fetch(`/api/verification/progress?jobId=${jobId}&attempt=${attempt}`, { cache: "no-store" });
    const progress = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(progress.error || "Verification progress is temporarily unavailable.");
    onUpdate(progress);
    if (["CONFIRMED", "FAILED"].includes(String(progress.status))) return progress;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return { status: "PENDING" };
}

async function waitForGenLayerDecision(client: { waitForTransactionReceipt(input: { hash: Hash; status?: TransactionStatus; interval?: number; retries?: number }): Promise<unknown> }, hash: Hash, label: string) {
  let receipt: GenReceipt;
  try {
    receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 5_000, retries: 180 }) as GenReceipt;
  } catch (error) {
    throw new Error(formatWalletError(error, `${label} was submitted but GenLayer did not reach finality. Do not pay again until this transaction is inspected.`));
  }
  const execution = receipt.txExecutionResultName || receipt.executionResultName || (String(receipt.txExecutionResult) === "1" ? ExecutionResult.FINISHED_WITH_RETURN : "");
  const rawStatus = receipt.statusName || receipt.status_name || receipt.status;
  const status = rawStatus === 5 || rawStatus === "5" ? "ACCEPTED" : rawStatus === 6 || rawStatus === "6" ? "UNDETERMINED" : rawStatus === 7 || rawStatus === "7" ? "FINALIZED" : String(rawStatus || "").toUpperCase();
  const result = receipt.resultName || (String(receipt.result) === "1" ? "AGREE" : "");
  if (status.includes("UNDETERMINED")) throw new Error(`${label} is undetermined. No duplicate payment was sent; inspect the transaction before retrying.`);
  if (!status.includes("FINALIZED") || result !== "AGREE" || execution !== ExecutionResult.FINISHED_WITH_RETURN) {
    throw new Error(`${label} did not reach validator agreement. No duplicate payment was sent.`);
  }
  return receipt;
}

export function DeliveryAction({ jobId }: { jobId: `0x${string}` }) {
  const router = useRouter(); const busy = useRef(false); const [submitting, setSubmitting] = useState(false); const [account, setAccount] = useState<`0x${string}`>(); const [status, setStatus] = useState("");
  return <form className="glass card form" style={{ marginTop: 28 }} onSubmit={async (event) => { event.preventDefault(); if (busy.current) return; const form = event.currentTarget; busy.current = true; setSubmitting(true); try { if (!account || !window.ethereum) throw new Error("Connect the assigned worker wallet on Base Sepolia first."); const current = await readJobState(jobId); if (current.status !== "AWAITING_DELIVERY") throw new Error(current.status === "RETRY_WINDOW" ? "This delivery is already locked. Use the verification page to retry adjudication." : `Delivery is unavailable while this job is ${current.status?.replaceAll("_", " ") || "being processed"}.`); if (current.job?.worker?.toLowerCase() !== account.toLowerCase()) throw new Error("This wallet is not the assigned worker for this job. Connect the worker wallet shown on the job dashboard."); const data = new FormData(form); const url = String(data.get("url") || ""); if (!url) throw new Error("Add the public delivery URL before submitting evidence."); setStatus("Preparing immutable evidence manifest…"); const preparedResponse = await fetch("/api/evidence/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, deliveryVersion: 1, artifacts: [{ id: "DELIVERY-01", type: "DOCUMENT", url }] }) }); const prepared = await preparedResponse.json(); if (!preparedResponse.ok) throw new Error(prepared.error || "Evidence preparation failed. No Base transaction was sent."); setStatus("Submitting evidence hash…"); const submitHash = await sendBaseTransaction(account, encodeFunctionData({ abi: base, functionName: "submitOrReplaceDelivery", args: [jobId, prepared.evidenceHash] }), "Evidence submission"); setStatus(`Evidence confirmed (${submitHash.slice(0, 10)}…). Locking evidence…`); await sendBaseTransaction(account, encodeFunctionData({ abi: base, functionName: "lockDelivery", args: [jobId] }), "Evidence lock"); setStatus("Evidence locked. Opening the job dashboard…"); router.push(`/app/jobs/${jobId}`); } catch (error) { setStatus(errorText(error) || "Delivery transaction failed. No follow-up transaction was sent."); } finally { busy.current = false; setSubmitting(false); } }}><WalletButton onAccount={setAccount} /><div className="field"><label>Public delivery URL</label><input name="url" type="url" required placeholder="https://github.com/owner/repo/pull/123" /></div><button className="button" type="submit" disabled={submitting}>{submitting ? "Confirming on Base…" : "Prepare and lock evidence"}</button>{status && <p className="muted">{status}</p>}</form>;
}

export function VerificationAction({ jobId, attempt = 1 }: { jobId: `0x${string}`; attempt?: number }) {
  const busy = useRef(false); const [submitting, setSubmitting] = useState(false); const [account, setAccount] = useState<`0x${string}`>(); const [status, setStatus] = useState("");
  async function fund() { if (busy.current) return; busy.current = true; setSubmitting(true); try { if (!account || !window.ethereum) throw new Error("Connect the wallet that will pay the 0.1 GEN verification fee."); const current = await readJobState(jobId); if (!['DELIVERY_LOCKED', 'RETRY_WINDOW'].includes(current.status || "")) throw new Error(current.status === "VERIFYING" ? "This job is already being reviewed by GenLayer. Wait for the current review to finish." : `Verification is unavailable while this job is ${current.status?.replaceAll("_", " ") || "processing"}.`); const expectedAttempt = Number(current.job?.attempts || 0) + 1; if (attempt !== expectedAttempt) throw new Error(`Attempt ${expectedAttempt} is next; this page requested attempt ${attempt}.`); const client = await genLayerClient(account); setStatus("Checking the GenLayer treasury payment…"); const existing = parsePayment(await client.readContract({ address: treasury, functionName: "get_payment", args: [`${jobId}:verification:${attempt}`], jsonSafeReturn: true })); const payer = String(existing.payer || ""); const amount = BigInt(String(existing.amount || 0)); const hasPayment = payer && !/^0x0{40}$/iu.test(payer) && amount > 0n; if (hasPayment && payer.toLowerCase() !== account.toLowerCase()) throw new Error("This verification fee was funded by a different wallet. Duplicate payment blocked."); if (hasPayment && amount !== 100000000000000000n) throw new Error("The existing verification payment has an invalid amount. Do not pay again; contact the operator."); let tx = hasPayment ? await recoverPayment(jobId, "verification", attempt) : ""; if (!hasPayment) { await ensureGenLayerBalance(account); setStatus("Requesting your signature for exactly 0.1 GEN…"); tx = await client.writeContract({ address: treasury, functionName: "fund_verification", args: [jobId, attempt], value: parseEther("0.1") }); await recordPayment(jobId, "verification", account, tx, attempt); setStatus("Fee submitted. Waiting for GenLayer fee finality…"); await waitForGenLayerDecision(client, tx as Hash, "Verification fee"); } else if (!tx) throw new Error("This verification payment already exists, but its transaction is not recoverable. Do not pay again; contact support."); setStatus("Fee finalized. The Workify operator is submitting the separate GenLayer LLM review…"); const queuedResponse = await fetch("/api/verification/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, attempt, feePayer: account }) }); const queued = await queuedResponse.json().catch(() => ({})); if (!queuedResponse.ok) throw new Error(queued.error || "Payment accepted, but the verifier could not be queued. Do not pay again; retry this button to resume queueing."); setStatus(`Operator review submitted (${String(queued.transactionHash || "").slice(0, 10)}…). Polling GenLayer and Base progress…`); const progress = await pollVerificationProgress(jobId, attempt, (item) => { if (item.verifierTransactionHash) setStatus(`LLM review submitted (${item.verifierTransactionHash.slice(0, 10)}…). Waiting for finality…`); if (item.baseRequestTransactionHash) setStatus(`GenLayer review active (${item.baseRequestTransactionHash.slice(0, 10)}… Base request). Awaiting verdict import…`); if (item.verdictImportTransactionHash) setStatus(`Verdict imported to Base (${item.verdictImportTransactionHash.slice(0, 10)}…). Refreshing job…`); }); if (progress.status === "FAILED") throw new Error(progress.failureReason || "The GenLayer review failed. No duplicate payment was sent."); if (progress.status !== "CONFIRMED") throw new Error("The review is still pending. Do not pay again; reopen this page to resume tracking."); await switchToBase(); setStatus("Review finalized and verdict imported. Refreshing the job dashboard…"); window.setTimeout(() => window.location.reload(), 800); } catch (error) { setStatus(errorText(error) || "Verification failed. No duplicate payment was sent."); } finally { busy.current = false; setSubmitting(false); } }
  return <div className="glass card" style={{ marginTop: 28 }}><WalletButton onAccount={setAccount} /><span className="status"><span className="pulse" /> Attempt {attempt} of 3</span><h2>0.1 GEN</h2><p className="muted">The exact fee is paid on GenLayer Bradbury. Funding is finalized before Workify queues adjudication.</p><button className="button" type="button" onClick={() => void fund()} disabled={submitting}>{submitting ? "Waiting for GenLayer…" : "Fund and request verification"}</button>{status && <p className="muted">{status}</p>}</div>;
}

export function AppealAction({ jobId }: { jobId: `0x${string}` }) {
  const busy = useRef(false); const [submitting, setSubmitting] = useState(false); const [account, setAccount] = useState<`0x${string}`>(); const [status, setStatus] = useState("");
  async function appeal() { if (busy.current) return; busy.current = true; setSubmitting(true); try { if (!account || !window.ethereum) throw new Error("Connect a wallet first."); const current = await readJobState(jobId); if (!['APPEAL_WINDOW', 'APPEAL_FUNDING'].includes(current.status || "")) throw new Error(`Appeal is unavailable while this job is ${current.status?.replaceAll("_", " ") || "processing"}.`); if (current.status === "APPEAL_WINDOW") { setStatus("Opening appeal intent on Base Sepolia…"); await sendBaseTransaction(account, encodeFunctionData({ abi: base, functionName: "openAppealIntent", args: [jobId] }), "Appeal intent"); } const client = await genLayerClient(account); setStatus("Checking the GenLayer appeal payment…"); const existing = parsePayment(await client.readContract({ address: treasury, functionName: "get_payment", args: [`${jobId}:appeal`], jsonSafeReturn: true })); const payer = String(existing.payer || ""); const amount = BigInt(String(existing.amount || 0)); const hasPayment = payer && !/^0x0{40}$/iu.test(payer) && amount > 0n; if (hasPayment && payer.toLowerCase() !== account.toLowerCase()) throw new Error("This appeal fee was funded by a different wallet. Duplicate payment blocked."); if (hasPayment && amount !== 1000000000000000000n) throw new Error("The existing appeal payment has an invalid amount. Do not pay again; contact the operator."); let tx = hasPayment ? await recoverPayment(jobId, "appeal") : ""; if (hasPayment && !tx) throw new Error("This appeal payment already exists, but its transaction is not recoverable. Do not pay again; contact support."); if (!hasPayment) { setStatus("Requesting your signature for exactly 1 GEN…"); tx = await client.writeContract({ address: treasury, functionName: "fund_appeal", args: [jobId], value: parseEther("1") }); await recordPayment(jobId, "appeal", account, tx); await waitForGenLayerDecision(client, tx as Hash, "Appeal funding"); } else { setStatus("Appeal payment already accepted. Resuming confirmation without another payment…"); } setStatus("Queueing appeal confirmation…"); const queued = await fetch("/api/appeal/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, appellant: account, genlayerPaymentTxHash: tx }) }); const body = await queued.json().catch(() => ({})); if (!queued.ok) throw new Error(body.error || "Appeal confirmation could not be queued. Do not pay again; retry confirmation."); await switchToBase(); setStatus(`Appeal fee accepted and confirmation queued (${tx.slice(0, 10)}…).`); } catch (error) { setStatus(errorText(error) || "Appeal failed. No duplicate payment was sent."); } finally { busy.current = false; setSubmitting(false); } }
  return <div className="glass card form" style={{ marginTop: 28 }}><WalletButton onAccount={setAccount} /><div className="field"><label>Appeal statement</label><textarea rows={6} placeholder="Identify the criterion or evidence that was misinterpreted" /></div><p className="muted">Appeals must begin within five minutes and cost exactly 1 GEN. The original evidence remains immutable.</p><button className="button" type="button" onClick={() => void appeal()} disabled={submitting}>{submitting ? "Processing appeal…" : "Open appeal and fund 1 GEN"}</button>{status && <p className="muted">{status}</p>}</div>;
}

export function SettleAction({ jobId }: { jobId: `0x${string}` }) { const busy = useRef(false); const [submitting, setSubmitting] = useState(false); const [status, setStatus] = useState(""); return <button className="button secondary" type="button" disabled={submitting} onClick={async () => { if (busy.current) return; busy.current = true; setSubmitting(true); try { if (!window.ethereum) throw new Error("Connect a Base Sepolia wallet first."); const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as `0x${string}`[]; if (!accounts[0]) throw new Error("Connect a Base Sepolia wallet first."); const tx = await sendBaseTransaction(accounts[0], encodeFunctionData({ abi: base, functionName: "settle", args: [jobId] }), "Settlement"); setStatus(`Settlement confirmed: ${tx.slice(0, 10)}…`); } catch (error) { setStatus(errorText(error) || "Settlement failed. No duplicate transaction was sent."); } finally { busy.current = false; setSubmitting(false); } }}>{submitting ? "Confirming settlement…" : status || "Settle when eligible"}</button>; }
