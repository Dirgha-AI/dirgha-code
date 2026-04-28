/**
 * `dirgha doctor` — environment diagnostics.
 *
 * Checks Node version (≥ 20), that cwd is a git repo, that `~/.dirgha/`
 * exists and is writable, which provider env vars are set, and whether
 * each configured provider's base endpoint is reachable (HEAD/GET with a
 * 3 s timeout). Prints a table by default; emits NDJSON when `--json`
 * is passed. Exit code 0 when every check passes, 1 if any fails.
 */

import { stat, access, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout } from 'node:process';
import { constants } from 'node:fs';
import { style, defaultTheme } from '../../tui/theme.js';
import type { Subcommand } from './index.js';

type CheckStatus = 'pass' | 'fail' | 'warn';

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

interface ProviderProbe {
  env: string;
  label: string;
  healthUrl: string;
}

const PROVIDER_PROBES: ProviderProbe[] = [
  { env: 'NVIDIA_API_KEY',     label: 'NVIDIA NIM',  healthUrl: 'https://integrate.api.nvidia.com/v1/models' },
  { env: 'OPENROUTER_API_KEY', label: 'OpenRouter',  healthUrl: 'https://openrouter.ai/api/v1/models' },
  { env: 'ANTHROPIC_API_KEY',  label: 'Anthropic',   healthUrl: 'https://api.anthropic.com/v1/models' },
  { env: 'OPENAI_API_KEY',     label: 'OpenAI',      healthUrl: 'https://api.openai.com/v1/models' },
  { env: 'GEMINI_API_KEY',     label: 'Google AI',   healthUrl: 'https://generativelanguage.googleapis.com' },
];

const TIMEOUT_MS = 3_000;
const MIN_NODE_MAJOR = 20;

async function checkNode(): Promise<CheckResult> {
  const major = Number.parseInt(process.version.slice(1).split('.')[0], 10);
  if (Number.isNaN(major)) return { name: 'node', status: 'fail', detail: `cannot parse ${process.version}` };
  if (major < MIN_NODE_MAJOR) return { name: 'node', status: 'fail', detail: `${process.version} (need ≥ v${MIN_NODE_MAJOR})` };
  return { name: 'node', status: 'pass', detail: process.version };
}

/**
 * Terminal compatibility — Ink raw-mode + ink-text-input on Windows
 * legacy console (cmd.exe / pre-2019 PowerShell) drops Backspace and
 * fights stdin handoff. Surface a warn when we detect that combo so
 * users can either upgrade to Windows Terminal or run with --readline
 * (DIRGHA_NO_INK=1) which avoids raw mode entirely.
 */
function checkTerminal(): CheckResult {
  if (process.platform !== 'win32') {
    return { name: 'terminal', status: 'pass', detail: `${process.platform} · ${process.env.TERM ?? 'unknown'}` };
  }
  // WT_SESSION is set by Windows Terminal; ConEmuANSI by ConEmu/Cmder.
  // Both behave correctly with ink raw mode. Their absence on Windows
  // implies legacy cmd.exe or PowerShell ISE — known to break Backspace.
  const isModern = process.env['WT_SESSION'] || process.env['ConEmuANSI'] === 'ON' || process.env['TERM_PROGRAM'] === 'vscode';
  if (isModern) {
    return { name: 'terminal', status: 'pass', detail: 'Windows · modern terminal detected' };
  }
  return {
    name: 'terminal',
    status: 'warn',
    detail: 'Windows legacy console — Backspace / arrow keys may misfire. Run inside Windows Terminal, VS Code terminal, or set DIRGHA_NO_INK=1 for the readline fallback.',
  };
}

async function checkGit(cwd: string): Promise<CheckResult> {
  const info = await stat(join(cwd, '.git')).catch(() => undefined);
  if (info?.isDirectory()) return { name: 'git', status: 'pass', detail: cwd };
  return { name: 'git', status: 'warn', detail: 'cwd is not a git repo' };
}

async function checkDirgaDir(): Promise<CheckResult> {
  const dir = join(homedir(), '.dirgha');
  await mkdir(dir, { recursive: true }).catch(() => undefined);
  try {
    await access(dir, constants.W_OK);
    return { name: 'dirgha-home', status: 'pass', detail: dir };
  } catch {
    return { name: 'dirgha-home', status: 'fail', detail: `cannot write to ${dir}` };
  }
}

async function probeProvider(probe: ProviderProbe): Promise<CheckResult> {
  const envPresent = Boolean(process.env[probe.env]);
  if (!envPresent) return { name: probe.label, status: 'warn', detail: `${probe.env} unset` };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(probe.healthUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    if (res.status < 500) return { name: probe.label, status: 'pass', detail: `${probe.healthUrl} (${res.status})` };
    return { name: probe.label, status: 'fail', detail: `HTTP ${res.status}` };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return { name: probe.label, status: 'fail', detail: `unreachable: ${msg}` };
  }
}

interface LocalProbe {
  label: string;
  url: string;
}

const LOCAL_PROBES: LocalProbe[] = [
  { label: 'Ollama',    url: 'http://localhost:11434/api/tags' },
  { label: 'llama.cpp', url: 'http://localhost:8080/v1/models' },
];

async function probeLocal(p: LocalProbe): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(p.url, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    if (res.status === 200) return { name: p.label, status: 'pass', detail: `${p.url} (200)` };
    return { name: p.label, status: 'warn', detail: `${p.url} (HTTP ${res.status})` };
  } catch {
    clearTimeout(timer);
    return { name: p.label, status: 'warn', detail: `${p.url} not running` };
  }
}

function printTable(results: CheckResult[]): void {
  stdout.write(style(defaultTheme.accent, '\nDirgha doctor\n\n'));
  for (const r of results) {
    const icon = r.status === 'pass'
      ? style(defaultTheme.success, '✓')
      : r.status === 'warn'
        ? style(defaultTheme.warning, '⚠')
        : style(defaultTheme.danger, '✗');
    stdout.write(`  ${icon} ${r.name.padEnd(16)} ${r.detail}\n`);
  }
  stdout.write('\n');
}

function printNdjson(results: CheckResult[]): void {
  for (const r of results) stdout.write(`${JSON.stringify(r)}\n`);
}

export const doctorSubcommand: Subcommand = {
  name: 'doctor',
  description: 'Environment diagnostics (node, git, providers)',
  async run(argv): Promise<number> {
    // CI-6b: --send-crash-report builds a sanitised bundle of doctor
    // output + audit log tail + recent error, shows the user a preview,
    // and only sends with explicit consent.
    if (argv.includes('--send-crash-report')) {
      const { runCrashReport } = await import('../../telemetry/crash-report.js');
      return runCrashReport({ argv });
    }

    const json = argv.includes('--json');
    const results: CheckResult[] = [];

    results.push(await checkNode());
    results.push(await checkGit(process.cwd()));
    results.push(await checkDirgaDir());
    results.push(checkTerminal());

    const probes = await Promise.all(PROVIDER_PROBES.map(probeProvider));
    results.push(...probes);

    const locals = await Promise.all(LOCAL_PROBES.map(probeLocal));
    results.push(...locals);

    if (json) printNdjson(results); else printTable(results);

    return results.some(r => r.status === 'fail') ? 1 : 0;
  },
};
