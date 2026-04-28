/**
 * /provider — manage LLM providers from inside the TUI.
 *
 * Subcommands:
 *   /provider list                 — show registered providers + key status
 *   /provider add <name>           — print the 6-step recipe to scaffold a
 *                                    new provider; pairs with the
 *                                    `add-provider` skill so the agent can
 *                                    do the file edits if asked.
 *   /provider doctor [name]        — quick reachability check
 *
 * Adding a provider is a one-time operation that spans 6 files; the
 * skill doc at src/skills/add-provider.md is the canonical recipe so a
 * future agent can complete the task without out-of-band context.
 */
import type { SlashCommand } from './types.js';
export declare const providerCommand: SlashCommand;
