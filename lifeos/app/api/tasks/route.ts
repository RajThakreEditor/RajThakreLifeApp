import { ObjectId } from "mongodb";
import { getDb } from "../../../lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASK_COLLECTION = "tasks";
const PRIORITIES = ["High", "Mid", "Low", "Neutral", "Will Decide"] as const;

type Priority = (typeof PRIORITIES)[number];

type TaskDocument = {
  _id?: ObjectId;
  name: string;
  priority: Priority;
  group: string;
  dueDate: string;
  note: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function databaseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/tlsv1 alert internal error|SSL routines|ERR_SSL/i.test(message)) {
    return `MongoDB TLS connection failed under Node.js ${process.version}. Check MongoDB Atlas Network Access and use the supported Node.js 22 or 24 LTS runtime.`;
  }

  if (/MONGODB_URI/i.test(message)) {
    return "MONGODB_URI is missing from lifeos/.env.local.";
  }

  if (/authentication failed|bad auth|not authorized/i.test(message)) {
    return "MongoDB rejected authentication. Check that MONGODB_URI uses an Atlas database user with the correct password. Percent-encode reserved characters in the username or password.";
  }

  if (/querySrv ENOTFOUND|ENOTFOUND.*_mongodb\._tcp/i.test(message)) {
    return "MongoDB Atlas cluster hostname could not be found. Copy the current connection URI from Atlas and update MONGODB_URI in lifeos/.env.local.";
  }

  return "Failed to create task in MongoDB";
}

async function getTasksCollection() {
  const db = await getDb();
  return db.collection<TaskDocument>(TASK_COLLECTION);
}

function serializeTask(task: TaskDocument | null) {
  if (!task) return null;

  return {
    ...task,
    _id: task._id?.toString() ?? null,
  };
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizePriority(value: unknown): Priority {
  return typeof value === "string" && PRIORITIES.includes(value as Priority)
    ? (value as Priority)
    : "Neutral";
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET() {
  try {
    const collection = await getTasksCollection();
    const tasks = await collection.find({}).sort({ createdAt: -1 }).toArray();

    return json(tasks.map(serializeTask));
  } catch (err) {
    console.error("GET /api/tasks error", err);
    return json({ error: "Failed to fetch tasks from MongoDB" }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const name = cleanString(data.name);
    const dueDate = cleanString(data.dueDate);

    if (!name) {
      return json({ error: "Task name is required" }, 400);
    }

    if (!isValidDateInput(dueDate)) {
      return json({ error: "Due date must be in YYYY-MM-DD format" }, 400);
    }

    const now = new Date().toISOString();
    const task: TaskDocument = {
      name,
      priority: normalizePriority(data.priority),
      group: cleanString(data.group, "Personal") || "Personal",
      dueDate,
      note: cleanString(data.note),
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    const collection = await getTasksCollection();
    const result = await collection.insertOne(task);
    const inserted = await collection.findOne({ _id: result.insertedId });

    return json(serializeTask(inserted), 201);
  } catch (err) {
    console.error("POST /api/tasks error", err);
    return json({ error: databaseErrorMessage(err) }, 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const data = await request.json();
    const { _id, ...updates } = data;

    if (typeof _id !== "string" || !ObjectId.isValid(_id)) {
      return json({ error: "Valid _id is required" }, 400);
    }

    const updateDoc: Partial<TaskDocument> = {};

    if (typeof updates.completed === "boolean") {
      updateDoc.completed = updates.completed;
    }

    if (typeof updates.name === "string" && updates.name.trim()) {
      updateDoc.name = updates.name.trim();
    }

    if (typeof updates.priority !== "undefined") {
      updateDoc.priority = normalizePriority(updates.priority);
    }

    if (typeof updates.group === "string" && updates.group.trim()) {
      updateDoc.group = updates.group.trim();
    }

    if (typeof updates.dueDate === "string" && isValidDateInput(updates.dueDate)) {
      updateDoc.dueDate = updates.dueDate;
    }

    if (typeof updates.note === "string") {
      updateDoc.note = updates.note.trim();
    }

    if (Object.keys(updateDoc).length === 0) {
      return json({ error: "No valid fields to update" }, 400);
    }

    updateDoc.updatedAt = new Date().toISOString();

    const collection = await getTasksCollection();
    const updatedTask = await collection.findOneAndUpdate(
      { _id: new ObjectId(_id) },
      { $set: updateDoc },
      { returnDocument: "after" }
    );

    if (!updatedTask) {
      return json({ error: "Task not found" }, 404);
    }

    return json(serializeTask(updatedTask));
  } catch (err) {
    console.error("PATCH /api/tasks error", err);
    return json({ error: "Failed to update task in MongoDB" }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const data = await request.json();
    const { _id } = data;

    if (typeof _id !== "string" || !ObjectId.isValid(_id)) {
      return json({ error: "Valid _id is required" }, 400);
    }

    const collection = await getTasksCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(_id) });

    if (result.deletedCount === 0) {
      return json({ error: "Task not found" }, 404);
    }

    return json({ success: true });
  } catch (err) {
    console.error("DELETE /api/tasks error", err);
    return json({ error: "Failed to delete task from MongoDB" }, 500);
  }
}
