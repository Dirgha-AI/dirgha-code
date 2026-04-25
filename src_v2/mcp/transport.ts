/**
 * MCP transport. Supports stdio (spawn subprocess, JSON-RPC over
 * stdin/stdout) for local servers. Remote HTTP/SSE transport can be
 * added later by implementing the same Transport interface.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export interface Transport {
  send(message: unknown): Promise<void>;
  onMessage(handler: (message: unknown) => void): void;
  /** Subscribe to transport-level close (server crash, pipe broken, etc.). */
  onClose?(handler: () => void): void;
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
  private closeHandlers: Array<() => void> = [];
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
        // EPIPE on stdin is expected if the subprocess crashes early
        // (e.g. /bin/false exits before we write). Listen so the
        // unhandled 'error' event doesn't tear down the parent.
        child.stdin.on('error', () => { /* swallow EPIPE / ECONNRESET */ });
        child.on('error', err => reject(err));
        child.on('exit', () => {
          this.child = null;
          // Notify upper layers so pending requests can be rejected
          // immediately rather than waiting for the request timeout.
          for (const cb of this.closeHandlers) cb();
        });
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

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  async close(): Promise<void> {
    if (this.child && !this.child.killed) {
      this.child.kill();
      this.child = null;
    }
    for (const cb of this.closeHandlers) cb();
  }
}

export interface HttpTransportOptions {
  /** MCP server endpoint, e.g. https://mcp.example.com/v1 */
  url: string;
  /** Static bearer token / API key. Mutually exclusive with `bearerProvider`. */
  bearerToken?: string;
  /**
   * Async bearer-token provider. Called before every request so OAuth
   * tokens can refresh without recreating the transport. Cache the
   * token inside the callback and only re-mint on expiry.
   */
  bearerProvider?: () => Promise<string | undefined> | string | undefined;
  /** Extra headers (Origin, X-Project, etc.). */
  headers?: Record<string, string>;
  /** Per-request timeout in ms. Default 60s. */
  timeoutMs?: number;
}

/**
 * HTTP transport for remote MCP servers using the streamable-HTTP
 * variant (POST per request, response is `text/event-stream` SSE).
 *
 * The send() method:
 *   - posts the JSON-RPC envelope to `${url}/messages` (or just `url`)
 *   - reads the response body as SSE; every `data:` line that parses
 *     to JSON is fanned out to handlers (notifications + the
 *     correlated response come through the same channel).
 *
 * Notifications (server-initiated `tools/list_changed`, etc.) arrive
 * on the response stream of the most recent client request, which is
 * the canonical pattern for streamable-HTTP MCP — no separate WS
 * connection.
 */
export class HttpTransport implements Transport {
  private handlers: Array<(message: unknown) => void> = [];
  private closed = false;

  constructor(private opts: HttpTransportOptions) {}

  async send(message: unknown): Promise<void> {
    if (this.closed) throw new Error('HttpTransport is closed');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(this.opts.headers ?? {}),
    };
    // Token resolution: bearerProvider beats bearerToken so OAuth
    // refresh paths keep working when the static option is also set.
    const token = this.opts.bearerProvider
      ? await Promise.resolve(this.opts.bearerProvider())
      : this.opts.bearerToken;
    if (token) headers.Authorization = `Bearer ${token}`;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.opts.timeoutMs ?? 60_000);
    let resp: Response;
    try {
      resp = await fetch(this.opts.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) throw new Error(`MCP HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);

    const ctype = resp.headers.get('content-type') ?? '';
    if (ctype.includes('application/json')) {
      const body = await resp.json();
      for (const h of this.handlers) h(body);
      return;
    }
    if (ctype.includes('text/event-stream') && resp.body) {
      // Parse SSE: each block is `event: foo\ndata: {...}\n\n`.
      // We only act on `data:` lines that JSON-parse cleanly.
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Process complete events (terminated by blank line).
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const parsed: unknown = JSON.parse(payload);
              for (const h of this.handlers) h(parsed);
            } catch { /* skip non-JSON SSE comments */ }
          }
        }
      }
      return;
    }
    throw new Error(`MCP HTTP unexpected content-type: ${ctype}`);
  }

  onMessage(handler: (message: unknown) => void): void {
    this.handlers.push(handler);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.handlers = [];
  }
}
