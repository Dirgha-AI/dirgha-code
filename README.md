<div align="center">

# `dīrgha`

A terminal coding agent. Free compute, full agency. Bring your own key. Or don't.

[![npm](https://img.shields.io/npm/v/@dirgha/code?style=flat-square&color=000)](https://www.npmjs.com/package/@dirgha/code)
[![License](https://img.shields.io/badge/license-FSL--1.1--MIT-d4a373?style=flat-square)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-40%2F40-7c8b7e?style=flat-square)](./scripts/qa-app)

</div>

```text
◈ dīrgha · 1.4.0 · openrouter/tencent/hy3-preview:free
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

## Install

```bash
npm install -g @dirgha/code        # or: pnpm add -g @dirgha/code
export OPENROUTER_API_KEY=sk-or-…  # or NVIDIA_API_KEY, ANTHROPIC_API_KEY, …
dirgha "say ok in one word" -m hy3
```

That's the whole onboarding. Drop into the interactive TUI with `dirgha`, resume a session with `dirgha resume <id>`, or fan a parallel sub-agent fleet with `dirgha fleet launch "<goal>"`.

## What it is

A single binary that writes code, runs tests, commits, fails over silently when a model dies, and audits every step to disk. No Electron, no telemetry, no cloud lock-in if you BYOK. Free-tier first — the same machinery runs on free OpenRouter models (`hy3`, `ling`) and on Claude / GPT / Gemini.

The agent loop is open source. Your laptop holds the keys, the session log, and the audit trail. Providers are swappable.

## Capabilities

| | |
|---|---|
| **17 providers** | anthropic, openai, gemini, openrouter, nvidia, fireworks, deepseek, groq, cerebras, together, deepinfra, mistral, xai, perplexity, cohere, kimi, zai |
| **34 model aliases** | `kimi`, `opus`, `sonnet`, `haiku`, `gemini`, `flash`, `deepseek`, `llama`, `ling`, `hy3`, … resolved before routing |
| **Multi-key BYOK pool** | priority + LRU + cooldown rotation; atomic file lock; mode 0600 |
| **12 built-in tools** | `fs_read`, `fs_write`, `fs_edit`, `fs_ls`, `shell`, `search_grep`, `search_glob`, `git`, `browser`, `checkpoint`, `cron`, `task` |
| **20 slash commands** | `/account`, `/clear`, `/compact`, `/cost`, `/fleet`, `/keys`, `/login`, `/memory`, `/mode`, `/models`, `/resume`, `/session`, `/status`, `/theme`, `/upgrade`, … |
| **18 subcommands** | `audit`, `audit-codebase`, `cost`, `kb`, `keys`, `ledger`, `login`, `models`, `resume`, `skills`, `undo`, `update`, `verify`, … |
| **4 modes** | `act` · `plan` (read-only thinking) · `verify` (read-only audit) · `ask` (read-only Q&A) |
| **Fleet + `task`** | parallel sub-agents in git worktrees, plus dynamic dispatch from inside any session |
| **MCP** | stdio + HTTP/SSE + `bearerProvider` async OAuth rotation |

40/40 offline tests in 16s. Parity matrix sum-of-gaps = 0 across 22 dimensions. [`docs/parity/CLI_PARITY_MATRIX.md`](./docs/parity/CLI_PARITY_MATRIX.md) is the row-by-row scoreboard.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  KB         compiled wiki via OpenKB + PageIndex (vectorless)    │
│  Ledger     per-scope JSONL events + agent-rewritten digest      │
│  Memory     curated key-value facts; loaded into context at boot │
│  Audit      append-only firehose; diagnostic only                │
└──────────────────────────────────────────────────────────────────┘

cli/main.ts
  ├─ resolveModelAlias  · hydrateEnvFromPool · loadExtensions
  ├─ loadSoul · loadProjectPrimer · loadSkills + scanSkillBody
  ├─ providers.forModel  ◀── construction-time failover
  ├─ createCompactionTransform  · createErrorClassifier
  └─ SubagentDelegator + register `task` tool
                        │
                        ▼
kernel/agent-loop.ts
  beforeTurn → contextTransform → provider.stream
    → beforeToolCall (mode-enforce + user) — vetoable
    → toolExecutor.execute
    → afterToolCall (rewrite)
    → afterTurn
                        │
                        ▼
runtime failover (mid-session): resume from result.messages
```

~14.5K LOC across 23 modules in `src_v2/`. Hard rule: every src file ≤ 200 lines.

Deep reading: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · [`docs/memory/km-architecture.md`](./docs/memory/km-architecture.md) · [`docs/memory/architecture-efficiency.md`](./docs/memory/architecture-efficiency.md).

## Memory

Four layers. Cheap to write below; curated above. Information flows up.

```
KB        · expensive to compile  · one query → 5 ranked snippets
Ledger    · cheap to append       · agent rewrites the digest periodically
Memory    · written deliberately  · loaded into context at boot
Audit     · free per event        · model never reads it; forensics only
```

[`docs/memory/km-architecture.md`](./docs/memory/km-architecture.md) covers the contract for each layer and how OpenKB + PageIndex feed the agent without re-deriving knowledge on every query.

## Plugins

Drop a TypeScript-or-ESM module at `~/.dirgha/extensions/<name>/index.mjs`:

```js
export default async function (api) {
  api.registerTool({ name: 'deploy', description: '…', inputSchema: { … },
    execute: async (input) => ({ content: 'deployed', isError: false, durationMs: 0 }) });
  api.registerSlash({ name: 'stats', description: 'show project stats', handler: () => 'OK' });
  api.on('turn_start', (ev) => { /* observe every turn */ });
}
```

A broken extension is named on stderr but doesn't break the rest of the CLI. [`@dirgha/arniko-plugin`](./docs/agents/arniko-plugin-spec.md) — Arniko's 36-scanner pipeline as a `before_skill_install` hook — ships next.

## Skills

Markdown packs with YAML frontmatter. Install from a git repo, scanned at install + load time:

```bash
dirgha skills install https://github.com/mattpocock/skills
dirgha skills audit                 # heuristic prompt-injection / supply-chain check
dirgha skills list                  # 112 skills loaded across 4 packs today
```

The scanner is the first layer of defence; deeper scans run via the optional `@dirgha/arniko-plugin`. [`docs/agents/skill-security.md`](./docs/agents/skill-security.md) covers the threat model.

## Why

Frontier coding assistants are closed SaaS, charging per-seat, piping your repo through someone else's telemetry. The assumption is that the intelligence must live at the vendor.

dirgha is built from the opposite assumption. Your laptop is the unit of sovereignty. Your keys, your wallet, your session log, your tool executions live on your machine until you choose to hit a network. Providers are swappable. The agent loop is open source.

## Documentation

| | |
|---|---|
| Architecture | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| Roadmap | [`docs/ROADMAP.md`](./docs/ROADMAP.md) |
| Doc convention | [`docs/DOCS-CONVENTION.md`](./docs/DOCS-CONVENTION.md) |
| Knowledge management | [`docs/memory/km-architecture.md`](./docs/memory/km-architecture.md) |
| Architecture efficiency | [`docs/memory/architecture-efficiency.md`](./docs/memory/architecture-efficiency.md) |
| Skill security | [`docs/agents/skill-security.md`](./docs/agents/skill-security.md) |
| Files & search contract | [`docs/agents/files-and-search.md`](./docs/agents/files-and-search.md) |
| Parity scoreboard | [`docs/parity/CLI_PARITY_MATRIX.md`](./docs/parity/CLI_PARITY_MATRIX.md) |
| Design system | [`DESIGN.md`](./DESIGN.md) |
| Per-release notes | [`changelog/`](./changelog) |

## Testing

```bash
npm run test:cli:offline   # 40/40 in ~16s; no network
npm run test:cli           # full sweep, including network providers
```

No row in the parity matrix closes without a runnable test that locks it in.

## Contributing

Read [`docs/DOCS-CONVENTION.md`](./docs/DOCS-CONVENTION.md) before adding docs. Read [`docs/parity/CLI_PARITY_MATRIX.md`](./docs/parity/CLI_PARITY_MATRIX.md) before adding code — the highest-gap row is the most important work. Every PR adds a `.changeset/<random-name>.md` describing what changed and at what semver tier.

## License

[FSL-1.1-MIT](./LICENSE) — Functional Source License with a 2-year sunset to MIT.
