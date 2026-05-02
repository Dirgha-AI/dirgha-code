<div align="center">

# Dirgha Code

[![npm](https://img.shields.io/npm/v/@dirgha/code?style=flat-square&color=000)](https://www.npmjs.com/package/@dirgha/code)
[![License](https://img.shields.io/badge/license-FSL--1.1--MIT-d4a373?style=flat-square)](./LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A1-c25a4f?style=flat-square)](https://dirgha.ai/contribute)

**Dirgha Code is the open-source CLI coding agent — 17 providers, BYOK, offline-capable, parallel agents, persistent memory, security-audited. One install command. No vendor lock-in.**

</div>

## The Seed: Why the CLI Comes First

Every operating system starts with a kernel. Dirgha Code — the open-source command-line agent — is the kernel of Dirgha AI OS. It is the smallest, most installable, most hackable piece of the stack: one install command, runs fully offline, ships under FSL → MIT.

By design, the CLI is the entry point for every developer — whether you're on a 10 Gbps fiber line or a shared 4G hotspot, in a WeWork in Bengaluru or a basement in Berlin. No browser, no paid account, no telemetry by default. Just `npm install -g @dirgha/code` and a terminal.

[Why a sovereign coding CLI matters](https://github.com/Dirgha-AI/Rama-I-Dirgha-AI-OS/blob/main/WHY_BHARAT_NEEDS_DIRGHA_CLI.md) — latency data, cost structure for independent developers, the layered view of AI sovereignty, and what the CLI does not solve.

## What it is

A terminal coding assistant that reads your codebase, edits files, runs tests, commits, and audits every step. It runs on your keys — or entirely on your machine via llama.cpp / Ollama — with your transcripts staying local until you choose otherwise. When a model rate-limits or times out, the 4-tier failover cascade (user choice → same-family → registry → free fallback) keeps the agent alive without losing context. HTTP streaming stalls are detected and aborted in 30 seconds. Your work doesn't vanish when an API hiccups.

## The five pillars

### Local models — run entirely offline

First-class llama.cpp and Ollama support. The setup wizard auto-probes `localhost:8080` and `localhost:11434`, lists installed models, and sets one as your default — no API key, no telemetry, no per-token cost. Use `llamacpp/<model>` or `ollama/<model>` ids anywhere a hosted model id would go. `dirgha doctor` reports both servers' health alongside the hosted providers. Mix and match: route easy turns to a local model, escalate hard ones to a frontier API in the same session.

### BYOK across 17 providers

Anthropic, OpenAI, Gemini, OpenRouter, NVIDIA NIM, Fireworks, DeepSeek (native), Mistral, Cohere, Cerebras, Together, Perplexity, xAI (Grok), Groq, Z.AI / GLM, plus local Ollama and llama.cpp. Drop multiple keys per provider into a pool — Dirgha rotates with priority + LRU + cooldown when one hits a 429. When a model 4xx/5xxs mid-turn, an inline `[y/n/p=picker]` failover prompt suggests a known-good substitute (via `findFailover` in `prices.ts`) and re-runs the failed turn against it. Other tools just dead-end.

The model picker is two-step (gemini-cli style): pick a provider card → pick a model within that provider. 104 models in the catalogue, refreshed against the live OpenRouter registry on every release.

### Persistent memory that compounds

Four layers, each cheaper to write than the one above and more curated than the one below:

- **Audit log** — append-only JSONL of every event for forensics.
- **Memory** — curated key-value facts loaded into the system prompt at boot.
- **Ledger** — per-scope JSONL of decisions and observations, plus an agent-rewritten digest, searchable by TF-IDF cosine ranking.
- **Knowledge base** — your `docs/` compiled into a wiki via OpenKB + PageIndex. Vectorless, reasoning-based retrieval. The agent reasons over a table of contents instead of re-reading files every turn.

Information flows up. Old context gets distilled, not discarded.

### Parallel agents

`dirgha fleet launch "<goal>"` decomposes the goal into N independent tasks, spawns each in its own git worktree, runs them in parallel, and merges the winners back. `dirgha fleet triple "<goal>"` runs three approaches and lets a judge pick. `dirgha fleet dag "step1..." "step2..." "step3..."` chains agents sequentially with cumulative context propagation — each step builds on the previous one's output. Inside any session, the agent can call the `task` tool to dispatch a fresh sub-agent with its own context budget for a sub-problem — no compaction loss on the parent.

### Skills, scanned

SKILL.md packs are portable Markdown agents — share one git URL, anyone can `dirgha skills install <url>`. Every third-party skill is scanned at install AND load time by a heuristic prompt-injection / supply-chain check. Critical findings block. Today: 112 installed across 4 packs, 74 allow · 36 warn · 2 block. TypeScript / ESM plugins are the sibling concept — drop a `.mjs` at `~/.dirgha/extensions/<name>/index.mjs` and register tools, slashes, subcommands, or lifecycle hooks in ~20 lines.

## Install

```bash
npm install -g @dirgha/code        # or: pnpm add -g @dirgha/code
dirgha setup                       # 3-step wizard: pick provider (local works too) → auth → model
dirgha "say ok in one word"
```

Or skip the wizard and go straight to a key: `export NVIDIA_API_KEY=nvapi-…` (any of the 17 providers — see below).
For 100% local: install [Ollama](https://ollama.com) or [llama.cpp](https://github.com/ggerganov/llama.cpp), then run `dirgha setup` and pick **Local**.

The interactive TUI is `dirgha` with no args. Resume a session with `dirgha resume <id>`. Fan a parallel sub-agent fleet with `dirgha fleet launch "<goal>"`.

## What's in the box

|                       |                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **17 providers**      | anthropic, openai, gemini, openrouter, nvidia, fireworks, deepseek, groq, cerebras, together, deepinfra, mistral, xai, perplexity, cohere, kimi, zai             |
| **34 model aliases**  | `kimi`, `opus`, `sonnet`, `haiku`, `gemini`, `flash`, `deepseek`, `llama`, `ling`, `hy3`, … resolved before routing                                              |
| **12 built-in tools** | `fs_read`, `fs_write`, `fs_edit`, `fs_ls`, `shell`, `search_grep`, `search_glob`, `git`, `browser`, `checkpoint`, `cron`, `task`                                 |
| **20 slash commands** | `/account`, `/clear`, `/compact`, `/cost`, `/fleet`, `/keys`, `/login`, `/memory`, `/mode`, `/models`, `/resume`, `/session`, `/status`, `/theme`, `/upgrade`, … |
| **18 subcommands**    | `audit`, `audit-codebase`, `cost`, `kb`, `keys`, `ledger`, `login`, `models`, `resume`, `skills`, `undo`, `update`, `verify`, …                                  |
| **4 modes**           | `act` · `plan` (read-only thinking) · `verify` (read-only audit) · `ask` (read-only Q&A)                                                                         |
| **MCP**               | stdio + HTTP/SSE + `bearerProvider` async OAuth rotation                                                                                                         |
| **Source**            | ~14.5 K LOC across 23 modules in `src/`. Hard rule: every src file ≤ 200 lines.                                                                                  |

## Numbers worth checking

|                                        |                                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Tests                                    | **104/104** in ~8 s. TS 0 errors, ESLint 0 warnings. CI green is a precondition for any PR.                                                                                        |
| 17 providers                             | Multi-key BYOK pool with cooldown rotation, 4-tier failover cascade, health scoring with compaction.                                                                                |
| 12 built-in tools                        | Per-tool timeout enforcement. Shell 300s, reads 30s, default 60s.                                                                                                                  |
| 16 vulnerability classes fixed in v1.18  | Path traversal (memory/session/scaffold), API key overlay isolation, NaN cost poisoning, LSP timer leak, model routing mismatch, web URL routing, stale-cache fallback, and more. |

## Why this exists

Frontier coding assistants are closed SaaS, charging per-seat, piping your repository through someone else's telemetry. The assumption is that the intelligence must live at the vendor.

The opposite assumption is the right one. Your laptop is the unit of sovereignty. Your keys, your wallet, your session log, your tool executions live on your machine until you choose to hit a network. Providers are swappable. The agent loop is open source.

## Documentation

|                         |                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Architecture            | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)                                     |
| Roadmap                 | [`docs/ROADMAP.md`](./docs/ROADMAP.md)                                               |
| Knowledge management    | [`docs/memory/km-architecture.md`](./docs/memory/km-architecture.md)                 |
| Architecture efficiency | [`docs/memory/architecture-efficiency.md`](./docs/memory/architecture-efficiency.md) |
| Skill security          | [`docs/agents/skill-security.md`](./docs/agents/skill-security.md)                   |
| Files & search contract | [`docs/agents/files-and-search.md`](./docs/agents/files-and-search.md)               |
| Per-release notes       | [`changelog/`](./changelog)                                                          |

## Contributing

We'd genuinely love your help.

The fastest path is to **try it on a real project**, then tell us what worked and what didn't. Open an issue at [github.com/Dirgha-AI/dirgha-code/issues](https://github.com/Dirgha-AI/dirgha-code/issues) — bugs, feature ideas, "this confused me," "this surprised me in a good way," all welcome. There's no bug too small. There's no question too basic.

A few specific ways to plug in:

- **Try it.** `npm i -g @dirgha/code`. Run it on something you actually care about. The free-tier endpoints on OpenRouter and NVIDIA work fine for most coding tasks.
- **File issues.** Anything that doesn't match the README, anything that crashes, anything that wastes your tokens. We read everything.
- **Suggest providers.** If your favourite provider isn't in the 17 we support, open an issue and tell us which one + the env var. Most are a single config-blob diff.
- **Write a skill.** SKILL.md packs work across compatible agent CLIs. Publish a git repo, share the URL, anyone can `dirgha skills install <url>`.
- **Write a plugin.** TypeScript extensions API takes ~20 lines for a real tool. We're keen to feature good ones — drop a link.
- **Send a PR.** Every PR adds a `.changeset/<random-name>.md` describing what changed and at what semver tier. Tests must stay green: `npm run test:cli:offline`.

We're a small team. We answer issues. We accept PRs from first-time contributors. If something feels off about the project, the docs, or the experience — tell us.

## License

[FSL-1.1-MIT](./LICENSE) — Functional Source License with a 2-year sunset to MIT.

---

<div align="center">

**Build to last. Code with Dirgha.**

[`@dirgha/code`](https://www.npmjs.com/package/@dirgha/code) · [github.com/Dirgha-AI/dirgha-code](https://github.com/Dirgha-AI/dirgha-code) · [Sponsor](https://dirgha.ai/contribute)

</div>
