/**
 * Wiki-style knowledge base. Read-forward, navigation-first.
 *
 * Articles live as plain Markdown at `~/.dirgha/knowledge/{slug}.md`,
 * optionally indexed by SQLite FTS5 for full-text search. The design
 * is deliberately simpler than v1's multi-stage raw/compile/summary
 * pipeline — a knowledge base is just a folder of markdown files; a
 * compiler agent can write to it the same way a human can.
 *
 * Slugs are derived from the filename (minus `.md`). The first markdown
 * heading, if present, becomes the article's title; the first non-heading
 * paragraph becomes the summary.
 */
import { readFile, readdir, stat, writeFile, mkdir, unlink, } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { openFtsIndex, fallbackSearch } from "./_fts.js";
export function createKnowledgeStore(opts = {}) {
    const dir = opts.directory ?? join(homedir(), ".dirgha", "knowledge");
    return new FileKnowledgeStore(dir, opts.useFtsIndex !== false);
}
class FileKnowledgeStore {
    dir;
    ftsEnabled;
    ftsPromise = null;
    constructor(dir, ftsEnabled) {
        this.dir = dir;
        this.ftsEnabled = ftsEnabled;
    }
    async listArticles() {
        await this.ensure();
        const names = await readdir(this.dir).catch(() => []);
        return names
            .filter((n) => n.endsWith(".md") && n !== "INDEX.md")
            .map((n) => n.replace(/\.md$/, ""))
            .sort();
    }
    async getArticle(slug) {
        assertValidSlug(slug);
        const abs = this.pathFor(slug);
        const info = await stat(abs).catch(() => undefined);
        if (!info)
            return null;
        const text = await readFile(abs, "utf8").catch(() => null);
        if (text === null)
            return null;
        return parseArticle(slug, text, info.mtime.toISOString());
    }
    async putArticle(slug, body) {
        assertValidSlug(slug);
        await this.ensure();
        await writeFile(this.pathFor(slug), body, "utf8");
        const article = parseArticle(slug, body, new Date().toISOString());
        await this.rebuildIndex();
        const fts = await this.fts();
        fts?.upsert({
            id: article.slug,
            title: article.title,
            body: article.body,
            tags: "",
        });
    }
    async deleteArticle(slug) {
        assertValidSlug(slug);
        await unlink(this.pathFor(slug)).catch(() => undefined);
        await this.rebuildIndex();
        const fts = await this.fts();
        fts?.remove(slug);
    }
    async searchArticles(query, limit = 8) {
        const fts = await this.fts();
        if (fts) {
            const hits = fts.search(query, limit);
            if (hits.length > 0) {
                return hits.map((h) => ({
                    slug: h.id,
                    title: h.title,
                    snippet: h.snippet,
                    score: h.score,
                }));
            }
        }
        const slugs = await this.listArticles();
        const docs = [];
        for (const slug of slugs) {
            const article = await this.getArticle(slug);
            if (!article)
                continue;
            docs.push({ id: article.slug, title: article.title, body: article.body });
        }
        return fallbackSearch(docs, query, limit).map((h) => ({
            slug: h.id,
            title: h.title,
            snippet: h.snippet,
            score: h.score,
        }));
    }
    pathFor(slug) {
        return join(this.dir, `${slug}.md`);
    }
    async ensure() {
        const info = await stat(this.dir).catch(() => undefined);
        if (!info)
            await mkdir(this.dir, { recursive: true });
    }
    async rebuildIndex() {
        const slugs = await this.listArticles();
        const lines = ["# Knowledge Base", ""];
        for (const slug of slugs) {
            const article = await this.getArticle(slug);
            if (!article)
                continue;
            lines.push(`- [${article.title}](${slug}.md) — ${article.summary.slice(0, 120)}`);
        }
        await writeFile(join(this.dir, "INDEX.md"), `${lines.join("\n")}\n`, "utf8");
    }
    fts() {
        if (!this.ftsEnabled)
            return Promise.resolve(null);
        if (!this.ftsPromise) {
            this.ftsPromise = openFtsIndex({
                dbPath: join(this.dir, "index.db"),
                namespace: "knowledge",
            }).catch((_err) => {
                this.ftsPromise = null;
                return null;
            });
        }
        return this.ftsPromise;
    }
}
function parseArticle(slug, body, updatedAt) {
    const title = firstHeading(body) ?? slug;
    const summary = firstParagraph(body) ?? "";
    return { slug, title, summary, body, updatedAt };
}
function firstHeading(text) {
    const m = text.match(/^\s*#+\s+(.+?)\s*$/m);
    return m ? m[1] : null;
}
function firstParagraph(text) {
    for (const block of text.split(/\n\s*\n/)) {
        const line = block.trim();
        if (!line)
            continue;
        if (line.startsWith("#"))
            continue;
        return line.replace(/\s+/g, " ");
    }
    return null;
}
function assertValidSlug(slug) {
    if (!slug || !/^[a-zA-Z0-9][a-zA-Z0-9_\-.]*$/.test(slug)) {
        throw new Error(`Invalid knowledge slug "${slug}". Use alphanumeric, dash, dot, underscore.`);
    }
}
//# sourceMappingURL=knowledge.js.map