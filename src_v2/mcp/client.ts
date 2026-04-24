/**
 * Minimal MCP client: JSON-RPC 2.0 over a Transport, with request
 * correlation by id and a simple notification fan-out. Sufficient for
 * initialize / tools/list / tools/call and resources/read.
 */

import { Transport } from './transport.js';

export interface McpClient {
  initialize(): Promise<InitializeResult>;
  listTools(): Promise<McpTool[]>;
  callTool(name: string, arguments_: unknown): Promise<McpToolCallResult>;
  close(): Promise<void>;
}

export interface InitializeResult {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  capabilities: Record<string, unknown>;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class DefaultMcpClient implements McpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (err: unknown) => void }>();

  constructor(private transport: Transport) {
    this.transport.onMessage(msg => this.handle(msg));
  }

  async initialize(): Promise<InitializeResult> {
    return await this.request<InitializeResult>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'dirgha-cli', version: '0.2.0' },
    });
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.request<{ tools: McpTool[] }>('tools/list');
    return result.tools ?? [];
  }

  async callTool(name: string, arguments_: unknown): Promise<McpToolCallResult> {
    return await this.request<McpToolCallResult>('tools/call', { name, arguments: arguments_ });
  }

  async close(): Promise<void> {
    for (const [, pending] of this.pending) pending.reject(new Error('Client closed'));
    this.pending.clear();
    await this.transport.close();
  }

  private async request<T>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    const message: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: v => resolve(v as T), reject });
    });
    await this.transport.send(message);
    return promise;
  }

  private handle(raw: unknown): void {
    if (!isResponse(raw)) return;
    const pending = this.pending.get(raw.id);
    if (!pending) return;
    this.pending.delete(raw.id);
    if (raw.error) pending.reject(new Error(`${raw.error.code}: ${raw.error.message}`));
    else pending.resolve(raw.result);
  }
}

function isResponse(v: unknown): v is JsonRpcResponse {
  return typeof v === 'object'
    && v !== null
    && 'jsonrpc' in v
    && (v as { jsonrpc: string }).jsonrpc === '2.0'
    && 'id' in v;
}
