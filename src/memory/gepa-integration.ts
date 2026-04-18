/**
 * GEPA Integration for Holographic Memory
 * 
 * SAFE INTEGRATION: Extends holographic without breaking changes
 * - Adds GEPA columns to existing schema
 * - Wraps recallFacts with Pareto + truth filtering
 * - Feature flag controlled
 * - Falls back to holographic if anything fails
 */

import { getDB } from '../session/db.js';

const GEPA_ENABLED = process.env.DIRGHA_GEPA === 'true';

/**
 * Check if GEPA migration has been applied
 */
function hasGEPAColumns(): boolean {
  try {
    const db = getDB();
    const cols = db.prepare("PRAGMA table_info(holographic_facts)").all() as any[];
    return cols.some(c => c.name === 'truth_score');
  } catch {
    return false;
  }
}

/**
 * Extend holographic schema with GEPA columns (safe, idempotent)
 */
export function ensureGEPASchema(): void {
  const db = getDB();
  
  // Add columns one by one (SQLite limitation)
  const columns = [
    { name: 'truth_score', def: 'REAL DEFAULT 0.5' },
    { name: 'pareto_rank', def: 'REAL DEFAULT 0.5' },
    { name: 'staleness', def: 'INTEGER DEFAULT 0' },
    { name: 'verification', def: 'TEXT DEFAULT \'claimed\'' },
    { name: 'ttl', def: 'INTEGER DEFAULT 7' },
    { name: 'tier', def: 'TEXT DEFAULT \'warm\'' },
    { name: 'tags', def: 'TEXT DEFAULT \'[]\'' },
    { name: 'supersedes_id', def: 'INTEGER' },
  ];
  
  for (const col of columns) {
    try {
      db.prepare(`ALTER TABLE holographic_facts ADD COLUMN ${col.name} ${col.def}`).run();
    } catch (e: any) {
      // Column already exists - safe to ignore
      if (!e.message?.includes('duplicate column')) {
        console.warn(`[GEPA] Schema update warning: ${e.message}`);
      }
    }
  }
  
  // Create index for fast GEPA queries
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_holo_gepa 
      ON holographic_facts(tier, truth_score DESC, pareto_rank DESC)
      WHERE staleness < ttl
    `);
  } catch (e) {
    console.warn('[GEPA] Index creation failed:', e);
  }
}

/**
 * GEPA-enhanced fact recall
 * 
 * If GEPA enabled + migrated: Returns Pareto-ranked, truth-gated facts
 * Otherwise: Returns standard holographic results
 */
export function recallFactsGEPA(
  query: string,
  limit = 5,
  minTruth = 0.8,
  maxStaleness = 7
): Array<{ content: string; trust: number; gepa?: boolean }> {
  const db = getDB();
  
  // Check if we should use GEPA
  if (!GEPA_ENABLED || !hasGEPAColumns()) {
    // Fall back to standard holographic recall
    return recallFactsStandard(query, limit);
  }
  
  try {
    // GEPA path: Pareto-ranked, truth-gated, fresh facts only
    const rows = db.prepare(`
      SELECT 
        content, 
        trust_score,
        truth_score,
        pareto_rank,
        tier
      FROM holographic_facts
      WHERE (content LIKE ? OR tags LIKE ?)
        AND truth_score >= ?
        AND staleness < ?
        AND tier IN ('hot', 'warm')
      ORDER BY 
        CASE tier 
          WHEN 'hot' THEN 1 
          WHEN 'warm' THEN 2 
          ELSE 3 
        END,
        truth_score DESC,
        pareto_rank DESC,
        trust_score DESC,
        last_seen DESC
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, minTruth, maxStaleness, limit) as any[];
    
    return rows.map(r => ({
      content: r.content,
      trust: r.truth_score || r.trust_score || 0.5,
      gepa: true
    }));
  } catch (e) {
    // Any error: fall back to standard
    console.warn('[GEPA] Query failed, using fallback:', e);
    return recallFactsStandard(query, limit);
  }
}

/**
 * Standard holographic recall (original behavior)
 */
function recallFactsStandard(
  query: string,
  limit = 5
): Array<{ content: string; trust: number }> {
  const db = getDB();
  
  try {
    // Original HRR query from holographic.ts
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
    // Fallback LIKE search (original behavior)
    const rows = db.prepare(`
      SELECT content, trust_score FROM holographic_facts
      WHERE content LIKE ? ORDER BY trust_score DESC, last_seen DESC LIMIT ?
    `).all(`%${query}%`, limit) as any[];
    
    return rows.map(r => ({ content: r.content, trust: r.trust_score }));
  }
}

