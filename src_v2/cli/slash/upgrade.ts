/**
 * /upgrade — nudge the user toward a paid tier. Billing isn't wired
 * into v2 yet, so this prints the upgrade URL and the tiers it
 * unlocks. STUB: swap for a live entitlements check once the billing
 * client is available in the REPL context.
 */

import type { SlashCommand } from './types.js';

const UPGRADE_URL = process.env.DIRGHA_UPGRADE_URL ?? 'https://dirgha.ai/upgrade';

export const upgradeCommand: SlashCommand = {
  name: 'upgrade',
  description: 'Open the upgrade page and list paid features',
  async execute(_args) {
    return [
      `Upgrade at: ${UPGRADE_URL}`,
      '',
      'Paid tiers unlock:',
      '  - Deploys to the hosted runner',
      '  - Private skills registry',
      '  - Bucky compute hours',
      '  - Custom sandbox images',
      '  - Higher concurrent sub-agent limits',
      '',
      '(Billing integration is not yet wired into the REPL — STUB.)',
    ].join('\n');
  },
};
