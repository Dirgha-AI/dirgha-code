const SENSITIVE_SUFFIXES = [
  "_API_KEY",
  "_SECRET",
  "_TOKEN",
  "_PASSWORD",
  "_CREDENTIAL",
  "_PRIVATE_KEY",
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

export function safeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (ALLOW_LIST.has(key.toUpperCase())) {
      out[key] = value;
      continue;
    }
    const upper = key.toUpperCase();
    if (SENSITIVE_SUFFIXES.some((s) => upper.endsWith(s))) continue;
    out[key] = value;
  }
  return out;
}
