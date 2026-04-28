/**
 * /resume <sessionId> — load a previous session's transcript into the
 * current REPL context. Defers to SlashContext.loadSession, which
 * reads ~/.dirgha/sessions/<id>.jsonl and reports how many messages
 * were replayed. Without an id, lists available sessions.
 */

import type { SlashCommand } from './types.js';

export const resumeCommand: SlashCommand = {
  name: 'resume',
  description: 'Resume a prior session by id (or list them)',
  async execute(args, ctx) {
    const id = args[0];
    if (!id) {
      const list = await ctx.listSessions();
      return [
        'Usage: /resume <session-id>',
        '',
        'Available sessions:',
        list,
      ].join('\n');
    }
    return ctx.loadSession(id);
  },
};
