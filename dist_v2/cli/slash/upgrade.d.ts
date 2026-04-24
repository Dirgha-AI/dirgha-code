/**
 * /upgrade — nudge the user toward a paid tier. Billing isn't wired
 * into v2 yet, so this prints the upgrade URL and the tiers it
 * unlocks. STUB: swap for a live entitlements check once the billing
 * client is available in the REPL context.
 */
import type { SlashCommand } from './types.js';
export declare const upgradeCommand: SlashCommand;
