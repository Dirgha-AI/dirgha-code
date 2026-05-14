# Audit: Item 5 (TaskLedger + ConversationProjection + snapshot compaction + SQLite materialized view)

## Part A — What's built

### 1. JSONL append-only WAL per session — atomic appends, partial-line tolerance, crash-safe

**BUILT.** `SessionImpl.append` uses `fs.appendFile` (atomically writes whole line). Replay in `replay()` reads entire file, splits by newline, silently skips lines that fail `JSON.parse`. This is the partial-line tolerance. Crash safety is inherent: never overwrites, only appends.  
src/context/session.ts:43–46  
src/context/session.ts:100–113

The `streamJsonl` helper provides a streaming alternative with the same partial-line tolerance.  
src/context/session.ts:134–158

### 2. SessionEntry discriminant union

**BUILT.** `SessionEntry` type covers `message`, `usage`, `model_change`, `compaction`, `branch`, `title`, `system`.  
src/context/session.ts:9–25

### 3. Session API — create/open/list, append, replay, messages

**BUILT.** `SessionStore.create`, `.open`, `.list`. `SessionImpl.append`, `.replay`, `.replayAll`, `.messages`, `.close`.  
src/context/session.ts:32–98

### 4. SQLite mirror — fire-and-forget for queryable history

**BUILT.** `SessionImpl.append` calls `dbAppendMessage` in a fire‑and‑forget promise. Session creation calls `dbOpenSession`. Close calls `dbCloseSession`. `dbListSessions`, `dbSearchChats` exist for querying.  
src/context/session.ts:44–46  
src/state/db.ts:96–99, 173–176, 180–189, 200–213

The mirror is read‑only from the agent loop perspective; the JSONL is always the source of truth for replay.

### 5. ConversationProjection — in‑memory derived state from the WAL, decoupled from the agent loop

**NOT BUILT.** No `ConversationProjection` class or equivalent exists. The agent loop (`agent-loop.ts`) directly maintains `history: Message[]` and emits raw events onto an `EventStream`. The TUI surface currently consumes events directly from the stream, not a projection. There is no decoupled projection that can be independently instantiated from a session file for rendering or analysis.

### 6. Snapshot fast‑load — skip replay of entire history on large sessions

**NOT BUILT.** `SessionImpl.replay()` always reads and parses every line of the JSONL file. There is no snapshot marker, no truncation by compaction entries, and no mechanism to start replay from an offset. Sessions with >200 messages pay full replay cost every time.

### 7. Drift reconciliation — verify JSONL ↔ SQLite consistency on session open

**NOT BUILT.** `SessionStore.open` does not compare JSONL lines against SQLite rows. There is no `reconcile` step. If the SQLite DB is deleted or locked, the session opens silently and subsequent appends may or may not reproduce entries (the fire‑and‑forget into DB would fail silently). No recovery path exists.

### 8. Compaction — write a compaction entry and discard older messages on replay

**PARTIALLY BUILT.** The `SessionEntry` type includes a `compaction` variant (`type: "compaction"; ts: string; keptFrom: string; summary: string`). The agent loop's `contextTransform` and proactive compaction logic summarise history but do **not** write a compaction entry to the JSONL. Replay does not recognise compaction entries—it yields every line including the compaction entry itself and never filters out messages older than `keptFrom`. The design intent of compaction (write entry, then on replay skip messages before `keptFrom` unless they are of type `system` or `title`) is unimplemented.

## Part B — Actual gap

### Gap 1: ConversationProjection missing

The agent loop currently owns the message array and feeds events directly to the stream. A `ConversationProjection` is needed to:

- Provide a clean, queryable view of the conversation state (messages, titles, tool results, usage totals).
- Decouple the TUI rendering from the loop's internal history, enabling offline session viewing, diffing, and status‑line updates without touching the loop.
- Serve as the single consumer of `SessionEntry` events during replay, so that snapshot loading can produce the same projection.

**Smallest change**: add a new file `src/context/projection.ts` implementing `ConversationProjection` that accumulates `SessionEntry` events and exposes `messages(): Message[]`, `title(): string | null`, `usage(): UsageTotal`, `entries(): SessionEntry[]`. Then modify the agent loop to accept an optional `projection` parameter; if provided, the loop pushes new entries (assistant message, usage events) to the projection. The TUI surface reads from the projection instead of directly from the event stream.

- Files to modify:  
  - Add `src/context/projection.ts` (~150 LOC)  
  - Modify `src/context/session.ts` or `src/kernel/agent-loop.ts` to accept and update projection (~20 LOC)  
- Estimated line count: **170 LOC**  
- Real correctness issue: yes. Without this, the TUI cannot render offline session state and is tightly coupled to the event stream.  
- Ship context: this can ship as its own minor version or be bundled with Item 5. If bundled, it removes the need for the TUI to re‑ingest raw events.

