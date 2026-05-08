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
export interface MessageWrite {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    ts?: number;
    session_id?: string;
}
export interface EmbeddingWrite {
    source: string;
    chunk: string;
    vec: number[];
}
export interface GraphNodeWrite {
    id: string;
    type: string;
    props?: Record<string, unknown>;
}
export interface GraphEdgeWrite {
    src: string;
    dst: string;
    rel: string;
    props?: Record<string, unknown>;
}
export interface TxResult {
    message_id?: number;
    embedding_id?: number;
    node_ids: string[];
    edge_keys: string[];
}
export interface TxApi {
    message: {
        insert(w: MessageWrite): number;
    };
    embedding: {
        insert(w: EmbeddingWrite): number;
    };
    graph: {
        addNode(w: GraphNodeWrite): string;
        addEdge(w: GraphEdgeWrite): {
            src: string;
            dst: string;
            rel: string;
        };
    };
}
/**
 * Run a callback inside a single SQLite transaction. All writes (messages,
 * embeddings, graph nodes, graph edges) commit atomically via BEGIN IMMEDIATE.
 *
 * Pass an optional Database handle for testing with in-memory databases;
 * defaults to the shared `openDb()` singleton.
 */
export declare function transactional<T>(fn: (tx: TxApi) => T, db?: import("better-sqlite3").Database): T;
