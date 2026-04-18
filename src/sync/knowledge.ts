// @ts-nocheck
/**
 * sync/knowledge.ts — Cloud sync for knowledge graph
 * Sprint 8: Push/pull facts to cloud
 */
import { getDB } from '../session/db.js';
import type { Fact, FactFile } from '../commands/curate.js';

interface SyncPayload {
  facts: Fact[];
  files: FactFile[];
  lastSync: string;
  deviceId: string;
}

interface SyncResult {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  timestamp: string;
}

/** Get device identifier for multi-device sync */
function getDeviceId(): string {
  const { createHash } = require('crypto');
  const { hostname } = require('os');
  return createHash('sha256').update(hostname()).digest('hex').slice(0, 16);
}

/** Export facts from local DB */
export function exportFacts(projectId?: string): { facts: any[]; files: any[] } {
  const db = getDB();
  
  let whereClause = '';
  const params: any[] = [];
  
  if (projectId) {
    whereClause = 'WHERE project_id = ?';
    params.push(projectId);
  }
  
  const facts = db.prepare(`
    SELECT id, content, embedding, created_at, updated_at, tags, project_id
    FROM curated_facts
    ${whereClause}
    ORDER BY created_at DESC
  `).all(...params);
  
  const factIds = facts.map((f: any) => f.id);
  const files = factIds.length > 0 
    ? db.prepare(`SELECT * FROM fact_files WHERE fact_id IN (${factIds.map(() => '?').join(',')})`).all(...factIds)
    : [];
  
  return { facts, files };
}

/** Import facts from cloud payload */
export function importFacts(payload: SyncPayload): number {
  const db = getDB();
  let imported = 0;
  
  const insertFact = db.prepare(`
    INSERT OR REPLACE INTO curated_facts (id, content, embedding, created_at, updated_at, tags, project_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertFile = db.prepare(`
    INSERT OR REPLACE INTO fact_files (fact_id, file_path, line_start, line_end)
    VALUES (?, ?, ?, ?)
  `);
  
  for (const fact of payload.facts) {
    try {
      insertFact.run(
        fact.id,
        fact.content,
        fact.embedding ? Buffer.from(fact.embedding) : null,
        fact.created_at,
        fact.updated_at,
        fact.tags,
        fact.project_id
      );
      imported++;
    } catch (e) {
      console.error(`Failed to import fact ${fact.id}:`, e);
    }
  }
  
  for (const file of payload.files) {
    try {
      insertFile.run(file.fact_id, file.file_path, file.line_start, file.line_end);
    } catch (e) {
      // Ignore file import errors (fact may not exist)
    }
  }
  
  return imported;
}

/** Sync facts to cloud (mock implementation - replace with actual API) */
export async function pushFacts(projectId?: string): Promise<SyncResult> {
  const { facts, files } = exportFacts(projectId);
  
  // TODO: Replace with actual API call to gateway
  // const response = await fetch('https://api.dirgha.ai/v1/knowledge/push', {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ facts, files, deviceId: getDeviceId() })
  // });
  
  // Mock: Save to local file for now
  const { writeFileSync, mkdirSync } = require('fs');
  const { join, homedir } = require('path');
  const syncDir = join(homedir(), '.dirgha', 'sync');
  mkdirSync(syncDir, { recursive: true });
  
  const payload: SyncPayload = {
    facts,
    files,
    lastSync: new Date().toISOString(),
    deviceId: getDeviceId(),
  };
  
  const filename = projectId ? `facts-${projectId}.json` : 'facts-global.json';
  writeFileSync(join(syncDir, filename), JSON.stringify(payload, null, 2));
  
  return {
    uploaded: facts.length,
    downloaded: 0,
    conflicts: 0,
    timestamp: new Date().toISOString(),
  };
}

/** Sync facts from cloud (mock implementation - replace with actual API) */
export async function pullFacts(projectId?: string): Promise<SyncResult> {
  // TODO: Replace with actual API call
  // const response = await fetch('https://api.dirgha.ai/v1/knowledge/pull', {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ deviceId: getDeviceId(), projectId, lastSync })
  // });
  // const payload: SyncPayload = await response.json();
  
  // Mock: Read from local file for now
  const { readFileSync, existsSync } = require('fs');
  const { join, homedir } = require('path');
  const syncDir = join(homedir(), '.dirgha', 'sync');
  const filename = projectId ? `facts-${projectId}.json` : 'facts-global.json';
  const filepath = join(syncDir, filename);
  
  if (!existsSync(filepath)) {
    return {
      uploaded: 0,
      downloaded: 0,
      conflicts: 0,
      timestamp: new Date().toISOString(),
    };
  }
  
  const payload: SyncPayload = JSON.parse(readFileSync(filepath, 'utf8'));
  const imported = importFacts(payload);
  
  return {
    uploaded: 0,
    downloaded: imported,
    conflicts: 0,
    timestamp: new Date().toISOString(),
  };
}

/** Get sync status */
export function getSyncStatus(projectId?: string): { localFacts: number; lastSync: string | null } {
  const db = getDB();
  
  let whereClause = '';
  const params: any[] = [];
  
  if (projectId) {
    whereClause = 'WHERE project_id = ?';
    params.push(projectId);
  }
  
  const count = db.prepare(`SELECT COUNT(*) as n FROM curated_facts ${whereClause}`).get(...params) as { n: number };
  
  // Check last sync time from local file
  const { readFileSync, existsSync } = require('fs');
  const { join, homedir } = require('path');
  const syncDir = join(homedir(), '.dirgha', 'sync');
  const filename = projectId ? `facts-${projectId}.json` : 'facts-global.json';
  const filepath = join(syncDir, filename);
  
  let lastSync: string | null = null;
  if (existsSync(filepath)) {
    try {
      const payload: SyncPayload = JSON.parse(readFileSync(filepath, 'utf8'));
      lastSync = payload.lastSync;
    } catch { /* ignore */ }
  }
  
  return {
    localFacts: count.n,
    lastSync,
  };
}
