/**
 * Append-only audit writer. The `dirgha audit list/tail/search` reader
 * already exists at ~/.dirgha/audit/events.jsonl; this module is the
 * producer side that was missing — without it, the audit subcommand
 * always reported "no audit entries yet".
 *
 * Every append swallows errors. Audit writes must never break the
 * actual CLI run; missing audit entries are a degraded feature, not
 * a fatal failure.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface AuditEntry {
  ts: string;
  kind: string;
  actor?: string;
  summary?: string;
  [key: string]: unknown;
}

const AUDIT_DIR = join(homedir(), '.dirgha', 'audit');
const AUDIT_FILE = join(AUDIT_DIR, 'events.jsonl');

let ensured = false;

async function ensure(): Promise<void> {
  if (ensured) return;
  try {
    await mkdir(AUDIT_DIR, { recursive: true });
    ensured = true;
  } catch { /* if mkdir fails, future appendFile calls will fail too — caller swallows */ }
}

export async function appendAudit(partial: { kind: string; actor?: string; summary?: string; [key: string]: unknown }): Promise<void> {
  try {
    await ensure();
    const entry = { ts: new Date().toISOString(), ...partial };
    await appendFile(AUDIT_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* never break the CLI run for an audit write */ }
}
