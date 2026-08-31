import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const publicRoot = new URL("../apps/web/public/verification-fixtures/", import.meta.url);
const directory = new URL("phase1-atomic-v2/", publicRoot);
const indexUrl = new URL("phase1/index.json", publicRoot);
const baseUrl = "https://workify-protocol.vercel.app/verification-fixtures";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const works = [
  {
    name: "slugifyTitle",
    requirements: ["trim input", "lowercase ASCII letters", "replace runs of non-alphanumeric characters with one hyphen", "reject an empty result"],
    implementation: `export function slugifyTitle(input) {\n  const value = String(input).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");\n  if (!value) throw new TypeError("empty slug");\n  return value;\n}`,
    tests: `assert.equal(slugifyTitle("  Hello, Workify!  "), "hello-workify");\nassert.throws(() => slugifyTitle("---"), TypeError);`,
  },
  {
    name: "parsePort",
    requirements: ["parse a decimal port", "reject non-integers", "enforce the inclusive range 1 through 65535"],
    implementation: `export function parsePort(input) {\n  if (!/^[0-9]+$/.test(String(input))) throw new TypeError("integer required");\n  const port = Number(input);\n  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError("invalid port");\n  return port;\n}`,
    tests: `assert.equal(parsePort("443"), 443);\nassert.throws(() => parsePort("1.5"), TypeError);\nassert.throws(() => parsePort("0"), RangeError);\nassert.throws(() => parsePort("65536"), RangeError);`,
  },
  {
    name: "clampRetries",
    requirements: ["accept only integer retry counts", "clamp the result to the inclusive range 0 through 3"],
    implementation: `export function clampRetries(input) {\n  const retries = Number(input);\n  if (!Number.isInteger(retries)) throw new TypeError("integer required");\n  return Math.min(3, Math.max(0, retries));\n}`,
    tests: `assert.equal(clampRetries("2"), 2);\nassert.equal(clampRetries(-4), 0);\nassert.equal(clampRetries(9), 3);\nassert.throws(() => clampRetries(1.5), TypeError);`,
  },
  {
    name: "isValidHex",
    requirements: ["accept an optional 0x prefix", "require an even positive number of hexadecimal characters", "reject non-hexadecimal characters"],
    implementation: `export function isValidHex(input) {\n  return /^(?:0x)?(?:[0-9a-fA-F]{2})+$/.test(String(input));\n}`,
    tests: `assert.equal(isValidHex("0x00ff"), true);\nassert.equal(isValidHex("CAFE"), true);\nassert.equal(isValidHex("abc"), false);\nassert.equal(isValidHex("0xzz"), false);`,
  },
  {
    name: "normalizeEmail",
    requirements: ["trim surrounding whitespace", "lowercase only the domain", "preserve the local part", "reject malformed addresses"],
    implementation: `export function normalizeEmail(input) {\n  const value = String(input).trim();\n  const match = /^([^@\\s]+)@([^@\\s]+\\.[^@\\s]+)$/.exec(value);\n  if (!match) throw new TypeError("invalid email");\n  return match[1] + "@" + match[2].toLowerCase();\n}`,
    tests: `assert.equal(normalizeEmail("  User.Name@EXAMPLE.COM "), "User.Name@example.com");\nassert.throws(() => normalizeEmail("missing-at.example.com"), TypeError);`,
  },
  {
    name: "redactToken",
    requirements: ["leave tokens of eight characters or fewer unchanged", "preserve the first four characters", "preserve the final four characters", "redact every middle character"],
    implementation: `export function redactToken(input) {\n  const token = String(input);\n  if (token.length <= 8) return token;\n  return token.slice(0, 4) + "*".repeat(token.length - 8) + token.slice(-4);\n}`,
    tests: `assert.equal(redactToken("abcdefgh"), "abcdefgh");\nassert.equal(redactToken("abcdefghijkl"), "abcd****ijkl");`,
  },
  {
    name: "paginate",
    requirements: ["reject page numbers below one", "return the requested stable page slice", "never mutate the input array"],
    implementation: `export function paginate(items, page, size) {\n  if (!Number.isInteger(page) || page < 1) throw new RangeError("invalid page");\n  if (!Number.isInteger(size) || size < 1) throw new RangeError("invalid size");\n  return items.slice((page - 1) * size, page * size);\n}`,
    tests: `const original = [1, 2, 3, 4];\nassert.deepEqual(paginate(original, 2, 2), [3, 4]);\nassert.deepEqual(original, [1, 2, 3, 4]);\nassert.throws(() => paginate(original, 0, 2), RangeError);`,
  },
  {
    name: "parseBoolean",
    requirements: ["accept boolean values", "accept case-insensitive true and false strings", "reject every other value"],
    implementation: `export function parseBoolean(input) {\n  if (typeof input === "boolean") return input;\n  if (typeof input === "string" && input.toLowerCase() === "true") return true;\n  if (typeof input === "string" && input.toLowerCase() === "false") return false;\n  throw new TypeError("boolean required");\n}`,
    tests: `assert.equal(parseBoolean(true), true);\nassert.equal(parseBoolean("FALSE"), false);\nassert.throws(() => parseBoolean(1), TypeError);`,
  },
  {
    name: "formatBytes",
    requirements: ["reject negative byte counts", "format bytes using B KB and MB units", "round displayed values to one decimal place"],
    implementation: `export function formatBytes(bytes) {\n  if (!Number.isFinite(bytes) || bytes < 0) throw new RangeError("invalid bytes");\n  if (bytes < 1024) return bytes.toFixed(1) + " B";\n  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + " KB";\n  return (bytes / 1024 ** 2).toFixed(1) + " MB";\n}`,
    tests: `assert.equal(formatBytes(12), "12.0 B");\nassert.equal(formatBytes(1536), "1.5 KB");\nassert.equal(formatBytes(1048576), "1.0 MB");\nassert.throws(() => formatBytes(-1), RangeError);`,
  },
  {
    name: "dedupeTags",
    requirements: ["trim and lowercase tags", "remove empty entries", "deduplicate while preserving first-seen order"],
    implementation: `export function dedupeTags(tags) {\n  const seen = new Set();\n  const result = [];\n  for (const item of tags) {\n    const tag = String(item).trim().toLowerCase();\n    if (tag && !seen.has(tag)) { seen.add(tag); result.push(tag); }\n  }\n  return result;\n}`,
    tests: `assert.deepEqual(dedupeTags([" Web3 ", "", "AI", "web3"]), ["web3", "ai"]);`,
  },
  {
    name: "buildQuery",
    requirements: ["sort keys deterministically", "omit undefined values", "URL-encode keys and values"],
    implementation: `export function buildQuery(values) {\n  return Object.keys(values).sort().filter((key) => values[key] !== undefined).map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(String(values[key]))).join("&");\n}`,
    tests: `assert.equal(buildQuery({ z: "a b", skip: undefined, a: "x&y" }), "a=x%26y&z=a%20b");`,
  },
  {
    name: "safeFilename",
    requirements: ["remove path separators", "collapse whitespace", "reject dot-only names", "cap output at 80 characters"],
    implementation: `export function safeFilename(input) {\n  const value = String(input).replace(/[\\\\/]+/g, "").replace(/\\s+/g, " ").trim().slice(0, 80);\n  if (!value || /^\\.+$/.test(value)) throw new TypeError("unsafe filename");\n  return value;\n}`,
    tests: `assert.equal(safeFilename(" ../quarterly   report.pdf "), "..quarterly report.pdf");\nassert.throws(() => safeFilename("..."), TypeError);\nassert.equal(safeFilename("a".repeat(100)).length, 80);`,
  },
  {
    name: "retryDelay",
    requirements: ["reject negative or non-integer attempts", "compute exponential backoff from the attempt", "cap the delay at the supplied maximum"],
    implementation: `export function retryDelay(attempt, base, maximum) {\n  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError("invalid attempt");\n  return Math.min(maximum, base * (2 ** attempt));\n}`,
    tests: `assert.equal(retryDelay(0, 100, 1000), 100);\nassert.equal(retryDelay(3, 100, 500), 500);\nassert.throws(() => retryDelay(-1, 100, 500), RangeError);`,
  },
  {
    name: "parseChainId",
    requirements: ["accept decimal chain identifiers", "accept 0x-prefixed hexadecimal identifiers", "return a positive safe integer", "reject malformed input"],
    implementation: `export function parseChainId(input) {\n  const value = String(input);\n  if (!/^(?:[1-9][0-9]*|0x[0-9a-fA-F]+)$/.test(value)) throw new TypeError("invalid chain id");\n  const chainId = Number(value);\n  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new RangeError("invalid chain id");\n  return chainId;\n}`,
    tests: `assert.equal(parseChainId("8453"), 8453);\nassert.equal(parseChainId("0x2105"), 8453);\nassert.throws(() => parseChainId("0"), TypeError);`,
  },
  {
    name: "normalizeAddress",
    requirements: ["accept exactly 20 hexadecimal bytes", "accept an optional 0x prefix", "return a lowercase 0x-prefixed address", "reject malformed input"],
    implementation: `export function normalizeAddress(input) {\n  const value = String(input).replace(/^0x/i, "");\n  if (!/^[0-9a-fA-F]{40}$/.test(value)) throw new TypeError("invalid address");\n  return "0x" + value.toLowerCase();\n}`,
    tests: `assert.equal(normalizeAddress("A".repeat(40)), "0x" + "a".repeat(40));\nassert.throws(() => normalizeAddress("0x1234"), TypeError);`,
  },
  {
    name: "stableSortJobs",
    requirements: ["sort jobs by ascending deadline", "break equal-deadline ties by identifier", "not mutate the input collection"],
    implementation: `export function stableSortJobs(jobs) {\n  return [...jobs].sort((left, right) => left.deadline - right.deadline || left.id.localeCompare(right.id));\n}`,
    tests: `const jobs = [{ id: "b", deadline: 2 }, { id: "c", deadline: 1 }, { id: "a", deadline: 2 }];\nassert.deepEqual(stableSortJobs(jobs).map((job) => job.id), ["c", "a", "b"]);\nassert.deepEqual(jobs.map((job) => job.id), ["b", "c", "a"]);`,
  },
  {
    name: "isSafeRedirect",
    requirements: ["accept only same-origin absolute paths", "reject protocol-relative URLs", "reject paths containing backslashes", "reject non-string values"],
    implementation: `export function isSafeRedirect(input) {\n  return typeof input === "string" && input.startsWith("/") && !input.startsWith("//") && !input.includes("\\\\");\n}`,
    tests: `assert.equal(isSafeRedirect("/app/jobs"), true);\nassert.equal(isSafeRedirect("//evil.example"), false);\nassert.equal(isSafeRedirect("/\\\\evil"), false);\nassert.equal(isSafeRedirect(null), false);`,
  },
];

