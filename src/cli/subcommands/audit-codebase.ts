/**
 * `dirgha audit-codebase [--root <dir>] [--out <file>] [--concurrency N] [-m <model>]`
 *
 * Fans an audit prompt across every immediate src module in parallel
 * via the existing fleet primitive. Each sub-agent gets a fresh
 * context, audits ONE module, writes its findings to a partial
 * markdown file. A final synthesis pass concatenates the partials
 * into a single report.
 *
 * Why a one-liner: a single agent with the whole src in working
 * memory hits compaction-loss before it can synthesize. Fleet gives
 * each module its own ~200 KB context budget.
 *
 * Default audit prompt covers: dead code, weak tests, missing
 * coverage, security, contradictions, cross-platform bugs, perf.
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { stdout, stderr } from 'node:process';
import { style, defaultTheme } from '../../tui/theme.js';
import { resolveModelAlias } from '../../intelligence/prices.js';
import type { Subcommand } from './index.js';

interface ModuleEntry { name: string; path: string }
interface PartialResult { module: string; ok: boolean; markdown: string; durationMs: number }

const DEFAULT_AUDIT_PROMPT = `
Audit this single source module. Use only fs_read, fs_ls, search_grep,
search_glob — read-only. Find concrete issues with file:line citations:

1. Dead / unused exports (declared, never imported)
2. Weak tests (assertions that pass even when broken)
3. Missing coverage (public exports with no test)
4. Security issues (path concatenation w/o resolve, env logged plaintext, perms wrong, shell injection)
5. Contradictions (comments that don't match code, type lies)
6. Cross-platform bugs (POSIX-only assumptions, wrong path separator)
7. Performance smells (sync I/O in hot path, unbounded buffers, missing timeouts)

Output: a Markdown table with columns
\`severity | category | file:line | finding | suggested fix\`.
Severity: critical | high | medium | low. Sort critical → low.
Cap at ~10 findings per module. Skip style nits.
`.trim();

function parseArg(argv: string[], name: string): string | undefined {
  const eq = argv.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=', 2)[1];
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
  return undefined;
}

async function listImmediateModules(root: string): Promise<ModuleEntry[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const out: ModuleEntry[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || e.name === '__tests__' || e.name === 'node_modules') continue;
    out.push({ name: e.name, path: join(root, e.name) });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function runOneAudit(opts: {
  module: ModuleEntry;
  model: string;
  outDir: string;
  cliBin: string;
  promptHeader: string;
  maxTurns: number;
  timeoutMs: number;
}): Promise<PartialResult> {
  const t0 = Date.now();
  const fullPrompt = `Audit the directory ${opts.module.path}. ${opts.promptHeader}\n\nWhen done, write your findings table to ${join(opts.outDir, opts.module.name + '.md')} via fs_write, then report 'done' with the absolute path.`;
  return new Promise(resolveTask => {
    const child = spawn('node', [opts.cliBin, fullPrompt, '-m', opts.model, '--print', `--max-turns=${opts.maxTurns}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    const killer = setTimeout(() => {
      child.kill('SIGTERM');
    }, opts.timeoutMs);

    let buf = '';
    child.stdout.on('data', d => { buf += d.toString('utf8'); });
    child.stderr.on('data', d => { buf += d.toString('utf8'); });
    child.on('close', async code => {
      clearTimeout(killer);
      let markdown = '';
      try { markdown = await readFile(join(opts.outDir, opts.module.name + '.md'), 'utf8'); } catch { /* missing */ }
      resolveTask({ module: opts.module.name, ok: code === 0 && markdown.length > 0, markdown, durationMs: Date.now() - t0 });
    });
    child.on('error', () => {
      clearTimeout(killer);
      resolveTask({ module: opts.module.name, ok: false, markdown: buf.slice(-500), durationMs: Date.now() - t0 });
    });
  });
}

