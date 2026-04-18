/**
 * mcp/transport.ts — Stdio/SSE transport layers
 */
import type { MCPContextRequest, MCPContextResponse } from './server.js';

export interface MCPTransport {
  send(response: MCPContextResponse): void;
  onRequest(handler: (request: MCPContextRequest) => Promise<MCPContextResponse>): void;
  close(): void;
}

export function createStdioTransport(): MCPTransport {
  const handlers: Array<(request: MCPContextRequest) => Promise<MCPContextResponse>> = [];
  
  const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });
  
  rl.on('line', async (line: string) => {
    try {
      const request = JSON.parse(line) as MCPContextRequest;
      for (const handler of handlers) {
        const response = await handler(request);
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' }
      }) + '\n');
    }
  });
  
  return {
    send: (response) => process.stdout.write(JSON.stringify(response) + '\n'),
    onRequest: (handler) => handlers.push(handler),
    close: () => rl.close()
  };
}
