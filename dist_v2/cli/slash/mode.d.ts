/**
 * /mode — switch the REPL's execution mode. v2 doesn't yet ship a
 * mode subsystem (plan / act / verify), so this is a structured stub
 * that records the preferred mode in process.env.DIRGHA_MODE so
 * downstream integrations can observe it. STUB until packages/core
 * grows a mode kernel.
 */
import type { SlashCommand } from './types.js';
export declare const modeCommand: SlashCommand;
