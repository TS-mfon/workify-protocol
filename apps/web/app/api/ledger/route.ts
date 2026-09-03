import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { publicNetworkConfig } from "@/lib/network";

export const dynamic = "force-dynamic";

const addressPattern = /^0x[a-fA-F0-9]{40}$/u;
const jobPattern = /^0x[a-fA-F0-9]{64}$/u;
const jobCreated = parseAbiItem("event JobCreated(bytes32 indexed jobId,address indexed client,address indexed worker,uint256 reward,uint64 deliveryDeadline,bytes32 specificationHash,bytes32 policyHash)");
const events = [
  ["JobCreated", jobCreated],
  ["DeliverySubmitted", parseAbiItem("event DeliverySubmitted(bytes32 indexed jobId,uint32 version,bytes32 evidenceHash)")],
  ["DeliveryLocked", parseAbiItem("event DeliveryLocked(bytes32 indexed jobId,bytes32 evidenceHash)")],
  ["VerificationRequested", parseAbiItem("event VerificationRequested(bytes32 indexed jobId,uint8 attempt,bool appeal)")],
  ["AttemptUndetermined", parseAbiItem("event AttemptUndetermined(bytes32 indexed jobId,bytes32 indexed verifierId,bytes32 indexed genlayerTxHash,uint8 attempt,bool appeal,uint64 retryDeadline)")],
  ["VerdictImported", parseAbiItem("event VerdictImported(bytes32 indexed jobId,bytes32 indexed verifierId,bytes32 indexed genlayerTxHash,uint8 attempt,uint8 decision,uint16 payoutBps,bytes32 resultHash,bool appeal)")],
  ["AppealOpened", parseAbiItem("event AppealOpened(bytes32 indexed jobId,address indexed appellant,uint64 fundingDeadline)")],
  ["AppealFunded", parseAbiItem("event AppealFunded(bytes32 indexed jobId,address indexed appellant,bytes32 genlayerPaymentTxHash)")],
  ["JobSettled", parseAbiItem("event JobSettled(bytes32 indexed jobId,uint256 workerAmount,uint256 clientAmount,uint256 protocolFee)")],
] as const;
const jobComponents = [
  { name: "client", type: "address" }, { name: "worker", type: "address" }, { name: "reward", type: "uint128" },
  { name: "createdAt", type: "uint64" }, { name: "deliveryDeadline", type: "uint64" }, { name: "retryDeadline", type: "uint64" },
  { name: "verdictAt", type: "uint64" }, { name: "appealDeadline", type: "uint64" }, { name: "appealFundingDeadline", type: "uint64" },
  { name: "deliveryVersion", type: "uint32" }, { name: "attempts", type: "uint8" }, { name: "appealAttempts", type: "uint8" },
  { name: "payoutBps", type: "uint16" }, { name: "status", type: "uint8" }, { name: "decision", type: "uint8" },
  { name: "specificationHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" },
  { name: "resultHash", type: "bytes32" }, { name: "verifierId", type: "bytes32" }, { name: "genlayerTxHash", type: "bytes32" },
  { name: "appealPaymentTxHash", type: "bytes32" }, { name: "appellant", type: "address" }, { name: "verdictAttempt", type: "uint8" },
  { name: "verdictAppeal", type: "bool" }, { name: "appealFunded", type: "bool" },
] as const;
const escrowAbi = [{ type: "function", name: "getJob", stateMutability: "view", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [{ name: "", type: "tuple", components: jobComponents }] }] as const;
const statuses = ["NONE", "AWAITING_DELIVERY", "DELIVERY_LOCKED", "VERIFYING", "RETRY_WINDOW", "APPEAL_WINDOW", "APPEAL_FUNDING", "APPEAL_VERIFYING", "SETTLEABLE", "SETTLED", "REFUNDED"] as const;

function settings() {
  const network = publicNetworkConfig();
  return {
    address: network.escrow,
    fromBlock: network.fromBlock,
    rpc: network.baseRpc,
  };
}

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
}

export async function GET(request: Request) {
  const config = settings();
  const query = new URL(request.url).searchParams;
  const account = query.get("address");
  const jobId = query.get("jobId");
  if (account && !addressPattern.test(account)) return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  if (jobId && !jobPattern.test(jobId)) return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  try {
    const base = createPublicClient({ chain: baseSepolia, transport: http(config.rpc) });
    const created = await base.getLogs({ address: config.address, event: jobCreated, fromBlock: config.fromBlock, toBlock: "latest" });
    const selected = created.filter((log) => {
      if (jobId && log.args.jobId?.toLowerCase() !== jobId.toLowerCase()) return false;
      if (!account) return true;
      return log.args.client?.toLowerCase() === account.toLowerCase() || log.args.worker?.toLowerCase() === account.toLowerCase();
    });
    const jobs = await Promise.all(selected.map(async (log) => {
      const current = await base.readContract({ address: config.address, abi: escrowAbi, functionName: "getJob", args: [log.args.jobId as Hex] });
      return { jobId: log.args.jobId, creationTransactionHash: log.transactionHash, createdBlock: log.blockNumber, status: statuses[Number(current.status)] ?? "UNKNOWN", job: current };
    }));
    if (jobId) return jobs[0] ? NextResponse.json(json(jobs[0])) : NextResponse.json({ error: "Job not found" }, { status: 404 });
    const activity = account ? [] : await Promise.all(events.slice(1).map(async ([name, event]) => {
      const logs = await base.getLogs({ address: config.address, event, fromBlock: config.fromBlock, toBlock: "latest" });
      return logs.map((log) => ({ name, transactionHash: log.transactionHash, blockNumber: log.blockNumber, args: log.args }));
    }));
    return NextResponse.json(json({ jobs, activity: activity.flat().sort((left, right) => Number(right.blockNumber - left.blockNumber)).slice(0, 100), escrow: config.address }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Base ledger read failed" }, { status: 503 });
  }
}
