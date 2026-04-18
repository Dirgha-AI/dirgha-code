/**
 * security/safeShell.ts — Shell injection protection (P0)
 * Safe shell execution without shell interpretation
 */
import { spawn, spawnSync } from 'node:child_process';

export interface SafeOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  maxBuffer?: number;
}

export interface SafeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const DANGEROUS_CHARS = /[;|&$><`\\]/;
const BLOCKED = new Set(['rm', 'dd', 'mkfs', 'fdisk', 'sudo', 'su', 'eval', 'exec']);

function parseCommand(cmd: string): { exe: string; args: string[] } {
  const segs: string[] = [];
  let cur = '', inQuote: '"' | "'" | null = null;
  for (const c of cmd) {
    if (inQuote) { c === inQuote ? inQuote = null : cur += c; }
    else if (c === '"' || c === "'") { inQuote = c; }
    else if (c === ' ' || c === '\t') { if (cur) { segs.push(cur); cur = ''; } }
    else if (DANGEROUS_CHARS.test(c)) { throw new Error(`Invalid char: ${c}`); }
    else { cur += c; }
  }
  if (cur) segs.push(cur);
  if (!segs.length) throw new Error('Empty command');
  return { exe: segs[0], args: segs.slice(1) };
}

function validate(exe: string, args: string[]): void {
  if (BLOCKED.has(exe.toLowerCase())) throw new Error(`Blocked: ${exe}`);
  for (const a of args) {
    if (DANGEROUS_CHARS.test(a)) throw new Error(`Invalid arg: ${a.slice(0, 20)}`);
    if (a.includes('..') && a.includes('/')) throw new Error('Path traversal');
  }
}

export function safeShell(cmd: string, opts: SafeOptions = {}): SafeResult {
  const { exe, args } = parseCommand(cmd);
  validate(exe, args);
  const res = spawnSync(exe, args, {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    timeout: opts.timeout || 30000,
    maxBuffer: opts.maxBuffer || 2 * 1024 * 1024,
    env: { ...process.env, ...opts.env, LANG: 'en_US.UTF-8' },
    shell: false,
    windowsHide: true,
  });
  return {
    stdout: (res.stdout || '').slice(0, 20000),
    stderr: (res.stderr || '').slice(0, 20000),
    exitCode: res.status ?? (res.error ? 1 : 0),
  };
}

export function safeShellStream(cmd: string, opts: SafeOptions & {
  onOut?: (d: string) => void;
  onErr?: (d: string) => void;
  onExit?: (c: number | null) => void;
} = {}): { kill: () => void } {
  const { exe, args } = parseCommand(cmd);
  validate(exe, args);
  const p = spawn(exe, args, {
    cwd: opts.cwd || process.cwd(),
    env: { ...process.env, ...opts.env, LANG: 'en_US.UTF-8' },
    shell: false,
    windowsHide: true,
  });
  if (opts.onOut) p.stdout?.on('data', d => opts.onOut!(d.toString()));
  if (opts.onErr) p.stderr?.on('data', d => opts.onErr!(d.toString()));
  if (opts.onExit) p.on('close', c => opts.onExit!(c));
  return { kill: () => p.kill() };
}
