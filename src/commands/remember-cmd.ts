/**
 * /remember command — Quick curate fact
 * Production-validated
 * Sprint 13: CLI Polish
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { randomUUID } from 'crypto';
import { getDB } from '../session/db.js';

export function registerRememberCmd(program: Command): void {
  program
    .command('remember <content>')
    .description('Quick curate fact to knowledge graph')
    .option('-t, --tags <tags>', 'Comma-separated tags')
    .option('-p, --priority <n>', 'Priority 1-10', '5')
    .option('--no-embed', 'Skip embedding generation')
    .action(async (content: string, options) => {
      const db = getDB();
      const id = randomUUID();
      const now = new Date().toISOString();
      const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [];

      // Ensure table exists
      db.prepare(`
        CREATE TABLE IF NOT EXISTS curated_facts (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          embedding BLOB,
          created_at TEXT,
          updated_at TEXT,
          tags TEXT,
          priority INTEGER DEFAULT 5
        )
      `).run();

      db.prepare(`
        INSERT INTO curated_facts (id, content, created_at, updated_at, tags, priority)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, content, now, now, JSON.stringify(tags), parseInt(options.priority));

      console.log(chalk.green('✓ Remembered'));
      console.log(chalk.dim(`  ${content.slice(0, 60)}${content.length > 60 ? '...' : ''}`));
      console.log(chalk.dim(`  ID: ${id.slice(0, 8)}...`));
      if (tags.length > 0) {
        console.log(chalk.dim(`  Tags: ${tags.join(', ')}`));
      }
    });
}
