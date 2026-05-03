/**
 * Multi-key BYOK pool — multiple credentials per provider with
 * priority + cooldown so a 429'd free-tier key cycles out and a
 * higher-priority paid key takes over without restarting the CLI.
 *
 * Each provider can hold N credentials with labels + priority. The
 * runtime picks the highest-priority entry that hasn't been marked
 * exhausted (e.g. by a 429 from a free-tier quota). When all entries
 * are exhausted the pool falls back to env vars.
 *
 * Storage: `~/.dirgha/keypool.json` (mode 0600).
 *
 * Schema:
 *   {
 *     "OPENROUTER_API_KEY": [
 *       { "id": "<hex>", "value": "...", "label": "primary", "priority": 0,
 *         "addedAt": "2026-04-25T...", "lastUsedAt": null,
 *         "exhaustedUntil": null }
 *     ]
 *   }
 *
 * Concurrent writes are serialised by a sibling lock file
 * `~/.dirgha/keypool.json.lock`. Stale locks (older than 30 s) are
 * stolen so a crashed CLI can't wedge the file forever.
 */
import { chmod, mkdir, readFile, writeFile, stat, unlink, rename, } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
const LOCK_TIMEOUT_MS = 30_000;
export function poolPath(home = homedir()) {
    return join(home, ".dirgha", "keypool.json");
}
function lockPath(home = homedir()) {
    return join(home, ".dirgha", "keypool.json.lock");
}
async function acquireLock(home) {
    const lp = lockPath(home);
    await mkdir(join(home, ".dirgha"), { recursive: true });
    for (let attempt = 0; attempt < 30; attempt++) {
        try {
            await writeFile(lp, String(process.pid), { flag: "wx" });
            return async () => {
                await unlink(lp).catch(() => { });
            };
        }
        catch {
            const info = await stat(lp).catch(() => undefined);
            if (info && Date.now() - info.mtimeMs > LOCK_TIMEOUT_MS) {
                await unlink(lp).catch(() => { });
                continue;
            }
            await new Promise((r) => setTimeout(r, 100));
        }
    }
    const info = await stat(lp).catch(() => undefined);
    if (!info || Date.now() - info.mtimeMs > LOCK_TIMEOUT_MS) {
        await writeFile(lp, String(process.pid));
        return async () => {
            await unlink(lp).catch(() => { });
        };
    }
    throw new Error(`Could not acquire keypool lock after ${LOCK_TIMEOUT_MS}ms — lock held by another process`);
}
export async function readPool(home = homedir()) {
    const text = await readFile(poolPath(home), "utf8").catch(() => "");
    if (!text)
        return {};
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch {
        return {};
    }
}
async function writePool(pool, home = homedir()) {
    await mkdir(join(home, ".dirgha"), { recursive: true });
    const target = poolPath(home);
    const tmp = `${target}.tmp-${randomBytes(4).toString("hex")}`;
    await writeFile(tmp, JSON.stringify(pool, null, 2) + "\n", "utf8");
    try {
        await chmod(tmp, 0o600);
    }
    catch {
        /* non-POSIX */
    }
    await rename(tmp, target);
}
export async function addEntry(envName, value, opts = {}) {
    const home = opts.home ?? homedir();
    const release = await acquireLock(home);
    try {
        const pool = await readPool(home);
        const list = pool[envName] ?? [];
        const entry = {
            id: randomBytes(3).toString("hex"),
            value,
            label: opts.label ?? `key-${list.length + 1}`,
            priority: opts.priority ?? 0,
            addedAt: new Date().toISOString(),
            lastUsedAt: null,
            exhaustedUntil: null,
        };
        list.push(entry);
        pool[envName] = list;
        await writePool(pool, home);
        return entry;
    }
    finally {
        await release();
    }
}
export async function removeEntry(envName, id, home = homedir()) {
    const release = await acquireLock(home);
    try {
        const pool = await readPool(home);
        const list = pool[envName] ?? [];
        const next = list.filter((e) => e.id !== id);
        if (next.length === list.length)
            return false;
        if (next.length === 0)
            delete pool[envName];
        else
            pool[envName] = next;
        await writePool(pool, home);
        return true;
    }
    finally {
        await release();
    }
}
export async function clearProvider(envName, home = homedir()) {
    const release = await acquireLock(home);
    try {
        const pool = await readPool(home);
        const count = (pool[envName] ?? []).length;
        delete pool[envName];
        await writePool(pool, home);
        return count;
    }
    finally {
        await release();
    }
}
/**
 * Pick the highest-priority non-exhausted entry for a provider env name.
 * Returns undefined when no entry is usable; caller falls back to
 * process.env or the legacy single-key store.
 */
export function pickEntry(pool, envName, now = new Date()) {
    const list = pool[envName];
    if (!list || list.length === 0)
        return undefined;
    const live = list.filter((e) => !e.exhaustedUntil || new Date(e.exhaustedUntil) <= now);
    if (live.length === 0)
        return undefined;
    // Highest priority first; tie-break on least-recently-used so we
    // distribute load across same-priority entries.
    live.sort((a, b) => {
        if (b.priority !== a.priority)
            return b.priority - a.priority;
        const at = a.lastUsedAt ? Date.parse(a.lastUsedAt) : 0;
        const bt = b.lastUsedAt ? Date.parse(b.lastUsedAt) : 0;
        return at - bt;
    });
    return live[0];
}
/** Mark an entry exhausted until a wall-clock time (for 429 rate limits). */
export async function markExhausted(envName, id, untilIso, home = homedir()) {
    const release = await acquireLock(home);
    try {
        const pool = await readPool(home);
        const entry = (pool[envName] ?? []).find((e) => e.id === id);
        if (!entry)
            return;
        entry.exhaustedUntil = untilIso;
        await writePool(pool, home);
    }
    finally {
        await release();
    }
}
/** Stamp an entry's lastUsedAt to "now" (best-effort, never throws). */
export async function touchEntry(envName, id, home = homedir()) {
    const release = await acquireLock(home).catch(() => null);
    if (!release)
        return;
    try {
        const pool = await readPool(home);
        const entry = (pool[envName] ?? []).find((e) => e.id === id);
        if (!entry)
            return;
        entry.lastUsedAt = new Date().toISOString();
        await writePool(pool, home);
    }
    catch {
        /* swallow */
    }
    finally {
        await release();
    }
}
/**
 * Hydrate process.env from the pool. For each env name with at least
 * one usable entry, the highest-priority entry's value is exported
 * (only if env is currently unset — shell still wins). Returns the
 * list of names hydrated, mirroring keystore.ts so callers can swap
 * implementations.
 */
export async function hydrateEnvFromPool(env = process.env, home = homedir()) {
    const pool = await readPool(home);
    const hydrated = [];
    for (const envName of Object.keys(pool)) {
        if (env[envName] !== undefined && env[envName] !== "")
            continue;
        const pick = pickEntry(pool, envName);
        if (!pick)
            continue;
        env[envName] = pick.value;
        hydrated.push(envName);
    }
    return hydrated;
}
//# sourceMappingURL=keypool.js.map