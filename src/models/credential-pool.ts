/**
 * models/credential-pool.ts — Multi-key credential rotation for providers
 * 
 * Manages multiple API keys per provider with rotation strategies:
 * - least_used: Distribute load across keys (default)
 * - round_robin: Rotate sequentially
 * - failover: Use primary, fallback on 401
 */
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface CredentialEntry {
  key: string;
  usageCount: number;
  lastUsed: number;
  failures: number;
  lastFailure: number;
}

interface ProviderCredentials {
  strategy: 'least_used' | 'round_robin' | 'failover';
  currentIndex: number;
  keys: CredentialEntry[];
}

const CREDENTIALS_PATH = join(homedir(), '.dirgha', 'credential-pools.json');

export class CredentialPoolManager {
  private pools: Map<string, ProviderCredentials> = new Map();
  private loaded = false;

  constructor() {
    this.load();
  }

  /**
   * Add a credential pool for a provider
   */
  addPool(provider: string, keys: string[], strategy: 'least_used' | 'round_robin' | 'failover' = 'least_used'): void {
    if (keys.length === 0) {
      throw new Error(`No keys provided for ${provider}`);
    }

    this.pools.set(provider, {
      strategy,
      currentIndex: 0,
      keys: keys.map(key => ({
        key,
        usageCount: 0,
        lastUsed: 0,
        failures: 0,
        lastFailure: 0,
      })),
    });

    this.save();
  }

  /**
   * Get the next API key for a provider using the configured strategy
   */
  getKey(provider: string): string | undefined {
    const pool = this.pools.get(provider);
    if (!pool || pool.keys.length === 0) {
      // Fall back to environment variable
      return this.getEnvKey(provider);
    }

    // Filter out keys with recent failures (5min cooldown)
    const now = Date.now();
    const availableKeys = pool.keys.filter(k => 
      k.failures === 0 || (now - k.lastFailure) > 300000
    );

    if (availableKeys.length === 0) {
      // All keys failing, reset and try anyway
      pool.keys.forEach(k => k.failures = 0);
    }

    let selected: CredentialEntry;

    switch (pool.strategy) {
      case 'least_used':
        selected = availableKeys.sort((a, b) => a.usageCount - b.usageCount)[0] 
          || pool.keys[0];
        break;
      case 'round_robin':
        selected = pool.keys[pool.currentIndex % pool.keys.length];
        pool.currentIndex = (pool.currentIndex + 1) % pool.keys.length;
        break;
      case 'failover':
        // Use first available key (respects failure cooldown)
        selected = availableKeys[0] || pool.keys[0];
        break;
      default:
        selected = pool.keys[0];
    }

    selected.usageCount++;
    selected.lastUsed = now;
    this.save();

    return selected.key;
  }

  /**
   * Report a key failure to mark it for cooldown
   */
  reportFailure(provider: string, key: string): void {
    const pool = this.pools.get(provider);
    if (!pool) return;

    const entry = pool.keys.find(k => k.key === key);
    if (entry) {
      entry.failures++;
      entry.lastFailure = Date.now();
      this.save();
    }
  }

  /**
   * Get pool statistics for monitoring
   */
  getStats(provider: string): { total: number; healthy: number; totalUsage: number } | undefined {
    const pool = this.pools.get(provider);
    if (!pool) return undefined;

    const now = Date.now();
    const healthy = pool.keys.filter(k => 
      k.failures === 0 || (now - k.lastFailure) > 300000
    ).length;

    return {
      total: pool.keys.length,
      healthy,
      totalUsage: pool.keys.reduce((sum, k) => sum + k.usageCount, 0),
    };
  }

  /**
   * List all configured pools
   */
  listPools(): string[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Remove a pool
   */
  removePool(provider: string): void {
    this.pools.delete(provider);
    this.save();
  }

  private getEnvKey(provider: string): string | undefined {
    const envMap: Record<string, string> = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      fireworks: 'FIREWORKS_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      nvidia: 'NVIDIA_API_KEY',
      groq: 'GROQ_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      gemini: 'GEMINI_API_KEY',
      xai: 'XAI_API_KEY',
      cohere: 'COHERE_API_KEY',
    };

    const envVar = envMap[provider.toLowerCase()];
    return envVar ? process.env[envVar] : undefined;
  }

  private load(): void {
    try {
      if (existsSync(CREDENTIALS_PATH)) {
        const data = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
        this.pools = new Map(Object.entries(data));
        this.loaded = true;
      }
    } catch {
      this.pools = new Map();
    }
  }

  private save(): void {
    try {
      const data = Object.fromEntries(this.pools);
      writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2));
    } catch {
      // Fail silently - credential pool is best-effort
    }
  }
}

// Singleton instance
let globalManager: CredentialPoolManager | undefined;

export function getCredentialPoolManager(): CredentialPoolManager {
  if (!globalManager) {
    globalManager = new CredentialPoolManager();
  }
  return globalManager;
}
