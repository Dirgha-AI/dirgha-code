/**
 * Configuration loader. Merges defaults, user config, project config,
 * environment, and CLI flags. Results are cached on first read.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { migrateDeprecatedModel } from "../intelligence/prices.js";

export interface DirghaConfig {
  /** Config schema version. Bumped on breaking changes. Current: 1. */
  schemaVersion?: number;
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
   * When true (default), the Ink TUI enters the terminal alternate buffer
   * (`\\x1b[?1049h`) on startup and exits (`\\x1b[?1049l`) on quit.
   * This eliminates the "flashing background" effect caused by Ink frames
   * writing over accumulated scrollback in the main buffer. Set to false
   * if you need scrollback access during the session.
   */
  alternateBuffer?: boolean;
  /**
   * Persisted execution mode. Defaults to 'act' (normal execution).
   * Changed live via /mode; also honoured by fresh sessions.
   */
  mode?: "plan" | "act" | "yolo" | "verify" | "ask";
  /**
   * When true (default), the top-K most relevant KB articles from
   * ~/.dirgha/knowledge/ are injected into the system prompt on each
   * turn based on the user's input. Set to false to opt out.
   */
  kbAutoInject?: boolean;
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

const CURRENT_SCHEMA = 1;

export const DEFAULT_CONFIG: DirghaConfig = {
  schemaVersion: CURRENT_SCHEMA,
  model: "moonshotai/kimi-k2.6",
  cheapModel: "deepseek-ai/deepseek-v4-flash", // widely available via DeepSeek, NIM, and OpenRouter
  summaryModel: "moonshotai/kimi-k2.5",
  maxTurns: 16,
  showThinking: false,
  autoApproveTools: ["fs_read", "fs_ls", "search_grep", "search_glob", "git"],
  skills: { enabled: true },
  smartRoute: { enabled: false },
  compaction: { triggerTokens: 120_000, preserveLastTurns: 6 },
  telemetry: { enabled: false },
  kbAutoInject: true,
  alternateBuffer: true,
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
  validate(merged);
  migrateConfigSchema(merged);
  // Migrate any model IDs the upstream provider has dropped, so users
  // with stale `~/.dirgha/config.json` don't 400 on every call.
  const originalModel = merged.model;
  const originalCheap = merged.cheapModel;
  const originalSummary = merged.summaryModel;
  merged.model = migrateDeprecatedModel(merged.model);
  merged.cheapModel = migrateDeprecatedModel(merged.cheapModel);
  merged.summaryModel = migrateDeprecatedModel(merged.summaryModel);
  if (originalModel !== merged.model) {
    process.stderr.write(
      `[dirgha] model "${originalModel}" migrated to "${merged.model}"\n`,
    );
  }
  if (originalCheap !== merged.cheapModel) {
    process.stderr.write(
      `[dirgha] cheapModel "${originalCheap}" migrated to "${merged.cheapModel}"\n`,
    );
  }
  if (originalSummary !== merged.summaryModel) {
    process.stderr.write(
      `[dirgha] summaryModel "${originalSummary}" migrated to "${merged.summaryModel}"\n`,
    );
  }
  return merged;
}

async function readJson(path: string): Promise<Partial<DirghaConfig>> {
  const text = await readFile(path, "utf8").catch(() => undefined);
  if (!text) return {};
  try {
    return JSON.parse(text) as Partial<DirghaConfig>;
  } catch {
    process.stderr.write(
      `[dirgha] Warning: ${path} contains malformed JSON — using defaults.\n`,
    );
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
  const modeEnv = process.env.DIRGHA_MODE;
  if (
    modeEnv &&
    (["plan", "act", "yolo", "verify", "ask"] as const).includes(
      modeEnv as "plan" | "act" | "yolo" | "verify" | "ask",
    )
  ) {
    out.mode = modeEnv as "plan" | "act" | "yolo" | "verify" | "ask";
  }
  return out;
}

function merge(...partials: Array<Partial<DirghaConfig>>): DirghaConfig {
  const out: DirghaConfig = structuredClone(DEFAULT_CONFIG);
  const arrayFields = new Set<keyof DirghaConfig>(["autoApproveTools"]);
  for (const p of partials) {
    if (!p) continue;
    for (const key of Object.keys(p) as Array<keyof DirghaConfig>) {
      const value = p[key];
      if (value === undefined) continue;
      if (
        arrayFields.has(key) &&
        Array.isArray(value) &&
        Array.isArray(out[key])
      ) {
        (out[key] as unknown) = [
          ...(out[key] as unknown as string[]),
          ...(value as string[]),
        ];
      } else if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
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

function validate(cfg: DirghaConfig): void {
  if (!Number.isFinite(cfg.maxTurns) || cfg.maxTurns < 1) {
    cfg.maxTurns = 1;
  }
  if (
    !Number.isFinite(cfg.compaction.triggerTokens) ||
    cfg.compaction.triggerTokens < 1000
  ) {
    cfg.compaction.triggerTokens = 1000;
  }
  if (
    !Number.isFinite(cfg.compaction.preserveLastTurns) ||
    cfg.compaction.preserveLastTurns < 1
  ) {
    cfg.compaction.preserveLastTurns = 1;
  }
  if (!cfg.model || cfg.model.trim() === "") {
    process.stderr.write(
      "[dirgha] warn: model is empty; LLM calls will fail\n",
    );
  }
}

function migrateConfigSchema(cfg: DirghaConfig): void {
  if (cfg.schemaVersion === CURRENT_SCHEMA) return;
  // Future migrations go here. Example:
  // if (cfg.schemaVersion === undefined || cfg.schemaVersion < 2) {
  //   // v1 → v2: rename field, add default
  // }
  cfg.schemaVersion = CURRENT_SCHEMA;
}
