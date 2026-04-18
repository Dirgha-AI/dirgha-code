/**
 * mcp/manager.ts — MCP Client Manager
 * Handles multiple MCP connections and tool dispatching
 */
import { MCPClient, type MCPClientOptions } from './client.js';
import type { MCPTool } from './server.js';
import { logger } from '../utils/logger.js';

export class MCPManager {
  private clients: Map<string, MCPClient> = new Map();
  private toolToClient: Map<string, string> = new Map();

  async addClient(options: MCPClientOptions): Promise<void> {
    const client = new MCPClient(options);
    try {
      await client.connect();
      const tools = await client.listTools();
      
      this.clients.set(options.name, client);
      for (const tool of tools) {
        // Namespace tools if there are collisions
        const toolName = this.toolToClient.has(tool.name) 
          ? `${options.name}_${tool.name}` 
          : tool.name;
        
        this.toolToClient.set(toolName, options.name);
      }
      
      logger.info(`Connected to MCP server: ${options.name} (${tools.length} tools)`);
    } catch (err: any) {
      logger.error(`Failed to connect to MCP server ${options.name}: ${err.message}`);
      throw err;
    }
  }

  async listAllTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];
    for (const [name, client] of this.clients) {
      const tools = await client.listTools();
      allTools.push(...tools.map(t => ({
        ...t,
        name: this.getNamespacedName(t.name, name)
      })));
    }
    return allTools;
  }

  private getNamespacedName(toolName: string, clientName: string): string {
    // If multiple clients have the same tool, we namespace
    return toolName; // Simplified for now
  }

  async callTool(toolName: string, args: any): Promise<any> {
    const clientName = this.toolToClient.get(toolName);
    if (!clientName) throw new Error(`Tool not found in any MCP server: ${toolName}`);
    
    const client = this.clients.get(clientName);
    if (!client) throw new Error(`MCP client not found: ${clientName}`);
    
    return client.callTool(toolName, args);
  }

  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
    this.toolToClient.clear();
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }
}

// Singleton manager
export const mcpManager = new MCPManager();
