/**
 * Slash command registry used by the interactive REPL. Handlers receive
 * a parsed command plus an ambient session context; they return a
 * string that the REPL prints, or nothing when the handler produced
 * output directly.
 */

export interface SlashContext {
  model: string;
  sessionId: string;
  setModel(model: string): void;
  showHelp(): string;
  compact(): Promise<string>;
  clear(): void;
  listSessions(): Promise<string>;
  loadSession(id: string): Promise<string>;
  listSkills(): Promise<string>;
  showCost(): string;
  exit(code?: number): void;
}

export type SlashHandler = (args: string[], ctx: SlashContext) => Promise<string | undefined> | string | undefined;

export class SlashRegistry {
  private readonly handlers = new Map<string, SlashHandler>();

  register(name: string, handler: SlashHandler): void {
    this.handlers.set(name, handler);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  names(): string[] {
    return [...this.handlers.keys()].sort();
  }

  async dispatch(line: string, ctx: SlashContext): Promise<{ handled: boolean; output?: string }> {
    if (!line.startsWith('/')) return { handled: false };
    const stripped = line.slice(1).trim();
    if (stripped.length === 0) return { handled: false };
    const [name, ...args] = stripped.split(/\s+/);
    const handler = this.handlers.get(name);
    if (!handler) return { handled: true, output: `Unknown slash command: /${name}. Try /help.` };
    const output = await handler(args, ctx);
    return { handled: true, output };
  }
}

export function createDefaultSlashRegistry(): SlashRegistry {
  const registry = new SlashRegistry();
  // Core readline-REPL primitives
  registry.register('help', (_, ctx) => ctx.showHelp());
  registry.register('exit', (_, ctx) => { ctx.exit(0); return undefined; });
  registry.register('quit', (_, ctx) => { ctx.exit(0); return undefined; });
  registry.register('clear', (_, ctx) => { ctx.clear(); return undefined; });
  registry.register('model', (args, ctx) => {
    if (args.length === 0) return `Current model: ${ctx.model}`;
    ctx.setModel(args[0]);
    return `Model set to ${args[0]}`;
  });
  registry.register('compact', (_, ctx) => ctx.compact());
  registry.register('session', async (args, ctx) => {
    if (args[0] === 'list') return ctx.listSessions();
    if (args[0] === 'load' && args[1]) return ctx.loadSession(args[1]);
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
export async function registerBuiltinSlashCommands(registry: SlashRegistry): Promise<void> {
  const { builtinSlashCommands } = await import('./slash/index.js');
  for (const cmd of builtinSlashCommands) {
    if (!registry.has(cmd.name)) registry.register(cmd.name, cmd.execute);
    for (const alias of cmd.aliases ?? []) {
      if (!registry.has(alias)) registry.register(alias, cmd.execute);
    }
  }
}