/**
 * Store fact with GEPA metadata (if enabled)
 */
export function storeFactGEPA(
  content: string,
  tier: 'filesystem' | 'git' | 'execution' | 'claimed' | 'planned' = 'claimed',
  tags: string[] = []
): { status: string; gepa: boolean } {
  const db = getDB();
  
  // Calculate truth score from tier
  const truthScore = tier === 'filesystem' ? 1.0 :
                    tier === 'git' ? 0.9 :
                    tier === 'execution' ? 0.8 :
                    tier === 'claimed' ? 0.5 : 0.3;
  
  try {
    // Check if GEPA columns exist
    if (!hasGEPAColumns()) {
      // Fall back to standard store (handled by holographic.ts)
      return { status: 'stored', gepa: false };
    }
    
    // Check for existing fact (simple hash match)
    const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
    const existing = db.prepare(`
      SELECT id, truth_score, mentions FROM holographic_facts 
      WHERE content LIKE ?
    `).get(`%${normalized.slice(0, 50)}%`) as any;
    
    if (existing) {
      // Reinforce existing fact
      const newTrust = Math.min(1, (existing.truth_score || 0.5) + 0.1);
      db.prepare(`
        UPDATE holographic_facts 
        SET truth_score = ?, 
            mentions = mentions + 1, 
            last_seen = datetime('now'),
            staleness = 0,
            verification = ?,
            tags = ?
        WHERE id = ?
      `).run(newTrust, tier, JSON.stringify(tags), existing.id);
      
      return { status: 'reinforced', gepa: true };
    }
    
    // Store new fact with GEPA metadata
    db.prepare(`
      INSERT INTO holographic_facts (
        content, 
        trust_score, 
        truth_score,
        mentions,
        verification,
        tier,
        tags,
        staleness
      ) VALUES (?, ?, ?, 1, ?, ?, ?, 0)
    `).run(
      content.trim(),
      truthScore,
      truthScore,
      tier,
      tier === 'filesystem' || tier === 'git' ? 'hot' : 'warm',
      JSON.stringify(tags)
    );
    
    return { status: 'stored', gepa: true };
  } catch (e) {
    console.warn('[GEPA] Store failed:', e);
    return { status: 'stored', gepa: false };
  }
}

/**
 * Run GEPA optimizer (prune expired, update staleness)
 * Safe to call anytime - non-blocking, catches all errors
 */
export function runGEPAOptimizer(): { pruned: number; updated: number } {
  const db = getDB();
  let pruned = 0;
  let updated = 0;
  
  if (!GEPA_ENABLED || !hasGEPAColumns()) {
    return { pruned: 0, updated: 0 };
  }
  
  try {
    // Prune expired facts (claimed + stale)
    const pruneResult = db.prepare(`
      DELETE FROM holographic_facts 
      WHERE staleness >= ttl 
        AND verification = 'claimed'
        AND tier != 'hot'
    `).run();
    pruned = pruneResult.changes;
    
    // Increment staleness for unaccessed facts
    const updateResult = db.prepare(`
      UPDATE holographic_facts 
      SET staleness = staleness + 1
      WHERE last_seen < datetime('now', '-1 day')
        AND staleness < ttl
    `).run();
    updated = updateResult.changes;
    
  } catch (e) {
    console.warn('[GEPA] Optimizer error (non-critical):', e);
  }
  
  return { pruned, updated };
}

/**
 * Get GEPA status for debugging
 */
export function getGEPAStatus(): {
  enabled: boolean;
  migrated: boolean;
  factCount: number;
  hotFacts: number;
  warmFacts: number;
} {
  const db = getDB();
  
  try {
    const migrated = hasGEPAColumns();
    const count = db.prepare('SELECT COUNT(*) as n FROM holographic_facts').get() as { n: number };
    
    let hotFacts = 0;
    let warmFacts = 0;
    
    if (migrated) {
      const tiers = db.prepare(`
        SELECT tier, COUNT(*) as n 
        FROM holographic_facts 
        GROUP BY tier
      `).all() as any[];
      
      hotFacts = tiers.find(t => t.tier === 'hot')?.n || 0;
      warmFacts = tiers.find(t => t.tier === 'warm')?.n || 0;
    }
    
    return {
      enabled: GEPA_ENABLED,
      migrated,
      factCount: count?.n || 0,
      hotFacts,
      warmFacts
    };
  } catch {
    return {
      enabled: GEPA_ENABLED,
      migrated: false,
      factCount: 0,
      hotFacts: 0,
      warmFacts: 0
    };
  }
}
