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
export declare function loadMcpConfig(): Promise<Record<string, McpServerEntry>>;
export declare function saveMcpConfig(servers: Record<string, McpServerEntry>): Promise<void>;
export declare function addMcpServer(name: string, entry: McpServerEntry): Promise<void>;
export declare function removeMcpServer(name: string): Promise<void>;
