# Dirgha end-to-end product launch plan

> **For agentic workers:** this is the **master plan**. It links to per-workstream sub-plans (CLI, Bucky, bridge, marketplace UX, polish). Sub-plans contain bite-sized tasks you execute via `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Master plan defines goal, ordering, dependencies, and ship gates only.

**Goal:** Ship one cohesive product where a user logs in, opens chat or IDE in the browser, and an AI agent runs their work inside an isolated VPS using dirgha CLI as its agent-native database, with Bucky settling compute via Lightning and a working marketplace where providers can sell capacity.

**Architecture:** Web platform (agent-os) handles auth + UI. Gateway provisions per-session E2B/Daytona VPS. Inside the VPS, dirgha CLI runs as the agent's runtime — gives the agent multi-model SQLite (relational + FTS + vector + graph) in one transaction. Bucky settles compute cost between buyers and providers via Lightning. Marketplace UX in agent-os lets anyone post a listing or buy a job.

**Tech Stack:** Web — React + Hono. CLI — Node + TypeScript + Ink + better-sqlite3 + sqlite-vec. VPS — E2B + Daytona. Settlement — LND/Strike Lightning + Postgres escrow. DB — Neon Postgres for shared state, SQLite per-session for agent-native.

---

## 1. The user journey we're shipping

```
[A] User signs up at dirgha.ai/signup
        ↓
[B] User lands on /app  →  picks Chat or IDE
        ↓
[C] User types a prompt
        ↓
[D] Gateway provisions a VPS for this session (or reuses an active one)
        ↓
[E] Inside the VPS, dirgha CLI runs the agent
        ↓
[F] Agent reads/writes its multi-model SQLite (relational + FTS + vector + graph) in one transaction
        ↓
[G] Agent emits events back to the user via SSE/WebSocket
        ↓
[H] User sees streamed output in chat / live edits in IDE
        ↓
[I] Session ends → Bucky settles compute via Lightning → VPS terminated → ephemeral data evaporates
        ↓
