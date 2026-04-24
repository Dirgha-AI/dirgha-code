/**
 * /account — show billing + quota. Reads a cached whoami from
 * ~/.dirgha/auth.json if it exists, otherwise falls back to a
 * "not signed in" hint. Full billing integration depends on
 * integrations/auth.ts + entitlements.ts, neither of which is wired
 * to an authenticated client in the REPL. STUB.
 */
import type { SlashCommand } from './types.js';
export declare const accountCommand: SlashCommand;
