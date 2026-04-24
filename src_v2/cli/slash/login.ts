/**
 * /login — trigger the device-code flow. Device-auth isn't ported into
 * v2 yet (integrations/auth.ts exists but is stubbed), so this prints
 * the out-of-band command and documents BYOK as the alternative.
 * STUB: when auth is wired, switch to calling createAuthClient().login.
 */

import type { SlashCommand } from './types.js';

export const loginCommand: SlashCommand = {
  name: 'login',
  description: 'Sign in via device-code flow (beta: run `dirgha auth login`)',
  async execute(_args) {
    return [
      'Device-code login isn\'t available inside the REPL in this beta.',
      '',
      'Run from a shell:',
      '  dirgha auth login',
      '',
      'Or use BYOK — set provider keys with `/keys set NVIDIA_API_KEY …`',
      'or by editing ~/.dirgha/keys.json.',
    ].join('\n');
  },
};
