# dirgha CLI as the agent-native database

> _"Databases were built for humans. Agents look like a DDoS attack to traditional DBs. Agents hit databases in furious bursts, spin up workspaces, throw them away, and need structured data + semantic search + graph relationships in one transaction. At scale, agents need: 1) Ephemeral sandboxes for data 2) Multi-model in one transaction 3) Agent ergonomic interface."_
>
> — VC pitch we're answering

This doc captures: (a) the audit of what's actually shipped today, (b) the framing that says **dirgha CLI in a VPS is the answer**, (c) the gap between today and the full pitch, (d) the sprint plan to close the gap, (e) the talking track for the VC.

**Sequencing:** this work comes **after** the in-flight CLI workstreams (ESC-stuck-tool fix, scroll-to-top investigation, Bucky marketplace go-live items 1-4). Sprints 1-4 below can run in parallel with Bucky 5-10 because they touch separate codepaths.

---

## 1. Audit — what data lives where today

(Report from the agent-spawned audit, 2026-05-08. File/line citations are absolute.)

### dirgha CLI (`/root/dirgha-code-release`)

Everything is on the user's laptop in `~/.dirgha/`:

| Layer | What | Where |
|---|---|---|
| Relational | SQLite — `sessions` and `messages` tables | `src/state/db.ts:50-77` opens `~/.dirgha/dirgha.db` via `better-sqlite3` |
| Full-text | FTS5 virtual table over `messages` | same DB file |
| Sessions | Append-only JSONL | `src/context/session.ts:47-85` writes `~/.dirgha/sessions/<id>.jsonl` |
| Memory | Plain markdown files | `src/context/memory.ts:99-247` reads/writes `~/.dirgha/memory/` |
| Knowledge | Plain markdown files + optional FTS5 sidecar | `src/context/knowledge.ts:62-184` reads/writes `~/.dirgha/knowledge/` |
| Vectors | **none** | — |
| Graph | **none** | — |

There is no remote DB. The CLI is fully local.

### Monorepo (`/root/dirgha-ai`)

The "production" data layer for the web platform — much wider but stitched together at runtime:

| Layer | What | Where |
|---|---|---|
| Relational #1 | Neon Postgres (`NEON_DATABASE_URL`) — chat / users / projects | `tools/dev-gateway/src/lib/db.ts:57-87` (`pgPool`) |
| Relational #2 | Neon Postgres (`DATABASE_URL_MEMORY`) — memories / credits / orgs | same file (`memoryPool`) |
| Vectors #1 | Qdrant cluster (`QDRANT_URL`) | `domains/01-core/gateway/src/services/qdrant.ts:18-133` |
| Vectors #2 | pgvector inside Neon with HNSW indexes | `domains/01-core/gateway/src/services/memory-manager/storage.ts:5-34` |
| Embeddings worker | External HTTP (`PROCESSING_URL:8003/api/embeddings`) | `domains/01-core/gateway/src/services/qdrant.ts` |
| Graph | Supabase Postgres `graph_nodes` / `graph_edges` | `supabase/migrations/20260131_context_graph.sql:1-27` |
| VPS state | Postgres `vps_instances` | `tools/dev-gateway/src/routes/vps.ts:25-38` |
| Bucky DAO/treasury | dedicated Postgres pool inside `apps/bucky/src` | `apps/bucky/src/dao/persistence.ts:131-205` |
| Bucky marketplace | Postgres `bucky_listings` / `bucky_jobs` / `depin_nodes` | `tools/dev-gateway/src/routes/bucky.ts:13-487` |
| Schema bootstrap | `CREATE TABLE IF NOT EXISTS` inline in route handlers | every `ensure*Schema()` call |

**No transactions span more than one of these.** Graph RAG (`services/context-graph.ts:103-138`) does Qdrant HTTP → Supabase row → Gemini call, all out-of-band. `grep "JOIN.*graph_nodes"` and `grep "embedding.*JOIN"` across the gateway return zero matches.

### Compute sandbox

