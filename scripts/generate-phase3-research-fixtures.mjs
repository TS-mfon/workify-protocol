import { createHash } from "node:crypto";
import { mkdir, writeFile, rename } from "node:fs/promises";

const directory = new URL("../apps/web/public/verification-fixtures/phase3-grounded/", import.meta.url);
const indexUrl = new URL("../apps/web/public/verification-fixtures/phase3/index.json", import.meta.url);
const baseUrl = "https://workify-protocol.vercel.app/verification-fixtures/phase3-grounded";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const text = (value) => `${value.trim()}\n`;

const cases = [
  {
    slug: "pricing-comparison",
    title: "AI API pricing comparison",
    criteria: [
      "The report compares exactly three providers",
      "Every listed input and output price matches a retrieved provider source",
      "The report identifies the lowest input-token and output-token prices",
    ],
    artifacts: [
      ["report.md", text(`# AI API pricing comparison\n\nSnapshot date: 2026-08-30. Prices are synthetic fixture values expressed per one million tokens.\n\n| Provider | Input | Output | Source |\n| --- | ---: | ---: | --- |\n| Atlas AI | $2 | $8 | atlas-source.json |\n| Boreal Models | $3 | $7 | boreal-source.json |\n| Cinder Labs | $1 | $9 | cinder-source.json |\n\nAtlas AI has the middle input price. Cinder Labs has the lowest input price at $1. Boreal Models has the lowest output price at $7. Exactly three providers are compared.`)],
      ["atlas-source.json", text(JSON.stringify({ provider: "Atlas AI", effectiveDate: "2026-08-30", unit: "USD per 1M tokens", input: 2, output: 8 }, null, 2))],
      ["boreal-source.json", text(JSON.stringify({ provider: "Boreal Models", effectiveDate: "2026-08-30", unit: "USD per 1M tokens", input: 3, output: 7 }, null, 2))],
      ["cinder-source.json", text(JSON.stringify({ provider: "Cinder Labs", effectiveDate: "2026-08-30", unit: "USD per 1M tokens", input: 1, output: 9 }, null, 2))],
    ],
  },
  {
    slug: "tvl-snapshot",
    title: "Protocol TVL snapshot",
    criteria: [
      "The report states a UTC snapshot timestamp",
      "The reported total value locked equals the sum of the retrieved pool values",
      "The methodology explains which assets are included and how USD value is calculated",
    ],
    artifacts: [
      ["report.md", text(`# Protocol TVL snapshot\n\nSnapshot timestamp: 2026-08-30T10:00:00Z.\n\nPool Alpha holds $1,250,000 and Pool Beta holds $750,000. Total value locked is therefore $2,000,000.\n\nMethodology: include deposited assets in the two active protocol pools, exclude treasury balances and borrowed assets, and multiply token quantities by the USD prices recorded in the source snapshot at the stated UTC timestamp.`)],
      ["pool-snapshot.json", text(JSON.stringify({ timestamp: "2026-08-30T10:00:00Z", denomination: "USD", pools: [{ id: "alpha", valueUsd: 1250000 }, { id: "beta", valueUsd: 750000 }], excluded: ["treasury", "borrowed assets"] }, null, 2))],
    ],
  },
  {
    slug: "developer-survey",
    title: "Five-response developer survey",
    criteria: [
      "The raw dataset contains exactly five anonymized responses",
      "The report contains no direct personal identifiers",
      "The reported preference counts and average experience equal the raw dataset",
    ],
    artifacts: [
      ["raw.csv", text(`response_id,preferred_stack,years_experience\nR1,TypeScript,4\nR2,Rust,6\nR3,TypeScript,2\nR4,Python,3\nR5,TypeScript,5`)],
      ["report.md", text(`# Developer survey\n\nThe anonymized dataset contains five responses identified only as R1 through R5. No name, email, wallet address, employer, or location was collected.\n\nPreference counts: TypeScript 3, Rust 1, Python 1. Total experience is 20 years, so average experience is 4.0 years.`)],
    ],
  },
  {
    slug: "citation-audit",
    title: "Four-claim citation audit",
    criteria: [
      "The audit evaluates exactly four factual claims",
      "Each claim is linked to retrieved source text",
      "The support or contradiction verdict matches the retrieved source",
    ],
    artifacts: [
      ["audit.md", text(`# Citation audit\n\n1. Claim: Project North launched in 2024. Source A says 2024. Verdict: SUPPORTED.\n2. Claim: Project North supports three networks. Source A lists Base, Arbitrum, and Optimism. Verdict: SUPPORTED.\n3. Claim: Dataset Delta contains 40 rows. Source B reports 38 rows. Verdict: CONTRADICTED.\n4. Claim: Dataset Delta uses UTC timestamps. Source B states all timestamps are UTC. Verdict: SUPPORTED.`)],
      ["source-a.txt", text(`PROJECT NORTH FACT SHEET\nLaunch year: 2024\nSupported networks: Base, Arbitrum, Optimism`) ],
      ["source-b.txt", text(`DATASET DELTA METADATA\nRow count: 38\nTimestamp convention: UTC`) ],
    ],
  },
  {
    slug: "dataset-cleaning",
    title: "Dataset cleaning verification",
    criteria: [
      "The cleaned dataset removes the duplicate record using the stated key",
      "The cleaned dataset handles the missing score using the documented rule",
      "The reported input and output row counts match the retrieved files",
    ],
    artifacts: [
      ["raw.csv", text(`id,name,score\n1,Alpha,8\n2,Beta,\n2,Beta,\n3,Gamma,10`) ],
      ["clean.csv", text(`id,name,score\n1,Alpha,8\n2,Beta,9\n3,Gamma,10`) ],
      ["methodology.md", text(`# Cleaning methodology\n\nInput rows: 4. Output rows: 3. Duplicate key: id. When duplicate ids are identical, retain one record. Missing score rule: replace a missing score with the median of observed scores; the observed values 8 and 10 have median 9. The cleaned record for id 2 therefore has score 9.`)],
    ],
  },
];

