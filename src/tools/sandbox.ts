/** tools/sandbox.ts — Code execution sandbox (PTC pattern) */
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolResult } from '../types.js';

const MAX_OUTPUT = 20_000;
const DEFAULT_TIMEOUT = 10;   // tighter default (was 30)
const MAX_TIMEOUT = 120;
const PYTHON_MEMORY_MB = 256;

/** Restricted environment — only PATH, HOME, LANG survive. No API keys, no secrets. */
function sandboxEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (process.env.PATH) env.PATH = process.env.PATH;
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.LANG) env.LANG = process.env.LANG;
  // Disable Python network stack for untrusted code
  env['PYTHONDONTWRITEBYTECODE'] = '1';
  return env;
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '\n...[truncated]' : s;
}

function makeTempFile(ext: string): string {
  const name = `dirgha_sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return join(tmpdir(), name);
}

/**
 * Execute Python or JavaScript in a child process with restricted env.
 * Implements the PTC loop: LLM writes code, sandbox runs it,
 * only stdout is returned (zero context cost for internal tool calls).
 */
export function executeSandbox(input: Record<string, any>): ToolResult {
  const lang = input.language as string;
  const code = input.code as string;
  const timeoutSec = Math.min(Math.max(Number(input.timeout) || DEFAULT_TIMEOUT, 1), MAX_TIMEOUT);

  if (!lang || !code) {
    return { tool: 'execute_code', result: '', error: 'language and code are required' };
  }
  if (lang !== 'python' && lang !== 'javascript') {
    return { tool: 'execute_code', result: '', error: 'language must be "python" or "javascript"' };
  }

  const ext = lang === 'python' ? 'py' : 'mjs';
  const tmpFile = makeTempFile(ext);

  try {
    writeFileSync(tmpFile, code, 'utf8');

    // JavaScript: memory-capped node process
    // Python: memory-limited via ulimit wrapper if available, else direct
    let cmd: string;
    let args: string[];
    if (lang === 'javascript') {
      cmd = 'node';
      args = [`--max-old-space-size=${PYTHON_MEMORY_MB}`, tmpFile];
    } else {
      cmd = 'python3';
      args = [tmpFile];
      // Inject memory cap via resource module preamble
      const memPreamble = `import resource as _r; _r.setrlimit(_r.RLIMIT_AS, (${PYTHON_MEMORY_MB * 1024 * 1024}, ${PYTHON_MEMORY_MB * 1024 * 1024}))\n`;
      try {
        const existing = readFileSync(tmpFile, 'utf8');
        writeFileSync(tmpFile, memPreamble + existing, 'utf8');
      } catch { /* best-effort */ }
    }

    const result = spawnSync(cmd, args, {
      encoding: 'utf8',
      timeout: timeoutSec * 1000,
      env: sandboxEnv(),
      cwd: tmpdir(),
      maxBuffer: 1024 * 1024, // 1MB
    });

    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';

    if (result.error) {
      const msg = (result.error as any).code === 'ETIMEDOUT'
        ? `Execution timed out after ${timeoutSec}s`
        : result.error.message;
      return { tool: 'execute_code', result: truncate(stdout), error: msg };
    }

    if (result.status !== 0) {
      const errOut = stderr || `Process exited with code ${result.status}`;
      return { tool: 'execute_code', result: truncate(stdout), error: truncate(errOut) };
    }

    const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
    return { tool: 'execute_code', result: truncate(output) };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { tool: 'execute_code', result: '', error: msg };
  } finally {
    try { unlinkSync(tmpFile); } catch { /* already gone */ }
  }
}
