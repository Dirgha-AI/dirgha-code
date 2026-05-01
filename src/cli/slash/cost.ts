/**
 * /cost — show cumulative token usage and estimated cost for the current
 * session. Reads the live totals tracked by the REPL or TUI context.
 */

import type { SlashCommand } from "./types.js";

export const costCommand: SlashCommand = {
  name: "cost",
  description: "Show cumulative token usage and estimated cost",
  execute(_args, ctx) {
    return ctx.showCost();
  },
};
