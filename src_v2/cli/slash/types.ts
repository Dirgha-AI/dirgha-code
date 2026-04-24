/**
 * Shared `SlashCommand` shape used by the built-in command files in
 * this folder. The slash registry in `../slash.ts` accepts raw handler
 * functions; `SlashCommand` wraps them with a name, description, and
 * optional aliases so a consumer can bulk-register the lot from
 * `builtinSlashCommands` in `./index.ts`.
 */

import type { SlashHandler } from '../slash.js';

export interface SlashCommand {
  name: string;
  description: string;
  aliases?: string[];
  execute: SlashHandler;
}
