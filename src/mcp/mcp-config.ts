/**
 * Persistent MCP server registry at ~/.dirgha/mcp.json.
 *
 * Servers added via `/mcp connect` are written here and auto-reconnected
 * on next session start. The file is a plain JSON object:
 *
 *   {
 *     "fs":     { "type": "stdio", "command": "npx", "args": ["-y", "@mcp/server-filesystem", "/"] },
 *     "remote": { "type": "http",  "url": "https://mcp.example.com/v1" }
 *   }
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const MCP_CONFIG_PATH = join(homedir(), '.dirgha', 'mcp.json');

function resolveLocalNativeHostBin(): string | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const rootDir = resolve(here, '..', '..');
    const exe = process.platform === 'win32' ? 'dirgha-native-host.exe' : 'dirgha-native-host';
    const candidate = join(rootDir, 'target', 'release', exe);
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export interface McpServerEntry {
  type: 'stdio' | 'http';
  /** stdio only: the executable to run */
  command?: string;
  /** stdio only: arguments after the command */
  args?: string[];
  /** stdio only: extra environment variables */
  env?: Record<string, string>;
  /** http only: the endpoint URL */
  url?: string;
  /** http only: static bearer token */
  bearerToken?: string;
}

export async function loadMcpConfig(): Promise<Record<string, McpServerEntry>> {
  let entries: Record<string, McpServerEntry> = {};
  try {
    const raw = await readFile(MCP_CONFIG_PATH, 'utf8');
    entries = JSON.parse(raw) as Record<string, McpServerEntry>;
  } catch {
    entries = {};
  }
  const nativeBin = resolveLocalNativeHostBin();
  if (nativeBin && !entries['dirgha-sovereign-kernel']) {
    entries['dirgha-sovereign-kernel'] = {
      type: 'stdio',
      command: nativeBin,
      args: ['--mcp'],
    };
  }
  return entries;
}

export async function saveMcpConfig(
  servers: Record<string, McpServerEntry>,
): Promise<void> {
  await mkdir(join(homedir(), '.dirgha'), { recursive: true });
  await writeFile(MCP_CONFIG_PATH, JSON.stringify(servers, null, 2), 'utf8');
}

export async function addMcpServer(
  name: string,
  entry: McpServerEntry,
): Promise<void> {
  const current = await loadMcpConfig();
  current[name] = entry;
  await saveMcpConfig(current);
}

export async function removeMcpServer(name: string): Promise<void> {
  const current = await loadMcpConfig();
  delete current[name];
  await saveMcpConfig(current);
}
