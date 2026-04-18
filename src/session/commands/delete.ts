// @ts-nocheck
/**
 * session/commands/delete.ts — Delete a saved session
 */
import chalk from 'chalk';
import { getTheme } from '../../repl/themes.js';
import type { SlashCommand, ReplContext } from '../../repl/slash/types.js';
import { deleteSession, deleteDBSession } from '../persistence.js';

export const del: SlashCommand = {
  name: '/delete',
  description: 'Delete a saved session by ID',
  async execute(args, ctx: ReplContext) {
    const theme = getTheme(ctx.activeTheme);
    const id = args[0];
    
    if (!id) {
      console.log(theme.error('Usage: /delete <session-id>'));
      return { ctx };
    }
    
    const deleted = deleteSession(id) || deleteDBSession(id);
    
    if (!deleted) {
      console.log(theme.error(`Session not found: ${id}`));
      return { ctx };
    }
    
    console.log(theme.success(`Deleted session: ${id.slice(0, 8)}`));
    return { ctx };
  },
};
