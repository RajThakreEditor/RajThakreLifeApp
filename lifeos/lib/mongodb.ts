import type { Db, MongoClient } from "mongodb";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient> | undefined;

function getMongoUri() {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new Error("Please define MONGODB_URI in .env.local");
  }

  return uri;
}

export async function getClient() {
  if (!clientPromise) {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(getMongoUri(), {
      serverSelectionTimeoutMS: 5000,
    });

    if (process.env.NODE_ENV === "development") {
      if (!globalThis._mongoClientPromise) {
        globalThis._mongoClientPromise = client.connect();
      }

      clientPromise = globalThis._mongoClientPromise;
    } else {
      clientPromise = client.connect();
    }
  }

  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  const dbName = process.env.MONGODB_DB?.trim();

  return client.db(dbName || undefined);
}

export default getClient;
