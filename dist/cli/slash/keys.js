/**
 * /keys — list, set, or clear provider API keys persisted at
 * ~/.dirgha/keys.json. This is BYOK storage used by the setup wizard
 * and read on start-up so keys survive across shells without touching
 * ~/.bashrc. Values are masked on display.
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const KNOWN_PROVIDERS = [
    'NVIDIA_API_KEY',
    'OPENROUTER_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'FIREWORKS_API_KEY',
];
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
function usage() {
    return [
        'Usage:',
        '  /keys                        List stored keys (masked)',
        '  /keys set <ENV> <value>      Set a provider key',
        '  /keys clear <ENV>            Remove a key',
        '  /keys clear all              Remove every key',
        `Known ENV vars: ${KNOWN_PROVIDERS.join(', ')}`,
    ].join('\n');
}
export const keysCommand = {
    name: 'keys',
    description: 'Manage BYOK API keys at ~/.dirgha/keys.json',
    async execute(args) {
        const [op, envVar, value] = args;
        const store = await read();
        if (!op || op === 'list') {
            const all = new Set([...KNOWN_PROVIDERS, ...Object.keys(store)]);
            const lines = ['Stored keys:'];
            for (const key of [...all].sort()) {
                const stored = store[key];
                const envInherit = process.env[key];
                const state = stored
                    ? `stored  ${mask(stored)}`
                    : envInherit
                        ? `env     ${mask(envInherit)}`
                        : 'unset';
                lines.push(`  ${key.padEnd(22)}  ${state}`);
            }
            lines.push(`\nFile: ${keyPath()}`);
            return lines.join('\n');
        }
        if (op === 'set') {
            if (!envVar || !value)
                return `Missing argument.\n${usage()}`;
            store[envVar] = value;
            await write(store);
            return `Stored ${envVar} (${mask(value)}).`;
        }
        if (op === 'clear') {
            if (!envVar)
                return `Missing argument.\n${usage()}`;
            if (envVar === 'all') {
                await write({});
                return 'Cleared every stored key.';
            }
            if (!(envVar in store))
                return `${envVar} is not set.`;
            delete store[envVar];
            await write(store);
            return `Cleared ${envVar}.`;
        }
        return `Unknown subcommand "${op}".\n${usage()}`;
    },
};
//# sourceMappingURL=keys.js.map