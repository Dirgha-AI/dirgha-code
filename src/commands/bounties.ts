// SPDX-License-Identifier: BUSL-1.1
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { execCmd } from '../utils/safe-exec.js';

const API = process.env.DIRGHA_API_URL || 'https://api.dirgha.ai';

export function registerBountiesCommand(program: Command): void {
  const bounties = program
    .command('bounties')
    .description('Browse and view bounties');

  bounties
    .command('list')
    .description('List available bounties')
    .option('--tag <tag>', 'Filter by tag (repeatable)', collect, [])
    .option('--min <n>', 'Minimum reward', parseFloat)
    .option('--json', 'Output raw JSON')
    .action(async (options) => {
      try {
        const params = new URLSearchParams();
        options.tag.forEach((t: string) => params.append('tag', t));
        if (options.min !== undefined) params.set('min', String(options.min));
        
        const res = await fetch(`${API}/api/bounties?${params}`);
        
        if (!res.ok) {
          console.log(chalk.yellow('Bounties backend unavailable — opening https://dirgha.ai/bounties'));
          const platform = process.platform;
          if (platform === 'darwin') execCmd('open', ['https://dirgha.ai/bounties']);
          else if (platform === 'win32') execCmd('cmd', ['/c', 'start', 'https://dirgha.ai/bounties']);
          else execCmd('xdg-open', ['https://dirgha.ai/bounties']);
          return;
        }
        
        const data = await res.json();
        
        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        
        if (!data.bounties?.length) {
          console.log(chalk.yellow('No bounties found matching criteria'));
          return;
        }
        
        const table = new Table({
          head: [chalk.cyan('ID'), chalk.cyan('Title'), chalk.cyan('Reward'), chalk.cyan('Tags')],
          colWidths: [12, 40, 12, 30]
        });
        
        data.bounties.forEach((bounty: any) => {
          table.push([
            bounty.id,
            bounty.title,
            `$${bounty.reward}`,
            bounty.tags?.join(', ') || '-'
          ]);
        });
        
        console.log(table.toString());
      } catch (err) {
        console.log(chalk.red('Failed to fetch bounties'));
        process.exit(1);
      }
    });

  bounties
    .command('show <id>')
    .description('Show bounty details')
    .option('--json', 'Output raw JSON')
    .action(async (id, options) => {
      try {
        const res = await fetch(`${API}/api/bounties/${id}`);
        if (!res.ok) throw new Error('Bounty not found');
        
        const data = await res.json();
        
        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(chalk.cyan(`\n🎯 ${data.title}\n`));
          console.log(`ID: ${data.id}`);
          console.log(`Reward: $${data.reward}`);
          if (data.description) console.log(`\n${data.description}`);
          if (data.tags?.length) console.log(`\nTags: ${data.tags.join(', ')}`);
          console.log();
        }
      } catch (err) {
        console.log(chalk.red('Bounty not found'));
        process.exit(1);
      }
    });

  bounties
    .command('open <id>')
    .description('Open bounty in browser')
    .action((id) => {
      const url = `https://dirgha.ai/bounties/${id}`;
      const platform = process.platform;
      if (platform === 'darwin') execCmd('open', [url]);
      else if (platform === 'win32') execCmd('cmd', ['/c', 'start', url]);
      else execCmd('xdg-open', [url]);
    });
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
