
/**
 * repl/slash/context.ts — Context management slash commands
 * /drop — Drop messages from conversation context
 * /undo — Revert last AI-generated changes
 */
import chalk from 'chalk';
import type { SlashCommand, ReplContext, Message } from './types.js';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Track AI changes for /undo
const AI_CHANGE_LOG = '.dirgha/ai-changes.json';

interface AIChange {
  timestamp: string;
  files: string[];
  description: string;
  sessionId: string;
}

function loadChangeLog(cwd: string): AIChange[] {
  const path = join(cwd, AI_CHANGE_LOG);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}

function saveChangeLog(cwd: string, log: AIChange[]) {
  const dir = join(cwd, '.dirgha');
  if (!existsSync(dir)) {
    const { mkdirSync } = require('node:fs');
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(cwd, AI_CHANGE_LOG), JSON.stringify(log.slice(-50), null, 2));
}

export function recordAIChange(cwd: string, files: string[], description: string, sessionId: string) {
  const log = loadChangeLog(cwd);
  log.push({
    timestamp: new Date().toISOString(),
    files,
    description,
    sessionId
  });
  saveChangeLog(cwd, log);
}

const dropCommand: SlashCommand = {
  name: '/drop',
  description: 'Drop messages from conversation context',
  execute: async (args: string, ctx: ReplContext) => {
    const input = args.trim();
    
    if (!input || input === 'help') {
      ctx.print(`${chalk.yellow('Usage:')} /drop <n|all|first|last|user|assistant>`);
      ctx.print(`  /drop 5        — Drop last 5 messages`);
      ctx.print(`  /drop all      — Clear entire conversation`);
      ctx.print(`  /drop first    — Drop oldest message`);
      ctx.print(`  /drop last     — Drop most recent message`);
      ctx.print(`  /drop user     — Drop all user messages`);
      ctx.print(`  /drop assistant — Drop all AI responses`);
      return { type: 'success', result: { message: 'Usage shown' } };
    }

    const session = ctx.session;
    const messages = session?.messages || [];
    const originalCount = messages.length;

    if (originalCount === 0) {
      ctx.print(`${chalk.yellow('No messages to drop')}`);
      return { type: 'success', result: { dropped: 0 } };
    }

    let newMessages: Message[] = [...messages];
    let droppedCount = 0;

    if (input === 'all') {
      newMessages = [];
      droppedCount = originalCount;
      ctx.print(`${chalk.green('✓')} Cleared all ${chalk.cyan(originalCount)} messages`);
      
    } else if (input === 'first') {
      const dropped = newMessages.shift();
      droppedCount = 1;
      ctx.print(`${chalk.green('✓')} Dropped first message (${chalk.dim(dropped?.role || 'unknown')})`);
      
    } else if (input === 'last') {
      const dropped = newMessages.pop();
      droppedCount = 1;
      ctx.print(`${chalk.green('✓')} Dropped last message (${chalk.dim(dropped?.role || 'unknown')})`);
      
    } else if (input === 'user') {
      const beforeCount = newMessages.length;
      newMessages = newMessages.filter(m => m.role !== 'user');
      droppedCount = beforeCount - newMessages.length;
      ctx.print(`${chalk.green('✓')} Dropped ${chalk.cyan(droppedCount)} user messages`);
      
    } else if (input === 'assistant') {
      const beforeCount = newMessages.length;
      newMessages = newMessages.filter(m => m.role !== 'assistant');
      droppedCount = beforeCount - newMessages.length;
      ctx.print(`${chalk.green('✓')} Dropped ${chalk.cyan(droppedCount)} assistant messages`);
      
    } else if (/^\d+$/.test(input)) {
      const n = parseInt(input, 10);
      if (n >= originalCount) {
        newMessages = [];
        droppedCount = originalCount;
        ctx.print(`${chalk.green('✓')} Cleared all ${chalk.cyan(originalCount)} messages`);
      } else {
        newMessages = newMessages.slice(0, -n);
        droppedCount = n;
        ctx.print(`${chalk.green('✓')} Dropped last ${chalk.cyan(n)} messages`);
      }
      
    } else {
      ctx.print(`${chalk.red('Unknown option:')} ${input}`);
      return { type: 'error', result: { message: 'Unknown option' } };
    }

    // Update session
    if (session) {
      session.messages = newMessages;
    }

    // Show new context stats
    const userMsgs = newMessages.filter(m => m.role === 'user').length;
    const assistantMsgs = newMessages.filter(m => m.role === 'assistant').length;
    ctx.print(`${chalk.dim('  Remaining:')} ${chalk.cyan(newMessages.length)} total (${userMsgs} user, ${assistantMsgs} assistant)`);

    return { type: 'success', result: { dropped: droppedCount, remaining: newMessages.length } };
  }
};

