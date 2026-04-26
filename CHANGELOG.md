# Dirgha CLI — Changelog

## 1.6.0 — 2026-04-26

### Added

- **Local model provider** — first-class llama.cpp + Ollama support. New `LlamaCppProvider` at `src_v2/providers/llamacpp.ts` (default `http://localhost:8080/v1`, `LLAMACPP_URL` override). Model ids prefixed `llamacpp/…` route there; `ollama/…` continues to route to the existing Ollama provider.
- **Setup wizard — Local option.** New "Local (llama.cpp / Ollama)" step in `dirgha setup` (option 2, right after Dirgha hosted). Auto-probes both `localhost:11434` and `localhost:8080`, lists installed models from each (`/api/tags` + `/v1/models`), and falls through with placeholder + install hints when neither server is up.
- **`dirgha doctor` — Local probes.** Added Ollama (`http://localhost:11434/api/tags`) and llama.cpp (`http://localhost:8080/v1/models`) checks; warn (not fail) when not running, since local servers are optional.
- **Hardware-aware model recommendation.** New `dirgha hardware` subcommand (alias `sysinfo` / `system`) detects CPU cores, RAM, NVIDIA VRAM, AVX2, then ranks the top 5 GGUF models that fit. The Local step in `dirgha setup` runs the same probe and surfaces top-3 download-able models when neither local server is up. Catalogue: 9 ungated Q4_K_M GGUFs from `bartowski/` and `unsloth/` on HuggingFace, refreshed Apr 2026 (Qwen 3.5, Phi-4, Gemma 4, Mistral Small 3.2). `--json` emits the full profile + recommendations.
- **Five pillars.** README intro + `package.json` description rewritten to surface the new local-models pillar alongside BYOK, parallel agents, persistent memory, and skills.

## 1.4.0 — 2026-04-25

### Added

- **Soul.** Short Markdown persona shipped at `~/.dirgha/soul.md` (override) or the default that ships with the package. Defines tone, boundaries, end-of-turn norms. 4 KB cap.
- **Multi-key BYOK pool** with priority + LRU + cooldown + atomic file lock. 17 known providers (anthropic, openai, gemini, openrouter, nvidia, fireworks, deepseek, groq, cerebras, together, deepinfra, mistral, xai, perplexity, cohere, kimi, zai). `dirgha keys pool {add,list,remove,clear}`.
- **`dirgha login --provider=<id> [--key=…]`** interactive BYOK flow with hidden prompt fallback. Mode 0600.
- **`dirgha update --check / --self / --packages [--yes]`** — npm registry probing, prompt-gated upgrade, audit-logged.
- **`dirgha models refresh`** — parallel `/v1/models` fetch across configured providers, 24 h cache. Live: 499 models in <1 s.
- **TypeScript / ESM extensions API** — `~/.dirgha/extensions/<name>/index.mjs` exports a default function that calls `api.registerTool / registerSlash / registerSubcommand / on(event)`. Isolated load failures.
- **`dirgha undo [N]`** rolls back N user-turns from the most-recent session with a `.bak` snapshot. `--list / --json / --session=<id>` flags.
- **TF-IDF cosine search over the JSONL ledger** — `dirgha ledger search` defaults to ranked, `--exact` falls back to substring.
- **MCP HTTP transport** with async `bearerProvider` for OAuth token rotation per request.
- **StatusBar live tok/s readout** in green when busy ≥ 250 ms with non-zero output.
- **`dirgha cost {today,day,week,all}`** — reads the audit log, folds USD via the price registry.
- **`ask` mode** (read-only Q&A) — kernel-hook gate blocks every write tool. Cyan `[ASK]` badge.
- **34 model aliases** — `kimi`, `opus`, `sonnet`, `haiku`, `gemini`, `flash`, `deepseek`, `llama`, `ling`, `hy3`, … resolved before routing in main + resume + ask + chat + verify + fleet.
- **Workspace `git_state` injection** — branch + dirty + last 5 commits + staged diff (capped 4 KB) wired into the system prompt for interactive sessions.
- **Compaction telemetry** — `[compacted] X → Y tokens (-Z%)` banner + `kind:compaction` audit entry.
- `docs/ARCHITECTURE.md` + `docs/ROADMAP.md` + `docs/audits/HY3-AUDIT-2026-04-25.md`.

