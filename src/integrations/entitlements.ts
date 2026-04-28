/**
 * Entitlements check. Pulls the user's tier + feature flags from the
 * gateway. When a gated feature is requested, the caller invokes
 * requireFeature() which throws a clean error that the CLI turns into
 * an upgrade prompt.
 */

import { jsonRequest } from './http.js';

export type Tier = 'free' | 'pro' | 'team' | 'enterprise';

export type Feature =
  | 'deploy'
  | 'codeRegister'
  | 'privateSkills'
  | 'teamsBucky'
  | 'customSandbox'
  | 'fleet'
  | 'tripleshot';

export interface Entitlements {
  tier: Tier;
  features: Record<Feature, boolean>;
  limits: {
    dailyDeploys: number;
    monthlyBuckyHours: number;
    maxSubagents: number;
  };
}

export interface EntitlementsClient {
  get(token: string): Promise<Entitlements>;
  requireFeature(token: string, feature: Feature): Promise<void>;
}

/**
 * Low-level feature check: returns true/false without throwing. Used by
 * slash commands that want to show/hide capability (e.g. `/fleet`,
 * `/tripleshot`) rather than hard-block.
 */
export async function checkEntitlement(
  token: string,
  feature: Feature,
  opts: { baseUrl?: string } = {},
): Promise<boolean> {
  const baseUrl = opts.baseUrl ?? process.env.DIRGHA_API_BASE ?? process.env.DIRGHA_GATEWAY_URL ?? 'https://api.dirgha.ai';
  try {
    const entitlements = await jsonRequest<Entitlements>({
      baseUrl,
      path: '/api/billing/entitlements',
      token,
      timeoutMs: 5_000,
    });
    return entitlements.features[feature] === true;
  } catch {
    return false;
  }
}

export interface EntitlementsClientOptions {
  baseUrl?: string;
  upgradeUrl?: string;
}

export function createEntitlementsClient(opts: EntitlementsClientOptions = {}): EntitlementsClient {
  const baseUrl = opts.baseUrl ?? process.env.DIRGHA_GATEWAY_URL ?? 'https://api.dirgha.ai';
  const upgradeUrl = opts.upgradeUrl ?? 'https://dirgha.ai/upgrade';

  return {
    async get(token) {
      return jsonRequest<Entitlements>({ baseUrl, path: '/api/billing/entitlements', token });
    },
    async requireFeature(token, feature) {
      const entitlements = await this.get(token);
      if (!entitlements.features[feature]) {
        throw new Error(`Feature "${feature}" requires an upgrade. Visit ${upgradeUrl} to unlock it on tier: ${entitlements.tier}.`);
      }
    },
  };
}
