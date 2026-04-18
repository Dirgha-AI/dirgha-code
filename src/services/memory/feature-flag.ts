/**
 * GEPA Feature Flag Configuration
 * 
 * Safe, reversible configuration for GEPA memory system.
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_PATH = join(homedir(), '.dirgha', 'gepa-config.json');

export interface GEPAConfig {
  enabled: boolean;
  maxFacts: number;
  minTruthScore: number;
  maxStalenessDays: number;
  optimizerInterval: number;
  fallbackOnError: boolean;
}

const DEFAULT_CONFIG: GEPAConfig = {
  enabled: false,              // Start disabled (safe)
  maxFacts: 50,                // Cap system prompt size
  minTruthScore: 0.8,          // Only verified facts
  maxStalenessDays: 7,         // Freshness threshold
  optimizerInterval: 25,       // Run every N turns
  fallbackOnError: true        // Always safe
};

/**
 * Load GEPA configuration
 * Priority: env var > config file > defaults
 */
export function loadGEPAConfig(): GEPAConfig {
  // Environment variable override
  const envEnabled = process.env.DIRGHA_GEPA;
  
  // Config file
  let fileConfig: Partial<GEPAConfig> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      // Ignore corrupt config
    }
  }
  
  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    enabled: envEnabled !== undefined 
      ? envEnabled === 'true' 
      : (fileConfig.enabled ?? DEFAULT_CONFIG.enabled)
  };
}

/**
 * Save configuration to file
 */
export function saveGEPAConfig(config: Partial<GEPAConfig>): void {
  const current = loadGEPAConfig();
  const updated = { ...current, ...config };
  
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
  } catch (err) {
    console.error('[GEPA] Failed to save config:', err);
  }
}

/**
 * Enable GEPA safely
 */
export function enableGEPA(): void {
  saveGEPAConfig({ enabled: true });
  console.log('[GEPA] Enabled. Run "dirgha /memory-status" to verify.');
}

/**
 * Disable GEPA (instant rollback)
 */
export function disableGEPA(): void {
  saveGEPAConfig({ enabled: false });
  console.log('[GEPA] Disabled. Falling back to holographic memory.');
}

/**
 * Check if GEPA is enabled
 */
export function isGEPAEnabled(): boolean {
  return loadGEPAConfig().enabled;
}

/**
 * Print current configuration
 */
export function printGEPAStatus(): string {
  const config = loadGEPAConfig();
  return `
GEPA Memory System Status:
━━━━━━━━━━━━━━━━━━━━━━━━━
Enabled:        ${config.enabled ? '✅ YES' : '❌ NO'}
Max Facts:      ${config.maxFacts}
Min Truth:      ${config.minTruthScore}
Max Staleness:  ${config.maxStalenessDays} days
Optimizer:      Every ${config.optimizerInterval} turns
Fallback:       ${config.fallbackOnError ? '✅ SAFE' : '❌ UNSAFE'}

Config File:    ${CONFIG_PATH}
━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim();
}
