"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { decodeErrorResult, encodeFunctionData } from "viem";
import { chains } from "genlayer-js";
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

const verifier = [
  { type: "function", name: "verify", stateMutability: "payable", inputs: [
    { name: "job_id", type: "string" },
    { name: "specification_url", type: "string" },
    { name: "specification_hash", type: "string" },
    { name: "evidence_url", type: "string" },
    { name: "evidence_hash", type: "string" },
    { name: "attempt", type: "uint32" },
    { name: "appeal", type: "bool" },
    { name: "appeal_context_url", type: "string" },
  ], outputs: [{ name: "result", type: "string" }] },
] as const;

async function switchToGenLayer(selectedNetwork: GenLayerNetwork) {
  if (!window.ethereum) throw new Error("No browser wallet detected. Install MetaMask or another EVM wallet.");
  const storedNetwork = typeof window !== "undefined" ? window.localStorage.getItem("workify-genlayer-network") : null;
  const activeNetwork = storedNetwork === "studionet" || storedNetwork === "bradbury" ? storedNetwork : selectedNetwork;
  const chain = activeNetwork === "studionet" ? chains.studionet : chains.testnetBradbury;
  const expectedChainId = `0x${chain.id.toString(16)}`;
  try {
    const currentChainId = String(await window.ethereum.request({ method: "eth_chainId" })).toLowerCase();
    if (currentChainId !== expectedChainId) {
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: expectedChainId }] });
      } catch (switchError) {
        if ((switchError as { code?: number })?.code !== 4902) throw switchError;
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
          chainId: expectedChainId,
          chainName: chain.name,
          rpcUrls: chain.rpcUrls.default.http,
          nativeCurrency: chain.nativeCurrency,
          blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : [],
        }] });
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: expectedChainId }] });
      }
    }
  } catch (error) {
    throw new Error(formatWalletError(error, `Wallet is not connected to GenLayer ${activeNetwork === "studionet" ? "StudioNet" : "Bradbury"} (${expectedChainId}). Switch networks in your wallet and try again.`));
  }
  const confirmedChainId = String(await window.ethereum.request({ method: "eth_chainId" })).toLowerCase();
  if (confirmedChainId !== expectedChainId) throw new Error(`Wallet is on chain ${confirmedChainId}; GenLayer ${activeNetwork === "studionet" ? "StudioNet" : "Bradbury"} requires ${expectedChainId}.`);
}

async function sendDirectGenLayerVerification(account: `0x${string}`, selectedNetwork: GenLayerNetwork, payload: {
  jobId: string;
  verifierAddress: `0x${string}`;
  specificationUrl: string;
  specificationHash: string;
  evidenceUrl: string;
  evidenceHash: string;
  attempt: number;
  appeal: boolean;
  appealContextUrl?: string;
}) {
  if (!window.ethereum) throw new Error("No browser wallet detected. Install MetaMask or another EVM wallet.");
  await switchToGenLayer(selectedNetwork);
  await assertActiveAccount(account);
  const data = encodeFunctionData({
    abi: verifier,
    functionName: "verify",
    args: [payload.jobId,
      payload.specificationUrl,
      payload.specificationHash.startsWith("0x") ? payload.specificationHash.slice(2) : payload.specificationHash,
      payload.evidenceUrl,
      payload.evidenceHash.startsWith("0x") ? payload.evidenceHash.slice(2) : payload.evidenceHash,
      payload.attempt,
      payload.appeal,
      payload.appealContextUrl || ""],
  });
  const hash = await window.ethereum.request({ method: "eth_sendTransaction", params: [{
    from: account,
    to: payload.verifierAddress,
    data,
    value: "0x0",
  }] }) as string;
  if (!hash || !/^0x[a-fA-F0-9]{64}$/u.test(hash)) throw new Error("StudioNet did not return a transaction hash. No review was submitted.");
  return hash;
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
  transactionHash?: string | null;
  statusName?: string | null;
  consensus?: string | null;
  execution?: string | null;
  verdict?: unknown;
  verdictError?: string | null;
  explorerUrl?: string | null;
  verifierTransactionHash?: string | null;
  baseRequestTransactionHash?: string | null;
  verdictImportTransactionHash?: string | null;
  outcomeTransactionHash?: string | null;
  failureReason?: string | null;
  rpcError?: string | null;
  nextRetryAt?: string | null;
};

