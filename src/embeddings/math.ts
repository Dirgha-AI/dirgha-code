/** embeddings/math.ts — High-performance vector operations for reranking */

/**
 * Calculates cosine similarity between two vectors.
 * Range: [-1, 1], where 1 is identical.
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length) return 0;
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

export interface ScoredCandidate<T> {
  item: T;
  score: number;
}

/**
 * Reranks a list of candidates based on similarity to a query vector.
 */
export function rerankTopK<T>(
  queryVector: number[],
  candidates: Array<{ vector: number[]; item: T }>,
  k: number
): ScoredCandidate<T>[] {
  return candidates
    .map(c => ({
      item: c.item,
      score: cosineSimilarity(queryVector, c.vector)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