function criteria(work) {
  return work.requirements.map((requirement, index) => ({
    id: `C-${String(index + 1).padStart(3, "0")}`,
    requirement: `${work.name} must ${requirement}`,
    severity: index === 0 ? "CRITICAL" : "HIGH",
    verificationMethod: "source-grounded",
    evidenceRequired: ["public_source_code", "focused_tests"],
    passCondition: `The retrieved implementation and tests directly demonstrate: ${requirement}`,
    failureCondition: `The retrieved implementation contradicts or does not demonstrate: ${requirement}`,
  }));
}

function source(number, work, complete) {
  const implementation = complete
    ? work.implementation
    : work.implementation.replace(/throw new [A-Za-z]+\([^\n]+\);?/, "// DEFECT: required rejection was omitted");
  return `WORKIFY SOFTWARE DELIVERY CASE ${number}\n\nLOCKED REQUIREMENTS\n${work.requirements.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\nIMPLEMENTATION (JavaScript)\n\`\`\`js\n${implementation}\n\`\`\`\n\nFOCUSED TESTS (Node assert)\n\`\`\`js\nimport assert from "node:assert/strict";\n${work.tests}\n\`\`\`\n\nCI RECEIPT\nThe submitted revision reports lint, unit tests, and typecheck completed. Validators must judge the visible implementation and tests rather than trusting this receipt.\n`;
}

