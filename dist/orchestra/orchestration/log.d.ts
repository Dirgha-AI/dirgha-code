/**
 * orchestra/orchestration/log.ts — Structured NDJSON orchestration log.
 *
 * Every agent event (spawn, output, exit, error, watcher) is written as
 * a newline-delimited JSON line to /tmp/orchestra-{sessionId}.ndjson.
 * This is the single source of truth for observability — the TUI reads
 * this file for replay, the web bridge streams it, and the CLI tails it.
 */
import type { LogEntry } from "../core/types.js";
/** Return the log file path for a session. */
export declare function logPath(sessionId: string): string;
/** Create a fresh log file (overwrites any existing). */
export declare function createLog(sessionId: string): string;
/** Append a single log entry to the session log. */
export declare function appendLog(entry: LogEntry): void;
/** Convenience: build and write a structured entry in one call. */
export declare function writeLog(sessionId: string, agentId: string, event: LogEntry["event"], payload?: Record<string, unknown>): void;
/** Read all entries from a session log file. */
export declare function readLog(sessionId: string): LogEntry[];
/** Stream log entries matching a filter (returns latest N). */
export declare function tailLog(sessionId: string, n?: number, filter?: (e: LogEntry) => boolean): LogEntry[];
