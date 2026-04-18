# Dirgha Code

**A terminal-native AI coding agent. Sovereign by default. Bring-your-own-key.**

[![npm](https://img.shields.io/npm/v/@dirgha/code?style=flat-square&color=000)](https://www.npmjs.com/package/@dirgha/code)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/license-FSL--1.1--MIT-blue?style=flat-square)](./LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A1-ec4899?style=flat-square)](https://dirgha.ai/contribute)

---

```
◈ Dirgha Code · dirgha.ai · 0.1.0 · nvidia/minimax-m2.7
──────────────────────────────────────────────────────────
❯ refactor this module to use the builder pattern
  ∇ thinking…

  ∴ read_file    src/order.ts (143 lines)
  ∴ repo_map     src/**.ts · 34 symbols
  ⊕ edit_file    src/order.ts  +18 −42
  ∂ run_command  npm test      24 passed · 1.3s
  ≡ git_commit   refactor(order): extract OrderBuilder

  Done. OrderBuilder now composes validation, pricing, and
  persistence. Tests green. Diff available via /scroll.
```

Dirgha Code writes, edits, runs, and verifies code from your terminal. It
ships with 43 built-in tools, a dispatcher that speaks to 14 LLM providers,
a multi-tier memory system, persistent sessions, a sandboxed runtime for
user code, and a plugin registry. It is entirely one binary you install
from npm. No Electron, no cloud dependency if you BYOK, no telemetry.

## Install

```bash
npm install -g @dirgha/code        # or: pnpm add -g @dirgha/code
```

Requires Node 22.5+. Binary installs as both `dirgha` and `d`.

## Start in 30 seconds

Bring any one provider key:

```bash
export NVIDIA_API_KEY=nvapi-…        # MiniMax M2.7 + Kimi K2 (recommended)
export ANTHROPIC_API_KEY=sk-ant-…    # Claude
export OPENROUTER_API_KEY=sk-or-…    # 300+ models
# ... or 11 others — see "Providers" below

dirgha
```

Or sign in to the hosted Dirgha Gateway (cross-provider failover, managed
quotas, zero key management):

```bash
dirgha login
dirgha
```

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
| **NVIDIA NIM** | `NVIDIA_API_KEY` | MiniMax M2.7, Kimi K2, Llama 4, Mistral Nemotron — generous free tier, 60s per-call timeout guard |
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

## Headless agent mode

Every interactive flow has a machine-readable counterpart. `dirgha agent …`
dispatches to the agent-mode runner (`agent/index.ts`, `agent/parser.ts`,
`agent/executor.ts`) that returns a stable JSON shape:

```bash
dirgha agent chat --message "summarise CHANGELOG.md" --json
```

```json
{
  "data": { "response": "v0.1.0 adds multi-provider dispatch, …", "model": "minimaxai/minimax-m2.7" },
  "text": "v0.1.0 adds multi-provider dispatch, …",
  "exitCode": 0,
  "command": "chat",
  "timestamp": "2026-04-18T11:23:07.701Z",
  "suggestions": ["Use --model to specify a different model"],
  "meta": { "durationMs": 2043, "tokensUsed": 312, "model": "minimaxai/minimax-m2.7" }
}
```

This is how you drive Dirgha from CI, other agents, IDE extensions, or shell
scripts. Every command in the registry (`agent/index.ts`) follows the same
contract.

## Slash commands (30 built-in)

Available inside the interactive TUI. Full list in `src/repl/slash/`:

- **Navigation** — `/model`, `/keys`, `/provider`, `/login`, `/logout`
- **Session** — `/session`, `/sessions`, `/resume`, `/fork`, `/compact`,
  `/checkpoint`, `/rollback`
- **Tools** — `/tools`, `/mcp`, `/hub`, `/skill`, `/ask`, `/scroll`
- **Knowledge** — `/memory`, `/remember`, `/recall`, `/knowledge`,
  `/search`, `/context`, `/wiki`
- **Workflow** — `/sprint`, `/recipe`, `/team`, `/orchestrate`,
  `/consensus`, `/agent`
- **Dev** — `/dev`, `/screen`, `/theme`, `/verify`, `/hermes`, `/cron`
- **Safety** — `/security`, `/safety`
- **Meta** — `/help`, `/status`, `/voice`, `/fs`, `/net`, `/git`

Auto-complete on partial entry — `/hel` expands to `/help`, `/sta` to `/status`.

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

## License

**FSL-1.1-MIT** (Functional Source License, MIT Future).

- Free for any non-competing use — personal, research, education,
  professional services, internal company use.
- You cannot take this code, rebrand it, and sell a competing product.
- Each release converts to pure MIT automatically **two years after**
  release. The community gets the long tail; the project is protected in
  the present.

Full text in [`LICENSE`](./LICENSE). Plain-English summary at
<https://fsl.software>.

## Contributing

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) and sign the [CLA](./CLA.md).
Contributions are assigned to Dirgha LLC so the project stays coherent and
relicensable as it grows. Standard for commercial open-source.

## Trademark

"Dirgha" and "Dirgha Code" are trademarks of Dirgha LLC. The FSL license
does not grant rights to the Dirgha name, logo, or branding.

## Support the project ♡

Dirgha Code is independent and unfunded. If it saves you time, help keep it
going:

- <https://dirgha.ai/contribute> — Bitcoin, Lightning, UPI, card
- [GitHub Sponsors](https://github.com/sponsors/dirghaai)
- [Open Collective](https://opencollective.com/dirgha)

From the CLI:

```bash
dirgha contribute
```

## Links

- Website — <https://dirgha.ai>
- Issues — <https://github.com/dirghaai/dirgha-code/issues>
- Email — team@dirgha.ai
- X / Twitter — [@salik](https://x.com/salik) · [@DirghaAI](https://x.com/DirghaAI)

---

Built in India. Open to the world.

Copyright © 2026 Dirgha LLC.
