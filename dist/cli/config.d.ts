/**
 * Configuration loader. Merges defaults, user config, project config,
 * environment, and CLI flags. Results are cached on first read.
 */
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
    skills: {
        enabled: boolean;
        explicit?: string[];
    };
    smartRoute: {
        enabled: boolean;
    };
    compaction: {
        triggerTokens: number;
        preserveLastTurns: number;
    };
    telemetry: {
        enabled: boolean;
    };
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
    theme?: "readable" | "dark" | "light" | "none" | "midnight" | "ocean" | "solarized" | "warm" | "violet-storm" | "cosmic" | "nord" | "ember" | "sakura" | "obsidian-gold" | "crimson" | "dracula" | "github-dark" | "tokyonight" | "atom-one-dark" | "ayu-dark";
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
    mcpServers?: Record<string, {
        command: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
    } | {
        url: string;
        bearerToken?: string;
        headers?: Record<string, string>;
        timeoutMs?: number;
    }>;
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
        before_turn?: Array<{
            command: string;
        }>;
        after_turn?: Array<{
            command: string;
        }>;
        before_tool_call?: Array<{
            command: string;
            matcher?: string;
        }>;
        after_tool_call?: Array<{
            command: string;
            matcher?: string;
        }>;
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
    fallbackModels?: Array<{
        model: string;
    }>;
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
export declare const DEFAULT_CONFIG: DirghaConfig;
export declare function loadConfig(cwd?: string): Promise<DirghaConfig>;
