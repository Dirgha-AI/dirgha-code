/**
 * DB write telemetry.
 *
 * Tracks SQLite write failures so they are not silently swallowed.
 * Stores counts in ~/.dirgha/state.json under `dbErrors`. When 10+
 * errors accumulate in a single process lifetime, a warning is
 * written to stderr so the user knows session data may not persist.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const DIRGHA_DIR = join(homedir(), ".dirgha");
const STATE_PATH = join(DIRGHA_DIR, "state.json");
let telemetry = {
    totalWrites: 0,
    failedWrites: 0,
    lastError: "",
    lastErrorTime: "",
};
let warned = false;
let loaded = false;
async function ensureLoaded() {
    if (loaded)
        return;
    loaded = true;
    await loadDbTelemetry();
}
async function persist() {
    try {
        await mkdir(DIRGHA_DIR, { recursive: true });
        let existing = {};
        try {
            const raw = await readFile(STATE_PATH, "utf8");
            existing = JSON.parse(raw);
        }
        catch {
            /* first write */
        }
        existing.dbErrors = {
            totalWrites: telemetry.totalWrites,
            failedWrites: telemetry.failedWrites,
            lastError: telemetry.lastError,
            lastErrorTime: telemetry.lastErrorTime,
        };
        await writeFile(STATE_PATH, JSON.stringify(existing, null, 2), "utf8");
    }
    catch {
        /* best-effort; don't recurse on persist failure */
    }
}
let persistTimer = null;
function schedulePersist() {
    if (persistTimer)
        clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        persistTimer = null;
        void persist();
    }, 5000);
}
export function recordDbError(err) {
    void ensureLoaded();
    telemetry.totalWrites++;
    telemetry.failedWrites++;
    telemetry.lastError = err instanceof Error ? err.message : String(err);
    telemetry.lastErrorTime = new Date().toISOString();
    if (!warned && telemetry.failedWrites >= 10) {
        warned = true;
        process.stderr.write("[Dirgha] DB writes failing — session data may not persist.\n");
    }
    schedulePersist();
}
export function recordDbSuccess() {
    void ensureLoaded();
    telemetry.totalWrites++;
    schedulePersist();
}
export function getDbErrorCount() {
    void ensureLoaded();
    return telemetry.failedWrites;
}
export function getDbTelemetry() {
    void ensureLoaded();
    return { ...telemetry };
}
export async function flushDbTelemetry() {
    if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
    }
    await persist();
}
export async function loadDbTelemetry() {
    try {
        await mkdir(DIRGHA_DIR, { recursive: true });
        const raw = await readFile(STATE_PATH, "utf8");
        const existing = JSON.parse(raw);
        const dbErrors = existing.dbErrors;
        if (dbErrors) {
            telemetry = { ...dbErrors };
        }
    }
    catch {
        /* no prior state */
    }
}
//# sourceMappingURL=db-telemetry.js.map