| Layer | What | Where |
|---|---|---|
| VPS provisioning | E2B (default) + Daytona (build/scale/enterprise tiers) | `tools/dev-gateway/src/routes/vps.ts:99-139` |
| Per-session isolation | yes — fresh VM per session, dies on idle | E2B 4h hard timeout, Daytona 30 min idle |
| Per-session DB schema | **no** — all sessions share the same Neon Postgres | one `vps_instances` row, no schema-per-session |

**Compute** is per-session ephemeral; **data** is not.

---

## 2. VC requirements scored

| VC requirement | Status | Why |
|---|---|---|
| **Ephemeral sandboxes for data** | **Partial** | E2B/Daytona spin a VM per session; data lives in shared Neon. Dropping a session does NOT drop its DB state. |
| **Multi-model in one transaction** | **Missing** | All four shapes (relational, FTS, vector, graph) running in production — but in three different stores stitched by JS code. Zero ACID across them. |
| **Agent-ergonomic interface** | **Missing on monorepo, present on CLI** | Monorepo: every consumer talks raw `pg.Pool.query`. CLI: dirgha headless mode, MCP, structured tools — that IS agent-ergonomic. |

**One-sentence gap:** _we have all four data shapes running on production, but they live in three stores stitched by JavaScript at runtime — zero ACID across them and no agent-scoped workspace abstraction, so the VC's "agent fires a furious burst that touches all four in one transaction" is exactly what we cannot do today._

---

## 3. The reframe — dirgha CLI in a VPS solves this

The VC pitch sounds like "build a new agent-native DB product." The right answer: **we already shipped it. It's the CLI inside the VPS.**

### How that works

1. Agent says "I need a workspace" → gateway provisions E2B/Daytona VPS (5–30s, already in production at `tools/dev-gateway/src/routes/vps.ts`).
2. Inside the VPS, dirgha CLI runs. It writes to a fresh `~/.dirgha/dirgha.db` — single SQLite file the agent fully owns.
3. **All four data shapes commit in one `BEGIN`/`COMMIT`** — relational, FTS5, vector (`sqlite-vec`), graph (edges-as-rows). One file, four query languages, real ACID.
4. Agent fires bursts at the local SQLite — no shared-DB DDoS, no cross-tenant noise, **transactional ACID per-session for free**.
5. Session ends → VPS dies → data evaporates (unless explicitly persisted via tools).
6. Bucky settles compute via Lightning at the end (existing infra, see Bucky go-live workstream).

### Why this beats "build a new agent-DB product"

| Property | Agent-DB-as-a-service | dirgha-in-VPS |
|---|---|---|
| Multi-tenant DDoS surface | Hard — one DB shared by N agents | **None** — one DB per agent session |
| Multi-model ACID | Custom protocol | **SQLite + extensions, native** |
| Agent interface | New API to teach | dirgha is already agent-shaped |
| Operations | New control plane | Existing E2B/Daytona/Bucky stack |
| Ship time | Quarters | **Weeks** (just close the gap below) |
| Already deployed | No | **Yes** — agents use dirgha today |

---

## 4. Gap and sprint plan

What we ship today: relational + FTS5 in one transaction, plus markdown memory/knowledge stores. What we still need: vectors and graph in the same SQLite file, embedding generation, and an agent-ergonomic tool surface that exposes the multi-model transaction.

### Sequencing (read this first)

This work comes AFTER:

1. ESC-on-stuck-tool fix (in-flight, ~30 min)
2. Scroll-to-top investigation (waiting on user repro)
3. Bucky marketplace go-live items 1–4 (~1 week)

The agent-DB workstream is **non-blocking** for those — separate codepaths. Sprints 1–4 can run in parallel with Bucky items 5–10.

### Sprint plan — agent-native DB inside dirgha CLI

Each sprint = one focused day-to-two-day push. Total ~2 weeks if executed serially. Sprints 1–4 are independent and parallelisable.

#### Sprint 1 — `sqlite-vec` extension wiring (1 day)

**Goal:** dirgha's SQLite database loads `sqlite-vec` at open time so subsequent migrations can create vector virtual tables.

