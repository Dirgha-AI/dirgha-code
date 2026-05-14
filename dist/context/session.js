/**
 * Append-only session log, persisted as JSONL. Crash-safe: every append
 * is a single fs.appendFile call; partial last lines on replay are
 * ignored silently. A session is identified by its id; the canonical
 * file path derives from the id plus the store's base directory.
 */
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { createReadStream } from "node:fs";
import { dbOpenSession, dbAppendMessage, dbCloseSession, dbReadSnapshot } from "../state/db.js";
export class SessionStore {
    dir;
    constructor(dir = join(homedir(), ".dirgha", "sessions")) {
        this.dir = dir;
    }
    async create(id) {
        await this.ensure();
        const path = join(this.dir, `${id}.jsonl`);
        const exists = await stat(path)
            .then(() => true)
            .catch(() => false);
        if (!exists)
            await writeFile(path, "", "utf8");
        void Promise.resolve().then(() => dbOpenSession(id));
        return new SessionImpl(id, path);
    }
    async open(id) {
        const path = join(this.dir, `${id}.jsonl`);
        const exists = await stat(path)
            .then(() => true)
            .catch(() => false);
        if (!exists)
            return undefined;
        const impl = new SessionImpl(id, path);
        // Best-effort: reconcile SQLite mirror against JSONL on open.
        void Promise.resolve().then(() => impl.reconcile());
        return impl;
    }
    async list() {
        await this.ensure();
        const { readdir } = await import("node:fs/promises");
        const names = await readdir(this.dir).catch(() => []);
        return names
            .filter((n) => n.endsWith(".jsonl"))
            .map((n) => n.replace(/\.jsonl$/, ""));
    }
    async ensure() {
        const info = await stat(this.dir).catch(() => undefined);
        if (!info)
            await mkdir(this.dir, { recursive: true });
    }
}
class SessionImpl {
    id;
    path;
    constructor(id, path) {
        this.id = id;
        this.path = path;
    }
    async append(entry) {
        await appendFile(this.path, `${JSON.stringify(entry)}\n`, "utf8");
        if (entry.type === "message") {
            void Promise.resolve().then(() => dbAppendMessage(this.id, entry.message));
        }
    }
    close() {
        dbCloseSession(this.id);
    }
    async *replay() {
        const content = await readFile(this.path, "utf8").catch(() => "");
        for (const line of content.split("\n")) {
            if (!line.trim())
                continue;
            try {
                yield JSON.parse(line);
            }
            catch {
                continue;
            }
        }
    }
    async getCompactionThreshold() {
        // Returns the keptFrom timestamp of the LATEST compaction entry, or null if none.
        let latest = null;
        for await (const entry of this.replay()) {
            if (entry.type === 'compaction')
                latest = entry.keptFrom;
        }
        return latest;
    }
    async messages() {
        // Snapshot fast-load: if SQLite has a snapshot for this session, use it
        // as the base and only replay JSONL entries with ts > snapshot.ts.
        const snapshot = dbReadSnapshot(this.id);
        if (snapshot) {
            const tail = [];
            for await (const entry of this.replay()) {
                if (entry.type !== 'message')
                    continue;
                if (entry.ts <= snapshot.ts)
                    continue;
                tail.push(entry.message);
            }
            return [...snapshot.messages, ...tail];
        }
        // No snapshot: fall back to compaction-aware full replay. Two passes:
        // 1) find the latest compaction threshold, 2) yield messages with
        // ts >= threshold.
        const threshold = await this.getCompactionThreshold();
        const out = [];
        for await (const entry of this.replay()) {
            if (entry.type !== 'message')
                continue;
            if (threshold && entry.ts < threshold)
                continue;
            out.push(entry.message);
        }
        return out;
    }
    async writeSnapshot(messages) {
        try {
            const { dbWriteSnapshot } = await import('../state/db.js');
            dbWriteSnapshot(this.id, new Date().toISOString(), messages);
        }
        catch {
            /* best-effort */
        }
    }
    async reconcile() {
        // Compare JSONL message count to SQLite message count for this session.
        // If they differ, truncate the SQLite session and reinsert from JSONL.
        // The JSONL is the source of truth. Best-effort: swallow all errors.
        try {
            const { dbCountSessionMessages, dbReplaceSessionMessages } = await import('../state/db.js');
            const jsonlMsgs = [];
            for await (const entry of this.replay()) {
                if (entry.type === 'message')
                    jsonlMsgs.push(entry.message);
            }
            const sqliteCount = dbCountSessionMessages(this.id);
            if (sqliteCount !== jsonlMsgs.length) {
                dbReplaceSessionMessages(this.id, jsonlMsgs);
            }
        }
        catch {
            /* best-effort: don't crash session open */
        }
    }
    async replayAll() {
        const results = [];
        for await (const entry of this.replay()) {
            results.push(entry);
        }
        return results;
    }
}
export function createSessionStore(opts = {}) {
    return new SessionStore(opts.directory);
}
export async function streamJsonl(path, onLine) {
    return new Promise((resolve, reject) => {
        const stream = createReadStream(path, { encoding: "utf8" });
        let buffer = "";
        stream.on("data", (chunk) => {
            buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
            let idx;
            while ((idx = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 1);
                if (!line.trim())
                    continue;
                try {
                    onLine(JSON.parse(line));
                }
                catch {
                    /* skip */
                }
            }
        });
        stream.on("end", () => {
            if (buffer.trim()) {
                try {
                    onLine(JSON.parse(buffer));
                }
                catch {
                    /* skip */
                }
            }
            resolve();
        });
        stream.on("error", reject);
    });
}
//# sourceMappingURL=session.js.map