/**
 * utils/state.ts — Persist lightweight TUI state across sessions.
 * Stores: last session ID, last model used, cwd.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

interface DirghaState {
  lastSessionId?: string;
  lastModel?: string;
  lastCwd?: string;
  updatedAt?: string;
}

function statePath(): string {
  return path.join(os.homedir(), '.dirgha', 'state.json');
}

export function readState(): DirghaState {
  const p = statePath();
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as DirghaState; } catch { return {}; }
}

export function writeState(patch: Partial<DirghaState>): void {
  const dir = path.join(os.homedir(), '.dirgha');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const current = readState();
  fs.writeFileSync(statePath(), JSON.stringify({ ...current, ...patch, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
}
