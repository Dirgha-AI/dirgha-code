/**
 * VSS Integration for Vector Search
 * @module commands/curate/vss-integration
 */
import { isVssAvailable, createVssTable, upsertVssEmbedding } from '../../embeddings/vss.js';
import type { Database } from '../../utils/sqlite.js';

export async function storeInVss(
  db: Database, 
  factId: string, 
  embedding: number[]
): Promise<boolean> {
  try {
    const vssAvailable = await isVssAvailable(db);
    if (!vssAvailable) return false;

    createVssTable(db, embedding.length);
    upsertVssEmbedding(db, factId, embedding);
    return true;
  } catch {
    return false;
  }
}
