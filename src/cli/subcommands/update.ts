/**
 * `dirgha update` — check for + install package updates.
 *
 *   dirgha update --check                Print current + latest version, no install
 *   dirgha update [--yes]                Check, prompt, then `npm i -g @dirgha/code@latest`
 *   dirgha update --packages             Re-clone every installed user-skill pack
 *   dirgha update --self [--yes]         Update binary only (skip packs)
 *
 * Always confirms before mutating state unless `--yes` is passed.
 * Audit-logs the upgrade so users can see what changed when.
 *
 * Initial implementation seeded by a hy3 dogfood run; ported here so the
 * subcommand surface lives where the rest of `dirgha *` verbs live.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdout, stderr, stdin } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { appendAudit } from '../../audit/writer.js';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

const PKG = '@dirgha/code';

interface VersionCheck {
  current: string;
  latest: string | null;
  outdated: boolean;
  error?: string;
}

export async function checkLatestVersion(opts: {
  pkg?: string;
  currentVersion: string;
  fetchImpl?: typeof fetch;
}): Promise<VersionCheck> {
  const pkg = opts.pkg ?? PKG;
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const resp = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as { version?: string };
    const latest = typeof data.version === 'string' ? data.version : null;
    if (!latest) throw new Error('registry response had no version field');
    return { current: opts.currentVersion, latest, outdated: compareSemver(opts.currentVersion, latest) === -1 };
  } catch (err) {
    return { current: opts.currentVersion, latest: null, outdated: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Compare two semver-shaped strings. Returns -1 / 0 / 1 like a string
 * comparator. Numeric segments compare numerically (so `1.10.0` > `1.9.9`);
 * pre-release suffixes sort below the bare release (`1.0.0-rc.1` < `1.0.0`).
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const split = (s: string): Array<{ num: number; pre?: string }> =>
    s.split('.').map(p => {
      const [num, pre] = p.split('-', 2);
      return { num: Number.parseInt(num, 10) || 0, pre };
    });
  const aP = split(a);
  const bP = split(b);
  const len = Math.max(aP.length, bP.length);
  for (let i = 0; i < len; i++) {
    const ap = aP[i] ?? { num: 0 };
    const bp = bP[i] ?? { num: 0 };
    if (ap.num < bp.num) return -1;
    if (ap.num > bp.num) return 1;
    if (ap.pre === undefined && bp.pre === undefined) continue;
    if (ap.pre === undefined) return 1;   // bare release > pre-release
    if (bp.pre === undefined) return -1;
    if (ap.pre < bp.pre) return -1;
    if (ap.pre > bp.pre) return 1;
  }
  return 0;
}

export interface InstalledPack { name: string; path: string; version?: string }

export function listInstalledPacks(opts: { baseDir?: string } = {}): InstalledPack[] {
  const baseDir = opts.baseDir ?? join(homedir(), '.dirgha');
  const skillsDir = join(baseDir, 'skills');
  const out: InstalledPack[] = [];
  let entries: Dirent[] = [];
  try { entries = readdirSync(skillsDir, { withFileTypes: true }) as Dirent[]; } catch { return out; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = String(entry.name);
    const dir = join(skillsDir, name);
    const skillMd = join(dir, 'SKILL.md');
    try { if (!statSync(skillMd).isFile()) continue; } catch { continue; }
    let version: string | undefined;
    try {
      const text = readFileSync(skillMd, 'utf8');
      const fm = /^---\s*\n([\s\S]*?)\n---/.exec(text);
      if (fm) {
        const v = /^version\s*:\s*(.+)$/m.exec(fm[1]);
        if (v) version = v[1].trim();
      }
    } catch { /* skip */ }
    out.push({ name, path: dir, ...(version !== undefined ? { version } : {}) });
  }
  return out;
}

function parseFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

async function confirm(question: string): Promise<boolean> {
  if (!stdin.isTTY) return false;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally { rl.close(); }
}

function readOwnVersion(): string {
  // Read the package.json that ships next to the compiled CLI. Falls back
  // to "0.0.0-dev" when running from sources without a built tree.
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const candidate of [join(here, '..', '..', '..', 'package.json'), join(here, '..', '..', 'package.json')]) {
      try {
        const txt = readFileSync(candidate, 'utf8');
        const v = JSON.parse(txt).version;
        if (typeof v === 'string') return v;
      } catch { /* try next */ }
    }
  } catch { /* */ }
  return '0.0.0-dev';
}

