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
export async function loadMcpConfig() {
    try {
        const raw = await readFile(MCP_CONFIG_PATH, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
export async function saveMcpConfig(servers) {
    await mkdir(join(homedir(), '.dirgha'), { recursive: true });
    await writeFile(MCP_CONFIG_PATH, JSON.stringify(servers, null, 2), 'utf8');
}
export async function addMcpServer(name, entry) {
    const current = await loadMcpConfig();
    current[name] = entry;
    await saveMcpConfig(current);
}
export async function removeMcpServer(name) {
    const current = await loadMcpConfig();
    delete current[name];
    await saveMcpConfig(current);
}
//# sourceMappingURL=mcp-config.js.map