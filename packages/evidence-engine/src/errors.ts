export type WorkifyErrorCode =
  | "USER_INPUT"
  | "AUTHORIZATION"
  | "INSUFFICIENT_USDC"
  | "INSUFFICIENT_GEN"
  | "EVIDENCE_INVALID"
  | "EVIDENCE_UNAVAILABLE"
  | "GITHUB_RATE_LIMITED"
  | "GENLAYER_PREFLIGHT"
  | "GENLAYER_UNDETERMINED"
  | "GENLAYER_EXECUTION_ERROR"
  | "GENLAYER_TIMEOUT"
  | "ATTESTATION_INVALID"
  | "RELAY_SUBMISSION_FAILED"
  | "RELAY_STATUS_UNKNOWN"
  | "BASE_REVERT"
  | "DATABASE_TRANSIENT"
  | "DUPLICATE_SUBMISSION"
  | "AUTOMATION_LEASE_CONFLICT";

export class WorkifyError extends Error {
  constructor(
    public readonly code: WorkifyErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkifyError";
  }
}
