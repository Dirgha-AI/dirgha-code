<div align="center">

# Dirgha Code

[![npm](https://img.shields.io/npm/v/@dirgha/code?style=flat-square&color=000)](https://www.npmjs.com/package/@dirgha/code)
[![npm downloads](https://img.shields.io/npm/dt/@dirgha/code?style=flat-square&color=000)](https://www.npmjs.com/package/@dirgha/code)
[![CI](https://github.com/Dirgha-AI/dirgha-code/actions/workflows/ci.yml/badge.svg)](https://github.com/Dirgha-AI/dirgha-code/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-FSL--1.1--MIT-d4a373?style=flat-square)](./LICENSE)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A1-c25a4f?style=flat-square)](https://dirgha.ai/contribute)

**Dirgha Code is a source-available CLI coding agent (FSL-1.1-MIT, converts to MIT after two years). It works with 17 model providers on your own keys, or fully offline with Ollama or llama.cpp, and adds parallel agents and persistent memory. One install command.**

</div>

## The Seed: Why the CLI Comes First

Every operating system starts with a kernel. Dirgha Code, the source-available command-line agent, is the kernel of Dirgha AI OS. It is the smallest and easiest piece of the stack to install and change: one install command, runs fully offline, ships under FSL-1.1-MIT (each release converts to MIT two years after it is published).

By design, the CLI is the entry point for every developer — whether you're on a 10 Gbps fiber line or a shared 4G hotspot, in a WeWork in Bengaluru or a basement in Berlin. No browser, no paid account, no telemetry by default. Just `npm install -g @dirgha/code` and a terminal.

[Why a sovereign coding CLI matters](https://github.com/Dirgha-AI/Rama-I-Dirgha-AI-OS/blob/main/WHY_BHARAT_NEEDS_DIRGHA_CLI.md) — latency data, cost structure for independent developers, the layered view of AI sovereignty, and what the CLI does not solve.

## What it is

A terminal coding assistant that reads your codebase, edits files, runs tests, commits, and audits every step. It runs on your keys — or entirely on your machine via llama.cpp / Ollama — with your transcripts staying local until you choose otherwise. When a model rate-limits or times out, the 4-tier failover cascade (user choice → same-family → registry → free fallback) keeps the agent alive without losing context. HTTP streaming stalls are detected and aborted in 30 seconds. Your work doesn't vanish when an API hiccups.

## The five pillars

### Local models — run entirely offline

First-class llama.cpp and Ollama support. The setup wizard auto-probes `localhost:8080` and `localhost:11434`, lists installed models, and sets one as your default — no API key, no telemetry, no per-token cost. Use `llamacpp/<model>` or `ollama/<model>` ids anywhere a hosted model id would go. `dirgha doctor` reports both servers' health alongside the hosted providers. Mix and match: route easy turns to a local model, escalate hard ones to a frontier API in the same session.

### BYOK across 17 providers

Anthropic, OpenAI, Gemini, OpenRouter, NVIDIA NIM, Fireworks, DeepSeek (native), Mistral, Cohere, Cerebras, Together, Perplexity, xAI (Grok), Groq, Z.AI / GLM, plus local Ollama and llama.cpp. Drop multiple keys per provider into a pool — Dirgha rotates with priority + LRU + cooldown when one hits a 429. When a model 4xx/5xxs mid-turn, an inline `[y/n/p=picker]` failover prompt suggests a known-good substitute (via `findFailover` in `prices.ts`) and re-runs the failed turn against it.

The model picker is two-step (gemini-cli style): pick a provider card → pick a model within that provider. The built-in catalogue lists 110 models (`src/intelligence/prices.ts`); `dirgha models refresh` fetches the live model lists from your configured providers.

### Persistent memory that compounds

Four layers, each cheaper to write than the one above and more curated than the one below:

- **Audit log** — append-only JSONL of every event for forensics.
- **Memory** — curated key-value facts loaded into the system prompt at boot.
- **Ledger** — per-scope JSONL of decisions and observations, plus an agent-rewritten digest, searchable by TF-IDF cosine ranking.
- **Knowledge base** — your `docs/` compiled into a wiki via OpenKB + PageIndex. Vectorless, reasoning-based retrieval. The agent reasons over a table of contents instead of re-reading files every turn.

Information flows up. Old context gets distilled, not discarded.

### Parallel agents

`dirgha fleet launch "<goal>"` decomposes the goal into N independent tasks, spawns each in its own git worktree, runs them in parallel, and merges the winners back. `dirgha fleet triple "<goal>"` runs three approaches and lets a judge pick. `dirgha fleet dag "step1..." "step2..." "step3..."` chains agents sequentially with cumulative context propagation — each step builds on the previous one's output. Inside any session, the agent can call the `task` tool to dispatch a fresh sub-agent with its own context budget for a sub-problem — no compaction loss on the parent.

### GitHub — native, not shelled

`dirgha` ships a `github` tool that wraps `gh` CLI: create and list PRs (`pr_create`, `pr_list`), create and list issues (`issue_create`, `issue_list`), inspect repos (`repo_view`). The agent can open a PR in the same turn it finishes a fix — no copy-pasting URLs. Requires `gh` installed and authenticated (`gh auth login`). The `git` tool handles commit / push / status / diff; `github` handles the GitHub layer on top.

### Skills, scanned

SKILL.md packs are portable Markdown agents — share one git URL, anyone can `dirgha skills install <url>`. Every third-party skill is scanned at install AND load time by a heuristic prompt-injection / supply-chain check. Critical findings block; lesser findings show a warning. TypeScript / ESM plugins are the sibling concept — drop a `.mjs` at `~/.dirgha/extensions/<name>/index.mjs` and register tools, slashes, subcommands, or lifecycle hooks in ~20 lines.

## Install

Requires Node.js 22 or later.

```bash
npm install -g @dirgha/code        # or: pnpm add -g @dirgha/code
dirgha setup                       # 3-step wizard: pick provider (local works too) → auth → model
dirgha "say ok in one word"
```

Or skip the wizard and go straight to a key: `export NVIDIA_API_KEY=nvapi-…` (any of the 17 providers, see below).

**Windows users**: See the [Windows installation guide](docs/windows-installation.md) for setup of optional features.

The interactive TUI is `dirgha` with no args. Resume a session with `dirgha resume <id>`. Fan a parallel sub-agent fleet with `dirgha fleet launch "<goal>"`.

### Offline quickstart (local models, no API key)

Dirgha Code talks to local models through their OpenAI-compatible endpoints, so prompts and code stay on your machine. Pick one runtime.

**Ollama** (default endpoint `http://localhost:11434/v1`):

```bash
# install Ollama from https://ollama.com, then:
ollama pull qwen2.5-coder:7b
dirgha -m ollama/qwen2.5-coder:7b "list the files in this folder and summarise them"
```

**llama.cpp** (default endpoint `http://localhost:8080/v1`):

```bash
# build or download llama.cpp from https://github.com/ggml-org/llama.cpp, then:
llama-server -m ./models/qwen2.5-coder-7b-instruct-q4_k_m.gguf --port 8080 --jinja
dirgha -m llamacpp/qwen2.5-coder-7b-instruct "list the files in this folder and summarise them"
```

If llama-server runs on another host or port, set `LLAMACPP_URL` (for example `export LLAMACPP_URL=http://127.0.0.1:9000/v1`).

To make a local model the default, run `dirgha setup` and pick **Local**; the wizard probes both ports and lists installed models. `dirgha doctor` shows whether each local server is reachable. Tool calling depends on the model: small models may answer in plain text instead of calling tools, so start with a coder-tuned model of 7B parameters or more.

## What's in the box

|                       |                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **17 providers**      | anthropic, openai, gemini, openrouter, nvidia, fireworks, deepseek, groq, cerebras, together, mistral, xai, perplexity, cohere, zai, plus local ollama and llamacpp |
| **24 model aliases**  | `opus`, `sonnet`, `haiku`, `gpt5`, `gemini`, `flash`, `kimi`, … resolved before routing (`dirgha models` lists them)                                          |
| **34 built-in tools** | files (`fs_read`, `fs_write`, `fs_edit`, `fs_ls`), `shell`, `git`, `github`, search (`search_grep`, `search_glob`), `browser`, `checkpoint`, `cron`, LSP (`go_to_definition`, `find_references`, `hover_documentation`, `document_symbols`), knowledge (`qmd_search`, `kb_search`, graph tools), media and GPU tools; the `task` sub-agent tool is added per session |
| **31 slash commands** | `/account`, `/clear`, `/compact`, `/cost`, `/fleet`, `/keys`, `/login`, `/memory`, `/mode`, `/models`, `/resume`, `/session`, `/status`, `/theme`, `/upgrade`, … |
| **36 subcommands**    | `ask`, `audit`, `chat`, `doctor`, `keys`, `login`, `models`, `resume`, `setup`, `skills`, `update`, `verify`, … (`dirgha --help`), plus `dirgha fleet`       |
| **4 modes**           | `act` · `plan` (read-only thinking) · `verify` (read-only audit) · `ask` (read-only Q&A)                                                                         |
| **MCP**               | stdio + HTTP/SSE + `bearerProvider` async OAuth rotation                                                                                                         |
| **Source**            | About 54K lines of TypeScript (excluding tests) across 32 top-level modules in `src/`.                                                                           |

## Numbers worth checking

|                                        |                                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Tests                                    | **484 vitest tests** in 41 files (`npm test`) plus **45 offline CLI suites** (`npm run test:cli:offline`, 41 run without network). TypeScript 0 errors, ESLint 0 warnings. CI must pass before a PR merges.                    |
| npm                                      | 21,876 downloads and 127 published versions since April 2026 (npm registry and downloads API, checked 19 Nov 2026).                                                               |
| 17 providers                             | Multi-key BYOK pool with cooldown rotation, 4-tier failover cascade, health scoring with compaction.                                                                                |
| 34 built-in tools                        | Per-tool timeout enforcement. Shell 300s (PTY streaming via `streamOutput`), reads 30s, default 60s.                                                                               |
| Mode enforcement                         | `git`, `shell`, `fs_write`, `fs_edit`, `browser` are write-gated in `plan` / `verify` / `ask` modes at the kernel hook layer — not just prompt nudging.                           |
| **GPU compute**                          | 4 providers (Vast, Akash, Spheron, RunPod), cheapest-auto-select, budget caps, audit log, agent tools, CLI subcommand, web UI at [`dirgha.ai/app/gpu`](https://dirgha.ai/app/gpu) |

## Why this exists

Frontier coding assistants are closed SaaS, charging per-seat, piping your repository through someone else's telemetry. The assumption is that the intelligence must live at the vendor.

The opposite assumption is the right one. Your laptop is the unit of sovereignty. Your keys, your wallet, your session log, your tool executions live on your machine until you choose to hit a network. Providers are swappable. The agent loop's source is public and each release becomes MIT-licensed two years after it ships.

## Documentation

|                         |                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Architecture            | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)                                     |
| Roadmap                 | [`docs/ROADMAP.md`](./docs/ROADMAP.md)                                               |
| Knowledge management    | [`docs/memory/km-architecture.md`](./docs/memory/km-architecture.md)                 |
| Architecture efficiency | [`docs/memory/architecture-efficiency.md`](./docs/memory/architecture-efficiency.md) |
| Skill security          | [`docs/agents/skill-security.md`](./docs/agents/skill-security.md)                   |
| Files & search contract | [`docs/agents/files-and-search.md`](./docs/agents/files-and-search.md)               |
| GPU marketplace         | [`docs/GPU_MARKETPLACE.md`](./docs/GPU_MARKETPLACE.md)                               |
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

We're a small team. We answer issues. We accept PRs from first-time contributors. If something feels off about the project, the docs, or the experience, tell us.

## Related projects

- [**LOKAHI**](https://github.com/Dirgha-AI/lokahi) (Apache-2.0): a gate that checks each MCP tool call against a signed, community-written manifest before it runs. Reference implementation, not yet independently reviewed.
- [**Ahimsa AI**](https://github.com/Dirgha-AI/ahimsa-ai) (MIT): a design-time impact assessment (AIA v1.1) that compiles approved projects into LOKAHI manifests.
- [**Synthetic Humanism**](https://github.com/Dirgha-AI/synthetic-humanism) (MIT): the essays behind LOKAHI and Ahimsa AI, plus a benchmark that runs both against 20 documented AI failures.
- [**Startup Agent Skills**](https://github.com/salikshah/startup-agent-skills) (MIT): SKILL.md packs for startup strategy, growth and positioning, tested against Dirgha Code and other agent CLIs.

## License

[FSL-1.1-MIT](./LICENSE): the Functional Source License, a source-available licence. You can use, modify and redistribute the code for any purpose except offering a competing commercial product. Two years after each release is published, that release converts to the MIT License. FSL is not an OSI-approved open-source licence; see [LICENSING.md](./LICENSING.md) for details.

---

<div align="center">

**Build to last. Code with Dirgha.**

[`@dirgha/code`](https://www.npmjs.com/package/@dirgha/code) · [github.com/Dirgha-AI/dirgha-code](https://github.com/Dirgha-AI/dirgha-code) · [Sponsor](https://dirgha.ai/contribute)

</div>
