/**
 * Bridges MCP-exposed tools into the local Tool registry. Each MCP tool
 * becomes a Tool whose execute() proxies to client.callTool().
 */
export async function bridgeMcpTools(client, opts) {
    const tools = await client.listTools();
    const prefix = opts.prefix ?? `${opts.serverName}_`;
    return tools.map(t => toolFromMcp(client, t, prefix));
}
function toolFromMcp(client, mcp, prefix) {
    return {
        name: `${prefix}${mcp.name}`,
        description: mcp.description ?? `MCP tool: ${mcp.name}`,
        inputSchema: mcp.inputSchema,
        async execute(input, _ctx) {
            try {
                const response = await client.callTool(mcp.name, input);
                const text = response.content.map(p => p.text ?? '').join('\n').trim();
                return {
                    content: text.length > 0 ? text : '(empty response)',
                    isError: response.isError ?? false,
                };
            }
            catch (err) {
                return {
                    content: `MCP tool call failed: ${err instanceof Error ? err.message : String(err)}`,
                    isError: true,
                };
            }
        },
    };
}
//# sourceMappingURL=tool-bridge.js.map