async function runUpgradePackages(yes: boolean): Promise<number> {
  const packs = listInstalledPacks();
  if (packs.length === 0) {
    stdout.write(style(defaultTheme.muted, '(no installed packs to update)\n'));
    return 0;
  }
  stdout.write(style(defaultTheme.accent, `Will refresh ${packs.length} pack${packs.length === 1 ? '' : 's'}:\n`));
  for (const p of packs) stdout.write(`  ${p.name}${p.version ? `  (${p.version})` : ''}\n`);
  if (!yes && !await confirm('Pull latest from each pack\'s git origin?')) {
    stdout.write(style(defaultTheme.muted, 'aborted.\n'));
    return 0;
  }
  let okCount = 0;
  for (const p of packs) {
    // Fetch then reset --hard so diverged branches (forced pushes, rebases)
    // always update cleanly. `pull --ff-only` aborts when branches diverge.
    const fetch = spawnSync('git', ['-C', p.path, 'fetch', 'origin', '--depth=1'], { stdio: 'inherit' });
    const branch = spawnSync('git', ['-C', p.path, 'rev-parse', '--abbrev-ref', 'FETCH_HEAD'], { encoding: 'utf8' });
    const remote = (branch.stdout?.trim() || 'origin/main');
    const reset = fetch.status === 0
      ? spawnSync('git', ['-C', p.path, 'reset', '--hard', remote], { stdio: 'inherit' })
      : { status: fetch.status };
    if (reset.status === 0) okCount++;
    else stderr.write(style(defaultTheme.danger, `✗ ${p.name}: git pull failed (exit ${reset.status})\n`));
  }
  void appendAudit({ kind: 'update', summary: `packs ${okCount}/${packs.length} updated`, target: 'packs', updated: okCount, total: packs.length });
  stdout.write(style(defaultTheme.success, `✓ refreshed ${okCount}/${packs.length} packs\n`));
  return 0;
}

async function runUpgradeSelf(yes: boolean): Promise<number> {
  const current = readOwnVersion();
  const check = await checkLatestVersion({ currentVersion: current });
  if (check.error) {
    stderr.write(style(defaultTheme.danger, `✗ could not reach the npm registry: ${check.error}\n`));
    return 1;
  }
  if (!check.outdated) {
    stdout.write(style(defaultTheme.success, `✓ already on the latest (${current})\n`));
    return 0;
  }
  stdout.write(style(defaultTheme.accent, `Update available: ${current} → ${check.latest}\n`));
  if (!yes && !await confirm(`Run \`npm i -g ${PKG}@latest\`?`)) {
    stdout.write(style(defaultTheme.muted, 'aborted.\n'));
    return 0;
  }
  void appendAudit({ kind: 'update', summary: `self ${current} → ${check.latest}`, target: 'self', from: current, to: check.latest ?? '?' });
  try {
    // Windows: npm is npm.cmd (no PATHEXT in execFile). shell:true is safe
    // because PKG is a hard-coded constant, not user input (CVE-2024-27980).
    const isWin = process.platform === 'win32';
    const npmBin = isWin ? 'npm.cmd' : 'npm';
    execFileSync(npmBin, ['i', '-g', `${PKG}@latest`], { stdio: 'inherit', shell: isWin });
    stdout.write(style(defaultTheme.success, `✓ ${PKG} upgraded to ${check.latest}\n`));
    // On Windows, libuv emits an assertion error (UV_HANDLE_CLOSING) when
    // the old binary exits after spawning npm. Force-exit cleanly here so
    // that assertion never fires. The new binary takes over on next launch.
    if (isWin) process.exit(0);
    return 0;
  } catch (err) {
    stderr.write(style(defaultTheme.danger, `✗ npm install failed: ${err instanceof Error ? err.message : String(err)}\n`));
    return 1;
  }
}

export const updateSubcommand: Subcommand = {
  name: 'update',
  description: 'Check + install dirgha and pack updates',
  async run(argv): Promise<number> {
    const yes = parseFlag(argv, 'yes');
    const checkOnly = parseFlag(argv, 'check');
    const onlyPacks = parseFlag(argv, 'packages');
    const onlySelf = parseFlag(argv, 'self');

    if (checkOnly) {
      const current = readOwnVersion();
      const check = await checkLatestVersion({ currentVersion: current });
      const status = check.error
        ? style(defaultTheme.danger, `error: ${check.error}`)
        : check.outdated
          ? style(defaultTheme.accent, `update available: ${check.latest}`)
          : style(defaultTheme.success, 'up to date');
      stdout.write(`${PKG.padEnd(20)} ${current.padEnd(10)} ${status}\n`);
      return 0;
    }

    if (onlyPacks) return runUpgradePackages(yes);
    if (onlySelf)  return runUpgradeSelf(yes);

    // Default: self + packs.
    const a = await runUpgradeSelf(yes);
    const b = await runUpgradePackages(yes);
    return a === 0 && b === 0 ? 0 : 1;
  },
};
