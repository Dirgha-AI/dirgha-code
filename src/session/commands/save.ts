// @ts-nocheck
/**
 * session/commands/save.ts — Save current session
 */
import chalk from 'chalk';
import { getTheme } from '../../repl/themes.js';
import type { SlashCommand, ReplContext } from '../../repl/slash/types.js';
import { saveSession, saveDBSession } from '../persistence.js';

export const save: SlashCommand = {
  name: '/save',
  description: 'Save current session with optional name',
  async execute(args, ctx: ReplContext) {
    const theme = getTheme(ctx.activeTheme);
    const name = args.join(' ') || undefined;
    
    const id = await saveSession(ctx, name);
    await saveDBSession(ctx, name);
    
    console.log(theme.success(`Session saved: ${id.slice(0, 8)}`));
    if (name) {
      console.log(theme.secondary(`  Title: ${name}`));
    }
    console.log(theme.secondary(`  ${ctx.messages.length} messages • ${ctx.totalTokens} tokens`));
    
    return { ctx };
  },
};
