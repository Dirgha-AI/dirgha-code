/**
 * `dirgha keys <list|set|get|clear>` — BYOK key store at
 * `~/.dirgha/keys.json` (mode 0600).
 *
 * Mirrors the `/keys` slash but is callable non-interactively from
 * shells and scripts. `list` masks values; `get` prints the raw value
 * (supported but noisy by design so nobody leans on it). `set` writes
 * the file with a 0600 chmod. `clear` removes one key or everything
 * when given `all`.
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdout, stderr } from 'node:process';
import { style, defaultTheme } from '../../tui/theme.js';
import { listEnvVars, findProviderByEnv } from '../../auth/providers.js';
import { readPool, addEntry, removeEntry, clearProvider } from '../../auth/keypool.js';
const KNOWN_PROVIDERS = listEnvVars();
function keyPath() {
    return join(homedir(), '.dirgha', 'keys.json');
}
async function read() {
    const text = await readFile(keyPath(), 'utf8').catch(() => '');
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return {};
    }
}
async function write(store) {
    const path = keyPath();
    await mkdir(join(homedir(), '.dirgha'), { recursive: true });
    await writeFile(path, JSON.stringify(store, null, 2) + '\n', 'utf8');
    try {
        await chmod(path, 0o600);
    }
    catch { /* non-POSIX */ }
}
function mask(value) {
    if (value.length < 10)
        return '***';
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
/**
 * Probe the NVIDIA NIM API with a cheap, reliably-available model.
 * Uses meta/llama-3.3-70b-instruct — NOT kimi or minimax, which hang
 * with HTTP 000 on standard-tier NIM accounts (entitlement required).
 */
async function verifyNvidiaKey(key) {
    try {
        const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(10_000),
            body: JSON.stringify({
                model: 'meta/llama-3.3-70b-instruct',
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 3,
                stream: false,
            }),
        });
        if (res.ok)
            return true;
        const errText = await res.text().catch(() => '');
        return `HTTP ${res.status}${errText ? `: ${errText.slice(0, 80)}` : ''}`;
    }
    catch (err) {
        const e = err;
        if (e?.name === 'TimeoutError' || e?.message?.includes('abort'))
            return 'timeout';
        return e?.message ?? 'unknown error';
    }
}
function usage() {
    return [
        'usage:',
        '  dirgha keys list                       List env + stored + pool (masked)',
        '  dirgha keys set <ENV> <value>          Set the legacy single-slot key',
        '  dirgha keys get <ENV>                  Print the raw value (avoid)',
        '  dirgha keys clear <ENV|all>            Remove a key (or all)',
        '  dirgha keys pool add <ENV> <value> [--label=…] [--priority=N]',
        '                                         Add an entry to the multi-key pool',
        '  dirgha keys pool list [<ENV>]          List pool entries (masked)',
        '  dirgha keys pool remove <ENV> <id>     Drop one entry by short id',
        '  dirgha keys pool clear <ENV>           Drop every entry for one provider',
        `known: ${KNOWN_PROVIDERS.slice(0, 6).join(', ')} … (+${KNOWN_PROVIDERS.length - 6} more)`,
    ].join('\n');
}
async function runList() {
    const store = await read();
    const pool = await readPool();
    const all = new Set([...KNOWN_PROVIDERS, ...Object.keys(store), ...Object.keys(pool)]);
    stdout.write(`${style(defaultTheme.accent, 'BYOK keys')}\n`);
    for (const env of [...all].sort()) {
        const stored = store[env];
        const envInherit = process.env[env];
        const poolCount = (pool[env] ?? []).length;
        const provider = findProviderByEnv(env);
        const head = `  ${env.padEnd(24)}`;
        let state;
        if (poolCount > 0) {
            state = style(defaultTheme.success, `pool×${poolCount}  ${mask(pool[env][0].value)}`);
        }
        else if (stored) {
            state = style(defaultTheme.success, `stored  ${mask(stored)}`);
        }
        else if (envInherit) {
            state = style(defaultTheme.muted, `env     ${mask(envInherit)}`);
        }
        else {
            state = style(defaultTheme.muted, 'unset');
        }
        const tag = provider ? style(defaultTheme.muted, `  (${provider.displayName})`) : '';
        stdout.write(`${head}${state}${tag}\n`);
    }
    stdout.write(`\n${style(defaultTheme.muted, `legacy: ${keyPath()}`)}\n`);
    stdout.write(`${style(defaultTheme.muted, `pool:   ${join(homedir(), '.dirgha', 'keypool.json')}`)}\n`);
    return 0;
}
function parseLabel(argv) {
    const flag = argv.find(a => a.startsWith('--label='));
    return flag?.split('=', 2)[1];
}
function parsePriority(argv) {
    const flag = argv.find(a => a.startsWith('--priority='));
    if (!flag)
        return undefined;
    const n = Number.parseInt(flag.split('=', 2)[1] ?? '', 10);
    return Number.isFinite(n) ? n : undefined;
}
async function runPool(args) {
    const sub = args[0] ?? 'list';
    if (sub === 'list') {
        const envFilter = args[1]?.toUpperCase();
        const pool = await readPool();
        const keys = envFilter ? [envFilter] : Object.keys(pool).sort();
        if (keys.length === 0) {
            stdout.write(style(defaultTheme.muted, '(no pool entries — `dirgha keys pool add <ENV> <value>`)\n'));
            return 0;
        }
        for (const env of keys) {
            const list = pool[env] ?? [];
            stdout.write(style(defaultTheme.accent, `\n${env}\n`));
            if (list.length === 0) {
                stdout.write(style(defaultTheme.muted, '  (no entries)\n'));
                continue;
            }
            for (const e of list) {
                const state = e.exhaustedUntil && new Date(e.exhaustedUntil) > new Date()
                    ? style(defaultTheme.muted, `cooldown until ${e.exhaustedUntil.slice(0, 19)}`)
                    : style(defaultTheme.success, 'live');
                stdout.write(`  ${e.id}  prio=${e.priority}  ${e.label.padEnd(16).slice(0, 16)}  ${mask(e.value)}  ${state}\n`);
            }
        }
        return 0;
    }
    if (sub === 'add') {
        const envName = (args[1] ?? '').toUpperCase();
        const value = args[2];
        if (!envName || !value) {
            stderr.write(`${usage()}\n`);
            return 1;
        }
        const entry = await addEntry(envName, value, { label: parseLabel(args), priority: parsePriority(args) });
        stdout.write(`${style(defaultTheme.success, '✓')} pool[${envName}] += ${entry.label} (id=${entry.id}, prio=${entry.priority})\n`);
        return 0;
    }
    if (sub === 'remove') {
        const envName = (args[1] ?? '').toUpperCase();
        const id = args[2];
        if (!envName || !id) {
            stderr.write(`${usage()}\n`);
            return 1;
        }
        const ok = await removeEntry(envName, id);
        if (!ok) {
            stderr.write(`No entry ${id} in ${envName}.\n`);
            return 1;
        }
        stdout.write(`${style(defaultTheme.success, '✓')} removed ${id} from ${envName}\n`);
        return 0;
    }
    if (sub === 'clear') {
        const envName = (args[1] ?? '').toUpperCase();
        if (!envName) {
            stderr.write(`${usage()}\n`);
            return 1;
        }
        const n = await clearProvider(envName);
        stdout.write(`${style(defaultTheme.success, '✓')} cleared ${n} entr${n === 1 ? 'y' : 'ies'} from ${envName}\n`);
        return 0;
    }
    stderr.write(`unknown pool subcommand "${sub}"\n${usage()}\n`);
    return 1;
}
export const keysSubcommand = {
    name: 'keys',
    description: 'Manage BYOK API keys at ~/.dirgha/keys.json',
    async run(argv) {
        const [op, envVar, value] = argv;
        if (!op || op === 'list')
            return runList();
        if (op === 'pool')
            return runPool(argv.slice(1));
        if (op === 'set') {
            if (!envVar || !value) {
                stderr.write(`${usage()}\n`);
                return 1;
            }
            const store = await read();
            store[envVar] = value;
            await write(store);
            stdout.write(`${style(defaultTheme.success, '✓')} stored ${envVar} (${mask(value)})\n`);
            // NVIDIA key: probe with llama-3.3-70b (not kimi/minimax — they hang on standard NIM tier)
            if (envVar === 'NVIDIA_API_KEY' || envVar === 'NVIDIA_API_KEY_2') {
                stdout.write(style(defaultTheme.muted, '  verifying key against NVIDIA NIM…\n'));
                const verified = await verifyNvidiaKey(value);
                if (verified === true) {
                    stdout.write(`${style(defaultTheme.success, '  ✓ NIM reachable — key is valid')}\n`);
                }
                else if (verified === 'timeout') {
                    stdout.write(`${style(defaultTheme.muted, '  key saved (could not verify — NVIDIA NIM timeout)')}\n`);
                }
                else {
                    stdout.write(`${style(defaultTheme.muted, `  warning: key check failed (${verified}) — key saved anyway`)}\n`);
                }
            }
            return 0;
        }
        if (op === 'get') {
            if (!envVar) {
                stderr.write(`${usage()}\n`);
                return 1;
            }
            const store = await read();
            const v = store[envVar] ?? process.env[envVar];
            if (!v) {
                stderr.write(`${envVar} is not set.\n`);
                return 1;
            }
            stdout.write(`${v}\n`);
            return 0;
        }
        if (op === 'clear') {
            if (!envVar) {
                stderr.write(`${usage()}\n`);
                return 1;
            }
            if (envVar === 'all') {
                await write({});
                stdout.write(`${style(defaultTheme.success, '✓')} cleared every stored key\n`);
                return 0;
            }
            const store = await read();
            if (!(envVar in store)) {
                stderr.write(`${envVar} is not set.\n`);
                return 1;
            }
            delete store[envVar];
            await write(store);
            stdout.write(`${style(defaultTheme.success, '✓')} cleared ${envVar}\n`);
            return 0;
        }
        stderr.write(`unknown subcommand "${op}"\n${usage()}\n`);
        return 1;
    },
};
//# sourceMappingURL=keys.js.map