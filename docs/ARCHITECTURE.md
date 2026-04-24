# Dirgha Code — Architecture

**Status:** 2026-04-24. Post-Sprint 3 of the launch plan. 54 dirs under `src/` (down from 60). 0 `@ts-nocheck` in security-critical paths.

This doc is the contract for the top-level shape of the codebase. If a new directory shows up under `src/` that isn't listed here, either update this doc or delete the directory.

## Entry points

- `src/index.ts` — CLI entry. Parses argv, registers ~51 user commands (+ 6 more under `DIRGHA_EXPERIMENTAL=1`), launches the REPL when no subcommand is given.
- `src/index-agent.ts` — Headless agent entry (machine-to-machine).
- `dist/dirgha.mjs` — Bundled output from esbuild. Ships in the npm tarball.

## Core (stable surface)

These directories ship in 0.1.x and follow semver on their public exports.

| Dir | Role |
|---|---|
| `agent/` | Tool-use loop, spawn, trust-level enforcement, context build. The heart. |
| `providers/` | 13 LLM providers + dispatch router + stream parser. |
| `tools/` | 40+ tool implementations (read/write/shell/git/browser/search/repo_map). |
| `permission/` | Trust-level-based confirmation + persistent decisions (SQLite). |
| `memory/` | Unified memory graph (hot/warm/cold tiers). |
| `session/` | Session persistence + fork + resume. |
| `project-session/` | Project-scoped state isolated from global session. |
| `commands/` | All `dirgha <subcommand>` handlers. One file per command family. |
| `repl/` | Interactive REPL: slash commands, streaming renderer, interruption. |
| `tui/` | Ink-based TUI components (models picker, fleet panel, help overlay). |
| `config/` | Rate limits and runtime config (not user config — that's `utils/config`). |
| `types.ts` | Cross-module type definitions. |
| `utils/` | Shared helpers (safe-exec, credentials, session-cache, experimental gate). |

## Platform integration

Layers that bridge Dirgha Code to the Dirgha platform services.

| Dir | Role |
|---|---|
| `gateway/` | `api.dirgha.ai` client — auth, quota, completions proxy. |
| `billing/` | Quota checks, rate-limit LRU, usage reporting. |
| `services/` | `UnifiedAgentClient` — gateway-mediated agent execution. |
| `checkpoint/` | Shadow-git snapshots + durable workflow resume. |
| `mcp/` | Model Context Protocol (stdio server + client). |
| `extensions/` | Third-party extension loader and manager. |
| `hub/` | Plugin discovery (`dirgha hub`) and installer. |

## Content and knowledge

| Dir | Role |
|---|---|
| `knowledge/` | Document ingestion + chunking for RAG. |
| `embeddings/` | Vector store + VSS-backed similarity search. |
| `context/` | Active-context window builder (files, recent edits, memory). |
| `sync/` | Wiki/Obsidian-style sync (knowledge graph → markdown). |
| `llm/` | Shared LLM utilities (structured output, summarization). |

## Execution + sandbox

| Dir | Role |
|---|---|
| `runtime/` | Isolate-based code execution sandbox, host-tools, WASM commands. No `@ts-nocheck` — type safety enforced. |
| `security/` | Threat scanning, secret redaction. |
| `browser/` | Playwright-backed browser tool (lazy-loaded). |

## Task + planning

| Dir | Role |
|---|---|
| `task/` | In-memory task queue with state-machine transitions. |
| `sprint/` | Autonomous sprint engine — reads markdown plans, runs verified steps. |
| `fleet/` | Parallel agents in git worktrees (`dirgha fleet launch`). |
| `skills/` | `SKILL.md` frontmatter registry for reusable agent skills. |

## Ops + telemetry

| Dir | Role |
|---|---|
| `cron/` | Scheduled tasks (daily summaries, memory compaction). |
| `analytics/` | Usage analytics (opt-in, anonymized). |
| `compaction/` | Context-window compaction heuristics. |
| `errors/` | Centralized error types. |
| `platform/` | Platform detection (node version, OS, editor). |
| `setup/` | First-run setup wizard helpers. |
| `agents/` | Pre-built agent configurations (codex, hermes, etc.). |

## Experimental (DIRGHA_EXPERIMENTAL=1)

These compile and ship in the bundle but are hidden from default `--help`. See `src/experimental/README.md` for the graduation checklist.

| Dir | Surface |
|---|---|
| `mesh/` | libp2p compute-mesh node |
| `swarm/` | Multi-agent swarm coordinator |
| `voice/` | Desktop mic + mobile bridge + browser extension voice input |
| `multimodal/` | Image/PDF attachments in chat |
| `realtime/` | WebSocket hub (infra for future mesh/fleet coordination) |
| `workspace/` | Multi-tenant workspace isolation (infra for future teams) |

## Directories slated for consolidation

Legitimately in use, but small enough to fold into neighbors in a future sprint:

- `api/` (71 LoC) → move into `gateway/`
- `git/` (40 LoC) → merge into `tools/git.ts`
- `errors/` (125 LoC) → move into `types.ts` or `utils/errors.ts`

## Dead / recently removed

For grep-ability when old docs reference these:

- `src/recipes/` — removed 2026-04-24 (S3.2). Never invoked.
- `src/business/` — removed 2026-04-24 (S3.2). Placeholder teams/billing.
- `src/search/` — removed 2026-04-24 (S3.2). Replaced by `knowledge/` + `embeddings/`.
- `src/cost/` — removed 2026-04-24 (S3.2). Superseded by `billing/` + `agent/loop.ts` quota.
- `src/evals/` — removed 2026-04-24 (S3.2). Duplicated `tests/`.
- `src/styles/` — removed 2026-04-24 (S3.2). TUI styling is inline now.
- `src/models/router.ts` + `src/models/providers/litellm-unified.ts` — removed 2026-04-24 (S1.7). LiteLLM was decommissioned.

## Command registration

All 59 user commands are registered in `src/index.ts`. Six of them (mesh, swarm, voice, dao, make, bucky, join-mesh) are wrapped in `registerIfExperimental` from `src/utils/experimental.ts`. The rest are direct `register*(program)` calls.

A future sprint may refactor this into a `registerCommands(program, modules)` registry pattern. The inline approach is fine for ~60 commands; it becomes painful around 100.

## Import direction

Allowed direction (no cycles):

```
index.ts
  → commands/*
    → agent/*
      → providers/*, tools/*, permission/*, memory/*
        → utils/*, types.ts, config/*
```

Shared primitives (`utils/`, `types.ts`, `config/`) may be imported from anywhere. Everything else flows top-down.
