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

import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Tool } from '../tools/registry.js';

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

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
  failed: Array<{ name: string; error: Error }>;
}

export function createExtensionAPI(): { api: ExtensionAPI; registry: ExtensionRegistry } {
  const registry: ExtensionRegistry = {
    tools: new Map(),
    slashes: new Map(),
    subcommands: new Map(),
    listeners: new Map(),
  };

  function validateName(name: string, type: string): void {
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      throw new Error(`invalid ${type} name: ${name}`);
    }
  }

  const api: ExtensionAPI = {
    registerTool(tool) {
      validateName(tool.name, 'tool');
      if (registry.tools.has(tool.name)) throw new Error(`duplicate tool name: ${tool.name}`);
      registry.tools.set(tool.name, tool);
    },
    registerSlash(spec) {
      validateName(spec.name, 'slash');
      if (registry.slashes.has(spec.name)) throw new Error(`duplicate slash name: ${spec.name}`);
      registry.slashes.set(spec.name, spec);
    },
    registerSubcommand(spec) {
      validateName(spec.name, 'subcommand');
      if (registry.subcommands.has(spec.name)) throw new Error(`duplicate subcommand name: ${spec.name}`);
      registry.subcommands.set(spec.name, spec);
    },
    on(event, handler) {
      if (typeof event !== 'string' || event.length === 0) throw new Error(`invalid event name: ${event}`);
      if (typeof handler !== 'function') throw new Error('handler must be a function');
      let bag = registry.listeners.get(event);
      if (!bag) { bag = new Set(); registry.listeners.set(event, bag); }
      bag.add(handler);
    },
  };

  return { api, registry };
}

export async function loadExtensions(opts: { rootDir?: string; api: ExtensionAPI }): Promise<ExtensionLoadResult> {
  const { rootDir, api } = opts;
  const loaded: string[] = [];
  const failed: ExtensionLoadResult['failed'] = [];
  if (!rootDir) return { loaded, failed };
  const fullPath = resolve(rootDir);

  let entries: string[] = [];
  try { entries = await readdir(fullPath); } catch { return { loaded, failed }; }

  for (const name of entries) {
    const extDir = join(fullPath, name);
    try {
      const st = await stat(extDir);
      if (!st.isDirectory()) continue;
    } catch { continue; }

    const indexPath = join(extDir, 'index.mjs');
    try {
      // ESM dynamic import requires a `file://` URL on Windows; bare
      // absolute paths throw ERR_UNSUPPORTED_ESM_URL_SCHEME there.
      // pathToFileURL handles both POSIX and Windows correctly.
      const mod = await import(pathToFileURL(indexPath).href) as { default?: (api: ExtensionAPI) => unknown };
      const fn = typeof mod.default === 'function' ? mod.default : (mod as unknown as (api: ExtensionAPI) => unknown);
      if (typeof fn !== 'function') throw new Error(`no default export in ${indexPath}`);
      await fn(api);
      loaded.push(name);
    } catch (err) {
      failed.push({ name, error: err instanceof Error ? err : new Error(String(err)) });
    }
  }
  return { loaded, failed };
}

/**
 * Synchronously fan a payload to every listener for `event`. A throwing
 * listener does NOT prevent siblings from firing — the failure is
 * swallowed locally so one bad extension can't break the agent loop.
 */
export function emitEvent(registry: ExtensionRegistry, event: string, payload: unknown): void {
  const handlers = registry.listeners.get(event);
  if (!handlers) return;
  for (const h of handlers) {
    try { h(payload); } catch { /* swallow */ }
  }
}
