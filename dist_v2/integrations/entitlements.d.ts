/**
 * Entitlements check. Pulls the user's tier + feature flags from the
 * gateway. When a gated feature is requested, the caller invokes
 * requireFeature() which throws a clean error that the CLI turns into
 * an upgrade prompt.
 */
export type Tier = 'free' | 'pro' | 'team' | 'enterprise';
export type Feature = 'deploy' | 'codeRegister' | 'privateSkills' | 'teamsBucky' | 'customSandbox' | 'fleet' | 'tripleshot';
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
export declare function checkEntitlement(token: string, feature: Feature, opts?: {
    baseUrl?: string;
}): Promise<boolean>;
export interface EntitlementsClientOptions {
    baseUrl?: string;
    upgradeUrl?: string;
}
export declare function createEntitlementsClient(opts?: EntitlementsClientOptions): EntitlementsClient;
