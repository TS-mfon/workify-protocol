import { describe, expect, it } from "vitest";
import { verdictSchema } from "../src/index";

const base = {
  score: 90,
  confidence: 88,
  criteria: [],
  criticalFailures: [],
  missingEvidence: [],
  evidenceRoot: "a".repeat(64),
  specificationHash: "b".repeat(64),
  policyVersion: "github-software-v1.0",
  attempt: 1,
  resultHash: "c".repeat(64),
  finalReasoning: "Evidence supports the bounded verdict.",
};

describe("verdict schema", () => {
  it("accepts deterministic decision payout mappings", () => {
    expect(verdictSchema.parse({ ...base, decision: "PASS", payoutBps: 10_000 })).toBeTruthy();
    expect(verdictSchema.parse({ ...base, decision: "FAIL", payoutBps: 0 })).toBeTruthy();
    expect(verdictSchema.parse({ ...base, decision: "PARTIAL", payoutBps: 5_000 })).toBeTruthy();
  });

  it("rejects contradictory payout mappings", () => {
    expect(() => verdictSchema.parse({ ...base, decision: "PASS", payoutBps: 9_000 })).toThrow();
    expect(() => verdictSchema.parse({ ...base, decision: "UNVERIFIABLE", payoutBps: 1 })).toThrow();
  });
});
