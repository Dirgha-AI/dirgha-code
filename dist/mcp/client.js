/**
 * Minimal MCP client: JSON-RPC 2.0 over a Transport, with request
 * correlation by id and a simple notification fan-out. Sufficient for
 * initialize / tools/list / tools/call and resources/read.
 */
export class DefaultMcpClient {
    transport;
    nextId = 1;
    pending = new Map();
    requestTimeoutMs;
    constructor(transport, opts = {}) {
        this.transport = transport;
        // 30 s default — enough for slow MCP tools, short enough that a
        // server crash during a request can't hang the parent forever.
        this.requestTimeoutMs = opts.requestTimeoutMs ?? 30_000;
        this.transport.onMessage((msg) => this.handle(msg));
        this.transport.onClose?.(() => this.failPending("transport closed"));
    }
    failPending(reason) {
        for (const [, slot] of this.pending) {
            clearTimeout(slot.timer);
            slot.reject(new Error(reason));
        }
        this.pending.clear();
    }
    async initialize() {
        return await this.request("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            clientInfo: { name: "dirgha-cli", version: "0.2.0" },
        });
    }
    async listTools() {
        const result = await this.request("tools/list");
        return result.tools ?? [];
    }
    async callTool(name, arguments_) {
        return await this.request("tools/call", {
            name,
            arguments: arguments_,
        });
    }
    async close() {
        for (const [, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(new Error("Client closed"));
        }
        this.pending.clear();
        await this.transport.close();
    }
    async request(method, params) {
        const id = this.nextId++;
        const message = { jsonrpc: "2.0", id, method, params };
        const promise = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`MCP request timed out after ${this.requestTimeoutMs}ms (method=${method})`));
            }, this.requestTimeoutMs);
            timer.unref();
            this.pending.set(id, { resolve: (v) => resolve(v), reject, timer });
        });
        try {
            await this.transport.send(message);
        }
        catch (err) {
            const slot = this.pending.get(id);
            if (slot) {
                clearTimeout(slot.timer);
                this.pending.delete(id);
            }
            throw err;
        }
        return promise;
    }
    handle(raw) {
        if (!isResponse(raw))
            return;
        const pending = this.pending.get(raw.id);
        if (!pending)
            return;
        clearTimeout(pending.timer);
        this.pending.delete(raw.id);
        if (raw.error)
            pending.reject(new Error(`${raw.error.code}: ${raw.error.message}`));
        else
            pending.resolve(raw.result);
    }
}
function isResponse(v) {
    return (typeof v === "object" &&
        v !== null &&
        "jsonrpc" in v &&
        v.jsonrpc === "2.0" &&
        "id" in v);
}
//# sourceMappingURL=client.js.map