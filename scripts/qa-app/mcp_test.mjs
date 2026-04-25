/**
 * MCP transport smoke. Two paths:
 *
 *   1. **Stdio** — spawn a tiny mock MCP server (echo binary written
 *      inline) and run the full initialize / tools/list / tools/call
 *      cycle through DefaultMcpClient. Proves the StdioTransport
 *      round-trips JSON-RPC correctly.
 *
 *   2. **HTTP**  — start an in-process Node http server that returns
 *      JSON responses for POST requests, and prove HttpTransport
 *      sends + receives + parses correctly.
 *
 * No external network dependencies. Skips cleanly if anything in the
 * MCP module fails to import.
 */

import http from 'node:http';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fileURLToPath as _toPath } from 'node:url';
import { dirname as _dn, resolve as _rs } from 'node:path';
const ROOT = _rs(_dn(_toPath(import.meta.url)), '..', '..', 'dist_v2');
const { StdioTransport, HttpTransport } = await import(`${ROOT}/mcp/transport.js`);
const { DefaultMcpClient } = await import(`${ROOT}/mcp/client.js`);
const { bridgeMcpTools } = await import(`${ROOT}/mcp/tool-bridge.js`);
const { loadMcpServers } = await import(`${ROOT}/mcp/loader.js`);

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

// -------- Stdio: tiny mock server we spawn as a subprocess --------

const sandbox = mkdtempSync(join(tmpdir(), 'mcp-test-'));
const mockPath = join(sandbox, 'mock-mcp.mjs');
writeFileSync(mockPath, `#!/usr/bin/env node
// Tiny MCP mock: handles initialize / tools/list / tools/call.
import { createInterface } from 'node:readline';
const rl = createInterface({ input: process.stdin });
function send(o) { process.stdout.write(JSON.stringify(o) + '\\n'); }
rl.on('line', line => {
  let req; try { req = JSON.parse(line); } catch { return; }
  if (req.method === 'initialize') {
    send({ jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mock', version: '0.0.1' } } });
  } else if (req.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: req.id, result: { tools: [{ name: 'echo', description: 'echoes its input', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } }] } });
  } else if (req.method === 'tools/call') {
    send({ jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: 'echoed: ' + (req.params?.arguments?.text ?? '') }], isError: false } });
  } else {
    send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'method not found: ' + req.method } });
  }
});
`);
chmodSync(mockPath, 0o755);

console.log('\n=== MCP stdio transport ===');

const stdio = new StdioTransport({ command: 'node', args: [mockPath] });
const client = new DefaultMcpClient(stdio);
const init = await client.initialize();
check('initialize succeeded',           init?.serverInfo?.name === 'mock');
check('protocolVersion present',         typeof init?.protocolVersion === 'string');

const tools = await client.listTools();
check('listTools returned echo',         tools.some(t => t.name === 'echo'));

const result = await client.callTool('echo', { text: 'hi mcp' });
check('callTool returned content',       Array.isArray(result?.content) && result.content.length > 0);
const txt = result?.content?.[0]?.text ?? '';
check('callTool text contains echo',     /echoed: hi mcp/.test(txt));

const bridged = await bridgeMcpTools(client, { serverName: 'mock' });
check('tool bridged with mock_ prefix',  bridged.some(t => t.name === 'mock_echo'));

await client.close();

// -------- HTTP transport against an in-process server ---------

console.log('\n=== MCP HTTP transport ===');

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    let parsed; try { parsed = JSON.parse(body); } catch { res.statusCode = 400; res.end(); return; }
    let response;
    if (parsed.method === 'initialize') {
      response = { jsonrpc: '2.0', id: parsed.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'http-mock', version: '0.0.1' } } };
    } else if (parsed.method === 'tools/list') {
      response = { jsonrpc: '2.0', id: parsed.id, result: { tools: [{ name: 'pingremote', description: 'returns pong', inputSchema: { type: 'object' } }] } };
    } else {
      response = { jsonrpc: '2.0', id: parsed.id, error: { code: -32601, message: 'unknown' } };
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(response));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const addr = server.address();
const url = `http://127.0.0.1:${addr.port}/`;

const httpTransport = new HttpTransport({ url });
const httpClient = new DefaultMcpClient(httpTransport);
const httpInit = await httpClient.initialize();
check('http initialize ok',              httpInit?.serverInfo?.name === 'http-mock');
const httpTools = await httpClient.listTools();
check('http listTools returned remote',  httpTools.some(t => t.name === 'pingremote'));
await httpClient.close();
server.close();

// -------- loader bogus stdio gracefully warns --------

console.log('\n=== loader: bogus server warns gracefully ===');
const warns = [];
const loaded = await loadMcpServers({
  ok:    { command: 'node', args: [mockPath] },
  bogus: { command: '/bin/false' },
}, { onWarn: m => warns.push(m) });
check('loader brings in healthy server',  loaded.tools.some(t => t.name === 'ok_echo'));
check('loader warns about bad server',    warns.some(w => /bogus/.test(w)));
await loaded.shutdown();

console.log(`\nsummary: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
