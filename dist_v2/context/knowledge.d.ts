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
export declare function createKnowledgeStore(opts?: KnowledgeStoreOptions): KnowledgeStore;
