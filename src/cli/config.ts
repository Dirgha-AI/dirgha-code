/**
 * Configuration loader. Merges defaults, user config, project config,
 * environment, and CLI flags. Results are cached on first read.
 */

import { readFile, readlink } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
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
   * When true, the Ink TUI enters the terminal alternate buffer
   * (`\\x1b[?1049h`) on startup and exits (`\\x1b[?1049l`) on quit —
   * giving a clean exit (terminal looks like dirgha never ran) at the
   * cost of breaking native terminal scrollback, mouse-wheel selection,
   * and copy. Default is now false (matches gemini-cli, claude-code,
   * bash/zsh) so wheel-scroll, copy/paste and scrollback work natively.
   * Set to true if you prefer the clean-exit experience and accept the
   * trade-off.
   */
  alternateBuffer?: boolean;
  /**
   * Sandbox mode for tools that spawn external commands (shell, git,
   * lsp). Default `off` = current behaviour, no containment. `auto`
   * confines spawnable tools to the cwd via the platform sandbox
   * (bwrap on Linux, sandbox-exec on macOS, JobObject on Windows)
   * with network allowed. `strict` adds a network ban. Toggle live
   * via `/sandbox <mode>`.
   *
   * fs-read / fs-write / fs-edit / search-glob still run inline JS
   * and are not affected by this setting today (path-allowlist work
   * is queued for a follow-up release).
   */
  sandbox?: "off" | "auto" | "strict";
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
  /**
   * Ordered list of fallback models for autonomous sessions. When the
   * primary model returns a "model not found" or "deprecated" error,
   * the agent loop advances through this list — building a new provider
   * for each entry — instead of silently rewriting the model ID.
   *
   * Each entry must include a `model` field. The model ID is routed to
   * the appropriate provider via the same dispatch logic as `model`.
   *
   *   "fallbackModels": [
   *     { "model": "deepseek-ai/deepseek-v4-flash" },
   *     { "model": "anthropic/claude-sonnet-4" }
   *   ]
   */
  fallbackModels?: Array<{ model: string }>;
  /**
   * Optional remote endpoint for text embeddings. When set, kb_search
   * and any other embedding consumer POST `{texts: string[]}` here and
   * expect `{vectors: number[][]}` back. Leave unset to use the local
   * Xenova/transformers.js adapter (requires the optional
   * `@xenova/transformers` package). Override at runtime via the
   * `DIRGHA_EMBEDDINGS_ENDPOINT` env var.
   */
  embeddingsEndpoint?: string;
  /**
   * Optional bearer token for the embeddings endpoint. Sent as
   * `Authorization: Bearer <token>`. Override via the
   * `DIRGHA_EMBEDDINGS_TOKEN` env var.
   */
  embeddingsBearerToken?: string;
}

const CURRENT_SCHEMA = 1;

export const DEFAULT_CONFIG: DirghaConfig = {
  schemaVersion: CURRENT_SCHEMA,
  model: "deepseek-ai/deepseek-v4-flash",
  cheapModel: "deepseek-ai/deepseek-v4-flash",
  summaryModel: "deepseek-ai/deepseek-v4-flash",
  maxTurns: 16,
  showThinking: false,
  autoApproveTools: ["fs_read", "fs_ls", "search_grep", "search_glob"],
  skills: { enabled: true },
  smartRoute: { enabled: false },
  compaction: { triggerTokens: 120_000, preserveLastTurns: 6 },
  telemetry: { enabled: false },
  kbAutoInject: true,
  alternateBuffer: false,
  sandbox: "off",
};

// ── Trust store for project-level config ──────────────────────────────

const TRUST_STORE_PATH = join(homedir(), ".dirgha", "trusted-projects.json");

function readTrustStore(): Set<string> {
  try {
    if (!existsSync(TRUST_STORE_PATH)) return new Set();
    const raw = JSON.parse(readFileSync(TRUST_STORE_PATH, "utf8"));
    if (Array.isArray(raw)) return new Set(raw.map(String));
    return new Set();
  } catch {
    return new Set();
  }
}

function writeTrustStore(roots: Set<string>): void {
  try {
    const dir = join(homedir(), ".dirgha");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      TRUST_STORE_PATH,
      JSON.stringify([...roots], null, 2),
      "utf8",
    );
  } catch {
    /* swallow — worst case the user re-grants trust next time */
  }
}

async function resolveProjectRoot(cwd: string): Promise<string> {
  try {
    // If cwd is a symlink, resolve it for stable trust
    const resolved = await readlink(cwd).catch(() => cwd);
    return resolved;
  } catch {
    return cwd;
  }
}

