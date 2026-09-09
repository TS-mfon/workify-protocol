import { createReadOnlyGenLayerClient, getGenLayerNetworkConfig, publicError } from "@workify/evidence-engine";
import { NextResponse } from "next/server";
import { z } from "zod";

const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/u);
const networkSchema = z.enum(["bradbury", "studionet"]).default("studionet");

function htmlOrSdkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/unexpected token ['"]?</iu.test(message) || /<!doctype|<html/iu.test(message)) {
    return "The GenLayer RPC returned an HTML error page. Your review transaction was not resent; retry status shortly.";
  }
  if (/failed to fetch|network|fetch/iu.test(message)) {
    return "GenLayer is temporarily unavailable. Your review transaction was not resent; retry status shortly.";
  }
  return "GenLayer transaction status is temporarily unavailable. Your review transaction was not resent.";
}

function normalizeStatus(transaction: Record<string, unknown> | null) {
  if (!transaction) return { status: "NOT_FOUND", statusName: null, consensus: null, execution: null };
  const statusName = String(transaction.statusName || transaction.status || "PENDING").toUpperCase();
  const resultName = transaction.resultName ? String(transaction.resultName).toUpperCase() : null;
  const executionName = transaction.txExecutionResultName ? String(transaction.txExecutionResultName).toUpperCase() : null;
  const terminal = ["FINALIZED", "CANCELED", "UNDETERMINED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"].includes(statusName);
  const normalizedStatus = ["VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"].includes(statusName) ? "UNDETERMINED" : statusName;
  return {
    status: terminal ? normalizedStatus : statusName === "ACCEPTED" ? "ACCEPTED" : "PENDING",
    statusName,
    consensus: resultName,
    execution: executionName,
  };
}

export async function GET(request: Request, context: { params: Promise<{ txHash: string }> }) {
  try {
    const { txHash } = await context.params;
    const hash = hashSchema.parse(txHash);
    const params = new URL(request.url).searchParams;
    const network = networkSchema.parse(params.get("network") || "studionet");
    const jobId = params.get("jobId");
    const attempt = Number(params.get("attempt") || "0");
    const appeal = params.get("appeal") === "true";
    const config = getGenLayerNetworkConfig(network);
    const client = createReadOnlyGenLayerClient(network);
    const transaction = await client.getTransaction({ hash: hash as never }) as unknown as Record<string, unknown> | null;
    const normalized = normalizeStatus(transaction);
    let verdict: unknown = null;
    let verdictError: string | null = null;
    if (normalized.status === "FINALIZED" && jobId && /^0x[a-fA-F0-9]{64}$/u.test(jobId) && attempt >= 1 && attempt <= 3 && transaction?.recipient) {
      try {
        verdict = await client.readContract({
          address: String(transaction.recipient) as `0x${string}`,
          functionName: "get_verdict",
          args: [jobId, attempt, appeal] as never[],
          jsonSafeReturn: true,
        });
      } catch (error) {
        verdictError = error instanceof Error ? error.message : "The finalized verdict is still propagating.";
      }
    }
    return NextResponse.json({
      transactionHash: hash,
      network,
      verifierAddress: transaction?.recipient || null,
      ...normalized,
      verdict,
      verdictError,
      error: transaction?.txExecutionResultName === "FINISHED_WITH_ERROR" ? String(transaction.txExecutionError || transaction.txExecutionResult || "GenLayer execution failed") : null,
      retryable: normalized.status === "PENDING" || normalized.status === "NOT_FOUND",
      explorerUrl: `${config.explorer}/tx/${hash}`,
      checkedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const parsed = publicError(error, htmlOrSdkError(error));
    return NextResponse.json({ ...parsed, retryable: true, status: "PENDING", checkedAt: new Date().toISOString() }, { status: parsed.status, headers: { "cache-control": "no-store" } });
  }
}
