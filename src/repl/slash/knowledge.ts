/**
 * repl/slash/knowledge.ts — Knowledge graph slash commands
 * Sprint 7: Curate and Query for REPL mode
 */
import type { SlashCommand, ReplContext } from './types.js';
import chalk from 'chalk';
import { getDB } from '../../session/db.js';
import { randomUUID } from 'crypto';
import { resolve, relative } from 'path';
import fs from 'fs';

/** Generate simple embedding for semantic search */
function generateEmbedding(text: string): number[] {
  const hash = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const dims = 64;
  return Array.from({ length: dims }, (_, i) => Math.sin(hash + i * 0.5) / dims);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

function ensureSchema(): void {
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
    CREATE TABLE IF NOT EXISTS fact_files (
      fact_id TEXT,
      file_path TEXT,
      line_start INTEGER,
      line_end INTEGER,
      PRIMARY KEY (fact_id, file_path),
      FOREIGN KEY (fact_id) REFERENCES curated_facts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_facts_project ON curated_facts(project_id);
    CREATE INDEX IF NOT EXISTS idx_facts_tags ON curated_facts(tags);
  `);
}

export const curateCommand: SlashCommand = {
  name: 'curate',
  description: 'Curate knowledge to the knowledge graph',
  args: '<content> [--tags tag1,tag2] [--files path1,path2]',
  category: 'memory',
  handler: async (args: string, ctx: ReplContext) => {
    if (!args.trim()) {
      return chalk.red('Usage: /curate <content> [--tags tag1,tag2] [--files path1,path2]');
    }

    ensureSchema();
    const db = getDB();

    // Parse args
    let content = args;
    const tags: string[] = [];
    const files: string[] = [];

    const tagsMatch = args.match(/--tags?\s+([\w,]+)/);
    if (tagsMatch) {
      tags.push(...tagsMatch[1].split(','));
      content = content.replace(tagsMatch[0], '').trim();
    }

    const filesMatch = args.match(/--files?\s+(\S+)/);
    if (filesMatch) {
      files.push(...filesMatch[1].split(','));
      content = content.replace(filesMatch[0], '').trim();
    }

    // Get project context
    let projectId: string | undefined;
    const ctxPath = `${process.cwd()}/.dirgha/context.json`;
    try {
      const projCtx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
      projectId = projCtx.projectId;
    } catch { /* no project */ }

    const id = randomUUID();
    const now = new Date().toISOString();
    const embedding = generateEmbedding(content);

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

    for (const f of files) {
      db.prepare(`
        INSERT INTO fact_files (fact_id, file_path, line_start, line_end)
        VALUES (?, ?, ?, ?)
      `).run(id, resolve(f), null, null);
    }

    let out = chalk.green('✓ Curated fact') + '\n';
    out += chalk.dim(`  ID: ${id.slice(0, 8)}...`) + '\n';
    if (tags.length) out += chalk.dim(`  Tags: ${tags.join(', ')}`) + '\n';
    if (files.length) out += chalk.dim(`  Files: ${files.join(', ')}`) + '\n';
    if (projectId) out += chalk.dim(`  Project: ${projectId.slice(0, 8)}...`);
    return out;
  },
};

export const queryCommand: SlashCommand = {
  name: 'query',
  description: 'Search the knowledge graph',
  args: '<query> [--tags tag1,tag2] [--limit N] [--keyword]',
  category: 'memory',
  handler: async (args: string, ctx: ReplContext) => {
    if (!args.trim()) {
      return chalk.red('Usage: /query <query> [--tags tag1,tag2] [--limit N] [--keyword]');
    }

    const db = getDB();

    // Parse args
    let queryStr = args;
    const tags: string[] = [];
    let limit = 5;
    let keywordMode = false;

    const tagsMatch = args.match(/--tags?\s+([\w,]+)/);
    if (tagsMatch) {
      tags.push(...tagsMatch[1].split(','));
      queryStr = queryStr.replace(tagsMatch[0], '').trim();
    }

    const limitMatch = args.match(/--limit\s+(\d+)/);
    if (limitMatch) {
      limit = parseInt(limitMatch[1], 10);
      queryStr = queryStr.replace(limitMatch[0], '').trim();
    }

    if (args.includes('--keyword')) {
      keywordMode = true;
      queryStr = queryStr.replace('--keyword', '').trim();
    }

    // Get project context
    let projectId: string | undefined;
    const ctxPath = `${process.cwd()}/.dirgha/context.json`;
    try {
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

    if (tags.length) {
      whereClause += ` AND (${tags.map(() => `tags LIKE ?`).join(' OR ')})`;
      tags.forEach(t => params.push(`%"${t}"%`));
    }

    const facts = db.prepare(`
      SELECT id, content, embedding, created_at, tags, project_id
      FROM curated_facts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT 1000
    `).all(...params) as any[];

    if (facts.length === 0) {
      return chalk.dim('No facts found.');
    }

    let results: { fact: any; score: number; files: string[] }[];

    if (keywordMode) {
      const keywords = queryStr.toLowerCase().split(/\s+/);
      results = facts.map((f) => {
        const content = f.content.toLowerCase();
        const matches = keywords.filter((k) => content.includes(k)).length;
        return {
          fact: { ...f, tags: JSON.parse(f.tags || '[]') },
          score: matches / keywords.length,
          files: [],
        };
      }).filter((r) => r.score > 0);
    } else {
      const queryEmbedding = generateEmbedding(queryStr);
      results = facts
        .filter((f) => f.embedding)
        .map((f) => ({
          fact: { ...f, tags: JSON.parse(f.tags || '[]') },
          score: cosineSimilarity(
            queryEmbedding,
            Array.from(new Float32Array(f.embedding.buffer, f.embedding.byteOffset, f.embedding.byteLength / 4))
          ),
          files: [],
        }));
    }

    const topResults = results.sort((a, b) => b.score - a.score).slice(0, limit);

    for (const r of topResults) {
      const files = db.prepare('SELECT file_path FROM fact_files WHERE fact_id = ?').all(r.fact.id) as any[];
      r.files = files.map((f) => relative(process.cwd(), f.file_path));
    }

    if (topResults.length === 0) {
      return chalk.dim('No matching facts found.');
    }

    let out = chalk.bold(`\nFound ${topResults.length} result(s):\n\n`);

    for (const r of topResults) {
      const scoreColor = r.score > 0.7 ? chalk.green : r.score > 0.4 ? chalk.yellow : chalk.dim;
      out += `${scoreColor(`[${(r.score * 100).toFixed(1)}%]`)} ${r.fact.content.slice(0, 80)}${r.fact.content.length > 80 ? '...' : ''}\n`;
      if (r.files.length) out += chalk.dim(`  Files: ${r.files.join(', ')}`) + '\n';
      if (r.fact.tags?.length) out += chalk.dim(`  Tags: ${r.fact.tags.join(', ')}`) + '\n';
      out += '\n';
    }

    return out;
  },
};

// ── PAL Knowledge Base Commands ──────────────────────────────────────────────

const wikiCommand: SlashCommand = {
  name: 'knowledge',
  description: 'Knowledge base: ingest, compile, lint, list, show <slug>',
  args: '<sub> [args]',
  category: 'knowledge',
  handler: async (args, ctx) => {
    const parts = args.trim().split(/\s+/);
    const sub = parts[0] ?? 'list';
    const rest = parts.slice(1).join(' ');

    if (sub === 'list') {
      const { listArticles } = await import('../../knowledge/wiki.js');
      const { listRaw } = await import('../../knowledge/raw.js');
      const articles = listArticles();
      const raw = listRaw();
      const uncompiled = raw.filter(r => !r.compiled).length;
      let out = '\n';
      out += chalk.bold(`  Knowledge Base: ${articles.length} articles, ${raw.length} raw docs (${uncompiled} uncompiled)\n\n`);
      for (const slug of articles.slice(0, 20)) {
        out += `  ${chalk.cyan(slug)}\n`;
      }
      if (articles.length > 20) out += chalk.dim(`  … and ${articles.length - 20} more\n`);
      return out;
    }

    if (sub === 'show') {
      const { getArticle } = await import('../../knowledge/wiki.js');
      const slug = rest.trim();
      if (!slug) return chalk.red('Usage: /knowledge show <slug>');
      const article = getArticle(slug);
      if (!article) return chalk.red(`Article not found: ${slug}`);
      return '\n' + article.slice(0, 2000) + (article.length > 2000 ? '\n…(truncated)' : '');
    }

    if (sub === 'compile') {
      const { runCompiler } = await import('../../knowledge/compiler.js');
      const model = ctx.model ?? 'auto';
      const lines: string[] = [''];
      const result = await runCompiler(model, (line) => {
        lines.push(line);
        process.stdout.write(line + '\n');
      });
      lines.push(`\n  Done: ${result.compiled} compiled, ${result.failed} failed`);
      return lines.join('\n');
    }

    if (sub === 'lint') {
      const { runLinter, generateLintReport, writeLintReport } = await import('../../knowledge/linter.js');
      const issues = runLinter();
      writeLintReport(issues);
      const report = generateLintReport(issues);
      return '\n' + report.slice(0, 3000);
    }

    if (sub === 'ingest') {
      const { ingest } = await import('../../knowledge/raw.js');
      if (!rest) return chalk.red('Usage: /knowledge ingest <file-path> [title]');
      const [filePath, ...titleParts] = rest.split(' ');
      const title = (titleParts.join(' ') || filePath) ?? 'Untitled';
      try {
        const content = (await import('fs')).readFileSync(filePath!, 'utf8');
        const id = ingest(content, { title, source: filePath!, tags: [] });
        return chalk.green(`✓ Ingested: ${id.slice(0, 8)} — run /knowledge compile to process`);
      } catch (err) {
        return chalk.red(`✗ ${(err as Error).message}`);
      }
    }

    if (sub === 'remote') {
      const { setWikiRemote, pullWiki } = await import('../../sync/wiki-git.js');
      if (!rest) return chalk.dim('Usage: /knowledge remote <git-url>  — or  /knowledge remote pull');
      if (rest === 'pull') {
        const r = pullWiki();
        return r.pulled ? chalk.green('✓ Wiki pulled from remote') : chalk.dim(`Wiki pull: ${r.message}`);
      }
      const ok = setWikiRemote(rest.trim());
      return ok ? chalk.green(`✓ Wiki remote set: ${rest.trim()}`) : chalk.red('Failed to set wiki remote');
    }

    return chalk.dim(`Unknown sub-command: ${sub}. Try: list | show <slug> | compile | lint | ingest <file> | remote <url>`);
  },
};

export const knowledgeCommands: SlashCommand[] = [curateCommand, queryCommand, wikiCommand];
