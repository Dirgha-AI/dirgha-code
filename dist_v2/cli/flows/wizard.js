/**
 * `dirgha setup` — three-step provider/auth/model wizard.
 *
 * Designed as the first thing a new user sees. Replaces the older
 * one-step "pick provider, paste key" form with a clear:
 *   1. Pick a provider (Dirgha hosted is option 1; BYOK options follow)
 *   2. Authenticate (device-code for Dirgha, hidden-input for BYOK)
 *   3. Pick a default model from that provider's catalogue
 *
 * Auto-launched by `bin/dirgha` on first run when neither
 * `~/.dirgha/keys.json` nor `~/.dirgha/credentials.json` exists.
 *
 * Non-TTY: prints a static how-to instead of prompting (CI-safe).
 */
import { stdin, stdout } from 'node:process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defaultTheme, style } from '../../tui/theme.js';
import { pollDeviceAuth, saveToken, startDeviceAuth } from '../../integrations/device-auth.js';
import { PRICES } from '../../intelligence/prices.js';
const PROVIDERS = [
    { id: 'dirgha', label: 'Dirgha hosted', hosted: true,
        blurb: 'Sign in with your Dirgha account · free tier + paid plans' },
    { id: 'nvidia', label: 'NVIDIA NIM', hosted: false,
        env: 'NVIDIA_API_KEY', helpUrl: 'https://build.nvidia.com/settings/api-keys',
        blurb: 'Free NIM tier · Kimi, DeepSeek, Qwen, Llama' },
    { id: 'openrouter', label: 'OpenRouter', hosted: false,
        env: 'OPENROUTER_API_KEY', helpUrl: 'https://openrouter.ai/keys',
        blurb: 'Hundreds of models · free + paid · :free suffix tier' },
    { id: 'anthropic', label: 'Anthropic', hosted: false,
        env: 'ANTHROPIC_API_KEY', helpUrl: 'https://console.anthropic.com/settings/keys',
        blurb: 'Claude family — Opus, Sonnet, Haiku' },
    { id: 'openai', label: 'OpenAI', hosted: false,
        env: 'OPENAI_API_KEY', helpUrl: 'https://platform.openai.com/api-keys',
        blurb: 'GPT family' },
    { id: 'gemini', label: 'Gemini', hosted: false,
        env: 'GEMINI_API_KEY', helpUrl: 'https://aistudio.google.com/apikey',
        blurb: 'Google\'s models' },
    { id: 'fireworks', label: 'Fireworks', hosted: false,
        env: 'FIREWORKS_API_KEY', helpUrl: 'https://fireworks.ai/account/api-keys',
        blurb: 'Fast hosted open models' },
];
const DEFAULT_MODEL_PER_PROVIDER = {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-5',
    gemini: 'gemini-2.5-pro',
    nvidia: 'moonshotai/kimi-k2-instruct',
    openrouter: 'deepseek/deepseek-chat',
    fireworks: 'accounts/fireworks/models/deepseek-v3',
    dirgha: 'deepseek',
};
function dirghaHome() { return join(homedir(), '.dirgha'); }
function keysPath() { return join(dirghaHome(), 'keys.json'); }
function configPath() { return join(dirghaHome(), 'config.json'); }
async function readJson(path) {
    const text = await readFile(path, 'utf8').catch(() => '');
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
async function writeJson(path, data, mode) {
    await mkdir(dirghaHome(), { recursive: true });
    await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    if (mode !== undefined) {
        try {
            await chmod(path, mode);
        }
        catch { /* non-POSIX */ }
    }
}
async function persistDefaultModel(modelId) {
    const cfg = (await readJson(configPath())) ?? {};
    cfg.defaultModel = modelId;
    await writeJson(configPath(), cfg);
}
async function persistApiKey(env, key) {
    const store = (await readJson(keysPath())) ?? {};
    store[env] = key;
    await writeJson(keysPath(), store, 0o600);
}
async function promptHidden(rl, prompt) {
    // Override readline's echo while the user types so secrets don't render.
    const writer = rl;
    const orig = writer._writeToOutput;
    writer._writeToOutput = (s) => {
        if (s.startsWith(prompt))
            stdout.write(prompt);
        // suppress everything else
    };
    try {
        const value = await rl.question(prompt);
        return value.trim();
    }
    finally {
        writer._writeToOutput = orig;
    }
}
function printHeader() {
    stdout.write(`\n${style(defaultTheme.accent, '◈ dirgha — setup')}\n`);
    stdout.write(`${style(defaultTheme.muted, '  Three-step provider · auth · model wizard.')}\n\n`);
}
function printStep(n, label) {
    stdout.write(`\n${style(defaultTheme.accent, `Step ${n} of 3`)} · ${label}\n\n`);
}
async function pickProvider(rl) {
    printStep(1, 'Pick a provider');
    PROVIDERS.forEach((p, i) => {
        const num = `${i + 1}`.padStart(2);
        const tag = p.hosted ? style(defaultTheme.success, ' [hosted]') : '';
        stdout.write(`  ${num}. ${style(defaultTheme.accent, p.label.padEnd(14))}${tag}  ${style(defaultTheme.muted, p.blurb)}\n`);
    });
    const ans = (await rl.question(`\n  [1-${PROVIDERS.length}]: `)).trim();
    const idx = Number.parseInt(ans, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= PROVIDERS.length) {
        // Allow name match too.
        const byName = PROVIDERS.find(p => p.id === ans.toLowerCase() || p.label.toLowerCase() === ans.toLowerCase());
        return byName ?? null;
    }
    return PROVIDERS[idx] ?? null;
}
async function authenticate(provider, rl) {
    printStep(2, `Authenticate · ${provider.label}`);
    if (provider.hosted) {
        return authenticateDirgha();
    }
    if (!provider.env)
        return false;
    stdout.write(`  Get a key:  ${style(defaultTheme.accent, provider.helpUrl ?? '')}\n`);
    stdout.write(`  Paste it below (input hidden — press enter when done).\n\n`);
    const key = await promptHidden(rl, `  ${provider.env}: `);
    stdout.write('\n');
    if (!key || key.length < 6) {
        stdout.write(style(defaultTheme.danger, '  ✗ Empty or implausibly short key — aborting.\n'));
        return false;
    }
    await persistApiKey(provider.env, key);
    stdout.write(style(defaultTheme.success, `  ✓ Saved ${provider.env} (${key.length} chars) at ~/.dirgha/keys.json (0600)\n`));
    return true;
}
async function authenticateDirgha() {
    let start;
    try {
        start = await startDeviceAuth();
    }
    catch (err) {
        stdout.write(style(defaultTheme.danger, `  ✗ Device-code start failed: ${err instanceof Error ? err.message : String(err)}\n`));
        stdout.write(`  ${style(defaultTheme.muted, 'Tip: pick a BYOK provider above to skip the hosted account.')}\n`);
        return false;
    }
    stdout.write(`  1. Open: ${style(defaultTheme.accent, start.verifyUri)}\n`);
    stdout.write(`  2. Enter code: ${style(defaultTheme.accent, start.userCode)}\n\n`);
    stdout.write(`  Waiting for authorization (expires in ~${Math.round(start.expiresIn / 60_000)} min)…\n`);
    try {
        const result = await pollDeviceAuth(start.deviceCode, undefined, {
            intervalMs: start.interval, timeoutMs: start.expiresIn,
        });
        await saveToken(result.token, result.userId, result.email);
        stdout.write(style(defaultTheme.success, `\n  ✓ Signed in as ${result.email}\n`));
        return true;
    }
    catch (err) {
        stdout.write(style(defaultTheme.danger, `\n  ✗ Login failed: ${err instanceof Error ? err.message : String(err)}\n`));
        return false;
    }
}
function modelsForProvider(providerId) {
    // For "dirgha" hosted, surface the same routable model set the
    // gateway exposes — same canonical aliases the runtime uses.
    if (providerId === 'dirgha') {
        return ['deepseek', 'kimi', 'opus', 'sonnet', 'haiku', 'gemini', 'flash', 'llama', 'ling', 'hy3'];
    }
    return PRICES.filter(p => p.provider === providerId).map(p => p.model);
}
async function pickModel(provider, rl) {
    printStep(3, `Pick a default model · ${provider.label}`);
    const models = modelsForProvider(provider.id);
    if (models.length === 0) {
        stdout.write(`  ${style(defaultTheme.muted, 'No catalogue entries for this provider yet — using `auto`.')}\n`);
        return 'auto';
    }
    const suggested = DEFAULT_MODEL_PER_PROVIDER[provider.id] ?? models[0];
    const top = models.slice(0, 8);
    // Make sure the suggested model is in the list shown.
    if (suggested !== undefined && !top.includes(suggested))
        top.unshift(suggested);
    top.forEach((m, i) => {
        const num = `${i + 1}`.padStart(2);
        const marker = m === suggested ? style(defaultTheme.success, '  ← recommended') : '';
        stdout.write(`  ${num}. ${m}${marker}\n`);
    });
    const more = models.length - top.length;
    if (more > 0) {
        stdout.write(`  ${style(defaultTheme.muted, `… ${more} more available via \`dirgha models list\` after setup`)}\n`);
    }
    const defaultIdx = suggested !== undefined ? `${top.indexOf(suggested) + 1}` : '1';
    const ans = (await rl.question(`\n  [1-${top.length}, default ${defaultIdx}]: `)).trim();
    const idx = ans === '' ? Number.parseInt(defaultIdx, 10) - 1 : Number.parseInt(ans, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= top.length) {
        // Allow direct id paste.
        return ans.length > 0 ? ans : (suggested ?? top[0] ?? null);
    }
    return top[idx] ?? null;
}
function printCompletion(provider, model) {
    stdout.write(`\n${style(defaultTheme.success, '✓ Setup complete.')}\n`);
    stdout.write(`  Provider:       ${style(defaultTheme.accent, provider.label)}\n`);
    stdout.write(`  Default model:  ${style(defaultTheme.accent, model)}\n\n`);
    stdout.write(`  Next:  ${style(defaultTheme.accent, 'dirgha "your prompt"')}  (one-shot)\n`);
    stdout.write(`         ${style(defaultTheme.accent, 'dirgha')}                 (interactive REPL)\n`);
    stdout.write(`         ${style(defaultTheme.accent, 'dirgha keys add <provider>')}  (add another provider later)\n\n`);
}
function printNonInteractiveHelp() {
    stdout.write(`\n${style(defaultTheme.accent, '◈ dirgha — setup')}\n\n`);
    stdout.write(`Non-interactive context detected. Configure manually:\n\n`);
    stdout.write(`  ${style(defaultTheme.accent, 'Hosted account')}\n`);
    stdout.write(`    dirgha login\n\n`);
    stdout.write(`  ${style(defaultTheme.accent, 'BYOK')} — pick one or more:\n`);
    for (const p of PROVIDERS.filter(x => !x.hosted && x.env)) {
        stdout.write(`    export ${p.env}=<key>     ${style(defaultTheme.muted, p.helpUrl ?? '')}\n`);
    }
    stdout.write(`\nThen pick a default model:\n`);
    stdout.write(`    dirgha models default <model-id>\n\n`);
}
export async function runWizard(argv) {
    const isTty = stdin.isTTY === true;
    const force = argv.includes('--interactive') || argv.includes('--interactive=true');
    const skip = argv.includes('--non-interactive') || argv.includes('--interactive=false');
    if (skip || (!isTty && !force)) {
        printNonInteractiveHelp();
        return 0;
    }
    printHeader();
    const rl = createInterface({ input: stdin, output: stdout });
    try {
        const provider = await pickProvider(rl);
        if (!provider) {
            stdout.write(style(defaultTheme.danger, '\n  ✗ No provider selected. Re-run `dirgha setup` to try again.\n'));
            return 1;
        }
        const ok = await authenticate(provider, rl);
        if (!ok)
            return 1;
        const model = await pickModel(provider, rl);
        if (!model)
            return 1;
        await persistDefaultModel(model);
        printCompletion(provider, model);
        return 0;
    }
    finally {
        rl.close();
    }
}
export const wizardSubcommand = {
    name: 'setup',
    description: 'Three-step provider · auth · model wizard',
    async run(argv) { return runWizard(argv); },
};
//# sourceMappingURL=wizard.js.map