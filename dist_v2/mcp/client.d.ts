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
    serverInfo: {
        name: string;
        version: string;
    };
    capabilities: Record<string, unknown>;
}
export interface McpTool {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}
export interface McpToolCallResult {
    content: Array<{
        type: string;
        text?: string;
    }>;
    isError?: boolean;
}
export declare class DefaultMcpClient implements McpClient {
    private transport;
    private nextId;
    private pending;
    constructor(transport: Transport);
    initialize(): Promise<InitializeResult>;
    listTools(): Promise<McpTool[]>;
    callTool(name: string, arguments_: unknown): Promise<McpToolCallResult>;
    close(): Promise<void>;
    private request;
    private handle;
}
