/**
 * Embedding Provider Interface
 * @module embeddings/provider
 * 
 * Zero-breaking-change strategy:
 * - Keep hash-based as fallback
 * - Add real providers incrementally
 * - Auto-detect available providers
 */

export interface EmbeddingProvider {
  name: string;
  dims: number;
  embed(text: string): Promise<number[]>;
  available(): Promise<boolean>;
}

// Global provider registry
let _provider: EmbeddingProvider | null = null;

export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  _provider = provider;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!_provider) {
    // Lazy init: pick best available
    throw new Error('Embedding provider not initialized. Call initEmbeddingProvider() first.');
  }
  return _provider;
}

/** Hash-based fallback (existing behavior, zero dependencies) */
export const hashProvider: EmbeddingProvider = {
  name: 'hash-fallback',
  dims: 64,
  async embed(text: string): Promise<number[]> {
    const hash = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: 64 }, (_, i) => Math.sin(hash + i * 0.5) / 64);
  },
  async available(): Promise<boolean> {
    return true; // Always available
  },
};

/** Auto-detect and initialize best available provider */
export async function initEmbeddingProvider(): Promise<EmbeddingProvider> {
  // If in test environment, skip local service detection to avoid 404 errors
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    _provider = hashProvider;
    return hashProvider;
  }

  // Try providers in order of quality: llama-server > ollama > gateway
  const providers = [
    () => import('./ollama.js').then(m => m.llamacppProvider).catch(() => null),
    () => import('./ollama.js').then(m => m.ollamaProvider).catch(() => null),
    () => import('./gateway.js').then(m => m.gatewayProvider).catch(() => null),
  ];

  for (const loader of providers) {
    try {
      const provider = await loader();
      if (provider && await provider.available()) {
        _provider = provider;
        return provider;
      }
    } catch {
      // Continue to next
    }
  }

  // Fallback to hash-based
  _provider = hashProvider;
  return hashProvider;
}

/** Generate embedding using current provider */
export async function embed(text: string): Promise<number[]> {
  const provider = getEmbeddingProvider();
  return provider.embed(text);
}

/** Get current provider info */
export function getEmbeddingInfo(): { name: string; dims: number } {
  const provider = _provider || hashProvider;
  return { name: provider.name, dims: provider.dims };
}
