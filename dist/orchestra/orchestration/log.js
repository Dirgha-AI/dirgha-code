/**
 * orchestra/orchestration/log.ts — Structured NDJSON orchestration log.
 *
 * Every agent event (spawn, output, exit, error, watcher) is written as
 * a newline-delimited JSON line to /tmp/orchestra-{sessionId}.ndjson.
 * This is the single source of truth for observability — the TUI reads
 * this file for replay, the web bridge streams it, and the CLI tails it.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/** Return the log file path for a session. */
export function logPath(sessionId) {
    return join(tmpdir(), `orchestra-${sessionId}.ndjson`);
}
/** Create a fresh log file (overwrites any existing). */
export function createLog(sessionId) {
    const path = logPath(sessionId);
    const dir = tmpdir();
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    writeFileSync(path, "", "utf-8");
    return path;
}
/** Append a single log entry to the session log. */
export function appendLog(entry) {
    try {
        const path = logPath(entry.sessionId);
        appendFileSync(path, JSON.stringify(entry) + "\n", "utf-8");
    }
    catch {
        // Non-fatal — log writes must never crash the orchestrator.
    }
}
/** Convenience: build and write a structured entry in one call. */
export function writeLog(sessionId, agentId, event, payload = {}) {
    appendLog({
        timestamp: new Date().toISOString(),
        sessionId,
        agentId,
        event,
        payload,
    });
}
/** Read all entries from a session log file. */
export function readLog(sessionId) {
    try {
        const path = logPath(sessionId);
        if (!existsSync(path))
            return [];
        const raw = readFileSync(path, "utf-8");
        return raw
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    }
    catch {
        return [];
    }
}
/** Stream log entries matching a filter (returns latest N). */
export function tailLog(sessionId, n = 50, filter) {
    const all = readLog(sessionId);
    const filtered = filter ? all.filter(filter) : all;
    return filtered.slice(-n);
}
//# sourceMappingURL=log.js.map