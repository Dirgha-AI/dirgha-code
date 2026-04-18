/**
 * Gateway Remote Embedding Provider
 * @module embeddings/gateway
 * 
 * Uses Dirgha Gateway API for embeddings
 * Requires DIRGHA_TOKEN or DIRGHA_API_KEY
 */

import type { EmbeddingProvider } from './provider.js';
import { getCredentials } from '../utils/credentials.js';

const GATEWAY_URL = process.env['DIRGHA_GATEWAY_URL'] || 'https://api.dirgha.ai';

export const gatewayProvider: EmbeddingProvider = {
  name: 'gateway',
  dims: 1536, // Gateway embedding dimensions

  async embed(text: string): Promise<number[]> {
    const creds = getCredentials();
    if (!creds.token) {
      throw new Error('No Dirgha token found. Run: dirgha login');
    }

    const response = await fetch(`${GATEWAY_URL}/api/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.token}`,
      },
      body: JSON.stringify({
        input: text.slice(0, 8192),
        model: 'text-embedding-3-small',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gateway embedding error: ${response.status} - ${error}`);
    }

    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  },

  async available(): Promise<boolean> {
    const creds = getCredentials();
    if (!creds.token) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${GATEWAY_URL}/api/v1/health`, {
        headers: { 'Authorization': `Bearer ${creds.token}` },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  },
};
