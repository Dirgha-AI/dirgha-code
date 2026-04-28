/**
 * Spawn every MCP server defined in `config.mcpServers`, bridge their
 * tools into a tool registry, and return cleanup callbacks.
 *
 * Shape mirrors the standard `mcpServers` config so existing setups
 * port over verbatim. Failures spawning one server don't break others
 * — we surface a warning per failed server and continue.
 */
import type { Tool } from '../tools/registry.js';
/**
 * MCP server config — discriminated by the presence of `url` (HTTP)
 * or `command` (stdio). Mirrors the standard `mcpServers` block:
 *
 *   "fs":     { "command": "npx", "args": ["..."] }     // stdio
 *   "remote": { "url": "https://mcp.example.com/v1" }   // HTTP/SSE
 */
export type McpServerSpec = {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
} | {
    url: string;
    bearerToken?: string;
    /** Async OAuth-style refresh hook — called before every request. */
    bearerProvider?: () => Promise<string | undefined> | string | undefined;
    headers?: Record<string, string>;
    timeoutMs?: number;
};
export interface LoadedMcp {
    tools: Tool[];
    shutdown: () => Promise<void>;
}
export declare function loadMcpServers(servers: Record<string, McpServerSpec>, opts?: {
    onWarn?: (msg: string) => void;
}): Promise<LoadedMcp>;