### Gap 2: Snapshot fast‑load missing

For sessions > 200 messages, replaying the full JSONL each time is wasteful. The compaction entry type exists but is not used. The required behaviour:

- On session open, scan from the end of the file backward to find the last `compaction` entry. If found, replay only entries *after* that compaction entry (plus always include `system` and `title` entries before it, and the compaction entry itself for display).
- Better: maintain a separate snapshot file (e.g. `session-id.snapshot.json`) that stores the current conversation projection after each compaction. On open, load the snapshot then tail the JSONL for entries after its timestamp.

**Smallest change**:  
Option A (compaction‑based skip in replay): Modify `SessionImpl.replay()` to detect compaction entries and skip messages before the most recent `keptFrom` timestamp. This is ~20 LOC but does not speed up the initial file read (still reads entire file).  
Option B (true fast‑load): In `SessionStore.open`, after opening the JSONL, also check for a `last_compaction` record in the SQLite `sessions` table (or a dedicated `session_meta` table). If found and the session has >200 messages, load messages from SQLite starting from that point, then confirm with JSONL tail. This requires a new SQLite table and a few queries.

**Recommended**: Option B because it provides real I/O reduction.  
- Add SQLite table `session_snapshots(session_id, payload TEXT, ts INTEGER)` with a UNIQUE index.  
- On successful compaction in the agent loop, write a snapshot: current projection (messages, title, usage) as JSON.  
- In `SessionStore.open`, if session message count > 200 and a snapshot exists, load from SQLite then tail JSONL for entries after snapshot ts.  
- Files to modify:  
  - `src/state/db.ts` — add table, insert/read functions (~70 LOC)  
  - `src/context/session.ts` — modify `SessionStore.open` to call snapshot load (~40 LOC)  
  - `src/kernel/agent-loop.ts` — after compaction, write snapshot entry (~10 LOC)  
- Estimated line count: **120 LOC**  
- Real correctness issue: yes, but only performance‑critical. Without it, sessions >200 messages will see 200+ ms reload times.  
- Ship context: must ship with compaction (Gap 3) to be useful. Can be part of the same version as Gap 3.

### Gap 3: Compaction does not persist compaction entry or filter messages on replay

The agent loop's compaction logic (`contextTransform`) summarises history in memory but never writes a `compaction` entry to the JSONL. Replay yields all lines, ignoring compaction markers.

**Smallest change**:  

- In the agent loop's compaction branch (both proactive and context‑length error), after `cfg.contextTransform` returns compacted messages, write a `compaction` entry to the session.  
- In `SessionImpl.replay()` or in the `ConversationProjection` replay logic, recognise compaction entries and drop messages whose `ts` is before the `keptFrom` field (unless they are `system` or `title` or the compaction entry itself).  

- Files to modify:  
  - `src/context/session.ts` — modify `replay` to filter when a compaction entry is encountered (~30 LOC)  
  - `src/kernel/agent-loop.ts` — write compaction entry via `cfg.session.append` after compaction successful (~10 LOC)  
- Estimated line count: **40 LOC**  
- Real correctness issue: yes, because the compaction entry is useless if replay ignores it. Without this, old messages accumulate forever, defeating the purpose.  
- Ship context: can ship independently as a minor bugfix/feature, but logically tied to snapshot fast‑load.

### Gap 4: Drift reconciliation missing

When a session is opened, the JSONL file on disk may have diverged from the SQLite materialised view (e.g. due to partial sync or manual DB deletion). Currently no check occurs.

**Smallest change**:  

- In `SessionStore.open`, after obtaining the `SessionImpl`, perform a `reconcile()` step: select all messages from SQLite for that session, read the last N JSONL entries, and compare by timestamp/message count. If mismatch, either rebuild SQLite from JSONL (jsonl->sqlite) or notify caller.  
- Because the JSONL is the source of truth, the reconciliation should always favour JSONL: truncate SQLite and re‑insert from JSONL. This is safe because DB writes are fire‑and‑forget and may have missed entries.  

- Files to modify:  
  - `src/context/session.ts` — add `reconcile()` method in `SessionImpl` (~40 LOC)  
  - `src/state/db.ts` — add `truncateSession(sessionId: string)` and `insertEntries(sessionId, entries: SessionEntry[])` (~30 LOC)  
- Estimated line count: **70 LOC**  
- Real correctness issue: yes, but low severity because the DB is a derived view. Can be shipped as polish.  
- Ship context: can be a separate minor version, but ideally ships with Item 5 to close the correctness loop.

### Gap 5: Agent loop still uses hand‑rolled history array instead of ConversationProjection

Currently `runAgentLoop` accumulates `history: Message[]` and pushes messages directly. If we introduce `ConversationProjection`, we must adapt the loop to push entries to the projection and read messages from it (instead of `history`). This is a small refactor but touches the core loop.

