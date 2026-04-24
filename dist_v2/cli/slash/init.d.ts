/**
 * /init — drop a DIRGHA.md context primer into the current working
 * directory. Seeds a minimal project profile and a hint about running
 * `/setup` for API keys. Never overwrites an existing DIRGHA.md unless
 * invoked with --force.
 */
import type { SlashCommand } from './types.js';
export declare const initCommand: SlashCommand;
