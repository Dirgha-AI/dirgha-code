/**
 * gpu/jobs.ts — Persistent GPU job queue + budget tracker
 *
 * Stores running/completed GPU jobs in ~/.dirgha/gpu-jobs.json.
 * Enforces budget caps set via `dirgha config set gpu-budget $50`.
 * Writes audit log to ~/.dirgha/gpu-audit.jsonl.
 */

import { readFile, writeFile, mkdir, rename, appendFile } from "node:fs/promises";
import { readFileSync, existsSync, writeFileSync, renameSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

const DIR = () => join(homedir(), ".dirgha");
const JOBS_FILE = () => join(DIR(), "gpu-jobs.json");
const AUDIT_FILE = () => join(DIR(), "gpu-audit.jsonl");
const CONFIG_FILE = () => join(DIR(), "config.json");

export type GPUJobStatus = "running" | "completed" | "failed" | "cancelled";

export interface GPUJob {
  id: string;
  status: GPUJobStatus;
  provider: string;
  gpuType: string;
  costPerHr: number;
  totalCost: number;
  startedAt: string;
  completedAt?: string;
  instanceId?: string;
  error?: string;
}

interface JobsFile {
  version: 1;
  jobs: GPUJob[];
  totalSpend: number;   // accumulated lifetime spend in USD
}

function defaultJobs(): JobsFile {
  return { version: 1, jobs: [], totalSpend: 0 };
}

async function readJobs(): Promise<JobsFile> {
  try {
    const raw = await readFile(JOBS_FILE(), "utf-8");
    return JSON.parse(raw) as JobsFile;
  } catch {
    return defaultJobs();
  }
}

async function writeJobs(data: JobsFile): Promise<void> {
  await mkdir(DIR(), { recursive: true }).catch(() => {});
  const tmp = JOBS_FILE() + ".tmp." + randomUUID().slice(0, 8);
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await rename(tmp, JOBS_FILE()).catch(() => {});
}

// ── Budget ────────────────────────────────────────────────────────────────────

interface Config {
  gpuBudget?: number;  // USD, 0 = unlimited
}

function readConfig(): Config {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE(), "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(config: Config): void {
  const dir = DIR();
  if (!existsSync(dir)) return;
  const tmp = CONFIG_FILE() + ".tmp";
  writeFileSync(tmp, JSON.stringify(config, null, 2));
  renameSync(tmp, CONFIG_FILE());
}

/** Check if a new GPU job would exceed the budget. Returns error string or null. */
export async function checkBudget(costPerHr: number, estimatedHours: number): Promise<string | null> {
  const config = readConfig();
  const budget = config.gpuBudget ?? 0;
  if (budget <= 0) return null; // no cap

  const jobs = await readJobs();
  const projectedTotal = jobs.totalSpend + (costPerHr * estimatedHours);
  if (projectedTotal > budget) {
    return `GPU budget of $${budget.toFixed(2)} would be exceeded (projected: $${projectedTotal.toFixed(2)}). Increase budget with: dirgha config set gpu-budget ${Math.ceil(projectedTotal * 1.5)}`;
  }
  return null;
}

export function setBudget(amount: number): void {
  const config = readConfig();
  config.gpuBudget = amount;
  writeConfig(config);
}

export function getBudget(): number {
  return readConfig().gpuBudget ?? 0;
}

// ── Job tracking ──────────────────────────────────────────────────────────────

export async function registerGPUJob(opts: {
  provider: string;
  gpuType: string;
  costPerHr: number;
  instanceId?: string;
}): Promise<GPUJob> {
  const data = await readJobs();
  const job: GPUJob = {
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
  await appendFile(AUDIT_FILE(), line + "\n").catch(() => {});

  return job;
}

export async function completeGPUJob(
  jobId: string,
  status: "completed" | "failed" | "cancelled",
  error?: string,
): Promise<GPUJob | null> {
  const data = await readJobs();
  const job = data.jobs.find((j) => j.id === jobId);
  if (!job) return null;

  job.status = status;
  job.completedAt = new Date().toISOString();
  job.error = error;

  // Calculate actual cost
  const elapsedHrs = (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 3600000;
  job.totalCost = parseFloat((job.costPerHr * elapsedHrs).toFixed(6));
  data.totalSpend += job.totalCost;

  await writeJobs(data);

  const line = JSON.stringify({ type: "job_end", ts: job.completedAt, jobId, status, cost: job.totalCost });
  await appendFile(AUDIT_FILE(), line + "\n").catch(() => {});

  return job;
}

export async function listGPUJobs(status?: GPUJobStatus): Promise<GPUJob[]> {
  const data = await readJobs();
  if (status) return data.jobs.filter((j) => j.status === status);
  return data.jobs;
}

export async function getGPUJob(jobId: string): Promise<GPUJob | null> {
  const data = await readJobs();
  return data.jobs.find((j) => j.id === jobId) ?? null;
}

export async function totalGPUSpend(): Promise<number> {
  const data = await readJobs();
  return data.totalSpend;
}

/** Read recent audit log entries */
export async function auditLog(limit = 20): Promise<string[]> {
  try {
    const raw = await readFile(AUDIT_FILE(), "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.slice(-limit);
  } catch {
    return [];
  }
}
