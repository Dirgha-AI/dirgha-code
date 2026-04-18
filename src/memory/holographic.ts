/**
 * memory/holographic.ts — Holographic memory provider
 *
 * Local-first SQLite FTS5 with trust scoring. Default external provider.
 * Uses existing getDB() from session/db.ts.
 *
 * Features:
 *   - Facts stored with trust_score (0-1, starts 0.5, rises on re-mention)
 *   - FTS5 + BM25 ranking
 *   - HRR (Hybrid Reciprocal Rank) combining FTS5 + recency
 *   - Automatic deduplication via normalize + hash
 *   - Tools: memory_store, memory_recall, memory_forget
 */
import { createHash } from 'node:crypto';
import type { MemoryProvider, MemoryProviderOpts } from './provider.js';
import { getDB } from '../session/db.js';

function hashFact(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function ensureSchema(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS holographic_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      hash TEXT UNIQUE,
      trust_score REAL DEFAULT 0.5,
      mentions INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now'))
    );
  `);
  // FTS5 virtual table — separate try since it may already exist
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS holographic_fts
        USING fts5(content, content=holographic_facts, content_rowid=id);
    `);
  } catch { /* already exists */ }
  // Sync triggers
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS holo_ai AFTER INSERT ON holographic_facts BEGIN
        INSERT INTO holographic_fts(rowid, content) VALUES (new.id, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS holo_ad AFTER DELETE ON holographic_facts BEGIN
        INSERT INTO holographic_fts(holographic_fts, rowid, content) VALUES ('delete', old.id, old.content);
      END;
    `);
  } catch { /* triggers exist */ }
}

/** Store a fact, deduplicating by hash. Returns 'stored' | 'reinforced'. */
function storeFact(content: string): string {
  const db = getDB();
  const h = hashFact(content);
  const existing = db.prepare('SELECT id, trust_score, mentions FROM holographic_facts WHERE hash = ?').get(h) as any;
  if (existing) {
    const newTrust = Math.min(1, existing.trust_score + 0.1);
    db.prepare(`UPDATE holographic_facts SET trust_score = ?, mentions = mentions + 1, last_seen = datetime('now') WHERE id = ?`)
      .run(newTrust, existing.id);
    return 'reinforced';
  }
  db.prepare('INSERT INTO holographic_facts (content, hash) VALUES (?, ?)').run(content.trim(), h);
  return 'stored';
}

/** Search facts via FTS5 + recency HRR. Returns top-k results. */
function recallFacts(query: string, limit = 5): Array<{ content: string; trust: number }> {
  const db = getDB();
  try {
    // HRR: combine BM25 rank with recency (julianday diff)
    const rows = db.prepare(`
      SELECT f.content, f.trust_score,
             rank AS bm25,
             julianday('now') - julianday(f.last_seen) AS age_days
      FROM holographic_fts fts
      JOIN holographic_facts f ON f.id = fts.rowid
      WHERE holographic_fts MATCH ?
      ORDER BY (1.0 / (1 + abs(rank))) + (f.trust_score * 0.5) + (1.0 / (1 + age_days)) DESC
      LIMIT ?
    `).all(query, limit) as any[];
    return rows.map(r => ({ content: r.content, trust: r.trust_score }));
  } catch {
    // Fallback LIKE search
    const rows = db.prepare(`
      SELECT content, trust_score FROM holographic_facts
      WHERE content LIKE ? ORDER BY trust_score DESC, last_seen DESC LIMIT ?
    `).all(`%${query}%`, limit) as any[];
    return rows.map(r => ({ content: r.content, trust: r.trust_score }));
  }
}

/** Delete a fact by content substring. */
function forgetFact(query: string): number {
  const db = getDB();
  const res = db.prepare('DELETE FROM holographic_facts WHERE content LIKE ?').run(`%${query}%`);
  return res.changes;
}

// Regex patterns for auto-extracting facts from assistant output
const FACT_PATTERNS = [
  /(?:decided|decision):\s*(.+)/gi,
  /(?:note|important|remember):\s*(.+)/gi,
  /(?:file|path):\s*(`[^`]+`|\/\S+)/gi,
  /(?:defined?|means?|is)\s+"([^"]+)"/gi,
];

export class HolographicMemoryProvider implements MemoryProvider {
  readonly name = 'holographic';

  async initialize(_sessionId: string, _opts: MemoryProviderOpts): Promise<void> {
    ensureSchema();
  }

  systemPromptBlock(): string {
    return '## Holographic Memory\nYou have access to a persistent fact store. Use memory_store to save important facts, memory_recall to search, and memory_forget to delete.';
  }

  async prefetch(query: string): Promise<string> {
    const facts = recallFacts(query, 5);
    if (!facts.length) return '';
    return '## Recalled Facts\n' + facts.map(f => `- (trust: ${f.trust.toFixed(2)}) ${f.content}`).join('\n');
  }

  async syncTurn(_userMsg: string, assistantMsg: string): Promise<void> {
    // Auto-extract key facts from assistant response
    for (const pattern of FACT_PATTERNS) {
      let match: RegExpExecArray | null;
      const re = new RegExp(pattern.source, pattern.flags);
      while ((match = re.exec(assistantMsg)) !== null) {
        const fact = match[1]?.trim();
        if (fact && fact.length > 10 && fact.length < 500) {
          storeFact(fact);
        }
      }
    }
  }

  getToolSchemas(): any[] {
    return [
      {
        name: 'memory_store',
        description: 'Store a fact in holographic memory. Deduplicates automatically.',
        input_schema: {
          type: 'object',
          properties: { fact: { type: 'string', description: 'The fact to store' } },
          required: ['fact'],
        },
      },
      {
        name: 'memory_recall',
        description: 'Search holographic memory for relevant facts.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results (default 5)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'memory_forget',
        description: 'Delete facts from holographic memory matching a query.',
        input_schema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Substring to match for deletion' } },
          required: ['query'],
        },
      },
    ];
  }

  async handleToolCall(name: string, input: Record<string, any>): Promise<string> {
    switch (name) {
      case 'memory_store': {
        const status = storeFact(input.fact as string);
        return `Fact ${status}.`;
      }
      case 'memory_recall': {
        const facts = recallFacts(input.query as string, (input.limit as number) || 5);
        if (!facts.length) return 'No matching facts found.';
        return facts.map(f => `[trust: ${f.trust.toFixed(2)}] ${f.content}`).join('\n');
      }
      case 'memory_forget': {
        const count = forgetFact(input.query as string);
        return `Deleted ${count} fact(s).`;
      }
      default:
        return `Unknown holographic tool: ${name}`;
    }
  }

  async onSessionEnd(): Promise<void> {
    // No cleanup needed — SQLite WAL handles durability
  }
}
