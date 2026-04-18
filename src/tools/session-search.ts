/**
 * tools/session-search.ts — Cross-session search over all stored messages using FTS5.
 */
import { getDB } from '../session/db.js';
import type { ToolResult } from '../types.js';

interface SearchRow {
  session_id: string;
  role: string;
  content: string;
  created_at: string;
}

export function sessionSearchTool(input: Record<string, any>): ToolResult {
  const query = String(input.query ?? '').trim();
  if (!query) return { tool: 'session_search', result: '', error: 'query is required' };

  try {
    const db = getDB();
    let rows: SearchRow[];

    // Try LIKE search (messages table has no FTS virtual table)
    const words = query.split(/\s+/).map(w => `%${w}%`);
    const whereClauses = words.map(() => 'content LIKE ?').join(' AND ');
    rows = db.prepare(`
      SELECT session_id, role, substr(content, 1, 300) AS content, created_at
      FROM messages
      WHERE ${whereClauses}
      ORDER BY created_at DESC
      LIMIT 10
    `).all(...words) as SearchRow[];

    if (!rows.length) return { tool: 'session_search', result: 'No results found.' };

    const formatted = rows.map((r, i) =>
      `${i + 1}. [${r.created_at}] session:${r.session_id.slice(0, 8)} (${r.role})\n   ${r.content.replace(/\n/g, ' ').slice(0, 250)}`
    ).join('\n\n');

    return { tool: 'session_search', result: formatted };
  } catch (err) {
    return { tool: 'session_search', result: '', error: (err as Error).message };
  }
}