type LiveVerdict = {
  decision?: string;
  score?: number;
  confidence?: number;
  payout_bps?: number;
  final_rationale?: string;
  critical_failures?: string[];
  missing_evidence?: string[];
  criteria?: Array<{ id?: string; severity?: string; decision?: string; rationale?: string; evidence_ids?: string[] }>;
};

function VerdictCard({ verdict }: { verdict: unknown }) {
  if (!verdict || typeof verdict !== "object") return null;
  const value = verdict as LiveVerdict;
  const score = Math.max(0, Math.min(100, Number(value.score || 0)));
  const confidence = Math.max(0, Math.min(100, Number(value.confidence || 0)));
  const criteria = Array.isArray(value.criteria) ? value.criteria : [];
  const decision = String(value.decision || "UNVERIFIABLE");
  return <section className="verdict-card" aria-label="GenLayer verdict">
    <div className="verdict-card-header"><div><span className="eyebrow">GenLayer adjudication</span><h3>Evidence-backed result</h3></div><strong className={`decision-${decision.toLowerCase()}`}>{decision}</strong></div>
    <div className="verdict-rings"><div className="verdict-ring" style={{ "--progress": `${score * 3.6}deg` } as React.CSSProperties}><strong>{score}</strong><span>score</span></div><div className="verdict-ring confidence" style={{ "--progress": `${confidence * 3.6}deg` } as React.CSSProperties}><strong>{confidence}%</strong><span>confidence</span></div><div className="verdict-payout"><span>Worker payout</span><strong>{(Number(value.payout_bps || 0) / 100).toFixed(2)}%</strong><small>after the appeal window</small></div></div>
    <p className="verdict-rationale">{value.final_rationale || "The verifier finalized a structured result. Criterion evidence is shown below."}</p>
    {criteria.length > 0 && <div className="verdict-criteria">{criteria.map((criterion, index) => { const criterionScore = criterion.decision === "PASS" ? 100 : criterion.decision === "PARTIAL" ? 50 : 0; return <article key={`${criterion.id || "criterion"}-${index}`}><div className="criterion-line"><b>{criterion.id || `C${index + 1}`}</b><span>{criterion.severity || "REQUIREMENT"}</span><strong className={`decision-${String(criterion.decision || "UNVERIFIABLE").toLowerCase()}`}>{criterion.decision || "UNVERIFIABLE"}</strong></div><div className="criterion-bar"><i style={{ width: `${criterionScore}%` }} /></div><p>{criterion.rationale || "No public rationale was returned for this criterion."}</p></article>; })}</div>}
    {(value.critical_failures?.length || value.missing_evidence?.length) ? <div className="verdict-alert">{value.critical_failures?.length ? <p><b>Critical failures:</b> {value.critical_failures.join(" · ")}</p> : null}{value.missing_evidence?.length ? <p><b>Missing evidence:</b> {value.missing_evidence.join(" · ")}</p> : null}</div> : null}
  </section>;
}

async function fetchVerificationProgress(jobId: string, attempt: number, networkName: GenLayerNetwork): Promise<VerificationProgress> {
  const response = await fetch(`/api/verification/progress?jobId=${jobId}&attempt=${attempt}&network=${networkName}`, { cache: "no-store" });
  const progress = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(progress.error || "Verification progress is temporarily unavailable.");
  return progress as VerificationProgress;
}

async function fetchGenLayerTransaction(hash: string, jobId: string, attempt: number, networkName: GenLayerNetwork, appeal = false): Promise<VerificationProgress> {
  const params = new URLSearchParams({ network: networkName, jobId, attempt: String(attempt), appeal: String(appeal) });
  const response = await fetch(`/api/genlayer/transactions/${hash}?${params.toString()}`, { cache: "no-store" });
  const body = await response.json().catch(() => ({})) as VerificationProgress & { error?: string };
  if (!response.ok && body.status !== "PENDING") throw new Error(body.error || "GenLayer status is temporarily unavailable. Your review was not resent.");
  return { ...body, rpcError: body.error || body.rpcError || null, verifierTransactionHash: hash, transactionHash: hash };
}