const undoCommand: SlashCommand = {
  name: '/undo',
  description: 'Revert last AI-generated changes',
  execute: async (args: string, ctx: ReplContext) => {
    const cwd = ctx.cwd || process.cwd();
    const log = loadChangeLog(cwd);
    
    if (log.length === 0) {
      ctx.print(`${chalk.yellow('No AI changes recorded to undo')}`);
      ctx.print(`${chalk.dim('Note: Only tracks changes made in this session')}`);
      return { type: 'success', result: { message: 'Nothing to undo' } };
    }

    const n = args.trim() === 'all' ? log.length : parseInt(args.trim(), 10) || 1;
    const toUndo = log.slice(-n).reverse(); // Most recent first
    
    ctx.print(`${chalk.cyan('Undoing')} ${chalk.bold(n)} AI change(s)...\n`);
    
    let restoredCount = 0;
    let failedCount = 0;
    
    for (const change of toUndo) {
      ctx.print(`${chalk.dim('•')} ${change.description || 'Untitled change'}`);
      ctx.print(`  ${chalk.gray(change.timestamp)}`);
      
      for (const file of change.files) {
        const filePath = join(cwd, file);
        
        // Check if backup exists
        const backupPath = `${filePath}.dirgha-backup`;
        const gitBackup = join(cwd, '.dirgha', 'backups', file.replace(/\//g, '_'));
        
        if (existsSync(backupPath)) {
          try {
            writeFileSync(filePath, readFileSync(backupPath));
            unlinkSync(backupPath);
            ctx.print(`  ${chalk.green('✓')} ${chalk.dim(file)}`);
            restoredCount++;
          } catch (err) {
            ctx.print(`  ${chalk.red('✗')} ${chalk.dim(file)} — restore failed`);
            failedCount++;
          }
        } else if (existsSync(gitBackup)) {
          try {
            writeFileSync(filePath, readFileSync(gitBackup));
            ctx.print(`  ${chalk.green('✓')} ${chalk.dim(file)} (from git backup)`);
            restoredCount++;
          } catch (err) {
            ctx.print(`  ${chalk.red('✗')} ${chalk.dim(file)} — restore failed`);
            failedCount++;
          }
        } else {
          ctx.print(`  ${chalk.yellow('?')} ${chalk.dim(file)} — no backup found`);
          failedCount++;
        }
      }
      ctx.print('');
    }

    // Remove undone changes from log
    const newLog = log.slice(0, -n);
    saveChangeLog(cwd, newLog);

    ctx.print(`${chalk.green('✓')} Restored ${chalk.cyan(restoredCount)} file(s)`);
    if (failedCount > 0) {
      ctx.print(`${chalk.yellow('⚠')} Could not restore ${chalk.cyan(failedCount)} file(s)`);
      ctx.print(`${chalk.dim('  Try using git to revert: git checkout -- <file>')}`);
    }

    return { type: 'success', result: { restored: restoredCount, failed: failedCount } };
  }
};

export const contextCommands: SlashCommand[] = [
  dropCommand,
  undoCommand
];
