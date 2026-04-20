// @ts-nocheck

/**
 * repl/slash/git.ts — Git version control commands
 * /diff, /commit, /git-mode, /stash, /push, /branch
 */
import chalk from 'chalk';
import type { SlashCommand } from './types.js';

/** Persisted per-process git mode: 'diff' | 'whole' | 'auto' */
let _gitMode: 'diff' | 'whole' | 'auto' = 'auto';
export function getGitMode() { return _gitMode; }

export const gitCommands: SlashCommand[] = [
  {
    name: 'diff',
    description: 'Show git diff. Flags: --staged, --stat, -- <path>',
    args: '[--staged] [--stat] [-- path]',
    category: 'git',
    handler: async (args) => {
      const { spawnSync } = await import('node:child_process');
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const gitArgs = ['diff'];
      if (parts.includes('--staged') || parts.includes('--cached')) gitArgs.push('--cached');
      if (parts.includes('--stat')) gitArgs.push('--stat');
      const dashIdx = parts.indexOf('--');
      if (dashIdx !== -1 && parts[dashIdx + 1]) gitArgs.push('--', parts[dashIdx + 1]);
      const out = spawnSync('git', gitArgs, { encoding: 'utf8', timeout: 8000 });
      return chalk.cyan(out.stdout.trim() || '(no changes)');
    },
  },
  {
    name: 'commit',
    description: 'Stage all + commit. Omit message to use AI auto-message.',
    args: '[message] [--amend] [--push]',
    category: 'git',
    handler: async (args) => {
      const { spawnSync } = await import('node:child_process');
      const parts = args.trim().split(/\s+/);
      const amend = parts.includes('--amend');
      const push = parts.includes('--push');
      const msgParts = parts.filter(p => p !== '--amend' && p !== '--push');
      let message = msgParts.join(' ').trim();

      // Stage all
      spawnSync('git', ['add', '-A'], { encoding: 'utf8', timeout: 10000 });

      // AI auto-message if no message given or mode is 'auto'
      if (!message || _gitMode === 'auto') {
        try {
          const { gitAutoMessageTool } = await import('../../tools/git.js');
          const r = await gitAutoMessageTool();
          if (r.result) message = r.result;
        } catch { /* fall through */ }
      }

      if (!message) return chalk.red('No message. Provide one or use /git-mode auto for AI messages.');

      const commitArgs = amend
        ? ['commit', '--amend', '-m', message]
        : ['commit', '-m', message];

      const out = spawnSync('git', commitArgs, { encoding: 'utf8', timeout: 15000 });
      if (out.status !== 0) return chalk.red((out.stderr || out.stdout || 'commit failed').trim());

      let result = chalk.green(`✓ Committed: ${message}`);

      if (push) {
        const pushOut = spawnSync('git', ['push'], { encoding: 'utf8', timeout: 30000 });
        result += pushOut.status === 0
          ? chalk.green('\n✓ Pushed')
          : chalk.red(`\n✗ Push failed: ${(pushOut.stderr || '').trim()}`);
      }

      return result;
    },
  },
  {
    name: 'git-mode',
    aliases: ['gitmode'],
    description: 'Set auto-commit strategy: diff | whole | auto',
    args: '[diff|whole|auto]',
    category: 'git',
    handler: (args) => {
      const mode = args.trim().toLowerCase() as typeof _gitMode;
      if (!mode) {
        return [
          chalk.bold('Current git mode: ') + chalk.cyan(_gitMode),
          '',
          chalk.dim('  diff   — show diff before commit, ask for message'),
          chalk.dim('  whole  — stage + commit with provided message only'),
          chalk.dim('  auto   — AI generates commit message from staged diff (default)'),
        ].join('\n');
      }
      if (!['diff', 'whole', 'auto'].includes(mode)) {
        return chalk.red('Invalid mode. Use: diff | whole | auto');
      }
      _gitMode = mode;
      return chalk.green(`✓ Git mode set to: ${mode}`);
    },
  },
  {
    name: 'stash',
    description: 'Stash management: list | pop | apply <n> | drop <n> | save [msg]',
    args: '[list|pop|apply|drop|save] [n|msg]',
    category: 'git',
    handler: async (args) => {
      const { gitStashTool } = await import('../../tools/git.js');
      const [sub, ...rest] = args.trim().split(/\s+/);
      if (!sub || sub === 'list') {
        const r = gitStashTool({ action: 'list' });
        return chalk.cyan(r.error ?? (r.result || '(no stashes)'));
      }
      if (sub === 'pop') {
        const r = gitStashTool({ action: 'pop' });
        return r.error ? chalk.red(r.error) : chalk.green(r.result);
      }
      if (sub === 'apply') {
        const r = gitStashTool({ action: 'apply', index: rest[0] ? Number(rest[0]) : undefined });
        return r.error ? chalk.red(r.error) : chalk.green(r.result);
      }
      if (sub === 'drop') {
        const r = gitStashTool({ action: 'drop', index: rest[0] ? Number(rest[0]) : undefined });
        return r.error ? chalk.red(r.error) : chalk.green(r.result);
      }
      if (sub === 'save') {
        const { checkpointTool } = await import('../../tools/git.js');
        const r = checkpointTool({ description: rest.join(' ') || 'manual stash' });
        return r.error ? chalk.red(r.error) : chalk.green(r.result);
      }
      return chalk.red('Usage: /stash [list|pop|apply <n>|drop <n>|save <msg>]');
    },
  },
  {
    name: 'push',
    description: 'Push current branch. Flags: --force, --remote <name>, --branch <name>',
    args: '[--force] [--remote name] [--branch name]',
    category: 'git',
    handler: async (args) => {
      const { gitPushTool } = await import('../../tools/git.js');
      const parts = args.trim().split(/\s+/);
      const force = parts.includes('--force');
      const remoteIdx = parts.indexOf('--remote');
      const branchIdx = parts.indexOf('--branch');
      const r = gitPushTool({
        force,
        remote: remoteIdx !== -1 ? parts[remoteIdx + 1] : undefined,
        branch: branchIdx !== -1 ? parts[branchIdx + 1] : undefined,
      });
      return r.error ? chalk.red(r.error) : chalk.green(r.result || 'Pushed successfully');
    },
  },
  {
    name: 'branch',
    description: 'List branches or create one. Use -c to checkout after creating.',
    args: '[name] [-c]',
    category: 'git',
    handler: async (args) => {
      const { gitBranchTool } = await import('../../tools/git.js');
      const parts = args.trim().split(/\s+/).filter(Boolean);
      if (!parts.length) {
        const r = gitBranchTool({});
        return chalk.cyan(r.error ?? r.result);
      }
      const checkout = parts.includes('-c') || parts.includes('--checkout');
      const name = parts.find(p => p !== '-c' && p !== '--checkout');
      const r = gitBranchTool({ name, checkout });
      return r.error ? chalk.red(r.error) : chalk.green(r.result || `Branch ${name} created`);
    },
  },
];
