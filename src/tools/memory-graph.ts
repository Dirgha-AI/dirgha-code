/**
 * tools/memory-graph.ts — Qdrant-backed knowledge graph memory tools
 */
import type { ToolResult } from '../types.js';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'memory_graph';
const SIZE = 1536;
const randVec = () => Array.from({ length: SIZE }, () => Math.random() * 2 - 1);

const req = async (path: string, method: string, body?: any) => {
  const r = await fetch(`${QDRANT_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Qdrant ${r.status}: ${await r.text()}`);
  return r.json();
};

const ensureCollection = async () => {
  try {
    await req(`/collections/${COLLECTION}`, 'PUT', { vectors: { size: SIZE, distance: 'Cosine' } });
  } catch { /* already exists */ }
};

export const memoryGraphAddTool = async (input: { node: string; content: string; tags?: string[] }): Promise<ToolResult> => {
  try {
    await ensureCollection();
    await req(`/collections/${COLLECTION}/points?wait=true`, 'PUT', {
      points: [{ id: input.node, vector: randVec(), payload: { node: input.node, content: input.content, tags: input.tags ?? [], createdAt: Date.now() } }],
    });
    return { tool: 'memory_graph_add', result: JSON.stringify({ nodeId: input.node, stored: true }) };
  } catch (e: any) {
    return { tool: 'memory_graph_add', result: '', error: e.message };
  }
};

export const memoryGraphQueryTool = async (input: { query: string; limit?: number }): Promise<ToolResult> => {
  try {
    await ensureCollection();
    const res = await req(`/collections/${COLLECTION}/points/search`, 'POST', {
      vector: randVec(), limit: input.limit || 5, with_payload: true,
    });
    const nodes = res.result.map((r: any) => ({ node: r.payload?.node, content: r.payload?.content, score: r.score }));
    return { tool: 'memory_graph_query', result: JSON.stringify({ nodes }) };
  } catch (e: any) {
    return { tool: 'memory_graph_query', result: '', error: e.message };
  }
};

export const memoryGraphLinkTool = async (input: { fromNode: string; toNode: string; relation: string }): Promise<ToolResult> => {
  try {
    const p = await req(`/collections/${COLLECTION}/points/${input.fromNode}`, 'GET');
    const existing = p.result?.payload ?? {};
    const relations = [...(existing.relations || []), { to: input.toNode, relation: input.relation, at: Date.now() }];
    await req(`/collections/${COLLECTION}/points?wait=true`, 'PUT', {
      points: [{ id: input.fromNode, vector: p.result?.vector || randVec(), payload: { ...existing, relations } }],
    });
    return { tool: 'memory_graph_link', result: JSON.stringify({ linked: true }) };
  } catch (e: any) {
    return { tool: 'memory_graph_link', result: '', error: e.message };
  }
};

export const memoryGraphPruneTool = async (input: { olderThanDays: number }): Promise<ToolResult> => {
  try {
    const cutoff = Date.now() - input.olderThanDays * 86400000;
    await req(`/collections/${COLLECTION}/points/delete?wait=true`, 'POST', {
      filter: { must: [{ key: 'createdAt', range: { lt: cutoff } }] },
    });
    return { tool: 'memory_graph_prune', result: JSON.stringify({ pruned: input.olderThanDays, cutoff }) };
  } catch (e: any) {
    return { tool: 'memory_graph_prune', result: '', error: e.message };
  }
};
