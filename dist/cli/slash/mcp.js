import { StdioTransport, HttpTransport } from "../../mcp/transport.js";
import { DefaultMcpClient, } from "../../mcp/client.js";
import { addMcpServer, removeMcpServer, loadMcpConfig, } from "../../mcp/mcp-config.js";
const connections = new Map();
export const mcpCommand = {
    name: "mcp",
    description: "Manage MCP connections: /mcp connect | /mcp list | /mcp disconnect | /mcp saved",
    async execute(args, _ctx) {
        const sub = args[0];
        if (!sub) {
            return [
                "MCP Commands:",
                "  /mcp connect <http|stdio> <name> <url|command> [args...]",
                "  /mcp list                List connected servers and their tools",
                "  /mcp disconnect [name]   Disconnect (all if no name)",
                "  /mcp saved               List servers saved in ~/.dirgha/mcp.json",
                "",
                "  Examples:",
                "  /mcp connect http my-server https://mcp.example.com/v1",
                "  /mcp connect stdio my-fs npx -y @modelcontextprotocol/server-filesystem /tmp",
            ].join("\n");
        }
        if (sub === "connect") {
            const type = args[1];
            const name = args[2];
            const target = args[3];
            if (!type || !name || !target) {
                return "Usage: /mcp connect <http|stdio> <name> <url|command>";
            }
            if (connections.has(name)) {
                return `Server "${name}" is already connected. Use /mcp disconnect ${name} first.`;
            }
            try {
                let client;
                if (type === "http") {
                    const transport = new HttpTransport({ url: target });
                    client = new DefaultMcpClient(transport);
                }
                else if (type === "stdio") {
                    const transport = new StdioTransport({
                        command: target,
                        args: args.slice(4),
                    });
                    client = new DefaultMcpClient(transport);
                }
                else {
                    return `Unknown type "${type}". Valid types: http, stdio`;
                }
                await client.initialize();
                const tools = await client.listTools();
                connections.set(name, { name, client, tools });
                // Persist to ~/.dirgha/mcp.json so the server reconnects on next boot.
                if (type === "http") {
                    await addMcpServer(name, { type: "http", url: target });
                }
                else {
                    await addMcpServer(name, {
                        type: "stdio",
                        command: target,
                        args: args.slice(4).length > 0 ? args.slice(4) : undefined,
                    });
                }
                return [
                    `Connected to MCP server: ${name}`,
                    tools.length > 0
                        ? `Tools available: ${tools.map((t) => t.name).join(", ")}`
                        : "(no tools exposed)",
                ].join("\n");
            }
            catch (err) {
                return `Connection failed: ${err instanceof Error ? err.message : String(err)}`;
            }
        }
        if (sub === "list") {
            if (connections.size === 0)
                return "No MCP servers connected.";
            let out = "Connected MCP Servers:\n";
            for (const [name, conn] of connections) {
                out += `  ${name}  (${conn.tools.length} tools)\n`;
                for (const tool of conn.tools) {
                    out += `    ${tool.name}: ${tool.description ?? "(no description)"}\n`;
                }
            }
            return out;
        }
        if (sub === "disconnect") {
            const name = args[1];
            if (name) {
                const conn = connections.get(name);
                if (!conn)
                    return `No MCP server connected with name "${name}".`;
                await conn.client.close();
                connections.delete(name);
                // Remove from persistent config.
                await removeMcpServer(name);
                return `Disconnected MCP server: ${name}`;
            }
            const count = connections.size;
            const names = [...connections.keys()];
            for (const [, c] of connections) {
                await c.client.close();
            }
            connections.clear();
            // Remove all from persistent config.
            await Promise.all(names.map((n) => removeMcpServer(n)));
            return `Disconnected all MCP servers (${count}).`;
        }
        if (sub === "saved") {
            const saved = await loadMcpConfig();
            const entries = Object.entries(saved);
            if (entries.length === 0)
                return "No servers saved in ~/.dirgha/mcp.json.";
            let out = "Saved MCP Servers (~/.dirgha/mcp.json):\n";
            for (const [n, entry] of entries) {
                if (entry.type === "http") {
                    out += `  ${n}  [http]  url=${entry.url ?? "(missing)"}\n`;
                }
                else {
                    const cmdStr = [entry.command, ...(entry.args ?? [])].join(" ");
                    out += `  ${n}  [stdio]  ${cmdStr}\n`;
                }
            }
            return out;
        }
        return `Unknown subcommand "${sub}". Use /mcp for help.`;
    },
};
//# sourceMappingURL=mcp.js.map