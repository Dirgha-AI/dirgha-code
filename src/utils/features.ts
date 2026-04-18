/**
 * utils/features.ts — Feature flag system for public vs private CLI builds
 * 
 * PUBLIC BUILD: Standard features (chat, init, auth, curate, query, etc.)
 * PRIVATE BUILD: All features including experimental (mesh, bucky, swarm, dao)
 */

export type FeatureFlag = 
  // Core (always available)
  | 'core'
  // Knowledge
  | 'curate' | 'query' | 'sync'
  // Advanced (experimental/private)
  | 'mesh' | 'bucky' | 'swarm' | 'dao' | 'make' | 'analytics'
  // Voice
  | 'voice'
  // Business
  | 'business-context';

const PUBLIC_FEATURES: FeatureFlag[] = [
  'core', 'curate', 'query', 'sync', 'voice'
];

const PRIVATE_FEATURES: FeatureFlag[] = [
  ...PUBLIC_FEATURES,
  'mesh', 'bucky', 'swarm', 'dao', 'make', 'business-context', 'analytics'
];

/** 
 * Check if a feature is enabled
 * Uses DIRGHA_BUILD_TYPE env var:
 * - 'public' → public features only
 * - 'private' | 'dev' | 'enterprise' → all features
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const buildType = process.env['DIRGHA_BUILD_TYPE'] ?? 'public';
  
  if (buildType === 'public') {
    return PUBLIC_FEATURES.includes(flag);
  }
  
  // private, dev, enterprise → all features
  return PRIVATE_FEATURES.includes(flag);
}

/** Get list of all available features for current build */
export function getAvailableFeatures(): FeatureFlag[] {
  const buildType = process.env['DIRGHA_BUILD_TYPE'] ?? 'public';
  return buildType === 'public' ? PUBLIC_FEATURES : PRIVATE_FEATURES;
}

/** Check if running private/development build */
export function isPrivateBuild(): boolean {
  const buildType = process.env['DIRGHA_BUILD_TYPE'] ?? 'public';
  return buildType !== 'public';
}
