import { WorkifyError } from "./errors";

export interface GenLayerReceipt {
  statusName?: string;
  status_name?: string;
  status?: string | number;
  resultName?: string;
  txExecutionResultName?: string;
  executionResultName?: string;
  txExecutionResult?: string | number;
  executionResult?: string | number;
  consensus_data?: { leader_receipt?: Array<{ execution_result?: string; result?: { status?: string }; genvm_result?: { error_description?: string | null } }> };
}

export function classifyGenLayerReceipt(receipt: GenLayerReceipt): "FINALIZED" | "UNDETERMINED" | "PENDING" {
  const rawStatus = receipt.statusName ?? receipt.status_name ?? receipt.status;
  const status = rawStatus === 5 || rawStatus === "5" ? "ACCEPTED" : rawStatus === 6 || rawStatus === "6" ? "UNDETERMINED" : rawStatus === 7 || rawStatus === "7" ? "FINALIZED" : String(rawStatus ?? "").toUpperCase();
  if (status.includes("UNDETERMINED")) return "UNDETERMINED";
  if (!status.includes("FINALIZED")) return "PENDING";
  const leader = receipt.consensus_data?.leader_receipt?.[0];
  const rawExecution = receipt.txExecutionResultName ?? receipt.executionResultName ?? receipt.txExecutionResult ?? receipt.executionResult;
  const executionSucceeded =
    String(rawExecution ?? "").toUpperCase() === "FINISHED_WITH_RETURN" ||
    rawExecution === 1 || rawExecution === "1" ||
    (leader?.execution_result === "SUCCESS" && leader.result?.status === "return");
  if (!executionSucceeded) {
    throw new WorkifyError("GENLAYER_EXECUTION_ERROR", leader?.genvm_result?.error_description || "Finalized GenLayer execution failed");
  }
  return "FINALIZED";
}
