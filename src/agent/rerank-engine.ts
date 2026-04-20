/** agent/rerank-engine.ts — High-quality code chunking and semantic reranking */
import { embed } from '../embeddings/provider.js';
import { rerankTopK } from '../embeddings/math.js';

export interface CodeChunk {
  content: string;
  path: string;
  startLine: number;
  endLine: number;
}

/**
 * Splits a file into logical chunks (approx 1000 chars each) for embedding.
 */
export function chunkFile(filePath: string, content: string): CodeChunk[] {
  const lines = content.split('\n');
  const chunks: CodeChunk[] = [];
  const chunkSize = 50; // lines
  
  for (let i = 0; i < lines.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, lines.length);
    chunks.push({
      path: filePath,
      content: lines.slice(i, end).join('\n'),
      startLine: i + 1,
      endLine: end,
    });
  }
  
  return chunks;
}

/**
 * Reranks chunks based on a query. Returns Top-K relevant segments.
 */
export async function rerankChunks(
  query: string, 
  chunks: CodeChunk[], 
  k: number = 5
): Promise<CodeChunk[]> {
  if (chunks.length <= k) return chunks;

  const queryVector = await embed(query);
  const candidates = await Promise.all(
    chunks.map(async chunk => ({
      vector: await embed(chunk.content),
      item: chunk
    }))
  );

  const results = rerankTopK(queryVector, candidates, k);
  return results.map(r => r.item);
}

/**
 * Formats reranked chunks for inclusion in the system prompt.
 */
export function formatRerankedChunks(chunks: CodeChunk[]): string {
  if (chunks.length === 0) return '';
  
  let out = '## Relevant Code Context (Semantic Reranked)\n';
  out += 'The following snippets were selected as the most relevant to your current task:\n\n';
  
  for (const chunk of chunks) {
    out += `### ${chunk.path} (Lines ${chunk.startLine}-${chunk.endLine})\n`;
    out += '```\n';
    out += chunk.content + '\n';
    out += '```\n\n';
  }
  
  return out;
}
