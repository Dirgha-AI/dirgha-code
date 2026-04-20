import { Database } from '../utils/sqlite.js';
import type { SyncResult, SyncStatus } from './types.js';
import { KnowledgeAPIClient } from '../api/knowledge.js';

export class SyncEngine {
  private api: KnowledgeAPIClient;

  constructor(
    private db: Database,
    private projectId: string,
    apiConfig: { baseUrl: string; apiKey: string; orgId?: string }
  ) {
    this.api = new KnowledgeAPIClient({ ...apiConfig, projectId });
  }

  async status(): Promise<SyncStatus> {
    const localCount = this.db.prepare('SELECT COUNT(*) as count FROM curated_facts WHERE project_id = ?').get(this.projectId) as { count: number };
    const lastSync = this.db.prepare('SELECT last_sync_at FROM sync_status WHERE project_id = ?').get(this.projectId) as { last_sync_at: string } | undefined;

    let cloudCount = 0;
    try {
      const cloudStatus = await this.api.getSyncStatus();
      cloudCount = cloudStatus.facts;
    } catch {
      // Offline or error
    }

    return {
      projectId: this.projectId,
      localFacts: localCount.count,
      cloudFacts: cloudCount,
      pendingUploads: this.getPendingUploads(),
      pendingDownloads: 0,
      lastSyncAt: lastSync?.last_sync_at || null,
      conflicts: 0
    };
  }

  async push(): Promise<SyncResult> {
    const result: SyncResult = { uploaded: 0, downloaded: 0, conflicts: 0, errors: [] };

    const pending = this.db.prepare(`
      SELECT id, content, tags, embedding
      FROM curated_facts
      WHERE project_id = ? AND (synced_at IS NULL OR updated_at > synced_at)
      LIMIT 100
    `).all(this.projectId) as Array<{ id: string; content: string; tags: string; embedding: Buffer | null }>;

    if (pending.length === 0) return result;

    const factsToUpload = pending.map(row => ({
      id: row.id,
      content: row.content,
      tags: JSON.parse(row.tags || '[]'),
      embedding: row.embedding ? Array.from(new Float32Array(row.embedding.buffer)) : undefined
    }));

    try {
      const uploadResult = await this.api.uploadFacts(factsToUpload);
      result.uploaded = uploadResult.uploaded;

      const now = new Date().toISOString();
      const stmt = this.db.prepare('UPDATE curated_facts SET synced_at = ? WHERE id = ?');
      const updateSync = this.db.transaction((ids: string[]) => {
        for (const id of ids) stmt.run(now, id);
      });
      updateSync(factsToUpload.map(f => f.id));

      this.updateLastSync(now);
    } catch (error) {
      result.errors.push(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  async pull(): Promise<SyncResult> {
    const result: SyncResult = { uploaded: 0, downloaded: 0, conflicts: 0, errors: [] };

    const lastSync = this.db.prepare('SELECT last_sync_at FROM sync_status WHERE project_id = ?').get(this.projectId) as { last_sync_at: string } | undefined;

    try {
      const cloudFacts = await this.api.getFacts(lastSync?.last_sync_at);

      const insert = this.db.prepare(`
        INSERT OR REPLACE INTO curated_facts (id, content, tags, project_id, created_at, updated_at, embedding, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const importFact = this.db.transaction((facts: typeof cloudFacts) => {
        for (const fact of facts) {
          const existing = this.db.prepare('SELECT updated_at FROM curated_facts WHERE id = ?').get(fact.id) as { updated_at: string } | undefined;

          if (existing && new Date(existing.updated_at) > new Date(fact.updatedAt)) {
            result.conflicts++;
            continue;
          }

          insert.run(
            fact.id,
            fact.content,
            JSON.stringify(fact.tags),
            this.projectId,
            fact.updatedAt,
            fact.updatedAt,
            null,
            new Date().toISOString()
          );
          result.downloaded++;
        }
      });
      importFact(cloudFacts);
      this.updateLastSync(new Date().toISOString());
    } catch (error) {
      result.errors.push(`Pull failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  private getPendingUploads(): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM curated_facts
      WHERE project_id = ? AND (synced_at IS NULL OR updated_at > synced_at)
    `).get(this.projectId) as { count: number };
    return result.count;
  }

  private updateLastSync(timestamp: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO sync_status (project_id, last_sync_at, updated_at)
      VALUES (?, ?, ?)
    `).run(this.projectId, timestamp, timestamp);
  }
}
