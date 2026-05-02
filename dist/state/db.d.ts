/**
 * Local SQLite chat database.
 *
 * Stores messages from all sessions in a queryable SQLite database at
 * ~/.dirgha/dirgha.db. Runs alongside the existing JSONL session store
 * (which remains the source of truth for replay). The DB adds search,
 * history browsing, and analytics that JSONL can't support.
 *
 * Uses better-sqlite3 for synchronous, zero-config SQLite.
 */
import type { Message } from "../kernel/types.js";
export declare function dbOpenSession(id: string, model?: string, cwd?: string): void;
export declare function dbCloseSession(id: string): void;
export declare function dbAppendMessage(sessionId: string, message: Message): void;
export interface ChatResult {
    sessionId: string;
    role: string;
    content: string;
    ts: number;
}
export declare function dbSearchChats(query: string, limit?: number): ChatResult[];
export declare function isSqliteAvailable(): boolean;
export declare function dbListSessions(limit?: number): Array<{
    id: string;
    model: string | null;
    started_at: number;
    ended_at: number | null;
    messageCount: number;
}>;
