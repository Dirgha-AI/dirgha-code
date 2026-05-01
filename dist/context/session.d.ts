/**
 * Append-only session log, persisted as JSONL. Crash-safe: every append
 * is a single fs.appendFile call; partial last lines on replay are
 * ignored silently. A session is identified by its id; the canonical
 * file path derives from the id plus the store's base directory.
 */
import type { Message, UsageTotal } from "../kernel/types.js";
export type SessionEntry = {
    type: "message";
    ts: string;
    message: Message;
} | {
    type: "usage";
    ts: string;
    usage: UsageTotal;
} | {
    type: "model_change";
    ts: string;
    from: string;
    to: string;
} | {
    type: "compaction";
    ts: string;
    keptFrom: string;
    summary: string;
} | {
    type: "branch";
    ts: string;
    parentId: string;
    name: string;
} | {
    type: "system";
    ts: string;
    event: string;
    data?: Record<string, unknown>;
};
export interface Session {
    readonly id: string;
    readonly path: string;
    append(entry: SessionEntry): Promise<void>;
    replay(): AsyncIterable<SessionEntry>;
    replayAll(): Promise<SessionEntry[]>;
    messages(): Promise<Message[]>;
}
export interface SessionStoreOptions {
    directory?: string;
}
export declare class SessionStore {
    private readonly dir;
    constructor(dir?: string);
    create(id: string): Promise<Session>;
    open(id: string): Promise<Session | undefined>;
    list(): Promise<string[]>;
    private ensure;
}
export declare function createSessionStore(opts?: SessionStoreOptions): SessionStore;
export declare function streamJsonl(path: string, onLine: (entry: SessionEntry) => void): Promise<void>;
