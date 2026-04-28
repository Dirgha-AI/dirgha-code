/**
 * `dirgha telemetry` — anonymous usage opt-in.
 *
 * Subcommands:
 *   status               Print enabled/disabled, endpoint, session-id tail.
 *   enable               Opt in (writes ~/.dirgha/config.json telemetry.enabled = true).
 *   disable              Opt out (default).
 *   endpoint <url>       Override the upload endpoint.
 *
 * Privacy policy: docs/privacy/CLI-TELEMETRY.md
 *
 * Default behaviour: telemetry is OFF until the user explicitly runs
 * `dirgha telemetry enable` OR responds 'y' to the first-run consent
 * prompt. We NEVER send prompts, responses, file contents, or keys.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { stdout } from 'node:process';
import { style, defaultTheme } from '../../tui/theme.js';
const T = defaultTheme;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const ok = (s) => style(T.success, s);
const accent = (s) => style(T.accent, s);
const muted = (s) => style(T.muted, s);
const DEFAULT_ENDPOINT = 'https://t.dirgha.ai/v1/cli';
function configPath() {
    return join(homedir(), '.dirgha', 'config.json');
}
function idPath() {
    return join(homedir(), '.dirgha', 'telemetry-id');
}
/** Read the current telemetry config, defaulting to opt-out. */
export function readTelemetryConfig() {
    const cfgFile = configPath();
    let raw = {};
    try {
        if (existsSync(cfgFile))
            raw = JSON.parse(readFileSync(cfgFile, 'utf8'));
    }
    catch { /* corrupt config = opt-out */ }
    const t = raw.telemetry ?? {};
    let sessionId = '';
    try {
        if (existsSync(idPath()))
            sessionId = readFileSync(idPath(), 'utf8').trim();
    }
    catch { /* */ }
    return {
        enabled: t.enabled === true,
        endpoint: typeof t.endpoint === 'string' && t.endpoint.length > 0 ? t.endpoint : DEFAULT_ENDPOINT,
        sessionId,
    };
}
/** Persist a telemetry config patch. Always writes to ~/.dirgha/config.json. */
export function writeTelemetryConfig(patch) {
    const dir = join(homedir(), '.dirgha');
    mkdirSync(dir, { recursive: true });
    const cfgFile = configPath();
    let raw = {};
    try {
        if (existsSync(cfgFile))
            raw = JSON.parse(readFileSync(cfgFile, 'utf8'));
    }
    catch { /* */ }
    raw.telemetry = {
        enabled: patch.enabled ?? raw.telemetry?.enabled ?? false,
        endpoint: patch.endpoint ?? raw.telemetry?.endpoint ?? DEFAULT_ENDPOINT,
    };
    writeFileSync(cfgFile, JSON.stringify(raw, null, 2));
    // Mint sessionId on first opt-in; keep across subsequent toggles.
    if (raw.telemetry.enabled && !existsSync(idPath())) {
        writeFileSync(idPath(), `anon-${randomUUID()}`);
    }
}
function maskedSession(id) {
    if (!id)
        return '(none — generated on first opt-in)';
    if (id.length <= 12)
        return id;
    return `${id.slice(0, 5)}…${id.slice(-4)}`;
}
async function runStatus() {
    const cfg = readTelemetryConfig();
    stdout.write(`${bold('Telemetry')}\n`);
    stdout.write(`  state:      ${cfg.enabled ? ok('ENABLED') : muted('disabled (opt-out, default)')}\n`);
    stdout.write(`  endpoint:   ${cfg.endpoint}${cfg.endpoint === DEFAULT_ENDPOINT ? muted(' (default)') : ''}\n`);
    stdout.write(`  session id: ${maskedSession(cfg.sessionId)}\n`);
    stdout.write(`\n`);
    stdout.write(`Privacy policy: ${accent('docs/privacy/CLI-TELEMETRY.md')}\n`);
    stdout.write(`Toggle: ${accent('dirgha telemetry enable')} | ${accent('dirgha telemetry disable')}\n`);
    return 0;
}
async function runEnable() {
    writeTelemetryConfig({ enabled: true });
    const cfg = readTelemetryConfig();
    stdout.write(`${ok('✓')} telemetry enabled. session ${maskedSession(cfg.sessionId)} will be sent.\n`);
    stdout.write(`  We never send: prompts, responses, file contents, API keys.\n`);
    stdout.write(`  We send: version, OS, Node version, command name, error class.\n`);
    stdout.write(`  Disable any time: dirgha telemetry disable\n`);
    return 0;
}
async function runDisable() {
    writeTelemetryConfig({ enabled: false });
    stdout.write(`${ok('✓')} telemetry disabled. Nothing leaves your machine.\n`);
    return 0;
}
async function runEndpoint(url) {
    if (!url || !/^https?:\/\//.test(url)) {
        stdout.write(`Usage: dirgha telemetry endpoint <https://your-posthog.example/capture>\n`);
        return 1;
    }
    writeTelemetryConfig({ endpoint: url });
    stdout.write(`${ok('✓')} telemetry endpoint set to ${url}\n`);
    return 0;
}
export const telemetrySubcommand = {
    name: 'telemetry',
    description: 'Manage anonymous usage telemetry (default: OFF)',
    async run(argv) {
        const [verb, ...rest] = argv;
        switch (verb) {
            case undefined:
            case '':
            case 'status': return runStatus();
            case 'enable': return runEnable();
            case 'disable': return runDisable();
            case 'endpoint': return runEndpoint(rest[0] ?? '');
            default:
                stdout.write(`Usage: dirgha telemetry <status|enable|disable|endpoint <url>>\n`);
                stdout.write(`Privacy: docs/privacy/CLI-TELEMETRY.md\n`);
                return 1;
        }
    },
};
//# sourceMappingURL=telemetry.js.map