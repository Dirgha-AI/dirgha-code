/**
 * Fallback sandbox that runs the command as the current user without
 * isolation. Used when no platform adapter is available; clearly
 * reports platform 'noop' so callers can warn.
 */

import { spawn } from 'node:child_process';
import type { SandboxAdapter, SandboxExecOptions, SandboxResult } from './iface.js';

export class NoopSandbox implements SandboxAdapter {
  readonly platform = 'noop' as const;

  async available(): Promise<boolean> {
    return true;
  }

  async exec(opts: SandboxExecOptions): Promise<SandboxResult> {
    return runDirect(opts, 'noop');
  }
}

export async function runDirect(opts: SandboxExecOptions, platform: 'noop' | 'macos' | 'linux' | 'linux-bwrap' | 'windows'): Promise<SandboxResult> {
  return new Promise(resolve => {
    const child = spawn(opts.command[0], opts.command.slice(1), {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);

    if (opts.signal) {
      const onAbort = (): void => { child.kill('SIGKILL'); };
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout.on('data', buf => stdout.push(buf));
    child.stderr.on('data', buf => stderr.push(buf));
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), exitCode: -1, timedOut, platform });
    });
    child.on('exit', code => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode: code ?? -1,
        timedOut,
        platform,
      });
    });
  });
}
