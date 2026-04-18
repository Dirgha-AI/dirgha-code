/**
 * Local Embedding Providers
 * @module embeddings/ollama
 *
 * llamacppProvider — llama-server /v1/embeddings (preferred)
 * ollamaProvider   — Ollama /api/embeddings (fallback)
 */

import type { EmbeddingProvider } from './provider.js';

const LLAMACPP_URL = process.env.LLAMACPP_URL ?? 'http://localhost:8080'

export const llamacppProvider: EmbeddingProvider = {
  name: 'llamacpp-embeddings',
  dims: 768,

  async embed(text: string): Promise<number[]> {
    const r = await fetch(`${LLAMACPP_URL}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'local', input: text.slice(0, 8192) }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!r.ok) throw new Error(`llama-server embeddings error: ${r.status}`)
    const d = await r.json() as any
    return d.data?.[0]?.embedding ?? []
  },

  async available(): Promise<boolean> {
    try {
      const r = await fetch(`${LLAMACPP_URL}/health`, { signal: AbortSignal.timeout(1000) })
      return r.ok
    } catch { return false }
  },
}

export const ollamaProvider: EmbeddingProvider = {
  name: 'ollama-nomic',
  dims: 768, // nomic-embed-text dimensions

  async embed(text: string): Promise<number[]> {
    try {
      const response = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text:latest',
          prompt: text.slice(0, 8192), // Token limit
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json() as { embedding: number[] };
      return data.embedding;
    } catch (error) {
      // Log warning but don't crash — caller should fallback
      console.warn('Ollama embedding failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  },

  async available(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      
      const response = await fetch('http://localhost:11434/api/tags', {
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  },
};
