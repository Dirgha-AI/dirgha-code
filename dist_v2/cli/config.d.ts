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
    thinking?: 'off' | 'low' | 'medium' | 'high';
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
     * TUI colour palette. Defaults to 'dark'. Users switch via /theme at
     * runtime; the preference is persisted to ~/.dirgha/config.json.
     */
    theme?: 'dark' | 'light' | 'none';
    /**
     * Persisted execution mode. Defaults to 'act' (normal execution).
     * Changed live via /mode; also honoured by fresh sessions.
     */
    mode?: 'plan' | 'act' | 'verify';
}
export declare const DEFAULT_CONFIG: DirghaConfig;
export declare function loadConfig(cwd?: string): Promise<DirghaConfig>;
