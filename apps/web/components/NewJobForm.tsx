"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, LoaderCircle, Plus, Trash2, Wallet } from "lucide-react";
import { encodeFunctionData, keccak256, parseUnits, stringToHex } from "viem";
import { BASE_SEPOLIA_USDC, MAX_JOB_TERM_SECONDS, MIN_JOB_TERM_SECONDS } from "@workify/protocol-types";
import { WalletButton } from "./WalletButton";

const erc20Abi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;
const escrowAbi = [{ type: "function", name: "createFundedJob", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }, { name: "worker", type: "address" }, { name: "reward", type: "uint128" }, { name: "deliveryDeadline", type: "uint64" }, { name: "specificationHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" }], outputs: [] }] as const;
const policies: Record<string, string> = { GITHUB_SOFTWARE: "github-software-v8.0", WEB_APPLICATION: "web-application-v8.0", RESEARCH_DATA: "research-data-v8.0", CONTENT_DOCUMENT: "content-document-v8.0", DESIGN_CREATIVE: "design-creative-v8.0" };
const workTypes = [{ value: "GITHUB_SOFTWARE", label: "GitHub software", hint: "Issue, pull request, source and CI evidence" }, { value: "WEB_APPLICATION", label: "Web application", hint: "Public deployment, interface and behavior" }, { value: "RESEARCH_DATA", label: "Research & data", hint: "Report, dataset, claims and citations" }, { value: "CONTENT_DOCUMENT", label: "Content document", hint: "Technical or editorial deliverable" }, { value: "DESIGN_CREATIVE", label: "Design creative", hint: "Public images and structured visual criteria" }];
const steps = ["Work details", "Payment & deadline", "Acceptance criteria", "Review & fund"];

