import { evidenceManifestSchema } from "@workify/protocol-types";
import { canonicalHash, sha256 } from "./canonical";
import { getDatabase } from "./mongodb";
import { WorkifyError } from "./errors";

const MAX_ARTIFACT_BYTES = 2_000_000;

export async function prepareEvidenceManifest(input: {
  jobId: string;
  deliveryVersion: number;
  artifacts: Array<{ id: string; type: string; url: string; revision?: string }>;
}) {
  const artifacts = await Promise.all(input.artifacts.map(async (artifact) => {
    const url = new URL(artifact.url);
    if (url.protocol !== "https:") throw new WorkifyError("EVIDENCE_INVALID", "Evidence URLs must use HTTPS");
    const response = await fetch(url, { headers: { "User-Agent": "Workify-Protocol/1.0" }, redirect: "follow" });
    if (!response.ok) throw new WorkifyError("EVIDENCE_UNAVAILABLE", `Evidence returned ${response.status}`, response.status >= 500);
    const body = new Uint8Array(await response.arrayBuffer());
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
  await (await getDatabase()).collection("evidence_manifests").updateOne(
    { _id: hash as never },
    { $setOnInsert: { document: manifest, createdAt: new Date() } },
    { upsert: true },
  );
  return { evidenceHash: `0x${hash}` as const, manifest };
}
