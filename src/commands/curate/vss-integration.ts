/**
 * VSS Integration for Vector Search
 * @module commands/curate/vss-integration
 */
import { isVssAvailable, createVssTable, upsertVssEmbedding } from '../../embeddings/vss.js';

export async function storeInVss(
  db: import('better-sqlite3').Database,
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
