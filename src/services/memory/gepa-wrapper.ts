// @ts-nocheck
/**
 * GEPA Memory Wrapper
 * 
 * Safe integration with existing holographic memory.
 * Wraps holographic as backing store, adds GEPA verification + evolution.
 * 
 * Approach: Option B (Wrapper Mode)
 * - Holographic stays as primary store
 * - GEPA adds filter layer on read path
 * - Feature flag controlled (DIRGHA_GEPA)
 * - Zero breaking changes
 */

import type { Database } from '../../utils/sqlite.js';
import type { GEPAMemoryEntry, ContextWindowOptions } from '@dirgha/core/memory';

// Import GEPA functions (will resolve once built)
// For now, inline the critical getContextWindow logic

const GEPA_ENABLED = process.env.DIRGHA_GEPA === 'true';

export interface GEPAWrapperOptions {
  db: Database;
  n?: number;           // Max facts (default: 50)
  minTruth?: number;      // Min truth score (default: 0.8)
  maxStaleness?: number;  // Max days (default: 7)
}

/**
 * Safe context retrieval - wraps holographic with GEPA filtering
 * 
 * If DIRGHA_GEPA=true: Returns Pareto-ranked, truth-gated window
 * If DIRGHA_GEPA=false: Falls back to holographic (existing behavior)
 */
export function getSafeContextWindow(
  db: Database,
  query: string,
  opts: Partial<GEPAWrapperOptions> = {}
): string[] {
  const { n = 50, minTruth = 0.8, maxStaleness = 7 } = opts;
  
  if (!GEPA_ENABLED) {
    // Legacy path: holographic behavior
    return getHolographicContext(db, query);
  }
  
  // GEPA path: verified, ranked, filtered
  return getGEPAContext(db, query, { n, minTruth, maxStaleness });
}

/**
 * Legacy holographic query (preserves existing behavior)
 */
function getHolographicContext(db: Database, query: string): string[] {
  // Match existing holographic.ts implementation
  const stmt = db.prepare(`
    SELECT content 
    FROM holographic_facts 
    WHERE content LIKE ? 
    ORDER BY last_accessed DESC
  `);
  
  const rows = stmt.all(`%${query}%`);
  return rows.map((r: any) => r.content);
}

/**
 * GEPA-enhanced query (Pareto-ranked, truth-gated)
 */
function getGEPAContext(
  db: Database, 
  query: string,
  opts: { n: number; minTruth: number; maxStaleness: number }
): string[] {
  const { n, minTruth, maxStaleness } = opts;
  
  try {
    // Check if GEPA columns exist
    const hasGEPA = checkGEPAColumns(db);
    
    if (!hasGEPA) {
      // GEPA not migrated yet, fall back to holographic
      console.warn('[GEPA] Columns not found, using holographic fallback');
      return getHolographicContext(db, query);
    }
    
    // GEPA query: ranked by truth_score, pareto_rank
    const stmt = db.prepare(`
      SELECT content, truth_score, pareto_rank
      FROM holographic_facts
      WHERE (content LIKE ? OR tags LIKE ?)
        AND truth_score >= ?
        AND staleness < ?
        AND tier IN ('hot', 'warm')
      ORDER BY 
        truth_score DESC,
        pareto_rank DESC,
        last_accessed DESC
      LIMIT ?
    `);
    
    const rows = stmt.all(`%${query}%`, `%${query}%`, minTruth, maxStaleness, n);
    
    return rows.map((r: any) => 
      `[${(r.truth_score || 0).toFixed(2)}] ${r.content}`
    );
  } catch (err) {
    // Any error: fall back to holographic (safety first)
    console.error('[GEPA] Error, falling back:', err.message);
    return getHolographicContext(db, query);
  }
}

/**
 * Check if GEPA migration has been applied
 */
function checkGEPAColumns(db: Database): boolean {
  try {
    const cols = db.prepare("PRAGMA table_info(holographic_facts)").all();
    return cols.some((c: any) => c.name === 'truth_score');
  } catch {
    return false;
  }
}

/**
 * Run GEPA optimizer in background (safe, non-blocking)
 */
export async function runSafeOptimizer(
  db: Database,
  everyNTurns: number = 25
): Promise<void> {
  if (!GEPA_ENABLED) return;
  
  try {
    // Check if we should run (every N turns)
    const counter = getOptimizerCounter(db);
    if (counter % everyNTurns !== 0) {
      incrementOptimizerCounter(db);
      return;
    }
    
    console.log('[GEPA] Running background optimizer...');
    
    // Prune expired facts
    const expired = db.prepare(`
      DELETE FROM holographic_facts 
      WHERE staleness >= ttl 
        AND verification = 'claimed'
    `).run();
    
    // Update staleness
    db.prepare(`
      UPDATE holographic_facts 
      SET staleness = staleness + 1
      WHERE last_accessed < unixepoch() - 86400
    `).run();
    
    console.log(`[GEPA] Pruned ${expired.changes} expired facts`);
    
  } catch (err) {
    // Never crash the CLI
    console.error('[GEPA] Optimizer error (non-critical):', err.message);
  }
}

/**
 * Get/set optimizer counter (stored in holographic_facts meta)
 */
function getOptimizerCounter(db: Database): number {
  try {
    const row = db.prepare(`
      SELECT access_count FROM holographic_facts 
      WHERE content = '__gepa_optimizer_counter__'
    `).get();
    return row?.access_count || 0;
  } catch {
    return 0;
  }
}

function incrementOptimizerCounter(db: Database): void {
  try {
    db.prepare(`
      INSERT INTO holographic_facts (content, access_count, created_at)
      VALUES ('__gepa_optimizer_counter__', 1, unixepoch())
      ON CONFLICT(content) DO UPDATE SET 
        access_count = access_count + 1,
        last_accessed = unixepoch()
    `).run();
  } catch {
    // Ignore errors
  }
}

/**
 * Safe migration check - can run anytime
 */
export function checkMigrationStatus(db: Database): {
  migrated: boolean;
  factsCount: number;
  gepaEnabled: boolean;
} {
  try {
    const hasGEPA = checkGEPAColumns(db);
    const count = db.prepare('SELECT COUNT(*) as n FROM holographic_facts').get() as { n: number };
    
    return {
      migrated: hasGEPA,
      factsCount: count?.n || 0,
      gepaEnabled: GEPA_ENABLED
    };
  } catch (err) {
    return {
      migrated: false,
      factsCount: 0,
      gepaEnabled: GEPA_ENABLED
    };
  }
}
