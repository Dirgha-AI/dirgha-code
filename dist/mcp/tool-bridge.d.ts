/**
 * Bridges MCP-exposed tools into the local Tool registry. Each MCP tool
 * becomes a Tool whose execute() proxies to client.callTool().
 */
import type { Tool } from '../tools/registry.js';
import type { McpClient } from './client.js';
export interface McpBridgeOptions {
    serverName: string;
    prefix?: string;
}
export declare function bridgeMcpTools(client: McpClient, opts: McpBridgeOptions): Promise<Tool[]>;
