import { spawn, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';

export interface ExecutionOptions {
  timeout?: number;
  retries?: number;
  fallback?: string[];
  onTimeout?: 'kill' | 'fallback' | 'prompt';
  maxOutputBytes?: number;
  chunked?: boolean;
  chunkSize?: number;
  env?: Record<string, string>;
  cwd?: string;
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  attempts: number;
  strategy: 'direct' | 'fallback' | 'chunked' | 'failed';
  killed?: boolean;
  truncated?: boolean;
}

export interface ExecutionProgress {
  bytes: number;
  lines: number;
  duration: number;
}

export class ExecutionController extends EventEmitter {
  private defaultTimeout = 30000;
  private maxOutputBytes = 100000;
  private chunkSize = 100;
  private activeChildren = new Set<import('child_process').ChildProcess>();

  /**
   * Kill all active child processes (called on ESC/interrupt).
   * Returns the number of processes killed.
   */
  killAll(): number {
    let killed = 0;
    for (const child of this.activeChildren) {
      try {
        if (!child.killed) {
          child.kill('SIGKILL');
          killed++;
        }
      } catch {
        // Already dead
      }
    }
    this.activeChildren.clear();
    return killed;
  }

  async execute(
    command: string,
    args: string[],
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const timeout = options.timeout ?? this.defaultTimeout;
    // retries = number of extra retries; maxAttempts includes initial attempt
    const retries = options.retries ?? 2;
    const maxAttempts = retries + 1;
    const fallback = options.fallback ?? [];
    const maxOutput = options.maxOutputBytes ?? this.maxOutputBytes;
    const chunked = options.chunked ?? false;

    let lastError: Error | null = null;
    let lastResult: ExecutionResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.emit('attempt', { attempt, command: `${command} ${args.join(' ')}`, totalAttempts: maxAttempts });

        const result = await this.runWithTimeout(command, args, timeout, maxOutput, options);
        lastResult = result;

        if (result.success) {
          return { ...result, attempts: attempt, strategy: 'direct' };
        }

        if (result.stdout.length > 50000 && !chunked) {
          this.emit('chunking', { reason: 'large_output', size: result.stdout.length });
          return this.executeChunked(command, args, options, maxOutput);
        }

        lastError = new Error(`Exit code ${result.exitCode}: ${result.stderr.slice(0, 200)}`);

        if (attempt < maxAttempts) {
          const delayMs = 1000 * attempt;
          this.emit('retry', { attempt, delayMs, error: lastError.message });
          await this.delay(delayMs);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (this.listenerCount('error') > 0) this.emit('error', { attempt, error: lastError.message });

        if (attempt < maxAttempts) {
          await this.delay(1000 * attempt);
        }
      }
    }

    // fallback is [cmd, ...args] tuple
    if (fallback.length > 0) {
      const [fallbackCmd, ...fallbackArgs] = fallback;
      try {
        this.emit('fallback', { from: command, to: fallbackCmd, index: 1, total: 1 });
        const result = await this.runWithTimeout(fallbackCmd!, fallbackArgs, timeout * 2, maxOutput, options);
        if (result.success) {
          return { ...result, attempts: maxAttempts + 1, strategy: 'fallback' };
        }
      } catch {
        // fall through to failure
      }
    }

    if (lastResult) {
      return { ...lastResult, attempts: maxAttempts, strategy: 'failed' };
    }
    return {
      success: false,
      stdout: '',
      stderr: lastError?.message ?? 'Unknown error',
      exitCode: 1,
      duration: 0,
      attempts: maxAttempts,
      strategy: 'failed',
    };
  }

  private runWithTimeout(
    command: string,
    args: string[],
    timeoutMs: number,
    maxOutput: number,
    options: ExecutionOptions
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const spawnOpts: SpawnOptions = {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '1', ...options.env },
        cwd: options.cwd,
      };

      const child = spawn(command, args, spawnOpts);
      this.activeChildren.add(child);

      let stdout = '';
      let stderr = '';
      let killed = false;
      let truncated = false;

      const timer = setTimeout(() => {
        killed = true;
        this.emit('timeout', { command, duration: Date.now() - startTime, limit: timeoutMs });
        child.kill('SIGTERM');

        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeoutMs);

      let lastProgress = 0;

      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length > maxOutput && !truncated) {
          truncated = true;
          stdout += chunk.slice(0, maxOutput - stdout.length);
          this.emit('truncated', { maxBytes: maxOutput });
        } else if (!truncated) {
          stdout += chunk;
        }
        const total = stdout.length + stderr.length;
        if (total > lastProgress + 1000) {
          this.emit('progress', {
            bytes: total,
            lines: stdout.split('\n').length,
            duration: Date.now() - startTime,
          } as ExecutionProgress);
          lastProgress = total;
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        this.activeChildren.delete(child);

        const duration = Date.now() - startTime;

        if (killed && signal === 'SIGTERM') {
          resolve({
            success: false,
            stdout,
            stderr: `Timeout after ${timeoutMs}ms. Process killed.`,
            exitCode: 124,
            duration,
            attempts: 0,
            strategy: 'direct',
            killed: true,
            truncated,
          });
          return;
        }

        resolve({
          success: code === 0,
          stdout,
          stderr,
          exitCode: code ?? 0,
          duration,
          attempts: 0,
          strategy: 'direct',
          killed,
          truncated,
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.activeChildren.delete(child);
        reject(err);
      });
    });
  }

  private async executeChunked(
    command: string,
    args: string[],
    options: ExecutionOptions,
    maxOutput: number
  ): Promise<ExecutionResult> {
    const chunkSize = options.chunkSize ?? this.chunkSize;
    const allInput = args.join(' ').split('\n').filter(s => s.trim());
    const chunks = this.chunkArray(allInput, chunkSize);

    let combinedStdout = '';
    let combinedStderr = '';
    let totalDuration = 0;

    for (let i = 0; i < chunks.length; i++) {
      this.emit('chunk', { current: i + 1, total: chunks.length, size: chunks[i].length });

      const chunkResult = await this.runWithTimeout(
        command,
        chunks[i],
        options.timeout ?? this.defaultTimeout,
        Math.floor(maxOutput / chunks.length),
        options
      );

      combinedStdout += chunkResult.stdout + '\n';
      combinedStderr += chunkResult.stderr + '\n';
      totalDuration += chunkResult.duration;

      if (!chunkResult.success) {
        return {
          success: false,
          stdout: combinedStdout,
          stderr: combinedStderr + `\nChunk ${i + 1} failed: ${chunkResult.stderr}`,
          exitCode: chunkResult.exitCode,
          duration: totalDuration,
          attempts: 1,
          strategy: 'chunked',
        };
      }

      if (i < chunks.length - 1) {
        await this.delay(100);
      }
    }

    return {
      success: true,
      stdout: combinedStdout,
      stderr: combinedStderr,
      exitCode: 0,
      duration: totalDuration,
      attempts: 1,
      strategy: 'chunked',
    };
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const executionController = new ExecutionController();
