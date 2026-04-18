/**
 * slash-git.ts — Git workflow slash commands for Dirgha CLI v2.
 * Commands: /worktree, /branch, /pr, /issue, /commit-push-pr
 * Register via extendRegistry(gitCommands) in CLI entry.
 */
import chalk from 'chalk';
import { gitCmd, ghCmd, execCmd } from '../utils/safe-exec.js';
import type { SlashCommand } from './slash/types.js';

export const gitCommands: SlashCommand[] = [
  {
    name: 'branch',
    description: 'List or create git branches',
    args: '[name]',
    category: 'git',
    handler: (args) => {
      const trimmed = args.trim();
      if (!trimmed) {
        return chalk.cyan(gitCmd(['branch', '-v', '--sort=-committerdate']));
      }
      try {
        gitCmd(['checkout', '-b', trimmed]);
        return chalk.green(`✓ Created and switched to branch: ${trimmed}`);
      } catch (e: any) {
        return chalk.red(`✗ Failed to create branch: ${e.message}`);
      }
    },
  },
  {
    name: 'worktree',
    description: 'Manage git worktrees (list | add <path> <branch>)',
    args: '[subcommand]',
    category: 'git',
    handler: (args) => {
      const [sub, ...rest] = args.trim().split(/\s+/);
      try {
        if (!sub || sub === 'list') {
          return chalk.cyan(gitCmd(['worktree', 'list']));
        }
        if (sub === 'add' && rest.length >= 2) {
          gitCmd(['worktree', 'add', rest[0]!, rest[1]!]);
          return chalk.green(`✓ Worktree added at ${rest[0]} tracking ${rest[1]}`);
        }
        if (sub === 'remove' && rest[0]) {
          gitCmd(['worktree', 'remove', rest[0]!]);
          return chalk.green(`✓ Worktree removed: ${rest[0]}`);
        }
      } catch (e: any) {
        return chalk.red(`✗ Worktree error: ${e.message}`);
      }
      return chalk.red('Usage: /worktree [list | add <path> <branch> | remove <path>]');
    },
  },
  {
    name: 'commit-push-pr',
    aliases: ['cpp'],
    description: 'git commit + push + open GitHub PR in one command',
    args: '<message>',
    category: 'git',
    handler: (args) => {
      const msg = args.trim();
      if (!msg) return chalk.red('Usage: /commit-push-pr <commit message>');
      
      const results: string[] = [];
      try {
        gitCmd(['add', '-A']);
        results.push(chalk.green('✓ Staged all changes'));
        
        gitCmd(['commit', '-m', msg]);
        results.push(chalk.green('✓ Committed'));
        
        gitCmd(['push', '-u', 'origin', 'HEAD']);
        results.push(chalk.green('✓ Pushed'));
        
        const prUrl = ghCmd(['pr', 'create', '--fill']);
        results.push(chalk.cyan(`✓ PR: ${prUrl}`));
      } catch (e: any) {
        results.push(chalk.red(`✗ ${e.message}`));
      }
      return results.join('\n');
    },
  },
  {
    name: 'pr',
    description: 'GitHub PR management (list | view | checkout <n> | open)',
    args: '[subcommand]',
    category: 'git',
    handler: (args) => {
      const [sub, ...rest] = (args || '').trim().split(/\s+/);
      try {
        if (!sub || sub === 'list') return chalk.cyan(ghCmd(['pr', 'list']));
        if (sub === 'view') return chalk.cyan(ghCmd(['pr', 'view', rest[0] || '']));
        if (sub === 'checkout') return chalk.green(ghCmd(['pr', 'checkout', rest[0]!]));
        if (sub === 'open') {
          if (process.platform === 'darwin') execCmd('open', ['https://github.com/']); // Fallback or use gh pr view --web
          ghCmd(['pr', 'view', '--web']); 
          return chalk.dim('Opening PR in browser...'); 
        }
        return chalk.red('Usage: /pr [list | view [#] | checkout <#> | open]');
      } catch (e: any) { return chalk.red(`gh error: ${e.message}`); }
    },
  },
  {
    name: 'issue',
    description: 'GitHub issue management (list | view <n> | create)',
    args: '[subcommand]',
    category: 'git',
    handler: (args) => {
      const [sub, ...rest] = (args || '').trim().split(/\s+/);
      try {
        if (!sub || sub === 'list') return chalk.cyan(ghCmd(['issue', 'list', '--limit', '20']));
        if (sub === 'view') return chalk.cyan(ghCmd(['issue', 'view', rest[0]!]));
        if (sub === 'create') { 
          ghCmd(['issue', 'create', '--web']); 
          return chalk.dim('Opening issue creation in browser...'); 
        }
        return chalk.red('Usage: /issue [list | view <#> | create]');
      } catch (e: any) { return chalk.red(`gh error: ${e.message}`); }
    },
  },
];
