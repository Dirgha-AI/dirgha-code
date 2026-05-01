import { getServerForFile, getLspRoot } from "./detector.js";
import { createLspClient, } from "./client.js";
class LspManager {
    clients = [];
    spawning = new Map();
    broken = new Set();
    static instance() {
        if (!_instance)
            _instance = new LspManager();
        return _instance;
    }
    async getClients(filePath) {
        const server = getServerForFile(filePath);
        if (!server)
            return [];
        const root = getLspRoot(filePath, server);
        if (!root)
            return [];
        const brokenKey = `${server.id}::${root}`;
        if (this.broken.has(brokenKey))
            return [];
        const existing = this.clients.filter((c) => c.serverId === server.id && c.root === root);
        if (existing.length)
            return existing.map((e) => e.client);
        const inflightKey = `${server.id}::${root}`;
        const inflight = this.spawning.get(inflightKey);
        if (inflight) {
            const client = await inflight;
            return client ? [client] : [];
        }
        const task = (async () => {
            try {
                const client = await createLspClient(server.id, server.command, server.args, root, process.cwd());
                this.clients.push({ client, serverId: server.id, root });
                return client;
            }
            catch {
                this.broken.add(brokenKey);
                return null;
            }
        })();
        this.spawning.set(inflightKey, task);
        task.finally(() => {
            if (this.spawning.get(inflightKey) === task) {
                this.spawning.delete(inflightKey);
            }
        });
        const client = await task;
        return client ? [client] : [];
    }
    async hasClients(filePath) {
        const server = getServerForFile(filePath);
        if (!server || !server.detect())
            return false;
        const root = getLspRoot(filePath, server);
        return root !== undefined && !this.broken.has(`${server.id}::${root}`);
    }
    async shutdown() {
        await Promise.all(this.clients.map((c) => c.client.shutdown().catch(() => { })));
        this.clients = [];
        this.spawning.clear();
        this.broken.clear();
    }
    async goToDefinition(filePath, line, character) {
        const clients = await this.getClients(filePath);
        if (!clients.length)
            return [];
        const pos = { line: line - 1, character: character - 1 };
        const results = await Promise.all(clients.map((c) => c.goToDefinition(pos, filePath)));
        return results.flat();
    }
    async findReferences(filePath, line, character) {
        const clients = await this.getClients(filePath);
        if (!clients.length)
            return [];
        const pos = { line: line - 1, character: character - 1 };
        const results = await Promise.all(clients.map((c) => c.findReferences(pos, filePath)));
        return results.flat();
    }
    async hover(filePath, line, character) {
        const clients = await this.getClients(filePath);
        if (!clients.length)
            return null;
        const pos = { line: line - 1, character: character - 1 };
        for (const client of clients) {
            const result = await client.hover(pos, filePath);
            if (result)
                return result;
        }
        return null;
    }
    async documentSymbols(filePath) {
        const clients = await this.getClients(filePath);
        if (!clients.length)
            return [];
        const results = await Promise.all(clients.map((c) => c.documentSymbols(filePath)));
        return results.flat();
    }
    async getDiagnostics(filePath) {
        const clients = await this.getClients(filePath ?? process.cwd());
        if (!clients.length)
            return {};
        const all = {};
        for (const client of clients) {
            const diags = await client.getDiagnostics();
            for (const [file, items] of Object.entries(diags)) {
                all[file] = (all[file] ?? []).concat(items);
            }
        }
        return all;
    }
    status() {
        return this.clients.map((c) => ({
            id: c.serverId,
            root: c.root,
            connected: true,
        }));
    }
}
let _instance = null;
export function getLspManager() {
    return LspManager.instance();
}
export { LspManager };
export { symbolKindLabel } from "./client.js";
export { KNOWN_SERVERS, detectInstalledServers, getServerForFile, } from "./detector.js";
//# sourceMappingURL=index.js.map