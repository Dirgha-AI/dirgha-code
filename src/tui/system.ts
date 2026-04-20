import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import crypto from 'crypto';

export function uid(): string {
  return crypto.randomBytes(8).toString('hex');
}

export function historyPath(): string {
  return path.join(os.homedir(), '.dirgha', 'history.log');
}

export function loadHistory(): string[] {
  try {
    return fs.readFileSync(historyPath(), 'utf8').split('\n').filter(Boolean);
  } catch { return []; }
}

import fs from 'fs';
export function saveHistory(line: string): void {
  try {
    fs.mkdirSync(path.dirname(historyPath()), { recursive: true });
    fs.appendFileSync(historyPath(), line + '\n', 'utf8');
  } catch {}
}

export function hhmm(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}
