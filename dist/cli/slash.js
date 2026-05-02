/**
 * Slash command registry used by the interactive REPL. Handlers receive
 * a parsed command plus an ambient session context; they return a
 * string that the REPL prints, or nothing when the handler produced
 * output directly.
 */
import { PRICES } from "../intelligence/prices.js";
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
        if (!line.startsWith("/"))
            return { handled: false };
        // Strip leading slash + ALL control chars (\x00-\x1F + DEL \x7F).
        // Windows terminals on some setups inject stray bytes into ink's
        // input stream — without sanitising, /mode comes through as
        // /mode and fails the registry lookup. We trim whitespace
        // afterwards so a buffer of just the slash + ws still no-ops.
        const stripped = line
            .slice(1)
            // eslint-disable-next-line no-control-regex
            .replace(/[\x00-\x1F\x7F]+/g, "")
            .trim();
        if (stripped.length === 0)
            return { handled: false };
        const [rawName, ...args] = stripped.split(/\s+/);
        const name = rawName.toLowerCase();
        let handler = this.handlers.get(name);
        if (!handler) {
            const allNames = [...this.handlers.keys()];
            const prefixMatches = allNames.filter((n) => n.startsWith(name));
            if (prefixMatches.length === 1) {
                handler = this.handlers.get(prefixMatches[0]);
            }
            else if (prefixMatches.length > 1) {
                return {
                    handled: true,
                    output: `Ambiguous command "/${name}" — matches: ${prefixMatches
                        .sort()
                        .map((n) => `/${n}`)
                        .join(", ")}. Type more characters.`,
                };
            }
            else {
                console.error(`[slash dispatch] no handler for "${name}" (raw="${rawName}", stripped="${stripped}"). Registered:`, [...this.handlers.keys()].sort().join(", "));
                return {
                    handled: true,
                    output: `Unknown slash command: /${name}. Try /help.`,
                };
            }
        }
        try {
            const output = await handler(args, ctx);
            return { handled: true, output };
        }
        catch (err) {
            console.error(`[slash dispatch] /${name} handler threw:`, err instanceof Error ? (err.stack ?? err.message) : String(err));
            return {
                handled: true,
                output: `[slash error] ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    }
}
export function createDefaultSlashRegistry() {
    const registry = new SlashRegistry();
    // Core readline-REPL primitives
    registry.register("help", (_, ctx) => ctx.showHelp());
    registry.register("exit", (_, ctx) => {
        ctx.exit(0);
        return undefined;
    });
    registry.register("quit", (_, ctx) => {
        ctx.exit(0);
        return undefined;
    });
    registry.register("clear", (_, ctx) => {
        ctx.clear();
        return undefined;
    });
    registry.register("model", (args, ctx) => {
        if (args.length === 0)
            return `Current model: ${ctx.model}`;
        const id = args[0];
        const valid = PRICES.some((p) => p.model === id);
        if (!valid)
            return `Invalid model: ${id}. Use /models to see the catalogue.`;
        ctx.setModel(id);
        return `Model set to ${id}`;
    });
    registry.register("compact", (_, ctx) => ctx.compact());
    registry.register("session", async (args, ctx) => {
        if (args[0] === "list")
            return ctx.listSessions();
        if (args[0] === "load" && args[1])
            return ctx.loadSession(args[1]);
        return "Usage: /session list | /session load <id>";
    });
    registry.register("skills", (_, ctx) => ctx.listSkills());
    registry.register("cost", (_, ctx) => ctx.showCost());
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
    const { builtinSlashCommands } = await import("./slash/index.js");
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