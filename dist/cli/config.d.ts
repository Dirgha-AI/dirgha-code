/**
 * Configuration loader. Merges defaults, user config, project config,
 * environment, and CLI flags. Results are cached on first read.
 */
export interface DirghaConfig {
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
}
export declare const DEFAULT_CONFIG: DirghaConfig;
export declare function loadConfig(cwd?: string): Promise<DirghaConfig>;