async function runWithLimit<T>(items: T[], limit: number, fn: (it: T) => Promise<unknown>): Promise<unknown[]> {
  const results: unknown[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export const auditCodebaseSubcommand: Subcommand = {
  name: 'audit-codebase',
  description: 'Run a parallel-fleet audit across every immediate src module',
  async run(argv): Promise<number> {
    if (argv.includes('--help') || argv.includes('-h')) {
      stdout.write(`dirgha audit-codebase [options]\n\n`);
      stdout.write(`Fans out one read-only audit sub-agent per immediate child directory\n`);
      stdout.write(`of <root>, then synthesises every partial into a single markdown report.\n\n`);
      stdout.write(`Options:\n`);
      stdout.write(`  --root=<dir>           Directory whose immediate children become audit units (default: ./src)\n`);
      stdout.write(`  --out=<file>           Final synthesis path (default: ./docs/audits/AUDIT-<date>.md)\n`);
      stdout.write(`  --concurrency=<n>      Parallel sub-agents (default: 4)\n`);
      stdout.write(`  -m, --model=<id>       Model alias for every sub-agent (default: hy3)\n`);
      stdout.write(`  --max-turns=<n>        Per-agent turn cap (default: 15)\n`);
      stdout.write(`  --timeout-per-agent=<s> Wall-clock timeout per sub-agent in seconds (default: 90)\n`);
      return 0;
    }
    const root = parseArg(argv, 'root') ?? join(process.cwd(), 'src');
    const out = parseArg(argv, 'out') ?? join(process.cwd(), 'docs', 'audits', `AUDIT-${new Date().toISOString().slice(0, 10)}.md`);
    const concurrency = Number.parseInt(parseArg(argv, 'concurrency') ?? '4', 10);
    const model = resolveModelAlias(parseArg(argv, 'm') ?? parseArg(argv, 'model') ?? 'hy3');
    const maxTurns = Number.parseInt(parseArg(argv, 'max-turns') ?? '15', 10);
    const perAgentTimeoutMs = parseInt(parseArg(argv, 'timeout-per-agent') ?? '90', 10) * 1000;

    const rootResolved = resolve(root);
    const modules = await listImmediateModules(rootResolved);
    if (modules.length === 0) {
      stderr.write(`No modules found under ${rootResolved}\n`);
      return 1;
    }

    const outDir = join(homedir(), '.dirgha', 'audit-fleet', new Date().toISOString().replace(/[:.]/g, '-'));
    await mkdir(outDir, { recursive: true });

    const cliBin = process.argv[1] ?? join(homedir(), '.dirgha', 'cli', 'main.js');
    stdout.write(style(defaultTheme.accent, `\nAudit-fleet: ${modules.length} modules under ${basename(rootResolved)}/, model=${model}, concurrency=${concurrency}\n`));
    stdout.write(style(defaultTheme.muted, `partials: ${outDir}\n`));
    stdout.write(style(defaultTheme.muted, `final:    ${out}\n\n`));

    const partials = await runWithLimit(modules, concurrency, async (m) => {
      stdout.write(`  ${style(defaultTheme.muted, '▸')} ${m.name}…\n`);
      const r = await runOneAudit({ module: m, model, outDir, cliBin, promptHeader: DEFAULT_AUDIT_PROMPT, maxTurns, timeoutMs: perAgentTimeoutMs });
      const tag = r.ok ? style(defaultTheme.success, 'ok') : style(defaultTheme.danger, 'fail');
      stdout.write(`  ${tag}  ${m.name.padEnd(16)}  ${(r.durationMs / 1000).toFixed(1)}s\n`);
      return r;
    }) as PartialResult[];

    const okCount = partials.filter(p => p.ok).length;
    const final: string[] = [];
    final.push(`# Codebase audit — ${new Date().toISOString().slice(0, 10)}`);
    final.push('');
    final.push(`**Method.** \`dirgha audit-codebase\` fanned ${modules.length} parallel sub-agents (model=${model}, concurrency=${concurrency}) across the immediate child directories of \`${rootResolved}\`. Each sub-agent ran in a fresh context with read-only tools and wrote a partial markdown table to \`${outDir}\`. This file is the synthesis.`);
    final.push('');
    final.push(`**Result.** ${okCount}/${modules.length} modules audited cleanly.`);
    final.push('');
    for (const p of partials) {
      final.push(`## ${p.module}`);
      final.push('');
      if (p.ok) final.push(p.markdown.trim());
      else final.push(`_(audit failed in ${(p.durationMs / 1000).toFixed(1)}s — partial output captured at \`${join(outDir, p.module + '.md')}\`)_`);
      final.push('');
    }
    await mkdir(join(out, '..'), { recursive: true });
    await writeFile(out, final.join('\n'), 'utf8');
    stdout.write(style(defaultTheme.success, `\n✓ Synthesised audit at ${out}\n`));
    return okCount === modules.length ? 0 : 1;
  },
};
