import { z } from "zod";
import { WorkifyError } from "./errors";

const rpcSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string(), data: z.unknown().optional() }).optional(),
});

export interface Delegation7710 {
  delegate: `0x${string}`;
  delegator: `0x${string}`;
  authority: string;
  caveats: Array<Record<string, unknown>>;
  salt: string;
  signature: string;
  [key: string]: unknown;
}

export interface Execution7710 {
  target: `0x${string}`;
  value: string;
  data: `0x${string}`;
}

export interface Send7710Params {
  chainId: string;
  transactions: Array<{ permissionContext: Delegation7710[]; executions: Execution7710[] }>;
  authorizationList?: Array<Record<string, unknown>>;
  context?: string;
  taskId?: `0x${string}`;
  destinationUrl?: string;
  memo?: string;
  delegationSecret?: string;
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const url = process.env.ONESHOT_RELAYER_URL || "https://relayer.1shotapi.dev/relayers";
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
  });
  if (!response.ok) {
    throw new WorkifyError("RELAY_SUBMISSION_FAILED", `1Shot relayer returned HTTP ${response.status}`, response.status >= 500);
  }
  const parsed = rpcSchema.parse(await response.json());
  if (parsed.error) {
    throw new WorkifyError("RELAY_SUBMISSION_FAILED", parsed.error.message, false, { code: parsed.error.code });
  }
  return parsed.result;
}

export async function getRelayerCapabilities(chainIds: string[]): Promise<unknown> {
  return rpc("relayer_getCapabilities", [chainIds]);
}

export async function estimate7710Transaction(payload: Send7710Params): Promise<unknown> {
  const { delegationSecret: _, ...estimatePayload } = payload;
  return rpc("relayer_estimate7710Transaction", [estimatePayload]);
}

export async function send7710Transaction(payload: Send7710Params): Promise<`0x${string}`> {
  const taskId = await rpc("relayer_send7710Transaction", [payload]);
  if (typeof taskId !== "string" || !/^0x[a-fA-F0-9]{64}$/u.test(taskId)) {
    throw new WorkifyError("RELAY_STATUS_UNKNOWN", "1Shot returned an invalid task ID");
  }
  return taskId as `0x${string}`;
}

export async function getRelayerStatus(taskId: `0x${string}`): Promise<unknown> {
  return rpc("relayer_getStatus", [taskId]);
}
