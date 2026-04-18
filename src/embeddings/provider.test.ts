/**
 * Embedding Provider Tests
 * @module embeddings/provider.test
 * 
 * Sprint 7: Knowledge Graph Foundation — Phase 1 Complete
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  setEmbeddingProvider, 
  getEmbeddingProvider,
  initEmbeddingProvider,
  embed,
  getEmbeddingInfo,
  hashProvider 
} from './provider.js';

describe('Embedding Provider', () => {
  beforeEach(() => {
    // Reset to default state
    setEmbeddingProvider(hashProvider);
  });

  describe('hashProvider', () => {
    it('should generate 64-dimensional embeddings', async () => {
      const embedding = await hashProvider.embed('test');
      expect(embedding).toHaveLength(64);
    });

    it('should be deterministic', async () => {
      const e1 = await hashProvider.embed('hello world');
      const e2 = await hashProvider.embed('hello world');
      expect(e1).toEqual(e2);
    });

    it('should produce different embeddings for different texts', async () => {
      const e1 = await hashProvider.embed('hello');
      const e2 = await hashProvider.embed('world');
      expect(e1).not.toEqual(e2);
    });

    it('should always be available', async () => {
      const available = await hashProvider.available();
      expect(available).toBe(true);
    });

    it('should produce normalized vectors', async () => {
      const embedding = await hashProvider.embed('test');
      const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(magnitude).toBeGreaterThan(0);
      expect(magnitude).toBeLessThan(2); // Roughly normalized
    });
  });

  describe('provider management', () => {
    it('should get and set provider', () => {
      const customProvider = {
        name: 'custom',
        dims: 128,
        embed: async () => new Array(128).fill(0),
        available: async () => true,
      };

      setEmbeddingProvider(customProvider);
      const provider = getEmbeddingProvider();
      
      expect(provider.name).toBe('custom');
      expect(provider.dims).toBe(128);
    });

    it('should throw if provider not initialized', () => {
      // Reset to null to test error
      setEmbeddingProvider(null as any);
      
      expect(() => getEmbeddingProvider()).toThrow('Embedding provider not initialized');
    });

    it('should return embedding info', () => {
      const info = getEmbeddingInfo();
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('dims');
      expect(typeof info.dims).toBe('number');
    });
  });

  describe('embed function', () => {
    it('should generate embeddings using current provider', async () => {
      const embedding = await embed('test content');
      expect(embedding).toBeInstanceOf(Array);
      expect(embedding.length).toBeGreaterThan(0);
    });

    it('should handle empty strings', async () => {
      const embedding = await embed('');
      expect(embedding).toBeInstanceOf(Array);
      expect(embedding.length).toBe(64);
    });

    it('should handle long strings', async () => {
      const longText = 'a'.repeat(10000);
      const embedding = await embed(longText);
      expect(embedding).toBeInstanceOf(Array);
    });
  });

  describe('initEmbeddingProvider', () => {
    it('should return a valid provider', async () => {
      const provider = await initEmbeddingProvider();
      expect(provider).toBeDefined();
      expect(provider.name).toBeDefined();
      expect(provider.dims).toBeDefined();
      expect(typeof provider.embed).toBe('function');
    });

    it('should set the global provider', async () => {
      await initEmbeddingProvider();
      const provider = getEmbeddingProvider();
      expect(provider).toBeDefined();
    });
  });
});
