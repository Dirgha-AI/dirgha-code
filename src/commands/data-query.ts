/**
 * /query command — Execute data query
 * Production-validated
 * Sprint 13: CLI Polish
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { getDB } from '../session/db.js';

export function registerDataQueryCommand(program: Command): void {
  program
    .command('query-data <sql>')
    .alias('dq')
    .description('Execute SQL query on local database')
    .option('-l, --limit <n>', 'Row limit', '100')
    .option('--json', 'Output as JSON')
    .option('--csv', 'Output as CSV')
    .option('-s, --source <source>', 'Data source', 'local')
    .action(async (sql: string, options) => {
      if (!sql.toLowerCase().startsWith('select')) {
        console.log(chalk.yellow('⚠️ Only SELECT queries allowed'));
        return;
      }

      const db = getDB();
      const limit = parseInt(options.limit);
      
      try {
        const stmt = db.prepare(sql);
        const rows = stmt.all().slice(0, limit);
        
        if (rows.length === 0) {
          console.log(chalk.dim('No results'));
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(rows, null, 2));
        } else if (options.csv) {
          const keys = Object.keys(rows[0] as object);
          console.log(keys.join(','));
          for (const r of rows as any[]) {
            console.log(keys.map(k => JSON.stringify(r[k])).join(','));
          }
        } else {
          // Table format
          const keys = Object.keys(rows[0] as object);
          console.log(chalk.bold(keys.join(' | ')));
          console.log(chalk.dim('─'.repeat(60)));
          for (const r of (rows as any[]).slice(0, 20)) {
            console.log(keys.map(k => String(r[k]).slice(0, 15).padEnd(15)).join(' | '));
          }
          if (rows.length > 20) {
            console.log(chalk.dim(`... and ${rows.length - 20} more rows`));
          }
        }
        
        console.log(chalk.dim(`\n${rows.length} rows`));
      } catch (e) {
        console.log(chalk.red(`Query error: ${e instanceof Error ? e.message : String(e)}`));
      }
    });
}
