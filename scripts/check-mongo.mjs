import fs from "node:fs";
import { MongoClient } from "mongodb";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) return;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  });
}

function printConnectionHint(error) {
  const message = error?.message || String(error);

  if (/tlsv1 alert internal error|SSL routines/i.test(message)) {
    console.error("\nTLS failed before MongoDB authentication. Check these in MongoDB Atlas:");
    console.error("- Network Access includes this machine's current public IP.");
    console.error("- The URI was copied from Atlas for the correct cluster.");
    console.error("- The username/password in MONGODB_URI are URL-encoded if they contain special characters.");
    console.error("- If this still fails, use a supported Node.js 22 or 24 LTS release; current runtime is", process.version);
  }

  if (/authentication failed|bad auth|auth failed|not authorized/i.test(message)) {
    console.error("\nMongoDB reached Atlas, but authentication was rejected:");
    console.error("- Use a MongoDB database user from Atlas Database Access, not your Atlas sign-in.");
    console.error("- Check the username and password in MONGODB_URI.");
    console.error("- Percent-encode reserved characters in the URI username or password.");
  }
}

async function main() {
  loadEnv(".env.local");

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in .env.local. Copy .env.local.example and fill it.");
    process.exit(2);
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await client.connect();
    const dbName = process.env.MONGODB_DB || undefined;
    const db = dbName ? client.db(dbName) : client.db();
    await db.command({ ping: 1 });
    console.log("Connected to MongoDB.");
  } catch (err) {
    console.error("Connection failed:", err.message || err);
    printConnectionHint(err);
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => {});
  }
}

void main();
