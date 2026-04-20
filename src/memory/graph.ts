import { getDB } from '../session/db.js';

export interface GraphNode {
  id: string;
  type: 'symbol' | 'goal' | 'file';
  label: string;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: 'implements' | 'contains' | 'related_to';
}

export class GraphMemory {
  constructor() { this.ensureSchema(); }

  private ensureSchema() {
    const db = getDB();
    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        metadata TEXT
      );
      CREATE TABLE IF NOT EXISTS graph_edges (
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        type TEXT NOT NULL,
        PRIMARY KEY (from_id, to_id, type),
        FOREIGN KEY (from_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (to_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
      );
    `);
  }

  upsertNode(node: GraphNode) {
    const db = getDB();
    db.prepare('INSERT OR REPLACE INTO graph_nodes (id, type, label, metadata) VALUES (?, ?, ?, ?)')
      .run(node.id, node.type, node.label, JSON.stringify(node.metadata || {}));
  }

  link(from: string, to: string, type: GraphEdge['type']) {
    const db = getDB();
    db.prepare('INSERT OR IGNORE INTO graph_edges (from_id, to_id, type) VALUES (?, ?, ?)')
      .run(from, to, type);
  }

  getNeighbors(id: string) {
    const db = getDB();
    return db.prepare(`
      SELECT n.*, e.type as edge_type 
      FROM graph_nodes n
      JOIN graph_edges e ON (e.to_id = n.id OR e.from_id = n.id)
      WHERE (e.from_id = ? AND e.to_id = n.id) OR (e.to_id = ? AND e.from_id = n.id)
    `).all(id, id) as any[];
  }
}

export const graphMemory = new GraphMemory();