### Fixed

- **NIM streaming** silently dropped content on `deepseek-v4-flash` because the parser only recognised `delta.reasoning_content`, not `delta.reasoning`. Both keys are now accepted.
- **NIM + OR per-call timeouts** were 60 s / 120 s — too tight for multi-turn reasoning models. Bumped to 300 s.
- **Mid-session failover** previously triggered only on turn 0 errors. It now resumes from `result.messages` with `maxTurns − turnCount` budget remaining.
- **`dirgha keys set <ENV>` never reached providers** because the keystore wasn't hydrated into `process.env` at startup. Fixed; shell env still wins.
- **Login subcommand flags swallowed** by the top-level parser. Now passed through verbatim.
- **`task` tool was implemented but never registered** with the runtime tool registry. Wired in main.ts via SubagentDelegator.
- **ErrorClassifier was implemented but never instantiated.** Now wired into runAgentLoop in all three entry points.
- **`skills install <url>` flag injection** — defensively reject URLs starting with `-`.
- **Test paths hardcoded** to absolute prefixes — now portable via `import.meta.url`.

### Test floor

`npm run test:cli:offline` — **38 / 38 green in 16 s**. New suites this release: keypool (19/19), soul (17/17), update (23/23), models-refresh (24/24), extensions (29/29), nim-stream (10/10).

### Dogfood evidence

The 1.4.0 features were built using `dirgha -m hy3` as the implementation worker. The promo video at `changelog/1.4.1-promo.mp4` was authored from a brief and rendered by hyperframes.

## 0.2.0-beta.1 (2026-04-24) — new core + NVIDIA streaming fix

Second-generation CLI core under `src_v2/`, shipped as the `dirgha-v2` binary alongside the existing `dirgha` binary so users can switch on demand during the beta.

### Added (v2 core)

- Layered architecture with strict bottom-up dependency direction.
- Kernel: agent loop (ReAct + plan-execute hybrid), typed event stream, message assembly.
- Providers: unified interface + one canonical HTTP helper + adapters for NVIDIA NIM, OpenRouter (including the free-tier Ling 2.6 1T code workhorse), OpenAI, Anthropic (native Messages API), Google Gemini, Ollama, and a deprecated Fireworks shim.
- Tools: typed registry with per-model sanitisation, permission seam, diff engine, eight built-in tools (fs_read / fs_write / fs_edit / fs_ls / shell / search_grep / search_glob / git).
- Context: file-backed memory store, append-only JSONL sessions, automatic compaction via the summariser model, session branching.
- Extensions: skill loader (project / user / npm), MCP stdio client, subagent delegator + pool (with `task` tool), lifecycle hook registry.
- Surfaces: streaming terminal renderer, readline-based interactive REPL with slash commands, JSON-RPC daemon protocol + server, ACP adapter for IDE embedding.
- Safety: declarative policy engine, approval bus with pluggable subscribers, sandbox adapters for Seatbelt / Landlock (fallback) / bubblewrap / Windows / noop, hash-chained audit log.
- Intelligence: smart router (cheap vs. strong), provider-agnostic error classifier with recovery hints, cost tracker with per-session budgets, opt-in telemetry.
- Parity harness with scripted streaming / tool-call / unicode scenarios and a pluggable mock SSE server.
- Eval harness scaffold (internal regression runner, SWE-Bench / Terminal-Bench stubs, reporter).
- Integration clients: device-code auth flow, full Bucky surface (≈19 endpoints), Arniko security scanner with bootstrap helper, Dirgha Deploy projects + deployments + tarball upload + SSE log stream, entitlements check.
- Full-cycle composition flow (`plan → security scan → register → deploy → logs`).

### Fixed

- **NVIDIA NIM streaming stutter** (structural).
  Root cause: prior implementation sent `Content-Type: application/json` alongside `Accept: application/json`, breaking NIM's SSE content negotiation and producing truncated chunks. The v2 provider layer owns all HTTP headers in a single module; `Accept: text/event-stream` for streaming responses, `Content-Type: application/json` only when a request body is present, and the `extraHeaders` escape hatch explicitly rejects `accept` and `content-type` overrides. The class of bug cannot recur.

### Policy

