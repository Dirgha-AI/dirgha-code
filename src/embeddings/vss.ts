/**
 * SQLite-VSS Integration
 * @module embeddings/vss
 * 
 * Adds vector search capability to existing curated_facts table
 * Zero-breaking-change: creates new vss_facts table, doesn't touch existing
 */

type Database = import('better-sqlite3').Database;

let _vssLoaded = false;

/** Check if sqlite-vss extension is available */
export async function isVssAvailable(db: Database): Promise<boolean> {
  if (_vssLoaded) return true;
  
  try {
    // Try to load the extension
    db.loadExtension('/usr/local/lib/sqlite-vss.so');
    _vssLoaded = true;
    return true;
  } catch {
    // Extension not available — use fallback cosine similarity
    return false;
  }
}

/** Create VSS virtual table for vector search */
export function createVssTable(db: Database, dims: number): void {
  if (!_vssLoaded) {
    try {
      db.loadExtension('/usr/local/lib/sqlite-vss.so');
      _vssLoaded = true;
    } catch {
      throw new Error('sqlite-vss extension not available');
    }
  }

  // Create virtual table for vector search
  // Stores: fact_id (reference to curated_facts), embedding (vector)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vss_facts USING vss0(
      embedding(${dims}) 
    );

    CREATE TABLE IF NOT EXISTS vss_metadata (
      fact_id TEXT PRIMARY KEY,
      vss_rowid INTEGER,
      FOREIGN KEY (fact_id) REFERENCES curated_facts(id) ON DELETE CASCADE
    );
  `);
}

/** Insert or update embedding in VSS table */
export function upsertVssEmbedding(
  db: Database,
  factId: string,
  embedding: number[]
): void {
  if (!_vssLoaded) {
    throw new Error('VSS not initialized. Call createVssTable() first.');
  }

  // Check if already exists
  const existing = db.prepare('SELECT vss_rowid FROM vss_metadata WHERE fact_id = ?').get(factId) as { vss_rowid?: number } | undefined;

  if (existing?.vss_rowid) {
    // Update existing
    db.prepare('DELETE FROM vss_facts WHERE rowid = ?').run(existing.vss_rowid);
  }

  // Insert new
  const result = db.prepare('INSERT INTO vss_facts(embedding) VALUES (?)').run(JSON.stringify(embedding));
  const vssRowid = result.lastInsertRowid as number;

  // Update metadata
  db.prepare(`
    INSERT INTO vss_metadata(fact_id, vss_rowid) 
    VALUES (?, ?)
    ON CONFLICT(fact_id) DO UPDATE SET vss_rowid = excluded.vss_rowid
  `).run(factId, vssRowid);
}

/** Vector similarity search using VSS */
export function searchVss(
  db: Database,
  queryEmbedding: number[],
  limit: number = 10
): Array<{ fact_id: string; distance: number }> {
  if (!_vssLoaded) {
    throw new Error('VSS not available');
  }

  // vss_search returns rowids ordered by distance
  const results = db.prepare(`
    SELECT rowid, distance
    FROM vss_facts
    WHERE vss_search(embedding, ?)
    ORDER BY distance
    LIMIT ?
  `).all(JSON.stringify(queryEmbedding), limit) as Array<{ rowid: number; distance: number }>;

  // Map rowids to fact_ids
  return results.map(r => {
    const meta = db.prepare('SELECT fact_id FROM vss_metadata WHERE vss_rowid = ?').get(r.rowid) as { fact_id: string } | undefined;
    return {
      fact_id: meta?.fact_id || '',
      distance: r.distance,
    };
  }).filter(r => r.fact_id);
}

/** Delete VSS entry when fact is deleted */
export function deleteVssEmbedding(db: Database, factId: string): void {
  if (!_vssLoaded) return;

  const meta = db.prepare('SELECT vss_rowid FROM vss_metadata WHERE fact_id = ?').get(factId) as { vss_rowid?: number } | undefined;
  
  if (meta?.vss_rowid) {
    db.prepare('DELETE FROM vss_facts WHERE rowid = ?').run(meta.vss_rowid);
    db.prepare('DELETE FROM vss_metadata WHERE fact_id = ?').run(factId);
  }
}
