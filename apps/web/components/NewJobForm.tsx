"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, LoaderCircle, Plus, Trash2, Wallet } from "lucide-react";
import { decodeErrorResult, encodeFunctionData, keccak256, parseUnits, stringToHex } from "viem";
import { BASE_SEPOLIA_USDC, MAX_JOB_TERM_SECONDS, MIN_JOB_TERM_SECONDS } from "@workify/protocol-types";
import { WalletButton } from "./WalletButton";
import { publicNetworkConfig } from "@/lib/network";
import { formatNetworkError, switchToBaseSepolia } from "@/lib/wallet-network";

const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
const escrowAbi = [{ type: "function", name: "createFundedJob", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }, { name: "worker", type: "address" }, { name: "reward", type: "uint128" }, { name: "deliveryDeadline", type: "uint64" }, { name: "specificationHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" }], outputs: [] }] as const;
const policies: Record<string, string> = { GITHUB_SOFTWARE: "github-software-v12.0", WEB_APPLICATION: "web-application-v12.0", RESEARCH_DATA: "research-data-v12.0", CONTENT_DOCUMENT: "content-document-v12.0", DESIGN_CREATIVE: "design-creative-v12.0" };
const workTypes = [{ value: "GITHUB_SOFTWARE", label: "GitHub software", hint: "Issue, pull request, source and CI evidence" }, { value: "WEB_APPLICATION", label: "Web application", hint: "Public deployment, interface and behavior" }, { value: "RESEARCH_DATA", label: "Research & data", hint: "Report, dataset, claims and citations" }, { value: "CONTENT_DOCUMENT", label: "Content document", hint: "Technical or editorial deliverable" }, { value: "DESIGN_CREATIVE", label: "Design creative", hint: "Public images and structured visual criteria" }];
const steps = ["Work details", "Payment & deadline", "Acceptance criteria", "Review & fund"];

type Criterion = { requirement: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; evidence: string };
type Draft = { workType: string; title: string; description: string; deliverable: string; worker: string; reward: string; deadline: string; criteria: Criterion[] };
const initialDraft: Draft = { workType: "GITHUB_SOFTWARE", title: "", description: "", deliverable: "", worker: "", reward: "1", deadline: "", criteria: [{ requirement: "", severity: "CRITICAL", evidence: "Public URL and reproducible result" }] };

type TxState = "idle" | "preparing" | "approval-signature" | "approval-submitted" | "job-signature" | "job-submitted" | "confirmed" | "failed";

const baseErrors = [
  { type: "error", name: "InvalidAddress", inputs: [] },
  { type: "error", name: "InvalidAmount", inputs: [] },
  { type: "error", name: "JobExists", inputs: [] },
  { type: "error", name: "InvalidDeadline", inputs: [] },
  { type: "error", name: "InvalidState", inputs: [{ name: "expected", type: "uint8" }, { name: "actual", type: "uint8" }] },
] as const;

function providerError(error: unknown, phase: string) {
  const value = error as { code?: number; shortMessage?: string; message?: string; data?: unknown };
  const text = `${value.shortMessage || ""} ${value.message || ""}`;
  if (value.code === 4001 || /user rejected|denied/iu.test(text)) return "Signature rejected. No transaction was sent.";
  if (/insufficient funds|insufficient balance/iu.test(text)) return "This wallet does not have enough ETH for Base Sepolia gas or USDC for the reward.";
  const data = typeof value.data === "string" ? value.data : text.match(/0x[0-9a-f]{8,}/iu)?.[0];
  if (data) {
    try {
      const decoded = decodeErrorResult({ abi: baseErrors, data: data as `0x${string}` });
      if (decoded.errorName === "JobExists") return "This job was already created. Refresh the dashboard before retrying.";
      if (decoded.errorName === "InvalidAmount") return "Enter a reward greater than zero and confirm the wallet has enough USDC.";
      if (decoded.errorName === "InvalidAddress") return "The worker address is invalid or cannot be used for this job.";
      if (decoded.errorName === "InvalidDeadline") return "Choose a delivery deadline between 15 minutes and 30 days from now.";
    } catch { /* fall through to a safe message */ }
  }
  return `${phase} failed on Base Sepolia. Refresh the page and check the transaction before retrying.`;
}

async function waitForReceipt(hash: string) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const receipt = await window.ethereum?.request({ method: "eth_getTransactionReceipt", params: [hash] }) as { status?: string } | null;
    if (receipt) {
      if (receipt.status === "0x0") throw new Error("Base Sepolia rejected the transaction. No follow-up transaction was sent.");
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Transaction confirmation timed out. Check BaseScan before retrying.");
}

