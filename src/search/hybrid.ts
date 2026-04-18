import { Database } from '../utils/sqlite.js';

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  tags: string[];
  type: 'semantic' | 'keyword';
}

export function hybridSearch(
  db: Database,
  params: {
    query: string;
    queryEmbedding?: number[];
    projectId?: string;
    tags?: string[];
    semanticWeight?: number;
    keywordWeight?: number;
    limit?: number;
  }
): SearchResult[] {
  const { 
    query, 
    queryEmbedding, 
    projectId = 'default',
    tags,
    semanticWeight = 0.7,
    keywordWeight = 0.3,
    limit = 10
  } = params;

  const semanticResults = queryEmbedding ? searchSemantic(db, queryEmbedding, projectId, limit * 2) : [];
  const keywordResults = searchKeyword(db, query, projectId, limit * 2);

  const combined = new Map<string, SearchResult>();

  for (const r of semanticResults) {
    combined.set(r.id, { ...r, score: r.score * semanticWeight, type: 'semantic' });
  }

  for (const r of keywordResults) {
    const existing = combined.get(r.id);
    if (existing) {
      existing.score += r.score * keywordWeight;
      existing.type = 'hybrid' as any;
    } else {
      combined.set(r.id, { ...r, score: r.score * keywordWeight, type: 'keyword' });
    }
  }

  if (tags && tags.length > 0) {
    for (const [id, result] of combined) {
      const hasTag = tags.some(t => result.tags.includes(t));
      if (!hasTag) combined.delete(id);
    }
  }

  return Array.from(combined.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function searchSemantic(
  db: Database,
  embedding: number[],
  projectId: string,
  limit: number
): SearchResult[] {
  try {
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
    
    const rows = db.prepare(`
      SELECT id, content, tags, vector_distance_cosine(embedding, ?) as distance
      FROM curated_facts
      WHERE project_id = ?
      ORDER BY distance
      LIMIT ?
    `).all(embeddingBuffer, projectId, limit) as Array<{ id: string; content: string; tags: string; distance: number }>;

    return rows.map(r => ({
      id: r.id,
      content: r.content,
      score: 1 - r.distance,
      tags: JSON.parse(r.tags || '[]'),
      type: 'semantic' as const
    }));
  } catch {
    return [];
  }
}

function searchKeyword(
  db: Database,
  query: string,
  projectId: string,
  limit: number
): SearchResult[] {
  const terms = query.split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return [];

  const matchExpr = terms.map(t => `"${t.replace(/"/g, '""')}"`).join(' OR ');

  const rows = db.prepare(`
    SELECT id, content, tags, rank
    FROM curated_facts
    WHERE project_id = ? AND content MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(projectId, matchExpr, limit) as Array<{ id: string; content: string; tags: string; rank: number }>;

  return rows.map(r => ({
    id: r.id,
    content: r.content,
    score: Math.max(0, 1 - Math.abs(r.rank) / 10),
    tags: JSON.parse(r.tags || '[]'),
    type: 'keyword' as const
  }));
}
