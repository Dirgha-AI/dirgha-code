/**
 * mcp/server.ts — Model Context Protocol server foundation
 * Sprint 15: MCP Server Implementation
 * 
 * MCP is an open protocol for model context exchange between
 * AI agents and tools. This implements the server-side foundation.
 * 
 * Protocol: https://modelcontextprotocol.io
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';

export interface MCPCapability {
  name: string;
  version: string;
  methods: string[];
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}

export interface MCPContextRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface MCPContextResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP Server implementation
 * Provides context exchange capabilities for AI agents
 */
export class MCPServer extends EventEmitter {
  private port: number;
  private capabilities: Map<string, MCPCapability> = new Map();
  private resources: Map<string, MCPResource> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private server: ReturnType<typeof createServer> | null = null;

  constructor(port: number = 8080) {
    super();
    this.port = port;
    this.registerCoreCapabilities();
  }

  private registerCoreCapabilities() {
    // Core MCP capabilities
    this.capabilities.set('resources', {
      name: 'resources',
      version: '1.0.0',
      methods: ['resources/list', 'resources/read']
    });
    
    this.capabilities.set('tools', {
      name: 'tools',
      version: '1.0.0',
      methods: ['tools/list', 'tools/call']
    });
    
    this.capabilities.set('prompts', {
      name: 'prompts',
      version: '1.0.0',
      methods: ['prompts/list', 'prompts/get']
    });
    
    this.capabilities.set('context', {
      name: 'context',
      version: '1.0.0',
      methods: ['context/get', 'context/set', 'context/clear']
    });
  }

  /**
   * Register a resource that can be read by clients
   */
  registerResource(resource: MCPResource): void {
    this.resources.set(resource.uri, resource);
    this.emit('resource:registered', resource);
  }

  /**
   * Register a tool that can be called by clients
   */
  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
    this.emit('tool:registered', tool);
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handleRequest(req, res));
    
    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, () => {
        this.emit('started', { port: this.port });
        resolve();
      });
      
      this.server!.on('error', reject);
    });
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.emit('stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Parse body
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const request: MCPContextRequest = JSON.parse(body);
        const response = await this.processMethod(request);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' }
        }));
      }
    });
  }

  private async processMethod(request: MCPContextRequest): Promise<MCPContextResponse> {
    const { id, method, params } = request;

    // Health check
    if (method === 'health') {
      return {
        jsonrpc: '2.0',
        id,
        result: { status: 'ok', version: '0.1.0' }
      };
    }

    // Capabilities discovery
    if (method === 'capabilities/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          capabilities: Array.from(this.capabilities.values())
        }
      };
    }

    // Resources
    if (method === 'resources/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resources: Array.from(this.resources.values())
        }
      };
    }

    if (method === 'resources/read') {
      const uri = (params as any)?.uri;
      const resource = this.resources.get(uri);
      
      if (!resource) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Resource not found: ${uri}` }
        };
      }

      this.emit('resource:read', { uri });
      return {
        jsonrpc: '2.0',
        id,
        result: { uri, content: `[Resource: ${resource.name}]` }
      };
    }

    // Tools
    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
          }))
        }
      };
    }

    if (method === 'tools/call') {
      const { name, arguments: args } = params as any;
      const tool = this.tools.get(name);
      
      if (!tool) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Tool not found: ${name}` }
        };
      }

      try {
        const result = await tool.handler(args);
        return {
          jsonrpc: '2.0',
          id,
          result
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: err.message || 'Tool execution failed' }
        };
      }
    }

    // Context management
    if (method === 'context/get') {
      const key = (params as any)?.key;
      // Would integrate with session context
      return {
        jsonrpc: '2.0',
        id,
        result: { key, value: null }
      };
    }

    // Method not found
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    };
  }

  getStats() {
    return {
      port: this.port,
      capabilities: this.capabilities.size,
      resources: this.resources.size,
      tools: this.tools.size,
      running: !!this.server
    };
  }
}

/**
 * Create a default MCP server with all Dirgha tools registered.
 * Tools are wired through the existing executeTool dispatcher.
 */
export async function createDefaultMCPServer(port: number = 8080): Promise<MCPServer> {
  const server = new MCPServer(port);
  const { TOOL_DEFINITIONS } = await import('../tools/defs.js');
  const { executeToolAsync } = await import('../tools/index.js');

  for (const def of TOOL_DEFINITIONS) {
    server.registerTool({
      name: def.name,
      description: def.description,
      inputSchema: (def as any).input_schema ?? { type: 'object', properties: {} },
      handler: async (args: unknown) => {
        const result = await executeToolAsync(def.name, (args as Record<string, any>) ?? {});
        return result.error ? { error: result.error } : { result: result.result };
      },
    });
  }

  return server;
}

/**
 * Start an MCP stdio transport for use with Claude Desktop / MCP clients.
 * Reads JSON-RPC requests from stdin, writes responses to stdout.
 * Errors go to stderr so they don't corrupt the JSON stream.
 */
export function startStdioTransport(server: MCPServer): void {
  const rl = require('node:readline').createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const send = (obj: MCPContextResponse) => process.stdout.write(JSON.stringify(obj) + '\n');

  rl.on('line', async (line: string) => {
    let req: MCPContextRequest;
    try { req = JSON.parse(line); }
    catch { send({ jsonrpc: '2.0', id: 0, error: { code: -32700, message: 'Parse error' } }); return; }
    const res = await (server as any).processMethod(req);
    send(res);
  });

  rl.on('close', () => process.exit(0));
  process.stderr.write('[dirgha-mcp] stdio transport ready\n');
}

// Export for CLI integration
export { MCPServer as default };
