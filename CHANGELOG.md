# Dirgha CLI — Changelog

Versioning: **semver**. `1.x` is the first stable line; `0.1.x` was the initial public preview. Pre-`1.0` entries (`0.1.1`, `0.2.0-beta.1`, `0.2.0-beta.2`) are kept below for history.

## 1.2.2 (2026-04-25) — Esc actually does something now

- **Esc** is now wired in the Ink TUI with three priorities:
  1. If an overlay (help, model picker, etc.) is open, close it.
  2. If a turn is streaming, abort the in-flight LLM request.
  3. Otherwise, clear the input draft.

  Previously Esc was bound only inside vim mode and only as an
  overlay-close shortcut, so pressing it during a normal turn or
  while typing did nothing.

## 1.2.1 (2026-04-25) — five fixes from end-to-end smoke test

- **Flag parser**: `dirgha --json "prompt"` and `dirgha --print "prompt"`
  no longer swallow the prompt as the flag's value. A boolean-flag
  allowlist (`json`, `print`, `help`, `h`, `force`, `verbose`) ensures
  these never consume the next argv token. Restores the one-shot
  NDJSON form documented in `--help`.
- **NVIDIA NIM timeout**: bumped 60s → 120s to absorb tail latency on
  tool-followup turns. Eliminates the intermittent
  `Network error: Request timed out after 60000ms` seen when the
  default `moonshotai/kimi-k2-instruct` model is slow on the second
  turn.
- **Tool narration**: the streaming TUI now shows the tool input
  summary and an output preview. Example:
  ```
  → shell · ls /tmp/dirgha-readmes (done, 8ms)
    ⎿ exit=0 (+8 lines)
  ```
  Previously rendered only `→ shell (done, 8ms)`.
- **README**: corrected the architecture diagram label from
  `43 tools` to `11 tools` to match the actual count of registered
  built-ins (`tools/index.ts`).

## 1.2.0 (2026-04-24) — v2 is now the default

The clean-architecture v2 core, previously shipped as the `dirgha-v2`
side-binary in `0.2.0-beta.1` + `beta.2`, now **is** `dirgha`. The old
v1 binary is still available as `dirgha-v1` so anyone who needs it
during the transition can keep running it in the same install.

### Breaking changes

- **`dirgha` now runs v2.** The CLI is a complete rewrite — kernel,
  providers, tools, TUI, slash commands. Behaviourally most things
  are the same or better; visually the TUI is different (cleaner
  event projection, fewer render hacks). If you depend on v1
  behaviour, switch your scripts to call `dirgha-v1` explicitly.
- **Fireworks provider marked deprecated.** The v2 `fireworks.ts`
  adapter still exists but the fallback chains no longer route
  through it. Setting `FIREWORKS_API_KEY` is a no-op unless you pass
  `--provider fireworks` explicitly.
- **`~/.dirgha/auth.json` is auto-migrated** to
  `~/.dirgha/credentials.json` on first launch. The old file is
  renamed to `auth.json.migrated` for a recovery trail.

### Promoted from beta to stable

Everything that landed in `0.2.0-beta.1` and `0.2.0-beta.2` is
included and considered stable:

- **New layered core** (kernel / providers / tools / context /
  extensions / safety / intelligence). One canonical `streamSSE` in
  `providers/http.ts` owns all SSE headers — NIM stutter cannot recur.
- **Fleet** — in-process parallel worktree multi-agent, 3-way
  apply-back, tripleshot + LLM judge.
- **12 built-in tools** — `fs_read`, `fs_write`, `fs_edit`, `fs_ls`
  (with HUGE_ROOTS refusal), `shell`, `search_grep`, `search_glob`,
  `git`, `browser` (Playwright, 5 actions), `checkpoint`, `cron`,
  `multimodal` (describe / transcribe / **generate_image** via NVIDIA
  Flux Schnell default + OpenAI DALL-E 3 fallback).
- **15 CLI subcommands** — `login`, `logout`, `setup`, `doctor`,
  `audit`, `stats`, `status`, `init`, `keys`, `models`, `chat`, `ask`,
  `compact`, `export-session`, `import-session`, `submit-paper`. All
  with `--json` where applicable.
- **Ink TUI** — logo, streaming transcript, tool boxes, thinking
  blocks, status bar, input box, **model picker modal** (Ctrl+M),
  **help overlay** (?), **vim mode** (single-line, off by default),
  **paste-collapse** (Ctrl+E to expand), **fuzzy `@file` completion**.
