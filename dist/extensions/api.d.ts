/**
 * Extension API — programmatic plugin surface.
 *
 * An extension is an ESM module with a default-exported function:
 *
 *   export default function (api) {
 *     api.registerTool({ name, description, inputSchema, execute });
 *     api.registerSlash({ name, description, handler });
 *     api.registerSubcommand({ name, description, run });
 *     api.on('turn_start' | 'tool_call' | 'error' | ..., handler);
 *   }
 *
 * The default export may be `async`; the loader awaits it.
 *
 * Why JS / ESM, not TS source: extensions ship as plain `.mjs` so a
 * user can drop one into `~/.dirgha/extensions/<name>/index.mjs`
 * without a build step. TS authors can publish the compiled output in
 * a tarball / git repo just like a normal npm package.
 *
 * Initial implementation seeded by a hy3 dogfood run.
 */
import type { Tool } from '../tools/registry.js';
export interface SlashSpec {
    name: string;
    description: string;
    handler: (args: string[], ctx: unknown) => Promise<string | undefined> | string | undefined;
}
export interface SubcommandSpec {
    name: string;
    description: string;
    run: (argv: string[]) => Promise<number> | number;
}
export interface ExtensionAPI {
    registerTool(tool: Tool): void;
    registerSlash(spec: SlashSpec): void;
    registerSubcommand(spec: SubcommandSpec): void;
    on(event: string, handler: (payload: unknown) => void): void;
}
export interface ExtensionRegistry {
    tools: Map<string, Tool>;
    slashes: Map<string, SlashSpec>;
    subcommands: Map<string, SubcommandSpec>;
    listeners: Map<string, Set<(payload: unknown) => void>>;
}
export interface ExtensionLoadResult {
    loaded: string[];
    failed: Array<{
        name: string;
        error: Error;
    }>;
}
export declare function createExtensionAPI(): {
    api: ExtensionAPI;
    registry: ExtensionRegistry;
};
export declare function loadExtensions(opts: {
    rootDir?: string;
    api: ExtensionAPI;
}): Promise<ExtensionLoadResult>;
/**
 * Synchronously fan a payload to every listener for `event`. A throwing
 * listener does NOT prevent siblings from firing — the failure is
 * swallowed locally so one bad extension can't break the agent loop.
 */
export declare function emitEvent(registry: ExtensionRegistry, event: string, payload: unknown): void;
