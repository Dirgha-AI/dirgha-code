/**
 * gpu/jobs.ts — Persistent GPU job queue + budget tracker
 *
 * Stores running/completed GPU jobs in ~/.dirgha/gpu-jobs.json.
 * Enforces budget caps set via `dirgha config set gpu-budget $50`.
 * Writes audit log to ~/.dirgha/gpu-audit.jsonl.
 */
import { readFile, writeFile, mkdir, rename, appendFile } from "node:fs/promises";
import { readFileSync, existsSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
const DIR = () => join(homedir(), ".dirgha");
const JOBS_FILE = () => join(DIR(), "gpu-jobs.json");
const AUDIT_FILE = () => join(DIR(), "gpu-audit.jsonl");
const CONFIG_FILE = () => join(DIR(), "config.json");
function defaultJobs() {
    return { version: 1, jobs: [], totalSpend: 0 };
}
async function readJobs() {
    try {
        const raw = await readFile(JOBS_FILE(), "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return defaultJobs();
    }
}
async function writeJobs(data) {
    await mkdir(DIR(), { recursive: true }).catch(() => { });
    const tmp = JOBS_FILE() + ".tmp." + randomUUID().slice(0, 8);
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmp, JOBS_FILE()).catch(() => { });
}
function readConfig() {
    try {
        return JSON.parse(readFileSync(CONFIG_FILE(), "utf-8"));
    }
    catch {
        return {};
    }
}
function writeConfig(config) {
    const dir = DIR();
    if (!existsSync(dir))
        return;
    const tmp = CONFIG_FILE() + ".tmp";
    writeFileSync(tmp, JSON.stringify(config, null, 2));
    renameSync(tmp, CONFIG_FILE());
}
/** Check if a new GPU job would exceed the budget. Returns error string or null. */
export async function checkBudget(costPerHr, estimatedHours) {
    const config = readConfig();
    const budget = config.gpuBudget ?? 0;
    if (budget <= 0)
        return null; // no cap
    const jobs = await readJobs();
    const projectedTotal = jobs.totalSpend + (costPerHr * estimatedHours);
    if (projectedTotal > budget) {
        return `GPU budget of $${budget.toFixed(2)} would be exceeded (projected: $${projectedTotal.toFixed(2)}). Increase budget with: dirgha config set gpu-budget ${Math.ceil(projectedTotal * 1.5)}`;
    }
    return null;
}
export function setBudget(amount) {
    const config = readConfig();
    config.gpuBudget = amount;
    writeConfig(config);
}
export function getBudget() {
    return readConfig().gpuBudget ?? 0;
}
// ── Job tracking ──────────────────────────────────────────────────────────────
export async function registerGPUJob(opts) {
    const data = await readJobs();
    const job = {
        id: randomUUID().slice(0, 12),
        status: "running",
        provider: opts.provider,
        gpuType: opts.gpuType,
        costPerHr: opts.costPerHr,
        totalCost: 0,
        startedAt: new Date().toISOString(),
        instanceId: opts.instanceId,
    };
    data.jobs.push(job);
    await writeJobs(data);
    // Audit log
    const line = JSON.stringify({ type: "job_start", ts: job.startedAt, job });
    await appendFile(AUDIT_FILE(), line + "\n").catch(() => { });
    return job;
}
export async function completeGPUJob(jobId, status, error) {
    const data = await readJobs();
    const job = data.jobs.find((j) => j.id === jobId);
    if (!job)
        return null;
    job.status = status;
    job.completedAt = new Date().toISOString();
    job.error = error;
    // Calculate actual cost
    const elapsedHrs = (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 3600000;
    job.totalCost = parseFloat((job.costPerHr * elapsedHrs).toFixed(6));
    data.totalSpend += job.totalCost;
    await writeJobs(data);
    const line = JSON.stringify({ type: "job_end", ts: job.completedAt, jobId, status, cost: job.totalCost });
    await appendFile(AUDIT_FILE(), line + "\n").catch(() => { });
    return job;
}
export async function listGPUJobs(status) {
    const data = await readJobs();
    if (status)
        return data.jobs.filter((j) => j.status === status);
    return data.jobs;
}
export async function getGPUJob(jobId) {
    const data = await readJobs();
    return data.jobs.find((j) => j.id === jobId) ?? null;
}
export async function totalGPUSpend() {
    const data = await readJobs();
    return data.totalSpend;
}
/** Read recent audit log entries */
export async function auditLog(limit = 20) {
    try {
        const raw = await readFile(AUDIT_FILE(), "utf-8");
        const lines = raw.trim().split("\n").filter(Boolean);
        return lines.slice(-limit);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=jobs.js.map