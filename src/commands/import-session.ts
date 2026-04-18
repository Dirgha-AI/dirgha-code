/**
 * /import command — Session import
 * Production-validated
 * Sprint 13: CLI Polish
 */
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import { getDB } from '../session/db.js';
import { randomUUID } from 'crypto';

export function registerImportCommand(program: Command): void {
  program
    .command('import <file>')
    .description('Import session from json')
    .option('-t, --title <title>', 'Session title override')
    .action(async (file: string, options) => {
      const db = getDB();
      
      if (!fs.existsSync(file)) {
        console.log(chalk.red(`File not found: ${file}`));
        return;
      }

      let data: any;
      try {
        data = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        console.log(chalk.red('Invalid JSON file'));
        return;
      }

      const sessions = Array.isArray(data) ? data : [data];
      let imported = 0;

      for (const s of sessions) {
        const id = s.id || randomUUID();
        const now = new Date().toISOString();
        
        db.prepare(`
          INSERT OR REPLACE INTO sessions 
          (id, title, model, tokens, created_at, updated_at, type, working_dir)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          options.title || s.title || 'Imported',
          s.model || 'unknown',
          s.tokens || 0,
          s.created_at || now,
          now,
          s.type || 'imported',
          s.working_dir || process.cwd()
        );

        // Import messages
        if (s.messages?.length) {
          const insertMsg = db.prepare(`
            INSERT INTO messages (session_id, role, content, tool_calls, tool_results, tokens, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          for (const m of s.messages) {
            insertMsg.run(
              id, m.role, m.content, 
              m.tool_calls ? JSON.stringify(m.tool_calls) : null,
              m.tool_results ? JSON.stringify(m.tool_results) : null,
              m.tokens || 0, m.created_at || now
            );
          }
        }
        imported++;
      }

      console.log(chalk.green(`✓ Imported ${imported} session(s)`));
    });
}
