# Knowledge management — architecture

dirgha-cli's knowledge management is a four-layer stack that grows from per-turn events up to a project-wide compiled wiki. Each layer has a single responsibility, owns its file format, and is queryable from the CLI without leaving the terminal.

## The four layers

```
┌─────────────────────────────────────────────────────────────┐
│  4. Knowledge base (compiled wiki + vectorless tree index)  │  ← OpenKB + PageIndex
│     `dirgha kb {ingest, query, watch, lint}`                │     ~/.dirgha/kb/
├─────────────────────────────────────────────────────────────┤
│  3. Ledger (typed events + living digest, TF-IDF search)    │  ← shipped
│     `dirgha ledger {add, search, digest, show}`             │     ~/.dirgha/ledger/<scope>.{jsonl,md}
├─────────────────────────────────────────────────────────────┤
│  2. Long-term memory (key-value facts the agent recalls)    │  ← shipped
│     `dirgha memory {set, get, recall, forget}`              │     ~/.dirgha/memory/MEMORY.md + per-key files
├─────────────────────────────────────────────────────────────┤
│  1. Audit log (append-only events from every CLI invocation)│  ← shipped
│     `dirgha audit {list, tail, search, kinds, --filter}`    │     ~/.dirgha/audit/events.jsonl
└─────────────────────────────────────────────────────────────┘
```

Lower layers are _firehose_ (every event); higher layers are _curated_ (only facts that earned their place). Information moves UP: the agent reads audit + memory at boot, distills relevant entries into ledger digests, and OpenKB compiles the digests + project docs into a queryable wiki.

## Layer 1 — Audit (the firehose)

`~/.dirgha/audit/events.jsonl` — one line per significant event. Kinds: `session-start`, `turn-end`, `tool`, `error`, `failover`, `compaction`, `update`. Reader is `dirgha audit list/tail/search/kinds --filter=<kind>`.

Audit is **never** queried by the model directly — it's diagnostic. The model sees the layers above.

## Layer 2 — Memory (per-user KV facts)

`~/.dirgha/memory/MEMORY.md` is an index that the runtime auto-loads into context. Entries are short pointers to per-fact files. Mirrors the existing `/root/.claude/projects/-root/memory/MEMORY.md` pattern: types are `user`, `feedback`, `project`, `reference` with a `name`/`description`/`type` frontmatter and Markdown body.

`dirgha memory set <name>` writes one. `dirgha memory recall <query>` runs TF-IDF search.

## Layer 3 — Ledger (per-scope event stream + digest)

`~/.dirgha/ledger/<scope>.jsonl` is an append-only log of typed entries: `goal`, `decision`, `observation`, `experiment`, `metric`, `note`, `compaction`. Paired with `<scope>.md` — a living digest the agent rewrites periodically. Search is TF-IDF cosine ranked (`dirgha ledger search "topic"`).

Scopes are arbitrary: `default`, `<repo-name>`, `<task-id>`. The runtime reads digest + tail at boot via `renderLedgerContext`.

## Layer 4 — Knowledge base (compiled wiki, vectorless RAG)

This is the new layer. It wraps **OpenKB** (which uses **PageIndex** under the hood) so a project's accumulated docs + ledgers + memory get compiled into a wiki with summaries, concept pages, and cross-references — and answered via reasoning-over-tree-index, not vector similarity.

### `dirgha kb` (planned subcommand)

```bash
dirgha kb ingest [path]        Compile a path (or cwd by default) into the KB. Watches for changes if --watch.
dirgha kb query "<question>"   Reasoning-based retrieval. Streams the answer with citations.
dirgha kb chat                 Multi-turn KB chat session.
dirgha kb lint                 Find contradictions, gaps, orphans, stale pages.
dirgha kb status               Show coverage: # docs ingested, # concept pages, last update.
```

### Storage layout

```
~/.dirgha/kb/
├── raw/                   # Source documents the user dropped in or that we synced
├── wiki/                  # Compiled .md pages with [[wikilinks]] (Obsidian-compatible)
│   ├── concepts/          # Auto-extracted concept pages
│   ├── docs/              # One page per ingested document
│   └── links.json         # Adjacency list for the cross-reference graph
└── index/                 # PageIndex tree-of-contents indices
```

### What flows where

| From | To | When |
|---|---|---|
| `~/.dirgha/audit/events.jsonl` | NOT to KB | Audit stays local + diagnostic. |
| `~/.dirgha/memory/<name>.md` | KB ingest | When the user runs `dirgha kb ingest` (memory is part of the project). |
| `~/.dirgha/ledger/<scope>.md` digest | KB ingest | Same — digests are project knowledge, JSONL events are not. |
| Project `docs/` tree | KB ingest | Yes; that's the primary input. |
| KB query results | Agent context | Optional. The agent can call `dirgha kb query` as a tool when the user asks a doc-style question and the soul says "Don't guess, look it up." |

### How the KB feeds the agent loop (proposed wiring)

1. The agent receives a user prompt mentioning a project concept ("how does the failover map work?").
2. Soul says: don't guess; look it up.
3. The agent invokes a `kb_query` tool (new built-in) — internally `dirgha kb query "..."` — gets back a ranked answer with `[[wikilink]]` citations.
4. The model uses the cited pages as authoritative context for its response.
5. If the answer is wrong (the user corrects), the agent appends a `correction` ledger entry; next `dirgha kb ingest` picks up the corrected ledger digest and the wiki self-heals.

This is the loop OpenKB calls "knowledge compounds over time".

### How GEPA fits

GEPA (the genetic-pareto / per-conversation memory in `/root/.claude/projects/-root/memory/`) is the **session-side** mirror of dirgha's memory layer. The two share schema: `user / feedback / project / reference` types with frontmatter + body. Migration:

- Keep both for now. The user's GEPA memory continues to live where it is — that's their personal IDE-side memory.
- `dirgha memory` exposes the same schema for dirgha-runtime memory (project + machine scoped).
- A future `dirgha memory sync` flag could one-way mirror selected GEPA entries into `~/.dirgha/memory/` for projects where the user wants the model to see them.

## Why not just one layer?

- **Audit** captures everything; querying it for "why did we choose X" requires re-deriving the answer every time → noise.
- **Memory** is curated KV, but doesn't model relationships between facts.
- **Ledger** captures decisions per scope but is linear; you can't ask "what concepts are downstream of decision Y".
- **KB** captures the graph + can answer reasoning queries — but it's expensive to keep current, so it ingests from the curated layers.

Each layer pays for itself. Lower = cheap to write, hard to query. Higher = expensive to compile, instant to query.

## Sprint plan

| Sprint | Goal |
|---|---|
| 9 | `dirgha kb ingest [path] [--watch]` — wraps `openkb ingest` over OpenKB Python pkg. Default sources: `docs/` + `~/.dirgha/memory/` + `~/.dirgha/ledger/<scope>.md`. |
| 10 | `dirgha kb query "<question>"` — wraps `openkb query`, returns markdown with `[[wikilinks]]`. |
| 11 | `kb_query` built-in tool so the agent can call it from inside any session. |
| 12 | `dirgha kb lint` — surfaces stale / orphaned / contradictory pages so the user can repair. |
| 13 | One-way sync from GEPA memory if the user opts in. |

Each sprint ends with a test that locks the contract.
