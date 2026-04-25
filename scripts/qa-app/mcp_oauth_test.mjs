/**
 * MCP HTTP transport OAuth-style bearer rotation. Spawns an in-process
 * HTTP MCP mock that records the Authorization header it received, so
 * we can verify:
 *
 *   - bearerProvider is called for EACH request (not cached at construction)
 *   - returning a fresh token rotates the header without recreating the transport
 *   - bearerProvider beats bearerToken when both are passed
 *   - returning undefined drops the Authorization header entirely
 *   - sync return value is accepted, not just Promise
 *   - exceptions in bearerProvider surface to the caller (no swallow)
 */

import http from 'node:http';

import { fileURLToPath as _toPath } from 'node:url';
import { dirname as _dn, resolve as _rs } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { HttpTransport } = await import(`${ROOT}/mcp/transport.js`);
const { DefaultMcpClient } = await import(`${ROOT}/mcp/client.js`);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const seenHeaders = [];
const server = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    seenHeaders.push(req.headers.authorization);
    let parsed; try { parsed = JSON.parse(body); } catch { res.statusCode = 400; res.end(); return; }
    const result = parsed.method === 'initialize'
      ? { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'oauth-mock', version: '0' } }
      : parsed.method === 'tools/list'
        ? { tools: [] }
        : { error: { code: -32601, message: 'unknown' } };
    const wrap = parsed.method === 'tools/list' || parsed.method === 'initialize'
      ? { jsonrpc: '2.0', id: parsed.id, result }
      : { jsonrpc: '2.0', id: parsed.id, ...result };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(wrap));
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

console.log('\n=== oauth: bearerProvider called for every request ===');
{
  seenHeaders.length = 0;
  let calls = 0;
  const transport = new HttpTransport({ url, bearerProvider: async () => { calls++; return `tok-${calls}`; } });
  const client = new DefaultMcpClient(transport);
  await client.initialize();
  await client.listTools();
  await client.close();
  check('provider called per request',     calls === 2, `calls=${calls}`);
  check('first request used tok-1',         seenHeaders[0] === 'Bearer tok-1');
  check('second request used tok-2',         seenHeaders[1] === 'Bearer tok-2');
}

console.log('\n=== oauth: bearerProvider wins over bearerToken ===');
{
  seenHeaders.length = 0;
  const transport = new HttpTransport({ url, bearerToken: 'static', bearerProvider: () => 'rotated' });
  const client = new DefaultMcpClient(transport);
  await client.initialize();
  await client.close();
  check('header used the rotated value',    seenHeaders[0] === 'Bearer rotated');
}

console.log('\n=== oauth: bearerProvider returning undefined drops the header ===');
{
  seenHeaders.length = 0;
  const transport = new HttpTransport({ url, bearerProvider: () => undefined });
  const client = new DefaultMcpClient(transport);
  await client.initialize();
  await client.close();
  check('Authorization header absent',       seenHeaders[0] === undefined);
}

console.log('\n=== oauth: sync return value accepted ===');
{
  seenHeaders.length = 0;
  const transport = new HttpTransport({ url, bearerProvider: () => 'sync-tok' });
  const client = new DefaultMcpClient(transport);
  await client.initialize();
  await client.close();
  check('sync provider value used',          seenHeaders[0] === 'Bearer sync-tok');
}

console.log('\n=== oauth: provider exception surfaces ===');
{
  const transport = new HttpTransport({ url, bearerProvider: () => { throw new Error('refresh failed'); } });
  const client = new DefaultMcpClient(transport, { requestTimeoutMs: 1000 });
  let threw = null;
  try { await client.initialize(); } catch (err) { threw = err; }
  await client.close();
  check('exception propagates to caller',    threw instanceof Error && /refresh failed/.test(threw.message));
}

server.close();

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
