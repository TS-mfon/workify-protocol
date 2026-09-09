"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { decodeErrorResult, encodeFunctionData } from "viem";
import { chains, createClient } from "genlayer-js";
import { WalletButton } from "./WalletButton";
import { publicNetworkConfig } from "@/lib/network";
import { switchToBaseSepolia } from "@/lib/wallet-network";

type Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
declare global { interface Window { ethereum?: Provider } }

type JobState = { status?: string; job?: { worker?: string; client?: string; appellant?: string; attempts?: string | number; appealAttempts?: string | number } };

const network = publicNetworkConfig();
const escrow = network.escrow;
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

type GenLayerNetwork = "bradbury" | "studionet";

async function genLayerClient(account: `0x${string}`, selectedNetwork: GenLayerNetwork = "bradbury") {
  if (!window.ethereum) throw new Error("No browser wallet detected. Install MetaMask or another EVM wallet.");
  const storedNetwork = typeof window !== "undefined" ? window.localStorage.getItem("workify-genlayer-network") : null;
  const activeNetwork = storedNetwork === "studionet" || storedNetwork === "bradbury" ? storedNetwork : selectedNetwork;
  const chain = activeNetwork === "studionet" ? chains.studionet : chains.testnetBradbury;
  const client = createClient({ chain: chain as never, account, provider: window.ethereum });
  await assertActiveAccount(account);
  const expectedChainId = `0x${chain.id.toString(16)}`;
  try {
    const currentChainId = String(await window.ethereum.request({ method: "eth_chainId" })).toLowerCase();
    if (currentChainId !== expectedChainId) {
      await client.connect(activeNetwork === "studionet" ? "studionet" : "testnetBradbury");
    }
  } catch (error) {
    throw new Error(formatWalletError(error, `Wallet is not connected to GenLayer ${activeNetwork === "studionet" ? "StudioNet" : "Bradbury"} (${expectedChainId}). Switch networks in your wallet and try again.`));
  }
  const confirmedChainId = String(await window.ethereum.request({ method: "eth_chainId" })).toLowerCase();
  if (confirmedChainId !== expectedChainId) throw new Error(`Wallet is on chain ${confirmedChainId}; GenLayer ${activeNetwork === "studionet" ? "StudioNet" : "Bradbury"} requires ${expectedChainId}.`);
  return client;
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

async function sendBaseTransaction(from: string, data: `0x${string}`, phase: string, pendingKey?: string) {
  await switchToBase();
  if (!window.ethereum) throw new Error("No browser wallet detected.");
  await assertActiveAccount(from as `0x${string}`);
  if (pendingKey) {
    const existingHash = window.sessionStorage.getItem(pendingKey);
    if (existingHash) {
      const receipt = await window.ethereum.request({ method: "eth_getTransactionReceipt", params: [existingHash] }) as { status?: string } | null;
      if (!receipt) throw new Error(`${phase} is already pending. Wait for Base confirmation before retrying.`);
      window.sessionStorage.removeItem(pendingKey);
      if (receipt.status !== "0x0") return existingHash;
    }
  }
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
  if (pendingKey) window.sessionStorage.setItem(pendingKey, hash);
  try {
    await waitForBaseReceipt(hash);
    if (pendingKey) window.sessionStorage.removeItem(pendingKey);
  } catch (error) {
    throw new Error(error instanceof Error ? `${phase}: ${error.message}` : `${phase} failed on Base Sepolia.`);
  }
  return hash;
}

async function lockDeliveryWithRecovery(account: `0x${string}`, jobId: `0x${string}`) {
  const data = encodeFunctionData({ abi: base, functionName: "lockDelivery", args: [jobId] });
  try {
    return await sendBaseTransaction(account, data, "Evidence lock", `workify:lock:${jobId}`);
  } catch (firstError) {
    const message = errorText(firstError);
    if (/signature rejected|user rejected|denied|already pending|timed out/iu.test(message)) throw firstError;
    const current = await readJobState(jobId);
    if (["DELIVERY_LOCKED", "VERIFYING", "RETRY_WINDOW", "APPEAL_WINDOW", "SETTLEABLE", "SETTLED"].includes(String(current.status))) return "already-locked";
    if (current.status !== "AWAITING_DELIVERY") throw firstError;
    return sendBaseTransaction(account, data, "Evidence lock retry", `workify:lock:${jobId}`);
  }
}

async function readJobState(jobId: string): Promise<JobState> {
  const response = await fetch(`/api/ledger?jobId=${jobId}`, { cache: "no-store" });
  const body = await response.json().catch(() => ({})) as JobState & { error?: string };
  if (!response.ok) throw new Error(body.error || "Could not read the current contract state. Retry shortly.");
  return body;
}

type VerificationProgress = {
  status: string;
  lifecycle?: string;
  network?: GenLayerNetwork;
  verifierTransactionHash?: string | null;
  baseRequestTransactionHash?: string | null;
  verdictImportTransactionHash?: string | null;
  outcomeTransactionHash?: string | null;
  failureReason?: string | null;
  rpcError?: string | null;
  nextRetryAt?: string | null;
};

async function fetchVerificationProgress(jobId: string, attempt: number, networkName: GenLayerNetwork): Promise<VerificationProgress> {
  const response = await fetch(`/api/verification/progress?jobId=${jobId}&attempt=${attempt}&network=${networkName}`, { cache: "no-store" });
  const progress = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(progress.error || "Verification progress is temporarily unavailable.");
  return progress as VerificationProgress;
}

function progressText(progress: VerificationProgress | null) {
  if (!progress || progress.status === "NOT_STARTED") return "No review has been queued for this attempt.";
  if (progress.status === "CONFIRMED") return "Review finalized and the verdict was imported to Base Sepolia.";
  if (progress.status === "FAILED") return progress.failureReason || "The review failed and requires operator attention.";
  if (progress.lifecycle === "BASE_RETRY_WINDOW") return "The review execution failed safely; Base opened a retry window. Fix the public evidence source before requesting another attempt.";
  if (progress.lifecycle === "PAYMENT_PENDING") return "Review request recorded. Workify is waiting for GenLayer finality; do not submit again.";
  if (progress.lifecycle === "VERIFIER_SUBMITTED" || progress.lifecycle === "VERIFIER_PENDING" || progress.lifecycle === "VERIFIER_ACCEPTED") return "GenLayer validators are reviewing the locked evidence.";
  if (progress.lifecycle === "VERIFIER_FINALIZED") return "Validator agreement was reached. Workify is preparing the Base verdict import.";
  if (progress.lifecycle === "VERDICT_IMPORT_PENDING") return "The verdict is finalized and is being imported into the Base escrow.";
  if (progress.rpcError) return "A temporary GenLayer RPC outage occurred. Background automation will retry automatically.";
  return "The review is processing in the background. You may leave this page safely.";
}

export function DeliveryAction({ jobId }: { jobId: `0x${string}` }) {
  const router = useRouter(); const busy = useRef(false); const [submitting, setSubmitting] = useState(false); const [account, setAccount] = useState<`0x${string}`>(); const [status, setStatus] = useState("");
  return <form className="glass card form" style={{ marginTop: 28 }} onSubmit={async (event) => { event.preventDefault(); if (busy.current) return; const form = event.currentTarget; busy.current = true; setSubmitting(true); try { if (!account || !window.ethereum) throw new Error("Connect the assigned worker wallet on Base Sepolia first."); const current = await readJobState(jobId); if (current.status !== "AWAITING_DELIVERY") throw new Error(current.status === "RETRY_WINDOW" ? "This delivery is already locked. Use the verification page to retry adjudication." : `Delivery is unavailable while this job is ${current.status?.replaceAll("_", " ") || "being processed"}.`); if (current.job?.worker?.toLowerCase() !== account.toLowerCase()) throw new Error("This wallet is not the assigned worker for this job. Connect the worker wallet shown on the job dashboard."); const data = new FormData(form); const url = String(data.get("url") || ""); if (!url) throw new Error("Add the public delivery URL before submitting evidence."); setStatus("Preparing immutable evidence manifest…"); const preparedResponse = await fetch("/api/evidence/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, deliveryVersion: 1, artifacts: [{ id: "DELIVERY-01", type: "DOCUMENT", url }] }) }); const prepared = await preparedResponse.json(); if (!preparedResponse.ok) throw new Error(prepared.error || "Evidence preparation failed. No Base transaction was sent."); setStatus("Submitting evidence hash…"); const submitHash = await sendBaseTransaction(account, encodeFunctionData({ abi: base, functionName: "submitOrReplaceDelivery", args: [jobId, prepared.evidenceHash] }), "Evidence submission", `workify:evidence:${jobId}`); setStatus(`Evidence confirmed (${submitHash.slice(0, 10)}…). Locking evidence…`); await lockDeliveryWithRecovery(account, jobId); setStatus("Evidence locked. Opening the job dashboard…"); router.push(`/app/jobs/${jobId}`); } catch (error) { setStatus(errorText(error) || "Delivery transaction failed. No follow-up transaction was sent."); } finally { busy.current = false; setSubmitting(false); } }}><WalletButton onAccount={setAccount} /><div className="field"><label>Public delivery URL</label><input name="url" type="url" required placeholder="https://github.com/owner/repo/pull/123" /></div><button className="button" type="submit" disabled={submitting}>{submitting ? "Confirming on Base…" : "Prepare and lock evidence"}</button>{status && <p className="muted">{status}</p>}</form>;
}

export function VerificationAction({ jobId, attempt = 1 }: { jobId: `0x${string}`; attempt?: number }) {
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [account, setAccount] = useState<`0x${string}`>();
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<VerificationProgress | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<GenLayerNetwork>(() => typeof window !== "undefined" && window.localStorage.getItem("workify-genlayer-network") === "studionet" ? "studionet" : "bradbury");
  const [studioReady, setStudioReady] = useState(false);

  useEffect(() => {
    const onChange = (event: Event) => {
      const value = (event as CustomEvent<GenLayerNetwork>).detail;
      if (value === "bradbury" || value === "studionet") setSelectedNetwork(value);
    };
    window.addEventListener("workify-genlayer-network-change", onChange);
    return () => window.removeEventListener("workify-genlayer-network-change", onChange);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/genlayer/health?network=studionet", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, body: await response.json().catch(() => ({})) }))
      .then(({ ok, body }) => { if (active) setStudioReady(ok && body.ready === true); })
      .catch(() => { if (active) setStudioReady(false); });
    return () => { active = false; };
  }, []);

  const refreshProgress = useCallback(async () => {
    try {
      const next = await fetchVerificationProgress(jobId, attempt, selectedNetwork);
      setProgress(next);
      if (next.status === "CONFIRMED") window.setTimeout(() => window.location.assign(`/app/jobs/${jobId}`), 1_000);
    } catch (error) {
      setProgress({ status: "PENDING", lifecycle: "RPC_RETRY_PENDING", rpcError: errorText(error) });
    }
  }, [attempt, jobId, selectedNetwork]);

  useEffect(() => {
    let active = true;
    const refresh = async () => { if (active && document.visibilityState === "visible") await refreshProgress(); };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    const visibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [refreshProgress]);

  async function fund() {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    try {
      if (!account || !window.ethereum) throw new Error("Connect the wallet that will request verification.");
      if (selectedNetwork === "studionet" && !studioReady) throw new Error("StudioNet is temporarily unavailable. Select Bradbury or retry shortly.");
      const current = await readJobState(jobId);
      if (!["DELIVERY_LOCKED", "RETRY_WINDOW"].includes(current.status || "")) throw new Error(current.status === "VERIFYING" ? "This job is already being reviewed by GenLayer. Refresh status instead of submitting again." : `Verification is unavailable while this job is ${current.status?.replaceAll("_", " ") || "processing"}.`);
      const expectedAttempt = Number(current.job?.attempts || 0) + 1;
      if (attempt !== expectedAttempt) throw new Error(`Attempt ${expectedAttempt} is next; this page requested attempt ${attempt}.`);
      const client = await genLayerClient(account, selectedNetwork);
      const payloadResponse = await fetch(`/api/verification/queue?jobId=${jobId}&attempt=${attempt}&network=${selectedNetwork}`, { cache: "no-store" });
      const payload = await payloadResponse.json().catch(() => ({})) as { verifierAddress?: `0x${string}`; specificationUrl?: string; specificationHash?: string; evidenceUrl?: string; evidenceHash?: string; policyVersion?: string; applicationFeeWei?: string; error?: string };
      if (!payloadResponse.ok || !payload.verifierAddress || !payload.specificationUrl || !payload.specificationHash || !payload.evidenceUrl || !payload.evidenceHash || !payload.policyVersion) throw new Error(payload.error || "The locked evidence payload could not be prepared.");
      const pendingKey = `workify:verify:${jobId}:${selectedNetwork}:${attempt}`;
      const previous = window.sessionStorage.getItem(pendingKey);
      if (previous) {
        if (previous === "STARTING") throw new Error("A review request is already being submitted. Wait for the wallet prompt to finish before retrying.");
        setStatus("This review transaction is already submitted. Resuming registration without another payment…");
        const resumed = await fetch("/api/verification/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, attempt, payer: account, transactionHash: previous, network: selectedNetwork }) });
        const resumedBody = await resumed.json().catch(() => ({}));
        if (!resumed.ok && resumed.status !== 409) throw new Error(resumedBody.error || "The existing review transaction is not indexed yet. Retry status shortly; do not pay again.");
        window.sessionStorage.removeItem(pendingKey);
        await refreshProgress();
        return;
      }
      window.sessionStorage.setItem(pendingKey, "STARTING");
      const fee = BigInt(payload.applicationFeeWei || "0");
      setStatus(fee === 0n ? "Submitting the direct zero-fee review…" : "Submitting the review transaction…");
      const transactionHash = await client.writeContract({ address: payload.verifierAddress, functionName: "verify", args: [jobId, payload.specificationUrl, payload.specificationHash.replace(/^0x/u, ""), payload.evidenceUrl, payload.evidenceHash.replace(/^0x/u, ""), attempt, false, ""] as never[], value: fee });
      window.sessionStorage.setItem(pendingKey, transactionHash);
      setStatus("Review transaction submitted. Registering it for background finality tracking…");
      const queuedResponse = await fetch("/api/verification/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, attempt, payer: account, transactionHash, network: selectedNetwork }) });
      const queued = await queuedResponse.json().catch(() => ({}));
      if (!queuedResponse.ok && queuedResponse.status !== 409) throw new Error(queued.error || "The review could not be queued. Do not submit another payment; use Refresh status.");
      window.sessionStorage.removeItem(pendingKey);
      setStatus("Review is live. GenLayer validators are processing the locked evidence.");
      await refreshProgress();
    } catch (error) {
      const pendingKey = `workify:verify:${jobId}:${selectedNetwork}:${attempt}`;
      if (window.sessionStorage.getItem(pendingKey) === "STARTING") window.sessionStorage.removeItem(pendingKey);
      setStatus(errorText(error) || "Verification could not be started. No duplicate payment was sent.");
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  const explorer = selectedNetwork === "studionet" ? "https://explorer-studio.genlayer.com" : "https://explorer-bradbury.genlayer.com";
  return <div className="glass card" style={{ marginTop: 28 }}>
    <WalletButton onAccount={setAccount} />
    <span className="status"><span className="pulse" /> Attempt {attempt} of 3</span>
    <h2>{selectedNetwork === "studionet" ? "Free review" : "0.1 GEN"}</h2>
    <div className="field"><label htmlFor={`genlayer-network-${jobId}`}>Adjudication network</label><select id={`genlayer-network-${jobId}`} value={selectedNetwork} onChange={(event) => { const value = event.target.value as GenLayerNetwork; setSelectedNetwork(value); window.localStorage.setItem("workify-genlayer-network", value); document.cookie = `workify-genlayer-network=${value}; Path=/; SameSite=Lax`; }} disabled={submitting}><option value="bradbury">Bradbury · 0.1 GEN</option><option value="studionet" disabled={!studioReady}>StudioNet · free{studioReady ? "" : " · unavailable"}</option></select></div>
    <p className="muted">Workify does not add an application fee. The selected verifier and network may still require protocol-level execution resources. The network is locked to this review attempt.</p>
    <button className="button" type="button" onClick={() => void fund()} disabled={submitting || (selectedNetwork === "studionet" && !studioReady)}>{submitting ? "Queueing review…" : selectedNetwork === "studionet" ? "Request free verification" : "Fund and request verification"}</button>
    <button className="button secondary" type="button" onClick={() => void refreshProgress()} disabled={submitting}>Refresh status</button>
    {(status || progress) && <div className={`transaction-state ${progress?.status === "FAILED" ? "error" : progress?.status === "CONFIRMED" ? "success" : ""}`}><div><b>{String(progress?.lifecycle || progress?.status || "REVIEW_STATUS").replaceAll("_", " ")}</b><span>{status || progressText(progress)}</span>{progress?.rpcError && <small>Temporary RPC issue: {progress.rpcError}</small>}<div className="transaction-links">{progress?.verifierTransactionHash && <a href={`${explorer}/tx/${progress.verifierTransactionHash}`} target="_blank" rel="noreferrer">Open GenLayer transaction</a>}{progress?.baseRequestTransactionHash && <a href={`https://sepolia.basescan.org/tx/${progress.baseRequestTransactionHash}`} target="_blank" rel="noreferrer">Open Base request</a>}{progress?.verdictImportTransactionHash && <a href={`https://sepolia.basescan.org/tx/${progress.verdictImportTransactionHash}`} target="_blank" rel="noreferrer">Open verdict import</a>}</div></div></div>}
  </div>;
}

export function AppealAction({ jobId }: { jobId: `0x${string}` }) {
  const busy = useRef(false); const [submitting, setSubmitting] = useState(false); const [account, setAccount] = useState<`0x${string}`>(); const [status, setStatus] = useState(""); const [statement, setStatement] = useState("");
  async function appeal() {
    if (busy.current) return;
    busy.current = true; setSubmitting(true);
    let activePendingKey = "";
    try {
      if (!account || !window.ethereum) throw new Error("Connect a wallet first.");
      if (statement.trim().length < 1) throw new Error("Explain which criterion or evidence should be reconsidered.");
      let current = await readJobState(jobId);
      if (!["APPEAL_WINDOW", "APPEAL_FUNDING"].includes(current.status || "")) throw new Error(`Appeal is unavailable while this job is ${current.status?.replaceAll("_", " ") || "processing"}.`);
      if (current.status === "APPEAL_WINDOW") {
        setStatus("Opening the appeal window on Base Sepolia…");
        await sendBaseTransaction(account, encodeFunctionData({ abi: base, functionName: "openAppealIntent", args: [jobId] }), "Appeal intent", `workify:appeal:${jobId}`);
        current = await readJobState(jobId);
      }
      const selectedNetwork = (window.localStorage.getItem("workify-genlayer-network") === "studionet" ? "studionet" : "bradbury") as GenLayerNetwork;
      const attempt = Number(current.job?.appealAttempts || 0) + 1;
      if (attempt > 3) throw new Error("This job has reached the maximum of three appeal attempts.");
      const contextUrl = `${window.location.origin}/api/appeal/context?jobId=${encodeURIComponent(jobId)}&statement=${encodeURIComponent(statement.trim())}`;
      const client = await genLayerClient(account, selectedNetwork);
      const payloadResponse = await fetch(`/api/verification/queue?jobId=${jobId}&attempt=${attempt}&network=${selectedNetwork}&appeal=true&appealContextUrl=${encodeURIComponent(contextUrl)}`, { cache: "no-store" });
      const payload = await payloadResponse.json().catch(() => ({})) as { verifierAddress?: `0x${string}`; specificationUrl?: string; specificationHash?: string; evidenceUrl?: string; evidenceHash?: string; applicationFeeWei?: string; error?: string };
      if (!payloadResponse.ok || !payload.verifierAddress || !payload.specificationUrl || !payload.specificationHash || !payload.evidenceUrl || !payload.evidenceHash) throw new Error(payload.error || "The locked appeal evidence could not be prepared.");
      const pendingKey = `workify:appeal:${jobId}:${selectedNetwork}:${attempt}`;
      activePendingKey = pendingKey;
      const previous = window.sessionStorage.getItem(pendingKey);
      if (previous) { setStatus(previous === "STARTING" ? "This appeal request is already being submitted. Wait for the wallet prompt to finish." : "This appeal transaction is already pending. Refresh status instead of paying again."); return; }
      window.sessionStorage.setItem(pendingKey, "STARTING");
      const fee = BigInt(payload.applicationFeeWei || "0");
      setStatus(fee === 0n ? "Submitting the direct zero-fee appeal review…" : "Submitting the appeal review transaction…");
      const transactionHash = await client.writeContract({ address: payload.verifierAddress, functionName: "verify", args: [jobId, payload.specificationUrl, payload.specificationHash.replace(/^0x/u, ""), payload.evidenceUrl, payload.evidenceHash.replace(/^0x/u, ""), attempt, true, contextUrl] as never[], value: fee });
      window.sessionStorage.setItem(pendingKey, transactionHash);
      const queuedResponse = await fetch("/api/verification/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, attempt, payer: account, transactionHash, network: selectedNetwork, appeal: true, appealContextUrl: contextUrl }) });
      const queued = await queuedResponse.json().catch(() => ({}));
      if (!queuedResponse.ok && queuedResponse.status !== 409) throw new Error(queued.error || "The appeal could not be queued. Do not submit another payment.");
      window.sessionStorage.removeItem(pendingKey);
      setStatus("Appeal review is live. GenLayer validators are processing the locked evidence.");
    } catch (error) { if (activePendingKey && window.sessionStorage.getItem(activePendingKey) === "STARTING") window.sessionStorage.removeItem(activePendingKey); setStatus(errorText(error) || "Appeal failed. No duplicate payment was sent."); }
    finally { busy.current = false; setSubmitting(false); }
  }
  return <div className="glass card form" style={{ marginTop: 28 }}><WalletButton onAccount={setAccount} /><div className="field"><label htmlFor={`appeal-statement-${jobId}`}>Appeal statement</label><textarea id={`appeal-statement-${jobId}`} rows={6} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="Identify the criterion or evidence that was misinterpreted" /></div><p className="muted">Appeals begin within five minutes. StudioNet appeals are free; Bradbury appeals cost exactly 1 GEN. Your appeal transaction directly starts the GenLayer review.</p><button className="button" type="button" onClick={() => void appeal()} disabled={submitting}>{submitting ? "Submitting appeal review…" : "Open appeal and request review"}</button>{status && <p className="muted">{status}</p>}</div>;
}

export function SettleAction({ jobId }: { jobId: `0x${string}` }) { const busy = useRef(false); const [submitting, setSubmitting] = useState(false); const [status, setStatus] = useState(""); return <button className="button secondary" type="button" disabled={submitting} onClick={async () => { if (busy.current) return; busy.current = true; setSubmitting(true); try { if (!window.ethereum) throw new Error("Connect a Base Sepolia wallet first."); const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as `0x${string}`[]; if (!accounts[0]) throw new Error("Connect a Base Sepolia wallet first."); const tx = await sendBaseTransaction(accounts[0], encodeFunctionData({ abi: base, functionName: "settle", args: [jobId] }), "Settlement"); setStatus(`Settlement confirmed: ${tx.slice(0, 10)}…`); } catch (error) { setStatus(errorText(error) || "Settlement failed. No duplicate transaction was sent."); } finally { busy.current = false; setSubmitting(false); } }}>{submitting ? "Confirming settlement…" : status || "Settle when eligible"}</button>; }
