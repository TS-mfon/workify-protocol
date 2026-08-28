import { WorkifyError } from "./errors";

export interface GenLayerReceipt {
  statusName?: string;
  status?: string | number;
  consensus_data?: { leader_receipt?: Array<{ execution_result?: string; result?: { status?: string }; genvm_result?: { error_description?: string | null } }> };
}

export function classifyGenLayerReceipt(receipt: GenLayerReceipt): "FINALIZED" | "UNDETERMINED" | "PENDING" {
  const status = String(receipt.statusName ?? receipt.status ?? "").toUpperCase();
  if (status.includes("UNDETERMINED")) return "UNDETERMINED";
  if (!status.includes("FINALIZED")) return "PENDING";
  const leader = receipt.consensus_data?.leader_receipt?.[0];
  if (leader?.execution_result !== "SUCCESS" || leader.result?.status !== "return") {
    throw new WorkifyError("GENLAYER_EXECUTION_ERROR", leader?.genvm_result?.error_description || "Finalized GenLayer execution failed");
  }
  return "FINALIZED";
}
