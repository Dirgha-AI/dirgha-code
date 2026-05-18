/**
 * orchestra/core/store.ts — Orchestration state persistence.
 *
 * Persists sessions to ~/.dirgha/orchestra.json so they survive CLI restarts.
 * P1 enhancement: SQLite-backed with history replay.
 */
import type { OrchestraSession } from "./types.js";
export interface PersistedStore {
    version: number;
    sessions: OrchestraSession[];
}
export declare function loadSessions(): OrchestraSession[];
export declare function saveSessions(sessions: OrchestraSession[]): void;
export declare function appendSession(session: OrchestraSession): void;
export declare function removeStoredSession(id: string): void;
