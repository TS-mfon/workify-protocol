import { createClient } from "genlayer-js";
import { encodeFunctionData, keccak256, stringToHex, type Hex } from "viem";
import { acquireLease, getDatabase } from "./mongodb";
import { classifyGenLayerReceipt } from "./receipts";
import { estimate7710Transaction, getRelayerStatus, send7710Transaction, type Delegation7710 } from "./oneshot";
import { WorkifyError } from "./errors";
import { signOutcomeAttestation, signVerdictAttestation } from "./attestation";

const escrowAbi = [
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "refundExpiredJob", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "expireUnfundedAppeal", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "importFinalVerdict", stateMutability: "nonpayable", inputs: [
    { name: "verdict", type: "tuple", components: [
      { name: "jobId", type: "bytes32" }, { name: "verifierId", type: "bytes32" },
      { name: "genlayerTxHash", type: "bytes32" }, { name: "attempt", type: "uint8" },
      { name: "specificationHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" },
      { name: "policyHash", type: "bytes32" }, { name: "decision", type: "uint8" },
      { name: "payoutBps", type: "uint16" }, { name: "resultHash", type: "bytes32" },
      { name: "nonce", type: "uint256" }, { name: "appeal", type: "bool" },
    ] }, { name: "signature", type: "bytes" },
  ], outputs: [] },
  { type: "function", name: "recordAttemptOutcome", stateMutability: "nonpayable", inputs: [
    { name: "outcome", type: "tuple", components: [
      { name: "jobId", type: "bytes32" }, { name: "verifierId", type: "bytes32" },
      { name: "genlayerTxHash", type: "bytes32" }, { name: "attempt", type: "uint8" },
      { name: "evidenceHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" },
      { name: "outcome", type: "uint8" }, { name: "nonce", type: "uint256" },
      { name: "appeal", type: "bool" },
    ] }, { name: "signature", type: "bytes" },
  ], outputs: [] },
] as const;

const decisionCode: Record<string, number> = { PASS: 1, FAIL: 2, PARTIAL: 3, UNVERIFIABLE: 4 };
const bytes32 = (value: string) => (value.startsWith("0x") ? value : `0x${value}`) as Hex;

function envDelegations(): Delegation7710[] {
  const raw = process.env.ONESHOT_PERMISSION_CONTEXT_JSON;
  if (!raw) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "ONESHOT_PERMISSION_CONTEXT_JSON is not configured");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "Invalid ERC-7710 permission context");
  return parsed;
}

