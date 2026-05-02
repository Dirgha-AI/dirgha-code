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
import type { Tool } from "./registry.js";
export interface CronJob {
    id: string;
    schedule: string;
    command: string;
    nextRunAt?: string;
    lastRunAt?: string;
    createdAt: string;
}
export interface CronToolOptions {
    /** Override the jobs file location (default: `~/.dirgha/cron/jobs.json`). */
    filePath?: string;
}
export declare function createCronTool(opts?: CronToolOptions): Tool;
