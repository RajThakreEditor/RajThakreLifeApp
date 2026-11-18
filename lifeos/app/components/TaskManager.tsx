"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const PRIORITIES = ["High", "Mid", "Low", "Neutral", "Will Decide"] as const;
const DEFAULT_GROUPS = ["Personal", "Work", "Finance"];
const GROUP_STORAGE_KEY = "lifeos.taskGroups";

type Priority = (typeof PRIORITIES)[number];

type Task = {
  id: string;
  _id?: string | null;
  name: string;
  priority: Priority;
  group: string;
  dueDate: string;
  note: string;
  completed: boolean;
  createdAt: string;
};

type FilterMode = "all" | "pending" | "completed";
type SortMode = "dueDate" | "priority" | "createdAt";

const PRIORITY_ORDER: Record<Priority, number> = {
  High: 0,
  Mid: 1,
  Low: 2,
  Neutral: 3,
  "Will Decide": 4,
};

function getTodayInputValue() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function formatDateForDisplay(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
}

function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && PRIORITIES.includes(value as Priority);
}

function mapServerTaskToTask(item: Record<string, unknown>): Task {
  const mongoId = typeof item._id === "string" ? item._id : null;
  const priority = isPriority(item.priority) ? item.priority : "Neutral";
  const group = typeof item.group === "string" ? item.group : "Personal";
  const dueDate = typeof item.dueDate === "string" && item.dueDate ? item.dueDate : getTodayInputValue();
  const createdAt = typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString();

  return {
    id: mongoId ?? (typeof item.id === "string" ? item.id : createdAt),
    _id: mongoId,
    name: typeof item.name === "string" ? item.name : "",
    priority,
    group,
    dueDate,
    note: typeof item.note === "string" ? item.note : "",
    completed: typeof item.completed === "boolean" ? item.completed : false,
    createdAt,
  };
}

function cleanGroups(groups: string[]) {
  const seen = new Set<string>();
  return groups
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getPriorityClassName(priority: Priority) {
  return `priority-${priority.replace(/\s+/g, "-")}`;
}

function parseStoredGroups(value: string | null) {
  if (!value) return DEFAULT_GROUPS;

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return DEFAULT_GROUPS;

    return cleanGroups([
      ...DEFAULT_GROUPS,
      ...parsed.filter((item): item is string => typeof item === "string"),
    ]);
  } catch {
    return DEFAULT_GROUPS;
  }
}

async function readApiError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return typeof data?.error === "string" ? data.error : fallback;
  } catch {
    return fallback;
  }
}

function readLegacyGroups() {
  try {
    return parseStoredGroups(window.localStorage.getItem(GROUP_STORAGE_KEY));
  } catch {
    return DEFAULT_GROUPS;
  }
}

function clearLegacyGroups() {
  try {
    window.localStorage.removeItem(GROUP_STORAGE_KEY);
  } catch {
    // The MongoDB copy is already saved, so an unavailable local cache is harmless.
  }
}

