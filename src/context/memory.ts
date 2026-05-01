/**
 * Long-term memory store. File-backed, one directory per user.
 *
 * Two public APIs, both live on the same underlying store:
 *
 *   1. The original `MemoryStore` (list/get/upsert/remove/search) —
 *      structured records with type/name/description/body. Kept
 *      verbatim for backwards compatibility.
 *
 *   2. The canonical L3 context contract `KeyedMemoryStore`
 *      (save/load/search/list/delete) — key-addressed markdown notes
 *      with frontmatter tags. This is what the agent loop, CLI
 *      `memory` commands, and the `memory` tool all use going forward.
 *
 * Both APIs share the same on-disk layout: `~/.dirgha/memory/{key}.md`
 * with YAML frontmatter. An optional SQLite FTS5 index at
 * `~/.dirgha/memory/index.db` accelerates `search` when better-sqlite3
 * is available; if not, we fall back to a substring scan.
 */

import {
  readFile,
  readdir,
  stat,
  writeFile,
  mkdir,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { openFtsIndex, fallbackSearch } from "./_fts.js";
import type { FtsIndex } from "./_fts.js";

export type MemoryType = "user" | "feedback" | "project" | "reference";

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  name: string;
  description: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Legacy structured API (unchanged public shape).
// ---------------------------------------------------------------------------

export interface MemoryStore {
  list(): Promise<MemoryEntry[]>;
  get(id: string): Promise<MemoryEntry | undefined>;
  upsert(entry: MemoryEntry): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: string): Promise<MemoryEntry[]>;
}

// ---------------------------------------------------------------------------
// Canonical L3 key/value API.
// ---------------------------------------------------------------------------

export interface MemoryHit {
  key: string;
  title: string;
  snippet: string;
  score: number;
}

export type MemoryValue =
  | string
  | { title?: string; content: string; tags?: string[] };

export interface KeyedMemoryStore {
  save(key: string, value: MemoryValue, tags?: string[]): Promise<void>;
  load(key: string): Promise<string | null>;
  search(query: string, limit?: number): Promise<MemoryHit[]>;
  list(): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export interface FileMemoryStoreOptions {
  directory?: string;
  /** Set to false to skip opening the FTS5 index (tests, read-only envs). */
  useFtsIndex?: boolean;
}

/** Legacy factory — returns the structured-record API used by existing callers. */
export function createMemoryStore(
  opts: FileMemoryStoreOptions = {},
): MemoryStore {
  return buildStore(opts);
}

/**
 * Canonical L3 factory — returns the key/value API described in the
 * experience spec. Both factories wrap the same on-disk store, so
 * callers may create either view safely.
 */
export function createKeyedMemoryStore(
  opts: FileMemoryStoreOptions = {},
): KeyedMemoryStore {
  return new KeyedAdapter(buildStore(opts));
}

function buildStore(opts: FileMemoryStoreOptions): FileMemoryStore {
  const dir = opts.directory ?? join(homedir(), ".dirgha", "memory");
  return new FileMemoryStore(dir, opts.useFtsIndex !== false);
}

export class FileMemoryStore implements MemoryStore {
  private ftsPromise: Promise<FtsIndex | null> | null = null;

  constructor(
    readonly dir: string,
    readonly ftsEnabled: boolean,
  ) {}

  async list(): Promise<MemoryEntry[]> {
    await this.ensure();
    const names = await readdir(this.dir).catch(() => [] as string[]);
    const entries: MemoryEntry[] = [];
    for (const name of names) {
      if (!name.endsWith(".md") || name === "MEMORY.md") continue;
      const id = name.replace(/\.md$/, "");
      const entry = await this.get(id);
      if (entry) entries.push(entry);
    }
    entries.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
    return entries;
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    const abs = this.pathFor(id);
    const text = await readFile(abs, "utf8").catch(() => undefined);
    if (!text) return undefined;
    return parseEntry(id, text);
  }

  async upsert(entry: MemoryEntry): Promise<void> {
    await this.ensure();
    const now = new Date().toISOString();
    const complete: MemoryEntry = {
      ...entry,
      createdAt: entry.createdAt || now,
      updatedAt: now,
    };
    await writeFile(this.pathFor(complete.id), renderEntry(complete), "utf8");
    await this.writeIndex();
    await this.reindex(complete);
  }

  async remove(id: string): Promise<void> {
    await unlink(this.pathFor(id)).catch(() => undefined);
    await this.writeIndex();
    const fts = await this.fts();
    fts?.remove(id);
  }

  async search(query: string): Promise<MemoryEntry[]> {
    const needle = query.toLowerCase();
    const all = await this.list();
    return all.filter(
      (e) =>
        e.name.toLowerCase().includes(needle) ||
        e.description.toLowerCase().includes(needle) ||
        e.body.toLowerCase().includes(needle),
    );
  }

  /** Ranked hit search used by `KeyedMemoryStore.search`. */
  async searchHits(query: string, limit: number): Promise<MemoryHit[]> {
    const fts = await this.fts();
    if (fts) {
      const hits = fts.search(query, limit);
      if (hits.length > 0) {
        return hits.map((h) => ({
          key: h.id,
          title: h.title,
          snippet: h.snippet,
          score: h.score,
        }));
      }
    }
    const entries = await this.list();
    const docs = entries.map((e) => ({
      id: e.id,
      title: e.name,
      body: e.body,
      tags: "",
    }));
    return fallbackSearch(docs, query, limit).map((h) => ({
      key: h.id,
      title: h.title,
      snippet: h.snippet,
      score: h.score,
    }));
  }

