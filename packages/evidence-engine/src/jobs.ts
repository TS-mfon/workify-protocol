import { randomBytes } from "node:crypto";
import { workSpecificationSchema, type WorkSpecification } from "@workify/protocol-types";
import { canonicalHash, canonicalJson } from "./canonical";
import { getDatabase } from "./mongodb";

export async function prepareJobSpecification(input: WorkSpecification) {
  const specification = workSpecificationSchema.parse(input);
  const document = canonicalJson(specification);
  const hash = canonicalHash(specification);
  const jobId = `0x${randomBytes(32).toString("hex")}` as const;
  const db = await getDatabase();
  await db.collection("specifications").updateOne(
    { _id: hash as never },
    { $setOnInsert: { document: specification, canonical: document, createdAt: new Date() } },
    { upsert: true },
  );
  return { jobId, specificationHash: `0x${hash}` as const, specification };
}

export async function queueRelayIntent(intent: Record<string, unknown>) {
  const db = await getDatabase();
  const idempotencyKey = String(intent.idempotencyKey ?? "");
  if (!idempotencyKey) throw new Error("idempotencyKey is required");
  await db.collection("relay_intents").updateOne(
    { _id: idempotencyKey as never },
    { $setOnInsert: { ...intent, status: "PENDING", attempts: 0, createdAt: new Date() } },
    { upsert: true },
  );
}
