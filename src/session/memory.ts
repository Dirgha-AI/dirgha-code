/**
 * session/memory.ts — Persistent memory via SQLite (better-sqlite3)
 * Falls back to MEMORY.md if DB is unavailable (native module missing/not built).
 * On first use, migrates existing MEMORY.md entries into the DB.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { saveMemory as dbSave, readAllMemory as dbReadAll, searchMemory as dbSearch } from './db.js';

const LEGACY_PATH = path.join(os.homedir(), '.dirgha', 'MEMORY.md');

function ensureDir(): void {
  fs.mkdirSync(path.join(os.homedir(), '.dirgha'), { recursive: true });
}

/** Migrate MEMORY.md into SQLite on first call (one-time). */
function migrateLegacy(): void {
  const flagPath = path.join(os.homedir(), '.dirgha', '.memory_migrated');
  if (fs.existsSync(flagPath) || !fs.existsSync(LEGACY_PATH)) return;
  try {
    const lines = fs.readFileSync(LEGACY_PATH, 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) dbSave(line);
    fs.writeFileSync(flagPath, new Date().toISOString());
  } catch { /* best-effort */ }
}

export function readMemory(): string | null {
  try {
    migrateLegacy();
    return dbReadAll();
  } catch {
    // Fallback: MEMORY.md (better-sqlite3 not available)
    if (!fs.existsSync(LEGACY_PATH)) return null;
    return fs.readFileSync(LEGACY_PATH, 'utf8').trim() || null;
  }
}

export function appendMemory(text: string): void {
  try {
    migrateLegacy();
    dbSave(text);
    return;
  } catch {
    // Fallback: MEMORY.md
    ensureDir();
    const timestamp = new Date().toISOString().slice(0, 16);
    fs.appendFileSync(LEGACY_PATH, `\n- [${timestamp}] ${text}`, 'utf8');
  }
}

export function writeMemory(content: string): void {
  try {
    migrateLegacy();
    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines) dbSave(line);
    return;
  } catch {
    ensureDir();
    fs.writeFileSync(LEGACY_PATH, content, 'utf8');
  }
}

/** Exported for agent memory search tool */
export { dbSearch as searchMemory };
