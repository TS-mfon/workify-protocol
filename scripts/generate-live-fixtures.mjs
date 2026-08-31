import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const root = new URL("../apps/web/public/verification-fixtures/", import.meta.url);
const baseUrl = "https://workify-protocol.vercel.app/verification-fixtures";

const phases = [
  { key: "phase1", workType: "GITHUB_SOFTWARE", policy: "github-software-v1.0", noun: "software pull request" },
  { key: "phase2", workType: "WEB_APPLICATION", policy: "web-application-v1.0", noun: "deployed web application" },
  { key: "phase3", workType: "RESEARCH_DATA", policy: "research-data-v1.0", noun: "research report and dataset" },
  { key: "phase4", workType: "CONTENT_DOCUMENT", policy: "content-document-v1.0", noun: "technical document" },
  { key: "phase5", workType: "DESIGN_CREATIVE", policy: "design-creative-v1.0", noun: "dashboard design specification" },
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort(), 2) + "\n";

function sourceFor(phase, number) {
  const complete = number % 4 !== 0;
  const partial = number % 4 === 0;
  const common = `WORKIFY LIVE CONSENSUS CASE ${number}\nWork type: ${phase.workType}\nPublic fixture revision: phase-${phase.key}-${number}\n`;
  if (phase.key === "phase1") return `${common}
ORIGINAL ISSUE\nImplement normalizeUsername(input) so it trims surrounding whitespace, lowercases ASCII letters, rejects empty results, and includes meaningful tests.\n\nDELIVERY\n${complete ? `export function normalizeUsername(input) {\n  const normalized = String(input).trim().toLowerCase();\n  if (!normalized) throw new Error("username required");\n  return normalized;\n}\n\nTESTS\n- " Alice " becomes "alice"\n- empty and whitespace-only input throws\n- existing lowercase input remains unchanged\nCI: lint PASS, unit tests PASS, typecheck PASS` : `export function normalizeUsername(input) {\n  return String(input).toLowerCase();\n}\n\nTESTS\n- "Alice" becomes "alice"\nCI: unit tests PASS\nMissing: trimming and empty-input rejection tests.`}
\nSECURITY\nNo secrets, dependencies, authorization paths, or unrelated files changed.\n`;
  if (phase.key === "phase2") return `${common}
REQUIREMENTS\nA public responsive status page must include a hero, live network badge, job table, accessible navigation, mobile layout, and a working documentation link.\n\nDELIVERY SNAPSHOT\n${complete ? `Routes: /status and /docs both return 200.\nHTML contains nav aria-label="Primary", h1 "Verified work status", live status badge, four-row jobs table, and docs link.\nCSS includes desktop grid and @media(max-width:640px) single-column rules.\nLighthouse checks: accessibility 96, best-practices 100.` : `Route /status returns 200 and contains the hero and badge.\nThe jobs table is static and the /docs link returns 404.\nNo mobile breakpoint or navigation label is present.`}\n`;
  if (phase.key === "phase3") return `${common}
RESEARCH QUESTION\nCompare three public work-verification approaches and provide sourced findings, methodology, dates, and a reproducible dataset.\n\nREPORT\n${complete ? `Method: reviewed official protocol documentation captured 2026-08-28.\nDataset rows: deterministic contracts, optimistic human arbitration, decentralized AI consensus.\nEach row includes source URL, retrieval date, trust model, appeal model, and settlement limitation.\nConclusion distinguishes directly sourced facts from author inference.\nAll three calculations recompute from the included rows.` : `The report names three approaches but supplies one source, no retrieval dates, no dataset rows, and presents estimates as established facts.`}\n`;
  if (phase.key === "phase4") return `${common}
DOCUMENT BRIEF\nWrite an operator runbook covering prerequisites, deployment, verification, rollback, security, and troubleshooting for a testnet release.\n\nDELIVERABLE\n${complete ? `Sections: Scope, Prerequisites, Environment Variables, Deployment, Onchain Verification, Rollback, Security Controls, Troubleshooting, Incident Escalation.\nEvery command identifies its network and expected success condition.\nSecrets are referenced by variable name and never embedded.\nRollback states which operations are impossible for immutable contracts.` : `Sections: Deployment and Troubleshooting.\nThe document embeds an example private key, has no rollback procedure, and does not identify expected transaction states.`}\n`;
  return `${common}
DESIGN BRIEF\nCreate a dark Web3 dashboard with sidebar navigation, four metric cards, a verification timeline, mobile layout, focus states, and reduced-motion behavior.\n\nDESIGN TOKEN AND SCREEN MANIFEST\n${complete ? `Canvas: 1440x1024 and 390x844.\nComponents: sidebar, wallet button, four metric cards, timeline with five states, error alert, appeal modal.\nTokens: background #070B14, surface #111827, cyan accent #67E8F9, minimum text contrast 4.7:1.\nInteraction states: hover, focus-visible, pressed, loading, success, error.\nMotion: 180ms standard; prefers-reduced-motion disables transforms.` : `Canvas: 1440x1024 only.\nComponents: sidebar and three metric cards.\nNo mobile screen, focus state, error state, appeal modal, contrast measurement, or reduced-motion specification.`}\n`;
}

