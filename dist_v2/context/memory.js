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
import { readFile, readdir, stat, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { openFtsIndex, fallbackSearch } from './_fts.js';
/** Legacy factory — returns the structured-record API used by existing callers. */
export function createMemoryStore(opts = {}) {
    return buildStore(opts);
}
/**
 * Canonical L3 factory — returns the key/value API described in the
 * experience spec. Both factories wrap the same on-disk store, so
 * callers may create either view safely.
 */
export function createKeyedMemoryStore(opts = {}) {
    return new KeyedAdapter(buildStore(opts));
}
function buildStore(opts) {
    const dir = opts.directory ?? join(homedir(), '.dirgha', 'memory');
    return new FileMemoryStore(dir, opts.useFtsIndex !== false);
}
export class FileMemoryStore {
    dir;
    ftsEnabled;
    ftsPromise = null;
    constructor(dir, ftsEnabled) {
        this.dir = dir;
        this.ftsEnabled = ftsEnabled;
    }
    async list() {
        await this.ensure();
        const names = await readdir(this.dir).catch(() => []);
        const entries = [];
        for (const name of names) {
            if (!name.endsWith('.md') || name === 'MEMORY.md')
                continue;
            const id = name.replace(/\.md$/, '');
            const entry = await this.get(id);
            if (entry)
                entries.push(entry);
        }
        entries.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
        return entries;
    }
    async get(id) {
        const abs = this.pathFor(id);
        const text = await readFile(abs, 'utf8').catch(() => undefined);
        if (!text)
            return undefined;
        return parseEntry(id, text);
    }
    async upsert(entry) {
        await this.ensure();
        const now = new Date().toISOString();
        const complete = {
            ...entry,
            createdAt: entry.createdAt || now,
            updatedAt: now,
        };
        await writeFile(this.pathFor(complete.id), renderEntry(complete), 'utf8');
        await this.writeIndex();
        await this.reindex(complete);
    }
    async remove(id) {
        await unlink(this.pathFor(id)).catch(() => undefined);
        await this.writeIndex();
        const fts = await this.fts();
        fts?.remove(id);
    }
    async search(query) {
        const needle = query.toLowerCase();
        const all = await this.list();
        return all.filter(e => e.name.toLowerCase().includes(needle)
            || e.description.toLowerCase().includes(needle)
            || e.body.toLowerCase().includes(needle));
    }
    /** Ranked hit search used by `KeyedMemoryStore.search`. */
    async searchHits(query, limit) {
        const fts = await this.fts();
        if (fts) {
            const hits = fts.search(query, limit);
            if (hits.length > 0) {
                return hits.map(h => ({ key: h.id, title: h.title, snippet: h.snippet, score: h.score }));
            }
        }
        const entries = await this.list();
        const docs = entries.map(e => ({ id: e.id, title: e.name, body: e.body, tags: '' }));
        return fallbackSearch(docs, query, limit).map(h => ({
            key: h.id, title: h.title, snippet: h.snippet, score: h.score,
        }));
    }
    pathFor(id) {
        return join(this.dir, `${id}.md`);
    }
    async ensure() {
        const info = await stat(this.dir).catch(() => undefined);
        if (!info)
            await mkdir(this.dir, { recursive: true });
    }
    async writeIndex() {
        const entries = await this.list();
        const lines = ['# Memory Index', ''];
        for (const e of entries) {
            lines.push(`- [${e.name}](${e.id}.md) — ${e.description}`);
        }
        await writeFile(join(this.dir, 'MEMORY.md'), `${lines.join('\n')}\n`, 'utf8');
    }
    fts() {
        if (!this.ftsEnabled)
            return Promise.resolve(null);
        if (!this.ftsPromise) {
            this.ftsPromise = openFtsIndex({
                dbPath: join(this.dir, 'index.db'),
                namespace: 'memory',
            });
        }
        return this.ftsPromise;
    }
    async reindex(entry) {
        const fts = await this.fts();
        fts?.upsert({ id: entry.id, title: entry.name, body: entry.body, tags: '' });
    }
}
/**
 * Adapter that exposes a `FileMemoryStore` through the keyed contract
 * (save/load/search/list/delete). Keeping the two interfaces on separate
 * objects avoids method-name collisions (both contracts define `search`
 * and `list` with different return shapes).
 */
class KeyedAdapter {
    inner;
    constructor(inner) {
        this.inner = inner;
    }
    async save(key, value, tags = []) {
        assertValidKey(key);
        const existing = await this.inner.get(key);
        const title = firstHeading(value) ?? key;
        await this.inner.upsert({
            id: key,
            type: inferType(key, existing?.type),
            name: title,
            description: firstParagraph(value) ?? '',
            body: ensureTagsBlock(value, tags),
            createdAt: existing?.createdAt ?? '',
            updatedAt: '',
        });
    }
    async load(key) {
        const entry = await this.inner.get(key);
        return entry?.body ?? null;
    }
    async search(query, limit = 10) {
        return this.inner.searchHits(query, Math.max(1, limit));
    }
    async list() {
        const entries = await this.inner.list();
        return entries.map(e => e.id);
    }
    async delete(key) {
        await this.inner.remove(key);
    }
}
// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
function renderEntry(entry) {
    const frontmatter = [
        '---',
        `id: ${entry.id}`,
        `type: ${entry.type}`,
        `name: ${escapeValue(entry.name)}`,
        `description: ${escapeValue(entry.description)}`,
        `createdAt: ${entry.createdAt}`,
        `updatedAt: ${entry.updatedAt}`,
        '---',
        '',
    ].join('\n');
    return `${frontmatter}${entry.body}`;
}
function parseEntry(id, text) {
    const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match)
        return undefined;
    const meta = {};
    for (const line of match[1].split('\n')) {
        const idx = line.indexOf(':');
        if (idx < 0)
            continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        meta[key] = unescapeValue(value);
    }
    const type = meta.type ?? 'user';
    return {
        id: meta.id ?? id,
        type,
        name: meta.name ?? id,
        description: meta.description ?? '',
        body: match[2],
        createdAt: meta.createdAt ?? '',
        updatedAt: meta.updatedAt ?? '',
    };
}
function escapeValue(s) {
    if (s.includes(':') || s.includes('\n'))
        return JSON.stringify(s);
    return s;
}
function unescapeValue(s) {
    if (s.startsWith('"') && s.endsWith('"')) {
        try {
            return JSON.parse(s);
        }
        catch {
            return s;
        }
    }
    return s;
}
function assertValidKey(key) {
    if (!key || !/^[a-zA-Z0-9][a-zA-Z0-9_\-\.]*$/.test(key)) {
        throw new Error(`Invalid memory key "${key}". Use alphanumeric, dash, dot, underscore.`);
    }
}
function firstHeading(text) {
    const m = text.match(/^\s*#+\s+(.+?)\s*$/m);
    return m ? m[1] : null;
}
function firstParagraph(text) {
    const stripped = text.replace(/^\s*#+.*$/m, '').trim();
    const first = stripped.split(/\n\s*\n/)[0]?.trim() ?? '';
    return first || null;
}
function inferType(key, fallback) {
    if (key.startsWith('project_'))
        return 'project';
    if (key.startsWith('feedback_'))
        return 'feedback';
    if (key.startsWith('reference_'))
        return 'reference';
    return fallback ?? 'user';
}
/**
 * Append a hidden `<!-- tags: a, b, c -->` marker so tags survive on
 * disk without polluting the visible frontmatter. On re-save we strip
 * any prior marker so tags don't stack.
 */
function ensureTagsBlock(body, tags) {
    const stripped = body.replace(/\n?<!-- tags:[^>]*-->\s*$/s, '');
    if (tags.length === 0)
        return stripped;
    const clean = tags.map(t => t.trim()).filter(Boolean);
    if (clean.length === 0)
        return stripped;
    return `${stripped.trimEnd()}\n<!-- tags: ${clean.join(', ')} -->\n`;
}
//# sourceMappingURL=memory.js.map