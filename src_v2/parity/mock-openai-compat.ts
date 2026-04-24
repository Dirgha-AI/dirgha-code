/**
 * Single-port HTTP server that serves scripted SSE responses for the
 * OpenAI-compatible dialect. Used by the parity harness to drive the
 * real provider adapters against deterministic fixtures.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockResponse {
  chunks: string[];
  headers?: Record<string, string>;
  status?: number;
}

export interface MockServer {
  readonly url: string;
  close(): Promise<void>;
}

export async function startMockOpenAICompat(queue: MockResponse[]): Promise<MockServer> {
  const pending = [...queue];
  const server: Server = createServer((req, res) => {
    const response = pending.shift() ?? { chunks: [] };
    const status = response.status ?? 200;
    res.writeHead(status, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...response.headers,
    });
    // Consume request body fully before replying to match real server semantics.
    req.on('data', () => { /* drop */ });
    req.on('end', () => {
      for (const chunk of response.chunks) {
        res.write(`data: ${chunk}\n\n`);
      }
      res.end();
    });
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
