/**
 * /upgrade — show current plan and the upgrade URL.
 *
 * Uses `getAccountStatus` to report the active tier, then prints the
 * upgrade link (configurable via `DIRGHA_UPGRADE_URL`). A referral code
 * is appended when the gateway returns one.
 */
import type { SlashCommand } from './types.js';
export declare const upgradeCommand: SlashCommand;
