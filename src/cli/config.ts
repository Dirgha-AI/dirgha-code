/**
 * Configuration loader. Merges defaults, user config, project config,
 * environment, and CLI flags. Results are cached on first read.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { migrateDeprecatedModel } from "../intelligence/prices.js";

export interface DirghaConfig {
  model: string;
  cheapModel: string;
  summaryModel: string;
  maxTurns: number;
  temperature?: number;
  thinking?: "off" | "low" | "medium" | "high";
  showThinking: boolean;
  autoApproveTools: string[];
  skills: { enabled: boolean; explicit?: string[] };
  smartRoute: { enabled: boolean };
  compaction: { triggerTokens: number; preserveLastTurns: number };
  telemetry: { enabled: boolean };
  /**
   * When true, InputBox honours vim-style NORMAL / INSERT modes. Esc
   * enters NORMAL; `i` returns to INSERT. Defaults to false so the
   * stock experience is unchanged.
   */
  vimMode?: boolean;
  /**
   * TUI colour palette. Defaults to 'readable'. Users switch via /theme at
   * runtime; the preference is persisted to ~/.dirgha/config.json.
   * Accepts the full 20-theme catalogue from `src/tui/theme.ts` (15 native
   * + 5 ports from gemini-cli).
   */
  theme?:
    | "readable"
    | "dark"
    | "light"
    | "none"
    | "midnight"
    | "ocean"
    | "solarized"
    | "warm"
    | "violet-storm"
    | "cosmic"
    | "nord"
    | "ember"
    | "sakura"
    | "obsidian-gold"
    | "crimson"
    | "dracula"
    | "github-dark"
    | "tokyonight"
    | "atom-one-dark"
    | "ayu-dark";
  /**
   * Persisted execution mode. Defaults to 'act' (normal execution).
   * Changed live via /mode; also honoured by fresh sessions.
   */
  mode?: "plan" | "act" | "yolo" | "verify" | "ask";
  /**
   * Optional MCP servers to spawn on startup. Each entry runs as a
   * subprocess; its tools are bridged into the local tool registry
   * with a `${name}_` prefix. Standard `mcpServers` block shape so
   * existing configs port over directly.
   *
   *   "mcpServers": {
   *     "fs": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] }
   *   }
   */
  mcpServers?: Record<
    string,
    | {
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
      }
    | {
        url: string;
        bearerToken?: string;
        headers?: Record<string, string>;
        timeoutMs?: number;
      }
  >;
  /**
   * Lifecycle hooks fired by the agent loop. Each entry is a shell
   * command run when the named event occurs; non-zero exit on a
   * `before*` hook aborts/blocks the action. Stdout/stderr are
   * forwarded to dirgha's stderr. JSON payload is piped to stdin.
   *
   *   "hooks": {
   *     "before_tool_call": [{ "command": "./scripts/audit.sh" }],
   *     "after_turn":      [{ "command": "echo 'turn done' >> /tmp/turns.log" }]
   *   }
   *
   * Recognised events: before_turn · after_turn · before_tool_call ·
   * after_tool_call.
   */
  hooks?: {
    before_turn?: Array<{ command: string }>;
    after_turn?: Array<{ command: string }>;
    before_tool_call?: Array<{ command: string; matcher?: string }>;
    after_tool_call?: Array<{ command: string; matcher?: string }>;
  };
}

export const DEFAULT_CONFIG: DirghaConfig = {
  model: "moonshotai/kimi-k2.6",
  cheapModel: "meta/llama-3.1-8b-instruct",
  summaryModel: "moonshotai/kimi-k2.5",
  maxTurns: 16,
  showThinking: false,
  autoApproveTools: ["fs_read", "fs_ls", "search_grep", "search_glob", "git"],
  skills: { enabled: true },
  smartRoute: { enabled: false },
  compaction: { triggerTokens: 120_000, preserveLastTurns: 6 },
  telemetry: { enabled: false },
};

export async function loadConfig(
  cwd: string = process.cwd(),
): Promise<DirghaConfig> {
  const userPath = join(homedir(), ".dirgha", "config.json");
  const projectPath = join(cwd, ".dirgha", "config.json");

  const userPartial = await readJson(userPath);
  const projectPartial = await readJson(projectPath);
  const envPartial = readEnvOverrides();

  const merged = merge(DEFAULT_CONFIG, userPartial, projectPartial, envPartial);
  // Migrate any model IDs the upstream provider has dropped, so users
  // with stale `~/.dirgha/config.json` don't 400 on every call.
  merged.model = migrateDeprecatedModel(merged.model);
  merged.cheapModel = migrateDeprecatedModel(merged.cheapModel);
  merged.summaryModel = migrateDeprecatedModel(merged.summaryModel);
  return merged;
}

async function readJson(path: string): Promise<Partial<DirghaConfig>> {
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (!text) return {};
  try {
    return JSON.parse(text) as Partial<DirghaConfig>;
  } catch {
    return {};
  }
}

function readEnvOverrides(): Partial<DirghaConfig> {
  const out: Partial<DirghaConfig> = {};
  if (process.env.DIRGHA_MODEL) out.model = process.env.DIRGHA_MODEL;
  if (process.env.DIRGHA_CHEAP_MODEL)
    out.cheapModel = process.env.DIRGHA_CHEAP_MODEL;
  if (process.env.DIRGHA_MAX_TURNS)
    out.maxTurns = Number.parseInt(process.env.DIRGHA_MAX_TURNS, 10);
  if (process.env.DIRGHA_SHOW_THINKING === "1") out.showThinking = true;
  return out;
}

function merge(...partials: Array<Partial<DirghaConfig>>): DirghaConfig {
  const out: DirghaConfig = structuredClone(DEFAULT_CONFIG);
  for (const p of partials) {
    if (!p) continue;
    for (const key of Object.keys(p) as Array<keyof DirghaConfig>) {
      const value = p[key];
      if (value === undefined) continue;
      if (typeof value === "object" && !Array.isArray(value)) {
        (out[key] as unknown) = {
          ...(out[key] as object),
          ...(value as object),
        };
      } else {
        (out[key] as unknown) = value;
      }
    }
  }
  return out;
}
