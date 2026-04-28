/**
 * `dirgha kb` — knowledge base wrapper.
 *
 * Thin Node shim over the `openkb` Python CLI (OpenKB + PageIndex).
 * The wrapper:
 *   - Resolves a stable KB root at `~/.dirgha/kb/` so every project
 *     answers from the same wiki by default.
 *   - Auto-runs `openkb init` on first use.
 *   - Forwards subcommands verbatim, but adds two convenience
 *     defaults: `dirgha kb ingest` (alias for `openkb add` against
 *     a known set of project sources) and `dirgha kb query "<q>"`.
 *   - Audit-logs every kb mutation so the agent has a trail of when
 *     the wiki changed.
 *
 * If `openkb` isn't installed, prints the install command and exits 1
 * — never silently degrades.
 */

import { spawnSync, execFileSync } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout, stderr } from 'node:process';
import { appendAudit } from '../../audit/writer.js';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

const KB_ROOT = join(homedir(), '.dirgha', 'kb');

function checkInstalled(): boolean {
  try {
    execFileSync('openkb', ['--help'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function ensureKbRoot(): Promise<void> {
  // OpenKB stores its config at `<root>/.openkb/config.yaml` and looks
  // for `raw/` + `wiki/` siblings. We seed all three non-interactively
  // — picking a sensible default model — instead of running the
  // interactive `openkb init` so the wrapper stays headless.
  const cfg = join(KB_ROOT, '.openkb', 'config.yaml');
  if (await stat(cfg).then(() => true).catch(() => false)) return;
  await mkdir(join(KB_ROOT, '.openkb'), { recursive: true });
  await mkdir(join(KB_ROOT, 'raw'), { recursive: true });
  await mkdir(join(KB_ROOT, 'wiki'), { recursive: true });
  // Default to OpenRouter free-tier hy3 — the same model dirgha uses
  // for free-tier coding sprints. Users can swap by editing the file.
  const yaml = [
    'language: en',
    'model: openrouter/tencent/hy3-preview:free',
    'pageindex_threshold: 20',
    '',
  ].join('\n');
  await writeFile(cfg, yaml, 'utf8');
  await writeFile(join(KB_ROOT, '.openkb', 'hashes.json'), '{}', 'utf8');
  stdout.write(style(defaultTheme.muted, `Initialised KB at ${KB_ROOT} (config: ${cfg})\n`));
}

function passthrough(args: string[]): number {
  // OpenKB looks at cwd; chdir there so users don't need a flag.
  const r = spawnSync('openkb', args, { stdio: 'inherit', cwd: KB_ROOT });
  return r.status ?? 1;
}

function defaultIngestSources(): string[] {
  // Project docs, ledger digests, memory entries — the curated layers
  // get folded into the wiki so the agent can answer doc-style
  // questions without re-reading the whole tree on every turn.
  return [
    join(process.cwd(), 'docs'),
    join(homedir(), '.dirgha', 'memory'),
    join(homedir(), '.dirgha', 'ledger'),
  ];
}

function help(): string {
  return [
    'usage:',
    '  dirgha kb status                  Show KB status (counts, last update)',
    '  dirgha kb ingest [path]           Compile a path (default: docs/ + memory/ + ledger/)',
    '  dirgha kb query "<question>"     Reasoning-based retrieval over the wiki',
    '  dirgha kb chat                    Multi-turn KB chat',
    '  dirgha kb watch [path]            Re-ingest as files change',
    '  dirgha kb lint                    Find contradictions, gaps, orphans, stale pages',
    '  dirgha kb list                    List documents in the wiki',
    '  dirgha kb -- <openkb-args>        Forward verbatim to the openkb CLI',
    '',
    `KB lives at: ${KB_ROOT}`,
  ].join('\n');
}

export const kbSubcommand: Subcommand = {
  name: 'kb',
  description: 'Compiled knowledge base (OpenKB + PageIndex)',
  async run(argv): Promise<number> {
    if (!checkInstalled()) {
      stderr.write(style(defaultTheme.danger, 'openkb is not installed.\n'));
      stderr.write('Install it with one of:\n');
      stderr.write('  uv tool install --from "git+https://github.com/VectifyAI/OpenKB.git" openkb\n');
      stderr.write('  pipx install git+https://github.com/VectifyAI/OpenKB.git\n');
      return 1;
    }

    const op = argv[0] ?? 'help';

    if (op === 'help' || op === '-h' || op === '--help') {
      stdout.write(`${help()}\n`);
      return 0;
    }

    await ensureKbRoot();

    if (op === 'ingest') {
      const explicit = argv.slice(1).filter(a => !a.startsWith('-'));
      const sources = explicit.length > 0 ? explicit : defaultIngestSources();
      stdout.write(style(defaultTheme.accent, `Ingesting ${sources.length} source${sources.length === 1 ? '' : 's'} into ${KB_ROOT}\n`));
      let allOk = 0;
      for (const src of sources) {
        const exists = await stat(src).catch(() => undefined);
        if (!exists) { stdout.write(style(defaultTheme.muted, `  skip ${src} (not present)\n`)); continue; }
        stdout.write(style(defaultTheme.muted, `  add ${src}\n`));
        const r = spawnSync('openkb', ['add', src], { stdio: 'inherit', cwd: KB_ROOT });
        if (r.status === 0) allOk++;
        else stderr.write(style(defaultTheme.danger, `  ✗ openkb add ${src} exited ${r.status}\n`));
      }
      void appendAudit({ kind: 'kb-ingest', summary: `${allOk}/${sources.length} sources ingested`, sources });
      return allOk === sources.length ? 0 : 1;
    }

    if (op === 'query') {
      const q = argv.slice(1).join(' ').trim();
      if (!q) { stderr.write(`Missing question.\n${help()}\n`); return 2; }
      void appendAudit({ kind: 'kb-query', summary: q.slice(0, 120) });
      return passthrough(['query', q]);
    }

    if (op === 'chat')   return passthrough(argv);
    if (op === 'watch')  return passthrough(argv);
    if (op === 'lint')   return passthrough(argv);
    if (op === 'status') return passthrough(argv);
    if (op === 'list')   return passthrough(argv);

    if (op === '--') return passthrough(argv.slice(1));

    stderr.write(`unknown kb subcommand "${op}"\n${help()}\n`);
    return 1;
  },
};
