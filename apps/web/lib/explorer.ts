import "server-only";

import { chains, createClient } from "genlayer-js";
import phase1 from "../../../fixtures/live-results/phase1-v7.json";
import phase2 from "../../../fixtures/live-results/phase2-v7.json";
import phase3 from "../../../fixtures/live-results/phase3-v7.json";
import phase4 from "../../../fixtures/live-results/phase4-v7.json";
import phase5 from "../../../fixtures/live-results/phase5-v7.json";
import deployment from "../../../deployments/genlayer-bradbury/v7.json";

type Decision = "PASS" | "FAIL" | "PARTIAL" | "UNVERIFIABLE";
type ManifestCase = {
  caseId: string;
  jobId: string;
  specificationUrl: string;
  evidenceUrl: string;
  status?: string;
  consensus?: string;
  execution?: string;
  attempts: Array<{ attempt: number; transactionHash: string; status?: string; verdict?: string }>;
};
type Manifest = { cases: ManifestCase[] };
type Verdict = {
  attempt: number;
  decision: Decision;
  score: number;
  payout_bps: number;
  policy_version: string;
  result_hash: string;
  criteria: Array<{ id: string; decision: Decision; severity: string; critical: boolean }>;
  critical_failures: string[];
  missing_evidence: string[];
};
type Specification = { title?: string; description?: string; workType?: string; criteria?: Array<{ id: string; requirement: string }> };

const policies = [
  { key: "github", label: "GitHub Software", manifest: phase1 as Manifest },
  { key: "web", label: "Web Application", manifest: phase2 as Manifest },
  { key: "research", label: "Research & Data", manifest: phase3 as Manifest },
  { key: "document", label: "Content & Document", manifest: phase4 as Manifest },
  { key: "design", label: "Design & Creative", manifest: phase5 as Manifest },
] as const;

async function loadSpecification(url: string): Promise<Specification | null> {
  try {
    const response = await fetch(url, { next: { revalidate: 300 } });
    return response.ok ? await response.json() as Specification : null;
  } catch {
    return null;
  }
}

export async function getResolvedCases() {
  const endpoint = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || deployment.endpoint;
  const client = createClient({ chain: chains.testnetBradbury as never, endpoint });
  const indexed = policies.flatMap((policy) => policy.manifest.cases
    .filter((item) => item.status === "FINALIZED" && item.consensus === "AGREE" && item.execution === "FINISHED_WITH_RETURN")
    .map((item) => ({ policy, item })));

  return Promise.all(indexed.map(async ({ policy, item }) => {
    const attempt = item.attempts.findLast((candidate) => candidate.status === "FINALIZED" && Boolean(candidate.verdict)) ?? item.attempts.at(-1);
    const verifier = deployment.verifiers[policy.key].address as `0x${string}`;
    const specification = await loadSpecification(item.specificationUrl);
    if (!attempt) return { policy: policy.label, verifier, item, specification, verdict: null, readError: "No finalized attempt was indexed" };
    try {
      const raw = await client.readContract({
        address: verifier,
        functionName: "get_verdict",
        args: [item.jobId, attempt.attempt, false],
        jsonSafeReturn: true,
      });
      const verdict = JSON.parse(String(raw)) as Verdict;
      return { policy: policy.label, verifier, item, specification, verdict, readError: null };
    } catch (error) {
      return { policy: policy.label, verifier, item, specification, verdict: null, readError: error instanceof Error ? error.message : "GenLayer read failed" };
    }
  }));
}

