/**
 * Query Command - Search knowledge graph
 * @module commands/query
 * 
 * Sprint 7: Knowledge Graph Foundation
 * Unified query pattern
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { relative } from 'path';
import fs from 'fs';
import { getDB } from '../session/db.js';

interface Fact {
  id: string;
  content: string;
  embedding?: Buffer;
  createdAt: string;
  tags: string[];
  projectId?: string;
}

interface QueryResult {
  fact: Fact;
  score: number;
  files: string[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function bufferToFloatArray(buf: Buffer): number[] {
  const arr = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(arr);
}

export function registerQueryCommand(program: Command): void {
  program
    .command('query <query>')
    .description('Query the knowledge graph')
    .option('-l, --limit <n>', 'Maximum results', '10')
    .option('-t, --tags <tags...>', 'Filter by tags')
    .option('--keyword', 'Use keyword search instead of semantic')
    .option('-p, --project', 'Search only current project')
    .action(async (query: string, options) => {
      const db = getDB();
      const limit = Number(options.limit) || 10;

      let projectId: string | undefined;
      if (options.project) {
        // Get project from .dirgha/context.json if exists
        const ctxPath = `${process.cwd()}/.dirgha/context.json`;
        try {
          const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
          projectId = ctx.projectId;
        } catch {
          console.log(chalk.yellow('Warning: No project context found. Run `dirgha init` first.'));
        }
      }

      // Build query
      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      if (projectId) {
        whereClause += ' AND project_id = ?';
        params.push(projectId);
      }

      if (options.tags?.length > 0) {
        // SQLite JSON array contains check
        whereClause += ` AND (
          ${options.tags.map((t: string) => `tags LIKE '%"${t}"%'`).join(' OR ')}
        )`;
      }

      const facts = db.prepare(`
        SELECT id, content, embedding, created_at, tags, project_id
        FROM curated_facts
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT 1000
      `).all(...params) as any[];

      if (facts.length === 0) {
        console.log(chalk.dim('No facts found.'));
        return;
      }

      let results: QueryResult[];

      if (options.keyword) {
        // Keyword search
        const keywords = query.toLowerCase().split(/\s+/);
        results = facts.map((f) => {
          const content = f.content.toLowerCase();
          const matches = keywords.filter((k: string) => content.includes(k)).length;
          return {
            fact: {
              id: f.id,
              content: f.content,
              embedding: f.embedding,
              createdAt: f.created_at,
              tags: JSON.parse(f.tags || '[]'),
              projectId: f.project_id,
            },
            score: matches / keywords.length,
            files: [],
          };
        }).filter(r => r.score > 0);
      } else {
        // Semantic search
        const queryEmbedding = await generateSimpleEmbedding(query);
        results = facts
          .filter((f) => f.embedding)
          .map((f) => ({
            fact: {
              id: f.id,
              content: f.content,
              embedding: f.embedding,
              createdAt: f.created_at,
              tags: JSON.parse(f.tags || '[]'),
              projectId: f.project_id,
            },
            score: cosineSimilarity(queryEmbedding, bufferToFloatArray(f.embedding)),
            files: [],
          }));
      }

      // Fetch files for top results
      const topResults = results.sort((a, b) => b.score - a.score).slice(0, limit);
      for (const r of topResults) {
        const files = db.prepare('SELECT file_path FROM fact_files WHERE fact_id = ?').all(r.fact.id) as any[];
        r.files = files.map((f) => relative(process.cwd(), f.file_path));
      }

      // Display
      if (topResults.length === 0) {
        console.log(chalk.dim('No matching facts found.'));
        return;
      }

      console.log(chalk.bold(`\nFound ${topResults.length} result(s):\n`));

      for (const r of topResults) {
        const scoreColor = r.score > 0.7 ? chalk.green : r.score > 0.4 ? chalk.yellow : chalk.dim;
        console.log(`${scoreColor(`[${(r.score * 100).toFixed(1)}%]`)} ${r.fact.content.slice(0, 80)}${r.fact.content.length > 80 ? '...' : ''}`);
        
        if (r.files.length > 0) {
          console.log(chalk.dim(`  Files: ${r.files.join(', ')}`));
        }
        if (r.fact.tags.length > 0) {
          console.log(chalk.dim(`  Tags: ${r.fact.tags.join(', ')}`));
        }
        console.log();
      }
    });
}

/** Simple embedding for semantic search */
async function generateSimpleEmbedding(text: string): Promise<number[]> {
  const hash = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const dims = 64;
  return Array.from({ length: dims }, (_, i) => 
    Math.sin(hash + i * 0.5) / dims
  );
}