**Smallest change**:  

- Accept `projection?: ConversationProjection` in `AgentLoopConfig`.  
- On each non‑error turn, push assistant message and tool result messages as `SessionEntry` to the projection.  
- Replace `history` usage with `projection.messages()` where the loop reads previous messages (e.g., when calling `cfg.contextTransform`).  
- The projection can be initialised from an existing `Session` (if provided) before the loop starts by replaying the session into it.  

- Files to modify:  
  - `src/kernel/agent-loop.ts` — integrate projection, initialise from session on start (~60 LOC)  
  - `src/context/session.ts` — already has `replay()` which can feed the projection  
- Estimated line count: **60 LOC**  
- Real correctness issue: yes, because this is the core integration. Without it, the projection is just a separate data structure not used by the loop.  
- Ship context: must ship with Gap 1 (ConversationProjection).

### Summary of gaps

| Gap | Size (LOC) | Correctness issue? | Polish? | Requires others? |
|-----|------------|-------------------|---------|-----------------|
| 1. ConversationProjection | 170 | Yes | No | None |
| 2. Snapshot fast-load | 120 | Yes (perf) | Yes (for large sessions) | 3 (compaction) |
| 3. Compaction persistence | 40 | Yes | No | None (but isolated) |
| 4. Drift reconciliation | 70 | Yes (low) | Yes | None |
| 5. Loop integration | 60 | Yes | No | 1 |

## Part C — Recommended ship plan

Given the orchestrator constraint (continuous shipping, terse commits, every change verified by typecheck + lint + tests + smoke + build + secret scan), and given that session.ts already builds the JSONL core (entries, append, replay, SQLite mirror), the gaps are:

- ~460 LOC total for all gaps.
- Gap 1 and Gap 5 are tightly coupled (projection + loop integration).  
- Gap 2 and Gap 3 are tightly coupled (snapshot requires compaction markers to be written).  
- Gap 4 is independent.

**Recommendation: split into three ships.**

### Ship 1: v1.38.0 — Compaction + snapshot + drift reconciliation

**Content**:  
- Gap 3 (compaction persistence and replay filtering) — ~40 LOC  
- Gap 2 (snapshot fast‑load) — ~120 LOC  
- Gap 4 (drift reconciliation) — ~70 LOC  

**Total**: ~230 LOC. Well within 200–300 LOC boundary. Fits a single ship.  
**Rationale**: These three features are independent of the projection. They make existing session.ts more robust and performant without changing the loop interface. Drift reconciliation is a safety net; snapshot fast‑load is a performance win that the smoke suite (with large session test) would validate. The compaction entry writing is a small addition to the agent loop (`cfg.session.append`) that already exists for message entries—low risk.  
**Validation**: existing tests pass because we only add new paths (snapshot load is conditional, reconciliation is opt‑in when drift is detected). Smoke suite exercises replay and compaction.

### Ship 2: v1.39.0 — ConversationProjection + loop integration

**Content**:  
- Gap 1 (ConversationProjection class) — ~170 LOC  
- Gap 5 (loop integration) — ~60 LOC  

**Total**: ~230 LOC. Also fits a single ship.  
**Rationale**: This is the core architectural change. The new `ConversationProjection` is unit‑tested independently. The loop integration is a refactor of `history` usage to `projection.messages()`. The smoke suite already runs the agent loop; we can verify messages emitted are identical. No breaking changes—only adds optional `projection` parameter.  
**Validation**: all existing tests pass because projection is optional. New tests for projection replay behaviour and loop integration.

### Total line count for both ships: ~460 LOC.

**Why not one big ship?**  
- The first ship (snapshot/compaction/drift) has zero dependencies on the projection. Shipping it first gives immediate benefits: large sessions load faster, compaction actually compacts, data is consistent.  
- The second ship (projection + loop integration) is a pure additive change that the TUI team can then adopt to decouple rendering.  
- If the projection ship misses v2, the existing loop still works; session.ts is already useful without it.

**Commit structure**: Each ship is a single commit per change (e.g., one commit for compaction persistence, one for snapshot load, etc.) but all within the same version. Each commit must pass typecheck + lint + tests + smoke + build + secret scan. Total commits per ship: 3–4.

**Risk**: Low. The existing session.ts code is stable. The additions are well‑encapsulated: snapshot load only triggers when the session has >200 messages; drift reconciliation only runs on open; compaction writing is a single `append` call. The projection is pure data transformation with no I/O.

**Final verdict**: session.ts already covers 80% of Item 5 (entries, append, replay, SQLite mirror). The missing pieces are compaction persistence (not just type), snapshot fast‑load, drift reconciliation, and a formal `ConversationProjection` decoupling. Ship in two phases; no scope creep.