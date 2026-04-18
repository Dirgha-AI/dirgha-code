// @ts-nocheck
import type { KnowledgeAPIConfig } from './types.js';

export class KnowledgeAPIClient {
  constructor(private config: KnowledgeAPIConfig) {}

  async query(params: {
    query: string;
    tags?: string[];
    projectId?: string;
    semantic?: boolean;
    limit?: number;
  }): Promise<{ facts: Array<{ id: string; content: string; relevance: number; tags: string[] }> }> {
    const url = new URL('/api/v1/knowledge/query', this.config.baseUrl);
    url.searchParams.set('q', params.query);
    if (params.tags) url.searchParams.set('tags', params.tags.join(','));
    if (params.projectId) url.searchParams.set('projectId', params.projectId);
    if (params.semantic) url.searchParams.set('semantic', 'true');
    url.searchParams.set('limit', String(params.limit || 10));

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${this.config.apiKey}` }
    });

    if (!response.ok) throw new Error(`Query failed: ${response.statusText}`);
    return response.json();
  }

  async getFacts(since?: string): Promise<Array<{ id: string; content: string; tags: string[]; updatedAt: string; version: number }>> {
    const url = new URL('/api/v1/knowledge/facts', this.config.baseUrl);
    if (since) url.searchParams.set('since', since);
    if (this.config.projectId) url.searchParams.set('projectId', this.config.projectId);

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${this.config.apiKey}` }
    });

    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
    return (await response.json()).facts;
  }

  async uploadFacts(facts: Array<{ id: string; content: string; tags: string[]; embedding?: number[] }>): Promise<{ uploaded: number }> {
    const response = await fetch(`${this.config.baseUrl}/api/v1/knowledge/facts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        facts,
        projectId: this.config.projectId,
        orgId: this.config.orgId
      })
    });

    if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
    return response.json();
  }

  async getSyncStatus(): Promise<{ facts: number; lastModified: string }> {
    const url = new URL('/api/v1/knowledge/sync-status', this.config.baseUrl);
    if (this.config.projectId) url.searchParams.set('projectId', this.config.projectId);

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${this.config.apiKey}` }
    });

    if (!response.ok) throw new Error(`Status check failed: ${response.statusText}`);
    return response.json();
  }
}
