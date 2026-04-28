/**
 * Slash command registry used by the interactive REPL. Handlers receive
 * a parsed command plus an ambient session context; they return a
 * string that the REPL prints, or nothing when the handler produced
 * output directly.
 */
export class SlashRegistry {
    handlers = new Map();
    register(name, handler) {
        this.handlers.set(name, handler);
    }
    has(name) {
        return this.handlers.has(name);
    }
    names() {
        return [...this.handlers.keys()].sort();
    }
    async dispatch(line, ctx) {
        if (!line.startsWith('/'))
            return { handled: false };
        // Strip leading slash + ALL control chars (\x00-\x1F + DEL \x7F).
        // Windows terminals on some setups inject stray bytes into ink's
        // input stream — without sanitising, /mode comes through as
        // /mode and fails the registry lookup. We trim whitespace
        // afterwards so a buffer of just the slash + ws still no-ops.
        // eslint-disable-next-line no-control-regex
        const stripped = line.slice(1).replace(/[\x00-\x1F\x7F]+/g, '').trim();
        if (stripped.length === 0)
            return { handled: false };
        const [rawName, ...args] = stripped.split(/\s+/);
        const name = rawName.toLowerCase();
        const handler = this.handlers.get(name);
        if (!handler)
            return { handled: true, output: `Unknown slash command: /${name}. Try /help.` };
        const output = await handler(args, ctx);
        return { handled: true, output };
    }
}
export function createDefaultSlashRegistry() {
    const registry = new SlashRegistry();
    // Core readline-REPL primitives
    registry.register('help', (_, ctx) => ctx.showHelp());
    registry.register('exit', (_, ctx) => { ctx.exit(0); return undefined; });
    registry.register('quit', (_, ctx) => { ctx.exit(0); return undefined; });
    registry.register('clear', (_, ctx) => { ctx.clear(); return undefined; });
    registry.register('model', (args, ctx) => {
        if (args.length === 0)
            return `Current model: ${ctx.model}`;
        ctx.setModel(args[0]);
        return `Model set to ${args[0]}`;
    });
    registry.register('compact', (_, ctx) => ctx.compact());
    registry.register('session', async (args, ctx) => {
        if (args[0] === 'list')
            return ctx.listSessions();
        if (args[0] === 'load' && args[1])
            return ctx.loadSession(args[1]);
        return 'Usage: /session list | /session load <id>';
    });
    registry.register('skills', (_, ctx) => ctx.listSkills());
    registry.register('cost', (_, ctx) => ctx.showCost());
    return registry;
}
/**
 * Register the 20 built-in slash commands onto an existing registry.
 * Skips names already claimed by core primitives so /help / /exit /
 * /clear etc keep their simple inline handlers.
 *
 * Call site: `interactive.ts` after `createDefaultSlashRegistry()`.
 * Kept separate from `createDefaultSlashRegistry` so the core primitives
 * stay importable without dragging in the full command set.
 */
export async function registerBuiltinSlashCommands(registry) {
    const { builtinSlashCommands } = await import('./slash/index.js');
    for (const cmd of builtinSlashCommands) {
        if (!registry.has(cmd.name))
            registry.register(cmd.name, cmd.execute);
        for (const alias of cmd.aliases ?? []) {
            if (!registry.has(alias))
                registry.register(alias, cmd.execute);
        }
    }
}
//# sourceMappingURL=slash.js.map