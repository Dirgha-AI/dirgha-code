/**
 * goal.ts — Persistent goal/objective store at ~/.dirgha/goal.json
 *
 * A single persistent objective that survives restarts. The agent can
 * reference it, update progress, and the user can set/view/clear/pause
 * it via the /goal slash command.
 *
 * Mirrors the tasks/memory/credentials atomic-tmp+rename pattern.
 */
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
const DIR = () => join(homedir(), ".dirgha");
const FILE = () => join(DIR(), "goal.json");
async function ensureDir() {
    await mkdir(DIR(), { recursive: true }).catch(() => { });
}
async function readGoal() {
    try {
        const raw = await readFile(FILE(), "utf-8");
        const data = JSON.parse(raw);
        return data.goal;
    }
    catch {
        return null;
    }
}
async function writeGoal(goal) {
    await ensureDir();
    const data = { version: 1, goal };
    const tmp = FILE() + ".tmp";
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmp, FILE()).catch(() => { });
}
// ── Public API ──────────────────────────────────────────────────────────────
export async function getGoal() {
    return readGoal();
}
export async function setGoal(opts) {
    const goal = {
        title: opts.title,
        description: opts.description,
        progress: 0,
        status: "active",
        tags: opts.tags,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
    };
    await writeGoal(goal);
    return goal;
}
export async function updateGoalProgress(progress) {
    const goal = await readGoal();
    if (!goal)
        return null;
    goal.progress = Math.max(0, Math.min(100, progress));
    goal.updated = new Date().toISOString();
    if (progress >= 100)
        goal.status = "done";
    await writeGoal(goal);
    return goal;
}
export async function updateGoalStatus(status) {
    const goal = await readGoal();
    if (!goal)
        return null;
    goal.status = status;
    if (status === "done")
        goal.progress = 100;
    goal.updated = new Date().toISOString();
    await writeGoal(goal);
    return goal;
}
export async function clearGoal() {
    await writeGoal(null);
}
//# sourceMappingURL=goal.js.map