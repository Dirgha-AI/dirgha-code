/**
 * Bridges MCP-exposed tools into the local Tool registry. Each MCP tool
 * becomes a Tool whose execute() proxies to client.callTool().
 */

import type { Tool, ToolContext } from '../tools/registry.js';
import type { ToolResult } from '../kernel/types.js';
import type { McpClient, McpTool } from './client.js';

export interface McpBridgeOptions {
  serverName: string;
  prefix?: string;
}

export async function bridgeMcpTools(client: McpClient, opts: McpBridgeOptions): Promise<Tool[]> {
  const tools = await client.listTools();
  const prefix = opts.prefix ?? `${opts.serverName}_`;
  return tools.map(t => toolFromMcp(client, t, prefix));
}

function toolFromMcp(client: McpClient, mcp: McpTool, prefix: string): Tool {
  return {
    name: `${prefix}${mcp.name}`,
    description: mcp.description ?? `MCP tool: ${mcp.name}`,
    inputSchema: mcp.inputSchema as Tool['inputSchema'],
    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      try {
        const response = await client.callTool(mcp.name, input);
        const text = response.content.map(p => p.text ?? '').join('\n').trim();
        return {
          content: text.length > 0 ? text : '(empty response)',
          isError: response.isError ?? false,
        };
      } catch (err) {
        return {
          content: `MCP tool call failed: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
}
