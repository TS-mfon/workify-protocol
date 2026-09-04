import "server-only";

import { chains, createClient as createGenLayerClient } from "genlayer-js";
import { createPublicClient, http, keccak256, parseAbiItem, stringToHex, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { getDatabase } from "@workify/evidence-engine";
import { getLogsInChunks, publicNetworkConfig } from "./network";

export type ExplorerDecision = "PASS" | "FAIL" | "PARTIAL" | "UNVERIFIABLE";
export type ExplorerCriterion = {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  decision: ExplorerDecision;
  evidence_ids: string[];
  rationale: string;
};
export type ExplorerVerdict = {
  attempt: number;
  appeal: boolean;
  decision: ExplorerDecision;
  score: number;
  confidence: number;
  payout_bps: number;
  criteria: ExplorerCriterion[];
  critical_failures: string[];
  missing_evidence: string[];
  final_rationale: string;
  specification_hash: string;
  evidence_root: string;
  policy_version: string;
  result_hash: string;
};

const jobCreatedEvent = parseAbiItem("event JobCreated(bytes32 indexed jobId,address indexed client,address indexed worker,uint256 reward,uint64 deliveryDeadline,bytes32 specificationHash,bytes32 policyHash)");
const jobSettledEvent = parseAbiItem("event JobSettled(bytes32 indexed jobId,uint256 workerAmount,uint256 clientAmount,uint256 protocolFee)");
const verdictImportedEvent = parseAbiItem("event VerdictImported(bytes32 indexed jobId,bytes32 indexed verifierId,bytes32 indexed genlayerTxHash,uint8 attempt,uint8 decision,uint16 payoutBps,bytes32 resultHash,bool appeal)");
const appealOpenedEvent = parseAbiItem("event AppealOpened(bytes32 indexed jobId,address indexed appellant,uint64 fundingDeadline)");
const appealFundedEvent = parseAbiItem("event AppealFunded(bytes32 indexed jobId,address indexed appellant,bytes32 genlayerPaymentTxHash)");
const verificationRequestedEvent = parseAbiItem("event VerificationRequested(bytes32 indexed jobId,uint8 attempt,bool appeal)");

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

const statusNames = ["NONE", "AWAITING_DELIVERY", "DELIVERY_LOCKED", "VERIFYING", "RETRY_WINDOW", "APPEAL_WINDOW", "APPEAL_FUNDING", "APPEAL_VERIFYING", "SETTLEABLE", "SETTLED", "REFUNDED"] as const;
const policyLabels: Record<string, string> = {
  GITHUB_SOFTWARE: "GitHub Software",
  WEB_APPLICATION: "Web Application",
  RESEARCH_DATA: "Research & Data",
  CONTENT_DOCUMENT: "Content & Document",
  DESIGN_CREATIVE: "Design & Creative",
};

function config() {
  const network = publicNetworkConfig();
  const verifiers = [
    ["GITHUB_SOFTWARE", network.verifiers.GITHUB_SOFTWARE],
    ["WEB_APPLICATION", network.verifiers.WEB_APPLICATION],
    ["RESEARCH_DATA", network.verifiers.RESEARCH_DATA],
    ["CONTENT_DOCUMENT", network.verifiers.CONTENT_DOCUMENT],
    ["DESIGN_CREATIVE", network.verifiers.DESIGN_CREATIVE],
  ] as Array<[string, string]>;
  return { escrow: network.escrow, fromBlock: network.fromBlock, baseRpc: network.baseRpc, genlayerRpc: network.genlayerRpc, verifiers };
}

function verifierForId(verifiers: Array<[string, string]>, verifierId: Hex) {
  return verifiers.find(([, address]) => keccak256(stringToHex(address.toLowerCase())) === verifierId);
}

function normalizeHash(value: string) {
  return value.toLowerCase().replace(/^0x/u, "");
}

async function loadCase(jobId: Hex, creation?: { transactionHash: Hex; blockNumber: bigint }) {
  const settings = config();
  if (!settings) return null;
  const base = createPublicClient({ chain: baseSepolia, transport: http(settings.baseRpc) });
  const job = await base.readContract({ address: settings.escrow, abi: escrowAbi, functionName: "getJob", args: [jobId] });
  if (![9, 10].includes(Number(job.status)) || job.verifierId === `0x${"00".repeat(32)}`) return null;
  const verifier = verifierForId(settings.verifiers, job.verifierId);
  if (!verifier || !verifier[1]) return null;

  const db = await getDatabase();
  const [specificationRecord, evidenceRecord, settlementLogs, verdictLogs, appealLogs, appealFundingLogs, requestLogs] = await Promise.all([
    db.collection("specifications").findOne({ _id: normalizeHash(job.specificationHash) as never }),
    db.collection("evidence_manifests").findOne({ _id: normalizeHash(job.evidenceHash) as never }),
    getLogsInChunks(settings.fromBlock, (fromBlock, toBlock) => base.getLogs({ address: settings.escrow, event: jobSettledEvent, args: { jobId }, fromBlock, toBlock }), () => base.getBlockNumber()),
    getLogsInChunks(settings.fromBlock, (fromBlock, toBlock) => base.getLogs({ address: settings.escrow, event: verdictImportedEvent, args: { jobId }, fromBlock, toBlock }), () => base.getBlockNumber()),
    getLogsInChunks(settings.fromBlock, (fromBlock, toBlock) => base.getLogs({ address: settings.escrow, event: appealOpenedEvent, args: { jobId }, fromBlock, toBlock }), () => base.getBlockNumber()),
    getLogsInChunks(settings.fromBlock, (fromBlock, toBlock) => base.getLogs({ address: settings.escrow, event: appealFundedEvent, args: { jobId }, fromBlock, toBlock }), () => base.getBlockNumber()),
    getLogsInChunks(settings.fromBlock, (fromBlock, toBlock) => base.getLogs({ address: settings.escrow, event: verificationRequestedEvent, args: { jobId }, fromBlock, toBlock }), () => base.getBlockNumber()),
  ]);
  if (!specificationRecord?.document || !evidenceRecord?.document) return null;

  const genlayer = createGenLayerClient({ chain: chains.testnetBradbury as never, endpoint: settings.genlayerRpc });
  const rawVerdict = await genlayer.readContract({
    address: verifier[1] as `0x${string}`,
    functionName: "get_verdict",
    args: [jobId, Number(job.verdictAttempt), Boolean(job.verdictAppeal)] as never[],
    jsonSafeReturn: true,
  });
  if (!rawVerdict) return null;
  const verdict = JSON.parse(String(rawVerdict)) as ExplorerVerdict;
  const genlayerReceipt = await genlayer.getTransaction({ hash: job.genlayerTxHash as never });
  const receiptRecord = genlayerReceipt as unknown as Record<string, unknown>;
  const settlement = settlementLogs.at(-1);
  const createdBlock = creation?.blockNumber ?? 0n;
  const createdTimestamp = createdBlock ? await base.getBlock({ blockNumber: createdBlock }).then((block) => Number(block.timestamp)) : Number(job.createdAt);

  return {
    jobId,
    escrowAddress: settings.escrow,
    policy: policyLabels[String(specificationRecord.document.workType)] || String(specificationRecord.document.workType),
    workType: String(specificationRecord.document.workType),
    verifierAddress: verifier[1],
    specification: specificationRecord.document,
    evidence: evidenceRecord.document,
    verdict,
    base: {
      status: statusNames[Number(job.status)] || "UNKNOWN",
      client: job.client,
      worker: job.worker,
      reward: job.reward.toString(),
      payoutBps: Number(job.payoutBps),
      createdAt: createdTimestamp,
      verdictAt: Number(job.verdictAt),
      appealDeadline: Number(job.appealDeadline),
      attempts: Number(job.attempts),
      appealAttempts: Number(job.appealAttempts),
      appealFunded: Boolean(job.appealFunded),
      appellant: job.appellant,
      creationTransactionHash: creation?.transactionHash || null,
      settlementTransactionHash: settlement?.transactionHash || null,
      settlement: settlement ? {
        workerAmount: settlement.args.workerAmount?.toString() || "0",
        clientAmount: settlement.args.clientAmount?.toString() || "0",
        protocolFee: settlement.args.protocolFee?.toString() || "0",
      } : null,
    },
    genlayer: {
      transactionHash: job.genlayerTxHash,
      status: String(receiptRecord.statusName || "UNKNOWN"),
      consensus: String(receiptRecord.resultName || "UNKNOWN"),
      execution: String(receiptRecord.txExecutionResultName || "UNKNOWN"),
      finality: String(receiptRecord.statusName || "UNKNOWN") === "FINALIZED",
      raw: JSON.parse(JSON.stringify(genlayerReceipt, (_, value) => typeof value === "bigint" ? value.toString() : value)),
    },
    timeline: [
      { label: "USDC escrowed and job created", chain: "Base", transactionHash: creation?.transactionHash || null, timestamp: createdTimestamp },
      ...requestLogs.map((log) => ({ label: `Verification attempt ${log.args.attempt}${log.args.appeal ? " (appeal)" : ""}`, chain: "Base", transactionHash: log.transactionHash, timestamp: null })),
      ...verdictLogs.map((log) => ({ label: `${log.args.appeal ? "Appeal" : "Initial"} verdict imported`, chain: "Base", transactionHash: log.transactionHash, timestamp: Number(job.verdictAt) })),
      ...appealLogs.map((log) => ({ label: "Appeal opened", chain: "Base", transactionHash: log.transactionHash, timestamp: null })),
      ...appealFundingLogs.map((log) => ({ label: "Appeal fee confirmed", chain: "Base", transactionHash: log.transactionHash, timestamp: null })),
      ...(settlement ? [{ label: "Escrow settled", chain: "Base", transactionHash: settlement.transactionHash, timestamp: null }] : []),
    ],
  };
}

export async function getResolvedCases() {
  const settings = config();
  if (!settings) return [];
  const base = createPublicClient({ chain: baseSepolia, transport: http(settings.baseRpc) });
  const logs = await getLogsInChunks(settings.fromBlock,
    (fromBlock, toBlock) => base.getLogs({ address: settings.escrow, event: jobCreatedEvent, fromBlock, toBlock }),
    () => base.getBlockNumber());
  const results = await Promise.allSettled(logs.map((log) => loadCase(log.args.jobId!, { transactionHash: log.transactionHash, blockNumber: log.blockNumber })));
  return results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []).sort((left, right) => right.base.createdAt - left.base.createdAt);
}

export async function getResolvedCase(jobId: string) {
  if (!/^0x[a-fA-F0-9]{64}$/u.test(jobId)) return null;
  const settings = config();
  if (!settings) return null;
  const base = createPublicClient({ chain: baseSepolia, transport: http(settings.baseRpc) });
  const logs = await getLogsInChunks(settings.fromBlock,
    (fromBlock, toBlock) => base.getLogs({ address: settings.escrow, event: jobCreatedEvent, args: { jobId: jobId as Hex }, fromBlock, toBlock }),
    () => base.getBlockNumber());
  const creation = logs.at(-1);
  if (!creation) return null;
  try {
    return await loadCase(jobId as Hex, { transactionHash: creation.transactionHash, blockNumber: creation.blockNumber });
  } catch {
    return null;
  }
}