await mkdir(directory, { recursive: true });
const index = [];
for (let offset = 0; offset < cases.length; offset += 1) {
  const item = cases[offset];
  const caseId = String(offset + 1).padStart(2, "0");
  const artifacts = [];
  for (let artifactIndex = 0; artifactIndex < item.artifacts.length; artifactIndex += 1) {
    const [suffix, body] = item.artifacts[artifactIndex];
    const name = `case-${caseId}-${suffix}`;
    await writeFile(new URL(name, directory), body);
    const url = `${baseUrl}/${name}`;
    artifacts.push({ id: `SOURCE-${caseId}-${artifactIndex + 1}`, type: suffix.endsWith(".csv") ? "DATASET" : suffix.endsWith(".json") ? "PRIMARY_SOURCE" : "RESEARCH_REPORT", url, canonicalUrl: url, sha256: sha256(body), mimeType: suffix.endsWith(".csv") ? "text/csv" : suffix.endsWith(".json") ? "application/json" : "text/markdown", sizeBytes: Buffer.byteLength(body), metadata: { groundedResearch: true, slug: item.slug } });
  }
  const specification = { version: "1.0.0", title: item.title, description: `Source-grounded research verification for ${item.slug}.`, workType: "RESEARCH_DATA", deliverables: [item.title, "Supporting source records"], criteria: item.criteria.map((requirement, criterionIndex) => ({ id: `C-${String(criterionIndex + 1).padStart(3, "0")}`, requirement, severity: criterionIndex === 0 ? "CRITICAL" : "HIGH", verificationMethod: "source-grounded", evidenceRequired: ["report", "supporting_sources"], passCondition: `Retrieved report and sources directly demonstrate: ${requirement}`, failureCondition: `Retrieved report or sources contradict or do not demonstrate: ${requirement}` })), authorizedSources: artifacts.map((artifact) => artifact.url), exclusions: [], policyVersion: "research-data-v7.0" };
  const specificationBody = `${JSON.stringify(specification, null, 2)}\n`;
  const specificationName = `case-${caseId}-specification.json`;
  await writeFile(new URL(specificationName, directory), specificationBody);
  const jobId = `0x${sha256(`workify-phase3-grounded-${caseId}`)}`;
  const evidence = { version: "1.0.0", jobId, deliveryVersion: 2, submittedAt: "2026-08-30T10:30:00.000Z", artifacts };
  const evidenceBody = `${JSON.stringify(evidence, null, 2)}\n`;
  const evidenceName = `case-${caseId}-evidence.json`;
  await writeFile(new URL(evidenceName, directory), evidenceBody);
  index.push({ caseId, jobId, specificationUrl: `${baseUrl}/${specificationName}`, specificationHash: sha256(specificationBody), evidenceUrl: `${baseUrl}/${evidenceName}`, evidenceHash: sha256(evidenceBody), expected: "PASS" });
}
await writeFile(indexUrl, `${JSON.stringify(index, null, 2)}\n`);
try { await rename(new URL("../fixtures/live-results/phase3-v7.json", import.meta.url), new URL("../fixtures/live-results/phase3-v7-weak-evidence.json", import.meta.url)); } catch {}
