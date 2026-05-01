import type { LanguageServerInfo } from "./detector.js";
import { getServerForFile, getLspRoot } from "./detector.js";
import {
  createLspClient,
  type LspClient,
  type Position,
  type Location,
  type HoverResult,
  type DocumentSymbol,
  type SymbolInfo,
  type Diagnostic,
} from "./client.js";

interface ClientEntry {
  client: LspClient;
  serverId: string;
  root: string;
}

class LspManager {
  private clients: ClientEntry[] = [];
  private spawning = new Map<string, Promise<LspClient | null>>();
  private broken = new Set<string>();

  static instance(): LspManager {
    if (!_instance) _instance = new LspManager();
    return _instance;
  }

  async getClients(filePath: string): Promise<LspClient[]> {
    const server = getServerForFile(filePath);
    if (!server) return [];

    const root = getLspRoot(filePath, server);
    if (!root) return [];

    const brokenKey = `${server.id}::${root}`;
    if (this.broken.has(brokenKey)) return [];

    const existing = this.clients.filter(
      (c) => c.serverId === server.id && c.root === root,
    );
    if (existing.length) return existing.map((e) => e.client);

    const inflightKey = `${server.id}::${root}`;
    const inflight = this.spawning.get(inflightKey);
    if (inflight) {
      const client = await inflight;
      return client ? [client] : [];
    }

    const task = (async (): Promise<LspClient | null> => {
      try {
        const client = await createLspClient(
          server.id,
          server.command,
          server.args,
          root,
          process.cwd(),
        );
        this.clients.push({ client, serverId: server.id, root });
        return client;
      } catch {
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

  async hasClients(filePath: string): Promise<boolean> {
    const server = getServerForFile(filePath);
    if (!server || !server.detect()) return false;
    const root = getLspRoot(filePath, server);
    return root !== undefined && !this.broken.has(`${server.id}::${root}`);
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      this.clients.map((c) => c.client.shutdown().catch(() => {})),
    );
    this.clients = [];
    this.spawning.clear();
    this.broken.clear();
  }

  async goToDefinition(
    filePath: string,
    line: number,
    character: number,
  ): Promise<Location[]> {
    const clients = await this.getClients(filePath);
    if (!clients.length) return [];
    const pos: Position = { line: line - 1, character: character - 1 };
    const results = await Promise.all(
      clients.map((c) => c.goToDefinition(pos, filePath)),
    );
    return results.flat();
  }

  async findReferences(
    filePath: string,
    line: number,
    character: number,
  ): Promise<Location[]> {
    const clients = await this.getClients(filePath);
    if (!clients.length) return [];
    const pos: Position = { line: line - 1, character: character - 1 };
    const results = await Promise.all(
      clients.map((c) => c.findReferences(pos, filePath)),
    );
    return results.flat();
  }

  async hover(
    filePath: string,
    line: number,
    character: number,
  ): Promise<HoverResult | null> {
    const clients = await this.getClients(filePath);
    if (!clients.length) return null;
    const pos: Position = { line: line - 1, character: character - 1 };
    for (const client of clients) {
      const result = await client.hover(pos, filePath);
      if (result) return result;
    }
    return null;
  }

  async documentSymbols(
    filePath: string,
  ): Promise<(DocumentSymbol | SymbolInfo)[]> {
    const clients = await this.getClients(filePath);
    if (!clients.length) return [];
    const results = await Promise.all(
      clients.map((c) => c.documentSymbols(filePath)),
    );
    return results.flat();
  }

  async getDiagnostics(
    filePath?: string,
  ): Promise<Record<string, Diagnostic[]>> {
    const clients = await this.getClients(filePath ?? process.cwd());
    if (!clients.length) return {};
    const all: Record<string, Diagnostic[]> = {};
    for (const client of clients) {
      const diags = await client.getDiagnostics();
      for (const [file, items] of Object.entries(diags)) {
        all[file] = (all[file] ?? []).concat(items);
      }
    }
    return all;
  }

  status(): { id: string; root: string; connected: boolean }[] {
    return this.clients.map((c) => ({
      id: c.serverId,
      root: c.root,
      connected: true,
    }));
  }
}

let _instance: LspManager | null = null;

export function getLspManager(): LspManager {
  return LspManager.instance();
}

export { LspManager };
export type {
  HoverResult,
  Location,
  DocumentSymbol,
  SymbolInfo,
  Diagnostic,
  Position,
} from "./client.js";
export { symbolKindLabel } from "./client.js";
export {
  KNOWN_SERVERS,
  detectInstalledServers,
  getServerForFile,
  type LanguageServerInfo,
} from "./detector.js";