type Criterion = { requirement: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"; evidence: string };
type Draft = { workType: string; title: string; description: string; deliverable: string; worker: string; reward: string; deadline: string; criteria: Criterion[] };
const initialDraft: Draft = { workType: "GITHUB_SOFTWARE", title: "", description: "", deliverable: "", worker: "", reward: "100", deadline: "", criteria: [{ requirement: "", severity: "CRITICAL", evidence: "Public URL and reproducible result" }] };

type TxState = "idle" | "preparing" | "approval-signature" | "approval-submitted" | "job-signature" | "job-submitted" | "confirmed" | "failed";

async function waitForReceipt(hash: string) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const receipt = await window.ethereum?.request({ method: "eth_getTransactionReceipt", params: [hash] }) as { status?: string } | null;
    if (receipt) {
      if (receipt.status === "0x0") throw new Error("The transaction reverted on Base Sepolia");
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Transaction confirmation timed out. Check BaseScan before retrying.");
}

export function NewJobForm() {
  const router = useRouter();
  const [account, setAccount] = useState<`0x${string}`>();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [txState, setTxState] = useState<TxState>("idle");
  const [message, setMessage] = useState("");
  const draftLoaded = useRef(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("workify:new-job");
    queueMicrotask(() => {
      if (stored) try { setDraft({ ...initialDraft, ...JSON.parse(stored) }); } catch { sessionStorage.removeItem("workify:new-job"); }
      draftLoaded.current = true;
    });
  }, []);
  useEffect(() => { if (draftLoaded.current) sessionStorage.setItem("workify:new-job", JSON.stringify(draft)); }, [draft]);

  const policy = policies[draft.workType] ?? policies.GITHUB_SOFTWARE!;
  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(draft.title.trim() && draft.description.trim() && draft.deliverable.trim());
    if (step === 1) return /^0x[a-fA-F0-9]{40}$/u.test(draft.worker) && Number(draft.reward) > 0 && Boolean(draft.deadline);
    if (step === 2) return draft.criteria.length > 0 && draft.criteria.every((criterion) => criterion.requirement.trim() && criterion.evidence.trim());
    return true;
  }, [draft, step]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  function updateCriterion(index: number, patch: Partial<Criterion>) { update("criteria", draft.criteria.map((criterion, position) => position === index ? { ...criterion, ...patch } : criterion)); }
  function addCriterion() { update("criteria", [...draft.criteria, { requirement: "", severity: "HIGH", evidence: "Public URL and reproducible result" }]); }
  function removeCriterion(index: number) { if (draft.criteria.length > 1) update("criteria", draft.criteria.filter((_, position) => position !== index)); }

  async function submit() {
    try {
      if (!account || !window.ethereum) throw new Error("Connect a wallet before funding the job");
      const escrow = process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS as `0x${string}` | undefined;
      if (!escrow) throw new Error("WorkEscrowV3 is not configured");
      const reward = parseUnits(draft.reward, 6);
      const deadline = Math.floor(new Date(draft.deadline).getTime() / 1000);
      const now = Math.floor(Date.now() / 1000);
      if (deadline < now + MIN_JOB_TERM_SECONDS || deadline > now + MAX_JOB_TERM_SECONDS) throw new Error("Deadline must be between 15 minutes and 30 days from now");

      setTxState("preparing"); setMessage("Canonicalizing and storing the locked specification…");
      const prepared = await fetch("/api/jobs/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "1.0.0", title: draft.title, description: draft.description, workType: draft.workType, deliverables: [draft.deliverable], criteria: draft.criteria.map((criterion, index) => ({ id: `C-${String(index + 1).padStart(3, "0")}`, requirement: criterion.requirement, severity: criterion.severity, verificationMethod: "source-grounded", evidenceRequired: [criterion.evidence], passCondition: criterion.requirement, failureCondition: `Evidence does not demonstrate: ${criterion.requirement}` })), authorizedSources: [], exclusions: [], policyVersion: policy }) }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body as { jobId: `0x${string}`; specificationHash: `0x${string}` }; });

      setTxState("approval-signature"); setMessage("Approve the exact USDC reward in your wallet.");
      const approvalHash = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: account, to: BASE_SEPOLIA_USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [escrow, reward] }) }] }) as string;
      setTxState("approval-submitted"); setMessage("USDC approval submitted. Waiting for Base confirmation…");
      await waitForReceipt(approvalHash);

      setTxState("job-signature"); setMessage("Approve the funded job creation. USDC locks atomically in escrow.");
      const jobHash = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: account, to: escrow, data: encodeFunctionData({ abi: escrowAbi, functionName: "createFundedJob", args: [prepared.jobId, draft.worker as `0x${string}`, reward, BigInt(deadline), prepared.specificationHash, keccak256(stringToHex(policy))] }) }] }) as string;
      setTxState("job-submitted"); setMessage("Funded job submitted. Waiting for final Base confirmation…");
      await waitForReceipt(jobHash);
      setTxState("confirmed"); setMessage(`Job ${prepared.jobId} is funded and active. Opening dashboard…`);
      sessionStorage.removeItem("workify:new-job");
      window.setTimeout(() => router.push(`/app/jobs/${prepared.jobId}`), 500);
    } catch (error: unknown) {
      const walletError = error as { code?: number; message?: string };
      setTxState("failed");
      setMessage(walletError.code === 4001 ? "Signature rejected. No additional transaction was sent." : walletError.message || "Job creation failed");
    }
  }

  return <div className="wizard-shell">
    <div className="wizard-progress" aria-label="Job creation progress">{steps.map((label, index) => <div className={index === step ? "active" : index < step ? "complete" : ""} key={label}><span>{index < step ? <Check size={14} /> : index + 1}</span><b>{label}</b></div>)}</div>
    <div className="wizard-grid"><section className="glass wizard-card">
      {step === 0 && <><div className="section-heading"><span className="kicker">Step 1 of 4</span><h2>Define the work contract.</h2><p>Write for independent validators, not just the worker. Keep the requested outcome concrete and publicly verifiable.</p></div><div className="work-type-grid">{workTypes.map((item) => <button className={draft.workType === item.value ? "work-type active" : "work-type"} type="button" key={item.value} onClick={() => update("workType", item.value)}><b>{item.label}</b><span>{item.hint}</span></button>)}</div><div className="field"><label>Job title</label><input value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="Fix session expiration handling" /></div><div className="field"><label>Description</label><textarea rows={5} value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="Explain the problem, expected behavior, constraints, and excluded scope." /></div><div className="field"><label>Primary deliverable</label><input value={draft.deliverable} onChange={(event) => update("deliverable", event.target.value)} placeholder="Public GitHub pull request linked to the issue" /></div></>}
      {step === 1 && <><div className="section-heading"><span className="kicker">Step 2 of 4</span><h2>Set worker, reward, and time.</h2><p>The worker address and reward become fixed settlement inputs. The automation signer cannot replace them.</p></div><div className="field"><label>Worker address</label><input value={draft.worker} onChange={(event) => update("worker", event.target.value)} placeholder="0x…" /></div><div className="two-column"><div className="field"><label>Reward in USDC</label><input type="number" min="0.01" step="0.01" value={draft.reward} onChange={(event) => update("reward", event.target.value)} /></div><div className="field"><label>Delivery deadline</label><input type="datetime-local" value={draft.deadline} onChange={(event) => update("deadline", event.target.value)} /></div></div><div className="notice"><Wallet size={18} /><div><b>Fund-first creation</b><span>The job is created only if the full USDC transfer succeeds in the same Base transaction.</span></div></div></>}
      {step === 2 && <><div className="section-heading"><span className="kicker">Step 3 of 4</span><h2>Make acceptance atomic.</h2><p>Each criterion should test one behavior. Critical failures override a high aggregate score.</p></div><div className="criteria-editor">{draft.criteria.map((criterion, index) => <div className="criterion-editor" key={index}><div className="criterion-number">C-{String(index + 1).padStart(3, "0")}</div><div className="field"><label>Requirement</label><textarea rows={3} value={criterion.requirement} onChange={(event) => updateCriterion(index, { requirement: event.target.value })} placeholder="Expired sessions are rejected after 15 minutes" /></div><div className="two-column"><div className="field"><label>Severity</label><select value={criterion.severity} onChange={(event) => updateCriterion(index, { severity: event.target.value as Criterion["severity"] })}><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></div><div className="field"><label>Required evidence</label><input value={criterion.evidence} onChange={(event) => updateCriterion(index, { evidence: event.target.value })} /></div></div><button className="text-button danger" type="button" onClick={() => removeCriterion(index)} disabled={draft.criteria.length === 1}><Trash2 size={14} /> Remove</button></div>)}</div><button className="button secondary" type="button" onClick={addCriterion}><Plus size={16} /> Add criterion</button></>}
      {step === 3 && <><div className="section-heading"><span className="kicker">Step 4 of 4</span><h2>Review and fund.</h2><p>Two Base signatures are required: exact USDC approval, then atomic job creation and funding.</p></div><div className="review-list"><div><span>Work</span><b>{draft.title}</b></div><div><span>Policy</span><b>{policy}</b></div><div><span>Worker</span><b className="mono">{draft.worker}</b></div><div><span>Reward</span><b>{draft.reward} USDC</b></div><div><span>Deadline</span><b>{draft.deadline ? new Date(draft.deadline).toLocaleString() : "Not set"}</b></div><div><span>Criteria</span><b>{draft.criteria.length}</b></div></div><div className="economics-grid"><div><span>Verification</span><b>0.1 GEN / attempt</b><small>Paid by work submitter</small></div><div><span>Appeal</span><b>1 GEN</b><small>Five-minute window</small></div><div><span>Protocol fee</span><b>1%</b><small>Worker-awarded USDC only</small></div></div><div className="wallet-row"><WalletButton onAccount={setAccount} /><span>{account ? "Wallet connected on Base Sepolia" : "Connect the funding wallet"}</span></div>{txState !== "idle" && <div className={`transaction-state ${txState === "failed" ? "error" : txState === "confirmed" ? "success" : ""}`}>{txState === "failed" ? <AlertCircle /> : txState === "confirmed" ? <CheckCircle2 /> : <LoaderCircle className="spin" />}<div><b>{txState.replaceAll("-", " ")}</b><span>{message}</span></div></div>}</>}
      <div className="wizard-actions"><button className="button secondary" type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || (txState !== "idle" && txState !== "failed")}><ArrowLeft size={16} /> Back</button>{step < 3 ? <button className="button" type="button" disabled={!canContinue} onClick={() => setStep((current) => current + 1)}>Continue <ArrowRight size={16} /></button> : <button className="button" type="button" disabled={!account || !canContinue || !["idle", "failed"].includes(txState)} onClick={submit}>Approve USDC & fund job <ArrowRight size={16} /></button>}</div>
    </section><aside className="wizard-aside"><div className="glass card"><span className="kicker">Settlement safeguards</span><h3>What gets locked</h3><ul className="check-list"><li><CheckCircle2 /> Client and worker addresses</li><li><CheckCircle2 /> USDC reward and deadline</li><li><CheckCircle2 /> Specification and policy hashes</li><li><CheckCircle2 /> Fixed treasury recipient</li></ul></div><div className="glass card"><span className="kicker">Need help?</span><h3>Write verifiable criteria</h3><p className="muted">Prefer “CI shows all tests pass at commit X” over “the implementation is high quality.”</p></div></aside></div>
  </div>;
}
