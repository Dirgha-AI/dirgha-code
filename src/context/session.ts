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
import type { Message, UsageTotal } from "../kernel/types.js";
import { dbOpenSession, dbAppendMessage, dbCloseSession } from "../state/db.js";

export type SessionEntry =
  | { type: "message"; ts: string; message: Message }
  | { type: "usage"; ts: string; usage: UsageTotal }
  | { type: "model_change"; ts: string; from: string; to: string }
  | { type: "compaction"; ts: string; keptFrom: string; summary: string }
  | { type: "branch"; ts: string; parentId: string; name: string }
  // Session label used in the terminal title (OSC 0), the future
  // `/sessions` list, and the JSONL filename's display name. The
  // model emits a `[session-title] X` marker on its first response;
  // the projection extracts it and the TUI persists it here.
  | { type: "title"; ts: string; title: string }
  | {
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
  getCompactionThreshold(): Promise<string | null>;
  reconcile(): Promise<void>;
  close(): void;
}

export interface SessionStoreOptions {
  directory?: string;
}

export class SessionStore {
  constructor(
    private readonly dir: string = join(homedir(), ".dirgha", "sessions"),
  ) {}

  async create(id: string): Promise<Session> {
    await this.ensure();
    const path = join(this.dir, `${id}.jsonl`);
    const exists = await stat(path)
      .then(() => true)
      .catch(() => false);
    if (!exists) await writeFile(path, "", "utf8");
    void Promise.resolve().then(() => dbOpenSession(id));
    return new SessionImpl(id, path);
  }

  async open(id: string): Promise<Session | undefined> {
    const path = join(this.dir, `${id}.jsonl`);
    const exists = await stat(path)
      .then(() => true)
      .catch(() => false);
    if (!exists) return undefined;
    const impl = new SessionImpl(id, path);
    // Best-effort: reconcile SQLite mirror against JSONL on open.
    void Promise.resolve().then(() => impl.reconcile());
    return impl;
  }

  async list(): Promise<string[]> {
    await this.ensure();
    const { readdir } = await import("node:fs/promises");
    const names = await readdir(this.dir).catch(() => [] as string[]);
    return names
      .filter((n) => n.endsWith(".jsonl"))
      .map((n) => n.replace(/\.jsonl$/, ""));
  }

  private async ensure(): Promise<void> {
    const info = await stat(this.dir).catch(() => undefined);
    if (!info) await mkdir(this.dir, { recursive: true });
  }
}

class SessionImpl implements Session {
  constructor(
    readonly id: string,
    readonly path: string,
  ) {}

  async append(entry: SessionEntry): Promise<void> {
    await appendFile(this.path, `${JSON.stringify(entry)}\n`, "utf8");
    if (entry.type === "message") {
      void Promise.resolve().then(() =>
        dbAppendMessage(this.id, entry.message),
      );
    }
  }

  close(): void {
    dbCloseSession(this.id);
  }

  async *replay(): AsyncIterable<SessionEntry> {
    const content = await readFile(this.path, "utf8").catch(() => "");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as SessionEntry;
      } catch {
        continue;
      }
    }
  }

  async getCompactionThreshold(): Promise<string | null> {
    // Returns the keptFrom timestamp of the LATEST compaction entry, or null if none.
    let latest: string | null = null;
    for await (const entry of this.replay()) {
      if (entry.type === 'compaction') latest = entry.keptFrom;
    }
    return latest;
  }

  async messages(): Promise<Message[]> {
    // Two-pass: find the latest compaction threshold, then yield messages
    // with ts >= threshold. Messages with type 'system' and 'title' entries
    // are NOT filtered because they may carry essential context (system
    // prompt, session title). The compaction summary message itself is
    // emitted by the agent loop as a regular message AFTER writing the
    // compaction entry, so it lands after keptFrom and survives.
    const threshold = await this.getCompactionThreshold();
    const out: Message[] = [];
    for await (const entry of this.replay()) {
      if (entry.type !== 'message') continue;
      if (threshold && entry.ts < threshold) continue;
      out.push(entry.message);
    }
    return out;
  }

  async reconcile(): Promise<void> {
    // Compare JSONL message count to SQLite message count for this session.
    // If they differ, truncate the SQLite session and reinsert from JSONL.
    // The JSONL is the source of truth. Best-effort: swallow all errors.
    try {
      const { dbCountSessionMessages, dbReplaceSessionMessages } = await import('../state/db.js');
      const jsonlMsgs: Message[] = [];
      for await (const entry of this.replay()) {
        if (entry.type === 'message') jsonlMsgs.push(entry.message);
      }
      const sqliteCount = dbCountSessionMessages(this.id);
      if (sqliteCount !== jsonlMsgs.length) {
        dbReplaceSessionMessages(this.id, jsonlMsgs);
      }
    } catch {
      /* best-effort: don't crash session open */
    }
  }

  async replayAll(): Promise<SessionEntry[]> {
    const results: SessionEntry[] = [];
    for await (const entry of this.replay()) {
      results.push(entry);
    }
    return results;
  }
}

export function createSessionStore(
  opts: SessionStoreOptions = {},
): SessionStore {
  return new SessionStore(opts.directory);
}

export async function streamJsonl(
  path: string,
  onLine: (entry: SessionEntry) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(path, { encoding: "utf8" });
    let buffer = "";
    stream.on("data", (chunk: string | Buffer) => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          onLine(JSON.parse(line) as SessionEntry);
        } catch {
          /* skip */
        }
      }
    });
    stream.on("end", () => {
      if (buffer.trim()) {
        try {
          onLine(JSON.parse(buffer) as SessionEntry);
        } catch {
          /* skip */
        }
      }
      resolve();
    });
    stream.on("error", reject);
  });
}
