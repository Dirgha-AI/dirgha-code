/**
 * orchestra/core/store.ts — Orchestration state persistence.
 *
 * Persists sessions to ~/.dirgha/orchestra.json so they survive CLI restarts.
 * P1 enhancement: SQLite-backed with history replay.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { OrchestraSession } from "./types.js";

const STORE_DIR = join(homedir(), ".dirgha");
const STORE_FILE = join(STORE_DIR, "orchestra.json");

export interface PersistedStore {
  version: number;
  sessions: OrchestraSession[];
}

function ensureDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

export function loadSessions(): OrchestraSession[] {
  try {
    ensureDir();
    if (!existsSync(STORE_FILE)) return [];
    const raw = readFileSync(STORE_FILE, "utf-8");
    const store: PersistedStore = JSON.parse(raw);
    return store.sessions ?? [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: OrchestraSession[]): void {
  ensureDir();
  const store: PersistedStore = { version: 1, sessions };
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function appendSession(session: OrchestraSession): void {
  const existing = loadSessions().filter((s) => s.id !== session.id);
  existing.push(session);
  saveSessions(existing);
}

export function removeStoredSession(id: string): void {
  const existing = loadSessions().filter((s) => s.id !== id);
  saveSessions(existing);
}
