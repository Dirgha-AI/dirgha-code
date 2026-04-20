# AI Coding CLI Landscape — Top 10

Last updated: **2026-04-20**. Not affiliated with any listed project.
See [README.md](./README.md) for contribution rules.

## The list

| # | Tool | Vendor | Stack | License | BYOK? | Stand-out |
|---|---|---|---|---|---|---|
| 1 | **[Claude Code](https://claude.com/claude-code)** | Anthropic | TS + Ink | Closed / commercial SaaS | Anthropic only | Best pure-coding quality because it runs on Anthropic's best model |
| 2 | **[Gemini CLI](https://github.com/google-gemini/gemini-cli)** | Google | TS + Ink | Apache 2.0 | Gemini only (free tier via Google account) | Generous free tier; sanctioned integration with Google ecosystem |
| 3 | **[OpenAI Codex CLI](https://github.com/openai/codex)** | OpenAI | Rust + ratatui | Apache 2.0 | OpenAI only | Rewritten from TS+Ink to Rust+ratatui; shimmer rendering, multi-agent `/side` fork |
| 4 | **[OpenCode](https://github.com/opencode-ai/opencode)** | Community | Go + Bubbletea | MIT | 75+ providers | Most providers; community-first, sanest license |
| 5 | **[Aider](https://github.com/Aider-AI/aider)** | Paul Gauthier / community | Python | Apache 2.0 | Anthropic, OpenAI, others | Deepest git integration; pair-programming flow with auto-commits |
| 6 | **[Hermes Agent](https://github.com/nousresearch/hermes-agent)** | Nous Research | Python + Textual | Open source | Multi | Multi-transport (CLI + Telegram + Slack + WhatsApp) from one gateway; persona-driven |
| 7 | **[Cline](https://github.com/cline/cline)** | Community | TypeScript (VS Code) | Apache 2.0 | Anthropic, OpenAI | VS Code-native; CLI secondary. If you live in VS Code, this fits |
| 8 | **[CLI-Anything](https://github.com/HKUDS/CLI-Anything)** | HKU Data Science | Python + click | MIT | — (not a coding agent itself) | Makes any software agent-native via SKILL.md; the specification Dirgha adopted |
| 9 | **[Dirgha Code](https://github.com/dirghaai/dirgha-code)** | Dirgha LLC | TS + Ink | FSL-1.1-MIT | 14 providers | Parallel multi-agent fleet in git worktrees; universal `--json` |
| 10 | **[Continue.dev](https://github.com/continuedev/continue)** | Continue Inc. | TS (VS Code + JetBrains) | Apache 2.0 | 20+ providers | Premier IDE plugin ecosystem; CLI is nascent |

## How to read this

**"Vendor"** — who maintains the project. Commercial = paid subscription default. Community = open governance.

**"BYOK?"** — can you bring your own API key for a non-vendor model?
Closed-vendor tools (Claude Code, Gemini CLI, Codex) typically require their own provider.

**"Stack"** — implementation language + TUI framework. Matters for
extensibility, startup time, and install footprint.

## When to pick what

| You want | Pick |
|---|---|
| Best raw coding quality, budget no object | **Claude Code** |
| Free tier + Google ecosystem | **Gemini CLI** |
| IDE-integrated pair programming | **Cline** or **Continue** |
| Git-flow first (auto-commit, pair mode) | **Aider** |
| Every provider under one roof | **OpenCode** or **Dirgha Code** |
| Multi-transport (Slack/Telegram/CLI as one persona) | **Hermes Agent** |
| Make a specific piece of software agent-native | **CLI-Anything** |
| Parallel multi-agent in worktrees (one-shot refactors) | **Dirgha Code** (this repo) |
| Closed-source Rust speed | **OpenAI Codex CLI** |

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
