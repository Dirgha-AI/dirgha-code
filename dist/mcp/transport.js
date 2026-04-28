/**
 * MCP transport. Supports stdio (spawn subprocess, JSON-RPC over
 * stdin/stdout) for local servers. Remote HTTP/SSE transport can be
 * added later by implementing the same Transport interface.
 */
import { spawn } from 'node:child_process';
export class StdioTransport {
    opts;
    child = null;
    handlers = [];
    closeHandlers = [];
    buffer = '';
    ready;
    constructor(opts) {
        this.opts = opts;
        this.ready = this.start();
    }
    start() {
        return new Promise((resolve, reject) => {
            try {
                const child = spawn(this.opts.command, this.opts.args ?? [], {
                    env: { ...process.env, ...this.opts.env },
                    cwd: this.opts.cwd,
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
                this.child = child;
                child.stdout.on('data', (buf) => this.onData(buf));
                child.stderr.on('data', () => { });
                // EPIPE on stdin is expected if the subprocess crashes early
                // (e.g. /bin/false exits before we write). Listen so the
                // unhandled 'error' event doesn't tear down the parent.
                child.stdin.on('error', () => { });
                child.on('error', err => reject(err));
                child.on('exit', () => {
                    this.child = null;
                    // Notify upper layers so pending requests can be rejected
                    // immediately rather than waiting for the request timeout.
                    for (const cb of this.closeHandlers)
                        cb();
                });
                child.on('spawn', () => resolve());
            }
            catch (err) {
                reject(err);
            }
        });
    }
    onData(buf) {
        this.buffer += buf.toString('utf8');
        let idx;
        while ((idx = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, idx);
            this.buffer = this.buffer.slice(idx + 1);
            if (!line.trim())
                continue;
            try {
                const parsed = JSON.parse(line);
                for (const h of this.handlers)
                    h(parsed);
            }
            catch {
                continue;
            }
        }
    }
    async send(message) {
        await this.ready;
        if (!this.child || !this.child.stdin)
            throw new Error('Transport is closed');
        await new Promise((resolve, reject) => {
            const data = `${JSON.stringify(message)}\n`;
            this.child.stdin.write(data, err => err ? reject(err) : resolve());
        });
    }
    onMessage(handler) {
        this.handlers.push(handler);
    }
    onClose(handler) {
        this.closeHandlers.push(handler);
    }
    async close() {
        if (this.child && !this.child.killed) {
            this.child.kill();
            this.child = null;
        }
        for (const cb of this.closeHandlers)
            cb();
    }
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
export class HttpTransport {
    opts;
    handlers = [];
    closed = false;
    constructor(opts) {
        this.opts = opts;
    }
    async send(message) {
        if (this.closed)
            throw new Error('HttpTransport is closed');
        const headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            ...(this.opts.headers ?? {}),
        };
        // Token resolution: bearerProvider beats bearerToken so OAuth
        // refresh paths keep working when the static option is also set.
        const token = this.opts.bearerProvider
            ? await Promise.resolve(this.opts.bearerProvider())
            : this.opts.bearerToken;
        if (token)
            headers.Authorization = `Bearer ${token}`;
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), this.opts.timeoutMs ?? 60_000);
        let resp;
        try {
            resp = await fetch(this.opts.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(message),
                signal: ac.signal,
            });
        }
        finally {
            clearTimeout(timer);
        }
        if (!resp.ok)
            throw new Error(`MCP HTTP ${resp.status}: ${await resp.text().catch(() => '')}`);
        const ctype = resp.headers.get('content-type') ?? '';
        if (ctype.includes('application/json')) {
            const body = await resp.json();
            for (const h of this.handlers)
                h(body);
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
                if (done)
                    break;
                buf += decoder.decode(value, { stream: true });
                // Process complete events (terminated by blank line).
                let idx;
                while ((idx = buf.indexOf('\n\n')) >= 0) {
                    const block = buf.slice(0, idx);
                    buf = buf.slice(idx + 2);
                    for (const line of block.split('\n')) {
                        if (!line.startsWith('data:'))
                            continue;
                        const payload = line.slice(5).trim();
                        if (!payload)
                            continue;
                        try {
                            const parsed = JSON.parse(payload);
                            for (const h of this.handlers)
                                h(parsed);
                        }
                        catch { /* skip non-JSON SSE comments */ }
                    }
                }
            }
            return;
        }
        throw new Error(`MCP HTTP unexpected content-type: ${ctype}`);
    }
    onMessage(handler) {
        this.handlers.push(handler);
    }
    async close() {
        this.closed = true;
        this.handlers = [];
    }
}
//# sourceMappingURL=transport.js.map