// @ts-nocheck

/**
 * repl/slash/memory.ts — Memory and persistence commands
 */
import chalk from 'chalk';
import { getTheme } from '../themes.js';
import type { SlashCommand } from './types.js';

export const memoryCommands: SlashCommand[] = [
  {
    name: 'remember',
    aliases: ['r'],
    description: 'Quickly curate a fact to knowledge graph (no files)',
    args: '<fact text> [--tags tag1,tag2]',
    category: 'memory',
    handler: async (args, ctx) => {
      if (!args.trim()) return chalk.red('Usage: /remember <fact> [--tags tag1,tag2]');
      
      const { getDB } = await import('../../session/db.js');
      const { randomUUID } = await import('crypto');
      const { resolve } = await import('path');
      const fs = await import('fs');
      
      // Parse tags
      let content = args;
      const tags: string[] = [];
      const tagsMatch = args.match(/--tags?\s+([\w,]+)/);
      if (tagsMatch) {
        tags.push(...tagsMatch[1].split(','));
        content = content.replace(tagsMatch[0], '').trim();
      }
      
      // Ensure schema
      const db = getDB();
      db.exec(`
        CREATE TABLE IF NOT EXISTS curated_facts (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          embedding BLOB,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          tags TEXT DEFAULT '[]',
          project_id TEXT
        );
      `);
      
      // Get project context
      let projectId: string | undefined;
      const ctxPath = `${process.cwd()}/.dirgha/context.json`;
      try {
        const projCtx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
        projectId = projCtx.projectId;
      } catch { /* no project */ }
      
      // Generate simple embedding
      const hash = content.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const embedding = Array.from({ length: 64 }, (_, i) => Math.sin(hash + i * 0.5) / 64);
      
      const id = randomUUID();
      const now = new Date().toISOString();
      
      db.prepare(`
        INSERT INTO curated_facts (id, content, embedding, created_at, updated_at, tags, project_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        content,
        Buffer.from(new Float32Array(embedding).buffer),
        now,
        now,
        JSON.stringify(tags),
        projectId
      );
      
      const t = getTheme();
      let out = `${t.success('✓')} Fact curated\n`;
      out += `  ${t.dim('ID:')} ${id.slice(0, 8)}...\n`;
      if (tags.length) out += `  ${t.dim('Tags:')} ${tags.join(', ')}\n`;
      if (projectId) out += `  ${t.dim('Project:')} ${projectId.slice(0, 8)}...`;
      return out;
    },
  },
  {
    name: 'recall',
    aliases: ['rc'],
    description: 'Quickly query knowledge graph',
    args: '<query> [--limit N] [--keyword]',
    category: 'memory',
    handler: async (args) => {
      if (!args.trim()) return chalk.red('Usage: /recall <query> [--limit N] [--keyword]');
      
      const { getDB } = await import('../../session/db.js');
      const { relative } = await import('path');
      
      // Parse args
      let queryStr = args;
      let limit = 5;
      let keywordMode = false;
      
      const limitMatch = args.match(/--limit\s+(\d+)/);
      if (limitMatch) {
        limit = parseInt(limitMatch[1], 10);
        queryStr = queryStr.replace(limitMatch[0], '').trim();
      }
      
      if (args.includes('--keyword')) {
        keywordMode = true;
        queryStr = queryStr.replace('--keyword', '').trim();
      }
      
      const db = getDB();
      
      // Get project context
      let projectId: string | undefined;
      const ctxPath = `${process.cwd()}/.dirgha/context.json`;
      try {
        const fs = await import('fs');
        const projCtx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
        projectId = projCtx.projectId;
      } catch { /* no project */ }
      
      // Build query
      let whereClause = 'WHERE 1=1';
      const params: any[] = [];
      
      if (projectId) {
        whereClause += ' AND project_id = ?';
        params.push(projectId);
      }
      
      const facts = db.prepare(`
        SELECT id, content, embedding, created_at, tags, project_id
        FROM curated_facts
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT 1000
      `).all(...params) as any[];
      
      if (facts.length === 0) {
        return chalk.dim('No facts found. Use /remember to add some.');
      }
      
      let results: { fact: any; score: number }[];
      
      if (keywordMode) {
        const keywords = queryStr.toLowerCase().split(/\s+/);
        results = facts.map((f) => {
          const content = f.content.toLowerCase();
          const matches = keywords.filter((k) => content.includes(k)).length;
          return { fact: { ...f, tags: JSON.parse(f.tags || '[]') }, score: matches / keywords.length };
        }).filter((r) => r.score > 0);
      } else {
        // Semantic search
        const hash = queryStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const queryEmbedding = Array.from({ length: 64 }, (_, i) => Math.sin(hash + i * 0.5) / 64);
        
        results = facts
          .filter((f) => f.embedding)
          .map((f) => {
            const factEmbedding = Array.from(new Float32Array(f.embedding.buffer, f.embedding.byteOffset, f.embedding.byteLength / 4));
            let dot = 0, na = 0, nb = 0;
            for (let i = 0; i < 64; i++) {
              dot += queryEmbedding[i] * factEmbedding[i];
              na += queryEmbedding[i] * queryEmbedding[i];
              nb += factEmbedding[i] * factEmbedding[i];
            }
            const score = dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
            return { fact: { ...f, tags: JSON.parse(f.tags || '[]') }, score };
          });
      }
      
      const topResults = results.sort((a, b) => b.score - a.score).slice(0, limit);
      
      if (topResults.length === 0) {
        return chalk.dim('No matching facts found.');
      }
      
      const t = getTheme();
      let out = `\n  ${t.header('Knowledge Results')}\n\n`;
      
      for (const r of topResults) {
        const scoreColor = r.score > 0.7 ? t.success : r.score > 0.4 ? t.warning : t.dim;
        out += `  ${scoreColor(`[${(r.score * 100).toFixed(0)}%]`)} ${r.fact.content.slice(0, 80)}${r.fact.content.length > 80 ? '...' : ''}\n`;
        if (r.fact.tags?.length) {
          out += `     ${t.dim('Tags:')} ${r.fact.tags.join(', ')}\n`;
        }
        out += '\n';
      }
      
      return out;
    },
  },
  {
    name: 'memory',
    description: 'Show persistent memory (MEMORY.md)',
    category: 'memory',
    handler: async () => {
      const { readMemory } = await import('../../session/memory.js');
      const content = readMemory();
      if (!content) return chalk.dim('No memory saved yet. Use /memory-add or the save_memory tool.');
      return `\n${getTheme().dim('─'.repeat(40))}\n${content}\n${getTheme().dim('─'.repeat(40))}\n`;
    },
  },
  {
    name: 'memory-add',
    aliases: ['ma'],
    description: 'Append a note to persistent memory',
    args: '<text>',
    category: 'memory',
    handler: async (args) => {
      if (!args.trim()) return chalk.red('Usage: /memory-add <text>');
      const { appendMemory } = await import('../../session/memory.js');
      appendMemory(args.trim());
      return chalk.green('✓ Saved to memory.');
    },
  },
  {
    name: 'gc',
    aliases: ['cleanup'],
    description: 'Garbage collect: prune old messages, evict stale file index, cap memories',
    category: 'memory',
    handler: async () => {
      const t = getTheme();
      let freed = 0;
      const db = await import('../../session/db.js').catch(() => null);
      if (!db) return chalk.red('SQLite not available — nothing to collect.');
      const database = db.getDB();

      const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const delMsgs = database.prepare(`DELETE FROM messages WHERE created_at < ?`).run(cutoff30);
      freed += Number(delMsgs.changes);

      const cutoff7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const delFiles = database.prepare(`DELETE FROM file_index WHERE indexed_at < ?`).run(cutoff7);
      freed += Number(delFiles.changes);

      const memCount = (database.prepare(`SELECT COUNT(*) as n FROM memories`).get() as {n: number}).n;
      let evictedMems = 0;
      if (memCount > 1000) {
        const excess = memCount - 1000;
        const evict = database.prepare(`DELETE FROM memories WHERE id IN (SELECT id FROM memories ORDER BY updated_at ASC LIMIT ?)`).run(excess);
        evictedMems = Number(evict.changes);
      }

      const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const delSessions = database.prepare(`DELETE FROM sessions WHERE updated_at < ?`).run(cutoff90);

      database.exec('VACUUM');

      const lines = [
        '',
        `  ${t.success('✓')} Garbage collection complete`,
        `  ${t.dim('Messages deleted')}  ${freed}  (older than 30 days)`,
        `  ${t.dim('Files evicted')}     ${Number(delFiles.changes)}  (not indexed in 7 days)`,
        `  ${t.dim('Memories evicted')}  ${evictedMems}  (over 1000 row cap)`,
        `  ${t.dim('Sessions pruned')}   ${Number(delSessions.changes)}  (older than 90 days)`,
        `  ${t.dim('DB vacuumed')}       ✓`,
        '',
      ];
      return lines.join('\n');
    },
  },
];
