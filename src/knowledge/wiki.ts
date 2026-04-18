/**
 * knowledge/wiki.ts — Wiki article store (PAL navigation-over-search pattern).
 *
 * Structure:
 *   ~/.dirgha/knowledge/wiki/
 *     index.md          — routing table (~5k tokens, fits in LLM context)
 *     concepts/*.md     — concept articles
 *     summaries/*.md    — 200-500 word summaries
 *     .state.json       — metadata
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const WIKI_DIR = path.join(os.homedir(), '.dirgha', 'knowledge', 'wiki');
const INDEX_PATH = path.join(WIKI_DIR, 'index.md');
const STATE_PATH = path.join(WIKI_DIR, '.state.json');
const MAX_INDEX_CHARS = 20_000; // ~5k tokens

interface WikiState {
  articleCount: number;
  lastCompiled?: string;
  lastLinted?: string;
}

function ensureDir(p: string): void {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function wikiDir(): string { return WIKI_DIR; }
export function conceptsDir(): string { return path.join(WIKI_DIR, 'concepts'); }
export function summariesDir(): string { return path.join(WIKI_DIR, 'summaries'); }

function readState(): WikiState {
  if (!fs.existsSync(STATE_PATH)) return { articleCount: 0 };
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { articleCount: 0 }; }
}

function writeState(s: WikiState): void {
  ensureDir(WIKI_DIR);
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

/** Read the wiki index (for system prompt injection). Truncates if > MAX_INDEX_CHARS. */
export function getWikiIndex(): string {
  if (!fs.existsSync(INDEX_PATH)) return '';
  try {
    const content = fs.readFileSync(INDEX_PATH, 'utf8');
    return content.length > MAX_INDEX_CHARS ? content.slice(0, MAX_INDEX_CHARS) + '\n…(truncated)' : content;
  } catch { return ''; }
}

/** Write the wiki index (called by compiler after compiling articles). */
export function setWikiIndex(content: string): void {
  ensureDir(WIKI_DIR);
  fs.writeFileSync(INDEX_PATH, content, 'utf8');
  const state = readState();
  state.lastCompiled = new Date().toISOString();
  writeState(state);
}

/** Get a specific article by slug (path-based lookup). */
export function getArticle(slug: string): string | null {
  const p = path.join(conceptsDir(), `${slug}.md`);
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

/** Write/update a concept article. */
export function updateArticle(slug: string, content: string): void {
  ensureDir(conceptsDir());
  fs.writeFileSync(path.join(conceptsDir(), `${slug}.md`), content, 'utf8');
  const state = readState();
  state.articleCount = listArticles().length;
  writeState(state);
}

/** List all article slugs. */
export function listArticles(): string[] {
  const dir = conceptsDir();
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''));
  } catch { return []; }
}

/** Get a summary by slug. */
export function getSummary(slug: string): string | null {
  const p = path.join(summariesDir(), `${slug}.md`);
  if (!fs.existsSync(p)) return null;
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

/** Write a summary for a slug. */
export function updateSummary(slug: string, content: string): void {
  ensureDir(summariesDir());
  fs.writeFileSync(path.join(summariesDir(), `${slug}.md`), content, 'utf8');
}

/** Regenerate the wiki index from all current articles. Called after compile. */
export function rebuildIndex(): void {
  const articles = listArticles();
  if (articles.length === 0) return;

  const lines = ['# Knowledge Base Index', '', `_${articles.length} articles. Last updated: ${new Date().toISOString().slice(0, 10)}_`, ''];
  for (const slug of articles.sort()) {
    const content = getArticle(slug) ?? '';
    // Extract first heading and first paragraph as description
    const firstLine = content.split('\n').find(l => l.startsWith('#')) ?? slug;
    const title = firstLine.replace(/^#+\s*/, '');
    const desc = content.split('\n').find(l => l.trim() && !l.startsWith('#')) ?? '';
    lines.push(`- **${slug}**: ${title} — ${desc.slice(0, 80)}`);
  }
  setWikiIndex(lines.join('\n'));
}

export function getWikiState(): WikiState { return readState(); }
