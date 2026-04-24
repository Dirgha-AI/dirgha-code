# Dirgha CLI — Changelog

Versioning: **semver 0.x** during rapid iteration. Breaking → `0.2.0`. Patches → `0.1.1`, `0.1.2`, … First stable release will be `1.0.0`.

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
