// @ts-nocheck
/**
 * session/commands/list.ts — List all saved sessions
 */
import chalk from 'chalk';
import { getTheme } from '../../repl/themes.js';
import type { SlashCommand, ReplContext } from '../../repl/slash/types.js';
import { listSessions, listDBSessions } from '../persistence.js';

export const list: SlashCommand = {
  name: '/list',
  description: 'List all saved sessions',
  async execute(args, ctx: ReplContext) {
    const theme = getTheme(ctx.activeTheme);
    const fileSessions = listSessions();
    const dbSessions = listDBSessions();
    
    // Merge and dedupe
    const allSessions = [...fileSessions];
    for (const s of dbSessions) {
      if (!allSessions.find(f => f.id === s.id)) {
        allSessions.push(s);
      }
    }
    
    allSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    if (!allSessions.length) {
      console.log(theme.secondary('No saved sessions. Use ') + theme.command('/save') + theme.secondary(' to create one.'));
      return { ctx };
    }
    
    console.log(theme.heading('Saved Sessions'));
    for (const s of allSessions.slice(0, 20)) {
      const date = new Date(s.createdAt).toLocaleDateString();
      const id = s.id.slice(0, 8);
      console.log(`  ${theme.command(id)} ${chalk.gray('│')} ${s.title} ${chalk.gray('│')} ${theme.secondary(date)} ${chalk.gray('│')} ${s.model || 'unknown'}`);
    }
    
    if (allSessions.length > 20) {
      console.log(theme.secondary(`  ... and ${allSessions.length - 20} more`));
    }
    
    return { ctx };
  },
};
