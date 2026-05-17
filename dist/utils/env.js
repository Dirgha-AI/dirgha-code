const SENSITIVE_SUFFIXES = [
    "_API_KEY",
    "_SECRET",
    "_TOKEN",
    "_PASSWORD",
    "_CREDENTIAL",
    "_PRIVATE_KEY",
];
/**
 * Regex patterns that identify sensitive environment variables.
 * Covers well-known cloud/LLM keys, credential suffixes, and AWS
 * access key IDs (AKIA…).
 */
const SENSITIVE_PATTERNS = [
    /^AWS_/i,
    /^DEEPSEEK_/i,
    /^OPENAI_/i,
    /^ANTHROPIC_/i,
    /^NVIDIA_/i,
    /^GOOGLE_AI_/i,
    /^COHERE_/i,
    /^GROQ_/i,
    /^TOGETHER_/i,
    /^HUGGINGFACE_/i,
    /^REPLICATE_/i,
    /^FAL_/i,
    /^AZURE_OPENAI_/i,
    /API_KEY/i,
    /SECRET/i,
    /TOKEN/i,
    /PASSWORD/i,
    /CREDENTIALS?/i,
    /_PRIVATE_KEY/i,
];
const ALLOW_LIST = new Set([
    "PATH",
    "HOME",
    "USER",
    "SHELL",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LC_MESSAGES",
    "TMPDIR",
    "TEMP",
    "TMP",
    "PWD",
    "OLDPWD",
    "TERM",
    "TERM_PROGRAM",
    "COLORTERM",
    "NO_COLOR",
    "FORCE_COLOR",
    "NODE_ENV",
    "NODE_OPTIONS",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "SSH_AUTH_SOCK",
    "SSH_AGENT_PID",
    "EDITOR",
    "VISUAL",
    "PAGER",
    "BROWSER",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
    "XDG_SESSION_TYPE",
    "RTK_TELEMETRY_DISABLED",
]);
/**
 * Return a sanitised copy of `env` with all sensitive variables stripped.
 * Only known-benign variables (PATH, HOME, TERM, etc.) and variables
 * that do NOT match any sensitive pattern are passed through.
 *
 * Returns `Record<string, string>` (undefined values are dropped).
 */
export function safeEnvironment(env = process.env) {
    const out = {};
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined)
            continue;
        if (ALLOW_LIST.has(key.toUpperCase())) {
            out[key] = value;
            continue;
        }
        const upper = key.toUpperCase();
        // Check suffix-based denial first (fast)
        if (SENSITIVE_SUFFIXES.some((s) => upper.endsWith(s)))
            continue;
        // Check regex patterns
        if (SENSITIVE_PATTERNS.some((p) => p.test(key)))
            continue;
        out[key] = value;
    }
    return out;
}
//# sourceMappingURL=env.js.map