- **20 slash commands** — all real, no stubs: `/init`, `/keys`,
  `/models`, `/help`, `/clear`, `/login`, `/setup`, `/status`,
  `/memory`, `/compact`, `/mode`, `/exit`, `/history`, `/resume`,
  `/session` (list / load / rename / **branch**), `/theme` (dark /
  light / none), `/fleet`, `/account`, `/upgrade`, `/config`.
- **Real auth in REPL and CLI** — device-code flow, quota preflight,
  usage recording, entitlements (including `fleet`/`tripleshot`).
- **Memory unified** — one `KeyedMemoryStore` contract, FTS5-backed
  via better-sqlite3 with substring fallback. Wiki-style knowledge
  base. v1's five overlapping memory paths are deprecated.

### New in `0.2.0` (not in any beta)

- **`/mode` is now real.** `plan` / `act` / `verify` each prepend a
  short preamble to the system prompt of every subsequent turn.
  `plan` is read-only (no writes or shells), `verify` is read-only
  audit, `act` is normal execution. Preference persists in
  `~/.dirgha/config.json`; `DIRGHA_MODE` env overrides per-session.
- **`/theme` is live.** Three palettes (`dark` / `light` / `none`)
  registered in `tui/theme.ts`. Readline REPL prompts flip
  immediately; Ink TUI picks up the new theme on restart. Preference
  persists.
- **`/session branch <name>` works.** Wires to the existing
  `context/branch.ts` via a provider pointer exposed on the slash
  context. Summarises the parent transcript into the child session
  so the new session inherits context without carrying the full
  history.
- **`auth.ts` reconciliation finalised.** Legacy `auth.ts` is a
  thin `@deprecated` shim over `device-auth.ts`; all new code uses
  the canonical module.

### Not included (out of scope for 0.2.0)

- Cron scheduler daemon — `cron` tool stores job declarations; a
  separate long-running process is required to execute them.
- Advanced vim motions (visual mode, search, buffers) — single-line
  scope only.
- Slash-command alias registry beyond what each command exposes.

### Install

```
npm install -g @dirgha/code
dirgha login       # or set any provider key
dirgha             # launch
dirgha-v1          # fall back to the old binary if you need to
```

## 0.2.0-beta.2 (2026-04-24) — remaining feature debt closed

Follow-up to `beta.1` that closes the ported-but-stubbed debt. Four
parallel-agent sprints completed in one pass. All additive; no breaking
changes from `beta.1`.

### Added

- **Real auth in the REPL.** `/login` runs the device-code flow and
  polls in the background so the prompt never blocks. `/account`
  renders a tier / balance / limits table with a ✓/✗ next to Fleet
  access. `/upgrade` prints the current plan + an upgrade URL with a
  referral code when the account has one.
- **Login / logout / setup as CLI subcommands.** `dirgha login` runs
  the device flow non-interactively. `dirgha logout` clears the token.
  `dirgha setup` is a BYOK key wizard that writes
  `~/.dirgha/keys.json` (mode 0600).
- **Auth module reconciliation.** `integrations/auth.ts` is now a
  `@deprecated` shim that delegates to `integrations/device-auth.ts`
  — one canonical module, one storage path
  (`~/.dirgha/credentials.json`). `migrateLegacyAuth()` silently
  moves `~/.dirgha/auth.json` on first load.
- **Ink TUI polish (all five deferred features).**
  - **Model picker modal** (Ctrl+M or `/model` with no args) — grouped
    by provider, arrow-key navigation, 1–9 quick-pick.
  - **Help overlay** (`?` on an empty buffer, or Ctrl+H) auto-generated
    from the slash registry; grouped by category, type-to-filter,
    shows keyboard shortcuts.
  - **Vim mode** — `h` `l` `0` `$` `w` `b` `x` `dd` `dw` `yy` `p` `i`
    `:q` on a single-line buffer, with `[INSERT]` / `[NORMAL]`
    indicator. Off by default; enable via `vimMode: true` in
    `DIRGHA.md` config.
  - **Paste-collapse** — pastes ≥4 lines or ≥200 chars in a single
    tick render as `[N lines pasted, X chars]`. Ctrl+E toggles full
    expansion. The full content still submits verbatim on Enter.
  - **Fuzzy `@file` completion** — subsequence matcher over cwd files
    (ignoring the standard IGNORED_DIRS list), top-8 results, Tab or
    Enter to pick.
