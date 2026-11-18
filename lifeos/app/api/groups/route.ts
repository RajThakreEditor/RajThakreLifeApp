import type { Collection } from "mongodb";
import { getDb } from "../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GROUP_COLLECTION = "task_groups";
const TASK_COLLECTION = "tasks";
const DEFAULT_GROUPS = ["Personal", "Work", "Finance"];

type GroupDocument = {
  _id: string;
  name: string;
  createdAt: string;
};

type TaskGroupDocument = {
  group?: unknown;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeGroupName(name: string) {
  return name.trim().toLowerCase();
}

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

async function ensureGroupExists(collection: Collection<GroupDocument>, name: string) {
  const cleanName = cleanString(name);
  const normalizedName = normalizeGroupName(cleanName);

  if (!cleanName || !normalizedName) return;

  try {
    await collection.insertOne({
      _id: normalizedName,
      name: cleanName,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
}

function serializeGroup(group: GroupDocument) {
  return {
    _id: group._id,
    name: group.name,
    createdAt: group.createdAt,
  };
}

async function getGroupsCollection() {
  const db = await getDb();
  return db.collection<GroupDocument>(GROUP_COLLECTION);
}

async function ensureDefaultAndTaskGroups() {
  const db = await getDb();
  const groups = db.collection<GroupDocument>(GROUP_COLLECTION);
  const taskGroups = await db
    .collection<TaskGroupDocument>(TASK_COLLECTION)
    .distinct("group");

  for (const name of DEFAULT_GROUPS) {
    await ensureGroupExists(groups, name);
  }

  for (const name of taskGroups) {
    if (typeof name === "string") {
      await ensureGroupExists(groups, name);
    }
  }

  return groups;
}

export async function GET() {
  try {
    const collection = await ensureDefaultAndTaskGroups();
    const groups = await collection.find({}).sort({ createdAt: 1, _id: 1 }).toArray();

    return json(groups.map(serializeGroup));
  } catch (error) {
    console.error("GET /api/groups error", error);
    return json({ error: "Failed to fetch groups from MongoDB" }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const name = cleanString(data?.name);

    if (!name) {
      return json({ error: "Group name is required" }, 400);
    }

    const document: GroupDocument = {
      _id: normalizeGroupName(name),
      name,
      createdAt: new Date().toISOString(),
    };
    const collection = await getGroupsCollection();

    try {
      await collection.insertOne(document);
      return json(serializeGroup(document), 201);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const existing = await collection.findOne({ _id: document._id });
      if (existing) return json(serializeGroup(existing));

      throw error;
    }
  } catch (error) {
    console.error("POST /api/groups error", error);
    return json({ error: "Failed to save group to MongoDB" }, 500);
  }
}
