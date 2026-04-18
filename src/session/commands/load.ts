// @ts-nocheck
/**
 * session/commands/load.ts — Load a saved session
 */
import chalk from 'chalk';
import { getTheme } from '../../repl/themes.js';
import type { SlashCommand, ReplContext } from '../../repl/slash/types.js';
import { loadSession, loadDBSession } from '../persistence.js';

export const load: SlashCommand = {
  name: '/load',
  description: 'Load a saved session by ID or partial ID',
  async execute(args, ctx: ReplContext) {
    const theme = getTheme(ctx.activeTheme);
    const id = args[0];
    
    if (!id) {
      console.log(theme.error('Usage: /load <session-id>'));
      console.log(theme.secondary('Use ') + theme.command('/list') + theme.secondary(' to see available sessions.'));
      return { ctx };
    }
    
    // Try file-based first, then DB
    let session = loadSession(id);
    if (!session) {
      session = loadDBSession(id);
    }
    
    if (!session) {
      console.log(theme.error(`Session not found: ${id}`));
      return { ctx };
    }
    
    const newCtx: ReplContext = {
      ...ctx,
      sessionId: session.id,
      messages: session.messages,
      totalTokens: session.tokensUsed,
      model: session.model || ctx.model,
    };
    
    console.log(theme.success(`Loaded session: ${session.title}`));
    console.log(theme.secondary(`  ${session.messages.length} messages • ${session.tokensUsed} tokens • ${session.model || 'unknown model'}`));
    
    return { ctx: newCtx };
  },
};