function hasDangerousKeys(
  partial: Partial<DirghaConfig>,
): { dangerous: boolean; mcp: boolean; hooks: boolean; ext: boolean } {
  const result = { dangerous: false, mcp: false, hooks: false, ext: false };
  if (!partial) return result;
  if (partial.mcpServers !== undefined) {
    result.dangerous = true;
    result.mcp = true;
  }
  if (partial.hooks !== undefined) {
    result.dangerous = true;
    result.hooks = true;
  }
  if ((partial as Record<string, unknown>).extensions !== undefined) {
    result.dangerous = true;
    result.ext = true;
  }
  return result;
}

function stripDangerousKeys(
  partial: Partial<DirghaConfig>,
): Partial<DirghaConfig> {
  const out: Record<string, unknown> = { ...partial };
  delete out.mcpServers;
  delete out.hooks;
  delete out.extensions;
  return out as unknown as Partial<DirghaConfig>;
}

async function promptTrust(
  root: string,
  dangers: { mcp: boolean; hooks: boolean; ext: boolean },
): Promise<boolean> {
  const lines: string[] = [
    `\n[dirgha] Project config at "${root}/.dirgha/config.json" contains:`,
  ];
  if (dangers.mcp) lines.push("  · mcpServers — subprocess(es) that run on every session");
  if (dangers.hooks) lines.push("  · hooks — shell commands executed during the agent loop");
  if (dangers.ext) lines.push("  · extensions — dynamically loaded code");
  lines.push(
    "",
    "  These features will be disabled unless the project is trusted.",
    "  Trust this project and allow these features? [y/N] ",
  );
  process.stderr.write(lines.join("\n"));

  try {
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = (await rl.question("")).trim().toLowerCase();
    rl.close();
    return answer === "y" || answer === "yes";
  } catch {
    return false;
  }
}

export async function loadConfig(
  cwd: string = process.cwd(),
): Promise<DirghaConfig> {
  const userPath = join(homedir(), ".dirgha", "config.json");
  const projectPath = join(cwd, ".dirgha", "config.json");

  const userPartial = await readJson(userPath);
  let projectPartial = await readJson(projectPath);
  const envPartial = readEnvOverrides();

  // Gate project-level dangerous keys behind trust
  const dangers = hasDangerousKeys(projectPartial);
  if (dangers.dangerous) {
    const projectRoot = await resolveProjectRoot(cwd);
    const trusted = readTrustStore();
    if (trusted.has(projectRoot)) {
      // Trusted — load normally
    } else if (stdin.isTTY) {
      // Interactive — prompt
      const granted = await promptTrust(projectRoot, dangers);
      if (granted) {
        trusted.add(projectRoot);
        writeTrustStore(trusted);
      } else {
        projectPartial = stripDangerousKeys(projectPartial);
        process.stderr.write(
          "[dirgha] project mcpServers/hooks disabled. Run again and answer 'y' to trust.\n",
        );
      }
    } else {
      // Non-interactive — strip silently
      projectPartial = stripDangerousKeys(projectPartial);
      process.stderr.write(
        "[dirgha] untrusted project config: mcpServers/hooks disabled (run interactively to grant trust)\n",
      );
    }
  }

  const merged = merge(DEFAULT_CONFIG, userPartial, projectPartial, envPartial);
  validate(merged);
  migrateConfigSchema(merged);
  // Check for deprecated-model IDs (models a specific provider has
  // dropped) and WARN the user, but do NOT silently rewrite the model.
  // Silent rewrites break cost expectations, user's preferred provider,
  // and model-specific behavior. The warning prints once and the user
  // can update their config with `dirgha config set model <id>` or
  // pass `-m <id>` to override at runtime.
  for (const key of ["model", "cheapModel", "summaryModel"] as const) {
    const val = merged[key];
    if (val && val !== migrateDeprecatedModel(val)) {
      const hint = migrateDeprecatedModel(val);
      process.stderr.write(
        `[dirgha] ⚠ ${key} "${val}" is deprecated by its provider.` +
          (hint !== val ? ` Consider: dirgha config set ${key} ${hint}` : "") +
          `\n`,
      );
    }
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
  if (process.env.DIRGHA_EMBEDDINGS_ENDPOINT) {
    out.embeddingsEndpoint = process.env.DIRGHA_EMBEDDINGS_ENDPOINT;
  }
  if (process.env.DIRGHA_EMBEDDINGS_TOKEN) {
    out.embeddingsBearerToken = process.env.DIRGHA_EMBEDDINGS_TOKEN;
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
