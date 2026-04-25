# Dirgha CLI — TUI Parity Roadmap

Synthesized from research on: **OpenAI Codex** (Rust+ratatui), **Hermes** (Textual), **agent-worktree**, **multica**, **coder/mux**, **ccpm**, **claudio**, **devteam**, **citadel**, **genie**, **shogun**.

## Emerging Standard Terminology

| Term | Meaning | Winner across repos |
|---|---|---|
| **worktree** | Isolation unit (git worktree) | universal |
| **workspace** | User-facing container | multica, mux |
| **runtime** | Compute env (Local / Worktree / SSH) | mux, multica |
| **fleet** | Parallel agents on one goal | citadel, genie, devteam |
| **skill** | Reusable capability bundle | multica, ccpm, citadel, agentskills.io |
| **campaign / wish** | Resumable goal | citadel, genie |

"Swarm", "lane", "pool", "sprint" are rare. **Replace or alias to standard terms.**

## P0 — Shipped this session

- [x] **Paste-collapse** (Hermes) — user messages >10 lines or >800 chars collapse to `[paste: N chars · M lines]`
- [x] **Width-constrained Box** (defensive) — prevents ink `wrap="wrap"` miscalculation on long pastes
- [x] **Tool-output truncation** in `ToolItem` — results capped at 40 chars inline (Codex pattern)
- [x] **Chronological stream order** — events render in interleaved tool↔text order, not grouped
- [x] **onToolResult wired** — tool cells complete properly (no more piling "running…")
- [x] **Universal `--json` flag** on every command (CLI-Anything compliance)
- [x] **Auto-SKILL.md** on build via `postbuild` hook (56 commands documented)
- [x] **`dirgha hub` wired** (was falling through to TUI)

## P1 — Shipped this session

- [x] **Paste-burst detector** (Codex pattern) — `src/tui/components/InputHooks.ts` coalesces rapid keystrokes <8ms apart into a single paste buffer. Embedded `\n` in a burst are text, not submit.
- [x] **Shimmer animation for in-flight tool cells** — `src/tui/components/stream/ToolItem.tsx` now cycles `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` on active tools with elapsed-time display.
- [x] **Modal `/help` overlay** — `src/tui/components/HelpOverlay.tsx`. Type to filter, ↑↓ to scroll, q/Esc to close. Commands grouped by category.
- [x] **`/side` ephemeral fork** — `src/repl/slash/side.ts`. Runs a prompt as an isolated `spawn_agent` sub-turn; does NOT pollute main history.
- [x] **Parallel multi-agent in worktrees** — `src/fleet/` module with 6 files. `dirgha fleet launch <goal>` decomposes + spawns in parallel git worktrees.
- [x] **FleetPanel TUI dashboard** — `src/tui/components/FleetPanel.tsx`. Live per-agent rows with spinner, branch name, elapsed. Auto-subscribes to `fleetEvents`.
- [x] **TripleShot + judge** — `dirgha fleet triple <goal>`. 3 parallel variants (conservative/balanced/bold); judge model picks winner; optional `--auto-merge`.
- [x] **Transient-commit 3-way apply-back** — `src/fleet/apply-back.ts`. `dirgha fleet merge <agent-id>` commits inside worktree → `git apply --3way` back as unstaged.
- [x] **Fleet commands in SUBCOMMANDS + SKILL.md** — `dirgha fleet --help` routes to commander, not TUI.

## P2 — Next

### `/verbose` cycle (Hermes pattern)
off → new → all → verbose instead of today's boolean toggle.

### Codex-style `format_duration` everywhere
`5.2s`, `1m 12s` — matches ToolItem elapsed; extend to FleetPanel rows.

### Streaming hysteresis
Codex has a 120fps commit tick with Smooth/CatchUp hysteresis. Ink doesn't need that framerate; 30–60fps equivalent would smooth character-by-character flicker on fast models.

### Bolder `/orchestrate` → `/fleet plan` alias
Orchestrate is the sequential 3-phase pipeline. Fleet plan is the parallel variant. Route `/orchestrate --parallel` → fleet launch.

## P2 — Polish

- Codex `format_duration` on tool cells (`5.2s`, `1m 12s`)
- Tool output cap to 5 lines + "ctrl+t for transcript" escape hatch
- Newline-gated streaming with hysteresis (prevents flicker on fast tokens)
- `/compact` cycle (existing `/compact` command but with tier display)
- `/init` → writes `AGENTS.md` in project root (Codex convention)
- File-mention picker (`@file` — already exists, enhance with fuzzy)

## What NOT to copy

From Codex: their 50+ slash commands include many config dialogs (`/title`, `/statusline`, `/theme`, `/settings`, `/personality`) that bloat the popup. Keep Dirgha at ~25 user-facing slash commands.

From Codex: `legacy_core` shim — they're mid-migration from Ink/React to Rust+ratatui. We're on Ink. Don't port pre-migration patterns.

From Hermes: Python-subprocess coupling — their TUI is a Python subprocess. Dirgha stays pure TS; keep the Node runtime single.

From multi-agent landscape: "Swarm" and "Sprint" terminology — standard is **fleet** (parallel set) and **campaign/wish** (resumable goal). Dirgha's `sprint` command engine should alias to `campaign` for external discovery.

## References

- OpenAI Codex (Rust): https://github.com/openai/codex — see `codex-rs/tui/`
- Hermes Agent: https://github.com/nousresearch/hermes-agent
- agent-worktree: https://github.com/nekocode/agent-worktree (snap-mode lifecycle)
- multica: https://github.com/multica-ai/multica (Runtime abstraction, board-based)
- coder/mux: https://github.com/coder/mux (three-runtime UI)
- ccpm: https://github.com/automazeio/ccpm (stream decomposition + GitHub Issues state)
- claudio: https://github.com/Iron-Ham/claudio (TripleShot, UltraPlan)
- devteam: https://github.com/agent-era/devteam (Ink TUI with diff + comment reinjection)
- citadel: https://github.com/SethGammon/Citadel (4-tier intent router, Fleet)
- genie: https://github.com/automagik-dev/genie (wish→plan→work, 10-critic)
- maw: https://github.com/boxabirds/maw (transient-commit 3-way apply-back)
