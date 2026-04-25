/**
 * `dirgha ledger <add|show|tail|search|digest>` — append-only ledger +
 * digest. The agent's memory across sessions is two files at
 * `~/.dirgha/ledger/<scope>.jsonl` + `<scope>.md`. A fresh agent reads
 * the digest, tails the JSONL, and resumes work where the previous
 * session left off.
 */

import { stdout, stderr } from 'node:process';
import { ledgerScope, appendLedger, readLedger, searchLedger, searchLedgerRanked, readDigest, writeDigest, type LedgerEntryKind } from '../../context/ledger.js';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

const VALID_KINDS: LedgerEntryKind[] = ['goal', 'decision', 'observation', 'experiment', 'metric', 'note', 'compaction'];

const HELP = [
  'Usage:',
  '  dirgha ledger                              Tail of default scope (last 20)',
  '  dirgha ledger tail [N] [--scope <name>]    Last N entries',
  '  dirgha ledger add <kind> <text...>         Append (kind: goal|decision|observation|experiment|metric|note)',
  '  dirgha ledger show [--scope <name>]        Print full digest + tail',
  '  dirgha ledger search <query>               Substring search across the ledger',
  '  dirgha ledger digest <markdown...>         Rewrite the digest (replaces the .md)',
  '',
  '  Files: ~/.dirgha/ledger/<scope>.{jsonl,md}',
].join('\n');

function pickScope(argv: string[]): { scope: string; rest: string[] } {
  const i = argv.indexOf('--scope');
  if (i < 0 || i + 1 >= argv.length) return { scope: 'default', rest: argv };
  const name = argv[i + 1];
  const rest = [...argv.slice(0, i), ...argv.slice(i + 2)];
  return { scope: name, rest };
}

export const ledgerSubcommand: Subcommand = {
  name: 'ledger',
  description: 'Append-only ledger + digest (cross-session memory)',
  async run(argv): Promise<number> {
    const { scope: scopeName, rest } = pickScope(argv);
    const scope = ledgerScope(scopeName);
    const op = rest[0] ?? 'tail';

    if (op === 'help' || op === '-h' || op === '--help') {
      stdout.write(HELP + '\n');
      return 0;
    }

    if (op === 'tail' || (op === 'tail' && rest.length === 1) || (rest.length === 0)) {
      const limit = rest[1] ? Number.parseInt(rest[1], 10) : 20;
      const entries = await readLedger(scope, limit);
      if (entries.length === 0) {
        stdout.write(style(defaultTheme.muted, `(scope ${scopeName} is empty — add with: dirgha ledger add note "...")\n`));
        return 0;
      }
      stdout.write(style(defaultTheme.accent, `\nLedger ${scopeName} — last ${entries.length}\n\n`));
      for (const e of entries) {
        stdout.write(`  ${style(defaultTheme.muted, e.ts)}  ${style(defaultTheme.accent, e.kind.padEnd(11))}  ${e.text}\n`);
      }
      stdout.write('\n');
      return 0;
    }

    if (op === 'add') {
      const kind = rest[1] as LedgerEntryKind;
      if (!VALID_KINDS.includes(kind)) { stderr.write(`Bad kind. Must be one of: ${VALID_KINDS.join(', ')}\n`); return 2; }
      const text = rest.slice(2).join(' ').trim();
      if (!text) { stderr.write('Missing text.\n' + HELP + '\n'); return 2; }
      await appendLedger(scope, { kind, text });
      stdout.write(style(defaultTheme.success, `✓ appended ${kind} to ${scopeName}\n`));
      return 0;
    }

    if (op === 'search') {
      const q = rest.slice(1).join(' ');
      if (!q) { stderr.write('Missing query.\n' + HELP + '\n'); return 2; }
      // Default: TF-IDF cosine ranking. Pass `--exact` for old substring search.
      const exact = argv.includes('--exact');
      if (exact) {
        const hits = await searchLedger(scope, q);
        if (hits.length === 0) { stdout.write(`No entries match "${q}" in scope ${scopeName}.\n`); return 0; }
        for (const e of hits) stdout.write(`  ${e.ts}  ${e.kind}  ${e.text}\n`);
      } else {
        const ranked = await searchLedgerRanked(scope, q, { topK: 10 });
        if (ranked.length === 0) { stdout.write(`No entries match "${q}" in scope ${scopeName}.\n`); return 0; }
        for (const r of ranked) stdout.write(`  ${r.score.toFixed(2)}  ${r.entry.ts}  ${r.entry.kind}  ${r.entry.text}\n`);
      }
      return 0;
    }

    if (op === 'show') {
      const digest = await readDigest(scope);
      const entries = await readLedger(scope, 30);
      stdout.write(style(defaultTheme.accent, `\nLedger ${scopeName}\n\n`));
      stdout.write(style(defaultTheme.userPrompt, '## digest\n\n'));
      stdout.write(digest.trim() || style(defaultTheme.muted, '(no digest yet — write one with: dirgha ledger digest "...")\n'));
      stdout.write(style(defaultTheme.userPrompt, '\n\n## recent entries\n\n'));
      if (entries.length === 0) {
        stdout.write(style(defaultTheme.muted, '(none)\n'));
      } else {
        for (const e of entries) stdout.write(`  ${e.ts}  ${e.kind}  ${e.text}\n`);
      }
      stdout.write('\n');
      return 0;
    }

    if (op === 'digest') {
      const md = rest.slice(1).join(' ').trim();
      if (!md) { stderr.write('Missing markdown.\n' + HELP + '\n'); return 2; }
      await writeDigest(scope, md);
      stdout.write(style(defaultTheme.success, `✓ digest rewritten for ${scopeName}\n`));
      return 0;
    }

    stderr.write(`Unknown subcommand "${op}".\n${HELP}\n`);
    return 2;
  },
};
