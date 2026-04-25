/**
 * Append-only ledger + living markdown digest.
 *
 * The agent's memory across sessions is two files — a JSONL ledger of
 * every decision/result (immutable, sortable, searchable) and a
 * markdown digest of what's been learned (mutable, model-readable).
 *
 *   ~/.dirgha/ledger/<scope>.jsonl    — append-only events
 *   ~/.dirgha/ledger/<scope>.md       — living digest, agent rewrites
 *
 * Together they make the agent restart-safe: a fresh agent reads the
 * digest for narrative context and tails the JSONL for recent state,
 * picks up where the previous session left off.
 *
 * Scopes are arbitrary strings — typical patterns:
 *   - "default"         — global cross-session memory
 *   - "<repo-name>"     — per-repo project context
 *   - "<task-id>"       — a specific long-running goal
 */

import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type LedgerEntryKind =
  | 'goal'         // user-stated goal or sub-goal
  | 'decision'    // an irreversible choice made
  | 'observation' // something learned during work
  | 'experiment'  // ran X, got Y
  | 'metric'      // raw measurement
  | 'note'        // free-form
  | 'compaction'; // digest was rewritten

export interface LedgerEntry {
  ts: string;
  kind: LedgerEntryKind;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface LedgerScope {
  name: string;
  jsonlPath: string;
  digestPath: string;
}

const DEFAULT_DIR = '.dirgha/ledger';

export function ledgerScope(name: string, home: string = homedir()): LedgerScope {
  const dir = join(home, DEFAULT_DIR);
  return {
    name,
    jsonlPath: join(dir, `${name}.jsonl`),
    digestPath: join(dir, `${name}.md`),
  };
}

async function ensureDir(path: string): Promise<void> {
  const dir = path.slice(0, path.lastIndexOf('/'));
  if (!dir) return;
  const info = await stat(dir).catch(() => undefined);
  if (!info) await mkdir(dir, { recursive: true });
}

export async function appendLedger(scope: LedgerScope, entry: Omit<LedgerEntry, 'ts'>): Promise<void> {
  try {
    await ensureDir(scope.jsonlPath);
    const full: LedgerEntry = { ts: new Date().toISOString(), ...entry };
    await appendFile(scope.jsonlPath, JSON.stringify(full) + '\n', 'utf8');
  } catch { /* swallow — ledger writes never break the run */ }
}

export async function readLedger(scope: LedgerScope, limit?: number): Promise<LedgerEntry[]> {
  const text = await readFile(scope.jsonlPath, 'utf8').catch(() => '');
  if (!text) return [];
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const start = limit !== undefined && lines.length > limit ? lines.length - limit : 0;
  const out: LedgerEntry[] = [];
  for (let i = start; i < lines.length; i++) {
    try { out.push(JSON.parse(lines[i]) as LedgerEntry); } catch { /* skip malformed */ }
  }
  return out;
}

export async function searchLedger(scope: LedgerScope, query: string): Promise<LedgerEntry[]> {
  const all = await readLedger(scope);
  const q = query.toLowerCase();
  return all.filter(e => e.text.toLowerCase().includes(q));
}

// --- Lightweight TF-IDF cosine ranking over ledger entries -----------
// Avoids any external dependency. Tokenisation: lowercase, strip
// punctuation, split on whitespace, drop very short tokens. Same
// scheme used by embedist's CLI RAG (see Embedist memory note).

const STOPWORDS = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','by',
  'is','are','was','were','be','been','being','it','this','that','these','those',
  'i','we','you','they','he','she','as','at','from','if','then','than','so',
  'do','does','did','have','has','had','will','would','can','could','should','may','might',
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

function termCounts(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function cosineRank(query: string, entries: LedgerEntry[]): Array<{ entry: LedgerEntry; score: number }> {
  const docs = entries.map(e => tokenise(e.text + ' ' + (e.kind ?? '')));
  const N = docs.length;
  if (N === 0) return [];
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string): number => Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1;

  const qTokens = tokenise(query);
  if (qTokens.length === 0) return [];
  const qCounts = termCounts(qTokens);
  const qVec = new Map<string, number>();
  for (const [t, c] of qCounts) qVec.set(t, c * idf(t));

  const scored: Array<{ entry: LedgerEntry; score: number }> = [];
  for (let i = 0; i < N; i++) {
    const dCounts = termCounts(docs[i]);
    const dVec = new Map<string, number>();
    for (const [t, c] of dCounts) dVec.set(t, c * idf(t));
    let dot = 0, qNorm = 0, dNorm = 0;
    for (const [, w] of qVec) qNorm += w * w;
    for (const [, w] of dVec) dNorm += w * w;
    for (const [t, w] of qVec) {
      const dw = dVec.get(t);
      if (dw !== undefined) dot += w * dw;
    }
    const denom = Math.sqrt(qNorm) * Math.sqrt(dNorm);
    if (denom > 0 && dot > 0) scored.push({ entry: entries[i], score: dot / denom });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * TF-IDF cosine search over the ledger. Returns the top-K entries
 * ranked by relevance. When the query has no useful tokens, falls back
 * to substring search so callers don't get empty results from short
 * queries like "ok".
 */
export async function searchLedgerRanked(scope: LedgerScope, query: string, opts: { topK?: number } = {}): Promise<Array<{ entry: LedgerEntry; score: number }>> {
  const topK = opts.topK ?? 5;
  const all = await readLedger(scope);
  const ranked = cosineRank(query, all);
  if (ranked.length > 0) return ranked.slice(0, topK);
  // Fallback: substring search wrapped in the same shape so callers
  // don't have to special-case "no useful tokens".
  const q = query.toLowerCase();
  const subs = all.filter(e => e.text.toLowerCase().includes(q));
  return subs.slice(-topK).reverse().map(entry => ({ entry, score: 0 }));
}

export async function writeDigest(scope: LedgerScope, content: string): Promise<void> {
  await ensureDir(scope.digestPath);
  await writeFile(scope.digestPath, content, 'utf8');
  await appendLedger(scope, { kind: 'compaction', text: 'digest rewritten' });
}

export async function readDigest(scope: LedgerScope): Promise<string> {
  return readFile(scope.digestPath, 'utf8').catch(() => '');
}

/**
 * Render the ledger context for a fresh-agent boot. Combines the
 * digest (narrative summary) with a tail of the most recent N entries
 * (recent decisions / observations). Returns empty string when the
 * scope has no content.
 */
export async function renderLedgerContext(scope: LedgerScope, opts: { tailEntries?: number } = {}): Promise<string> {
  const digest = await readDigest(scope);
  const tail = await readLedger(scope, opts.tailEntries ?? 20);
  if (!digest && tail.length === 0) return '';
  const sections: string[] = [];
  if (digest.trim()) {
    sections.push(`<ledger_digest scope="${scope.name}">\n${digest.trim()}\n</ledger_digest>`);
  }
  if (tail.length > 0) {
    const tailLines = tail.map(e => `[${e.ts}] (${e.kind}) ${e.text}`).join('\n');
    sections.push(`<ledger_tail scope="${scope.name}" count="${tail.length}">\n${tailLines}\n</ledger_tail>`);
  }
  return sections.join('\n\n');
}
