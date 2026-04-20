/** tools/shell.ts — Persistent-cwd shell execution tool (async — never blocks event loop)
 *
 * Uses /bin/bash -c for full shell syntax: pipes, &&, ||, 2>&1, $(), etc.
 * cd is handled to track cwd across calls.
 */
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToolResult } from '../types.js';

const MAX_OUTPUT = 50_000;
const TIMEOUT_MS = 60_000;

const DANGEROUS_PATTERNS = [
  /\brm\s+-[a-z]*[rf][a-z]*\s/i,
  /\brm\s+--recursive\b/i,
  /\brm\s+-[a-z]*[rf][a-z]*$/i,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bshred\b/,
  /:\s*\(\s*\)\s*\{.*:\s*\|.*:\s*&\s*\}/,
];

let currentCwd = process.cwd();

function runAsync(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null; signal: string | null }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, LANG: 'en_US.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
    }, timeoutMs);

    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, signal: signal ?? null });
    });
  });
}

/** Run a shell command via /bin/bash — async, never blocks the event loop. */
export async function runCommandTool(input: Record<string, any>): Promise<ToolResult> {
  const command = (input['command'] as string ?? '').trim();
  if (!command) return { tool: 'run_command', result: '', error: 'Command must be a non-empty string' };

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { tool: 'run_command', result: '', error: 'Command blocked: matches dangerous pattern' };
    }
  }

  // Track `cd` when it's the sole command
  const cdMatch = command.match(/^cd\s+([^\s;&|]+)\s*$/);
  if (cdMatch) {
    try {
      const newPath = resolve(currentCwd, cdMatch[1]!.trim().replace(/^['"]|['"]$/g, ''));
      statSync(newPath);
      currentCwd = newPath;
      return { tool: 'run_command', result: `cwd: ${currentCwd}` };
    } catch {
      return { tool: 'run_command', result: '', error: `cd: no such directory: ${cdMatch[1]}` };
    }
  }

  try {
    const { stdout, stderr, code, signal } = await runAsync('/bin/bash', ['-c', command], currentCwd, TIMEOUT_MS);
    const combined = (stdout + stderr).slice(0, MAX_OUTPUT).trimEnd();

    if (signal) return { tool: 'run_command', result: combined, error: `killed by signal ${signal}` };
    if (code !== 0) return { tool: 'run_command', result: combined || `exit ${code}` };
    return { tool: 'run_command', result: combined };
  } catch (e: any) {
    return { tool: 'run_command', result: '', error: String(e.message ?? e).slice(0, MAX_OUTPUT) };
  }
}
