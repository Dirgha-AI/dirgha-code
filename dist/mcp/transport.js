/**
 * MCP transport. Supports stdio (spawn subprocess, JSON-RPC over
 * stdin/stdout) for local servers. Remote HTTP/SSE transport can be
 * added later by implementing the same Transport interface.
 */
import { spawn } from "node:child_process";
import { safeEnvironment } from "../utils/env.js";
export class StdioTransport {
    opts;
    child = null;
    handlers = [];
    closeHandlers = [];
    buffer = "";
    ready;
    constructor(opts) {
        this.opts = opts;
        this.ready = this.start();
    }
    start() {
        return new Promise((resolve, reject) => {
            try {
                const child = spawn(this.opts.command, this.opts.args ?? [], {
                    env: { ...safeEnvironment(), ...this.opts.env },
                    cwd: this.opts.cwd,
                    stdio: ["pipe", "pipe", "pipe"],
                });
                this.child = child;
                if (!child.stdout || !child.stdin) {
                    reject(new Error(`MCP server ${this.opts.command} stdio is not piped`));
                    return;
                }
                child.stdout.on("data", (buf) => this.onData(buf));
                child.stderr.on("data", (buf) => {
                    process.stderr.write(`[mcp:${this.opts.command}] ${buf.toString("utf8")}`);
                });
                child.stdin.on("error", () => {
                    /* swallow EPIPE / ECONNRESET */
                });
                child.on("error", (err) => reject(err));
                child.on("exit", () => {
                    this.child = null;
                    for (const cb of this.closeHandlers)
                        cb();
                });
                child.on("spawn", () => resolve());
            }
            catch (err) {
                reject(err);
            }
        });
    }
    onData(buf) {
        this.buffer += buf.toString("utf8");
        let nl;
        while ((nl = this.buffer.indexOf("\n")) >= 0) {
            const line = this.buffer.slice(0, nl).trimEnd();
            this.buffer = this.buffer.slice(nl + 1);
            if (!line)
                continue;
            try {
                const parsed = JSON.parse(line);
                for (const h of this.handlers)
                    h(parsed);
            }
            catch {
                /* skip malformed */
            }
        }
    }
    async send(message) {
        await this.ready;
        if (!this.child || !this.child.stdin)
            throw new Error("Transport is closed");
        await new Promise((resolve, reject) => {
            this.child.stdin.write(JSON.stringify(message) + "\n", (err) => (err ? reject(err) : resolve()));
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
        if (typeof fetch !== "function") {
            throw new Error("HttpTransport requires a global fetch API (Node 18+ or a polyfill)");
        }
    }
    async send(message) {
        if (this.closed)
            throw new Error("HttpTransport is closed");
        const headers = {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
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
                method: "POST",
                headers,
                body: JSON.stringify(message),
                signal: ac.signal,
            });
        }
        finally {
            clearTimeout(timer);
        }
        if (!resp.ok)
            throw new Error(`MCP HTTP ${resp.status}: ${await resp.text().catch(() => "")}`);
        const ctype = resp.headers.get("content-type") ?? "";
        if (ctype.includes("application/json")) {
            const body = await resp.json();
            for (const h of this.handlers)
                h(body);
            return;
        }
        if (ctype.includes("text/event-stream") && resp.body) {
            // Parse SSE: each block is `event: foo\ndata: {...}\n\n`.
            // We only act on `data:` lines that JSON-parse cleanly.
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                buf += decoder.decode(value, { stream: true });
                // Process complete events (terminated by blank line).
                let idx;
                while ((idx = buf.indexOf("\n\n")) >= 0) {
                    const block = buf.slice(0, idx);
                    buf = buf.slice(idx + 2);
                    for (const line of block.split("\n")) {
                        if (!line.startsWith("data:"))
                            continue;
                        const payload = line.slice(5).trim();
                        if (!payload)
                            continue;
                        try {
                            const parsed = JSON.parse(payload);
                            for (const h of this.handlers)
                                h(parsed);
                        }
                        catch {
                            /* skip non-JSON SSE comments */
                        }
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