# Dirgha Code

**A terminal-native AI coding agent. Sovereign by default. Parallel by design. Bring-your-own-key.**

[![npm](https://img.shields.io/npm/v/@dirgha/code?style=flat-square&color=000)](https://www.npmjs.com/package/@dirgha/code)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/license-FSL--1.1--MIT-blue?style=flat-square)](./LICENSE)
[![CLI-Anything compliant](https://img.shields.io/badge/CLI--Anything-compliant-10b981?style=flat-square)](https://github.com/HKUDS/CLI-Anything)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A1-ec4899?style=flat-square)](https://dirgha.ai/contribute)

---

```
◈ Dirgha Code · dirgha.ai · 0.1.0 · nvidia/minimax-m2.7
──────────────────────────────────────────────────────────
❯ dirgha fleet launch "migrate auth to JWT + add rate limiter"
  ∇ decomposing goal into parallel streams…

  fleet × 3
  ⠙ auth-middleware        fleet/auth-middleware        12s
  ⠹ jwt-service            fleet/jwt-service             9s
  · rate-limiter           fleet/rate-limiter            5s — done

  ✓ 3/3 agents completed in 47s · review with `git diff`
```

Dirgha Code writes, edits, runs, and verifies code from your terminal —
alone or as a **fleet of parallel agents** working in isolated git
worktrees. It ships with 43 built-in tools, a dispatcher that speaks to
14 LLM providers with automatic failover, a multi-tier memory system,
persistent sessions, a sandboxed runtime for user code, and a plugin
registry. It is entirely one binary you install from npm. No Electron,
no cloud dependency if you BYOK, no telemetry, full CLI-Anything
compliance (`--json` on every command).

## Install

```bash
npm install -g @dirgha/code        # or: pnpm add -g @dirgha/code
```

Requires Node 20+. Binary installs as both `dirgha` and `d`.

## Start in 30 seconds

Pick one of three on-ramps. You can change your mind later without
reinstalling.

### 1. Hosted (recommended for trial)

```bash
dirgha login                       # device-flow browser handshake
dirgha                             # launch the TUI
```

Signs you in to the Dirgha Gateway — cross-provider failover, managed
quotas, zero key management.

### 2. BYOK (sovereign — recommended for serious work)

Bring any one provider key:

```bash
dirgha keys set NVIDIA_API_KEY nvapi-…      # MiniMax M2.7, Kimi K2, Llama 4
dirgha keys set ANTHROPIC_API_KEY sk-ant-…  # Claude
dirgha keys set OPENROUTER_API_KEY sk-or-…  # 300+ models
# …or 11 others — see "Providers" below

dirgha
```

Keys are stored at `~/.dirgha/keys.json` (mode 0600), auto-loaded into
env at boot. No telemetry, no gateway round-trip.

### 3. Headless (CI / scripting)

```bash
# Single-turn
dirgha ask "summarise the failing tests" --json

# Parallel fleet in git worktrees
dirgha fleet launch "refactor auth + add tests" --concurrency 3

# Generate a signup link for new accounts
dirgha signup
```

Every command supports `--json` — parseable envelope with `data`, `text`,
`exitCode`, `timestamp`, and `meta.durationMs` (CLI-Anything spec).

---

## What's new in 0.1.0 — `fleet`

The headline feature of 0.1.0 is **parallel multi-agent execution in git
worktrees**. One command decomposes a goal into independent streams,
spawns N agents concurrently, and lets you review their diffs before
anything touches your working tree.

```bash
dirgha fleet launch "add rate limiting"        # 2-5 subtasks in parallel worktrees
dirgha fleet triple "refactor the auth loop"   # 3 variants + judge picks winner
dirgha fleet list                              # show all active worktrees
dirgha fleet merge <agent-id>                  # 3-way apply-back to your branch
dirgha fleet cleanup                           # tear down worktrees + branches
```

Full guide: [`docs/FLEET.md`](./docs/FLEET.md).

## Why this exists

Frontier coding assistants are closed SaaS on someone else's cluster, charging
per-seat, piping your repository through their telemetry. The assumption is
that the intelligence must live at the vendor.

Dirgha Code is built from the opposite assumption. Your laptop is the unit of
sovereignty. Your keys, your wallet, your session database, your tool
executions all live on your machine until you explicitly choose to hit a
network. Providers are swappable, not sacred. The agent loop itself is open
source and forkable.

You get the frontier tooling without the surrender.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Ink/React TUI                               │
│  InputBox  ·  LiveView  ·  StatusBar  ·  ModelPicker  ·  SlashHint   │
│        ─── useInput (raw mode) · bracketed paste · cursor blink ──   │
└────────────────────────┬─────────────────────────────────────────────┘
                         │  user turn
┌────────────────────────▼─────────────────────────────────────────────┐
│                        Agent Loop                                    │
│   ┌──────────────┐  ┌─────────────┐  ┌───────────────┐               │
│   │ context/JIT  │  │  compaction │  │ loop-detector │               │
│   │ system-prompt│→ │  tiered     │→ │ 60k-tok ceil. │               │
│   └──────────────┘  └─────────────┘  └───────────────┘               │
│           │                                  │                       │
│           ▼                                  ▼                       │
│   ┌──────────────┐  pending-messages  ┌───────────────┐              │
│   │  providers/  │◀ ─ mid-turn inject ─ │  tool exec  │              │
│   │   dispatch   │                     │  43 tools    │              │
│   └──────┬───────┘                     └───────┬──────┘              │
│          │                                     │                     │
│          ▼  429/502/timeout → next hop         ▼                     │
│   ┌──────────────┐                      ┌────────────┐               │
│   │  14 providers│                      │ tool runtime│              │
│   └──────────────┘                      │ · host      │              │
│                                         │ · sandbox   │              │
│                                         │ · MCP       │              │
│                                         │ · hub       │              │
│                                         └────────────┘               │
└──────────────────────────────────────────────────────────────────────┘
     │                         │                          │
     ▼                         ▼                          ▼
┌──────────┐         ┌──────────────────┐        ┌─────────────────┐
│ sessions │         │  memory system   │        │  filesystem     │
│ SQLite   │         │  · builtin       │        │  edit/diff/patch│
│ ~/.dirgha│         │  · holographic   │        │  repo-rooted    │
│          │         │  · gepa (LLM-opt)│        │                 │
│          │         │  · memory-graph  │        │                 │
└──────────┘         └──────────────────┘        └─────────────────┘
```

Every box is a separate module you can read. Total source: **51 subsystems
across ~50,000 lines of TypeScript**, 59 test files, one bundled distribution.

## Memory system

Dirgha Code has four layers of memory, each with a different persistence
model and retrieval pattern. They compose — a single `save_memory` call can
write through all four. Retrieval picks the lightest tier that answers the
query.

### 1. Built-in memory (`memory/builtin.ts`)

- **Where:** `~/.dirgha/sessions.db` (SQLite), `memories` table
- **Shape:** key → content, key is caller-chosen
- **Retrieval:** exact key match via `read_memory`, full-text scan via
  `search_knowledge`
- **Use:** the classic "persist this across sessions" slot. Reliable,
  synchronous, local-only.

### 2. Holographic memory (`memory/holographic.ts`)

- **Where:** SQLite FTS5 virtual table, same DB
- **Shape:** text + trust score + timestamp + source
- **Retrieval:** BM25-ranked full-text, weighted by freshness and trust
- **Use:** "show me everything the agent learned about the auth module last
  week" — dense, forgettable, repo-aware. Trust score decays; stale entries
  get pruned by the maintenance job.

### 3. GEPA integration (`memory/gepa-integration.ts`)

- **Where:** model-specific prompt compilation, cached on disk
- **Shape:** optimised few-shot prompts produced by GEPA
  (Gradient-free Evolutionary Prompt Adaptation)
- **Retrieval:** loaded into the system prompt when a matching task is
  detected
- **Use:** the agent gets better at recurring tasks (test writing, refactor
  patterns, PR reviews) because each round's success/failure retrains the
  prompt library. Opt-in; does not block the basic loop.

### 4. Memory graph (`tools/memory-graph.ts`, Qdrant-backed)

- **Where:** a running Qdrant instance (local or hosted) + local cache
- **Shape:** nodes with embeddings + directed edges with types
- **Retrieval:** semantic search + graph walk via `memory_graph_query`
- **Use:** "show me everything related to `OrderBuilder` across all my
  projects and sessions." Cross-repo, cross-temporal, knowledge-graph style.
  Heavy — optional infrastructure.

All four are addressable from tools the model actually uses:
`save_memory`, `read_memory`, `search_knowledge`, `memory_graph_add`,
`memory_graph_query`, `memory_graph_link`.

## The agent loop

`agent/loop.ts` (~560 lines) is the heart. Each turn:

1. **Build system prompt** — `agent/context.ts` parallelises four contributors:
   JIT-discovered repo context, the wiki index, the active skills prompt, and
   installed extensions. All wrapped in try/catch so no single source blocks
   the turn.
2. **Classify the query** — `agent/routing.ts` picks a tier (fast / full)
   from trigger heuristics (length, verb, language markers). Tier maps to a
   model ID per provider.
3. **Compact if needed** — `agent/compaction.ts` runs tiered summarization
   when history crosses 40 messages / 60k tokens. Earlier messages become a
   terse summary the agent references as "[turns 1-28 summary: …]".
4. **Dispatch** — `providers/dispatch.ts` picks the right provider, walks the
   fallback chain on 429 / 5xx / timeout, resumes interrupted streams.
5. **Execute tools** — as the model emits tool calls, `agent/tool-execution.ts`
   sanitises frame markers, enforces per-call output caps, and records results.
6. **Drain pending messages** — `agent/pending-messages.ts` picks up anything
   you typed mid-turn and appends it as a fresh user message for the next turn.
7. **Emit events** — `agent/event-emit.ts` pushes live updates (with a
   circuit breaker on 5 consecutive send failures) to the TUI so you see what
   the agent is doing in real time.
8. **Self-reflect** — `agent/reflection.ts` checks for loop-detection
   signals (same tool called 3× with identical args) and forces a correction
   prompt before the next iteration.

The loop terminates when the model emits `stop_reason: end_turn` or the user
presses Esc. Every step is individually failure-isolated; a broken wiki
index, a flaky provider, or a tool that times out don't cascade.

## Tools (43 built-in, plus MCP and hub)

All 43 ship as first-class tool definitions the model sees in its schema.
Catalogued in `src/tools/defs.ts`:

| Category | Tools |
|---|---|
| **Filesystem** | `read_file`, `write_file`, `edit_file`, `edit_file_all`, `apply_patch`, `make_dir`, `delete_file` |
| **Shell** | `run_command`, `bash` (alias) — 8k-char output cap, 60s default timeout, auto-extends to 300s for `npm install` / `bun test` / builds, dangerous-pattern blocklist, cwd-tracking across calls |
| **Search** | `search_files` (ripgrep), `list_files`, `glob`, `repo_map` (symbol-aware), `web_fetch`, `web_search` (DuckDuckGo), `qmd_search` (semantic docs), `search_knowledge` (local FTS5), `index_files` |
| **Git** | `git_status`, `git_diff`, `git_log`, `git_commit`, `checkpoint` (stash-based), `git_branch`, `git_push`, `git_stash`, `git_patch`, `git_auto_message` (AI-generated conventional commits) |
| **Memory** | `save_memory`, `read_memory`, `search_knowledge`, `session_search` (cross-session history), `write_todos`, `ask_user`, `memory_graph_add`, `memory_graph_query`, `memory_graph_link`, `memory_graph_prune` |
| **Sandbox** | `execute_code` — runs Python or JS in an isolated VM with network-deny, CPU/memory caps, transcript logging |
| **Browser** | `browser` — navigate, snapshot, click, type, fill, screenshot, find, get, batch, eval, extract, search (Playwright-backed when available) |
| **Agent orchestration** | `spawn_agent` (depth-limited sub-agents), `orchestrate` (plan → code → verify three-agent chain) |
| **Deployment** | `deploy_trigger`, `deploy_status` (wired to CI systems via webhooks) |

**MCP (Model Context Protocol):** Dirgha Code is an MCP **client**. `mcp/` has
stdio, SSE, and HTTP transports; `mcp/manager.ts` starts and supervises
servers you configure in `~/.dirgha/mcp.json`. MCP tools show up in the
model's tool list alongside built-ins, namespaced by server.

**Hub:** `dirgha hub install <plugin>` installs a package from the Dirgha
plugin registry. Each plugin can contribute new tools, slash commands, or
output renderers. The registry ships bundled so `hub list` / `hub search`
work offline.

## Provider dispatch (14 providers, automatic failover)

`providers/dispatch.ts` has three primitives:

- **`providerFromModelId()`** — infers the provider from the model ID prefix
  (`claude-*` → Anthropic, `accounts/fireworks/*` → Fireworks,
  `minimaxai/*` → NVIDIA, `gpt-*` → OpenAI, …).
- **`buildFallbackChain()`** — family-aware chain builder. A request for
  a MiniMax model walks: `NVIDIA MiniMax M2.7` → `NVIDIA Kimi K2` →
  `NVIDIA MiniMax M2.5` → `OpenRouter Kimi K2.5` → `Anthropic Claude Sonnet`.
  Each hop is a different billing account with independent quotas, so 429
  on one doesn't throttle the rest.
- **`withNetworkResume()`** — catches pure network errors (ECONNRESET,
  socket hangup, 502, 503) and retries on the same provider with stream
  resume. 429 is NOT retried here — it jumps to the next provider.

| Provider | Env var | Notes |
|---|---|---|
| **NVIDIA NIM** | `NVIDIA_API_KEY` | MiniMax M2.7, Kimi K2, Llama 4, Mistral Nemotron — 60s per-call timeout guard |
| **Anthropic** | `ANTHROPIC_API_KEY` | Claude Opus 4.7, Sonnet 4.6, Haiku 4.5 — extended thinking supported |
| **OpenAI** | `OPENAI_API_KEY` | GPT-5.4 family, o-series reasoning models |
| **OpenRouter** | `OPENROUTER_API_KEY` | 300+ models, unified billing, global routing |
| **Google Gemini** | `GEMINI_API_KEY` | 3.1 Pro, 3.1 Flash — 2M-token context |
| **Groq** | `GROQ_API_KEY` | Llama, Qwen at extreme TPS |
| **xAI** | `XAI_API_KEY` | Grok 4 family |
| **Mistral** | `MISTRAL_API_KEY` | Mistral Large, Codestral |
| **Cohere** | `COHERE_API_KEY` | Command R / R+ |
| **Fireworks** | `FIREWORKS_API_KEY` | Self-hosted open models |
| **DeepInfra** | `DEEPINFRA_API_KEY` | Alt hosting |
| **Perplexity** | `PERPLEXITY_API_KEY` | Sonar, web-grounded |
| **Together AI** | `TOGETHER_API_KEY` | Llama, Qwen, DeepSeek |
| **Ollama** | (none) | Any model running on `localhost:11434` |
| **Dirgha Gateway** | `dirgha login` | Managed cross-provider routing |

Each provider module is a thin adapter (average ~120 lines). New providers
are a half-day's work: implement `call<Name>(messages, systemPrompt, model, onStream)`
in `providers/<name>.ts`, add it to the switch in `dispatch.ts`.

A **circuit breaker** (`providers/circuit-breaker.ts`) tracks per-provider
health. Three consecutive failures open the breaker for 30 seconds — the
dispatcher skips that provider entirely until it heals.

## Sessions & persistence

Everything runs on one SQLite database at `~/.dirgha/sessions.db` (via
`better-sqlite3`, synchronous writes, WAL mode).

**Tables:**
- `sessions(id, title, model, tokens, created_at, updated_at)`
- `messages(id, session_id, role, content, ...)` with ON DELETE CASCADE
- `memories(id, key, content, created_at, updated_at)`
- `file_index(id, filepath, project, content, symbols, indexed_at)` — FTS5
  virtual table for local semantic search

`dirgha --resume` picks up the last session. `dirgha --resume <id>` picks up a
specific one. `session_search` lets the agent itself pull relevant prior turns
into the current context.

Crash recovery is automatic: `dirgha` catches `uncaughtException` and
`unhandledRejection`, writes to `~/.dirgha/crash.log`, and calls
`restoreTerminal()` so your shell doesn't end up in bracketed-paste mode
or with the cursor hidden.

## Safety model

### Secrets in transit
`agent/secrets.ts` runs every user message through `redactSecrets()` before
it's saved to history or sent to the model. Detects and masks: Anthropic
keys, OpenAI keys, Fireworks keys, GitHub PATs, AWS credentials, JWT tokens,
SSH keys, and 33 other common patterns.

### Shell execution
`tools/shell.ts` enforces:
- **Output caps** — 8k chars default, 50k hard ceiling. Model can request
  more via `max_output`. Prevents single tool results from eating the entire
  context window.
- **Dangerous patterns blocked** — `rm -rf /`, `find -delete` with no scope,
  `git clean -fdx`, `curl | sh`, process substitution `<(...)`,
  `eval $(...)`, and a dozen others. List in `DANGEROUS_PATTERNS`.
- **Timeout bands** — 60s default, 300s for `npm install` / `bun test` /
  build commands (pattern-matched), max 600s. Timeout errors suggest the
  exact `timeout_ms` to retry with.

### Agent spawning
`agent/spawn-agent.ts`:
- `MAX_SPAWN_DEPTH = 3` — a sub-agent can spawn a sub-sub-agent, but no
  further. Prevents recursive fork bombs.
- `MAX_CONCURRENT_AGENTS = 4` — total active spawns across the session.
- `spawn_agent` itself is filtered out of sub-agent tool lists so only the
  root can spawn.

### Gateway URL integrity
`providers/gateway.ts` — `assertSafeGatewayUrl()` rejects any
`DIRGHA_GATEWAY_URL` that isn't HTTPS (localhost allowed). Prevents a
shell-rc injection from exfiltrating your bearer token to an attacker host.

### Tool output sanitisation
`agent/tool-execution.ts` — `sanitizeToolFrameMarkers()` strips `<system>`,
`<|im_start|>`, Llama 3 chat headers, and Mistral `[INST]` markers from tool
outputs before they re-enter the context. Blocks prompt-injection via file
contents.

### Permissions
`permission/` module — every tool tagged with a capability level
(`WorkspaceRead`, `WorkspaceWrite`, `SystemWrite`, `Network`). User can pin
the session to a capability level via `/security`. YOLO mode
(`--dangerously-skip-permissions` or `DIRGHA_YOLO=1`) disables checks for
trusted environments.

### Capability tokens
`security/capabilityTokens.ts` — short-lived HMAC-signed tokens for
delegating tool access to sub-agents, scoped to specific paths / capabilities.

## Headless & machine-readable — `--json` on every command

Every Dirgha command emits machine-readable JSON when `--json` is passed
(either at the root — `dirgha --json <cmd>` — or at the subcommand —
`dirgha <cmd> --json`). This is the CLI-Anything contract. Two-tier
implementation:

1. **Universal capture** — stdout is intercepted for any command and
   wrapped in the standard envelope on exit. Zero per-command changes.
2. **Native emit** — commands that want to expose structured `data`
   fields (like `dirgha hub list`, `dirgha fleet launch`) use the
   `emit()` helper and set the natively-emitted flag so the wrapper
   skips.

```bash
dirgha status --json         # account, quota, sessions
dirgha fleet list --json     # all active worktrees + branches
dirgha hub search ollama --json
dirgha ask "explain this repo" --json
```

The envelope shape:

```json
{
  "data":   { "…": "command-specific structured payload" },
  "text":   "human-readable output (ANSI-stripped)",
  "exitCode": 0,
  "command":  "fleet launch",
  "timestamp": "2026-04-20T07:45:22.118Z",
  "meta":     { "durationMs": 27 }
}
```

This is how you drive Dirgha from CI, other agents, IDE extensions, or
shell scripts. `dirgha __dump_spec` returns the full commander tree as
JSON for tooling/automation.

## Slash commands (80+ in the TUI)

Available inside the interactive TUI. Open the modal help (`/help` —
type to filter, ↑↓ to scroll, `Esc` to close) or see
[`docs/COMMANDS.md`](./docs/COMMANDS.md) for the full reference. Grouped:

- **Session** — `/help`, `/status`, `/clear`, `/compact`, `/save`,
  `/resume`, `/export`, `/summary`, `/cost`, `/tokens`, `/usage`
- **Auth & config** — `/login`, `/logout`, `/setup`, `/model`, `/keys`,
  `/config`, `/theme`, `/soul`
- **Dev workflow** — `/spec`, `/plan`, `/review`, `/qa`, `/fix`,
  `/refactor`, `/scaffold`, `/changes`, `/fast`, `/verbose`
- **Git** — `/diff`, `/commit`, `/stash`, `/push`, `/branch`, `/checkout`
- **Memory & knowledge** — `/memory`, `/remember`, `/recall`, `/curate`
- **Safety** — `/checkpoint`, `/rollback`, `/permissions`, `/yolo`,
  `/approvals`, `/btw`
- **Skills & tools** — `/skills`, `/init`, `/scan`, `/secrets`
- **System** — `/verify`, `/doctor`
- **Integrations** — `/mcp`, `/voice`, `/cron`, `/net`, `/fs`, `/team`,
  `/consensus`, `/screen`, `/drop`, `/undo`
- **Sprint engine** — `/sprint`, `/run`
- **Multi-agent** — `/side` (ephemeral sub-agent fork), `/orchestrate`

Auto-complete on partial entry — `/hel` expands to `/help`, `/sta` to
`/status`. `/side <prompt>` runs an isolated sub-agent that does NOT
pollute the main conversation history (Codex pattern, useful for quick
tangents).

## Configuration surface

Everything lives in `~/.dirgha/`:

```
~/.dirgha/
├── keys.json            # BYOK keys (mode 0600), auto-loaded into env at boot
├── credentials.json     # Gateway login token (if signed in)
├── config.json          # Theme, defaults, feature flags
├── sessions.db          # SQLite — sessions, messages, memory, file index
├── mcp.json             # MCP server configurations
├── hub/                 # Installed plugins + cached registry
│   ├── plugins/
│   └── registry.json
├── soul.md              # Persistent context you want in every turn
├── MEMORY.md            # Legacy memory file (still read)
├── crash.log            # Last unclean exit transcript
└── transcripts/         # Full tool-execution transcripts for audit
```

**Environment overrides (commonly useful):**

| Var | Effect |
|---|---|
| `DIRGHA_PROVIDER` | Pin provider (`nvidia`, `anthropic`, `openrouter`, …) |
| `DIRGHA_LOCAL_MODEL` | Pin model ID |
| `DIRGHA_GATEWAY_URL` | Override hosted gateway (HTTPS enforced) |
| `DIRGHA_ADMIN=1` | Admin mode — BYOK only, long retry budget, no cross-provider failover |
| `DIRGHA_YOLO=1` | Skip permission prompts (use in trusted shells only) |
| `DIRGHA_DEBUG=1` | Verbose dispatch + tool logs to stderr |
| `DIRGHA_PROFILE=1` | Per-turn timing breakdown |

## Runtime & sandbox

`runtime/` implements the isolated execution environment for the
`execute_code` tool. It uses Node's VM module with:
- Network deny by default (`runtime/network-control.ts`)
- Filesystem mount scoping (`runtime/mount.ts`) — the sandbox only sees
  directories explicitly mounted
- CPU + memory caps
- Transcript logging (`runtime/transcript.ts`) — everything executed is
  recorded and can be replayed
- Multiplayer mode (`runtime/multiplayer.ts`) — shared sandbox sessions for
  agent collaboration

## Agent orchestration

`agent/orchestration/` provides the primitives behind `orchestrate` and
`spawn_agent`:

- **Agent pool** — pre-warmed workers, queue, auto-scaler, idle cleanup
- **DAG runner** — directed-acyclic-graph task execution with dependencies
- **Decomposer** — splits high-level goals into sub-tasks
- **Circuit breaker** — per-agent-type failure tracking
- **Structured results** — every agent returns a typed result shape
- **Scheduler** — priority queue, retries, back-off

The `swarm/` subsystem (14 files) is a higher-level orchestration primitive
for multi-agent collaboration patterns: `governance`, `templates`,
`collaboration`, `runtime` — used by `/team` and `/consensus` slash commands.

## Voice

`voice/` (12 files) — optional voice-first mode. Desktop capture via system
audio, mobile bridge for remote dictation, Whisper-compatible transcription,
TTS playback via system voices or remote endpoints. `dirgha voice` starts
the voice loop; `dirgha voice-config` manages shortcuts and hotwords.

## Knowledge engine

`knowledge/` (5 files) — Dirgha's local wiki. `dirgha knowledge sync --from
articles.jsonl` bulk-imports; `dirgha k search "<query>"` does FTS5 search
over the corpus; `dirgha k wiki` rebuilds the index. Backed by
`knowledge/compiler.ts` (markdown → searchable), `knowledge/linter.ts`
(link validation), `knowledge/git-sync.ts` (syncs knowledge files to a git
remote).

## Source tree overview

```
src/
├── agent/             # Loop, context, compaction, dispatch glue, spawning
├── commands/          # 80 commander.js subcommand handlers
├── repl/              # TUI REPL shell, slash commands (30 files)
├── tui/               # Ink/React 19 components (58 files)
├── providers/         # 14 LLM adapters + dispatcher + circuit breaker
├── tools/             # 43 built-in tool implementations
├── runtime/           # Sandbox: VM, mounts, network control, transcripts
├── memory/            # 4-tier memory: builtin, holographic, GEPA, graph
├── swarm/             # Multi-agent collaboration patterns
├── mcp/               # MCP client: stdio, SSE, HTTP transports
├── hub/               # Plugin registry + installer + commands
├── knowledge/         # Wiki, compiler, linter, git sync
├── security/          # Capability tokens, safe shell, CSRF, scanner
├── permission/        # Per-tool capability model
├── billing/           # Client-side usage tracking
├── session/           # SQLite persistence layer
├── voice/             # Whisper + TTS + hotword
├── browser/           # Browser automation helpers
├── sprint/            # Sprint/recipe orchestration (critic, verifier, watchdog)
├── checkpoint/        # Checkpoint/rollback primitives
├── skills/            # Built-in skill prompts (plan, debug, review, …)
├── extensions/        # Extension host + RPC
├── evals/             # Built-in eval suite
└── utils/             # Credentials, keys, logger, health monitor, security boundary
```

59 test files ship alongside the source. Build is `esbuild`, single-file
output to `dist/dirgha.mjs` (~7.3 MB minified).

## Sister projects in the Dirgha OS

This repo is one of five that make up the open-source surface of the Dirgha OS. Each repo stands on its own; together they compose a full stack for builders.

| Repo | What it does | License |
|---|---|---|
| [`creator-studio`](https://github.com/dirghaai/creator-studio) | Backend API for the creator economy. Monetization, campaigns, memberships, social integrations. | Apache-2.0 |
| [`writer-studio`](https://github.com/dirghaai/writer-studio) | Backend API for writing — science, fiction, screenplays, research. Binder + AI research + RAG. | Apache-2.0 |
| [`abundance-protocol`](https://github.com/dirghaai/abundance-protocol) | DePIN for distributed AI inference. Peer-to-peer compute, Lightning settlement, on-chain governance. | Apache-2.0 |
| [`arniko`](https://github.com/dirghaai/arniko) | AI security scanning. 36 scanner adapters unified into one stream of typed findings. | Apache-2.0 |

Visit the umbrella org at [github.com/dirghaai](https://github.com/dirghaai) or the product site at [dirgha.ai](https://dirgha.ai).

## License

The Dirgha Code CLI is source-available under **FSL-1.1-MIT** and converts to **MIT** two years after each release. In practice: you can install, use, fork, modify, redistribute, and package it for your team or company today. The one restriction — no competing hosted service — expires automatically. Full rationale in [`LICENSING.md`](./LICENSING.md); quick summary at [dirgha.ai/license](https://dirgha.ai/license).

**Dirgha LLC owns the “Dirgha” name, logo, and product family** as registered trademarks. The code is open — the brand isn't. Forks of this repository must rename the product and remove Dirgha branding before distribution. Reasonable nominative use (“a fork of Dirgha Code”) is fine.

See [`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md) for the full legal text. Related documents:

- [`SECURITY.md`](./SECURITY.md) — vulnerability disclosure policy.
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) — Contributor Covenant 2.1.
- [`SUPPORT.md`](./SUPPORT.md) — where to ask for help.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to send a PR.
- [`LICENSING.md`](./LICENSING.md) — honest rationale for the FSL choice (why not pure MIT? bootstrapped, not VC-funded).

## Contribute

- **Code** — fork, branch, PR against `main`. Recipes in [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- **Bugs** — file an issue using the [bug template](https://github.com/dirghaai/dirgha-code/issues/new?template=bug.md).
- **Features** — file an issue using the [feature template](https://github.com/dirghaai/dirgha-code/issues/new?template=feature.md).
- **Questions** — open a [Discussion](https://github.com/dirghaai/dirgha-code/discussions) rather than an issue.
- **Security** — email `security@dirgha.ai`. Do NOT file a public issue for vulnerabilities.
- **Sponsor** — [dirgha.ai/contribute](https://dirgha.ai/contribute) · Lightning, GitHub Sponsors, OpenCollective.


## Links

| | |
|---|---|
| Website | [https://dirgha.ai](https://dirgha.ai) |
| Repository | [github.com/dirghaai/dirgha-code](https://github.com/dirghaai/dirgha-code) |
| Issues | [github.com/dirghaai/dirgha-code/issues](https://github.com/dirghaai/dirgha-code/issues) |
| Discussions | [github.com/dirghaai/dirgha-code/discussions](https://github.com/dirghaai/dirgha-code/discussions) |
| Security | `security@dirgha.ai` |
| Enterprise | `enterprise@dirgha.ai` |
| Press / general | `hello@dirgha.ai` |

---

**Dirgha Code** is part of the Dirgha OS — open-source infrastructure for builders, shipped by a small bootstrapped team.

Named for the Sanskrit *dīrgha* — “long-horizon.” The agent is built for work that spans hours, not turns.

Built by [Dirgha LLC](https://dirgha.ai) in India. Open to the world.

Released under **FSL-1.1-MIT** · Copyright © 2026 Dirgha LLC · All third-party trademarks are property of their owners.
