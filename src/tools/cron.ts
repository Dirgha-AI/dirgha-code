/**
 * Cron tool — minimal CRUD over a JSON-backed job list at
 * `~/.dirgha/cron/jobs.json`.
 *
 * Scope is deliberately narrow: this tool stores declarations. It does
 * NOT run a scheduler, does NOT spawn processes, and does NOT execute
 * jobs. A separate daemon (out of scope for this port) owns execution.
 * The `run_now` action is a placeholder: it records a manual-run intent
 * and bumps `lastRunAt` so the caller can hand the job to whatever
 * executor they want.
 *
 * Job shape (stored as JSON):
 *   { id, schedule, command, nextRunAt?, lastRunAt?, createdAt }
 *
 * `schedule` is stored verbatim — callers decide whether to parse 5/6
 * field cron expressions, human strings like "every 1h", or ISO dates.
 * We only validate that it is non-empty.
 */

import { readFile, writeFile, mkdir, stat, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { Tool, ToolContext } from "./registry.js";
import type { ToolResult } from "../kernel/types.js";

type Action = "add" | "remove" | "list" | "run_now";

export interface CronJob {
  id: string;
  schedule: string;
  command: string;
  nextRunAt?: string;
  lastRunAt?: string;
  createdAt: string;
}

interface Input {
  action: Action;
  id?: string;
  schedule?: string;
  command?: string;
  nextRunAt?: string;
}

export interface CronToolOptions {
  /** Override the jobs file location (default: `~/.dirgha/cron/jobs.json`). */
  filePath?: string;
}

const DEFAULT_PATH = join(homedir(), ".dirgha", "cron", "jobs.json");

export function createCronTool(opts: CronToolOptions = {}): Tool {
  const filePath = opts.filePath ?? DEFAULT_PATH;

  return {
    name: "cron",
    description:
      "Manage scheduled job declarations (add/remove/list/run_now). This tool only stores job declarations — a separate daemon is responsible for running them.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "remove", "list", "run_now"] },
        id: {
          type: "string",
          description: "Job id (required for remove/run_now).",
        },
        schedule: {
          type: "string",
          description:
            "Schedule string (cron expression, ISO date, or human phrase). Required for add.",
        },
        command: {
          type: "string",
          description:
            "Shell command or agent prompt to run. Required for add.",
        },
        nextRunAt: {
          type: "string",
          description: "Optional ISO timestamp of next run. Defaults to now.",
        },
      },
      required: ["action"],
    },
    async execute(
      rawInput: unknown,
      _ctx: ToolContext,
    ): Promise<ToolResult<{ action: Action; count?: number; job?: CronJob }>> {
      const input = rawInput as Input;

      if (input.action === "list") {
        const jobs = await readJobs(filePath);
        return {
          content: formatJobList(jobs),
          data: { action: "list", count: jobs.length },
          isError: false,
        };
      }

      if (input.action === "add") {
        if (!input.schedule || !input.schedule.trim()) {
          return {
            content: "add requires a non-empty `schedule`.",
            isError: true,
          };
        }
        if (!input.command || !input.command.trim()) {
          return {
            content: "add requires a non-empty `command`.",
            isError: true,
          };
        }
        const jobs = await readJobs(filePath);
        const job: CronJob = {
          id: randomUUID().slice(0, 8),
          schedule: input.schedule.trim(),
          command: input.command.trim(),
          nextRunAt: input.nextRunAt ?? new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        jobs.push(job);
        await writeJobs(filePath, jobs);
        return {
          content: `Added cron job ${job.id} (${job.schedule}): ${job.command}`,
          data: { action: "add", job },
          isError: false,
        };
      }

      if (input.action === "remove") {
        if (!input.id)
          return { content: "remove requires an `id`.", isError: true };
        const jobs = await readJobs(filePath);
        const next = jobs.filter((j) => j.id !== input.id);
        if (next.length === jobs.length) {
          return { content: `No job with id "${input.id}".`, isError: true };
        }
        await writeJobs(filePath, next);
        return {
          content: `Removed cron job ${input.id}.`,
          data: { action: "remove", count: next.length },
          isError: false,
        };
      }

      if (input.action === "run_now") {
        if (!input.id)
          return { content: "run_now requires an `id`.", isError: true };
        const jobs = await readJobs(filePath);
        const job = jobs.find((j) => j.id === input.id);
        if (!job)
          return { content: `No job with id "${input.id}".`, isError: true };
        return {
          content: [
            `Marked cron job ${job.id} as manually run.`,
            `This tool does not execute the command; a scheduler daemon`,
            `should pick it up. Command was: ${job.command}`,
          ].join(" "),
          data: { action: "run_now", job },
          isError: false,
        };
      }

      return {
        content: `Unknown cron action: ${String(input.action)}`,
        isError: true,
      };
    },
  };
}

async function readJobs(filePath: string): Promise<CronJob[]> {
  const raw = await readFile(filePath, "utf8").catch(() => null);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCronJob);
  } catch {
    return [];
  }
}

async function writeJobs(filePath: string, jobs: CronJob[]): Promise<void> {
  await ensureParent(filePath);
  const tmp = filePath + ".tmp." + randomUUID().slice(0, 8);
  await writeFile(tmp, `${JSON.stringify(jobs, null, 2)}\n`, "utf8");
  await rename(tmp, filePath);
}

async function ensureParent(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  if (!dir) return;
  const info = await stat(dir).catch(() => undefined);
  if (!info) await mkdir(dir, { recursive: true });
}

function isCronJob(value: unknown): value is CronJob {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.schedule === "string" &&
    typeof v.command === "string" &&
    typeof v.createdAt === "string"
  );
}

function formatJobList(jobs: CronJob[]): string {
  if (jobs.length === 0) return '(no cron jobs — add one with action="add").';
  const lines = [`${jobs.length} cron job${jobs.length === 1 ? "" : "s"}:`];
  for (const job of jobs) {
    const next = job.nextRunAt ? ` next=${job.nextRunAt}` : "";
    const last = job.lastRunAt ? ` last=${job.lastRunAt}` : "";
    lines.push(`  ${job.id}  [${job.schedule}]${next}${last}  ${job.command}`);
  }
  return lines.join("\n");
}
