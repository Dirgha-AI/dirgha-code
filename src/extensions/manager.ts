/**
 * extensions/manager.ts — MCP extension manager factory + config loader
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ExtensionConfig, MCPTool, ExtensionManager } from './types.js';
import { discoverStdioTools, discoverHttpTools, callStdioTool, callHttpTool } from './rpc.js';

export const EXTENSIONS_FILE = path.join(os.homedir(), '.dirgha', 'extensions.json');

export function loadExtensionConfigs(): ExtensionConfig[] {
  try {
    const raw = fs.readFileSync(EXTENSIONS_FILE, 'utf8');
    return JSON.parse(raw) as ExtensionConfig[];
  } catch {
    return [];
  }
}

export function createExtensionManager(configs: ExtensionConfig[]): ExtensionManager {
  let tools: MCPTool[] = [];
  const cfgMap = new Map<string, ExtensionConfig>(configs.map(c => [c.name, c]));

  return {
    async loadExtensions() {
      for (const cfg of configs) {
        try {
          const discovered = cfg.type === 'http'
            ? await discoverHttpTools(cfg)
            : await discoverStdioTools(cfg);
          tools.push(...discovered);
        } catch (e) {
          console.error(`[extensions] Warning: failed to load "${cfg.name}": ${e instanceof Error ? e.message : e}`);
        }
      }
    },

    getTools() { return tools; },
    hasExtensions() { return tools.length > 0; },

    async callTool(namespacedName, input) {
      const tool = tools.find(t => t.namespacedName === namespacedName);
      if (!tool) throw new Error(`Unknown extension tool: ${namespacedName}`);
      const cfg = cfgMap.get(tool.extensionName)!;
      return cfg.type === 'http'
        ? callHttpTool(cfg, tool.name, input)
        : callStdioTool(cfg, tool.name, input);
    },
  };
}

// ─── Module-level singleton ────────────────────────────────────────────────

let _manager: ExtensionManager | null = null;
const _extraConfigs: ExtensionConfig[] = [];

export function addExtensionConfig(cfg: ExtensionConfig): void {
  _extraConfigs.push(cfg);
  _manager = null; // reset so next getExtensionManager() re-initialises
}

export function getExtensionManager(): ExtensionManager {
  if (!_manager) {
    const fileConfigs = loadExtensionConfigs();
    _manager = createExtensionManager([...fileConfigs, ..._extraConfigs]);
  }
  return _manager;
}
