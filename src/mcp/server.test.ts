/**
 * mcp/server.test.ts — MCP server tests
 */
import { describe, it, expect } from 'vitest';
import { MCPServer } from './server.js';

describe('MCPServer basics', () => {
  it('creates server instance with correct port', () => {
    const server = new MCPServer(19080);
    const stats = server.getStats();
    expect(stats.port).toBe(19080);
    expect(stats.running).toBe(false);
  });

  it('registers core capabilities', () => {
    const server = new MCPServer(19081);
    const stats = server.getStats();
    expect(stats.capabilities).toBeGreaterThanOrEqual(4); // resources, tools, prompts, context
  });

  it('registers a custom tool', () => {
    const server = new MCPServer(19082);
    const before = server.getStats().tools;
    server.registerTool({
      name: 'custom_tool',
      description: 'Test',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => ({ ok: true }),
    });
    expect(server.getStats().tools).toBe(before + 1);
  });

  it('registers a custom resource', () => {
    const server = new MCPServer(19083);
    server.registerResource({ uri: 'dirgha://test', name: 'Test Resource' });
    expect(server.getStats().resources).toBe(1);
  });
});

describe('MCP Protocol processing', () => {
  it('responds to health check', async () => {
    const server = new MCPServer(19084);
    const res = await (server as any).processMethod({ jsonrpc: '2.0', id: 1, method: 'health' });
    expect(res.result.status).toBe('ok');
    expect(res.id).toBe(1);
  });

  it('responds to capabilities/list', async () => {
    const server = new MCPServer(19085);
    const res = await (server as any).processMethod({ jsonrpc: '2.0', id: 2, method: 'capabilities/list' });
    expect(Array.isArray(res.result.capabilities)).toBe(true);
    expect(res.result.capabilities.length).toBeGreaterThan(0);
  });

  it('responds to tools/list', async () => {
    const server = new MCPServer(19086);
    server.registerTool({ name: 'echo', description: 'Echo', inputSchema: {}, handler: async (a: any) => a });
    const res = await (server as any).processMethod({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    expect(res.result.tools).toHaveLength(1);
    expect(res.result.tools[0].name).toBe('echo');
  });

  it('calls a registered tool', async () => {
    const server = new MCPServer(19087);
    server.registerTool({ name: 'add', description: 'Add', inputSchema: {}, handler: async (args: any) => ({ sum: args.a + args.b }) });
    const res = await (server as any).processMethod({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'add', arguments: { a: 3, b: 4 } },
    });
    expect(res.result.sum).toBe(7);
  });

  it('returns error for unknown tool', async () => {
    const server = new MCPServer(19088);
    const res = await (server as any).processMethod({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'nonexistent', arguments: {} },
    });
    expect(res.error).toBeDefined();
    expect(res.error.code).toBe(-32602);
  });

  it('returns error for unknown method', async () => {
    const server = new MCPServer(19089);
    const res = await (server as any).processMethod({ jsonrpc: '2.0', id: 6, method: 'unknown/method' });
    expect(res.error.code).toBe(-32601);
  });

  it('responds to resources/list', async () => {
    const server = new MCPServer(19090);
    server.registerResource({ uri: 'dirgha://readme', name: 'README' });
    const res = await (server as any).processMethod({ jsonrpc: '2.0', id: 7, method: 'resources/list' });
    expect(res.result.resources).toHaveLength(1);
    expect(res.result.resources[0].uri).toBe('dirgha://readme');
  });

  it('reads a registered resource', async () => {
    const server = new MCPServer(19091);
    server.registerResource({ uri: 'dirgha://doc', name: 'Doc' });
    const res = await (server as any).processMethod({
      jsonrpc: '2.0', id: 8, method: 'resources/read',
      params: { uri: 'dirgha://doc' },
    });
    expect(res.result.uri).toBe('dirgha://doc');
  });

  it('returns error for unknown resource', async () => {
    const server = new MCPServer(19092);
    const res = await (server as any).processMethod({
      jsonrpc: '2.0', id: 9, method: 'resources/read',
      params: { uri: 'dirgha://notfound' },
    });
    expect(res.error).toBeDefined();
  });
});

describe('createDefaultMCPServer', () => {
  it('creates server with all tool definitions registered', async () => {
    const { createDefaultMCPServer } = await import('./server.js');
    const server = await createDefaultMCPServer(19093);
    const stats = server.getStats();
    expect(stats.tools).toBeGreaterThan(20); // all ~30 tools
  }, 30000);
});
