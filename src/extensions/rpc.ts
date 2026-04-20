/**
 * extensions/rpc.ts — stdio JSON-RPC helpers and tool call implementations
 */
import { spawn } from 'node:child_process';
import type { ExtensionConfig, MCPTool } from './types.js';

let _rpcId = 1;

export function sendRpc(
  proc: ReturnType<typeof spawn>,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = _rpcId++;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    let buf = '';
    const timeout = setTimeout(() => {
      proc.stdout?.off('data', onData);
      reject(new Error(`RPC timeout: ${method}`));
    }, 5000);

    function onData(chunk: Buffer) {
      buf += chunk.toString();
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      clearTimeout(timeout);
      proc.stdout?.off('data', onData);
      try { resolve(JSON.parse(buf.slice(0, nl).trim())); }
      catch (e) { reject(e); }
    }

    proc.stdout?.on('data', onData);
    proc.stdin?.write(msg);
  });
}

function spawnProc(cfg: ExtensionConfig) {
  const [cmd, ...args] = cfg.command!;
  return spawn(cmd!, args, { env: { ...process.env, ...cfg.env }, stdio: ['pipe', 'pipe', 'pipe'] });
}

const INIT_PARAMS = { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'dirgha-code', version: '1.0' } };

export async function discoverStdioTools(cfg: ExtensionConfig): Promise<MCPTool[]> {
  const proc = spawnProc(cfg);
  try {
    await sendRpc(proc, 'initialize', INIT_PARAMS);
    const resp = await sendRpc(proc, 'tools/list', {}) as any;
    return (resp?.result?.tools ?? []).map((t: any) => ({
      name: t.name,
      namespacedName: `${cfg.name}__${t.name}`,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? {},
      extensionName: cfg.name,
    }));
  } finally { proc.kill(); }
}

export async function callStdioTool(cfg: ExtensionConfig, name: string, input: Record<string, unknown>): Promise<string> {
  const proc = spawnProc(cfg);
  try {
    await sendRpc(proc, 'initialize', INIT_PARAMS);
    const resp = await sendRpc(proc, 'tools/call', { name, arguments: input }) as any;
    const content = resp?.result?.content ?? resp?.result ?? resp;
    return typeof content === 'string' ? content : JSON.stringify(content);
  } finally { proc.kill(); }
}

export async function discoverHttpTools(cfg: ExtensionConfig): Promise<MCPTool[]> {
  const resp = await fetch(`${cfg.url}/tools/list`, {
    method: 'POST', body: '{}', headers: { 'content-type': 'application/json' },
  });
  const data = await resp.json() as any;
  return (data?.tools ?? []).map((t: any) => ({
    name: t.name,
    namespacedName: `${cfg.name}__${t.name}`,
    description: t.description ?? '',
    inputSchema: t.inputSchema ?? {},
    extensionName: cfg.name,
  }));
}

export async function callHttpTool(cfg: ExtensionConfig, name: string, input: Record<string, unknown>): Promise<string> {
  const resp = await fetch(`${cfg.url}/tools/call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: input }),
  });
  const data = await resp.json() as any;
  const content = data?.content ?? data;
  return typeof content === 'string' ? content : JSON.stringify(content);
}
