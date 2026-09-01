import { chains, createClient } from "genlayer-js";
import { keccak256, stringToHex, type Hex } from "viem";
import { acquireLease, getDatabase } from "./mongodb";
import { classifyGenLayerReceipt } from "./receipts";
import { executeBaseRelayAction, type BaseRelayAction, type BaseRelayParameters } from "./base-relay";
import { WorkifyError } from "./errors";
import { signOutcomeAttestation, signVerdictAttestation } from "./attestation";

const decisionCode: Record<string, number> = { PASS: 1, FAIL: 2, PARTIAL: 3, UNVERIFIABLE: 4 };
const bytes32 = (value: string) => (value.startsWith("0x") ? value : `0x${value}`) as Hex;

export async function runAutomationBatch(limit = 20) {
  if (!(await acquireLease("automation:global"))) return { skipped: "lease-held", processed: 0 };
  const db = await getDatabase();
  const intents = await db.collection("relay_intents").find({ status: "PENDING" }).sort({ createdAt: 1 }).limit(limit).toArray();
  let processed = 0;
  for (const intent of intents) {
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL;
      const genlayerClient = rpcUrl
        ? createClient({ chain: chains.testnetBradbury as never, endpoint: rpcUrl })
        : undefined;
      let classification: "FINALIZED" | "UNDETERMINED" | "PENDING" | undefined;
      if (intent.genlayerTxHash) {
        if (!genlayerClient) throw new WorkifyError("GENLAYER_PREFLIGHT", "GenLayer RPC is not configured");
        const receipt = await genlayerClient.getTransaction({ hash: intent.genlayerTxHash as never });
        classification = classifyGenLayerReceipt(receipt as never);
        if (classification === "PENDING") continue;
      }
      const escrow = process.env.NEXT_PUBLIC_WORK_ESCROW_ADDRESS as `0x${string}` | undefined;
      if (!escrow) throw new WorkifyError("RELAY_SUBMISSION_FAILED", "Base escrow address is not configured");
      let action = String(intent.action) as BaseRelayAction;
      let params: BaseRelayParameters;
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
          action = "recordAttemptOutcome";
          params = { outcome, signature };
        } else {
          if (!genlayerClient) throw new WorkifyError("GENLAYER_PREFLIGHT", "GenLayer RPC is not configured");
          const raw = await genlayerClient.readContract({
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
          params = { verdict: message, signature };
        }
      } else if ((["settle", "refundExpiredJob", "expireUnfundedAppeal"] as string[]).includes(action)) {
        params = {};
      } else {
        throw new WorkifyError("RELAY_SUBMISSION_FAILED", "Unsupported automation action");
      }
      const transaction = await executeBaseRelayAction(action, String(intent.jobId), params);
      await db.collection("relay_intents").updateOne(
        { _id: intent._id },
        { $set: {
          status: "CONFIRMED",
          transactionHash: transaction.transactionHash,
          signerAddress: transaction.signerAddress,
          blockNumber: transaction.blockNumber.toString(),
          submittedAt: new Date(),
          confirmedAt: new Date(),
          updatedAt: new Date(),
        }, $inc: { attempts: 1 } },
      );
      processed += 1;
    } catch (error) {
      await db.collection("relay_intents").updateOne(
        { _id: intent._id },
        { $set: {
          status: error instanceof WorkifyError && error.retryable && Number(intent.attempts || 0) < 2 ? "PENDING" : "FAILED",
          failureReason: error instanceof Error ? error.message : "Unknown error",
          updatedAt: new Date(),
        }, $inc: { attempts: 1 } },
      );
    }
  }
  return { processed };
}
