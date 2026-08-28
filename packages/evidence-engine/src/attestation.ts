import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

export async function signVerdictAttestation(message: Record<string, unknown>, escrow: `0x${string}`) {
  const key = process.env.VERDICT_ATTESTOR_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("VERDICT_ATTESTOR_PRIVATE_KEY is not configured");
  const account = privateKeyToAccount(key);
  return account.signTypedData({
    domain: { name: "Workify", version: "1", chainId: 84532, verifyingContract: escrow },
    primaryType: "Verdict",
    types: {
      Verdict: [
        { name: "jobId", type: "bytes32" }, { name: "chainId", type: "uint256" },
        { name: "escrow", type: "address" }, { name: "verifierId", type: "bytes32" },
        { name: "genlayerTxHash", type: "bytes32" }, { name: "attempt", type: "uint8" },
        { name: "specificationHash", type: "bytes32" }, { name: "evidenceHash", type: "bytes32" },
        { name: "policyHash", type: "bytes32" }, { name: "decision", type: "uint8" },
        { name: "payoutBps", type: "uint16" }, { name: "resultHash", type: "bytes32" },
        { name: "nonce", type: "uint256" }, { name: "appeal", type: "bool" },
      ],
    },
    message: message as any,
  });
}

export async function signOutcomeAttestation(message: Record<string, unknown>, escrow: `0x${string}`) {
  const key = process.env.VERDICT_ATTESTOR_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("VERDICT_ATTESTOR_PRIVATE_KEY is not configured");
  const account = privateKeyToAccount(key);
  return account.signTypedData({
    domain: { name: "Workify", version: "1", chainId: 84532, verifyingContract: escrow },
    primaryType: "AttemptOutcome",
    types: {
      AttemptOutcome: [
        { name: "jobId", type: "bytes32" }, { name: "chainId", type: "uint256" },
        { name: "escrow", type: "address" }, { name: "verifierId", type: "bytes32" },
        { name: "genlayerTxHash", type: "bytes32" }, { name: "attempt", type: "uint8" },
        { name: "evidenceHash", type: "bytes32" }, { name: "policyHash", type: "bytes32" },
        { name: "outcome", type: "uint8" }, { name: "nonce", type: "uint256" },
        { name: "appeal", type: "bool" },
      ],
    },
    message: message as any,
  });
}
