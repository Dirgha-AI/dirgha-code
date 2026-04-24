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
                child.on('error', err => reject(err));
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
    async close() {
        if (this.child && !this.child.killed) {
            this.child.kill();
            this.child = null;
        }
    }
}
//# sourceMappingURL=transport.js.map