- [ ] Add `sqlite-vec` to `optionalDependencies` in `package.json` (native binding; fail gracefully on unsupported platforms — same pattern as `better-sqlite3`).
- [ ] Modify `src/state/db.ts` to call `db.loadExtension(...)` after `Database()` opens the file.
- [ ] Probe + log version: `db.prepare('select vec_version()').get()`.
- [ ] Test: `npm test` covers the extension load with a passing assertion that `vec_version()` returns a string.
- [ ] Doctor: `dirgha doctor` reports vec extension status alongside SQLite version.

#### Sprint 2 — Vector schema + tools (1 day)

**Goal:** `embeddings` virtual table + basic similarity search.

- [ ] Schema: `CREATE VIRTUAL TABLE embeddings USING vec0(embedding float[384])`.
- [ ] Sidecar: `embedding_meta(id INTEGER PRIMARY KEY, source TEXT, chunk TEXT, ts TIMESTAMP)`.
- [ ] Migration in `src/state/migrations/` so existing installs upgrade cleanly.
- [ ] Tool: `kb_search(query, k=5)` — runs cosine similarity, joins meta, returns chunks with scores.
- [ ] Tests: insert N embeddings, query, assert top-k order.

#### Sprint 3 — Graph schema + traversal (1 day)

**Goal:** `graph_nodes` / `graph_edges` tables + recursive CTE traversal.

- [ ] Schema:
  ```sql
  CREATE TABLE graph_nodes(id TEXT PRIMARY KEY, type TEXT NOT NULL, props JSON);
  CREATE TABLE graph_edges(src TEXT, dst TEXT, rel TEXT, props JSON, PRIMARY KEY(src,dst,rel));
  CREATE INDEX idx_edges_src ON graph_edges(src, rel);
  CREATE INDEX idx_edges_dst ON graph_edges(dst, rel);
  ```
- [ ] Tool: `graph_traverse(start_id, rel, max_depth=3)` — recursive CTE, returns paths.
- [ ] Tool: `graph_neighbors(node_id, rel?)` — one-hop, filtered by relation.
- [ ] Tests: build a 5-node 6-edge graph, verify traversals.

#### Sprint 4 — Single-transaction API (2 days)

**Goal:** ONE method that proves all four shapes commit atomically.

- [ ] New module `src/state/transaction.ts`:
  ```ts
  db.transactional((tx) => {
    tx.message.insert({ role, content });    // relational
    // FTS5 trigger fires automatically
    tx.embedding.insert({ source, vec });    // vector
    tx.graph.addEdge(srcId, dstId, "links"); // graph
  });
  ```
- [ ] Calls `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` once across all four operations.
- [ ] Tests: kill the process mid-transaction (forked test) and prove on next open the partial state is gone.
- [ ] Tests: concurrent writers prove WAL serialisation works.

#### Sprint 5 — Embedding generation in CLI (2–3 days)

**Goal:** dirgha can embed text without an external API call.

Two paths, runtime-selectable:

- **Local model** — Xenova/transformers.js loads `all-MiniLM-L6-v2` (≈25 MB) on demand, runs in a worker thread to keep the TUI responsive. Zero-config.
- **External endpoint** — config flag `embeddingsEndpoint: "http://..."` so users can point at a faster GPU-backed worker (e.g., the `PROCESSING_URL:8003/api/embeddings` already in the monorepo).

Tasks:

- [ ] Adapter interface in `src/embeddings/iface.ts` (mirrors SandboxAdapter pattern).
- [ ] `src/embeddings/local.ts` (Xenova) and `src/embeddings/remote.ts` (HTTP).
- [ ] Selector with sensible default (try local first, fall back to remote if `embeddingsEndpoint` set).
- [ ] Tests: deterministic seed → deterministic vector. Length matches schema (384 dims for MiniLM-L6).

#### Sprint 6 — Memory + Knowledge → SQLite-backed (2–3 days)

**Goal:** existing markdown stores stay readable; FTS + vec indexes live in SQLite alongside.

