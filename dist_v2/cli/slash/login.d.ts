/**
 * /login — trigger the device-code flow. Device-auth isn't ported into
 * v2 yet (integrations/auth.ts exists but is stubbed), so this prints
 * the out-of-band command and documents BYOK as the alternative.
 * STUB: when auth is wired, switch to calling createAuthClient().login.
 */
import type { SlashCommand } from './types.js';
export declare const loginCommand: SlashCommand;