  private pathFor(id: string): string {
    return join(this.dir, `${id}.md`);
  }

  private async ensure(): Promise<void> {
    const info = await stat(this.dir).catch(() => undefined);
    if (!info) await mkdir(this.dir, { recursive: true });
  }

  private async writeIndex(): Promise<void> {
    const entries = await this.list();
    const lines = ["# Memory Index", ""];
    for (const e of entries) {
      lines.push(`- [${e.name}](${e.id}.md) — ${e.description}`);
    }
    await writeFile(
      join(this.dir, "MEMORY.md"),
      `${lines.join("\n")}\n`,
      "utf8",
    );
  }

  private fts(): Promise<FtsIndex | null> {
    if (!this.ftsEnabled) return Promise.resolve(null);
    if (!this.ftsPromise) {
      this.ftsPromise = openFtsIndex({
        dbPath: join(this.dir, "index.db"),
        namespace: "memory",
      });
    }
    return this.ftsPromise;
  }

  private async reindex(entry: MemoryEntry): Promise<void> {
    const fts = await this.fts();
    fts?.upsert({
      id: entry.id,
      title: entry.name,
      body: entry.body,
      tags: "",
    });
  }
}

/**
 * Adapter that exposes a `FileMemoryStore` through the keyed contract
 * (save/load/search/list/delete). Keeping the two interfaces on separate
 * objects avoids method-name collisions (both contracts define `search`
 * and `list` with different return shapes).
 */
class KeyedAdapter implements KeyedMemoryStore {
  constructor(private readonly inner: FileMemoryStore) {}

  async save(
    key: string,
    value: MemoryValue,
    tags: string[] = [],
  ): Promise<void> {
    assertValidKey(key);
    const resolvedValue = typeof value === "string" ? value : value.content;
    const resolvedTags =
      typeof value === "string" ? tags : (value.tags ?? tags);
    const resolvedTitle = typeof value === "string" ? undefined : value.title;
    const existing = await this.inner.get(key);
    const title = resolvedTitle ?? firstHeading(resolvedValue) ?? key;
    await this.inner.upsert({
      id: key,
      type: inferType(key, existing?.type),
      name: title,
      description: firstParagraph(resolvedValue) ?? "",
      body: ensureTagsBlock(resolvedValue, resolvedTags),
      createdAt: existing?.createdAt ?? "",
      updatedAt: "",
    });
  }

  async load(key: string): Promise<string | null> {
    const entry = await this.inner.get(key);
    return entry?.body ?? null;
  }

  async search(query: string, limit: number = 10): Promise<MemoryHit[]> {
    return this.inner.searchHits(query, Math.max(1, limit));
  }

  async list(): Promise<string[]> {
    const entries = await this.inner.list();
    return entries.map((e) => e.id);
  }

  async delete(key: string): Promise<void> {
    await this.inner.remove(key);
  }
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function renderEntry(entry: MemoryEntry): string {
  const frontmatter = [
    "---",
    `id: ${entry.id}`,
    `type: ${entry.type}`,
    `name: ${escapeValue(entry.name)}`,
    `description: ${escapeValue(entry.description)}`,
    `createdAt: ${entry.createdAt}`,
    `updatedAt: ${entry.updatedAt}`,
    "---",
    "",
  ].join("\n");
  return `${frontmatter}${entry.body}`;
}

function parseEntry(id: string, text: string): MemoryEntry | undefined {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return undefined;
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    meta[key] = unescapeValue(value);
  }
  const type = (meta.type as MemoryType) ?? "user";
  return {
    id: meta.id ?? id,
    type,
    name: meta.name ?? id,
    description: meta.description ?? "",
    body: match[2],
    createdAt: meta.createdAt ?? "",
    updatedAt: meta.updatedAt ?? "",
  };
}

function escapeValue(s: string): string {
  if (s.includes(":") || s.includes("\n")) return JSON.stringify(s);
  return s;
}

function unescapeValue(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }
  return s;
}

function assertValidKey(key: string): void {
  if (!key || !/^[a-zA-Z0-9][a-zA-Z0-9_\-.]*$/.test(key)) {
    throw new Error(
      `Invalid memory key "${key}". Use alphanumeric, dash, dot, underscore.`,
    );
  }
}

function firstHeading(text: string): string | null {
  const m = text.match(/^\s*#+\s+(.+?)\s*$/m);
  return m ? m[1] : null;
}

function firstParagraph(text: string): string | null {
  const stripped = text.replace(/^\s*#+.*$/m, "").trim();
  const first = stripped.split(/\n\s*\n/)[0]?.trim() ?? "";
  return first || null;
}

function inferType(key: string, fallback: MemoryType | undefined): MemoryType {
  if (key.startsWith("project_")) return "project";
  if (key.startsWith("feedback_")) return "feedback";
  if (key.startsWith("reference_")) return "reference";
  return fallback ?? "user";
}

/**
 * Append a hidden `<!-- tags: a, b, c -->` marker so tags survive on
 * disk without polluting the visible frontmatter. On re-save we strip
 * any prior marker so tags don't stack.
 */
function ensureTagsBlock(body: string, tags: string[]): string {
  const stripped = body.replace(/\n?<!-- tags:[^>]*-->\s*$/s, "");
  if (tags.length === 0) return stripped;
  const clean = tags.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return stripped;
  return `${stripped.trimEnd()}\n<!-- tags: ${clean.join(", ")} -->\n`;
}
