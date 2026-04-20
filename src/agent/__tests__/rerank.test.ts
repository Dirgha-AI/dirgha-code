import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chunkFile, rerankChunks } from '../rerank-engine.js';
import * as provider from '../../embeddings/provider.js';

describe('Reranker Engine (Google-Grade Context)', () => {
  
  it('should chunk a file into expected line segments', () => {
    const content = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join('\n');
    const chunks = chunkFile('test.ts', content);
    
    expect(chunks).toHaveLength(3); // 50, 50, 20
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(50);
    expect(chunks[2].startLine).toBe(101);
    expect(chunks[2].endLine).toBe(120);
  });

  it('should rerank chunks based on mocked embeddings', async () => {
    // Mock provider.embed to return deterministic vectors
    // "query" -> [1, 0]
    // "relevant" -> [0.9, 0.1]
    // "noise" -> [0.1, 0.9]
    vi.spyOn(provider, 'embed').mockImplementation(async (text: string) => {
      if (text.includes('query')) return [1, 0];
      if (text.includes('relevant')) return [0.9, 0.1];
      return [0, 1];
    });

    const chunks = [
      { path: 'a.ts', content: 'noise block', startLine: 1, endLine: 10 },
      { path: 'b.ts', content: 'relevant block', startLine: 1, endLine: 10 },
    ];

    const results = await rerankChunks('query string', chunks, 1);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('relevant block');
  });
});
