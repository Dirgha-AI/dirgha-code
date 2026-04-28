/**
 * /update — check the npm registry for a newer @dirgha/code, print the
 * comparison, and tell the user how to upgrade. We don't shell out to
 * npm from inside the REPL — running `npm i -g …` mid-session can
 * leave the binary half-replaced — so this is informational + nudges
 * the user to run `dirgha update` from a clean shell.
 */
import type { SlashCommand } from './types.js';
export declare const updateCommand: SlashCommand;
