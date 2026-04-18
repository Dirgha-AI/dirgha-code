/**
 * Embedding Generation Utilities
 * @module commands/curate/embeddings
 */
import chalk from 'chalk';
import { initEmbeddingProvider, embed, getEmbeddingInfo } from '../../embeddings/provider.js';

export async function generateEmbedding(
  content: string, 
  providerName: string,
  skipEmbed: boolean
): Promise<{ embedding: number[] | undefined; provider: string }> {
  if (skipEmbed) {
    return { embedding: undefined, provider: providerName };
  }

  let embedding: number[] | undefined;
  let finalProvider = providerName;

  try {
    if (providerName === 'hash' || providerName === 'auto') {
      embedding = createHashEmbedding(content);
      finalProvider = 'hash';
    } else {
      embedding = await embed(content);
    }
  } catch (err) {
    console.log(chalk.yellow(`Embedding failed (${providerName}), using hash fallback`));
    embedding = createHashEmbedding(content);
    finalProvider = 'hash';
  }

  return { embedding, provider: finalProvider };
}

function createHashEmbedding(text: string): number[] {
  const hash = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const dims = 64;
  return Array.from({ length: dims }, (_, i) => Math.sin(hash + i * 0.5) / dims);
}

export function embeddingToBuffer(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

export { getEmbeddingInfo };
