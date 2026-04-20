import { describe, it, expect } from 'vitest';
import { cosineSimilarity, rerankTopK } from '../math.js';

describe('Vector Math (Reranker Core)', () => {
  it('should calculate identical vectors as 1.0', () => {
    const v = [1, 0, 1];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('should calculate orthogonal vectors as 0.0', () => {
    const v1 = [1, 0];
    const v2 = [0, 1];
    expect(cosineSimilarity(v1, v2)).toBe(0);
  });

  it('should calculate opposite vectors as -1.0', () => {
    const v1 = [1, 1];
    const v2 = [-1, -1];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1.0);
  });

  it('should correctly rerank a list of candidates', () => {
    const query = [1, 0];
    const candidates = [
      { vector: [0.1, 0.9], item: 'far' },
      { vector: [0.9, 0.1], item: 'near' },
      { vector: [0.5, 0.5], item: 'mid' }
    ];

    const results = rerankTopK(query, candidates, 2);
    expect(results).toHaveLength(2);
    expect(results[0].item).toBe('near');
    expect(results[1].item).toBe('mid');
  });
});