- No source file, comment, identifier, or string literal in the v2 tree references any competing coding-agent CLI by name. Design documentation under `docs/dirgha-code/2026-04-23/` is the sole place competitor architectures are discussed, and those documents are internal reference material only.

## 0.1.0 (2026-04-20) — first public release

**Initial ship.** All surface stable; 27 slash command modules active, 85 user-facing slash commands, universal `--json` output, parallel multi-agent fleet.

### Added

- **Fleet** — parallel multi-agent in isolated git worktrees (`src/fleet/`)
  - `dirgha fleet launch <goal>` — decomposes goal, spawns N agents in parallel worktrees
  - `dirgha fleet triple <goal>` — 3 variants (conservative/balanced/bold) + judge picks winner
  - `dirgha fleet merge <agent-id>` — transient-commit 3-way apply-back (maw pattern)
  - `dirgha fleet list` / `dirgha fleet cleanup`
  - FleetPanel TUI live dashboard
- **Hub** — CLI-Anything plugin system (`dirgha hub search|install|list|remove|info|categories`)
- **Universal `--json`** — every command supports both `dirgha --json <cmd>` and `<cmd> --json`; output envelope is `{data, text, exitCode, command, timestamp, meta: {durationMs}}`
- **`/side <prompt>`** — Codex-style ephemeral sub-agent fork; doesn't pollute main history
- **Modal `/help`** — searchable overlay (type to filter, ↑↓ scroll, q/Esc close)
- **Spinner + elapsed time** on in-flight tool cells
- **Inline paste-collapse** — long pastes render as `[paste: N lines]` with first-line preview
- **Paste-burst detector** — Windows/terminal-safe; rapid `\n`-bursts coalesce instead of early-submitting
- **Fleet indicator** in status bar — `fleet × N` when ≥2 tools run in parallel
- **Auto-generated SKILL.md** on every `npm run build` (57 commands documented)
- **`__dump_spec`** — machine-readable commander introspection for tooling

### Fixed

- Tool calls piling up as "running…" — `onToolResult` now wired to agent loop
- StreamContainer event order — tools + text now interleave chronologically
- User prompt text-tearing on long pastes — width-constrained Boxes
- `dirgha hub --help` launched TUI instead of showing help (missing from SUBCOMMANDS)
- `dirgha ask` 500 — gateway URL was `/api/chat/completions` (broken) → `/api/cli/completions`
- NVIDIA BYOK model routing — added fallback chains for `minimaxai/minimax-m2.7` → `minimax-m2` → OpenRouter free tier
- Status bar `holo` phantom text removed
- Duplicate "⏳ queued" indicators
- User prompt disappearing on submit — now echoes immediately

### Removed

- 11 broken slash commands disabled (depended on missing `ctx.print` / `ctx.stream.markdown`): `/drop`, `/undo`, `/what`, `/screen`, `/scan`, `/secrets`, and all `/voice*`, `/net*`, `/fs*`, `/team*`, `/consensus*`, `/agent-*` families. Modules kept for future fix. See `docs/TUI_PARITY_ROADMAP.md`.
- 4 failing/cron GitHub Actions workflows (cost burn)

### Infrastructure

- Auto-SKILL.md regen as `postbuild` step
- `scripts/gen-skill-md.mjs` introspects commander at runtime
- `src/agent/output.ts` — shared `emit()` / `writeRaw()` / `installJsonCaptureIfEnabled()` for CLI-Anything JSON compliance

### Known issues

- NVIDIA NIM sometimes returns transient 502 — now handled by fallback chains
- Quota shows exceeded on local `dirgha status` (dev env) — honest reporting, not a bug
- TUI needs a real TTY — can't run in CI non-interactive mode (use `dirgha ask` for headless)

### Under the hood — standard terminology lock-in

Adopted industry-standard terms from the multi-agent workspace ecosystem audit (ccpm, claudio, genie, devteam, citadel, maw, agent-worktree):

| Term | Meaning |
|---|---|
| **worktree** | Isolation unit (git worktree) |
| **fleet** | Parallel agents on one goal |
| **subtask** | Parallelizable stream within a fleet |
| **runtime** | Compute environment (local / worktree / SSH — future) |
| **skill** | Reusable capability bundle (CLI-Anything) |
