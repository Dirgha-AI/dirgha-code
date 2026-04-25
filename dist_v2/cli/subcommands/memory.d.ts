/**
 * `dirgha memory <list|show|search|add|remove|type>` — long-term memory
 * store at `~/.dirgha/memory/`.
 *
 * Mirrors the `/memory` slash but callable non-interactively from
 * shells and scripts. The slash version is in `cli/slash/memory.ts`;
 * both go through `context/memory.ts` so behavior is identical.
 */
import type { Subcommand } from './index.js';
export declare const memorySubcommand: Subcommand;
