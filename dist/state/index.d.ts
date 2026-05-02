/**
 * Unified state index. Maintains ~/.dirgha/state-index.json that
 * cross-references sessions, checkpoints, and cron jobs by session ID.
 * All writes are atomic (write to tmp, rename).
 */
export interface StateEntry {
    sessionId: string;
    startedAt: string;
    model?: string;
    checkpointIds: string[];
    cronJobIds: string[];
    endedAt?: string;
}
export interface StateIndex {
    version: 1;
    sessions: Record<string, StateEntry>;
}
export declare function registerSession(sessionId: string, model?: string): Promise<void>;
export declare function registerCheckpoint(sessionId: string, checkpointId: string): Promise<void>;
export declare function registerCronJob(sessionId: string | undefined, jobId: string): Promise<void>;
export declare function closeSession(sessionId: string): Promise<void>;
export declare function querySession(sessionId: string): Promise<StateEntry | null>;
export declare function listSessions(limit?: number): Promise<StateEntry[]>;
