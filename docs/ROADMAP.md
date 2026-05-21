# dirgha-cli — Roadmap

The shipped state and the binding contract for what comes next.

## Shipped (v1.42.14)

- ✓ Multi-provider agent loop: 17 providers, 300+ models, BYOK pool with priority + LRU + cooldown
- ✓ 4-tier failover cascade: user → same-family → registry → free fallback; mid-session resume from partial transcript
- ✓ Soul: short Markdown persona at `~/.dirgha/soul.md` with 4 KB-capped loader
- ✓ Ink TUI: alternate buffer, virtualized transcript, Static committed history, flush throttle, React.memo, spinner sync, paste collapse, vim paste fallback, pinnedEndIdx scroll
- ✓ Streaming markdown renderer with syntax highlighting
- ✓ Sandbox mode: bubblewrap (Linux), seatbelt (macOS), noop fallback; auto/strict/off modes
- ✓ Env sanitization: `safeEnvironment()` filters API keys from all spawned child processes
- ✓ Tool approval bus with per-tool requiresApproval; YOLO mode bypass
- ✓ 30+ built-in tools: fs_read/write/edit, shell (with sandbox routing), search_grep, search_glob, git, github, browser, checkpoint, cron, task, rtk, MCP, GPU compute, image/audio/video gen
- ✓ 20 slash commands, 18 subcommands, 4 modes (act/plan/verify/ask)
- ✓ MCP support: stdio + HTTP/SSE transports, async bearerProvider for OAuth token rotation
- ✓ Task system: persistent ~/.dirgha/tasks.json with TUI panel
- ✓ Fleet: parallel git-worktree sub-agents + DAG-chained sequential agents
- ✓ Sub-agents: bounded pool (max 3 concurrent), provider routing, error propagation
- ✓ Session persistence: append-only JSONL, resume, undo, checkpoint save/restore
- ✓ Ledger with TF-IDF cosine search
- ✓ Audit log with kinds tally, cost tracking per model
- ✓ Compaction: auto-compact on context overflow with telemetry banner
- ✓ Workspace `git_state` injection (interactive sessions only)
- ✓ LSP integration: go-to-definition, find-references, hover, document-symbols
- ✓ Extensions API: registerTool/registerSlash/registerSubcommand/on(event) with isolated load failures
- ✓ Self-update with permission: `dirgha update --check` polls npm, `--yes` installs after confirmation
- ✓ Self-fetching catalogue: `dirgha models refresh` parallel `/v1/models` fetch + 24h cache
- ✓ Skill scanner: blocks skills with URL exfiltration, suspicious require/import, shell injection
- ✓ Device OAuth: 30-day token, polls /api/auth/device
- ✓ 472 tests passing (40/40 files), TypeScript 0 errors

## In flight (Sprint A–C, May 2026)

See `docs/sprints/2026-05-03-post-audit-sprints.md` for full task listings.

- **Sprint A — Code health (4h)**: fix orchestra env bypass, stabilize test baseline, audit stale TODOs, update roadmap.
- **Sprint B — Gemini parity (12h)**: native markdown stack (parser, inline, colorizer, tables), tool group rendering (connected borders), live elapsed timer, model-switch-on-failure prompt.
- **Sprint C — Launch readiness (3h)**: AGENTS.md support (drop-in Claude Code replacement), README rewrite with hero + badges + feature grid, Homebrew formula, CI badge.

## On deck

- **Pi-package npm marketplace** — `dirgha install npm:@foo/dirgha-pack` and `dirgha install git:github.com/user/repo` for full packages bundling extensions + skills + prompts + themes.
- **OAuth flows for Anthropic Pro / ChatGPT Plus / Copilot** — needs maintained client_ids per provider.
- **Web dashboard** — live HTML view of audit + cost + ledger.
- **Theme token upgrade** — semantic tokens replacing flat Palette; 11 baked-in themes from Gemini CLI's Apache-2.0 source.
- **Provider extensibility skill** — `/provider add <name>` slash command with 6-step recipe.
- **Sub-agent orchestration patterns** — consensus voting, divide-and-conquer beyond current fleet/DAG shapes.

## Constraints

- Every src file ≤ 200 lines.
- Every parity-matrix row closure cites a code path and a test.
- Every sprint ends with `npx vitest run --dir src` green (currently 472/472).
- Soul and tone are not changed without explicit user request.
- No competitor names in code comments, file content, or stdout/stderr messages.

## How a fresh contributor picks up the work

1. Read `docs/ARCHITECTURE.md` for the kernel + provider model.
2. Read `docs/cli/index/index.md` for the full feature index.
3. Run `npx vitest run --dir src` to confirm the green baseline (472 passing).
4. Write or extend a test before changing code.
5. Open an issue or PR with the proposal.