- **Twelve CLI subcommands ported from v1.**
  - `dirgha doctor [--json]` — environment diagnostics (node version,
    git repo, `~/.dirgha/` present, reachability of each provider
    endpoint).
  - `dirgha status [--json]` — account, model, providers, sessions.
  - `dirgha stats [today|week|month|all] [--json]` — usage aggregates
    from session JSONL logs (tokens by model, cost by day).
  - `dirgha audit [list|tail|search <q>] [--json]` — local audit log.
  - `dirgha init [path] [--force]` — scaffold `DIRGHA.md`.
  - `dirgha keys <list|set|get|clear> ...` — BYOK key store.
  - `dirgha models <list|default|info> ...` — model catalogue with
    pricing.
  - `dirgha chat "<prompt>"` — pure LLM call, no tools, no agent loop.
  - `dirgha ask "<prompt>"` — headless agent with `--max-turns 30`
    default; equivalent to `dirgha "prompt"`.
  - `dirgha compact [sessionId]` — force-compact a session on disk.
  - `dirgha export-session <id> [path|-]` — dump session JSON.
  - `dirgha import-session <path>` — load session JSON into the store.
  - All expose `--json` where it makes sense; `main.ts` gained a
    generic `findSubcommand` dispatcher so future additions only need
    a file + a barrel entry.
- **`multimodal generate_image` wired to real providers.** NVIDIA Flux
  Schnell via `ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell`
  is the default; OpenAI DALL-E 3 is the fallback when
  `OPENAI_API_KEY` is set and NVIDIA isn't. Base64 response decoded to
  disk at `outputPath` (default `./dirgha-image-<ts>.png`). Model can
  be forced via `input.model` (`flux.1-schnell` / `dall-e-3`).
- **Provider interface gains an optional `generateImage()` method.**
  Other providers (Anthropic, Gemini, Ollama, …) leave it undefined
  and are skipped by the multimodal dispatch.

### Notes

- No kernel or transport changes in this beta. `streamSSE` stutter fix
  and root-scan guardrail from `beta.1` are unchanged.
- `dist_v2/` includes the new subcommand JS + Ink component JS, so the
  npm package carries the features by default.

## 0.2.0-beta.1 (2026-04-24) — new v2 core shipped as `dirgha-v2` side-binary

**Second-generation CLI core** under `src_v2/`, now bundled alongside the
existing `dirgha` binary as `dirgha-v2`. Users on `latest` keep v1.
Opt in with `npm i -g @dirgha/code@beta`.

### Why

The 2026-04-23 CLI 360° audit flagged 12+ P0/P1 architectural issues in
v1: fragmented memory (5 overlapping stores), `@ts-nocheck` debt
through core paths, dual REPL+TUI stacks, hot-context token bloat,
string-matching error handling. These can't be patched out. v2 is
Opus 4.7's layered rewrite per `docs/dirgha-code/2026-04-23/`.

### Added — v2 core (feature-parity in progress)

- **Layered architecture** — kernel (agent loop + event stream + message
  assembly) · providers (one canonical `streamSSE` owns all SSE
  headers, one adapter per provider) · tools (typed registry with
  per-model sanitisation) · context (file-backed memory, JSONL
  sessions, automatic compaction) · extensions (skills, MCP client,
  subagent pool) · safety (policy, approval bus, sandbox adapters) ·
  intelligence (smart router, error classifier, cost tracker).
- **Providers** — NVIDIA NIM, OpenRouter (incl. `inclusionai/ling-2.6-1t:free`),
  OpenAI, Anthropic (native Messages API), Google Gemini, Ollama,
  Fireworks shim. All share one `streamSSE` helper that fixes the NIM
  stutter structurally.
- **Built-in tools** — `fs_read`, `fs_write`, `fs_edit`, `fs_ls` (with
  HUGE_ROOTS guardrail), `shell`, `search_grep`, `search_glob`, `git`,
  `browser` (Playwright, 5 actions), `checkpoint` (save/restore/list/
  delete), `cron` (CRUD — daemon out of scope), `multimodal` (describe/
  transcribe; generate stubs to 0.1.x).
