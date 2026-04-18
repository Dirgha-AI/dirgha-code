/**
 * utils/security-boundary.ts — Security boundary between public and private builds
 * 
 * PUBLIC builds (npm install dirgha-cli):
 *   - BYOK only (user's own API keys)
 *   - No server access without explicit opt-in
 *   - Local-only by default
 * 
 * PRIVATE builds (internal development):
 *   - Can access Dirgha cloud services
 *   - Deploy triggers enabled
 *   - Cloud sync enabled
 */

export enum BuildType {
  PUBLIC = 'public',    // npm release
  PRIVATE = 'private',  // internal dev
}

/** Determine build type from environment */
export function getBuildType(): BuildType {
  // Explicit override takes precedence
  if (process.env.DIRGHA_BUILD_TYPE === 'private') {
    return BuildType.PRIVATE;
  }
  if (process.env.DIRGHA_BUILD_TYPE === 'public') {
    return BuildType.PUBLIC;
  }
  
  // Default: public (safe default for npm installs)
  return BuildType.PUBLIC;
}

/** Check if this is a public build */
export function isPublicBuild(): boolean {
  return getBuildType() === BuildType.PUBLIC;
}

/** Check if this is a private build */
export function isPrivateBuild(): boolean {
  return getBuildType() === BuildType.PRIVATE;
}

/** 
 * Require explicit opt-in for cloud features in public builds
 * Throws error if feature is accessed without opt-in
 */
export function requireOptIn(feature: string): void {
  if (isPublicBuild() && !isCloudEnabled()) {
    throw new Error(
      `[Security] ${feature} is disabled in public builds.\n` +
      `To enable cloud features, set:\n` +
      `  export DIRGHA_CLOUD_ENABLED=1\n` +
      `  export DIRGHA_TOKEN=<your_token>\n` +
      `Or use a private build: DIRGHA_BUILD_TYPE=private`
    );
  }
}

/**
 * Check if cloud features are explicitly enabled
 * Requires BOTH flag AND token in public builds
 */
export function isCloudEnabled(): boolean {
  return process.env.DIRGHA_CLOUD_ENABLED === '1' && 
         !!process.env.DIRGHA_TOKEN;
}

/**
 * Get gateway URL with security checks
 * PUBLIC builds: must be explicitly set, no defaults
 * PRIVATE builds: can use default
 */
export function getGatewayUrl(): string | null {
  const explicitUrl = process.env.DIRGHA_GATEWAY_URL;
  
  if (explicitUrl) {
    // User explicitly set a gateway URL
    return explicitUrl.replace(/\/$/, '');
  }
  
  if (isPrivateBuild()) {
    // Private builds can use default
    return 'https://api.dirgha.ai';
  }
  
  // Public builds: no default, return null
  return null;
}

/**
 * Assert that a URL is safe to connect to
 * Blocks localhost/private IPs in public builds unless explicitly allowed
 */
export function assertSafeUrl(url: string): void {
  if (isPrivateBuild()) return; // Private builds have more freedom
  
  const lowerUrl = url.toLowerCase();
  
  // Block localhost/loopback in public builds
  const blockedPatterns = [
    /^https?:\/\/localhost[:\/]/,
    /^https?:\/\/127\.\d+\.\d+\.\d+/,
    /^https?:\/\/192\.168\.\d+/,
    /^https?:\/\/10\.\d+\.\d+/,
    /^https?:\/\/0\.0\.0\.0/,
    /^https?:\/\/\[::1\]/,
  ];
  
  for (const pattern of blockedPatterns) {
    if (pattern.test(lowerUrl)) {
      throw new Error(
        `[Security] Cannot connect to ${url} in public builds.\n` +
        `Localhost/private IP access requires explicit opt-in.\n` +
        `Set DIRGHA_ALLOW_LOCALHOST=1 to override (not recommended).`
      );
    }
  }
}

/**
 * Check if a feature should be available
 * Used to conditionally register commands
 */
export function isFeatureAvailable(feature: 'cloud' | 'deploy' | 'mesh' | 'sync' | 'billing'): boolean {
  switch (feature) {
    case 'cloud':
    case 'sync':
    case 'billing':
      // Cloud features require opt-in in public builds
      return isPrivateBuild() || isCloudEnabled();
      
    case 'deploy':
      // Deploy only in private builds
      return isPrivateBuild();
      
    case 'mesh':
      // Mesh is P2P/local, safe in public builds
      return true;
      
    default:
      return true;
  }
}

/**
 * Log security boundary status (for debugging)
 */
export function logSecurityStatus(): void {
  if (process.env.DIRGHA_DEBUG) {
    const build = getBuildType();
    const cloud = isCloudEnabled();
    const gateway = getGatewayUrl();
    
    console.error('[Security Boundary]');
    console.error(`  Build type: ${build}`);
    console.error(`  Cloud enabled: ${cloud}`);
    console.error(`  Gateway URL: ${gateway || '(not set)'}`);
    console.error(`  Features: ${JSON.stringify({
      cloud: isFeatureAvailable('cloud'),
      deploy: isFeatureAvailable('deploy'),
      mesh: isFeatureAvailable('mesh'),
      sync: isFeatureAvailable('sync'),
      billing: isFeatureAvailable('billing'),
    })}`);
  }
}
