/**
 * `dirgha doctor` — environment diagnostics.
 *
 * Checks Node version (≥ 20), that cwd is a git repo, that `~/.dirgha/`
 * exists and is writable, which provider env vars are set, and whether
 * each configured provider's base endpoint is reachable (HEAD/GET with a
 * 3 s timeout). Prints a table by default; emits NDJSON when `--json`
 * is passed. Exit code 0 when every check passes, 1 if any fails.
 */
import { stat, access, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout } from 'node:process';
import { constants } from 'node:fs';
import { style, defaultTheme } from '../../tui/theme.js';
const PROVIDER_PROBES = [
    { env: 'NVIDIA_API_KEY', label: 'NVIDIA NIM', healthUrl: 'https://integrate.api.nvidia.com/v1/models' },
    { env: 'OPENROUTER_API_KEY', label: 'OpenRouter', healthUrl: 'https://openrouter.ai/api/v1/models' },
    { env: 'ANTHROPIC_API_KEY', label: 'Anthropic', healthUrl: 'https://api.anthropic.com/v1/models' },
    { env: 'OPENAI_API_KEY', label: 'OpenAI', healthUrl: 'https://api.openai.com/v1/models' },
    { env: 'GEMINI_API_KEY', label: 'Google AI', healthUrl: 'https://generativelanguage.googleapis.com' },
];
const TIMEOUT_MS = 3_000;
const MIN_NODE_MAJOR = 20;
async function checkNode() {
    const major = Number.parseInt(process.version.slice(1).split('.')[0], 10);
    if (Number.isNaN(major))
        return { name: 'node', status: 'fail', detail: `cannot parse ${process.version}` };
    if (major < MIN_NODE_MAJOR)
        return { name: 'node', status: 'fail', detail: `${process.version} (need ≥ v${MIN_NODE_MAJOR})` };
    return { name: 'node', status: 'pass', detail: process.version };
}
async function checkGit(cwd) {
    const info = await stat(join(cwd, '.git')).catch(() => undefined);
    if (info?.isDirectory())
        return { name: 'git', status: 'pass', detail: cwd };
    return { name: 'git', status: 'warn', detail: 'cwd is not a git repo' };
}
async function checkDirgaDir() {
    const dir = join(homedir(), '.dirgha');
    await mkdir(dir, { recursive: true }).catch(() => undefined);
    try {
        await access(dir, constants.W_OK);
        return { name: 'dirgha-home', status: 'pass', detail: dir };
    }
    catch {
        return { name: 'dirgha-home', status: 'fail', detail: `cannot write to ${dir}` };
    }
}
async function probeProvider(probe) {
    const envPresent = Boolean(process.env[probe.env]);
    if (!envPresent)
        return { name: probe.label, status: 'warn', detail: `${probe.env} unset` };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(probe.healthUrl, { method: 'GET', signal: controller.signal });
        clearTimeout(timer);
        if (res.status < 500)
            return { name: probe.label, status: 'pass', detail: `${probe.healthUrl} (${res.status})` };
        return { name: probe.label, status: 'fail', detail: `HTTP ${res.status}` };
    }
    catch (err) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        return { name: probe.label, status: 'fail', detail: `unreachable: ${msg}` };
    }
}
function printTable(results) {
    stdout.write(style(defaultTheme.accent, '\nDirgha doctor\n\n'));
    for (const r of results) {
        const icon = r.status === 'pass'
            ? style(defaultTheme.success, '✓')
            : r.status === 'warn'
                ? style(defaultTheme.warning, '⚠')
                : style(defaultTheme.danger, '✗');
        stdout.write(`  ${icon} ${r.name.padEnd(16)} ${r.detail}\n`);
    }
    stdout.write('\n');
}
function printNdjson(results) {
    for (const r of results)
        stdout.write(`${JSON.stringify(r)}\n`);
}
export const doctorSubcommand = {
    name: 'doctor',
    description: 'Environment diagnostics (node, git, providers)',
    async run(argv) {
        const json = argv.includes('--json');
        const results = [];
        results.push(await checkNode());
        results.push(await checkGit(process.cwd()));
        results.push(await checkDirgaDir());
        const probes = await Promise.all(PROVIDER_PROBES.map(probeProvider));
        results.push(...probes);
        if (json)
            printNdjson(results);
        else
            printTable(results);
        return results.some(r => r.status === 'fail') ? 1 : 0;
    },
};
//# sourceMappingURL=doctor.js.map