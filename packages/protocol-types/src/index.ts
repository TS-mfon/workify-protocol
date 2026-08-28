import { z } from "zod";

export const WORKIFY_VERSION = "1.0.0" as const;
export const BASE_SEPOLIA_CHAIN_ID = 84_532 as const;
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const TREASURY_OWNER = "0x5905c9Dea6Ae52AA0947D8F7F218263889eDfC4E" as const;
export const MIN_JOB_TERM_SECONDS = 15 * 60;
export const MAX_JOB_TERM_SECONDS = 30 * 24 * 60 * 60;
export const APPEAL_WINDOW_SECONDS = 5 * 60;
export const APPEAL_FUNDING_SECONDS = 30 * 60;
export const RETRY_WINDOW_SECONDS = 30 * 60;
export const MAX_VERIFICATION_ATTEMPTS = 3;
export const PLATFORM_FEE_BPS = 100;
export const BPS_DENOMINATOR = 10_000;
export const VERIFICATION_FEE_GEN = "0.1";
export const APPEAL_FEE_GEN = "1";

export const workTypeSchema = z.enum([
  "GITHUB_SOFTWARE",
  "WEB_APPLICATION",
  "RESEARCH_DATA",
  "CONTENT_DOCUMENT",
  "DESIGN_CREATIVE",
]);

export const decisionSchema = z.enum([
  "PASS",
  "FAIL",
  "PARTIAL",
  "UNVERIFIABLE",
]);

export const attemptOutcomeSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "FINALIZED",
  "UNDETERMINED",
  "ERROR",
]);

export const criterionSchema = z.object({
  id: z.string().min(1).max(64),
  requirement: z.string().min(1).max(2_000),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  verificationMethod: z.string().min(1).max(128),
  evidenceRequired: z.array(z.string().min(1).max(128)).max(12),
  passCondition: z.string().min(1).max(1_000),
  failureCondition: z.string().min(1).max(1_000),
});

export const workSpecificationSchema = z.object({
  version: z.literal(WORKIFY_VERSION),
  title: z.string().min(3).max(160),
  description: z.string().min(10).max(12_000),
  workType: workTypeSchema,
  deliverables: z.array(z.string().min(1).max(2_000)).min(1).max(30),
  criteria: z.array(criterionSchema).min(1).max(40),
  authorizedSources: z.array(z.string().url()).max(40),
  exclusions: z.array(z.string().max(1_000)).max(20).default([]),
  policyVersion: z.string().regex(/^[a-z0-9-]+-v\d+\.\d+$/),
});

export const artifactSchema = z.object({
  id: z.string().min(1).max(96),
  type: z.enum([
    "GITHUB_ISSUE",
    "GITHUB_PR",
    "GITHUB_REPOSITORY",
    "DEPLOYMENT_URL",
    "DOCUMENT",
    "DATASET",
    "IMAGE",
    "PUBLIC_API",
  ]),
  url: z.string().url(),
  canonicalUrl: z.string().url(),
  revision: z.string().max(128).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string().max(128),
  sizeBytes: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const evidenceManifestSchema = z.object({
  version: z.literal(WORKIFY_VERSION),
  jobId: z.string().regex(/^0x[a-f0-9]{64}$/),
  deliveryVersion: z.number().int().positive(),
  submittedAt: z.string().datetime(),
  artifacts: z.array(artifactSchema).min(1).max(40),
});

export const verdictSchema = z
  .object({
    decision: decisionSchema,
    payoutBps: z.number().int().min(0).max(BPS_DENOMINATOR),
    score: z.number().int().min(0).max(100),
    confidence: z.number().int().min(0).max(100),
    criteria: z.array(
      z.object({
        id: z.string(),
        decision: z.enum(["PASS", "FAIL", "PARTIAL", "UNVERIFIABLE"]),
        severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
        evidence: z.array(z.string()).max(12),
        reason: z.string().max(2_000),
      }),
    ),
    criticalFailures: z.array(z.string()).max(20),
    missingEvidence: z.array(z.string()).max(20),
    evidenceRoot: z.string().regex(/^[a-f0-9]{64}$/),
    specificationHash: z.string().regex(/^[a-f0-9]{64}$/),
    policyVersion: z.string(),
    attempt: z.number().int().min(1).max(MAX_VERIFICATION_ATTEMPTS),
    resultHash: z.string().regex(/^[a-f0-9]{64}$/),
    finalReasoning: z.string().max(4_000),
  })
  .superRefine((value, context) => {
    if (value.decision === "PASS" && value.payoutBps !== BPS_DENOMINATOR) {
      context.addIssue({ code: "custom", path: ["payoutBps"], message: "PASS requires 10000 bps" });
    }
    if (["FAIL", "UNVERIFIABLE"].includes(value.decision) && value.payoutBps !== 0) {
      context.addIssue({ code: "custom", path: ["payoutBps"], message: "FAIL and UNVERIFIABLE require 0 bps" });
    }
    if (value.decision === "PARTIAL" && (value.payoutBps <= 0 || value.payoutBps >= BPS_DENOMINATOR)) {
      context.addIssue({ code: "custom", path: ["payoutBps"], message: "PARTIAL requires 1-9999 bps" });
    }
  });

export const jobStatusSchema = z.enum([
  "AWAITING_DELIVERY",
  "DELIVERY_LOCKED",
  "VERIFYING",
  "RETRY_WINDOW",
  "VERDICT_FINAL",
  "APPEAL_WINDOW",
  "APPEAL_FUNDING",
  "APPEAL_VERIFYING",
  "SETTLEABLE",
  "SETTLED",
  "REFUNDED",
]);

export type WorkType = z.infer<typeof workTypeSchema>;
export type WorkSpecification = z.infer<typeof workSpecificationSchema>;
export type EvidenceManifest = z.infer<typeof evidenceManifestSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
