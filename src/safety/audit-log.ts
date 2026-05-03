/**
 * Append-only, hash-chained audit log. Every entry is a JSON object
 * carrying `prevHash` and `hash`; verify() walks the chain and detects
 * tampering.
 *
 * The module also maintains an in-memory pending buffer so callers can
 * drain recent entries at turn-end and push them to the gateway:
 *
 *   const entries = await drainPending();
 *   await pushAuditEntries(sessionId, entries, token);
 */

import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Module-level buffer — accumulates entries until `drainPending()` clears it. */
const _pendingBuffer: AuditEntry[] = [];

export type AuditKind =
  | 'tool_call'
  | 'approval'
  | 'policy_decision'
  | 'error'
  | 'model_call'
  | 'session_start'
  | 'session_end';

export interface AuditEntry {
  id: string;
  ts: string;
  sessionId?: string;
  kind: AuditKind;
  payload: unknown;
  prevHash: string;
  hash: string;
}

export interface AuditLog {
  record(kind: AuditKind, payload: unknown, sessionId?: string): Promise<void>;
  read(date?: string): Promise<AuditEntry[]>;
  verify(date?: string): Promise<{ valid: boolean; brokenAt?: string }>;
}

export interface AuditLogOptions {
  directory?: string;
}

export function createAuditLog(opts: AuditLogOptions = {}): AuditLog {
  const dir = opts.directory ?? join(homedir(), '.dirgha', 'audit');
  let lastHash = 'GENESIS';

  return {
    async record(kind, payload, sessionId) {
      await ensure(dir);
      const entry: AuditEntry = {
        id: randomUUID(),
        ts: new Date().toISOString(),
        sessionId,
        kind,
        payload,
        prevHash: lastHash,
        hash: '',
      };
      entry.hash = computeHash(lastHash, kind, entry.ts, sessionId, payload);
      lastHash = entry.hash;
      await appendFile(join(dir, fileFor()), `${JSON.stringify(entry)}\n`, 'utf8');
      _pendingBuffer.push(entry);
    },
    async read(date) {
      const path = join(dir, fileFor(date));
      const text = await readFile(path, 'utf8').catch(() => '');
      const out: AuditEntry[] = [];
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try { out.push(JSON.parse(line) as AuditEntry); } catch { /* skip */ }
      }
      return out;
    },
    async verify(date) {
      const entries = await this.read(date);
      let prev = 'GENESIS';
      for (const entry of entries) {
        const expected = computeHash(entry.prevHash, entry.kind, entry.ts, entry.sessionId, entry.payload);
        if (entry.prevHash !== prev || entry.hash !== expected) {
          return { valid: false, brokenAt: entry.id };
        }
        prev = entry.hash;
      }
      lastHash = prev;
      return { valid: true };
    },
  };
}

function computeHash(prev: string, kind: string, ts: string, sessionId: string | undefined, payload: unknown): string {
  const body = JSON.stringify({ prev, kind, ts, sessionId, payload });
  return createHash('sha256').update(body).digest('hex');
}

function fileFor(date?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return `${d}.ndjson`;
}

async function ensure(dir: string): Promise<void> {
  const info = await stat(dir).catch(() => undefined);
  if (!info) await mkdir(dir, { recursive: true });
}

/**
 * Return all audit entries written since the last call to `drainPending()`
 * and clear the internal buffer.
 *
 * Designed for turn-end telemetry: the agent loop calls this after each
 * turn and forwards the result to `pushAuditEntries()` for gateway upload.
 * The function is synchronous in all but name — it never performs I/O.
 */
export async function drainPending(): Promise<AuditEntry[]> {
  const snapshot = _pendingBuffer.splice(0);
  return snapshot;
}
