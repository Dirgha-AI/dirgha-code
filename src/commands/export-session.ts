/**
 * /export command — Session export (json/md)
 * Production-validated
 * Sprint 13: CLI Polish
 */
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { getDB } from '../session/db.js';

export function registerExportCommand(program: Command): void {
  program
    .command('export [sessionId]')
    .description('Export session to json or markdown')
    .option('-f, --format <fmt>', 'Format: json|md|html', 'md')
    .option('-o, --output <path>', 'Output path')
    .option('-a, --all', 'Export all sessions')
    .action(async (sessionId: string | undefined, options) => {
      const db = getDB();
      const format = options.format;
      
      let sessions: any[];
      
      if (options.all) {
        sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all();
      } else if (sessionId) {
        const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
        if (!s) { console.log(chalk.red('Session not found')); return; }
        sessions = [s];
      } else {
        // Get most recent
        const s = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 1').get();
        if (!s) { console.log(chalk.yellow('No sessions found')); return; }
        sessions = [s];
      }

      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const outPath = options.output || `dirgha-export-${timestamp}.${format === 'html' ? 'html' : format === 'json' ? 'json' : 'md'}`;

      let content = '';

      if (format === 'json') {
        const data = sessions.map(s => ({
          ...s,
          messages: db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id').all(s.id)
        }));
        content = JSON.stringify(data, null, 2);
      } else if (format === 'html') {
        const rows = sessions.flatMap(s => {
          const msgs = db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY id').all(s.id) as any[];
          return msgs.map(m => `<div class="${m.role}"><b>${m.role}</b>: ${escapeHtml(String(m.content)).slice(0, 500)}</div>`);
        }).join('\n');
        content = `<!DOCTYPE html><html><body style="font-family:monospace;padding:20px"><h1>Dirgha Export</h1>${rows}</body></html>`;
      } else {
        // Markdown
        const sections = sessions.map(s => {
          const msgs = db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY id').all(s.id) as any[];
          const body = msgs.map(m => `## ${m.role}\n\n${String(m.content).slice(0, 1000)}`).join('\n\n---\n\n');
          return `# Session: ${s.title || s.id.slice(0, 8)}\n*${s.created_at}*\n\n${body}`;
        }).join('\n\n---\n\n');
        content = `# Dirgha Export\n\n${sections}`;
      }

      fs.writeFileSync(outPath, content, 'utf8');
      console.log(chalk.green(`✓ Exported ${sessions.length} session(s)`));
      console.log(chalk.dim(`  → ${path.resolve(outPath)}`));
    });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