- **Fleet** — port of the headline feature: `runFleet` spawns parallel
  agents each in its own `git worktree`, merges back via 3-way/merge/
  cherry-pick; `runTripleshot` spawns 3 variants + LLM judge. Runs
  in-process (no more `spawn node dirgha ask` subprocess), so tokens
  and events flow through one shared stream.
- **Slash commands** — 20 ported: `/init /keys /models /help /clear
  /login /setup /status /memory /compact /mode /exit /history /resume
  /session /theme /fleet /account /upgrade /config`. Seven stub to the
  CLI equivalent (`login`, `mode`, `theme`, `fleet`, `account`,
  `upgrade`, `session branch`) pending module wiring.
- **Ink TUI** — new renderer at `src_v2/tui/ink/`. Logo · streaming
  transcript · tool boxes · thinking blocks · status bar · input. Not
  yet ported from v1: model picker modal, session picker, help
  overlay, vim mode, paste-collapse, fuzzy `@file` completion.
- **Billing + device auth** — `src_v2/integrations/{device-auth,billing}.ts`
  with preflight quota, usage recording, token storage at
  `~/.dirgha/credentials.json` (mode 0600).
- **Memory unification** — single `KeyedMemoryStore` contract in
  `src_v2/context/memory.ts`, replacing v1's 5 fragmented paths
  (`memory/builtin`, `memory/graph`, `memory/unified`, `embeddings/*`,
  `utils/unified-memory`). FTS5 via better-sqlite3 with graceful
  fallback to substring scan when the native binary isn't available.
- **Parity + eval harness** — scripted streaming / tool-call / unicode
  scenarios with a pluggable mock SSE server; SWE-Bench + Terminal-Bench
  stubs.

### Fixed (structural)

- **NVIDIA NIM streaming stutter** — `providers/http.ts` uses
  `Accept: text/event-stream` for SSE and `application/json` for
  JSON-RPC; `extraHeaders` explicitly rejects overrides on either.
  The class of bug cannot recur.

### Policy

- No source file, comment, identifier, or string literal in `src_v2/`
  references any competing coding-agent CLI by name. Competitor
  architectures are discussed only in internal design docs under
  `docs/dirgha-code/2026-04-23/`.

### Known stubs (track toward 0.2.0)

- `/login`, `/account`, `/upgrade` slash commands need REPL auth wiring.
- `multimodal generate_image` — always returns "use 0.1.x".
- `cron run_now` — marks `lastRunAt` only; scheduler is a daemon.
- Model picker modal, help overlay, vim mode in Ink TUI.
- Slash-commands remaining from v1 (77 more, not urgent).

## 0.1.1 (2026-04-24) — NVIDIA streaming stutter + root-scan guardrail

### Fixed

- **NVIDIA NIM streaming stutter.** `streamSSE` in `src/providers/http.ts`
  now sends `Accept: text/event-stream` by default and `Content-Type:
  application/json` only for the request body. Providers no longer need
  to set `Accept` ad-hoc; `src/providers/nvidia.ts` drops the explicit
  `Accept: application/json` that was overriding the correct SSE
  negotiation on streaming calls. First-byte latency on MiniMax/Kimi on
  NIM drops back to normal; partial/truncated chunks on long responses
  stop.

### Added

- **Root-scan guardrail for `list_files`.** The tool now skips
  `node_modules`, `.git`, `dist`, `.bun`, and other cache/build
  directories during its walk (and all dot-prefixed entries), and
  refuses to brute-walk absurdly large roots (`/`, `/root`, `/home`,
  `/tmp`, `/Users`, `/var`) with a message pointing the model at
  `glob` or `search_files` with a targeted pattern.
- **System-prompt "Search Discipline" block.** Tells the agent to start
  with `glob`/`search_files` instead of `list_files .`, and to read
  `README.md`/`package.json`/`DIRGHA.md` before scanning. Stops the
  "agent starts working immediately scanning all files and folders"
  behavior on large monorepos.

## 0.1.0 (2026-04-24) — public-OSS cut

Output of the six-sprint launch plan (`docs/launch/LAUNCH_PLAN_2026-04-24.md`).
From internal-alpha (4.0/10) to public-OSS quality (~9.5/10) in one
coordinated pass. Highlights below; full breakdown in the launch plan.

### Security

