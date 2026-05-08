/**
 * Multi-model transactional API. Wraps relational + FTS + vector + graph
 * writes in a single SQLite BEGIN IMMEDIATE / COMMIT, so an agent can
 * fire a furious burst of cross-model writes and either get them all or
 * get nothing — no partial state.
 *
 * Use from agent tools (transactional_write tool exposes this) or from
 * direct callers. The callback receives a typed `tx` object; throw or
 * abort to roll back.
 */
import { openDb } from "./db.js";
/**
 * Run a callback inside a single SQLite transaction. All writes (messages,
 * embeddings, graph nodes, graph edges) commit atomically via BEGIN IMMEDIATE.
 *
 * Pass an optional Database handle for testing with in-memory databases;
 * defaults to the shared `openDb()` singleton.
 */
export function transactional(fn, db) {
    const d = db ?? openDb();
    // BEGIN IMMEDIATE — acquires write lock now (not deferred), so concurrent
    // writers serialise instead of failing late with SQLITE_BUSY.
    const txn = d.transaction((apiFn) => {
        const api = {
            message: {
                insert(w) {
                    const ts = w.ts ?? Date.now();
                    const session = w.session_id ?? "default";
                    const stmt = d.prepare("INSERT INTO messages(session_id, role, content, ts) VALUES (?,?,?,?)");
                    const r = stmt.run(session, w.role, w.content, ts);
                    return r.lastInsertRowid;
                },
            },
            embedding: {
                insert(w) {
                    if (!Array.isArray(w.vec) || w.vec.length === 0) {
                        throw new Error("embedding.vec must be a non-empty number array");
                    }
                    // sqlite-vec's vec0 virtual table uses JSON-serialised float[]
                    const vecJson = JSON.stringify(w.vec);
                    const ins = d.prepare("INSERT INTO embeddings(embedding) VALUES (?)");
                    const r = ins.run(vecJson);
                    const rowid = r.lastInsertRowid;
                    d.prepare("INSERT INTO embedding_meta(id, source, chunk, ts) VALUES (?,?,?,?)").run(rowid, w.source, w.chunk, Date.now());
                    return rowid;
                },
            },
            graph: {
                addNode(w) {
                    d.prepare("INSERT INTO graph_nodes(id, type, props) VALUES (?,?,?) " +
                        "ON CONFLICT(id) DO UPDATE SET type=excluded.type, props=excluded.props").run(w.id, w.type, w.props ? JSON.stringify(w.props) : null);
                    return w.id;
                },
                addEdge(w) {
                    d.prepare("INSERT INTO graph_edges(src, dst, rel, props) VALUES (?,?,?,?) " +
                        "ON CONFLICT(src, dst, rel) DO UPDATE SET props=excluded.props").run(w.src, w.dst, w.rel, w.props ? JSON.stringify(w.props) : null);
                    return { src: w.src, dst: w.dst, rel: w.rel };
                },
            },
        };
        return apiFn(api);
    });
    return txn.immediate(fn);
}
//# sourceMappingURL=transaction.js.map