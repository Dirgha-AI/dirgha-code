-- Per-session graph: nodes + directed labelled edges, both with a JSON
-- props bag for arbitrary metadata. The graph lives in the same SQLite
-- file as relational + FTS + (eventually) vector data, so transactions
-- can span all four data shapes — see docs/cli/index/agent-db.md.

CREATE TABLE IF NOT EXISTS graph_nodes (
  id    TEXT PRIMARY KEY,
  type  TEXT NOT NULL,
  props TEXT,                    -- JSON, nullable
  ts    INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS graph_edges (
  src   TEXT NOT NULL,
  dst   TEXT NOT NULL,
  rel   TEXT NOT NULL,
  props TEXT,                    -- JSON, nullable
  ts    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (src, dst, rel),
  FOREIGN KEY (src) REFERENCES graph_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (dst) REFERENCES graph_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edges_src ON graph_edges(src, rel);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON graph_edges(dst, rel);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON graph_nodes(type);