- **Symlink sandbox escape closed** (S1.1). `sandboxPath()` now realpath's the deepest extant ancestor; rejects symlinks that resolve outside the workspace. Covered by a 21-case property test (`src/tools/file.sandbox.test.ts`).
- **Real tool allowlist** (PR #1). Replaced the `isToolAllowed = () => true` stub with a per-trust-level `TOOL_ALLOWLIST`. Tools not on the list for the current trust level return a blocked marker instead of executing.
- **`rm -fr` and `git clean -fd` regex gaps** (S2.1, S2.5) — both now flagged dangerous. Closed with 91-case permission-judge suite and 45-case shell-guard suite.
- **LiteLLM fully stripped** (S1.7). 14 files cleaned; default provider is now `gateway`.
- **`multica` inline references** removed from source comments before first push; prior-art citation in `docs/FLEET.md` kept.

### Added (docs and infra)

- `docs/ARCHITECTURE.md` — directory-level contract for every top-level `src/` dir.
- `docs/USAGE.md` — 10 worked examples.
- `docs/PROVIDERS.md` — 16-provider matrix with env vars, URLs, quirks.
- `docs/SECURITY.md` — technical threat model and sandbox guarantees.
- `docs/launch/LAUNCH_PLAN_2026-04-24.md` — the full six-sprint plan this release executes against.
- `.github/workflows/ci.yml` — Node 20 + 22 matrix, lint/test/build/smoke + experimental-gate leak check.
- `.github/workflows/publish.yml` — on tag push, `npm publish --provenance`.
- `src/experimental/README.md` — graduation checklist for experimental surfaces.
- Root README troubleshooting section.

### Changed

- **Command surface**: 59 → 51 in default `--help`. Experimental commands (`mesh`, `swarm`, `voice`, `dao`, `make`, `bucky`, `join-mesh`) gated behind `DIRGHA_EXPERIMENTAL=1`.
- **Top-level `src/` dirs**: 60 → 54. Removed zero-importer dirs (`recipes`, `business`, `search`, `cost`, `evals`, `styles`).
- **`libp2p`** and 7 `@libp2p/*` submodules moved to `optionalDependencies`. Default install no longer pays the mesh-feature cost.
- **`marked`** aligned to `^15` (matching `marked-terminal@7`'s peer). Fresh `npm ci` works without `--legacy-peer-deps`.
- **`dist/dirgha.mjs.map`** (28.5MB) untracked. Regenerated at build time, not shipped.
- **`@ts-nocheck` count**: 85 → 81. All four files in `src/runtime/` are now type-checked (the isolate sandbox and host-tool registry — type safety here was load-bearing).

### Tests

- **From 456 → 767 passing.** +205 new tests across:
  - `src/permission/judge.test.ts` — 91 cases
  - `src/utils/unified-memory.test.ts` — 22 cases
  - `src/agent/tool-execution.test.ts` — 26 cases
  - `src/tools/file.sandbox.test.ts` — 21 cases
  - `src/tools/shell-guards.spec.ts` — 45 cases
  - `src/providers/normalise.test.ts` — 10 cases
- Pre-existing 6 failures → 5 (S1.7 fixed one shell-template bug as drive-by).

### Fixed

- **`npm ci && npm run build:public` on a fresh clone** (S1.2). Three compound issues — missing `@libp2p/*` externals, unresolved `@dirgha/types` workspace-only import, relative bucky import — all fixed.
- **`dirgha recall <q>`** no longer crashes (S1.4). Sync stub + defensive `Array.isArray` at caller.
- **`/yolo` module was syntactically invalid** (PR #1). ~30 lines of orphaned handler code deleted.
- **`TOOL_ALLOWLIST` TDZ** (PR #1). `WRITE_TOOLS` hoisted above the spread that referenced it.
- **Broken template literal** in `src/tools/shell.ts` error message (S1.7). The `Allowed: Array.from(...)` block was missing its `${...}` wrap.

---

## 0.1.0-pre (2026-04-20) — internal alpha (historical)

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

Adopted industry-standard terms from the multi-agent workspace ecosystem audit (multica, ccpm, claudio, genie, devteam, citadel, maw, agent-worktree):

| Term | Meaning |
|---|---|
| **worktree** | Isolation unit (git worktree) |
| **fleet** | Parallel agents on one goal |
| **subtask** | Parallelizable stream within a fleet |
| **runtime** | Compute environment (local / worktree / SSH — future) |
| **skill** | Reusable capability bundle (CLI-Anything) |
