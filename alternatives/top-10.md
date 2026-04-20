# AI Coding CLI Landscape — Top 10

Last updated: **2026-04-20**. Not affiliated with any listed project.
See [README.md](./README.md) for contribution rules.

## The list

| # | Tool | Vendor | Stack | License | BYOK? | Stand-out |
|---|---|---|---|---|---|---|
| 1 | **[Claude Code](https://claude.com/claude-code)** | Anthropic | TypeScript (minified npm bundle) | Closed (proprietary, no public source) | Anthropic only | Best pure-coding quality; reference harness most other tools clone |
| 2 | **[Gemini CLI](https://github.com/google-gemini/gemini-cli)** | Google | TypeScript + Ink | Apache 2.0 | Gemini only | First-party free tier via Google auth; 100k+ stars |
| 3 | **[OpenAI Codex CLI](https://github.com/openai/codex)** | OpenAI | Rust (primary) + ratatui; TS predecessor deprecated | Apache 2.0 | OpenAI only | Sandboxed exec; `/side` ephemeral fork; shimmer on in-flight tool cells |
| 4 | **[OpenCode](https://github.com/sst/opencode)** | sst (community — the active fork) | TypeScript server + Rust TUI client | MIT | 75+ providers | Provider-agnostic client/server split; LSP-native; headless mode |
| 5 | **[Cursor CLI](https://cursor.com/install)** | Cursor (Anysphere) | Closed binary (installer) | Closed (no public repo) | Cursor-managed | Runs Composer/Codex models outside the IDE on the same account |
| 6 | **[Aider](https://github.com/Aider-AI/aider)** | Community (Paul Gauthier) | Python | Apache 2.0 | Multi | Auto-commits each LLM edit as a discrete git commit; tree-sitter repo map |
| 7 | **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** | Nous Research | Python + TypeScript adapters | MIT | Multi | DSPy + GEPA self-evolution; runs as a long-running "employee" agent across transports |
| 8 | **[Cline](https://github.com/cline/cline)** | Community | TypeScript (VS Code extension + headless CLI) | Apache 2.0 | Multi | Computer-use browser automation; canonical surface is the IDE extension, CLI is newer |
| 9 | **[CLI-Anything](https://github.com/HKUDS/CLI-Anything)** | HKU Data Science | Python + Click | Apache 2.0 | — (not a coding agent) | Generates agent-native CLIs for GUI apps (Blender, LibreOffice). The SKILL.md spec Dirgha adopted |
| 10 | **[Dirgha Code](https://github.com/dirghaai/dirgha-code)** | Dirgha LLC | TypeScript + Ink + React | FSL-1.1-MIT (→ MIT after 2 years) | 14 providers | Parallel multi-agent fleet in git worktrees; universal `--json`; CLI-Anything compliant |

## How to read this

**"Vendor"** — who maintains the project. Closed-vendor tools (Claude
Code, Cursor CLI) ship as proprietary; the rest are OSI-approved
licenses (Apache 2.0 or MIT).

**"BYOK?"** — can you bring your own API key for a non-vendor model?
Vendor-locked tools (Claude Code, Gemini CLI, Codex, Cursor) require
their own provider.

**"Stack"** — implementation language + TUI framework. Matters for
extensibility, startup time, and install footprint.

## When to pick what

| You want | Pick |
|---|---|
| Best raw coding quality, budget no object | **Claude Code** |
| Free tier + Google ecosystem | **Gemini CLI** |
| Same account as the Cursor editor, but headless | **Cursor CLI** |
| Git-flow first (auto-commit, pair mode) | **Aider** |
| Every provider under one roof + LSP-native | **OpenCode** |
| Provider-agnostic with parallel worktrees | **Dirgha Code** |
| Long-running "employee" agent across Slack/Telegram/CLI | **Hermes Agent** |
| IDE-primary workflow, CLI as secondary | **Cline** (VS Code) |
| Make an existing GUI app agent-usable | **CLI-Anything** |
| Sandboxed Rust speed | **OpenAI Codex CLI** |

## Honest positioning for Dirgha Code

**Where Dirgha Code is currently stronger:**
- Parallel fleet execution (no other CLI decomposes + spawns + worktrees in one command)
- Universal `--json` output (CLI-Anything-compliant on every command, not just a `/json` mode)
- Provider breadth BYOK-first (14 providers, auto-failover chains)
- Open-source, no telemetry, local-first

**Where Dirgha Code is currently weaker:**
- Raw coding quality ceiling — limited by the model we route to, not the harness
- Smaller community than Aider or OpenCode
- No first-party IDE plugin (yet)
- Single-maintainer-founder risk (we're new)

**Why we built this anyway:**
Every tool on this list except Dirgha Code is missing at least one of:
(a) BYOK-first sovereignty, (b) parallel worktree fleet, (c) universal
`--json` compliance, (d) MIT-adjacent open-source licensing. We wanted
all four in one tool.

## See also

- [CREDITS.md](../CREDITS.md) — patterns we borrowed, with attribution
- [README.md](../README.md) — what Dirgha Code is + how to install
- [docs/](../docs/) — getting started, BYOK, fleet, commands
