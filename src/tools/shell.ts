/** tools/shell.ts — Persistent-cwd shell execution tool (async — never blocks event loop)
 *
 * Uses /bin/bash -c for full shell syntax: pipes, &&, ||, 2>&1, $(), etc.
 * cd is handled to track cwd across calls.
 */
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToolResult } from '../types.js';

// Bursty-request design (Sprint B3): cap single-tool output at 8k chars
// (~2k tokens) by default. A single tool_result consuming 12k+ tokens per
// turn was the biggest drag on context; most tools can respect a smaller
// budget with the agent re-calling for more if it needs more. Model can
// pass `max_output` in the tool args to expand up to MAX_HARD_OUTPUT.
const MAX_OUTPUT = 8_000;
const MAX_HARD_OUTPUT = 50_000;
const DEFAULT_TIMEOUT_MS = 60_000;   // 1 min — enough for most operations
const MAX_TIMEOUT_MS = 600_000;      // 10 min — hard cap so a stuck tool can't
                                      // wedge the agent loop forever
const SIGKILL_GRACE_MS = 3_000;      // after SIGTERM, wait this long then SIGKILL

const DANGEROUS_PATTERNS = [
  /\brm\s+-[a-z]*[rf][a-z]*\s/i,
  /\brm\s+--recursive\b/i,
  /\brm\s+-[a-z]*[rf][a-z]*$/i,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bshred\b/,
  /:\s*\(\s*\)\s*\{.*:\s*\|.*:\s*&\s*\}/,            // fork bomb
  // Additions from the 2026-04-18 dual-model security audit (Kimi + Llama):
  /\bfind\b[^|;&]*\s-delete\b/i,                      // find . -delete
  /\bfind\b[^|;&]*\s-exec\s+rm\b/i,                   // find ... -exec rm {} \;
  /\bgit\s+clean\s+-[a-z]*[fFdDxX]/i,                  // git clean -fd(x)
  /<\s*\(\s*(curl|wget|fetch)\b/i,                     // process substitution downloading
  /\b(curl|wget|fetch)\s[^|;&]*\|\s*(bash|sh|zsh|fish)\b/i, // curl | sh
  /\beval\s+["'`$]\s*\(/i,                              // eval $(...) / eval `...`
  /\bchmod\s+[0-7]{3,4}\s+\/(etc|var|bin|sbin|boot|root)\b/i,
  /\bchown\s+[^|;&]*\s+\/(etc|var|bin|sbin|boot|root)\b/i,
  />\s*\/(etc|bin|sbin|boot|lib|lib64)\/[^\s]+/i,      // > /etc/anything
  /\bcp\s+\/dev\/zero\b/i,                              // fill disk
  /\bcat\s+\/dev\/urandom\s*>\s*\/(dev\/[sh]d|mnt\/)/i, // wipe device
];

let currentCwd = process.cwd();

function runAsync(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null; signal: string | null; timedOut: boolean; elapsedMs: number }> {
  return new Promise((resolve) => {
    const started = Date.now();
    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, LANG: 'en_US.UTF-8' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    let timedOut = false;
    let killTimer: NodeJS.Timeout | null = null;

    const termTimer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      // If the process ignores SIGTERM (hung in uninterruptible I/O, caught
      // the signal, etc.), escalate to SIGKILL after a short grace period.
      killTimer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, SIGKILL_GRACE_MS);
    }, timeoutMs);

    proc.on('close', (code, signal) => {
      clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        stdout, stderr,
        code, signal: signal ?? null,
        timedOut, elapsedMs: Date.now() - started,
      });
    });
  });
}

/** Heuristic: commands likely to take >60s — model can override with timeout_ms. */
const LONG_RUNNING_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(install|i|ci|add|update|upgrade)\b/,
  /\b(npm|pnpm|yarn|bun)\s+run\s+(build|test|e2e|bench|deploy)\b/,
  /\b(pnpm|yarn)\s+--filter\b/,
  /\b(cargo|go|mvn|gradle)\s+(build|test|run)\b/,
  /\b(docker|podman)\s+(build|compose)\b/,
  /\b(pip|uv)\s+install\b/,
  /\bmake\b/,
  /\btsc\b/,
  /\bvitest\b/,
  /\bplaywright\b/,
];

function suggestedTimeout(command: string): number {
  return LONG_RUNNING_PATTERNS.some(re => re.test(command))
    ? 300_000   // 5 min for build/install/test
    : DEFAULT_TIMEOUT_MS;
}

/** Run a shell command via /bin/bash — async, never blocks the event loop.
 *
 * Input:
 *   - command: required string
 *   - timeout_ms: optional number, default = smart (60s normally, 300s for
 *     detected long-running ops like pnpm install / vitest / docker build),
 *     hard-capped at MAX_TIMEOUT_MS (10 min) so a stuck shell can't wedge
 *     the agent loop.
 */
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

  // Resolve timeout: caller-supplied > heuristic > default. Always capped.
  const requestedTimeout = Number(input['timeout_ms']);
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? Math.min(requestedTimeout, MAX_TIMEOUT_MS)
    : suggestedTimeout(command);

  try {
    const { stdout, stderr, code, signal, timedOut, elapsedMs } =
      await runAsync('/bin/bash', ['-c', command], currentCwd, timeoutMs);
    // Allow per-call override via `max_output` arg, hard-capped so a model
    // can't opt out of the safety limit entirely.
    const perCallMax = Math.min(
      Math.max(1_000, Number(input['max_output']) || MAX_OUTPUT),
      MAX_HARD_OUTPUT,
    );
    const rawCombined = stdout + stderr;
    let combined = rawCombined.slice(0, perCallMax).trimEnd();
    if (rawCombined.length > perCallMax) {
      combined += `\n[truncated ${rawCombined.length - perCallMax} chars · pass max_output: ${MAX_HARD_OUTPUT} for more, or re-run with a narrower query]`;
    }

    if (timedOut) {
      return {
        tool: 'run_command',
        result: combined,
        error: `timed out after ${Math.round(timeoutMs / 1000)}s — pass timeout_ms: ${Math.min(MAX_TIMEOUT_MS, timeoutMs * 2)} to retry with more time`,
      };
    }
    if (signal) return { tool: 'run_command', result: combined, error: `killed by signal ${signal} after ${elapsedMs}ms` };
    if (code !== 0) return { tool: 'run_command', result: combined || `exit ${code} after ${elapsedMs}ms` };
    return { tool: 'run_command', result: combined };
  } catch (e: any) {
    return { tool: 'run_command', result: '', error: String(e.message ?? e).slice(0, MAX_OUTPUT) };
  }
}
