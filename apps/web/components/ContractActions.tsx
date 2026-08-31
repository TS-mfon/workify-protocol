"use client";

import { useState } from "react";
import { encodeFunctionData, parseEther } from "viem";
import { chains, createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import { WalletButton } from "./WalletButton";

type Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
declare global { interface Window { ethereum?: Provider } }

const escrow = process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS as `0x${string}` | undefined;
const treasury = (process.env.NEXT_PUBLIC_GENLAYER_TREASURY_ADDRESS || process.env.NEXT_PUBLIC_GEN_TREASURY_ADDRESS || "0xe11e888CD716b7fBd36442746Ea0C3A9f1d115B3") as `0x${string}`;
const base = [{ type: "function", name: "submitOrReplaceDelivery", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }], outputs: [] }, { type: "function", name: "lockDelivery", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] }, { type: "function", name: "openAppealIntent", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] }, { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] }] as const;

async function switchChain(provider: Provider, chainId: string, params: Record<string, unknown>) {
  await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] }).catch(() => provider.request({ method: "wallet_addEthereumChain", params: [params] }));
}

async function genLayerClient(account: `0x${string}`) {
  const client = createClient({ chain: chains.testnetBradbury as never, account, provider: window.ethereum });
  await client.connect("testnetBradbury");
  return client;
}

export function DeliveryAction({ jobId }: { jobId: `0x${string}` }) {
  const [account, setAccount] = useState<`0x${string}`>(); const [status, setStatus] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); try { if (!account || !window.ethereum || !escrow) throw new Error("Connect a Base Sepolia wallet first"); const data = new FormData(event.currentTarget); setStatus("Preparing immutable evidence manifest…"); const prepared = await fetch("/api/evidence/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId, deliveryVersion: Number(data.get("deliveryVersion") || 1), artifacts: [{ id: "DELIVERY-01", type: "DOCUMENT", url: String(data.get("url")) }] }) }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; }); setStatus("Submitting evidence hash…"); await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: account, to: escrow, data: encodeFunctionData({ abi: base, functionName: "submitOrReplaceDelivery", args: [jobId, prepared.evidenceHash] }) }] }); setStatus("Delivery submitted. Locking delivery…"); await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: account, to: escrow, data: encodeFunctionData({ abi: base, functionName: "lockDelivery", args: [jobId] }) }] }); setStatus("Delivery locked. Fund verification from the Verification page."); } catch (error) { setStatus(error instanceof Error ? error.message : "Delivery transaction failed"); } }
  return <form className="glass card form" style={{ marginTop: 28 }} onSubmit={submit}><WalletButton onAccount={setAccount} /><div className="field"><label>Public delivery URL</label><input name="url" type="url" required placeholder="https://github.com/owner/repo/pull/123" /></div><div className="field"><label>Delivery version</label><input name="deliveryVersion" type="number" min="1" defaultValue="1" /></div><button className="button" type="submit">Prepare and lock evidence</button>{status && <p className="muted">{status}</p>}</form>;
}

export function VerificationAction({ jobId, attempt = 1 }: { jobId: `0x${string}`; attempt?: number }) {
  const [account, setAccount] = useState<`0x${string}`>(); const [status, setStatus] = useState("");
  async function fund() { try { if (!account || !window.ethereum || !treasury) throw new Error("Connect a GenLayer wallet first"); const client = await genLayerClient(account); setStatus("Funding exactly 0.1 GEN…"); const tx = await client.writeContract({ address: treasury, functionName: "fund_verification", args: [jobId, attempt], value: parseEther("0.1") }); const receipt = await client.waitForTransactionReceipt({ hash: tx, status: TransactionStatus.ACCEPTED }); if (receipt.resultName !== "AGREE" || receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") throw new Error("The GEN fee transaction did not reach validator agreement"); setStatus(`Fee accepted: ${tx}. Adjudication remains blocked until this payment reaches finality.`); } catch (error) { setStatus(error instanceof Error ? error.message : "Verification funding failed"); } }
  return <div className="glass card" style={{ marginTop: 28 }}><WalletButton onAccount={setAccount} /><span className="status"><span className="pulse" /> Attempt {attempt} of 3</span><h2>0.1 GEN</h2><p className="muted">The exact fee is charged to Workify’s GenLayer treasury. A timeout is undetermined and can be retried, up to three total attempts.</p><button className="button" type="button" onClick={fund}>Fund and request verification</button>{status && <p className="muted">{status}</p>}</div>;
}

export function AppealAction({ jobId }: { jobId: `0x${string}` }) {
  const [account, setAccount] = useState<`0x${string}`>(); const [status, setStatus] = useState("");
  async function appeal() { try { if (!account || !window.ethereum || !escrow || !treasury) throw new Error("Connect a wallet first"); await switchChain(window.ethereum, "0x14a34", { chainId: "0x14a34", chainName: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://sepolia.base.org"] }); setStatus("Opening appeal intent…"); await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: account, to: escrow, data: encodeFunctionData({ abi: base, functionName: "openAppealIntent", args: [jobId] }) }] }); const client = await genLayerClient(account); setStatus("Funding exactly 1 GEN appeal bond…"); const tx = await client.writeContract({ address: treasury, functionName: "fund_appeal", args: [jobId], value: parseEther("1") }); const receipt = await client.waitForTransactionReceipt({ hash: tx, status: TransactionStatus.ACCEPTED }); if (receipt.resultName !== "AGREE" || receipt.txExecutionResultName !== "FINISHED_WITH_RETURN") throw new Error("The appeal fee did not reach validator agreement"); setStatus(`Appeal fee accepted: ${tx}. Appeal adjudication waits for final payment confirmation.`); } catch (error) { setStatus(error instanceof Error ? error.message : "Appeal failed"); } }
  return <div className="glass card form" style={{ marginTop: 28 }}><WalletButton onAccount={setAccount} /><div className="field"><label>Appeal statement</label><textarea rows={6} placeholder="Identify the criterion or evidence that was misinterpreted" /></div><p className="muted">Appeals must begin within five minutes and cost exactly 1 GEN. The original evidence remains immutable.</p><button className="button" type="button" onClick={appeal}>Open appeal and fund 1 GEN</button>{status && <p className="muted">{status}</p>}</div>;
}

export function SettleAction({ jobId }: { jobId: `0x${string}` }) { const [status, setStatus] = useState(""); return <button className="button secondary" type="button" onClick={async () => { try { if (!window.ethereum || !escrow) throw new Error("Connect a Base Sepolia wallet first"); const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as `0x${string}`[]; const tx = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: accounts[0], to: escrow, data: encodeFunctionData({ abi: base, functionName: "settle", args: [jobId] }) }] }); setStatus(`Settlement submitted: ${String(tx)}`); } catch (error) { setStatus(error instanceof Error ? error.message : "Settlement failed"); } }}>{status || "Settle when eligible"}</button>; }
