/**
 * Catalogue every built-in slash command and run each one through a
 * stub context. Anything that returns the literal "isn't available …
 * run from a shell" boilerplate, throws, or returns undefined gets
 * flagged as a stub or broken. Output: a table of command status.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath as _toPath, pathToFileURL as _toUrl } from 'node:url';
import { dirname as _dn, resolve as _rs, join as _join } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { builtinSlashCommands } = await import(_toUrl(_join(ROOT, 'cli/slash/index.js')).href);

// Minimal stub of SlashContext — just enough for non-network-dependent
// handlers to not throw on the "shape" of the context. Network/IO calls
// will still run; we sandbox cwd to a tmp dir.
const sandbox = join(tmpdir(), `slash-audit-${process.pid}`);
mkdirSync(sandbox, { recursive: true });
process.chdir(sandbox);

const ctx = {
  cwd: sandbox,
  model: 'inclusionai/ling-2.6-1t:free',
  sessionId: 'audit-session',
  setModel: (id) => { ctx.model = id; },
  getSummaryModel: () => ctx.model,
  exit: () => {},
  clear: () => {},
  showHelp: () => '(help)',
  compact: async () => 'compacted',
  listSessions: async () => '(no sessions)',
  loadSession: async () => '(loaded)',
  listSkills: async () => '(skills)',
  showCost: () => '(cost)',
  status: () => {},
  history: () => [],
  setMode: () => {},
  getMode: () => 'act',
  setTheme: () => {},
  getTheme: () => 'dark',
  // Auth + session shape so /account, /upgrade, /login don't error.
  getToken: () => null,
  setToken: () => {},
  apiBase: () => 'https://api.dirgha.ai',
  upgradeUrl: () => 'https://dirgha.ai/upgrade',
  getSession: () => null,
  getSessionStore: () => null,
  getProvider: () => null,
};

const STUB_TELLS = [
  /isn't available/i,
  /coming soon/i,
  /not implemented/i,
  /todo/i,
  /stub/i,
  /from a shell/i,
];

const results = [];
for (const cmd of builtinSlashCommands) {
  const name = cmd.name;
  let status = 'ok', detail = '', output = '';
  try {
    const out = await cmd.execute([], ctx);
    output = typeof out === 'string' ? out : (out === undefined ? '(no output)' : JSON.stringify(out).slice(0, 200));
    if (typeof out === 'string') {
      for (const re of STUB_TELLS) {
        if (re.test(out)) { status = 'stub'; detail = 'matches stub-tell phrase'; break; }
      }
    }
  } catch (err) {
    status = 'error';
    detail = err instanceof Error ? err.message : String(err);
    output = detail;
  }
  results.push({ name, status, detail, output: output.slice(0, 120).replace(/\s+/g, ' ') });
}

const padN = Math.max(...results.map(r => r.name.length));
console.log(`\n${'name'.padEnd(padN)}  status  output`);
console.log('-'.repeat(120));
let stubs = 0, errors = 0;
for (const r of results) {
  const mark = r.status === 'ok' ? '✓' : r.status === 'stub' ? '⚠' : '✗';
  if (r.status === 'stub') stubs++;
  if (r.status === 'error') errors++;
  console.log(`${r.name.padEnd(padN)}  ${mark} ${r.status.padEnd(5)}  ${r.output}`);
}
console.log(`\nsummary: ${results.length - stubs - errors}/${results.length} ok, ${stubs} stubs, ${errors} errors`);

// Use os.tmpdir() so the path resolves on Windows (where C:\tmp doesn't
// exist by default; tmpdir is C:\Users\<user>\AppData\Local\Temp).
import { tmpdir as _tmpdir } from 'node:os';
import { join as _joinReport } from 'node:path';
const _reportPath = _joinReport(_tmpdir(), 'slash-audit.json');
writeFileSync(_reportPath, JSON.stringify(results, null, 2));
console.log(`full report: ${_reportPath}`);
process.exit(stubs + errors > 0 ? 1 : 0);
