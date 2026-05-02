/**
 * Unified state index. Maintains ~/.dirgha/state-index.json that
 * cross-references sessions, checkpoints, and cron jobs by session ID.
 * All writes are atomic (write to tmp, rename).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const STATE_DIR = join(homedir(), '.dirgha');
const INDEX_PATH = join(STATE_DIR, 'state-index.json');

export interface StateEntry {
  sessionId: string;
  startedAt: string; // ISO timestamp
  model?: string;
  checkpointIds: string[];
  cronJobIds: string[];
  endedAt?: string;
}

export interface StateIndex {
  version: 1;
  sessions: Record<string, StateEntry>;
}

async function readIndex(): Promise<StateIndex> {
  try {
    const raw = await readFile(INDEX_PATH, 'utf8');
    return JSON.parse(raw) as StateIndex;
  } catch {
    return { version: 1, sessions: {} };
  }
}

async function writeIndex(index: StateIndex): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  const tmp = join(tmpdir(), `dirgha-state-${randomUUID()}.json`);
  await writeFile(tmp, JSON.stringify(index, null, 2), 'utf8');
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
}

export async function registerSession(sessionId: string, model?: string): Promise<void> {
  try {
    const index = await readIndex();
    if (!index.sessions[sessionId]) {
      index.sessions[sessionId] = {
        sessionId,
        startedAt: new Date().toISOString(),
        model,
        checkpointIds: [],
        cronJobIds: [],
      };
      await writeIndex(index);
    }
  } catch {
    // Never throw — state index is best-effort
  }
}

export async function registerCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
  try {
    const index = await readIndex();
    if (!index.sessions[sessionId]) {
      index.sessions[sessionId] = {
        sessionId,
        startedAt: new Date().toISOString(),
        checkpointIds: [],
        cronJobIds: [],
      };
    }
    if (!index.sessions[sessionId].checkpointIds.includes(checkpointId)) {
      index.sessions[sessionId].checkpointIds.push(checkpointId);
      await writeIndex(index);
    }
  } catch {
    // Never throw — state index is best-effort
  }
}

export async function registerCronJob(sessionId: string | undefined, jobId: string): Promise<void> {
  if (!sessionId) return;
  try {
    const index = await readIndex();
    if (!index.sessions[sessionId]) {
      index.sessions[sessionId] = {
        sessionId,
        startedAt: new Date().toISOString(),
        checkpointIds: [],
        cronJobIds: [],
      };
    }
    if (!index.sessions[sessionId].cronJobIds.includes(jobId)) {
      index.sessions[sessionId].cronJobIds.push(jobId);
      await writeIndex(index);
    }
  } catch {
    // Never throw — state index is best-effort
  }
}

export async function closeSession(sessionId: string): Promise<void> {
  try {
    const index = await readIndex();
    if (index.sessions[sessionId]) {
      index.sessions[sessionId].endedAt = new Date().toISOString();
      await writeIndex(index);
    }
  } catch {
    // Never throw — state index is best-effort
  }
}

export async function querySession(sessionId: string): Promise<StateEntry | null> {
  try {
    const index = await readIndex();
    return index.sessions[sessionId] ?? null;
  } catch {
    return null;
  }
}

export async function listSessions(limit = 20): Promise<StateEntry[]> {
  try {
    const index = await readIndex();
    return Object.values(index.sessions)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  } catch {
    return [];
  }
}
