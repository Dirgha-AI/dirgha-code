/**
 * MCP transport. Supports stdio (spawn subprocess, JSON-RPC over
 * stdin/stdout) for local servers. Remote HTTP/SSE transport can be
 * added later by implementing the same Transport interface.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export interface Transport {
  send(message: unknown): Promise<void>;
  onMessage(handler: (message: unknown) => void): void;
  close(): Promise<void>;
}

export interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export class StdioTransport implements Transport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private handlers: Array<(message: unknown) => void> = [];
  private buffer = '';
  private ready: Promise<void>;

  constructor(private opts: StdioTransportOptions) {
    this.ready = this.start();
  }

  private start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const child = spawn(this.opts.command, this.opts.args ?? [], {
          env: { ...process.env, ...this.opts.env },
          cwd: this.opts.cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
        }) as ChildProcessWithoutNullStreams;
        this.child = child;
        child.stdout.on('data', (buf: Buffer) => this.onData(buf));
        child.stderr.on('data', () => { /* drop stderr in v1 */ });
        child.on('error', err => reject(err));
        child.on('spawn', () => resolve());
      } catch (err) {
        reject(err);
      }
    });
  }

  private onData(buf: Buffer): void {
    this.buffer += buf.toString('utf8');
    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const parsed: unknown = JSON.parse(line);
        for (const h of this.handlers) h(parsed);
      } catch { continue; }
    }
  }

  async send(message: unknown): Promise<void> {
    await this.ready;
    if (!this.child || !this.child.stdin) throw new Error('Transport is closed');
    await new Promise<void>((resolve, reject) => {
      const data = `${JSON.stringify(message)}\n`;
      this.child!.stdin.write(data, err => err ? reject(err) : resolve());
    });
  }

  onMessage(handler: (message: unknown) => void): void {
    this.handlers.push(handler);
  }

  async close(): Promise<void> {
    if (this.child && !this.child.killed) {
      this.child.kill();
      this.child = null;
    }
  }
}