[J] If a third-party provider hosted the VPS, they receive payout via Bucky/Lightning
```

That's the product. Every step needs to work end-to-end before we say "shipped."

---

## 2. Current state vs target state

| Step | Surface | Current | Target |
|---|---|---|---|
| A — Signup | `agent-os` + gateway | ✅ shipped (per memory: signup paths working v1.21.0) | (no change) |
| B — Land on /app | `agent-os` | ✅ shipped (`/app` home, chat tile, room tiles) | Add **/app/bucky** route + Pay button |
| C — Type prompt in chat | `agent-os/src/features/chat` | ✅ shipped | (no change) |
| D — VPS provision per session | `tools/dev-gateway/src/routes/vps.ts` | ✅ shipped (E2B + Daytona) | Reuse-if-active vs always-fresh policy |
| E — dirgha CLI inside VPS | — | ❌ **gateway today does NOT run dirgha in VPS for chat sessions** | New `chat → vps → dirgha` bridge service |
| F — Multi-model SQLite | `dirgha-code-release/src/state/db.ts` | ⚠️ relational + FTS only | Add `sqlite-vec` + graph + transactional API |
| G — Stream back to UI | gateway SSE | ✅ pattern works for current chat handler | Wire to dirgha-bridge events |
| H — IDE live edits | `agent-os` IDE | ⚠️ shipped but uses old chat handler | Wire to bridge |
| I — Bucky settles compute | `apps/bucky` + `tools/dev-gateway/src/routes/bucky.ts` | ⚠️ CRUD shell, no real Lightning settlement | Items 1-4 of Bucky punch list |
| J — Provider payout | Bucky | ❌ no payout flow | Items 5-7 of Bucky punch list |

**The big missing piece is step E**: today's chat handler hits the gateway's own RAG / chat code, not dirgha-in-VPS. Until we build that bridge, the rest of the agent-DB story is invisible to the chat user.

---

## 3. Six phases, ordered by dependency

This is the order things ship. Each phase produces working software users can see.

### Phase 0 — In-flight CLI work (in progress, days)

Don't disrupt this. The agent-DB and bridge work assume these have landed:

- ✅ v1.20.35–v1.22.0 flicker series (shipped today)
- ✅ `/sandbox` slash command + Ink picker (v1.22.0, shipped)
- ⏳ ESC-on-stuck-tool fix (Promise.race in `tools/exec.ts` — ~30 min)
- ⏳ Scroll-to-top investigation (waiting on user repro)

**Ship gate for Phase 0:** v1.22.x is live on npm with no regressions.

### Phase 1 — CLI agent-DB foundation (~2 weeks, 7 sprints)

The piece that makes the VC pitch true. Detail: [agent-db.md](../../cli/index/agent-db.md) — already written.

**Sprints:**
1. `sqlite-vec` extension wiring (1 day)
2. Vector schema + `kb_search` tool (1 day)
3. Graph schema + `graph_traverse` tool (1 day)
4. Single-transaction API (`db.transactional()`) (2 days)
5. Embedding generation in CLI (Xenova local + remote endpoint) (2-3 days)
6. Memory + Knowledge → SQLite-backed (2-3 days)
7. Agent-friendly tool surface (`transactional_write`, `db_workspace_info`) (1-2 days)

**Sprints 1-4 parallelisable.** Sprints 5-7 serial.

**Ship gate for Phase 1:** Inside a fresh VPS, dirgha CLI can do `transactional_write({message, embedding, edges})` and `kb_search(query)` returns results. End-to-end demo trace recorded.

### Phase 2 — Bucky marketplace MVP (~1 week)

One paying job works end-to-end. Detail: [bucky-marketplace.md](./2026-05-08-bucky-marketplace.md).

**Items (from earlier audit):**
1. Add escrow columns to `bucky_jobs`
2. Stand up Strike Lightning (simpler than LND)
3. Wire job → listing dispatch (`listing_id`, `seller_id` restriction, `/result` endpoint)
4. Settlement on complete (5% treasury fee)

**Ship gate for Phase 2:** A test buyer creates a job, escrow holds 1000 sats, provider accepts + delivers, Lightning pays out, treasury gets 5%. Trace logged.

### Phase 3 — Chat → VPS → dirgha bridge (~1 week)

The integration that makes Phases 1+2 visible in the chat product. Detail: [chat-vps-bridge.md](./2026-05-08-chat-vps-bridge.md).

**Tasks:**
- New service `tools/dev-gateway/src/routes/agent-bridge.ts`
- On chat POST: look up active VPS for user (or provision via existing `/api/vps/provision`)
- Spawn `dirgha ask --json` inside VPS via E2B/Daytona exec API
- Pipe stdin (user prompt) and stdout (agent events) bidirectionally
- Stream dirgha events to client via SSE
- On session end: hit Bucky settlement endpoint

**Ship gate for Phase 3:** Open chat → type prompt → see streamed response that visibly came from dirgha-in-VPS (verifiable via session JSONL inside the VPS, plus a `[via VPS:abc123]` debug header).

### Phase 4 — Marketplace UX (~1 week)

Make Bucky usable from the web. Detail: [marketplace-ux.md](./2026-05-08-marketplace-ux.md).

**Tasks:**
- Mount `/app/bucky` route in `agent-os/src/App.tsx`
- "Post listing" form (price, capacity, payout invoice)
- "Browse listings" grid with filter
- "Create job" flow that hits Phase 2's escrow endpoint
- "Submit result" button for providers
- Job status page with payout confirmation

**Ship gate for Phase 4:** Two browser tabs. Tab A = provider posts listing. Tab B = buyer creates job, pays escrow, sees provider's deliverable, settles. Lightning payment confirmed in both directions.

### Phase 5 — Login → Chat → IDE polish (~1 week)

Stitch the seams. Detail: [polish.md](./2026-05-08-polish.md).

**Tasks:**
- E2E user journey verified in `dirgha doctor` and on production
- Settings page consolidates: API keys, sandbox mode, Bucky payout invoice
- Session list shows: chat sessions + IDE sessions + agent-os jobs in one place
- Billing surface: credits, Bucky earnings, Stripe top-up
- Session resume: if a chat dies mid-stream, the next page load picks up where it left off (using session JSONL inside the persisted VPS or replayed locally)

**Ship gate for Phase 5:** A new user can sign up, run a paid agent task, and see the work + spend + result in one place. No dead ends. No "page not found" routes.

### Phase 6 — Demo + VC pitch (1 day)

What we ship the VC.

**Tasks:**
- Record 90-second demo video showing the full journey
- Update `docs/cli/index/agent-db.md` with EVIDENCE section + recording link
- Pitch deck: 5 slides max — problem, our reframe (dirgha-in-VPS), the demo, the marketplace, ask
- Brief the team

**Ship gate for Phase 6:** Recording + slides + cold-pitch script ready. Anyone on the team can run the pitch.

---

## 4. Sequencing rationale + parallelism

```
Phase 0  ───▶ done first (the in-flight stuff is already moving)
              │
              ▼
