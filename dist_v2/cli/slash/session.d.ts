/**
 * /session — list sessions, load, rename, or branch. Branching is
 * wired through `context/branch.ts`, which takes a provider pointer +
 * a summary model; the SlashContext exposes `getProvider()` +
 * `getSummaryModel()` + `getSession()` + `getSessionStore()` for this.
 */
import type { SlashCommand } from './types.js';
export declare const sessionCommand: SlashCommand;
