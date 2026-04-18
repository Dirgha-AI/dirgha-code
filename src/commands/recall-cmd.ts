/**
 * /recall command — Quick knowledge search
 * Production-validated
 * Sprint 13: CLI Polish
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { getDB } from '../session/db.js';

export function registerRecallCmd(program: Command): void {
  program
    .command('recall [query]')
    .description('Quick search of curated facts')
    .option('-t, --tags <tags>', 'Filter by comma-separated tags')
    .option('-l, --limit <n>', 'Max results', '10')
    .option('--recent', 'Show most recent first (ignore query)')
    .action(async (query: string | undefined, options) => {
      const db = getDB();
      const limit = parseInt(options.limit);
      const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [];

      let results: any[];

      if (options.recent || !query) {
        // List recent facts
        results = db.prepare(`
          SELECT id, content, created_at, tags, priority
          FROM curated_facts
          ORDER BY created_at DESC
          LIMIT ?
        `).all(limit);
      } else {
        // Keyword search
        const keywords = query.toLowerCase().split(/\s+/);
        const all = db.prepare(`
          SELECT id, content, created_at, tags, priority
          FROM curated_facts
        `).all() as any[];
        
        results = all
          .map(f => {
            const content = f.content.toLowerCase();
            const matches = keywords.filter(k => content.includes(k)).length;
            return { ...f, score: matches / keywords.length };
          })
          .filter(f => f.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      }

      if (results.length === 0) {
        console.log(chalk.yellow('No facts found'));
        return;
      }

      console.log(chalk.bold(`\n${results.length} facts:\n`));
      
      for (const r of results) {
        const age = Date.now() - new Date(r.created_at).getTime();
        const ageStr = age < 60000 ? 'now' : 
                      age < 3600000 ? `${Math.floor(age/60000)}m` :
                      age < 86400000 ? `${Math.floor(age/3600000)}h` :
                      `${Math.floor(age/86400000)}d`;
        
        const priorityColor = r.priority >= 8 ? chalk.red : r.priority >= 5 ? chalk.yellow : chalk.dim;
        
        console.log(`${priorityColor(`[${r.priority}]`)} ${r.content.slice(0, 70)}${r.content.length > 70 ? '...' : ''}`);
        console.log(chalk.gray(`   ${ageStr} ago · ${r.id.slice(0, 8)}`));
        
        if (r.tags) {
          const tagList = JSON.parse(r.tags);
          if (tagList.length > 0) {
            console.log(chalk.cyan(`   #${tagList.join(' #')}`));
          }
        }
        console.log();
      }
    });
}