- [ ] On startup, sync `~/.dirgha/memory/*.md` and `~/.dirgha/knowledge/*.md` into `messages`/`embedding_meta` tables.
- [ ] Watch directories with `chokidar` so external edits flow into the index.
- [ ] Memory list / KB query slash commands prefer the SQLite path; fall back to markdown read on cache miss.
- [ ] **Don't break existing layout** — markdown is still source of truth. SQLite is a derived index. `rm -rf ~/.dirgha/dirgha.db` and rebuilds on next startup.
- [ ] Tests: edit a markdown file, verify the index reflects within 200 ms.

#### Sprint 7 — Agent-friendly tool surface (1–2 days)

**Goal:** the agent gets to the multi-model transaction in one tool call.

- [ ] `tools/kb_search` — already from Sprint 2; description tweaked for agent ergonomics.
- [ ] `tools/graph_traverse` — already from Sprint 3.
- [ ] `tools/transactional_write` — wraps the Sprint 4 API in a single tool call so an agent can write a memory + its embedding + graph edges in one tool invocation. Returns `{ committed: true, ids: { message, embedding, edges } }`.
- [ ] `tools/db_workspace_info` — returns `{ db_path, tables, vec_version, sqlite_version, free_pages, wal_size }` so an agent can introspect its workspace.
- [ ] Update `dirgha.md` agent-instructions soul to mention the new tools.
- [ ] Tests: end-to-end agent run that creates → embeds → links → searches → traverses, all asserted.

### Definition of Done

When all 7 sprints are merged:

- [ ] dirgha CLI inside an E2B/Daytona VPS gives an agent: relational + FTS + vector + graph in one transactional file.
- [ ] An agent can do `tx -> insert message, embed it, link to a graph node` in **one** tool call.
- [ ] When the VPS dies, the data dies with it (no shared-tenant residue).
- [ ] Bucky settlement remains the same — compute paid in Lightning at session end.
- [ ] All existing tests still green; new tests >50 added in this workstream.
- [ ] This doc updated with **EVIDENCE** section linking the actual demo trace.

---

## 5. Talking track for the VC

Three minutes max. Drop into the room with this:

> _"Each agent gets a disposable Linux VM with a single SQLite file inside. SQLite has FTS5, sqlite-vec for vectors, edges-as-rows for graph. **All four data shapes commit in one BEGIN/COMMIT.** When the agent's task ends, the VM dies and the data evaporates. Bucky settles compute via Lightning. We ship this as `dirgha` — in production, agents use it today."_

If they push:

- **"Doesn't this scale?"** — every agent gets its own SQLite file in its own VM. Scaling = adding more E2B/Daytona capacity. No shared-DB bottleneck to engineer around.
- **"What about durability?"** — data inside the session is ephemeral by design. If the agent needs to persist, it calls a `commit_to_durable` tool that writes to the user's Neon Postgres or to S3. Default = ephemeral.
- **"What about cross-session shared data?"** — same answer as durability. The shared layer is intentionally outside the per-session DB. The point is the **per-session** DB is single-tenant.
- **"What about latency?"** — local SQLite is the fastest DB you can run. Sub-ms reads. The bottleneck is embedding generation, addressed by Sprint 5's local model option.
- **"What's missing today?"** — vectors + graph in the SQLite file. We close that in 2 weeks (Sprints 1–7 above).

---

## 6. Status as of 2026-05-08

| Workstream | Status |
|---|---|
| CLI flicker series (v1.20.35 → v1.22.0) | **shipped** |
| `/sandbox` slash command + Ink picker (v1.22.0) | **shipped** |
| ESC-on-stuck-tool fix | queued, ~30 min |
| Scroll-to-top investigation | waiting on user repro |
| Bucky marketplace go-live items 1–4 | scoped (~1 week) |
| **Agent-DB sprints 1–7** | **scoped, this doc** |

When the queued items above land, this workstream picks up. If priorities shift (e.g., the VC conversation accelerates), Sprints 1–4 can run in parallel with Bucky items 5–10 because they touch separate codepaths.