export default function TaskManager() {
  const today = useMemo(() => getTodayInputValue(), []);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskName, setTaskName] = useState("");
  const [priority, setPriority] = useState<Priority>("Neutral");
  const [groups, setGroups] = useState<string[]>(DEFAULT_GROUPS);
  const [group, setGroup] = useState(DEFAULT_GROUPS[0]);
  const [newGroup, setNewGroup] = useState("");
  const [isGroupsLoading, setIsGroupsLoading] = useState(true);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("dueDate");

  useEffect(() => {
    const controller = new AbortController();

    async function loadTasks() {
      setIsLoading(true);

      try {
        const res = await fetch("/api/tasks", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(await readApiError(res, "Could not load tasks from MongoDB."));
        }

        const data = await res.json();
        setTasks(
          Array.isArray(data)
            ? data
                .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
                .map(mapServerTaskToTask)
            : []
        );
        setError("");
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;

        setTasks([]);
        setError(e instanceof Error ? e.message : "Could not connect to MongoDB.");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadTasks();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGroups() {
      const legacyGroups = readLegacyGroups();
      setGroups(legacyGroups);
      setIsGroupsLoading(true);

      try {
        const response = await fetch("/api/groups", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readApiError(response, "Could not load groups from MongoDB."));
        }

        const data = await response.json();
        const serverGroups = cleanGroups(
          Array.isArray(data)
            ? data
                .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
                .map((item) => (typeof item.name === "string" ? item.name : ""))
            : []
        );
        const syncedGroups = [...serverGroups];
        const failedMigrations: string[] = [];

        for (const legacyGroup of legacyGroups) {
          if (syncedGroups.some((item) => item.toLowerCase() === legacyGroup.toLowerCase())) {
            continue;
          }

          try {
            const migrationResponse = await fetch("/api/groups", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: legacyGroup }),
              signal: controller.signal,
            });

            if (!migrationResponse.ok) {
              throw new Error(await readApiError(migrationResponse, "Could not migrate a saved group to MongoDB."));
            }

            const savedGroup = await migrationResponse.json();
            if (typeof savedGroup?.name !== "string") {
              throw new Error("MongoDB returned an invalid group.");
            }

            syncedGroups.push(savedGroup.name);
          } catch (migrationError) {
            if (controller.signal.aborted) throw migrationError;
            failedMigrations.push(legacyGroup);
          }
        }

        if (controller.signal.aborted) return;

        const visibleGroups = cleanGroups(
          failedMigrations.length > 0 ? [...syncedGroups, ...legacyGroups] : syncedGroups
        );
        setGroups(visibleGroups);
        setGroup((currentGroup) =>
          visibleGroups.find((item) => item.toLowerCase() === currentGroup.toLowerCase()) ??
          visibleGroups[0] ??
          DEFAULT_GROUPS[0]
        );

        if (failedMigrations.length > 0) {
          setGroupError(
            `Could not sync ${failedMigrations.length} saved group${failedMigrations.length === 1 ? "" : "s"} to MongoDB. They remain on this device and will retry next time.`
          );
        } else {
          clearLegacyGroups();
          setGroupError("");
        }
      } catch (error) {
        if (controller.signal.aborted) return;

        setGroups(legacyGroups);
        setGroup((currentGroup) =>
          legacyGroups.find((item) => item.toLowerCase() === currentGroup.toLowerCase()) ??
          legacyGroups[0] ??
          DEFAULT_GROUPS[0]
        );
        setGroupError(
          error instanceof Error
            ? error.message
            : "Could not load groups from MongoDB. Existing browser groups were kept on this device."
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsGroupsLoading(false);
        }
      }
    }

    void loadGroups();

    return () => controller.abort();
  }, []);

  const completed = tasks.filter((task) => task.completed).length;
  const pending = tasks.length - completed;
  const highPriority = tasks.filter((task) => task.priority === "High" && !task.completed).length;

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tasks.filter((task) => {
      const matchesQuery = !query
        ? true
        : [task.name, task.priority, task.group, task.note]
            .join(" ")
            .toLowerCase()
            .includes(query);

      const matchesFilter =
        filterMode === "all"
          ? true
          : filterMode === "pending"
            ? !task.completed
            : task.completed;

      return matchesQuery && matchesFilter;
    });
  }, [tasks, search, filterMode]);

  const visibleTasks = useMemo(() => {
    const sorted = [...filteredTasks];

    sorted.sort((a, b) => {
      if (sortMode === "priority") {
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }

      if (sortMode === "createdAt") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      return (
        a.dueDate.localeCompare(b.dueDate) ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      );
    });

    return sorted;
  }, [filteredTasks, sortMode]);

  const completionRate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  const createGroup = async () => {
    const cleanGroup = newGroup.trim();

    if (!cleanGroup) {
      setGroupError("Please enter a group name to add a new group.");
      return;
    }

    try {
      setIsSavingGroup(true);
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanGroup }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not save group to MongoDB."));
      }

      const savedGroup = await response.json();
      if (typeof savedGroup?.name !== "string") {
        throw new Error("MongoDB returned an invalid group.");
      }

      setGroups((currentGroups) => cleanGroups([...currentGroups, savedGroup.name]));
      setGroup(savedGroup.name);
      setGroupError("");
      setNewGroup("");
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : "Could not save group to MongoDB.");
    } finally {
      setIsSavingGroup(false);
    }
  };

  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanName = taskName.trim();

    if (!cleanName) {
      setError("Enter a task name.");
      return;
    }

    if (!dueDate || dueDate < today) {
      setError("Choose today or a future due date.");
      return;
    }

    const newTask = {
      name: cleanName,
      priority,
      group,
      dueDate,
      note: note.trim(),
    };

    try {
      setIsSaving(true);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "Could not save task to MongoDB."));
      }

      const created = await res.json();
      const clientTask = mapServerTaskToTask(created);
      setTasks((currentTasks) => [clientTask, ...currentTasks]);
      setTaskName("");
      setPriority("Neutral");
      setDueDate(today);
      setNote("");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save task to MongoDB.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    if (!task._id) {
      setError("This task is missing its MongoDB id.");
      return;
    }

    const updated = { ...task, completed: !task.completed };

    setTasks((currentTasks) =>
      currentTasks.map((t) => (t.id === id ? updated : t))
    );

    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: task._id, completed: updated.completed }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "Could not update task in MongoDB."));
      }

      const saved = await res.json();
      const syncedTask = mapServerTaskToTask(saved);
      setTasks((currentTasks) =>
        currentTasks.map((t) => (t.id === id ? syncedTask : t))
      );
      setError("");
    } catch (e) {
      setTasks((currentTasks) =>
        currentTasks.map((t) => (t.id === id ? task : t))
      );
      setError(e instanceof Error ? e.message : "Could not update task in MongoDB.");
    }
  };

  const deleteTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    if (!task._id) {
      setError("This task is missing its MongoDB id.");
      return;
    }

    const previousTasks = tasks;
    setTasks((currentTasks) => currentTasks.filter((t) => t.id !== id));

    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: task._id }),
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "Could not delete task from MongoDB."));
      }

      setError("");
    } catch (e) {
      setTasks(previousTasks);
      setError(e instanceof Error ? e.message : "Could not delete task from MongoDB.");
    }
  };

  const markAllDone = async () => {
    const pendingTasks = tasks.filter((task) => !task.completed);
    if (pendingTasks.length === 0) return;

    const missingMongoId = pendingTasks.some((task) => !task._id);
    if (missingMongoId) {
      setError("Some tasks are missing MongoDB ids.");
      return;
    }

    const previousTasks = tasks;

    setTasks((currentTasks) =>
      currentTasks.map((task) => (task.completed ? task : { ...task, completed: true }))
    );

    try {
      await Promise.all(
        pendingTasks.map(async (task) => {
          const res = await fetch("/api/tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ _id: task._id, completed: true }),
          });

          if (!res.ok) {
            throw new Error(await readApiError(res, "Could not update all tasks in MongoDB."));
          }
        })
      );
      setError("");
    } catch (e) {
      setTasks(previousTasks);
      setError(e instanceof Error ? e.message : "Could not update all tasks in MongoDB.");
    }
  };

  return (
    <div className="task-shell">
      <div className="page">
        <section className="hero">
          <div className="hero-top">
            <div>
              <p className="pill">Task Planner - Todo</p>
            </div>

          </div>

          <div className="hero-metrics">
            <div className="metric-card">
              <div className="metric-label">Total</div>
              <div className="metric-value">{tasks.length}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Done</div>
              <div className="metric-value">{completed}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Urgent</div>
              <div className="metric-value">{highPriority}</div>
            </div>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel">
            <form onSubmit={addTask}>
              <div className="list-head">
                <div>
                  <h2>Create a task</h2>
                  <p className="panel-subtitle">Capture what matters, then move on.</p>
                </div>
                <div className="pill">{pending} pending</div>
              </div>

              <div className="task-form-grid">
                <input
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="What needs to be done?"
                  className="field"
                />

                <div className="chip-group">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`chip ${priority === p ? "active" : ""}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="row">
                  <select
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    className="field field-compact"
                    disabled={isGroupsLoading}
                  >
                    {groups.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>

                  <input
                    type="date"
                    value={dueDate}
                    min={today}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="field field-compact"
                  />
                </div>

                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note..."
                  className="field field-textarea"
                />

                <div className="row">
                  <input
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    placeholder="Create new group"
                    className="field field-grow"
                    disabled={isGroupsLoading || isSavingGroup}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void createGroup()}
                    disabled={isGroupsLoading || isSavingGroup}
                  >
                    {isGroupsLoading ? "Loading..." : isSavingGroup ? "Saving..." : "Add group"}
                  </button>
                </div>

                {groupError ? <div className="error-text">{groupError}</div> : null}

                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Add task"}
                </button>

                {error ? <div className="error-text">{error}</div> : null}
              </div>
            </form>

            <div className="task-board-section">
              <div className="list-head">
                <div>
                  <h3>Task board</h3>
                  <p className="panel-subtitle">Sorted by priority and due date.</p>
                </div>

                <div className="row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={isLoading || pending === 0}
                    onClick={() => {
                      void markAllDone();
                    }}
                  >
                    Mark all done
                  </button>

                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="field field-sort"
                  >
                    <option value="dueDate">Sort by due date</option>
                    <option value="priority">Sort by priority</option>
                    <option value="createdAt">Sort by newest</option>
                  </select>
                </div>
              </div>

              <div className="chip-group chip-group-tight">
                {[
                  { key: "all", label: "All" },
                  { key: "pending", label: "Pending" },
                  { key: "completed", label: "Completed" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilterMode(item.key as FilterMode)}
                    className={`chip ${filterMode === item.key ? "active" : ""}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks..."
                className="field task-search"
              />

              {isLoading ? (
                <div className="empty-state">
                  <strong>Loading tasks from MongoDB</strong>
                </div>
              ) : visibleTasks.length === 0 ? (
                <div className="empty-state">
                  <strong>No tasks found</strong>
                  <div className="empty-state-note">
                    Try changing filters or add a new task to get started.
                  </div>
                </div>
              ) : (
                <div className="task-list">
                  {visibleTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`task-card ${task.completed ? "completed" : ""}`}
                    >
                      <div className="task-main">
                        <div className="task-title-row">
                          <p className={`task-title ${task.completed ? "completed" : ""}`}>
                            {task.name}
                          </p>
                          <span className={`priority-badge ${getPriorityClassName(task.priority)}`}>
                            {task.priority}
                          </span>
                        </div>

                        <div className="task-meta">
                          <span>{task.group}</span>
                          <span>•</span>
                          <span>{formatDateForDisplay(task.dueDate)}</span>
                          {task.note ? (
                            <>
                              <span>•</span>
                              <span>{task.note}</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="task-actions">
                        <label className="task-done-label">
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => {
                              void toggleTask(task.id);
                            }}
                          />
                          Done
                        </label>

                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => {
                            void deleteTask(task.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="side-stack">
            <section className="panel">
              <h3>Today’s snapshot</h3>
              <div className="snapshot-grid">
                <div className="metric-card">
                  <div className="metric-label">Completion</div>
                  <div className="metric-value">{completionRate}%</div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Pending</div>
                  <div className="metric-value">{pending}</div>
                </div>

                <div className="metric-card">
                  <div className="metric-label">Completed</div>
                  <div className="metric-value">{completed}</div>
                </div>
              </div>
            </section>

            <section className="panel">
              <h3>Groups</h3>
              <p className="panel-subtitle">Use groups to keep your work organized.</p>

              <div className="group-list">
                {groups.map((item) => (
                  <div key={item} className={`group-item ${group === item ? "active" : ""}`}>
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
