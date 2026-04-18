import { describe, it, expect, vi } from 'vitest';
import { KnowledgeAPIClient } from '../../api/knowledge.js';

describe('KnowledgeAPIClient', () => {
  const client = new KnowledgeAPIClient({
    baseUrl: 'https://api.dirgha.ai',
    apiKey: 'test-key',
    projectId: 'test-project'
  });

  describe('query', () => {
    it('should construct correct query URL', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ facts: [] })
      } as any);

      await client.query({ query: 'test', tags: ['tag1'], semantic: true, limit: 5 });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/knowledge/query?q=test'),
        expect.any(Object)
      );
    });

    it('should throw on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized'
      } as any);

      await expect(client.query({ query: 'test' })).rejects.toThrow('Query failed');
    });
  });

  describe('uploadFacts', () => {
    it('should send facts with correct payload', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ uploaded: 2 })
      } as any);

      const facts = [
        { id: '1', content: 'Fact 1', tags: ['a'] },
        { id: '2', content: 'Fact 2', tags: ['b'], embedding: [0.1, 0.2] }
      ];

      const result = await client.uploadFacts(facts);
      expect(result.uploaded).toBe(2);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/knowledge/facts'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key'
          })
        })
      );
    });
  });

  describe('getFacts', () => {
    it('should include since parameter when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ facts: [] })
      } as any);

      await client.getFacts('2026-04-01T00:00:00Z');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('since=2026-04-01'),
        expect.any(Object)
      );
    });
  });
});