async function sendBaseTransaction(account: `0x${string}`, to: `0x${string}`, data: `0x${string}`, phase: string) {
  if (!window.ethereum) throw new Error("No browser wallet detected. Install MetaMask or another EVM wallet.");
  await switchToBaseSepolia(window.ethereum);
  try {
    await window.ethereum.request({ method: "eth_call", params: [{ from: account, to, data }, "latest"] });
  } catch (error) {
    throw new Error(providerError(error, phase));
  }
  try {
    const hash = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: account, to, data }] }) as string;
    if (!hash) throw new Error("No transaction hash was returned.");
    await waitForReceipt(hash);
    return hash;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Base Sepolia rejected")) throw error;
    throw new Error(providerError(error, phase));
  }
}

async function readBaseUint256(account: `0x${string}`, to: `0x${string}`, data: `0x${string}`, phase: string) {
  if (!window.ethereum) throw new Error("No browser wallet detected. Install MetaMask or another EVM wallet.");
  try {
    await switchToBaseSepolia(window.ethereum);
    const result = await window.ethereum.request({ method: "eth_call", params: [{ from: account, to, data }, "latest"] }) as `0x${string}`;
    return BigInt(result);
  } catch (error) {
    throw new Error(providerError(error, phase));
  }
}

export function NewJobForm() {
  const router = useRouter();
  const [account, setAccount] = useState<`0x${string}`>();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [txState, setTxState] = useState<TxState>("idle");
  const [message, setMessage] = useState("");
  const draftLoaded = useRef(false);
  const submitting = useRef(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("workify:new-job");
    queueMicrotask(() => {
      if (stored) try {
        const restored = { ...initialDraft, ...JSON.parse(stored) } as Draft;
        if (Number(restored.reward) > 1 || Number(restored.reward) <= 0) restored.reward = "1";
        setDraft(restored);
      } catch { sessionStorage.removeItem("workify:new-job"); }
      draftLoaded.current = true;
    });
  }, []);
  useEffect(() => { if (draftLoaded.current) sessionStorage.setItem("workify:new-job", JSON.stringify(draft)); }, [draft]);

  const policy = policies[draft.workType] ?? policies.GITHUB_SOFTWARE!;
  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(draft.title.trim() && draft.description.trim() && draft.deliverable.trim());
    if (step === 1) return /^0x[a-fA-F0-9]{40}$/u.test(draft.worker) && Number(draft.reward) > 0 && Number(draft.reward) <= 1 && Boolean(draft.deadline);
    if (step === 2) return draft.criteria.length > 0 && draft.criteria.every((criterion) => criterion.requirement.trim() && criterion.evidence.trim());
    return true;
  }, [draft, step]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  function updateCriterion(index: number, patch: Partial<Criterion>) { update("criteria", draft.criteria.map((criterion, position) => position === index ? { ...criterion, ...patch } : criterion)); }
  function addCriterion() { update("criteria", [...draft.criteria, { requirement: "", severity: "HIGH", evidence: "Public URL and reproducible result" }]); }
  function removeCriterion(index: number) { if (draft.criteria.length > 1) update("criteria", draft.criteria.filter((_, position) => position !== index)); }

  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    try {
      if (!account || !window.ethereum) throw new Error("Connect a wallet before funding the job");
      await switchToBaseSepolia(window.ethereum);
      const activeAccounts = await window.ethereum.request({ method: "eth_accounts" }) as string[];
      if (!activeAccounts[0] || activeAccounts[0].toLowerCase() !== account.toLowerCase()) throw new Error("The connected wallet changed during job creation. Reconnect the original funding wallet and try again.");
      const { escrow, baseUsdc } = publicNetworkConfig();
      if (!escrow) throw new Error("WorkEscrowV4 is not configured");
      const reward = parseUnits(draft.reward, 6);
      const maxDemoReward = parseUnits("1", 6);
      if (reward <= 0n || reward > maxDemoReward) throw new Error("Demo jobs are limited to a maximum reward of 1 USDC.");
      const deadline = Math.floor(new Date(draft.deadline).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      if (deadline < now + MIN_JOB_TERM_SECONDS || deadline > now + MAX_JOB_TERM_SECONDS) throw new Error("Deadline must be between 15 minutes and 30 days from now");

      setTxState("preparing"); setMessage("Canonicalizing and storing the locked specification…");
      const prepared = await fetch("/api/jobs/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "1.0.0", title: draft.title, description: draft.description, workType: draft.workType, deliverables: [draft.deliverable], criteria: draft.criteria.map((criterion, index) => ({ id: `C-${String(index + 1).padStart(3, "0")}`, requirement: criterion.requirement, severity: criterion.severity, verificationMethod: "source-grounded", evidenceRequired: [criterion.evidence], passCondition: criterion.requirement, failureCondition: `Evidence does not demonstrate: ${criterion.requirement}` })), authorizedSources: [], exclusions: [], policyVersion: policy }) }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body as { jobId: `0x${string}`; specificationHash: `0x${string}` }; });

      const usdcAddress = (baseUsdc || BASE_SEPOLIA_USDC) as `0x${string}`;
      const balance = await readBaseUint256(account, usdcAddress, encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [account] }), "checking the USDC balance");
      if (balance < reward) throw new Error(`This wallet has ${Number(balance) / 1e6} USDC but needs exactly ${draft.reward} USDC.`);
      const allowance = await readBaseUint256(account, usdcAddress, encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [account, escrow] }), "checking the USDC allowance");
      const approvalAccount = await window.ethereum.request({ method: "eth_accounts" }) as string[];
      if (!approvalAccount[0] || approvalAccount[0].toLowerCase() !== account.toLowerCase()) throw new Error("The connected wallet changed. No approval was sent.");
      if (allowance < reward) {
        setTxState("approval-signature"); setMessage("Base Sepolia is selected. Approve the exact 1 USDC reward in your wallet.");
        const approvalHash = await sendBaseTransaction(account, usdcAddress, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [escrow, reward] }), "USDC approval");
        setTxState("approval-submitted"); setMessage(`USDC approval confirmed (${approvalHash.slice(0, 10)}…). Rechecking allowance.`);
        const confirmedAllowance = await readBaseUint256(account, usdcAddress, encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [account, escrow] }), "confirming the USDC allowance");
        if (confirmedAllowance < reward) throw new Error("USDC approval was confirmed but the allowance is still insufficient. Do not approve again; refresh and inspect the approval transaction.");
      } else {
        setTxState("approval-submitted"); setMessage("Existing USDC allowance covers this 1 USDC job. No approval transaction is needed.");
      }
      setTxState("job-signature"); setMessage("Approve the funded job creation. USDC locks atomically in escrow.");
      const jobAccount = await window.ethereum.request({ method: "eth_accounts" }) as string[];
      if (!jobAccount[0] || jobAccount[0].toLowerCase() !== account.toLowerCase()) throw new Error("The connected wallet changed. No job was created.");
      const jobHash = await sendBaseTransaction(account, escrow, encodeFunctionData({ abi: escrowAbi, functionName: "createFundedJob", args: [prepared.jobId, draft.worker as `0x${string}`, reward, BigInt(deadline), prepared.specificationHash, keccak256(stringToHex(policy))] }), "Funded job creation");
      setTxState("job-submitted"); setMessage(`Funded job confirmed (${jobHash.slice(0, 10)}…).`);
      setTxState("confirmed"); setMessage(`Job ${prepared.jobId} is funded and active. Opening dashboard…`);
      sessionStorage.removeItem("workify:new-job");
      window.setTimeout(() => router.push(`/app/jobs/${prepared.jobId}`), 500);
    } catch (error: unknown) {
      setTxState("failed");
      setMessage(error instanceof Error ? error.message : formatNetworkError(error, "creating the job"));
    } finally {
      submitting.current = false;
    }
  }

  return <div className="wizard-shell">
    <div className="wizard-progress" aria-label="Job creation progress">{steps.map((label, index) => <div className={index === step ? "active" : index < step ? "complete" : ""} key={label}><span>{index < step ? <Check size={14} /> : index + 1}</span><b>{label}</b></div>)}</div>
    <div className="wizard-grid"><section className="glass wizard-card">
      {step === 0 && <><div className="section-heading"><span className="kicker">Step 1 of 4</span><h2>Define the work contract.</h2><p>Write for independent validators, not just the worker. Keep the requested outcome concrete and publicly verifiable.</p></div><div className="work-type-grid">{workTypes.map((item) => <button className={draft.workType === item.value ? "work-type active" : "work-type"} type="button" key={item.value} onClick={() => update("workType", item.value)}><b>{item.label}</b><span>{item.hint}</span></button>)}</div><div className="field"><label>Job title</label><input value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="Fix session expiration handling" /></div><div className="field"><label>Description</label><textarea rows={5} value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="Explain the problem, expected behavior, constraints, and excluded scope." /></div><div className="field"><label>Primary deliverable</label><input value={draft.deliverable} onChange={(event) => update("deliverable", event.target.value)} placeholder="Public GitHub pull request linked to the issue" /></div></>}
      {step === 1 && <><div className="section-heading"><span className="kicker">Step 2 of 4</span><h2>Set worker, reward, and time.</h2><p>The worker address and reward become fixed settlement inputs. Demo jobs are capped at 1 USDC, and the automation signer cannot replace them.</p></div><div className="field"><label>Worker address</label><input value={draft.worker} onChange={(event) => update("worker", event.target.value)} placeholder="0x…" /></div><div className="two-column"><div className="field"><label>Reward in USDC</label><input type="number" min="0.01" max="1" step="0.01" value={draft.reward} onChange={(event) => update("reward", event.target.value)} /><small className="muted">Maximum: 1 USDC per demo job</small></div><div className="field"><label>Delivery deadline</label><input type="datetime-local" value={draft.deadline} onChange={(event) => update("deadline", event.target.value)} /></div></div><div className="notice"><Wallet size={18} /><div><b>Fund-first creation</b><span>The job is created only if the full USDC transfer succeeds in the same Base transaction.</span></div></div></>}
      {step === 2 && <><div className="section-heading"><span className="kicker">Step 3 of 4</span><h2>Make acceptance atomic.</h2><p>Each criterion should test one behavior. Critical failures override a high aggregate score.</p></div><div className="criteria-editor">{draft.criteria.map((criterion, index) => <div className="criterion-editor" key={index}><div className="criterion-number">C-{String(index + 1).padStart(3, "0")}</div><div className="field"><label>Requirement</label><textarea rows={3} value={criterion.requirement} onChange={(event) => updateCriterion(index, { requirement: event.target.value })} placeholder="Expired sessions are rejected after 15 minutes" /></div><div className="two-column"><div className="field"><label>Severity</label><select value={criterion.severity} onChange={(event) => updateCriterion(index, { severity: event.target.value as Criterion["severity"] })}><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></div><div className="field"><label>Required evidence</label><input value={criterion.evidence} onChange={(event) => updateCriterion(index, { evidence: event.target.value })} /></div></div><button className="text-button danger" type="button" onClick={() => removeCriterion(index)} disabled={draft.criteria.length === 1}><Trash2 size={14} /> Remove</button></div>)}</div><button className="button secondary" type="button" onClick={addCriterion}><Plus size={16} /> Add criterion</button></>}
      {step === 3 && <><div className="section-heading"><span className="kicker">Step 4 of 4</span><h2>Confirm and fund.</h2><p>Workify checks balance and allowance first. You may see an approval signature only when the escrow does not already have permission for this exact 1 USDC reward.</p></div><div className="review-list"><div><span>Work</span><b>{draft.title}</b></div><div><span>Policy</span><b>{policy}</b></div><div><span>Worker</span><b className="mono">{draft.worker}</b></div><div><span>Reward</span><b>{draft.reward} USDC <small>(maximum 1 USDC)</small></b></div><div><span>Deadline</span><b>{draft.deadline ? new Date(draft.deadline).toLocaleString() : "Not set"}</b></div><div><span>Criteria</span><b>{draft.criteria.length}</b></div></div><div className="economics-grid"><div><span>Verification</span><b>0 GEN</b><small>Direct StudioNet V11 review</small></div><div><span>Appeal</span><b>0 GEN</b><small>Five-minute appeal window</small></div><div><span>Protocol fee</span><b>1%</b><small>Worker-awarded USDC only</small></div></div><div className="wallet-row"><WalletButton onAccount={setAccount} /><span>{account ? "Wallet connected on Base Sepolia" : "Connect the funding wallet"}</span></div>{txState !== "idle" && <div className={`transaction-state ${txState === "failed" ? "error" : txState === "confirmed" ? "success" : ""}`}>{txState === "failed" ? <AlertCircle /> : txState === "confirmed" ? <CheckCircle2 /> : <LoaderCircle className="spin" />}<div><b>{txState.replaceAll("-", " ")}</b><span>{message}</span></div></div>}</>}
      <div className="wizard-actions"><button className="button secondary" type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || (txState !== "idle" && txState !== "failed")}><ArrowLeft size={16} /> Back</button>{step < 3 ? <button className="button" type="button" disabled={!canContinue} onClick={() => setStep((current) => current + 1)}>Continue <ArrowRight size={16} /></button> : <button className="button" type="button" disabled={!account || !canContinue || !["idle", "failed"].includes(txState)} onClick={submit}>Check, approve & fund job <ArrowRight size={16} /></button>}</div>
    </section><aside className="wizard-aside"><div className="glass card"><span className="kicker">Settlement safeguards</span><h3>What gets locked</h3><ul className="check-list"><li><CheckCircle2 /> Client and worker addresses</li><li><CheckCircle2 /> USDC reward and deadline</li><li><CheckCircle2 /> Specification and policy hashes</li><li><CheckCircle2 /> Fixed treasury recipient</li></ul></div><div className="glass card"><span className="kicker">Need help?</span><h3>Write verifiable criteria</h3><p className="muted">Prefer “CI shows all tests pass at commit X” over “the implementation is high quality.”</p></div></aside></div>
  </div>;
}
