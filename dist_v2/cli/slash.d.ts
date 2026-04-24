/**
 * Slash command registry used by the interactive REPL. Handlers receive
 * a parsed command plus an ambient session context; they return a
 * string that the REPL prints, or nothing when the handler produced
 * output directly.
 */
import type { Token } from '../integrations/device-auth.js';
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
    /** Currently cached auth token (null when signed out). */
    getToken(): Token | null;
    /** Swap the cached token — slash commands call this after login/logout. */
    setToken(token: Token | null): void;
    /** API base URL (gateway) used by billing + entitlements. */
    apiBase(): string;
    /** URL the `/upgrade` command should send users to. */
    upgradeUrl(): string;
    /** Emit a transient status line above the next prompt. */
    status(message: string): void;
}
export type SlashHandler = (args: string[], ctx: SlashContext) => Promise<string | undefined> | string | undefined;
export declare class SlashRegistry {
    private readonly handlers;
    register(name: string, handler: SlashHandler): void;
    has(name: string): boolean;
    names(): string[];
    dispatch(line: string, ctx: SlashContext): Promise<{
        handled: boolean;
        output?: string;
    }>;
}
export declare function createDefaultSlashRegistry(): SlashRegistry;
/**
 * Register the 20 built-in slash commands onto an existing registry.
 * Skips names already claimed by core primitives so /help / /exit /
 * /clear etc keep their simple inline handlers.
 *
 * Call site: `interactive.ts` after `createDefaultSlashRegistry()`.
 * Kept separate from `createDefaultSlashRegistry` so the core primitives
 * stay importable without dragging in the full command set.
 */
export declare function registerBuiltinSlashCommands(registry: SlashRegistry): Promise<void>;
