// @ts-nocheck
/**
 * Curate Command - Add knowledge to the graph
 * @module commands/curate
 * 
 * Sprint 7: Knowledge Graph Foundation
 * Refactored to meet 100-line budget
 */
import { Command } from 'commander';
import { randomUUID } from 'crypto';
import chalk from 'chalk';
import { getDB } from '../session/db.js';
import { ensureSchema } from './curate/schema.js';
import { generateEmbedding, embeddingToBuffer, getEmbeddingInfo } from './curate/embeddings.js';
import { createFactFiles, persistFiles, formatFileList } from './curate/files.js';
import { resolveProjectId } from './curate/project.js';
import { storeInVss } from './curate/vss-integration.js';

export function registerCurateCommand(program: Command): void {
  program
    .command('curate <content>')
    .description('Curate knowledge to the knowledge graph')
    .option('-f, --files <paths...>', 'Files to attach')
    .option('-t, --tags <tags...>', 'Tags for categorization')
    .option('--no-embed', 'Skip generating embedding')
    .option('-p, --project', 'Associate with current project')
    .option('--provider <name>', 'Embedding provider: ollama|gateway|hash', 'auto')
    .action(async (content: string, options) => {
      ensureSchema();
      const db = getDB();
      const id = randomUUID();
      const now = new Date().toISOString();

      const { embedding, provider } = await generateEmbedding(
        content, 
        options.provider, 
        options.embed === false
      );

      const projectId = resolveProjectId(options.project);

      db.prepare(`
        INSERT INTO curated_facts (id, content, embedding, created_at, updated_at, tags, project_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        content,
        embedding ? embeddingToBuffer(embedding) : null,
        now,
        now,
        JSON.stringify(options.tags || []),
        projectId
      );

      if (embedding) {
        const stored = await storeInVss(db, id, embedding);
        if (stored) {
          console.log(chalk.dim(`  Embedding: ${embedding.length} dims (${getEmbeddingInfo().name})`));
        }
      }

      const files = createFactFiles(id, options.files || []);
      if (files.length > 0) {
        persistFiles(files);
        console.log(chalk.dim(`  Files: ${formatFileList(files, process.cwd())}`));
      }

      console.log(chalk.green('✓ Curated fact'));
      console.log(chalk.dim(`  ID: ${id.slice(0, 8)}...`));
      if (options.tags?.length > 0) {
        console.log(chalk.dim(`  Tags: ${options.tags.join(', ')}`));
      }
      if (projectId) {
        console.log(chalk.dim(`  Project: ${projectId}`));
      }
    });
}
