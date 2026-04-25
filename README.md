<div align="center">

# Dirgha Code

[![npm](https://img.shields.io/npm/v/@dirgha/code?style=flat-square&color=000)](https://www.npmjs.com/package/@dirgha/code)
[![License](https://img.shields.io/badge/license-FSL--1.1--MIT-d4a373?style=flat-square)](./LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A1-c25a4f?style=flat-square)](https://dirgha.ai/contribute)

**Codes across 17 providers with failover.**
A coding agent that doesn't blink when a model dies.

</div>

```text
◈ 1.4.0 · openrouter/anthropic/claude-haiku-4.5
─────────────────────────────────────────────────────────
❯ implement log-histo per SPEC.md and run the tests
  ∇ thinking…

  ∴ fs_read     SPEC.md
  ⊕ fs_write    log-histo.mjs       (2.7K)
  ⊕ fs_write    log-histo.test.mjs  (5.1K)
  ∂ shell       node --test         9/9 passed · 0.4s
  ≡ git_commit  feat: log-histo + tests

  Done. CLI buckets JSONL by status, emits p50/p95 per bucket.
```

## What it does

Reads your codebase, edits files, runs tests, commits, and audits every step. Bring your own keys across 17 providers — when a model rate-limits or times out, the loop swaps to the next-priority key in your pool and resumes from the partial transcript. Your work doesn't vanish when an API hiccups.

## Five things you don't get from other coding agents

- **Multi-key BYOK with cooldown rotation.** When one key hits a 429, Dirgha rotates to the next in the pool. Other tools restart.
- **Mid-session failover that resumes from where it left off.** When a model dies mid-turn, Dirgha swaps to the registered backup and continues with the partial transcript intact.
- **Every third-party skill is scanned before it runs.** Heuristic prompt-injection / supply-chain check at install AND load. Critical findings block the install. We caught 2 critical issues in 112 real installed skills today.
- **Compiled knowledge base of your repo.** OpenKB + PageIndex builds a wiki of your project's docs, decisions, and ledger. Vectorless reasoning-based RAG — the agent reasons over a structured index instead of re-reading files every turn.
- **TypeScript / ESM plugins in 20 lines.** Drop a `.mjs` at `~/.dirgha/extensions/<name>/index.mjs` and register tools, slashes, subcommands, or lifecycle hooks. Ship as an npm package.

## Install

```bash
npm install -g @dirgha/code        # or: pnpm add -g @dirgha/code
export OPENROUTER_API_KEY=sk-or-…  # or NVIDIA_API_KEY, ANTHROPIC_API_KEY, …
dirgha "say ok in one word" -m haiku
```

The interactive TUI is `dirgha` with no args. Resume a session with `dirgha resume <id>`. Fan a parallel sub-agent fleet with `dirgha fleet launch "<goal>"`.

## What's in the box

| | |
|---|---|
| **17 providers** | anthropic, openai, gemini, openrouter, nvidia, fireworks, deepseek, groq, cerebras, together, deepinfra, mistral, xai, perplexity, cohere, kimi, zai |
| **34 model aliases** | `kimi`, `opus`, `sonnet`, `haiku`, `gemini`, `flash`, `deepseek`, `llama`, `ling`, `hy3`, … resolved before routing |
| **12 built-in tools** | `fs_read`, `fs_write`, `fs_edit`, `fs_ls`, `shell`, `search_grep`, `search_glob`, `git`, `browser`, `checkpoint`, `cron`, `task` |
| **20 slash commands** | `/account`, `/clear`, `/compact`, `/cost`, `/fleet`, `/keys`, `/login`, `/memory`, `/mode`, `/models`, `/resume`, `/session`, `/status`, `/theme`, `/upgrade`, … |
| **18 subcommands** | `audit`, `audit-codebase`, `cost`, `kb`, `keys`, `ledger`, `login`, `models`, `resume`, `skills`, `undo`, `update`, `verify`, … |
| **4 modes** | `act` · `plan` (read-only thinking) · `verify` (read-only audit) · `ask` (read-only Q&A) |
| **Fleet + `task`** | parallel sub-agents in git worktrees, plus dynamic dispatch from inside any session |
| **MCP** | stdio + HTTP/SSE + `bearerProvider` async OAuth rotation |
| **Plugins** | TypeScript / ESM extensions API at `~/.dirgha/extensions/<name>/` |
| **Knowledge base** | compiled wiki via OpenKB + PageIndex; vectorless reasoning-based retrieval |
| **Skill safety** | heuristic prompt-injection / supply-chain scanner at install + load |

## Numbers worth checking

| | |
|---|---|
| Tests | **40/40** offline in ~16 s. CI green is a precondition for any PR. |
| Parity | **9.82 / 10** mean across 22 capability dimensions scored against the leading reference CLIs. Sum-of-gaps = 0. Every closure cites a code path AND a runnable test. |
| Source | **~14.5 K LOC** across 23 modules in `src_v2/`. Hard rule: every src file ≤ 200 lines. |
| Skill audit | **112 installed** today across 4 packs. **74 allow · 36 warn · 2 block** by the heuristic scanner at the time of writing. |

## Why this exists

Frontier coding assistants are closed SaaS, charging per-seat, piping your repository through someone else's telemetry. The assumption is that the intelligence must live at the vendor.

The opposite assumption is the right one. Your laptop is the unit of sovereignty. Your keys, your wallet, your session log, your tool executions live on your machine until you choose to hit a network. Providers are swappable. The agent loop is open source.

## Documentation

| | |
|---|---|
| Architecture | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| Roadmap | [`docs/ROADMAP.md`](./docs/ROADMAP.md) |
| Knowledge management | [`docs/memory/km-architecture.md`](./docs/memory/km-architecture.md) |
| Architecture efficiency | [`docs/memory/architecture-efficiency.md`](./docs/memory/architecture-efficiency.md) |
| Skill security | [`docs/agents/skill-security.md`](./docs/agents/skill-security.md) |
| Files & search contract | [`docs/agents/files-and-search.md`](./docs/agents/files-and-search.md) |
| Parity scoreboard | [`docs/parity/CLI_PARITY_MATRIX.md`](./docs/parity/CLI_PARITY_MATRIX.md) |
| Design system | [`DESIGN.md`](./DESIGN.md) |
| Marketing brief | [`promo/MARKETING-BRIEF.md`](./promo/MARKETING-BRIEF.md) |
| Per-release notes | [`changelog/`](./changelog) |

## Contributing

Read [`docs/parity/CLI_PARITY_MATRIX.md`](./docs/parity/CLI_PARITY_MATRIX.md) before adding code — the highest-gap row is the most important work. Every PR adds a `.changeset/<random-name>.md` describing what changed and at what semver tier.

Customer-facing text follows the principles in [`promo/MARKETING-BRIEF.md`](./promo/MARKETING-BRIEF.md). Verb-led, specific numbers, concrete capability moments. No internal data-flow language.

## License

[FSL-1.1-MIT](./LICENSE) — Functional Source License with a 2-year sunset to MIT.

---

<div align="center">

**Build to last. Code with Dirgha.**

[`@dirgha/code`](https://www.npmjs.com/package/@dirgha/code) · [github.com/Dirgha-AI/dirgha-code](https://github.com/Dirgha-AI/dirgha-code) · [Sponsor](https://dirgha.ai/contribute)

</div>
