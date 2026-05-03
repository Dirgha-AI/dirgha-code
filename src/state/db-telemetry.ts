/**
 * DB write telemetry.
 *
 * Tracks SQLite write failures so they are not silently swallowed.
 * Stores counts in ~/.dirgha/state.json under `dbErrors`. When 10+
 * errors accumulate in a single process lifetime, a warning is
 * written to stderr so the user knows session data may not persist.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const DIRGHA_DIR = join(homedir(), ".dirgha");
const STATE_PATH = join(DIRGHA_DIR, "state.json");

interface DbTelemetryData {
  totalWrites: number;
  failedWrites: number;
  lastError: string;
  lastErrorTime: string;
}

let telemetry: DbTelemetryData = {
  totalWrites: 0,
  failedWrites: 0,
  lastError: "",
  lastErrorTime: "",
};

let warned = false;
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  await loadDbTelemetry();
}

async function persist(): Promise<void> {
  try {
    await mkdir(DIRGHA_DIR, { recursive: true });
    let existing: Record<string, unknown> = {};
    try {
      const raw = await readFile(STATE_PATH, "utf8");
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* first write */
    }
    existing.dbErrors = {
      totalWrites: telemetry.totalWrites,
      failedWrites: telemetry.failedWrites,
      lastError: telemetry.lastError,
      lastErrorTime: telemetry.lastErrorTime,
    };
    await writeFile(STATE_PATH, JSON.stringify(existing, null, 2), "utf8");
  } catch {
    /* best-effort; don't recurse on persist failure */
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persist();
  }, 5000);
}

export function recordDbError(err: unknown): void {
  void ensureLoaded();
  telemetry.totalWrites++;
  telemetry.failedWrites++;
  telemetry.lastError = err instanceof Error ? err.message : String(err);
  telemetry.lastErrorTime = new Date().toISOString();

  if (!warned && telemetry.failedWrites >= 10) {
    warned = true;
    process.stderr.write(
      "[Dirgha] DB writes failing — session data may not persist.\n",
    );
  }

  schedulePersist();
}

export function recordDbSuccess(): void {
  void ensureLoaded();
  telemetry.totalWrites++;
  schedulePersist();
}

export function getDbErrorCount(): number {
  void ensureLoaded();
  return telemetry.failedWrites;
}

export function getDbTelemetry(): Readonly<DbTelemetryData> {
  void ensureLoaded();
  return { ...telemetry };
}

export async function flushDbTelemetry(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await persist();
}

export async function loadDbTelemetry(): Promise<void> {
  try {
    await mkdir(DIRGHA_DIR, { recursive: true });
    const raw = await readFile(STATE_PATH, "utf8");
    const existing = JSON.parse(raw) as Record<string, unknown>;
    const dbErrors = existing.dbErrors as DbTelemetryData | undefined;
    if (dbErrors) {
      telemetry = { ...dbErrors };
    }
  } catch {
    /* no prior state */
  }
}
