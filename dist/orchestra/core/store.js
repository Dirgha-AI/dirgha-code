/**
 * orchestra/core/store.ts — Orchestration state persistence.
 *
 * Persists sessions to ~/.dirgha/orchestra.json so they survive CLI restarts.
 * P1 enhancement: SQLite-backed with history replay.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const STORE_DIR = join(homedir(), ".dirgha");
const STORE_FILE = join(STORE_DIR, "orchestra.json");
function ensureDir() {
    if (!existsSync(STORE_DIR)) {
        mkdirSync(STORE_DIR, { recursive: true });
    }
}
export function loadSessions() {
    try {
        ensureDir();
        if (!existsSync(STORE_FILE))
            return [];
        const raw = readFileSync(STORE_FILE, "utf-8");
        const store = JSON.parse(raw);
        return store.sessions ?? [];
    }
    catch {
        return [];
    }
}
export function saveSessions(sessions) {
    ensureDir();
    const store = { version: 1, sessions };
    writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}
export function appendSession(session) {
    const existing = loadSessions().filter((s) => s.id !== session.id);
    existing.push(session);
    saveSessions(existing);
}
export function removeStoredSession(id) {
    const existing = loadSessions().filter((s) => s.id !== id);
    saveSessions(existing);
}
//# sourceMappingURL=store.js.map