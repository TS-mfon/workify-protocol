import { MongoClient, type Db } from "mongodb";
import { WorkifyError } from "./errors";

declare global { var __workifyMongo: Promise<MongoClient> | undefined; }

export async function getDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new WorkifyError("DATABASE_TRANSIENT", "MONGODB_URI is not configured");
  globalThis.__workifyMongo ??= new MongoClient(uri, { maxPoolSize: 10, minPoolSize: 0 }).connect();
  try {
    const client = await globalThis.__workifyMongo;
    return client.db(process.env.MONGODB_DATABASE || "workify");
  } catch (cause) {
    globalThis.__workifyMongo = undefined;
    throw new WorkifyError("DATABASE_TRANSIENT", "MongoDB connection failed", true, { cause: String(cause) });
  }
}

export async function acquireLease(key: string, ttlMs = 240_000): Promise<boolean> {
  const db = await getDatabase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  try {
    const result = await db.collection("automation_leases").findOneAndUpdate(
      { _id: key as never, $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }] },
      { $set: { expiresAt, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true, returnDocument: "after" },
    );
    return Boolean(result);
  } catch (cause: any) {
    if (cause?.code === 11000) return false;
    throw new WorkifyError("DATABASE_TRANSIENT", "Could not acquire automation lease", true);
  }
}
