/**
 * BYOK key store. The `dirgha keys` subcommand writes provider API keys
 * to `~/.dirgha/keys.json` (mode 0600). Without this loader, those keys
 * never reach the provider classes — every provider reads
 * `process.env.<NAME>_API_KEY`, so we hydrate the env on startup.
 *
 * Real env vars take precedence over the file — letting users override
 * a stored key for one invocation by exporting in the shell.
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
export function keyStorePath() {
    return join(homedir(), '.dirgha', 'keys.json');
}
export async function readKeyStore(path = keyStorePath()) {
    const text = await readFile(path, 'utf8').catch(() => '');
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return {};
    }
}
/**
 * Read `~/.dirgha/keys.json` and copy each entry into `process.env` if
 * (and only if) the env var is not already set. Returns the list of
 * names that were hydrated (useful for `--verbose` startup logs).
 */
export async function hydrateEnvFromKeyStore(env = process.env, path = keyStorePath()) {
    const store = await readKeyStore(path);
    const hydrated = [];
    for (const [name, value] of Object.entries(store)) {
        if (typeof value !== 'string' || value.length === 0)
            continue;
        if (env[name] === undefined || env[name] === '') {
            env[name] = value;
            hydrated.push(name);
        }
    }
    return hydrated;
}
/** Persist a single key to ~/.dirgha/keys.json and hydrate process.env immediately. */
export async function saveKey(envVar, value, path = keyStorePath()) {
    const store = await readKeyStore(path);
    store[envVar] = value;
    await mkdir(join(homedir(), '.dirgha'), { recursive: true });
    await writeFile(path, JSON.stringify(store, null, 2) + '\n', 'utf8');
    try {
        await chmod(path, 0o600);
    }
    catch { /* non-POSIX (Windows) */ }
    process.env[envVar] = value;
}
//# sourceMappingURL=keystore.js.map