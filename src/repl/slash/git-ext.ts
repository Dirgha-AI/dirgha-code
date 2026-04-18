
/**
 * repl/slash/git-ext.ts — Extended git slash commands
 * /checkout — Checkout branches, commits, or files from git history
 */
import chalk from 'chalk';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { SlashCommand, ReplContext } from './types.js';

const checkoutCommand: SlashCommand = {
  name: '/checkout',
  description: 'Checkout git branch, commit, or restore file',
  execute: async (args: string, ctx: ReplContext) => {
    const parts = args.trim().split(/\s+/);
    const target = parts[0];
    
    if (!target) {
      ctx.print(`${chalk.yellow('Usage:')} /checkout <branch|commit|file> [options]`);
      ctx.print(`  /checkout main           — Switch to branch`);
      ctx.print(`  /checkout abc123         — Checkout commit`);
      ctx.print(`  /checkout -- file.txt     — Restore file from HEAD`);
      ctx.print(`  /checkout -b feature-x    — Create and switch to new branch`);
      return { type: 'success', result: { message: 'Usage shown' } };
    }

    const cwd = ctx.cwd || process.cwd();
    if (!existsSync(`${cwd}/.git`)) {
      ctx.print(`${chalk.red('Error:')} Not a git repository`);
      return { type: 'error', result: { message: 'Not a git repo' } };
    }

    try {
      // Show current status before checkout
      const currentBranch = execSync('git branch --show-current', { cwd, encoding: 'utf8' }).trim();
      
      // Determine checkout type
      const isFileRestore = target === '--' || target.startsWith('.') || target.includes('/') || target.endsWith('.ts') || target.endsWith('.js') || target.endsWith('.json') || target.endsWith('.md');
      const isNewBranch = parts.includes('-b') || parts.includes('-B');
      const isCommit = /^[a-f0-9]{7,40}$/i.test(target);
      
      if (isFileRestore && target !== '-b' && target !== '-B') {
        // Restore file(s)
        const files = target === '--' ? parts.slice(1).join(' ') : args;
        execSync(`git checkout HEAD -- ${files}`, { cwd, encoding: 'utf8' });
        ctx.print(`${chalk.green('✓')} Restored ${chalk.cyan(files)} from HEAD`);
        
      } else if (isNewBranch) {
        // Create new branch
        const branchIndex = parts.findIndex(p => p === '-b' || p === '-B');
        const branchName = parts[branchIndex + 1];
        execSync(`git checkout -b ${branchName}`, { cwd, encoding: 'utf8' });
        ctx.print(`${chalk.green('✓')} Created and switched to branch ${chalk.cyan(branchName)}`);
        ctx.print(`${chalk.dim('  From:')} ${chalk.yellow(currentBranch)}`);
        
      } else if (isCommit) {
        // Checkout commit (detached HEAD)
        const shortSha = target.slice(0, 7);
        execSync(`git checkout ${target}`, { cwd, encoding: 'utf8' });
        ctx.print(`${chalk.green('✓')} Checked out commit ${chalk.cyan(shortSha)}`);
        ctx.print(`${chalk.yellow('⚠')} You are in 'detached HEAD' state`);
        ctx.print(`${chalk.dim('  Create a branch to save changes:`git checkout -b <branch-name>`')}`);
        
      } else {
        // Checkout existing branch
        execSync(`git checkout ${target}`, { cwd, encoding: 'utf8' });
        ctx.print(`${chalk.green('✓')} Switched to branch ${chalk.cyan(target)}`);
        if (currentBranch !== target) {
          ctx.print(`${chalk.dim('  From:')} ${chalk.yellow(currentBranch)}`);
        }
      }

      // Show post-checkout status
      const newBranch = execSync('git branch --show-current', { cwd, encoding: 'utf8' }).trim() || '(detached)';
      const status = execSync('git status --short', { cwd, encoding: 'utf8' }).trim();
      
      ctx.print(`${chalk.dim('  Current:')} ${chalk.cyan(newBranch)}`);
      if (status) {
        ctx.print(`${chalk.dim('  Status:')} ${chalk.yellow(status.split('\n').length)} modified file(s)`);
      } else {
        ctx.print(`${chalk.dim('  Status:')} ${chalk.green('clean')}`);
      }

      return { type: 'success', result: { from: currentBranch, to: newBranch || target } };

    } catch (err: any) {
      const errorMsg = err.stderr?.toString() || err.message || 'Git checkout failed';
      ctx.print(`${chalk.red('Error:')} ${errorMsg.split('\n')[0]}`);
      
      if (errorMsg.includes('already exists')) {
        ctx.print(`${chalk.dim('Hint: Use `git checkout <branch>` to switch to existing branch')}`);
      } else if (errorMsg.includes('pathspec')) {
        ctx.print(`${chalk.dim('Hint: File not found in repository')}`);
      } else if (errorMsg.includes('unmerged')) {
        ctx.print(`${chalk.dim('Hint: Resolve conflicts before checking out')}`);
      }
      
      return { type: 'error', result: { message: errorMsg } };
    }
  }
};

export const gitExtCommands: SlashCommand[] = [
  checkoutCommand
];
