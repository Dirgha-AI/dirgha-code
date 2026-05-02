/**
 * /keys — list, set, or clear provider API keys persisted at
 * ~/.dirgha/keys.json. This is BYOK storage used by the setup wizard
 * and read on start-up so keys survive across shells without touching
 * ~/.bashrc. Values are masked on display.
 */
import type { SlashCommand } from "./types.js";
export declare const keysCommand: SlashCommand;
