/**
 * agent/output.ts — Shared emit() helper + universal JSON wrapper for
 * CLI-Anything --json compliance.
 *
 * Two levels of support:
 *
 * 1. Universal (installJsonCaptureIfEnabled): buffers stdout and, on process
 *    exit, wraps everything in an AgentOutput JSON envelope. Gives every
 *    command `--json` for free without touching their code. ANSI escapes
 *    are stripped from the captured text.
 *
 * 2. Native (emit/ok/fail): for commands that want to expose structured
 *    `data` fields — they build an AgentOutput and call emit(). Preferred
 *    for new commands.
 */
import type { AgentOutput } from './types.js';

/** True when the user passed --json (either at root or subcommand position). */
export function isJsonMode(): boolean {
  return process.env['DIRGHA_JSON_OUTPUT'] === '1';
}

/**
 * Reference to the REAL process.stdout.write kept before any interception.
 * Commands doing native JSON emit should call writeRaw() so their output
 * bypasses the universal capture wrapper.
 */
let realStdoutWrite: ((chunk: any) => boolean) | null = null;

export function writeRaw(s: string): void {
  if (realStdoutWrite) realStdoutWrite(s);
  else process.stdout.write(s);
}

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * One-shot installer: if --json was passed, buffer stdout writes and on
 * process exit emit an AgentOutput envelope with the captured text.
 * Skips if the command already emitted JSON natively (via emit()).
 */
export function installJsonCaptureIfEnabled(command: string): void {
  if (!isJsonMode()) return;
  if ((globalThis as any).__DIRGHA_JSON_CAPTURE_INSTALLED__) return;
  (globalThis as any).__DIRGHA_JSON_CAPTURE_INSTALLED__ = true;

  const startedAt = Date.now();
  const chunks: string[] = [];
  const errChunks: string[] = [];

  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);
  // Expose to commands that want to bypass capture and emit natively.
  realStdoutWrite = origStdout;

  // Mark if a command called emit() natively — skip the wrapper envelope
  (globalThis as any).__DIRGHA_JSON_NATIVELY_EMITTED__ = false;

  // In JSON mode we SUPPRESS human output during capture and emit only the
  // final envelope. Commands that want real-time progress should check
  // isJsonMode() and no-op their UI formatting.
  process.stdout.write = ((buf: any, ..._rest: any[]) => {
    const s = typeof buf === 'string' ? buf : buf?.toString?.() ?? '';
    chunks.push(s);
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((buf: any, ..._rest: any[]) => {
    const s = typeof buf === 'string' ? buf : buf?.toString?.() ?? '';
    errChunks.push(s);
    return true;
  }) as typeof process.stderr.write;

  let emitted = false;
  const emitEnvelope = () => {
    if (emitted) return;
    emitted = true;
    // Restore originals BEFORE writing envelope so we don't recurse
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    if ((globalThis as any).__DIRGHA_JSON_NATIVELY_EMITTED__) return;
    const stdout = chunks.join('').replace(ANSI_RE, '').trimEnd();
    const stderr = errChunks.join('').replace(ANSI_RE, '').trimEnd();
    const envelope: AgentOutput<{ stdout: string; stderr: string }> = {
      data: { stdout, stderr },
      text: stdout,
      exitCode: typeof process.exitCode === 'number' ? process.exitCode : 0,
      command,
      timestamp: new Date().toISOString(),
      meta: { durationMs: Date.now() - startedAt },
    };
    origStdout(JSON.stringify(envelope, null, 2) + '\n');
  };

  process.on('beforeExit', emitEnvelope);
  process.on('exit', emitEnvelope);
}

/** Emit an AgentOutput. Writes JSON if --json was passed, else the text field. */
export function emit<T = unknown>(out: AgentOutput<T>): void {
  if (isJsonMode()) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else {
    process.stdout.write(out.text + '\n');
  }
  if (out.exitCode !== 0) process.exitCode = out.exitCode;
}

/** Convenience: build an AgentOutput from a success payload. */
export function ok<T>(command: string, text: string, data?: T, meta?: AgentOutput['meta']): AgentOutput<T> {
  return {
    data,
    text,
    exitCode: 0,
    command,
    timestamp: new Date().toISOString(),
    meta,
  };
}

/** Convenience: build an AgentOutput from a failure payload. */
export function fail(command: string, text: string, suggestions?: string[], exitCode = 1): AgentOutput {
  return {
    text,
    exitCode,
    command,
    timestamp: new Date().toISOString(),
    suggestions,
  };
}
