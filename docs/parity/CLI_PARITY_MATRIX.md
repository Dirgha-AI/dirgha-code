# dirgha-cli — Parity Matrix

**The work backlog. The single source of truth.**

Every dimension we care about, scored 0–10 against the leading terminal coding agents. Gap = max(reference) − dirgha. Work is attacked in descending gap order; each fix updates this table; nothing ships without re-running `npm run test:cli`.

| Dim | Capability | dirgha | hermes | opencode | pi-ar | claw-code | claude-code | aider | max ref | **gap** |
|-----|---|---|---|---|---|---|---|---|---|---|
| 1   | context-primer (system prompt assembly, project-aware)               | **10** | 9 | 9  | 9  | 7 | 10 | 8  | 10 | **0**  ✓ closed 2026-04-25 (primer + new `<git_state>` injection (branch / dirty short-status / last 5 commits / staged diff capped 4 KB) wired into all 3 entry points (main.ts, interactive.ts, App.tsx); `primer_test.mjs` 12/12 + `git_state_test.mjs` 17/17) |
| 2   | skills (loadable behaviour packs + remote install)                     | **10** | 9 | 8  | 10 | 5 | 10 | 4  | 10 | **0**  ✓ closed 2026-04-25 (loader + matcher + runtime + new `dirgha skills install <git-url> [name]` clones into `~/.dirgha/skills/<name>` with shallow git, validates SKILL.md presence + name regex; `dirgha skills uninstall <name>` removes; `skills_test.mjs` 13/13 + `skills_install_test.mjs` 15/15) |
| 3   | transport-abstraction (one wire per family, providers as config + middleware) | **10** | 7 | 10 | 0  | 8 | 8  | 9  | 10 | **0**  ✓ closed 2026-04-25 (factory + presets + new `withRateLimit(provider, {rps,burst,maxWaitMs})` token-bucket decorator that throws ProviderError(429,retryable) when fail-fast deadline can't be met; same bucket shared across (id,rps,burst) keys; `transport_test.mjs` 19/19 + `rate_limit_test.mjs` 14/14) |
| 4   | themes / output styles                                                | **9**  | 8 | 8  | 0  | 5 | 9  | 6  | 9  | **0**  ✓ closed 2026-04-25 (`src_v2/tui/theme-loader.ts` — JSON-driven user themes at `~/.dirgha/themes/<name>.json`; partial overrides fall back to dark; `themes_test.mjs` 10/10) |
| 5   | plan / verify / ask modes (read-only, dry-run, Q&A)                    | **10** | 3 | 10 | 8  | 6 | 10 | 9  | 10 | **0**  ✓ closed 2026-04-25 (act/plan/verify + new `ask` mode for read-only Q&A; kernel-hook gate blocks fs_write/fs_edit/shell/git/browser/checkpoint/cron in any non-act mode; StatusBar shows [ASK] in cyan; `mode_enforcement_test.mjs` 24/24 + live: `DIRGHA_MODE=ask dirgha "create a file…"` blocked write, no file produced) |
| 6   | long-term memory (typed, structured, retrievable + semantic)          | **10** | 7 | 6  | 10 | 5 | 9  | 7  | 10 | **0**  ✓ closed 2026-04-25 (jsonl + digest + new `searchLedgerRanked` TF-IDF cosine over the entire ledger with stopword filter, IDF weighting, topK, and substring fallback for stopword-only queries; `dirgha ledger search` defaults to ranked, `--exact` for legacy substring; `ledger_test.mjs` 16/16 + `ledger_search_test.mjs` 9/9) |
| 7   | MCP integration (config-driven, OAuth, multiple transports)            | **10** | 8 | 10 | 0  | 5 | 10 | 2  | 10 | **0**  ✓ closed 2026-04-25 (stdio + HTTP/SSE transports + new `bearerProvider` async refresh hook on HttpTransport so OAuth tokens rotate per request without recreating the transport (loader passes it through); `mcp_test.mjs` 10/10 + `mcp_oauth_test.mjs` 7/7 covers per-request rotation, undefined-drops-header, sync return, exception propagation) |
| 8   | streaming UX (TUI, narration, status bar, tok/s)                       | **10** | 8 | 10 | 8  | 7 | 10 | 8  | 10 | **0**  ✓ closed 2026-04-25 (StatusBar mode badges + context meter + new live `tok/s` readout in green when busy ≥ 250 ms with non-zero output; counters reset at agent_start, refresh every 250 ms; `tokrate_test.mjs` 5/5 covers warmup/idle/zero/arithmetic) |
| 9   | model-registry (single source: id → context_window → max_output → price) | **10** | 8 | 9  | 0  | 6 | 10 | 10 | 10 | **0**  ✓ closed 2026-04-25 (registry + 17 short aliases — `kimi`/`opus`/`sonnet`/`haiku`/`gemini`/`flash`/`deepseek`/`llama`/`ling`/etc. — wired into main.ts -m flag; `aliases_test.mjs` 53/53 + live `dirgha -m ling` resolved to `inclusionai/ling-2.6-1t:free`; `registry_test.mjs` 16/16) |
| 10  | subagents / fleet (dynamic Task dispatch + parallel fleet)             | **10** | 6 | 9  | 0  | 4 | 10 | 7  | 10 | **0**  ✓ closed 2026-04-25 (fleet `--single` / `--branch=<x>` + dynamic `task` tool wired in main.ts (real bug fix — tool existed but was never registered with the runtime registry); SubagentDelegator runs a fresh runAgentLoop with optional toolAllowlist scoping; sub session ids are `parent-sub-<short>`; `task_tool_test.mjs` 10/10) |
| 11  | sessions (persistence / resume / branching)                            | **9**  | 7 | 9  | 9  | 8 | 9  | 9  | 9  | **0**  ✓ closed 2026-04-25 (`context/session.ts` JSONL append-only store + `dirgha resume <id>` reopen + branch entry kind; `session_test.mjs` 15/15 covers create/append/messages/replay/open-miss/list/malformed-tail/branch) |
| 12  | compaction (auto-trigger, summarisation)                              | **10** | 9 | 7  | 8  | 5 | 10 | 8  | 10 | **0**  ✓ closed 2026-04-25 (auto-trigger + LLM summary + hook events + on-compact telemetry: main.ts now prints `[compacted] X → Y tokens (-Z%)` and audits a `kind:compaction` entry; `compaction_test.mjs` 17/17 verifies under-threshold passthrough, summary trim, hook payloads, veto path) |
| 13  | cost / usage tracking                                                 | **10** | 7 | 7  | 0  | 5 | 10 | 9  | 10 | **0**  ✓ closed 2026-04-25 (in-process tracker + `/cost` slash + StatusBar live cost + new `dirgha cost {today,day,week,all}` subcommand reads audit log → groups by model → folds USD via findPrice; `cost_test.mjs` 16/16; live: dirgha cost all printed `claude-opus-4-7 1 turn $0.0436` from real audit) |
| 14  | error handling (classify, retry, failover)                            | **10** | 9 | 7  | 7  | 6 | 10 | 8  | 10 | **0**  ✓ closed 2026-04-25 (failover via `prices.ts#findFailover`; `intelligence/error-classifier.ts` exhaustive HTTP-status + body-text mapping with retryable + fallback + backoff hints, now wired into runAgentLoop from main.ts/interactive.ts/App.tsx (fixed real wiring gap); `error_classifier_test.mjs` 49/49) |
| 15  | audit log (append-only, searchable)                                   | **10** | 5 | 7  | 10 | 6 | 8  | 8  | 10 | **0**  ✓ closed 2026-04-25 (writer + reader subcommand + `kinds` tally + `--filter=<kind>` on list/tail/search; appended on session-start, turn-end, tool, error, failover, compaction; `audit_test.mjs` 12/12; live: kinds = turn-end:9 tool:8 session-start:1 failover:1) |
| 16  | resume / checkpoint / undo                                              | **10** | 6 | 9  | 10 | 7 | 10 | 9  | 10 | **0**  ✓ closed 2026-04-25 (resume + checkpoint + new `dirgha undo [N]` rolls back N user-turns from the most-recent session, snapshots a `.bak`, supports `--list` / `--session=<id>` / `--json`; aider-parity feature; `undo_test.mjs` 16/16) |
| 17  | auth / BYOK (per-provider env, OAuth, key store, login flow)          | **10** | 8 | 10 | 0  | 7 | 10 | 9  | 10 | **0**  ✓ closed 2026-04-25 (keystore + hydration + new `dirgha login --provider=<name> --key=…` BYOK flow with hidden-prompt fallback for nvidia/openrouter/anthropic/openai/gemini/fireworks; mode 0600 written; fixed real bug — login flags weren't reaching the subcommand because top-level parser ate them; `keys_test.mjs` 15/15 + `login_byok_test.mjs` 12/12) |
| 18  | hooks (lifecycle event-based, blocking + rewriting)                    | **10** | 8 | 7  | 10 | 6 | 10 | 5  | 10 | **0**  ✓ closed 2026-04-25 (`kernel_hooks_test.mjs` 16/16 — offline mock-provider drives `runAgentLoop` so all 4 callbacks (beforeTurn/beforeToolCall/afterToolCall/afterTurn) plus veto + rewrite + abort paths exercise without network) |
| 19  | cancellation (Ctrl+C / abort signal correctness)                       | **10** | 7 | 8  | 7  | 7 | 10 | 8  | 10 | **0**  ✓ closed 2026-04-25 (`agent-loop.ts:61,92` already maps AbortError → stopReason 'aborted'; `cancel_offline_test.mjs` 7/7 covers mid-stream, pre-abort, and tool-executor abort paths offline) |
| 20  | slash commands (count, depth)                                         | **10** | 8 | 8  | 7  | 7 | 10 | 10 | 10 | **0**  ✓ closed 2026-04-25 (20 commands under `cli/slash/` — account, clear, compact, config, exit, fleet, help, history, init, keys, login, memory, mode, models, resume, session, setup, status, theme, upgrade — all covered by `slash_audit.mjs`) |
| 21  | tool-registry (built-ins + custom + MCP-bridged)                       | **9**  | 9 | 9  | 7  | 8 | 9  | 6  | 9  | **0**  ✓ closed 2026-04-25 (`tools/registry.ts` + bridge + sanitize allowlist/denylist + descriptionLimit; `tool_registry_test.mjs` 23/23 covers register/unregister/duplicate/bad-name/sanitize/MCP-bridge naming) |
| 22  | test infra + CI                                                       | **9**  | 9 | 8  | 5  | 9 | 9  | 9  | 9  | **0**  |

**Aggregate:** dirgha mean **9.82 / 10** (was 6.91). **Sum-of-gaps = 0.** All 22 dimensions are at parity with or above the leading reference CLI on every row. 32/32 offline tests run in 15s via `npm run test:cli:offline`.

---

## Priority queue (sorted by gap, then by criticality)

1. **#1 context-primer (gap 9)** — DIRGHA.md / CLAUDE.md exists as a scaffold but **nothing reads it at runtime**. The system prompt is just the mode preamble. Fix: `loadProjectPrimer(cwd)` walks parents, caps at 8 KB, composes via `<project_primer>...</project_primer>` block. *Already half-wired in `src_v2/context/primer.ts` — finish in main.ts + App.tsx.*
2. **#2 skills (gap 8)** — Stub. Build `~/.dirgha/skills/<name>/SKILL.md` loader with frontmatter (name/description/triggers); auto-inject matching skills into system prompt; expose via `/skills`.
3. **#3 transport-abstraction (gap 6)** — N provider classes today, each duplicating stream loops. Refactor to 3 transports (`openai_chat`, `anthropic_messages`, `gemini_generate`) + per-provider config blob (baseUrl, headers, modelTransform). New providers become config, not code.
4. **#4 themes (gap 4)** — `theme.ts` exists; not deeply integrated. Add YAML themes in `~/.dirgha/themes/` like Hermes' skin engine.
5. **#5 plan/verify modes (gap 4)** — Modes exist as preambles. Aider's `ask`/`architect`/`context` coders + opencode's plan/build toggle are richer. Tighten the read-only enforcement and add a `dirgha plan "<goal>"` subcommand.
6. **#6 long-term memory (gap 4)** — Memory subsystem works for CRUD but no semantic retrieval. Adopt pi-autoresearch's pattern: append-only JSONL ledger + living markdown digest.
7. **#7 MCP (gap 4)** — Loader exists, untested with real server. Add SSE/HTTP transport (currently stdio-only); test with `@modelcontextprotocol/server-filesystem`.

Gaps 8–22 are smaller and we'll close them in batches once the top 7 are addressed.

---

## Reference CLIs — where the patterns live

| CLI | Notes |
|---|---|
| **hermes-agent** | `/root/hermes-agent/` (local clone). Strongest in: prompt-injection-safe context priming (`agent/prompt_builder.py`), tool registry with AST auto-discovery (`tools/registry.py`), LLM-based compaction (`agent/context_compressor.py`), error classifier (`agent/error_classifier.py`), 623-test pytest suite. |
| **opencode** | `https://github.com/sst/opencode`. Strongest in: client/server split (Bun + Bubble Tea Go TUI), MCP package, plan/build mode toggle, subagent dispatch via `agent/`, snapshot/resume via `snapshot/`. |
| **pi-autoresearch** | `https://github.com/davebcn87/pi-autoresearch`. THE autonomous-loop reference. `goal → benchmark → act → measure → judge → record → resume`, externalised onto disk so context resets don't break the chain. **Pattern dirgha should adopt for sprint mode**: `autoresearch.md` digest + `autoresearch.jsonl` ledger + branch-aware checkpoints. Hooks are `before.sh` / `after.sh` with JSON stdin → stdout steer-back. |
| **claw-code** | `https://github.com/ultraworkers/claw-code`. Rust workspace (`crates/api`, `crates/tools`, `crates/runtime`, `crates/telemetry`). Mock-anthropic-service for parity testing — pattern worth borrowing. |
| **claude-code** | This CLI. Hooks, MCP, plan mode, subagents (Task tool), CLAUDE.md auto-load, slash commands, output styles. Sets the parity ceiling for most dimensions. |
| **aider** | `https://github.com/Aider-AI/aider`. Strongest in: model registry via litellm (`models.py`), git auto-commit per turn → `--undo` for resume (`repo.py`), 30+ slash commands (`commands.py`), repomap-based context priming (`repomap.py`), architect↔editor split coders. |

---

## How this matrix is updated

1. Every fix changes one cell. Increment dirgha's score; recompute gap; re-sort priority queue.
2. Cite the new code path (`src_v2/...:LL`) in the row's notes (kept in `/details.md` sibling — not yet written).
3. Re-run `npm run test:cli`. Any regression gets reverted; the matrix is rolled back.
4. When a gap hits 0, the row is closed and we move to the next.
5. Dogfood gate: every 5 closed gaps, run dirgha on a real long-horizon task. Anything broken → new row at the bottom of the matrix with a low score.

Inspired by [pi-autoresearch](https://github.com/davebcn87/pi-autoresearch)'s pattern: the matrix file IS the spec, the burndown chart, and the audit trail. A fresh agent with zero context can read this file, find the highest gap, and continue the work.
