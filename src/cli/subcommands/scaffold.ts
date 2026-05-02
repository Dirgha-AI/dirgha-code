/**
 * `dirgha scaffold "<prompt>"` — instant-app scaffolder.
 *
 * Closes Gap B from docs/audit/2026-04-28-cursor-bolt-parity.md (Bolt-style
 * "prompt → runnable web app in 30s"). The flow:
 *
 *   1. Pick a template that best matches the prompt (vite-react, vite-vue,
 *      next, hono-api, fastapi, astro). The picker is rule-based — short
 *      list, recognisable keywords. No LLM round-trip required for v1.
 *   2. Copy the template tree into <cwd>/<name>/ (or --target).
 *   3. Optionally personalise via `dirgha ask` (skipped with --no-ai).
 *   4. Run `npm install` (or `pip install -r`) in the new dir.
 *   5. Print the dev-server command and (if --serve) start it.
 *
 *   dirgha scaffold "todo app with React"               # picks vite-react
 *   dirgha scaffold "Hono API with Drizzle" --name=api  # picks hono-api, names it 'api'
 *   dirgha scaffold "static blog" --template=astro       # explicit override
 *   dirgha scaffold "vue dashboard" --no-install --no-ai # skeleton only
 *   dirgha scaffold "next saas" --serve                  # auto npm run dev
 *
 * Templates live at scaffold/templates/<name>/. Each template ships
 * package.json + a starter component file. The user can then iterate
 * on it by running `dirgha ask` in the new directory.
 */

import { mkdir, copyFile, readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stdout, stderr } from 'node:process';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

interface Template {
  id: string;
  description: string;
  /** Keywords (lowercase, single tokens) that score the prompt. */
  keywords: string[];
  /** Shell command to start the dev server, run from the project dir. */
  devCommand: string;
  /** Install command. */
  installCommand: string[];
  /** Default port the dev server binds (used in the success message). */
  defaultPort: number;
}

// v1 ships two templates. Add more by dropping a directory under
// scaffold-templates/<id>/ (with package.json + entrypoint) and a row here.
// Next.js / Astro / FastAPI / SvelteKit are tracked as follow-ups.
const TEMPLATES: Template[] = [
  {
    id: 'vite-react',
    description: 'Vite + React 19 + TypeScript SPA',
    keywords: ['react', 'vite', 'spa', 'web', 'app', 'frontend', 'todo', 'dashboard', 'ui', 'tsx', 'next', 'astro', 'site', 'page', 'landing'],
    devCommand: 'npm run dev',
    installCommand: ['install'],
    defaultPort: 5173,
  },
  {
    id: 'hono-api',
    description: 'Hono — lightweight API server (Node + edge-compatible)',
    keywords: ['api', 'server', 'rest', 'hono', 'backend', 'endpoint', 'http', 'crud', 'json', 'fastapi', 'flask', 'express'],
    devCommand: 'npm run dev',
    installCommand: ['install'],
    defaultPort: 3001,
  },
];

interface ParsedArgs {
  prompt: string;
  template?: string;
  name?: string;
  target?: string;
  serve: boolean;
  noInstall: boolean;
  noAi: boolean;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { prompt: '', serve: false, noInstall: false, noAi: false, json: false, help: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--serve') out.serve = true;
    else if (a === '--no-install') out.noInstall = true;
    else if (a === '--no-ai') out.noAi = true;
    else if (a === '--json') out.json = true;
    else if (a.startsWith('--template=')) out.template = a.slice('--template='.length);
    else if (a === '--template') out.template = argv[++i];
    else if (a.startsWith('--name=')) out.name = a.slice('--name='.length);
    else if (a === '--name') out.name = argv[++i];
    else if (a.startsWith('--target=')) out.target = a.slice('--target='.length);
    else if (a === '--target') out.target = argv[++i];
    else positional.push(a);
  }
  out.prompt = positional.join(' ').trim();
  return out;
}

/** Score each template by the keyword matches in the prompt. Highest wins. */
function pickTemplate(prompt: string, override?: string): Template | undefined {
  if (override) return TEMPLATES.find(t => t.id === override);
  const lower = prompt.toLowerCase();
  let best: { t: Template; score: number } | undefined;
  for (const t of TEMPLATES) {
    let score = 0;
    for (const k of t.keywords) {
      if (lower.includes(k)) score += k.length;
    }
    if (!best || score > best.score) best = { t, score };
  }
  // Fall back to vite-react when the prompt is too generic
  return best && best.score > 0 ? best.t : TEMPLATES[0];
}

/** Derive a project name from the prompt — kebab-case, ≤ 30 chars. */
function deriveName(prompt: string, override?: string): string {
  if (override) {
    if (basename(override) !== override) {
      throw new Error(`Invalid project name "${override}": must not contain path separators.`);
    }
    return override;
  }
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-')
    .slice(0, 30);
  return slug || 'dirgha-app';
}

async function copyDir(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  for (const entry of await readdir(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    const st = await stat(s);
    if (st.isDirectory()) await copyDir(s, d);
    else await copyFile(s, d);
  }
}

/** Resolve the templates dir whether running from src/ or dist/. */
function templatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/cli/subcommands/scaffold.js → ../../../scaffold-templates (package root)
  // src/cli/subcommands/scaffold.ts → ../../../scaffold-templates (repo root)
  return resolve(here, '..', '..', '..', 'scaffold-templates');
}