export async function runAutomationBatch(limit = 20) {
  if (!(await acquireLease("automation:global"))) return { skipped: "lease-held", processed: 0 };
  const db = await getDatabase();
  const intents = await db.collection("relay_intents").find({ status: { $in: ["PENDING", "SUBMITTED"] } }).sort({ createdAt: 1 }).limit(limit).toArray();
  let processed = 0;
  for (const intent of intents) {
    try {
      if (intent.status === "SUBMITTED" && intent.taskId) {
        const status = await getRelayerStatus(intent.taskId);
        await db.collection("relay_intents").updateOne({ _id: intent._id }, { $set: { relayerStatus: status, updatedAt: new Date() } });
        processed += 1;
        continue;
      }
      let classification: "FINALIZED" | "UNDETERMINED" | "PENDING" | undefined;
      if (intent.genlayerTxHash) {
        const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL;
        if (!rpcUrl) throw new WorkifyError("GENLAYER_PREFLIGHT", "GenLayer RPC is not configured");
        const receipt = await createClient({ endpoint: rpcUrl }).getTransactionReceipt({ hash: intent.genlayerTxHash as Hex });
        classification = classifyGenLayerReceipt(receipt as never);
        if (classification === "PENDING") continue;
      }
      const escrow = process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS as `0x${string}` | undefined;
      const from = process.env.BASE_AUTOMATION_ADDRESS as `0x${string}` | undefined;
      if (!escrow || !from) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "Base automation addresses are not configured");
      const action = String(intent.action);
      let data: Hex;
      if (action === "importVerdict") {
        if (classification === "UNDETERMINED") {
          const outcome = {
            jobId: intent.jobId as Hex,
            chainId: 84532n,
            escrow,
            verifierId: keccak256(stringToHex(String(intent.verifierAddress).toLowerCase())),
            genlayerTxHash: intent.genlayerTxHash as Hex,
            attempt: Number(intent.attempt),
            evidenceHash: bytes32(String(intent.evidenceHash)),
            policyHash: keccak256(stringToHex(String(intent.policyVersion))),
            outcome: 1,
            nonce: BigInt(String(intent.nonce)),
            appeal: Boolean(intent.appeal),
          };
          const signature = await signOutcomeAttestation(outcome, escrow);
          data = encodeFunctionData({ abi: escrowAbi, functionName: "recordAttemptOutcome", args: [outcome, signature] });
        } else {
          const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL!;
          const raw = await createClient({ endpoint: rpcUrl }).readContract({
            address: intent.verifierAddress as `0x${string}`,
            functionName: "get_verdict",
            args: [intent.jobId, Number(intent.attempt), Boolean(intent.appeal)] as never[],
            jsonSafeReturn: true,
          });
          const verdict = JSON.parse(String(raw));
          const decision = decisionCode[String(verdict.decision)];
          if (!decision) throw new WorkifyError("ATTESTATION_INVALID", "Verifier returned an unsupported decision");
          const message = {
            jobId: intent.jobId as Hex,
            chainId: 84532n,
            escrow,
            verifierId: keccak256(stringToHex(String(intent.verifierAddress).toLowerCase())),
            genlayerTxHash: intent.genlayerTxHash as Hex,
            attempt: Number(intent.attempt),
            specificationHash: bytes32(String(verdict.specification_hash)),
            evidenceHash: bytes32(String(verdict.evidence_root)),
            policyHash: keccak256(stringToHex(String(verdict.policy_version))),
            decision,
            payoutBps: Number(verdict.payout_bps),
            resultHash: bytes32(String(verdict.result_hash)),
            nonce: BigInt(String(intent.nonce)),
            appeal: Boolean(intent.appeal),
          };
          const signature = await signVerdictAttestation(message, escrow);
          data = encodeFunctionData({ abi: escrowAbi, functionName: "importFinalVerdict", args: [message, signature] });
        }
      } else if ((["settle", "refundExpiredJob", "expireUnfundedAppeal"] as string[]).includes(action)) {
        data = encodeFunctionData({ abi: escrowAbi, functionName: action as "settle", args: [intent.jobId as Hex] });
      } else {
        throw new WorkifyError("RELAY_SUBMISSION_FAILED", "Unsupported automation action");
      }
      const delegationSecret = process.env.ONESHOT_DELEGATION_SECRET;
      const payload = {
        chainId: "84532",
        transactions: [{ permissionContext: envDelegations(), executions: [{ target: escrow, value: "0", data }] }],
        memo: `Workify ${action} ${String(intent.jobId)}`.slice(0, 256),
        ...(delegationSecret ? { delegationSecret } : {}),
      };
      const estimate = await estimate7710Transaction(payload);
      const context = (estimate as { context?: string }).context;
      const taskId = await send7710Transaction({ ...payload, ...(context ? { context } : {}) });
      await db.collection("relay_intents").updateOne(
        { _id: intent._id },
        { $set: { status: "SUBMITTED", taskId, estimate, updatedAt: new Date() }, $inc: { attempts: 1 } },
      );
      processed += 1;
    } catch (error) {
      await db.collection("relay_intents").updateOne(
        { _id: intent._id },
        { $set: { status: error instanceof WorkifyError && error.retryable ? "PENDING" : "ERROR", error: error instanceof Error ? error.message : "Unknown error", updatedAt: new Date() }, $inc: { attempts: 1 } },
      );
    }
  }
  return { processed };
}