function progressText(progress: VerificationProgress | null) {
  if (!progress || progress.status === "NOT_STARTED") return "No review has been queued for this attempt.";
  if (progress.status === "CONFIRMED") return "Review finalized and the verdict was imported to Base Sepolia.";
  if (progress.status === "FINALIZED") return progress.consensus === "AGREE" ? "GenLayer reached consensus. Loading the finalized verdict." : "GenLayer finalized this review without validator agreement.";
  if (progress.status === "CANCELED") return "The GenLayer review was canceled. No duplicate transaction was sent.";
  if (progress.status === "UNDETERMINED") return "GenLayer could not reach agreement. The review is complete and may be retried under the attempt limit.";
  if (progress.status === "FAILED") return progress.failureReason || "The review failed and requires operator attention.";
  if (progress.lifecycle === "BASE_RETRY_WINDOW") return "The review execution failed safely; Base opened a retry window. Fix the public evidence source before requesting another attempt.";
  if (progress.lifecycle === "PAYMENT_PENDING") return "Review request recorded. Workify is waiting for GenLayer finality; do not submit again.";
  if (progress.lifecycle === "VERIFIER_SUBMITTED" || progress.lifecycle === "VERIFIER_PENDING" || progress.lifecycle === "VERIFIER_ACCEPTED") return "GenLayer validators are reviewing the locked evidence.";
  if (progress.lifecycle === "VERIFIER_METADATA_PENDING") return "StudioNet accepted the review. Its transaction metadata is still propagating; Workify will continue tracking it without another wallet request.";
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
  const [selectedNetwork, setSelectedNetwork] = useState<GenLayerNetwork>("studionet");
  const [studioReady, setStudioReady] = useState(false);

  useEffect(() => {
    const onChange = (event: Event) => {
      const value = (event as CustomEvent<GenLayerNetwork>).detail;
      if (value === "studionet") setSelectedNetwork(value);
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

  const pendingKey = `workify:verify:${jobId}:${selectedNetwork}:${attempt}`;
  const refreshProgress = useCallback(async () => {
    const stored = window.sessionStorage.getItem(`workify:verify:${jobId}:${selectedNetwork}:${attempt}`);
    const transactionHash = stored && stored !== "STARTING" ? stored : progress?.verifierTransactionHash;
    try {
      const next = transactionHash
        ? await fetchGenLayerTransaction(transactionHash, jobId, attempt, selectedNetwork)
        : await fetchVerificationProgress(jobId, attempt, selectedNetwork);
      setProgress(next);
      if (transactionHash && ["FINALIZED", "CANCELED", "UNDETERMINED"].includes(next.status)) {
        window.sessionStorage.removeItem(`workify:verify:${jobId}:${selectedNetwork}:${attempt}`);
      }
    } catch (error) {
      setProgress((current) => ({ ...(current || {}), status: "PENDING", lifecycle: "RPC_RETRY_PENDING", rpcError: errorText(error), verifierTransactionHash: transactionHash || current?.verifierTransactionHash || null }));
    }
  }, [attempt, jobId, progress?.verifierTransactionHash, selectedNetwork]);

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
      const payloadResponse = await fetch(`/api/verification/queue?jobId=${jobId}&attempt=${attempt}&network=${selectedNetwork}`, { cache: "no-store" });
      const payload = await payloadResponse.json().catch(() => ({})) as { verifierAddress?: `0x${string}`; specificationUrl?: string; specificationHash?: string; evidenceUrl?: string; evidenceHash?: string; policyVersion?: string; applicationFeeWei?: string; error?: string };
      if (!payloadResponse.ok || !payload.verifierAddress || !payload.specificationUrl || !payload.specificationHash || !payload.evidenceUrl || !payload.evidenceHash || !payload.policyVersion) throw new Error(payload.error || "The locked evidence payload could not be prepared.");
      const previous = window.sessionStorage.getItem(pendingKey);
      if (previous) {
        if (previous === "STARTING") throw new Error("A review request is already being submitted. Wait for the wallet prompt to finish before retrying.");
        setStatus("This review transaction is already submitted. Resuming registration without another payment…");
        void fetch("/api/verification/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, attempt, payer: account, transactionHash: previous, network: selectedNetwork }) }).catch(() => undefined);
        await refreshProgress();
        return;
      }
      window.sessionStorage.setItem(pendingKey, "STARTING");
      setStatus("Switching to StudioNet and waiting for your signature…");
      const transactionHash = await sendDirectGenLayerVerification(account, selectedNetwork, { jobId, verifierAddress: payload.verifierAddress, specificationUrl: payload.specificationUrl, specificationHash: payload.specificationHash, evidenceUrl: payload.evidenceUrl, evidenceHash: payload.evidenceHash, attempt, appeal: false });
      window.sessionStorage.setItem(pendingKey, transactionHash);
      setProgress({ status: "PENDING", lifecycle: "VERIFIER_SUBMITTED", verifierTransactionHash: transactionHash, transactionHash });
      setStatus("Review submitted. GenLayer validators are processing the locked evidence.");
      void fetch("/api/verification/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, attempt, payer: account, transactionHash, network: selectedNetwork }) }).catch(() => undefined);
      await refreshProgress();
    } catch (error) {
      if (window.sessionStorage.getItem(pendingKey) === "STARTING") window.sessionStorage.removeItem(pendingKey);
      setStatus(errorText(error) || "Review could not be started. No duplicate transaction was sent.");
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  const explorer = selectedNetwork === "studionet" ? "https://explorer-studio.genlayer.com" : "https://explorer-bradbury.genlayer.com";
  return <div className="glass card" style={{ marginTop: 28 }}>
    <WalletButton onAccount={setAccount} />
    <span className="status"><span className="pulse" /> Attempt {attempt} of 3</span>
    <h2>Zero-fee review</h2>
    <div className="field"><label htmlFor={`genlayer-network-${jobId}`}>Adjudication network</label><select id={`genlayer-network-${jobId}`} value="studionet" disabled><option value="studionet">StudioNet V11 · zero application fee</option></select></div>
    <p className="muted">Your connected wallet submits one direct StudioNet transaction. Workify does not collect GEN for verification or appeals.</p>
    <button className="button" type="button" onClick={() => void fund()} disabled={submitting || !studioReady}>{submitting ? "Requesting review…" : "Request verification"}</button>
    <button className="button secondary" type="button" onClick={() => void refreshProgress()} disabled={submitting}>Refresh status</button>
    {(status || progress) && <div className={`transaction-state ${["FAILED", "UNDETERMINED", "CANCELED"].includes(progress?.status || "") ? "error" : ["CONFIRMED", "FINALIZED"].includes(progress?.status || "") ? "success" : ""}`}><div><b>{String(progress?.lifecycle || progress?.status || "REVIEW_STATUS").replaceAll("_", " ")}</b><span>{status || progressText(progress)}</span>{progress?.rpcError && <small>Temporary StudioNet issue: {progress.rpcError}</small>}{progress?.verdictError && <small>Consensus is final; the public verdict is still propagating.</small>}{progress?.verdict != null ? <VerdictCard verdict={progress.verdict} /> : null}<div className="transaction-links">{progress?.verifierTransactionHash && <a href={`${explorer}/tx/${progress.verifierTransactionHash}`} target="_blank" rel="noreferrer">Open GenLayer transaction</a>}{progress?.baseRequestTransactionHash && <a href={`https://sepolia.basescan.org/tx/${progress.baseRequestTransactionHash}`} target="_blank" rel="noreferrer">Open Base request</a>}{progress?.verdictImportTransactionHash && <a href={`https://sepolia.basescan.org/tx/${progress.verdictImportTransactionHash}`} target="_blank" rel="noreferrer">Open verdict import</a>}</div></div></div>}
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
      const selectedNetwork = "studionet" as GenLayerNetwork;
      const attempt = Number(current.job?.appealAttempts || 0) + 1;
      if (attempt > 3) throw new Error("This job has reached the maximum of three appeal attempts.");
      const contextUrl = `${window.location.origin}/api/appeal/context?jobId=${encodeURIComponent(jobId)}&statement=${encodeURIComponent(statement.trim())}`;
      const payloadResponse = await fetch(`/api/verification/queue?jobId=${jobId}&attempt=${attempt}&network=${selectedNetwork}&appeal=true&appealContextUrl=${encodeURIComponent(contextUrl)}`, { cache: "no-store" });
      const payload = await payloadResponse.json().catch(() => ({})) as { verifierAddress?: `0x${string}`; specificationUrl?: string; specificationHash?: string; evidenceUrl?: string; evidenceHash?: string; applicationFeeWei?: string; error?: string };
      if (!payloadResponse.ok || !payload.verifierAddress || !payload.specificationUrl || !payload.specificationHash || !payload.evidenceUrl || !payload.evidenceHash) throw new Error(payload.error || "The locked appeal evidence could not be prepared.");
      const pendingKey = `workify:appeal:${jobId}:${selectedNetwork}:${attempt}`;
      activePendingKey = pendingKey;
      const previous = window.sessionStorage.getItem(pendingKey);
      if (previous) { setStatus(previous === "STARTING" ? "This appeal request is already being submitted. Wait for the wallet prompt to finish." : "This appeal transaction is already pending. Refresh status instead of paying again."); return; }
      window.sessionStorage.setItem(pendingKey, "STARTING");
      setStatus("Switching to StudioNet and waiting for your signature…");
      const transactionHash = await sendDirectGenLayerVerification(account, selectedNetwork, { jobId, verifierAddress: payload.verifierAddress, specificationUrl: payload.specificationUrl, specificationHash: payload.specificationHash, evidenceUrl: payload.evidenceUrl, evidenceHash: payload.evidenceHash, attempt, appeal: true, appealContextUrl: contextUrl });
      window.sessionStorage.setItem(pendingKey, transactionHash);
      const queuedResponse = await fetch("/api/verification/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, attempt, payer: account, transactionHash, network: selectedNetwork, appeal: true, appealContextUrl: contextUrl }) });
      const queued = await queuedResponse.json().catch(() => ({}));
      if (!queuedResponse.ok && queuedResponse.status !== 409) throw new Error(queued.error || "The appeal could not be queued. Do not submit another payment.");
      window.sessionStorage.removeItem(pendingKey);
      setStatus("Appeal review is live. GenLayer validators are processing the locked evidence.");
    } catch (error) { if (activePendingKey && window.sessionStorage.getItem(activePendingKey) === "STARTING") window.sessionStorage.removeItem(activePendingKey); setStatus(errorText(error) || "Appeal failed. No duplicate payment was sent."); }
    finally { busy.current = false; setSubmitting(false); }
  }
  return <div className="glass card form" style={{ marginTop: 28 }}><WalletButton onAccount={setAccount} /><div className="field"><label htmlFor={`appeal-statement-${jobId}`}>Appeal statement</label><textarea id={`appeal-statement-${jobId}`} rows={6} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="Identify the criterion or evidence that was misinterpreted" /></div><p className="muted">Appeals begin within five minutes and use the zero-fee StudioNet V11 verifier. Your wallet directly starts the review.</p><button className="button" type="button" onClick={() => void appeal()} disabled={submitting}>{submitting ? "Submitting appeal review…" : "Open appeal and request review"}</button>{status && <p className="muted">{status}</p>}</div>;
}

export function SettleAction({ jobId }: { jobId: `0x${string}` }) { const busy = useRef(false); const [submitting, setSubmitting] = useState(false); const [status, setStatus] = useState(""); return <button className="button secondary" type="button" disabled={submitting} onClick={async () => { if (busy.current) return; busy.current = true; setSubmitting(true); try { if (!window.ethereum) throw new Error("Connect a Base Sepolia wallet first."); const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as `0x${string}`[]; if (!accounts[0]) throw new Error("Connect a Base Sepolia wallet first."); const tx = await sendBaseTransaction(accounts[0], encodeFunctionData({ abi: base, functionName: "settle", args: [jobId] }), "Settlement"); setStatus(`Settlement confirmed: ${tx.slice(0, 10)}…`); } catch (error) { setStatus(errorText(error) || "Settlement failed. No duplicate transaction was sent."); } finally { busy.current = false; setSubmitting(false); } }}>{submitting ? "Confirming settlement…" : status || "Settle when eligible"}</button>; }
