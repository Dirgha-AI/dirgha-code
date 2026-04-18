/**
 * /scratchpad command — View execution log
 * Production-validated
 * Sprint 13: CLI Polish
 */
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_PATH = path.join(os.homedir(), '.dirgha', 'scratchpad.log');

export function registerScratchpadCommand(program: Command): void {
  const pad = program.command('scratchpad').alias('pad').description('Execution log and scratchpad');

  pad
    .command('show')
    .alias('view')
    .description('Show execution log')
    .option('-n, --lines <n>', 'Number of lines', '50')
    .action((options) => {
      if (!fs.existsSync(LOG_PATH)) {
        console.log(chalk.dim('No execution log yet'));
        return;
      }
      
      const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
      const n = parseInt(options.lines);
      const recent = lines.slice(-n);
      
      console.log(chalk.bold(`Last ${recent.length} entries:\n`));
      
      for (const line of recent) {
        try {
          const entry = JSON.parse(line);
          const time = new Date(entry.ts).toLocaleTimeString();
          const color = entry.level === 'error' ? chalk.red : 
                       entry.level === 'warn' ? chalk.yellow : chalk.dim;
          console.log(`${chalk.gray(time)} ${color(entry.cmd || entry.level)} ${entry.msg || ''}`);
        } catch {
          console.log(chalk.dim(line.slice(0, 80)));
        }
      }
    });

  pad
    .command('clear')
    .description('Clear execution log')
    .action(() => {
      if (fs.existsSync(LOG_PATH)) {
        fs.unlinkSync(LOG_PATH);
      }
      console.log(chalk.green('✓ Scratchpad cleared'));
    });

  pad
    .command('write <text>')
    .description('Write note to scratchpad')
    .action((text: string) => {
      fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
      const entry = { ts: Date.now(), level: 'note', msg: text, cmd: 'scratch' };
      fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
      console.log(chalk.green('✓ Noted'));
    });

  pad
    .command('search <query>')
    .description('Search scratchpad entries')
    .action((query: string) => {
      if (!fs.existsSync(LOG_PATH)) {
        console.log(chalk.dim('No log to search'));
        return;
      }
      
      const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
      const matches = lines.filter(l => l.toLowerCase().includes(query.toLowerCase()));
      
      console.log(chalk.bold(`${matches.length} matches:\n`));
      for (const line of matches.slice(-20)) {
        try {
          const entry = JSON.parse(line);
          const time = new Date(entry.ts).toLocaleTimeString();
          console.log(`${chalk.gray(time)} ${entry.cmd || entry.level}: ${entry.msg || ''}`);
        } catch {
          console.log(chalk.dim(line.slice(0, 80)));
        }
      }
    });
}

// Export for use by other commands
export function logExecution(cmd: string, msg: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  const entry = { ts: Date.now(), level, cmd, msg };
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
}
