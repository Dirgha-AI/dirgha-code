/**
 * /clear — clear the in-memory transcript. Delegates to the core
 * SlashContext.clear() which is already wired to drop the history
 * array and print an acknowledgement. The on-disk session is kept so
 * the conversation remains replayable later.
 */

import type { SlashCommand } from './types.js';

export const clearCommand: SlashCommand = {
  name: 'clear',
  description: 'Clear the transcript (on-disk session is preserved)',
  async execute(_args, ctx) {
    ctx.clear();
    return undefined;
  },
};
