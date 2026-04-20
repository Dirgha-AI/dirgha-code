// SPDX-License-Identifier: BUSL-1.1
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { execCmd } from '../utils/safe-exec.js';

const API = process.env.DIRGHA_API_URL || 'https://api.dirgha.ai';

export function registerJobsCommand(program: Command): void {
  const jobs = program
    .command('jobs')
    .description('Browse and view job listings');

  jobs
    .command('list')
    .description('List available jobs')
    .option('--tag <tag>', 'Filter by tag (repeatable)', collect, [])
    .option('--min <n>', 'Minimum hourly rate', parseFloat)
    .option('--json', 'Output raw JSON')
    .action(async (options) => {
      try {
        const params = new URLSearchParams();
        options.tag.forEach((t: string) => params.append('tag', t));
        if (options.min !== undefined) params.set('min', String(options.min));
        
        const res = await fetch(`${API}/api/jobs?${params}`);
        
        if (!res.ok) {
          console.log(chalk.yellow('Jobs backend unavailable — opening https://dirgha.ai/jobs'));
          const platform = process.platform;
          if (platform === 'darwin') execCmd('open', ['https://dirgha.ai/jobs']);
          else if (platform === 'win32') execCmd('cmd', ['/c', 'start', 'https://dirgha.ai/jobs']);
          else execCmd('xdg-open', ['https://dirgha.ai/jobs']);
          return;
        }
        
        const data = await res.json();
        
        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
          return;
        }
        
        if (!data.jobs?.length) {
          console.log(chalk.yellow('No jobs found matching criteria'));
          return;
        }
        
        const table = new Table({
          head: [chalk.cyan('ID'), chalk.cyan('Title'), chalk.cyan('Rate'), chalk.cyan('Tags')],
          colWidths: [12, 40, 10, 30]
        });
        
        data.jobs.forEach((job: any) => {
          table.push([
            job.id,
            job.title,
            `$${job.hourly_rate}`,
            job.tags?.join(', ') || '-'
          ]);
        });
        
        console.log(table.toString());
      } catch (err) {
        console.log(chalk.red('Failed to fetch jobs'));
        process.exit(1);
      }
    });

  jobs
    .command('show <id>')
    .description('Show job details')
    .option('--json', 'Output raw JSON')
    .action(async (id, options) => {
      try {
        const res = await fetch(`${API}/api/jobs/${id}`);
        if (!res.ok) throw new Error('Job not found');
        
        const data = await res.json();
        
        if (options.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(chalk.cyan(`\n💼 ${data.title}\n`));
          console.log(`ID: ${data.id}`);
          console.log(`Rate: $${data.hourly_rate}/hr`);
          console.log(`Duration: ${data.duration_weeks} weeks`);
          if (data.description) console.log(`\n${data.description}`);
          if (data.tags?.length) console.log(`\nTags: ${data.tags.join(', ')}`);
          console.log();
        }
      } catch (err) {
        console.log(chalk.red('Job not found'));
        process.exit(1);
      }
    });

  jobs
    .command('open <id>')
    .description('Open job in browser')
    .action((id) => {
      const url = `https://dirgha.ai/jobs/${id}`;
      const platform = process.platform;
      if (platform === 'darwin') execCmd('open', [url]);
      else if (platform === 'win32') execCmd('cmd', ['/c', 'start', url]);
      else execCmd('xdg-open', [url]);
    });
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
