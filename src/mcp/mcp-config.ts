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
import { join } from 'node:path';
import { homedir } from 'node:os';

const MCP_CONFIG_PATH = join(homedir(), '.dirgha', 'mcp.json');

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
  try {
    const raw = await readFile(MCP_CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as Record<string, McpServerEntry>;
  } catch {
    return {};
  }
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