Phase 1 ─────┐  Phase 2 ─────┐    parallel — different repos, different concerns
             │               │
             ▼               ▼
        Phase 3 ◀────────────┘   needs Phase 1 (CLI tools) + Phase 2 (Bucky API)
             │
             ▼
        Phase 4         needs Phase 2 (marketplace API live)
             │
             ▼
        Phase 5         polish, after 1-4 are visible
             │
             ▼
        Phase 6         demo + pitch
```

**Total wall-clock time if executed serially:** ~7 weeks.

**With parallelism (Phases 1+2 in parallel, Phase 3+4 mostly parallel after their deps):** **~4-5 weeks.**

---

## 5. The dispatch fleet (when you say "go")

I'll dispatch DeepSeek agents in waves. Each agent gets an isolated worktree, a tight prompt, and a clear "report when done" format. You review each PR before it merges.

### Wave 1 — start everything that can start

Four agents, run concurrently:

| Agent | Workstream | Branch | Time |
|---|---|---|---|
| **A** | Phase 0 — ESC-on-stuck-tool fix (`Promise.race` in `src/tools/exec.ts`) | `fix/esc-stuck-tool-2026-05-08` | ~30 min |
| **B** | Phase 1 — Sprints 1+2 (sqlite-vec wiring + vector schema + `kb_search` tool) | `feat/sqlite-vec-2026-05-08` | ~1.5 days |
| **C** | Phase 1 — Sprint 3 (graph schema + traversal tools) | `feat/graph-schema-2026-05-08` | ~1 day |
| **D** | Phase 2 — Bucky items 1-4 (escrow columns + Strike Lightning + dispatch + settlement) | `feat/bucky-mvp-2026-05-08` (in monorepo) | ~3-4 days |

### Wave 2 — once Wave 1 lands

Two agents:

| Agent | Workstream | Branch |
|---|---|---|
| **E** | Phase 1 — Sprint 4 (single-transaction API) — needs A+B+C done | `feat/db-transactional-2026-05-08` |
| **F** | Phase 3 — Chat→VPS→dirgha bridge — needs Phase 1 sprints 1-4 done, Phase 2 done | `feat/agent-bridge-2026-05-08` (in monorepo) |

### Wave 3 — Phase 1 finalisation + Phase 4 start

| Agent | Workstream | Branch |
|---|---|---|
| **G** | Phase 1 — Sprint 5 (embedding generation) | `feat/embeddings-2026-05-08` |
| **H** | Phase 1 — Sprints 6+7 (memory/KB → SQLite, agent-friendly tools) | `feat/memory-sqlite-2026-05-08` |
| **I** | Phase 4 — Marketplace UX | `feat/marketplace-ux-2026-05-08` (in monorepo) |

### Wave 4 — Phase 5 polish

| Agent | Workstream | Branch |
|---|---|---|
| **J** | Phase 5 — E2E journey polish, settings, billing | `feat/polish-2026-05-08` (in monorepo) |
| **K** | Phase 6 — Demo recording + pitch deck | docs branch |

**My role through all waves:** I (Claude) orchestrate, monitor, review every PR, fix CI failures, merge after green. I don't write the production code unless an agent gets stuck — then I take over that one task.

---

## 6. Ship gates — when do we declare each phase done?

| Phase | Done means |
|---|---|
| 0 | v1.22.x on npm. ESC ≤ 95s on wedged tool. No regressions. |
| 1 | `dirgha ask --print 'embed this and link it to a graph node'` in a fresh VPS works. EVIDENCE trace logged. |
| 2 | One paying job E2E with Lightning. 5% treasury fee verified. |
| 3 | Browser chat → VPS dirgha → streamed response with `[via VPS:abc]` debug header visible. |
| 4 | Two-browser-tab demo: provider posts → buyer pays → provider delivers → Lightning settles both ways. |
| 5 | New-user E2E: signup → paid agent task → see work + spend + result in one place. |
| 6 | 90s demo video + 5-slide deck + cold-pitch script ready. |

---

## 7. What this plan is NOT

- Not building a new agent-DB product as a service. We're shipping `dirgha-in-VPS` as the answer.
- Not migrating the monorepo's existing chat handler. Phase 3 is a parallel codepath the user opts into.
- Not rewriting Bucky's `apps/bucky/src` either. Phase 2 imports its LightningV2 facade into the running gateway routes — the dead-code Bucky service can stay where it is for now.
- Not changing the auth/login flow. Phase 0+5 verify it works end-to-end; no schema changes.
- Not adding Daytona-replacing infra. E2B + Daytona via dev-gateway is the production path.

---

## 8. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Multiple agents conflict on the same files | Isolated worktrees per agent. Different branches. I review every PR before merge. |
| DeepSeek dispatch hangs on TTFT | v1.20.36 capped TTFT retries to 1 — same problem won't repeat. Each dispatch gets `timeout 1800` shell wrapper. |
| Phase 3 bridge work blocks on Phase 1 + Phase 2 | Wave 1 starts those in parallel. Wave 2 picks up bridge as soon as both have landed. |
| Bucky marketplace work touches the running gateway | Wave 1 D agent works on a `feat/bucky-mvp` branch — gateway redeploys gated on PR review. |
| Demo lands but production breaks | Each phase has a ship gate that's a real working flow, not a unit test. CI gates merging. |
| User wants to redirect mid-flight | Each agent takes ~30 min to days. We can stop any wave at any time. |

---

## 9. Sub-plans (separate files, each with bite-sized tasks)

These are written next, after this master plan is approved:

- [`./2026-05-08-bucky-marketplace.md`](./2026-05-08-bucky-marketplace.md) — Phase 2 detail (escrow + Lightning + dispatch + settlement). _To be drafted._
- [`./2026-05-08-chat-vps-bridge.md`](./2026-05-08-chat-vps-bridge.md) — Phase 3 detail (gateway service + SSE streaming). _To be drafted._
- [`./2026-05-08-marketplace-ux.md`](./2026-05-08-marketplace-ux.md) — Phase 4 detail (web UI for buyers + providers). _To be drafted._
- [`./2026-05-08-polish.md`](./2026-05-08-polish.md) — Phase 5 detail (E2E journey, settings, billing). _To be drafted._

The CLI agent-DB plan already exists at [`docs/cli/index/agent-db.md`](../../cli/index/agent-db.md) and serves as the Phase 1 sub-plan.

---

## 10. Decision points for the user (before any agent fires)

Three questions to answer before Wave 1 dispatches:

1. **Is the order right?** (Phase 0 → 1+2 parallel → 3+4 → 5 → 6.) Or do you want to compress / re-prioritise?
2. **Aggressive parallelism?** Wave 1 launches 4 agents simultaneously. Or do you want to start with 1-2 to see how it goes, then scale up?
3. **Auto-merge or manual?** Do I admin-merge each PR after CI green (fastest), or hand off PRs for your review (slower, safer)?

After you answer, I'll dispatch Wave 1 and start streaming progress notifications.
