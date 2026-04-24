/**
 * Minimal MCP client: JSON-RPC 2.0 over a Transport, with request
 * correlation by id and a simple notification fan-out. Sufficient for
 * initialize / tools/list / tools/call and resources/read.
 */
export class DefaultMcpClient {
    transport;
    nextId = 1;
    pending = new Map();
    constructor(transport) {
        this.transport = transport;
        this.transport.onMessage(msg => this.handle(msg));
    }
    async initialize() {
        return await this.request('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            clientInfo: { name: 'dirgha-cli', version: '0.2.0' },
        });
    }
    async listTools() {
        const result = await this.request('tools/list');
        return result.tools ?? [];
    }
    async callTool(name, arguments_) {
        return await this.request('tools/call', { name, arguments: arguments_ });
    }
    async close() {
        for (const [, pending] of this.pending)
            pending.reject(new Error('Client closed'));
        this.pending.clear();
        await this.transport.close();
    }
    async request(method, params) {
        const id = this.nextId++;
        const message = { jsonrpc: '2.0', id, method, params };
        const promise = new Promise((resolve, reject) => {
            this.pending.set(id, { resolve: v => resolve(v), reject });
        });
        await this.transport.send(message);
        return promise;
    }
    handle(raw) {
        if (!isResponse(raw))
            return;
        const pending = this.pending.get(raw.id);
        if (!pending)
            return;
        this.pending.delete(raw.id);
        if (raw.error)
            pending.reject(new Error(`${raw.error.code}: ${raw.error.message}`));
        else
            pending.resolve(raw.result);
    }
}
function isResponse(v) {
    return typeof v === 'object'
        && v !== null
        && 'jsonrpc' in v
        && v.jsonrpc === '2.0'
        && 'id' in v;
}
//# sourceMappingURL=client.js.map