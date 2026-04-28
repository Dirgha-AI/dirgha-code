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

import { readFile, readdir, stat, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { openFtsIndex, fallbackSearch } from './_fts.js';
import type { FtsIndex } from './_fts.js';

export interface Article {
  slug: string;
  title: string;
  summary: string;
  body: string;
  updatedAt: string;
}

export interface ArticleHit {
  slug: string;
  title: string;
  snippet: string;
  score: number;
}

export interface KnowledgeStore {
  listArticles(): Promise<string[]>;
  getArticle(slug: string): Promise<Article | null>;
  putArticle(slug: string, body: string): Promise<void>;
  deleteArticle(slug: string): Promise<void>;
  searchArticles(query: string, limit?: number): Promise<ArticleHit[]>;
}

export interface KnowledgeStoreOptions {
  directory?: string;
  useFtsIndex?: boolean;
}

export function createKnowledgeStore(opts: KnowledgeStoreOptions = {}): KnowledgeStore {
  const dir = opts.directory ?? join(homedir(), '.dirgha', 'knowledge');
  return new FileKnowledgeStore(dir, opts.useFtsIndex !== false);
}

class FileKnowledgeStore implements KnowledgeStore {
  private ftsPromise: Promise<FtsIndex | null> | null = null;

  constructor(
    private readonly dir: string,
    private readonly ftsEnabled: boolean,
  ) {}

  async listArticles(): Promise<string[]> {
    await this.ensure();
    const names = await readdir(this.dir).catch(() => [] as string[]);
    return names
      .filter(n => n.endsWith('.md') && n !== 'INDEX.md')
      .map(n => n.replace(/\.md$/, ''))
      .sort();
  }

  async getArticle(slug: string): Promise<Article | null> {
    assertValidSlug(slug);
    const abs = this.pathFor(slug);
    const info = await stat(abs).catch(() => undefined);
    if (!info) return null;
    const text = await readFile(abs, 'utf8').catch(() => null);
    if (text === null) return null;
    return parseArticle(slug, text, info.mtime.toISOString());
  }

  async putArticle(slug: string, body: string): Promise<void> {
    assertValidSlug(slug);
    await this.ensure();
    await writeFile(this.pathFor(slug), body, 'utf8');
    const article = parseArticle(slug, body, new Date().toISOString());
    await this.rebuildIndex();
    const fts = await this.fts();
    fts?.upsert({
      id: article.slug,
      title: article.title,
      body: article.body,
      tags: '',
    });
  }

  async deleteArticle(slug: string): Promise<void> {
    assertValidSlug(slug);
    await unlink(this.pathFor(slug)).catch(() => undefined);
    await this.rebuildIndex();
    const fts = await this.fts();
    fts?.remove(slug);
  }

  async searchArticles(query: string, limit: number = 8): Promise<ArticleHit[]> {
    const fts = await this.fts();
    if (fts) {
      const hits = fts.search(query, limit);
      if (hits.length > 0) {
        return hits.map(h => ({ slug: h.id, title: h.title, snippet: h.snippet, score: h.score }));
      }
    }
    const slugs = await this.listArticles();
    const docs: { id: string; title: string; body: string; tags?: string }[] = [];
    for (const slug of slugs) {
      const article = await this.getArticle(slug);
      if (!article) continue;
      docs.push({ id: article.slug, title: article.title, body: article.body });
    }
    return fallbackSearch(docs, query, limit).map(h => ({
      slug: h.id, title: h.title, snippet: h.snippet, score: h.score,
    }));
  }

  private pathFor(slug: string): string {
    return join(this.dir, `${slug}.md`);
  }

  private async ensure(): Promise<void> {
    const info = await stat(this.dir).catch(() => undefined);
    if (!info) await mkdir(this.dir, { recursive: true });
  }

  private async rebuildIndex(): Promise<void> {
    const slugs = await this.listArticles();
    const lines = ['# Knowledge Base', ''];
    for (const slug of slugs) {
      const article = await this.getArticle(slug);
      if (!article) continue;
      lines.push(`- [${article.title}](${slug}.md) — ${article.summary.slice(0, 120)}`);
    }
    await writeFile(join(this.dir, 'INDEX.md'), `${lines.join('\n')}\n`, 'utf8');
  }

  private fts(): Promise<FtsIndex | null> {
    if (!this.ftsEnabled) return Promise.resolve(null);
    if (!this.ftsPromise) {
      this.ftsPromise = openFtsIndex({
        dbPath: join(this.dir, 'index.db'),
        namespace: 'knowledge',
      });
    }
    return this.ftsPromise;
  }
}

function parseArticle(slug: string, body: string, updatedAt: string): Article {
  const title = firstHeading(body) ?? slug;
  const summary = firstParagraph(body) ?? '';
  return { slug, title, summary, body, updatedAt };
}

function firstHeading(text: string): string | null {
  const m = text.match(/^\s*#+\s+(.+?)\s*$/m);
  return m ? m[1] : null;
}

function firstParagraph(text: string): string | null {
  for (const block of text.split(/\n\s*\n/)) {
    const line = block.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    return line.replace(/\s+/g, ' ');
  }
  return null;
}

function assertValidSlug(slug: string): void {
  if (!slug || !/^[a-zA-Z0-9][a-zA-Z0-9_\-\.]*$/.test(slug)) {
    throw new Error(`Invalid knowledge slug "${slug}". Use alphanumeric, dash, dot, underscore.`);
  }
}
