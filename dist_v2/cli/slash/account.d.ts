/**
 * /account — billing + entitlements snapshot.
 *
 * Requires an active token (loaded from `credentials.json` at REPL
 * start). Calls `/api/billing/account` for tier + balance + limits and
 * `/api/billing/entitlements` (via `checkEntitlement`) to show whether
 * Fleet is unlocked.
 */
import type { SlashCommand } from './types.js';
export declare const accountCommand: SlashCommand;
