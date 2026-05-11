import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  createTask,
  updateTask,
  listTasks,
  deleteTask,
  getTask,
  taskSummary,
  type Task,
} from "../context/tasks.js";
import { unlinkSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const TMP_DIR = "/tmp/dirgha-test-tasks-" + randomUUID().slice(0, 8);
const TEST_FILE = join(TMP_DIR, ".dirgha", "tasks.json");
const OLD_HOME = process.env.HOME;

beforeAll(() => {
  mkdirSync(join(TMP_DIR, ".dirgha"), { recursive: true });
  process.env.HOME = TMP_DIR;
});

afterAll(() => {
  process.env.HOME = OLD_HOME ?? homedir();
  rmSync(TMP_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  // Clean tasks between tests by writing empty file
  const { writeFileSync, renameSync } = await import("node:fs");
  const tmp = TEST_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify({ version: 1, tasks: [] }));
  renameSync(tmp, TEST_FILE);
});

describe("task CRUD", () => {
  it("creates a task with default status pending", async () => {
    const t = await createTask({ title: "Test task" });
    expect(t.id).toBeTruthy();
    expect(t.title).toBe("Test task");
    expect(t.status).toBe("pending");
    expect(t.created).toBeTruthy();
    expect(t.updated).toBeTruthy();
  });

  it("creates task with all optional fields", async () => {
    const t = await createTask({
      title: "Full task",
      description: "description",
      priority: "high",
      project: "test",
      tags: ["a", "b"],
    });
    expect(t.priority).toBe("high");
    expect(t.project).toBe("test");
    expect(t.tags).toEqual(["a", "b"]);
    expect(t.description).toBe("description");
  });

  it("lists tasks", async () => {
    await createTask({ title: "Task 1" });
    await createTask({ title: "Task 2" });
    const all = await listTasks();
    expect(all.length).toBe(2);
  });

  it("filters tasks by status", async () => {
    const t1 = await createTask({ title: "T1" });
    await updateTask(t1.id, { status: "done" });
    await createTask({ title: "T2" });
    const pending = await listTasks("pending");
    const done = await listTasks("done");
    expect(pending.length).toBe(1);
    expect(done.length).toBe(1);
  });

  it("updates task fields", async () => {
    const t = await createTask({ title: "Original" });
    const updated = await updateTask(t.id, {
      title: "Updated",
      status: "in_progress",
      progress: 50,
    });
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Updated");
    expect(updated!.status).toBe("in_progress");
    expect(updated!.progress).toBe(50);
  });

  it("clamps progress 0-100", async () => {
    const t = await createTask({ title: "Clamp" });
    const updated = await updateTask(t.id, { progress: 150 });
    expect(updated!.progress).toBe(100);
    const updated2 = await updateTask(t.id, { progress: -10 });
    expect(updated2!.progress).toBe(0);
  });

  it("getTask returns null for missing", async () => {
    const t = await getTask("nonexistent");
    expect(t).toBeNull();
  });

  it("getTask returns task by id", async () => {
    const created = await createTask({ title: "Find me" });
    const found = await getTask(created.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe("Find me");
  });

  it("deletes task", async () => {
    const t = await createTask({ title: "Delete me" });
    expect(await deleteTask(t.id)).toBe(true);
    expect(await getTask(t.id)).toBeNull();
    expect(await deleteTask("nonexistent")).toBe(false);
  });

  it("taskSummary returns correct counts", async () => {
    const t1 = await createTask({ title: "P1" });
    const t2 = await createTask({ title: "P2" });
    await updateTask(t1.id, { status: "in_progress" });
    await updateTask(t2.id, { status: "done" });
    await createTask({ title: "P3" });
    const s = await taskSummary();
    expect(s.total).toBe(3);
    expect(s.pending).toBe(1);
    expect(s.inProgress).toBe(1);
    expect(s.done).toBe(1);
    expect(s.blocked).toBe(0);
  });

  it("persists across reads (file I/O)", async () => {
    await createTask({ title: "Persist test" });
    const all = await listTasks();
    expect(all.length).toBe(1);
    expect(all[0].title).toBe("Persist test");
  });

  it("handles empty file gracefully", async () => {
    const s = await taskSummary();
    expect(s.total).toBe(0);
    const all = await listTasks();
    expect(all.length).toBe(0);
  });
});
