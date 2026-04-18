/**
 * extensions/types.ts — MCP extension type definitions
 */

export interface ExtensionConfig {
  name: string;           // Short name, used for tool namespacing: "github" → "github__list_prs"
  type: 'stdio' | 'http'; // stdio = local process, http = remote streamable HTTP
  command?: string[];     // For stdio: ["npx", "-y", "@modelcontextprotocol/server-github"]
  url?: string;           // For http: "http://localhost:8080/mcp"
  env?: Record<string, string>; // Extra environment variables
  description?: string;
}

export interface MCPTool {
  name: string;           // Original tool name from MCP server
  namespacedName: string; // e.g. "github__list_prs"
  description: string;
  inputSchema: Record<string, unknown>;
  extensionName: string;
}

export interface ExtensionManager {
  loadExtensions(): Promise<void>;
  getTools(): MCPTool[];
  callTool(namespacedName: string, input: Record<string, unknown>): Promise<string>;
  hasExtensions(): boolean;
}
