import chalk from 'chalk';
import { SprintJournal } from '../../sprint/journal.js';
import type { SlashCommand } from './types.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const JOURNALS_DIR = path.join(os.homedir(), '.dirgha', 'journals');

function getUsage(): string {
  return [
    'Usage: /sprint <command>',
    '',
    'Commands:',
    '  status [id]           Show sprint status (or list all if no id)',
    '  pause <id>            Pause a running sprint',
    '  resume <id>           Resume a paused sprint',
    '  log <id> [n]          Show last n events (default 20)',
    '  skip <taskId> --sprint <id>  Skip a task in a sprint',
    '  abort <id>            Abort a sprint',
    '  list                  List all sprints',
    '  help                  Show this help message'
  ].join('\n');
}

function parseFlags(args: string[]): { flags: Record<string, string>; rest: string[] } {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        flags[key] = value;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      rest.push(args[i]);
    }
  }
  
  return { flags, rest };
}

function listAllSprints(): string {
  try {
    if (!fs.existsSync(JOURNALS_DIR)) {
      return 'No sprints found. Journals directory does not exist.';
    }
    
    const files = fs.readdirSync(JOURNALS_DIR).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      return 'No sprints found.';
    }

    const rows = files.map(file => {
      const id = file.replace('.json', '');
      const journalPath = path.join(JOURNALS_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
        const status = data.status || 'unknown';
        const color = status === 'running' ? chalk.green : 
                     status === 'paused' ? chalk.yellow : 
                     status === 'aborted' ? chalk.red : chalk.gray;
        return `  ${id.padEnd(20)} ${color(status)}`;
      } catch {
        return `  ${id.padEnd(20)} ${chalk.red('error')}`;
      }
    });

    return ['Sprints:', ...rows].join('\n');
  } catch (err) {
    return `Error listing sprints: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export const sprintCommands: SlashCommand[] = [
  {
    name: '/sprint',
    description: 'Manage sprints: /sprint status [id] | pause <id> | resume <id> | log <id> | skip <taskId> --sprint <id> | abort <id> | list',
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed) {
        return getUsage();
      }

      const [sub, ...rest] = trimmed.split(/\s+/);

      if (sub === 'help') {
        return getUsage();
      }

      if (sub === 'list') {
        return listAllSprints();
      }

      if (sub === 'status') {
        if (rest.length === 0) {
          return listAllSprints();
        }
        const id = rest[0];
        try {
          const journal = new SprintJournal(id);
          const progress = journal.getProgress();
          return [
            `Sprint: ${chalk.cyan(id)}`,
            `Status: ${progress.status}`,
            `Progress: ${progress.tasks.filter(t => t.status === 'completed').length}/${progress.tasks.length} tasks`,
            `Current: ${progress.currentTask || 'none'}`
          ].join('\n');
        } catch (err) {
          return `Error loading sprint ${id}: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      if (sub === 'pause') {
        if (rest.length === 0) return 'Usage: /sprint pause <id>';
        const id = rest[0];
        try {
          const journal = new SprintJournal(id);
          journal.setSprintStatus(id, 'paused');
          const { spawn } = await import('node:child_process');
          spawn('pm2', ['stop', id!], { stdio: 'ignore' });
          return 'paused';
        } catch (err) {
          return `Error pausing sprint: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      if (sub === 'resume') {
        if (rest.length === 0) return 'Usage: /sprint resume <id>';
        const id = rest[0];
        try {
          const journal = new SprintJournal(id);
          journal.setSprintStatus(id, 'running');
          return `use: dirgha sprint resume ${id} --manifest <path>`;
        } catch (err) {
          return `Error resuming sprint: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      if (sub === 'log') {
        if (rest.length === 0) return 'Usage: /sprint log <id> [n]';
        const id = rest[0];
        const n = rest.length > 1 ? parseInt(rest[1], 10) : 20;
        try {
          const journal = new SprintJournal(id);
          const events = journal.getEvents(n);
          if (events.length === 0) return 'No events found.';
          
          return events.map(e => {
            const ts = e.ts;
            return `${ts}|${e.type}|${e.taskId || ''}|${JSON.stringify(e.payload || {})}`;
          }).join('\n');
        } catch (err) {
          return `Error reading log: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      if (sub === 'skip') {
        const { flags, rest: restArgs } = parseFlags(rest);
        if (!flags.sprint || restArgs.length === 0) {
          return 'Usage: /sprint skip <taskId> --sprint <id>';
        }
        const taskId = restArgs[0];
        const sprintId = flags.sprint;
        try {
          const journal = new SprintJournal(sprintId);
          journal.setTaskStatus(taskId, 'skipped');
          return 'skipped';
        } catch (err) {
          return `Error skipping task: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      if (sub === 'abort') {
        if (rest.length === 0) return 'Usage: /sprint abort <id>';
        const id = rest[0];
        try {
          const journal = new SprintJournal(id);
          journal.setSprintStatus(id, 'aborted');
          const { spawn } = await import('node:child_process');
          spawn('pm2', ['stop', id!], { stdio: 'ignore' });
          return 'aborted';
        } catch (err) {
          return `Error aborting sprint: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      return `Unknown subcommand: ${sub}\n${getUsage()}`;
    }
  }
];
