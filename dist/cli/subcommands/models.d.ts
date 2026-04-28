/**
 * `dirgha models <list|default|info>` — richer model management.
 *
 *   list                      Table of every model in the catalogue.
 *   default [modelId]         Print the current default, or persist
 *                             `modelId` into ~/.dirgha/config.json.
 *   info <modelId>            Pricing + provider + rough context
 *                             window for a single model.
 *
 * Complements the simpler `dirgha models` already implemented in
 * `models-cmd.ts`; this subcommand supersedes it via the dispatcher.
 */
import type { Subcommand } from './index.js';
export declare const modelsSubcommand: Subcommand;
