/**
 * `dirgha audit` — read the local audit log.
 *
 * The audit log lives at `~/.dirgha/audit/events.jsonl` (append-only
 * JSONL). Other parts of the CLI (tool approval, destructive actions,
 * auth) are expected to append records here; this command is read-only.
 *
 * Subcommands:
 *   list [N]          Show the last N entries (default 20).
 *   tail              Follow the log (blocks, prints new entries live).
 *   search <query>    Print entries whose JSON includes `query`.
 * `--json` emits structured output instead of the table renderer.
 */

import { mkdir, readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout, stderr } from 'node:process';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

interface AuditEntry {
  ts: string;
  kind?: string;
  actor?: string;
  summary?: string;
  [key: string]: unknown;
}

function auditDir(): string { return join(homedir(), '.dirgha', 'audit'); }
function auditPath(): string { return join(auditDir(), 'events.jsonl'); }

async function ensureLog(): Promise<void> {
  await mkdir(auditDir(), { recursive: true });
}

async function readEntries(): Promise<AuditEntry[]> {
  await ensureLog();
  const text = await readFile(auditPath(), 'utf8').catch(() => '');
  const out: AuditEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as AuditEntry); } catch { /* skip malformed */ }
  }
  return out;
}

function formatEntry(entry: AuditEntry): string {
  const ts = String(entry.ts ?? '').slice(0, 19);
  const kind = String(entry.kind ?? 'event').padEnd(14);
  const actor = entry.actor ? ` ${style(defaultTheme.muted, `(${String(entry.actor)})`)}` : '';
  const summary = entry.summary ? String(entry.summary) : JSON.stringify({ ...entry, ts: undefined, kind: undefined });
  return `${style(defaultTheme.muted, ts)}  ${style(defaultTheme.accent, kind)}${actor}  ${summary}`;
}

function emit(entries: AuditEntry[], json: boolean): void {
  if (json) {
    for (const e of entries) stdout.write(`${JSON.stringify(e)}\n`);
    return;
  }
  if (entries.length === 0) {
    stdout.write(style(defaultTheme.muted, '(no audit entries yet)\n'));
    return;
  }
  for (const e of entries) stdout.write(`${formatEntry(e)}\n`);
}

function usage(): string {
  return [
    'usage:',
    '  dirgha audit list [N]                Last N entries (default 20)',
    '  dirgha audit tail                    Follow the log',
    '  dirgha audit search <q>              Entries containing q',
    '  dirgha audit kinds                   Tally entries by kind',
    '  dirgha audit ... --filter=<kind>     Restrict to one kind (turn-end, tool, error, failover, …)',
    '  dirgha audit ... --json              JSON output',
  ].join('\n');
}

async function runTail(json: boolean, matchKind: (e: AuditEntry) => boolean = () => true): Promise<number> {
  await ensureLog();
  const path = auditPath();
  const initial = await readEntries();
  emit(initial.filter(matchKind).slice(-20), json);

  let lastSize = (await stat(path).catch(() => undefined))?.size ?? 0;
  stderr.write(style(defaultTheme.muted, '\n(following — Ctrl-C to stop)\n'));

  return new Promise<number>(resolve => {
    const watcher = watch(path, { persistent: true }, async () => {
      const st = await stat(path).catch(() => undefined);
      if (!st || st.size <= lastSize) return;
      const fh = await readFile(path, 'utf8').catch(() => '');
      const newText = fh.slice(lastSize);
      lastSize = st.size;
      for (const line of newText.split('\n')) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as AuditEntry;
          if (matchKind(entry)) emit([entry], json);
        } catch { /* skip */ }
      }
    });
    process.on('SIGINT', () => {
      watcher.close();
      resolve(0);
    });
  });
}

export const auditSubcommand: Subcommand = {
  name: 'audit',
  description: 'Read the local audit log (list / tail / search)',
  async run(argv): Promise<number> {
    const json = argv.includes('--json');
    const filterFlag = argv.find(a => a.startsWith('--filter='))?.split('=')[1];
    const args = argv.filter(a => a !== '--json' && !a.startsWith('--filter='));
    const op = args[0] ?? 'list';
    const matchKind = (e: AuditEntry): boolean => !filterFlag || e.kind === filterFlag;

    if (op === 'list') {
      const n = Number.parseInt(args[1] ?? '20', 10);
      const entries = await readEntries();
      emit(entries.filter(matchKind).slice(-n), json);
      return 0;
    }
    if (op === 'tail') return runTail(json, matchKind);
    if (op === 'search') {
      const query = args[1];
      if (!query) { stderr.write(`${usage()}\n`); return 1; }
      const entries = await readEntries();
      const needle = query.toLowerCase();
      emit(entries.filter(e => matchKind(e) && JSON.stringify(e).toLowerCase().includes(needle)), json);
      return 0;
    }
    if (op === 'kinds') {
      const entries = await readEntries();
      const counts = new Map<string, number>();
      for (const e of entries) counts.set(e.kind ?? 'event', (counts.get(e.kind ?? 'event') ?? 0) + 1);
      if (json) { stdout.write(`${JSON.stringify(Object.fromEntries(counts))}\n`); return 0; }
      if (counts.size === 0) { stdout.write(style(defaultTheme.muted, '(no audit entries yet)\n')); return 0; }
      stdout.write(style(defaultTheme.accent, '\nKinds in audit log\n'));
      for (const [kind, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        stdout.write(`  ${kind.padEnd(20)} ${String(n).padStart(6)}\n`);
      }
      return 0;
    }
    stderr.write(`unknown subcommand "${op}"\n${usage()}\n`);
    return 1;
  },
};