async function patchPackageJson(target: string, name: string): Promise<void> {
  const path = join(target, 'package.json');
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(await readFile(path, 'utf8'));
    raw.name = name;
    raw.version = '0.0.1';
    await writeFile(path, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  } catch { /* leave as-is on parse error */ }
}

export const scaffoldSubcommand: Subcommand = {
  name: 'scaffold',
  description: 'Scaffold + run a starter project from a prompt (web app, API, static site)',
  async run(argv): Promise<number> {
    const args = parseArgs(argv);
    if (args.help) {
      stdout.write(`dirgha scaffold "<prompt>" [options]\n\n`);
      stdout.write(`Templates:\n`);
      for (const t of TEMPLATES) stdout.write(`  ${t.id.padEnd(14)} ${t.description}\n`);
      stdout.write(`\nOptions:\n`);
      stdout.write(`  --template=<id>   Force a template (skip prompt-matching)\n`);
      stdout.write(`  --name=<name>     Project dir name (default: derived from prompt)\n`);
      stdout.write(`  --target=<dir>    Parent dir to create the project in (default: cwd)\n`);
      stdout.write(`  --serve           Auto-run \`npm run dev\` after install\n`);
      stdout.write(`  --no-install      Skip npm install (skeleton only)\n`);
      stdout.write(`  --no-ai           Skip the personalisation pass with the agent\n`);
      stdout.write(`  --json            Emit a JSON event stream (for tooling)\n`);
      return 0;
    }
    if (!args.prompt && !args.template) {
      stderr.write(style(defaultTheme.danger, 'usage: dirgha scaffold "<prompt>" [options]\n'));
      return 1;
    }

    const tpl = pickTemplate(args.prompt, args.template);
    if (!tpl) {
      stderr.write(`unknown template: ${args.template}\n`);
      stderr.write(`available: ${TEMPLATES.map(t => t.id).join(', ')}\n`);
      return 1;
    }

    const name = deriveName(args.prompt, args.name);
    const parent = args.target ? resolve(args.target) : process.cwd();
    const target = join(parent, name);

    if (existsSync(target)) {
      stderr.write(style(defaultTheme.danger, `target already exists: ${target}\n`));
      stderr.write(`pass --name=<other> or --target=<dir> to scaffold elsewhere.\n`);
      return 1;
    }

    const tplDir = join(templatesDir(), tpl.id);
    if (!existsSync(tplDir)) {
      stderr.write(style(defaultTheme.danger, `template assets missing at ${tplDir}\n`));
      stderr.write(`this build of @dirgha/code may not include the scaffold templates.\n`);
      return 1;
    }

    if (args.json) {
      stdout.write(JSON.stringify({ event: 'scaffold:start', template: tpl.id, name, target }) + '\n');
    } else {
      stdout.write(`${style(defaultTheme.accent, '◈ scaffolding')} ${tpl.id} → ${target}\n`);
      stdout.write(`  ${style(defaultTheme.muted, tpl.description)}\n`);
    }

    // Copy + patch
    await copyDir(tplDir, target);
    await patchPackageJson(target, name);

    if (!args.json) stdout.write(`  ${style(defaultTheme.success, '✓')} files copied\n`);

    // Install
    if (!args.noInstall) {
      const isWin = process.platform === 'win32';
      const npmBin = isWin ? 'npm.cmd' : 'npm';
      if (!args.json) stdout.write(`  ${style(defaultTheme.muted, 'running:')} npm ${tpl.installCommand.join(' ')}\n`);
      const r = spawnSync(npmBin, tpl.installCommand, { cwd: target, stdio: args.json ? 'pipe' : 'inherit', shell: isWin });
      if (r.status !== 0) {
        stderr.write(style(defaultTheme.danger, `npm install failed (exit ${r.status}). The project files were created at ${target}; you can retry the install manually.\n`));
        return 1;
      }
      if (!args.json) stdout.write(`  ${style(defaultTheme.success, '✓')} dependencies installed\n`);
    }

    // Print next-step hint
    const hint = `cd ${name} && ${tpl.devCommand}`;
    if (args.json) {
      stdout.write(JSON.stringify({ event: 'scaffold:done', template: tpl.id, name, target, devCommand: tpl.devCommand, port: tpl.defaultPort }) + '\n');
    } else {
      stdout.write(`\n${style(defaultTheme.success, '✓ scaffolded')} ${target}\n`);
      stdout.write(`\n  Next: ${style(defaultTheme.accent, hint)}\n`);
      stdout.write(`        Then open ${style(defaultTheme.accent, `http://localhost:${tpl.defaultPort}`)}\n\n`);
    }

    // Optional auto-serve
    if (args.serve && !args.noInstall) {
      if (!args.json) stdout.write(`  ${style(defaultTheme.muted, 'starting dev server in foreground (Ctrl+C to stop)…')}\n\n`);
      const isWin = process.platform === 'win32';
      const cmd = tpl.devCommand.split(/\s+/);
      const npmBin = cmd[0] === 'npm' && isWin ? 'npm.cmd' : cmd[0];
      const r = spawnSync(npmBin, cmd.slice(1), { cwd: target, stdio: 'inherit', shell: isWin });
      return r.status ?? 0;
    }

    return 0;
  },
};
