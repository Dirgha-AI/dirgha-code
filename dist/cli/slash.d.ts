/**
 * Slash command registry used by the interactive REPL. Handlers receive
 * a parsed command plus an ambient session context; they return a
 * string that the REPL prints, or nothing when the handler produced
 * output directly.
 */
import type { Token } from "../integrations/device-auth.js";
import type { Mode } from "../context/mode.js";
import type { ThemeName } from "../tui/theme.js";
import type { Session, SessionStore } from "../context/session.js";
import type { Provider } from "../kernel/types.js";
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
    /** Trigger the key-entry popup overlay so the user can paste a key
     *  without restarting the REPL. Only works in the Ink TUI path. */
    requestKey(keyName: string): void;
    /** Active execution mode (plan / act / verify). */
    getMode(): Mode;
    /** Swap the mode live — the next turn's system prompt picks it up. */
    setMode(mode: Mode): void;
    /** Current theme name. */
    getTheme(): ThemeName;
    /** Swap the theme — readline REPL applies live; Ink requires restart. */
    setTheme(name: ThemeName): void;
    /** Active session (null in headless contexts). */
    getSession(): Session | null;
    /** Session store for creating branches / loading siblings. */
    getSessionStore(): SessionStore | null;
    /** Provider bound to the current model — used by /session branch. */
    getProvider(): Provider | null;
    /** Model used for background summaries (e.g. branch summarisation). */
    getSummaryModel(): string;
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
