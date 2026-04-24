/**
 * Tool registry.
 *
 * Two concerns:
 *   (a) Hold the set of registered Tools and expose them to the agent
 *       loop as bare ToolDefinitions (the provider-visible subset).
 *   (b) Sanitise the outbound tool set per model — some hosted models
 *       reject very long descriptions or lack tool-use capability
 *       entirely.
 */
export class ToolRegistry {
    tools = new Map();
    register(tool) {
        if (!tool.name || !/^[a-zA-Z][a-zA-Z0-9_\-]*$/.test(tool.name)) {
            throw new Error(`Invalid tool name: ${tool.name}`);
        }
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool "${tool.name}" is already registered`);
        }
        this.tools.set(tool.name, tool);
    }
    unregister(name) {
        return this.tools.delete(name);
    }
    has(name) {
        return this.tools.has(name);
    }
    get(name) {
        return this.tools.get(name);
    }
    list() {
        return [...this.tools.values()];
    }
    sanitize(opts = {}) {
        const limit = opts.descriptionLimit ?? Number.POSITIVE_INFINITY;
        const definitions = [];
        const nameSet = new Set();
        for (const tool of this.tools.values()) {
            if (opts.allowlist && !opts.allowlist.has(tool.name))
                continue;
            if (opts.denylist && opts.denylist.has(tool.name))
                continue;
            const description = tool.description.length > limit
                ? `${tool.description.slice(0, limit - 3)}...`
                : tool.description;
            definitions.push({
                name: tool.name,
                description,
                inputSchema: tool.inputSchema,
            });
            nameSet.add(tool.name);
        }
        return { definitions, nameSet };
    }
}
export function createToolRegistry(tools = []) {
    const registry = new ToolRegistry();
    for (const t of tools)
        registry.register(t);
    return registry;
}
//# sourceMappingURL=registry.js.map