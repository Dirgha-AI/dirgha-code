/**
 * mcp/index.ts — MCP server and client exports
 */
export { MCPServer, createDefaultMCPServer, startStdioTransport } from './server.js';
export { MCPClient } from './client.js';
export type {
  MCPCapability,
  MCPResource,
  MCPTool,
  MCPContextRequest,
  MCPContextResponse
} from './server.js';
export type { MCPClientOptions } from './client.js';
