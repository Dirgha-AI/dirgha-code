/**
 * Spawn every MCP server defined in `config.mcpServers`, bridge their
 * tools into a tool registry, and return cleanup callbacks.
 *
 * Shape mirrors the standard `mcpServers` config so existing setups
 * port over verbatim. Failures spawning one server don't break others
 * — we surface a warning per failed server and continue.
 */
import { StdioTransport, HttpTransport } from './transport.js';
import { DefaultMcpClient } from './client.js';
import { bridgeMcpTools } from './tool-bridge.js';
export async function loadMcpServers(servers, opts = {}) {
    const allTools = [];
    const closers = [];
    for (const [name, spec] of Object.entries(servers)) {
        try {
            let transport;
            if ('url' in spec) {
                transport = new HttpTransport({
                    url: spec.url,
                    ...(spec.bearerToken !== undefined ? { bearerToken: spec.bearerToken } : {}),
                    ...(spec.bearerProvider !== undefined ? { bearerProvider: spec.bearerProvider } : {}),
                    ...(spec.headers !== undefined ? { headers: spec.headers } : {}),
                    ...(spec.timeoutMs !== undefined ? { timeoutMs: spec.timeoutMs } : {}),
                });
            }
            else {
                transport = new StdioTransport({
                    command: spec.command,
                    ...(spec.args !== undefined ? { args: spec.args } : {}),
                    ...(spec.env !== undefined ? { env: spec.env } : {}),
                    ...(spec.cwd !== undefined ? { cwd: spec.cwd } : {}),
                });
            }
            const client = new DefaultMcpClient(transport);
            await client.initialize();
            const bridged = await bridgeMcpTools(client, { serverName: name });
            allTools.push(...bridged);
            closers.push(() => client.close());
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            opts.onWarn?.(`mcp[${name}] failed to start: ${msg}`);
        }
    }
    return {
        tools: allTools,
        shutdown: async () => { await Promise.allSettled(closers.map(c => c())); },
    };
}
//# sourceMappingURL=loader.js.map