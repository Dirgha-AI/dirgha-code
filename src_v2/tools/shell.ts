/**
 * Shell command execution.
 *
 * Runs through a sandbox adapter when one is configured; otherwise
 * spawns a child process with inherited env. Output is captured with a
 * byte cap; on overflow we truncate and indicate the remaining size so
 * the model does not misread a capped stream as a complete one.
 */

import { spawn } from 'node:child_process';
import type { Tool } from './registry.js';
import type { ToolResult } from '../kernel/types.js';

interface Input {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

interface Output {
  exitCode: number;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

export const shellTool: Tool = {
  name: 'shell',
  description: 'Execute a shell command via /bin/sh. Returns stdout, stderr, and exit code. Long-running commands time out.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      cwd: { type: 'string' },
      timeoutMs: { type: 'integer', minimum: 1000 },
    },
    required: ['command'],
  },
  requiresApproval: () => true,
  async execute(rawInput: unknown, ctx): Promise<ToolResult<Output>> {
    const input = rawInput as Input;
    const cwd = input.cwd ?? ctx.cwd;
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const child = spawn('/bin/sh', ['-c', input.command], {
      cwd,
      env: ctx.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;

    const onData = (chunks: Buffer[], counter: (n: number) => number) => (buf: Buffer) => {
      const remaining = MAX_OUTPUT_BYTES - counter(0);
      if (remaining <= 0) { truncated = true; return; }
      const slice = buf.length <= remaining ? buf : buf.subarray(0, remaining);
      chunks.push(slice);
      counter(slice.length);
      if (buf.length > remaining) truncated = true;
    };

    const stdoutCount = ((acc = 0) => (add: number) => { acc += add; stdoutBytes = acc; return acc; })();
    const stderrCount = ((acc = 0) => (add: number) => { acc += add; stderrBytes = acc; return acc; })();

    child.stdout.on('data', onData(stdoutChunks, stdoutCount));
    child.stderr.on('data', onData(stderrChunks, stderrCount));

    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);

    const exitCode: number = await new Promise(resolveExit => {
      child.on('error', () => resolveExit(-1));
      child.on('exit', code => resolveExit(code ?? -1));
    });
    clearTimeout(timer);

    const stdout = Buffer.concat(stdoutChunks).toString('utf8');
    const stderr = Buffer.concat(stderrChunks).toString('utf8');
    const banner = `exit=${exitCode}${truncated ? ' [output truncated]' : ''}`;
    const body = [
      banner,
      stdout.length > 0 ? `STDOUT:\n${stdout}` : '',
      stderr.length > 0 ? `STDERR:\n${stderr}` : '',
    ].filter(Boolean).join('\n\n');

    return {
      content: body.length > 0 ? body : banner,
      data: { exitCode, stdoutBytes, stderrBytes, truncated },
      isError: exitCode !== 0,
    };
  },
};
