/**
 * tasks.ts — Persistent task/todo store at ~/.dirgha/tasks.json
 *
 * Mirrors the memory/ledger/credentials pattern: atomic tmp+rename JSON.
 * Tasks survive restarts and are visible in the TUI.
 */
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
const DIR = () => join(homedir(), ".dirgha");
const FILE = () => join(DIR(), "tasks.json");
const DEFAULT = { version: 1, tasks: [] };
async function ensureDir() {
    await mkdir(DIR(), { recursive: true }).catch(() => { });
}
async function readTasks() {
    try {
        const raw = await readFile(FILE(), "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return DEFAULT;
    }
}
async function writeTasks(mutate) {
    await ensureDir();
    const data = await readTasks();
    const before = JSON.stringify(data);
    mutate(data);
    const after = JSON.stringify(data);
    if (after === before)
        return;
    const tmp = FILE() + ".tmp." + randomUUID().slice(0, 8);
    await writeFile(tmp, after, "utf-8");
    await rename(tmp, FILE()).catch(() => { });
}
// ── Public API ──────────────────────────────────────────────────────────────
export function taskId() {
    return randomUUID().slice(0, 12);
}
export async function listTasks(status) {
    const data = await readTasks();
    if (status)
        return data.tasks.filter((t) => t.status === status);
    return data.tasks;
}
export async function getTask(id) {
    const data = await readTasks();
    return data.tasks.find((t) => t.id === id) ?? null;
}
export async function createTask(opts) {
    let created;
    await writeTasks((data) => {
        const task = {
            id: taskId(),
            title: opts.title,
            description: opts.description,
            status: "pending",
            priority: opts.priority,
            project: opts.project,
            tags: opts.tags,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
        };
        data.tasks.push(task);
        created = task;
    });
    return created;
}
export async function updateTask(id, changes) {
    let updated = null;
    await writeTasks((data) => {
        const task = data.tasks.find((t) => t.id === id);
        if (!task)
            return;
        Object.assign(task, changes, { updated: new Date().toISOString() });
        if (task.progress !== undefined)
            task.progress = Math.max(0, Math.min(100, task.progress));
        updated = task;
    });
    return updated;
}
export async function deleteTask(id) {
    let found = false;
    await writeTasks((data) => {
        const idx = data.tasks.findIndex((t) => t.id === id);
        if (idx === -1)
            return;
        data.tasks.splice(idx, 1);
        found = true;
    });
    return found;
}
/** Return summary counts for the TUI */
export async function taskSummary() {
    const data = await readTasks();
    const tasks = data.tasks;
    return {
        total: tasks.length,
        pending: tasks.filter((t) => t.status === "pending").length,
        inProgress: tasks.filter((t) => t.status === "in_progress").length,
        done: tasks.filter((t) => t.status === "done").length,
        blocked: tasks.filter((t) => t.status === "blocked").length,
    };
}
//# sourceMappingURL=tasks.js.map