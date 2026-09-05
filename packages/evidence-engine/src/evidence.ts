import { evidenceManifestSchema } from "@workify/protocol-types";
import { canonicalHash, canonicalJson, sha256 } from "./canonical";
import { getDatabase } from "./mongodb";
import { WorkifyError } from "./errors";

const MAX_ARTIFACT_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

function isAllowedEvidenceHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/u, "");
  let configuredHost = "";
  try { configuredHost = process.env.PUBLIC_APP_URL ? new URL(process.env.PUBLIC_APP_URL).hostname.toLowerCase() : ""; } catch { configuredHost = ""; }
  return host === "github.com" || host === "api.github.com" || host === "raw.githubusercontent.com" || host.endsWith(".githubusercontent.com") || host.endsWith(".vercel.app") || (configuredHost !== "" && configuredHost === host);
}

async function readLimitedBody(response: Response) {
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_ARTIFACT_BYTES) {
      await reader.cancel();
      throw new WorkifyError("EVIDENCE_INVALID", "Evidence must be no larger than 2 MB");
    }
    chunks.push(next.value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

function validateEvidenceUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new WorkifyError("EVIDENCE_INVALID", "Evidence URLs must use HTTPS");
  if (url.username || url.password) throw new WorkifyError("EVIDENCE_INVALID", "Evidence URLs cannot contain credentials");
  if (!isAllowedEvidenceHost(url.hostname)) throw new WorkifyError("EVIDENCE_INVALID", "Evidence must be hosted on GitHub or Vercel");
  return url;
}

async function fetchEvidence(url: URL) {
  let current = url;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, {
      headers: { "User-Agent": "Workify-Protocol/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirect === MAX_REDIRECTS) throw new WorkifyError("EVIDENCE_UNAVAILABLE", "Evidence redirected too many times", true);
    current = validateEvidenceUrl(new URL(location, current).toString());
  }
  throw new WorkifyError("EVIDENCE_UNAVAILABLE", "Evidence could not be fetched", true);
}

export async function prepareEvidenceManifest(input: {
  jobId: string;
  deliveryVersion: number;
  artifacts: Array<{ id: string; type: string; url: string; revision?: string }>;
}) {
  const artifacts = await Promise.all(input.artifacts.map(async (artifact) => {
    const url = validateEvidenceUrl(artifact.url);
    const response = await fetchEvidence(url);
    if (!response.ok) throw new WorkifyError("EVIDENCE_UNAVAILABLE", `Evidence returned ${response.status}`, response.status >= 500);
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_ARTIFACT_BYTES) throw new WorkifyError("EVIDENCE_INVALID", "Evidence must be no larger than 2 MB");
    const body = await readLimitedBody(response);
    if (body.byteLength === 0 || body.byteLength > MAX_ARTIFACT_BYTES) throw new WorkifyError("EVIDENCE_INVALID", "Evidence must be 1 byte to 2 MB");
    return {
      id: artifact.id,
      type: artifact.type,
      url: artifact.url,
      canonicalUrl: response.url,
      ...(artifact.revision ? { revision: artifact.revision } : {}),
      sha256: sha256(body),
      mimeType: response.headers.get("content-type")?.split(";")[0] || "application/octet-stream",
      sizeBytes: body.byteLength,
      metadata: {},
    };
  }));
  const manifest = evidenceManifestSchema.parse({
    version: "1.0.0",
    jobId: input.jobId,
    deliveryVersion: input.deliveryVersion,
    submittedAt: new Date().toISOString(),
    artifacts,
  });
  const hash = canonicalHash(manifest);
  const canonical = canonicalJson(manifest);
  await (await getDatabase()).collection("evidence_manifests").updateOne(
    { _id: hash as never },
    { $setOnInsert: { document: manifest, canonical, createdAt: new Date() } },
    { upsert: true },
  );
  return { evidenceHash: `0x${hash}` as const, manifest };
}