await mkdir(directory, { recursive: true });
const existing = JSON.parse(await readFile(indexUrl, "utf8"));
const preserved = existing.filter((item) => Number(item.caseId) <= 7);
const generated = [];

for (let offset = 0; offset < works.length; offset += 1) {
  const number = offset + 8;
  const id = String(number).padStart(2, "0");
  const work = works[offset];
  const complete = number % 5 !== 0;
  const sourceBody = source(number, work, complete);
  const sourceName = `case-${id}-source.txt`;
  await writeFile(new URL(sourceName, directory), sourceBody);
  const specification = {
    version: "1.0.0",
    title: `Atomic software work ${id}: ${work.name}`,
    description: `Independent GenLayer source-grounded verification for ${work.name}.`,
    workType: "GITHUB_SOFTWARE",
    deliverables: [`Implementation and focused tests for ${work.name}`],
    criteria: criteria(work),
    authorizedSources: [`${baseUrl}/phase1-atomic-v2/${sourceName}`],
    exclusions: [],
    policyVersion: "github-software-v7.0",
  };
  const specificationBody = `${JSON.stringify(specification, null, 2)}\n`;
  const specificationName = `case-${id}-specification.json`;
  await writeFile(new URL(specificationName, directory), specificationBody);
  const evidence = {
    version: "1.0.0",
    jobId: `0x${sha256(`workify-phase1-code-evidence-${id}`)}`,
    deliveryVersion: 1,
    submittedAt: "2026-08-29T14:30:00.000Z",
    artifacts: [{
      id: `SOURCE-${id}`,
      type: "GITHUB_SOURCE_AND_TESTS",
      url: `${baseUrl}/phase1-atomic-v2/${sourceName}`,
      canonicalUrl: `${baseUrl}/phase1-atomic-v2/${sourceName}`,
      sha256: sha256(sourceBody),
      mimeType: "text/plain",
      sizeBytes: Buffer.byteLength(sourceBody),
      metadata: { distinctWork: work.name, containsImplementation: true, containsTests: true },
    }],
  };
  const evidenceBody = `${JSON.stringify(evidence, null, 2)}\n`;
  const evidenceName = `case-${id}-evidence.json`;
  await writeFile(new URL(evidenceName, directory), evidenceBody);
  generated.push({
    caseId: id,
    jobId: evidence.jobId,
    specificationUrl: `${baseUrl}/phase1-atomic-v2/${specificationName}`,
    specificationHash: sha256(specificationBody),
    evidenceUrl: `${baseUrl}/phase1-atomic-v2/${evidenceName}`,
    evidenceHash: sha256(evidenceBody),
    expected: complete ? "PASS" : "FAIL",
  });
}

await writeFile(indexUrl, `${JSON.stringify([...preserved, ...generated], null, 2)}\n`);
