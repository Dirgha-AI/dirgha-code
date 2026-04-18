/**
 * cron/store.ts — SQLite-backed cron job store.
 * Uses the existing ~/.dirgha/dirgha.db via session/db.
 */
import { getDB } from '../session/db.js';
import crypto from 'node:crypto';

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: number;
  last_run: string | null;
  next_run: string;
  created_at: string;
}

export function initCronTable(): void {
  getDB().exec(`
    CREATE TABLE IF NOT EXISTS cron_jobs (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      schedule   TEXT NOT NULL,
      command    TEXT NOT NULL,
      enabled    INTEGER NOT NULL DEFAULT 1,
      last_run   TEXT,
      next_run   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export function addJob(name: string, schedule: string, command: string): string {
  initCronTable();
  const id = crypto.randomUUID().slice(0, 8);
  const nextRun = parseSchedule(schedule).toISOString();
  getDB().prepare(
    `INSERT INTO cron_jobs (id, name, schedule, command, next_run) VALUES (?, ?, ?, ?, ?)`
  ).run(id, name, schedule, command, nextRun);
  return id;
}

export function removeJob(id: string): boolean {
  initCronTable();
  const r = getDB().prepare(`DELETE FROM cron_jobs WHERE id = ?`).run(id);
  return r.changes > 0;
}

export function listJobs(): CronJob[] {
  initCronTable();
  return getDB().prepare(`SELECT * FROM cron_jobs ORDER BY next_run ASC`).all() as CronJob[];
}

export function getJob(id: string): CronJob | undefined {
  initCronTable();
  return getDB().prepare(`SELECT * FROM cron_jobs WHERE id = ?`).get(id) as CronJob | undefined;
}

export function getNextDue(): CronJob | null {
  initCronTable();
  const now = new Date().toISOString();
  const row = getDB().prepare(
    `SELECT * FROM cron_jobs WHERE enabled = 1 AND next_run <= ? ORDER BY next_run ASC LIMIT 1`
  ).get(now) as CronJob | undefined;
  return row ?? null;
}

export function markRun(id: string): void {
  const job = getJob(id);
  if (!job) return;
  const now = new Date().toISOString();
  const nextRun = parseSchedule(job.schedule).toISOString();
  getDB().prepare(
    `UPDATE cron_jobs SET last_run = ?, next_run = ? WHERE id = ?`
  ).run(now, nextRun, id);
}

/** Parse a schedule string into the next run Date. */
export function parseSchedule(schedule: string): Date {
  const now = new Date();
  const s = schedule.trim().toLowerCase();

  // "every Nh"
  const hourMatch = s.match(/^every\s+(\d+)\s*h$/);
  if (hourMatch) return new Date(now.getTime() + parseInt(hourMatch[1]!, 10) * 3600_000);

  // "every Nm"
  const minMatch = s.match(/^every\s+(\d+)\s*m$/);
  if (minMatch) return new Date(now.getTime() + parseInt(minMatch[1]!, 10) * 60_000);

  // "hourly"
  if (s === 'hourly') return new Date(now.getTime() + 3600_000);

  // "daily" or standard daily cron "0 9 * * *"
  if (s === 'daily' || s === '0 9 * * *') {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
  }

  // "weekly"
  if (s === 'weekly') {
    const next = new Date(now);
    const daysUntilMon = ((8 - next.getDay()) % 7) || 7;
    next.setDate(next.getDate() + daysUntilMon);
    next.setHours(9, 0, 0, 0);
    return next;
  }

  // Fallback: treat as daily
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(9, 0, 0, 0);
  return fallback;
}