for (const phase of phases) {
  const directory = new URL(`${phase.key}/`, root);
  await mkdir(directory, { recursive: true });
  const index = [];
  for (let number = 1; number <= 17; number += 1) {
    const id = String(number).padStart(2, "0");
    const source = sourceFor(phase, number);
    const sourceName = `case-${id}-source.txt`;
    await writeFile(new URL(sourceName, directory), source);
    const specification = {
      version: "1.0.0",
      title: `Live ${phase.noun} case ${id}`,
      description: `Independent consensus test for ${phase.policy}.`,
      workType: phase.workType,
      deliverables: [phase.noun],
      criteria: [
        { id: "C-001", requirement: "The primary requested deliverable is implemented", severity: "CRITICAL", verificationMethod: "source-grounded", evidenceRequired: ["public_source"], passCondition: "Evidence demonstrates the complete primary behavior", failureCondition: "Primary behavior is missing or contradicted" },
        { id: "C-002", requirement: "Mandatory validation and failure states are covered", severity: "HIGH", verificationMethod: "source-grounded", evidenceRequired: ["public_source"], passCondition: "Required edge and failure states are evidenced", failureCondition: "Mandatory edge or failure states are absent" },
        { id: "C-003", requirement: "The delivery does not introduce unsafe or unrelated changes", severity: "HIGH", verificationMethod: "source-grounded", evidenceRequired: ["public_source"], passCondition: "No unsafe or unrelated change is evidenced", failureCondition: "Evidence contains unsafe or unrelated changes" },
      ],
      authorizedSources: [`${baseUrl}/${phase.key}/${sourceName}`],
      exclusions: [],
      policyVersion: phase.policy,
    };
    const specificationBody = JSON.stringify(specification, null, 2) + "\n";
    const specificationName = `case-${id}-specification.json`;
    await writeFile(new URL(specificationName, directory), specificationBody);
    const evidence = {
      version: "1.0.0",
      jobId: `0x${sha256(`workify-${phase.key}-${id}`)}`,
      deliveryVersion: 1,
      submittedAt: "2026-08-28T12:00:00.000Z",
      artifacts: [{ id: `SOURCE-${id}`, type: phase.key === "phase1" ? "GITHUB_PR" : phase.key === "phase2" ? "DEPLOYMENT_URL" : phase.key === "phase3" ? "DATASET" : phase.key === "phase4" ? "DOCUMENT" : "IMAGE", url: `${baseUrl}/${phase.key}/${sourceName}`, canonicalUrl: `${baseUrl}/${phase.key}/${sourceName}`, sha256: sha256(source), mimeType: "text/plain", sizeBytes: Buffer.byteLength(source), metadata: { liveConsensusCase: id } }],
    };
    const evidenceBody = JSON.stringify(evidence, null, 2) + "\n";
    const evidenceName = `case-${id}-evidence.json`;
    await writeFile(new URL(evidenceName, directory), evidenceBody);
    index.push({
      caseId: id,
      jobId: evidence.jobId,
      specificationUrl: `${baseUrl}/${phase.key}/${specificationName}`,
      specificationHash: sha256(specificationBody),
      evidenceUrl: `${baseUrl}/${phase.key}/${evidenceName}`,
      evidenceHash: sha256(evidenceBody),
      expected: number % 4 === 0 ? "FAIL_OR_PARTIAL" : "PASS",
    });
  }
  await writeFile(new URL("index.json", directory), JSON.stringify(index, null, 2) + "\n");
}

