<div align="center">

# `dirgha` — a terminal coding agent

**Free compute, full agency.** Bring your own key. Or don't.

[![npm](https://img.shields.io/npm/v/@dirgha/code?style=flat-square&color=000)](https://www.npmjs.com/package/@dirgha/code)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/license-FSL--1.1--MIT-blue?style=flat-square)](./LICENSE)
[![Tests](https://img.shields.io/badge/offline%20tests-40%2F40-success?style=flat-square)](./scripts/qa-app)
[![Parity](https://img.shields.io/badge/parity%20matrix-9.82%2F10-success?style=flat-square)](./docs/parity/CLI_PARITY_MATRIX.md)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%99%A1-ec4899?style=flat-square)](https://dirgha.ai/contribute)

</div>

```text
◈ dirgha · 1.3.0 · openrouter/tencent/hy3-preview:free
─────────────────────────────────────────────────────────
❯ implement log-histo per SPEC.md and run the tests
  ∇ thinking…

  ∴ fs_read     SPEC.md (24 lines)
  ⊕ fs_write    log-histo.mjs       (2.7K)
  ⊕ fs_write    log-histo.test.mjs  (5.1K)
  ∂ shell       node --test         9 passed · 0.4s
  ≡ git_commit  feat: log-histo + tests

  Done. 9/9 tests pass. CLI reads JSONL, buckets by status,
  emits p50/p95 per bucket. Diff via /scroll.
```

`dirgha` is a terminal coding agent. One binary. No Electron, no cloud lock-in if you BYOK, no telemetry. It writes code, runs tests, commits, fails over silently when a model dies, audits everything to disk, and survives context resets without forgetting what it was doing.

It's built free-tier first. The same machinery runs on free OpenRouter models (`hy3`, `ling`) and on premium Claude / GPT / Gemini, with multi-key cooldown rotation across **17 known providers**. The features below were specced and implemented using `dirgha -m hy3` itself — free compute writing the next release.

---

## Install

```bash
npm install -g @dirgha/code        # or: pnpm add -g @dirgha/code
```

Requires Node ≥ 20. Binary installs as `dirgha`. Optional: install `rtk` for token-cheap shell, `qmd` for hybrid full-text + vector search, `openkb` for the compiled-wiki KB.

```bash
# 30-second start
export OPENROUTER_API_KEY=sk-or-…    # or NVIDIA_API_KEY, ANTHROPIC_API_KEY, …
dirgha "say ok in one word" -m hy3   # free-tier; first reply in <2 s
```

That's it. Drop into the interactive TUI with `dirgha` (no args), resume a session with `dirgha resume <id>`, or run a parallel sub-agent fleet with `dirgha fleet launch "<goal>"`.

---

## What's in the box

```
dirgha [prompt]            One-shot. Streams a single turn through the agent loop.
dirgha                     Interactive Ink TUI with /slash commands.
dirgha resume <id>         Continue a saved session, replay-aware.
dirgha fleet launch <g>    Decompose goal → parallel sub-agents in git worktrees.
dirgha audit-codebase      Parallel-fleet audit over every src module.
dirgha kb {ingest,query,…} Compiled KB via OpenKB + PageIndex. Vectorless RAG.
dirgha update --check      Probe npm for a newer version. Prompt-gated upgrade.
dirgha models refresh      Live /v1/models fetch across providers; 24h cache.
dirgha skills install <git-url>   Clone + scan a remote skill pack.
dirgha skills audit               Re-scan installed skills for prompt-injection risk.
dirgha keys pool {add,…}   Multi-key BYOK pool with cooldown rotation.
dirgha login --provider=<id>      Hidden-prompt BYOK login. Mode 0600.
dirgha cost {today,…}      Token + USD spend folded from the audit log.
dirgha undo [N]            Roll back N turns from the most-recent session.
dirgha ledger search …     TF-IDF cosine search over your project ledger.
dirgha audit list/tail     Append-only event log with --filter and kinds tally.
```

20 slash commands inside the TUI. 18 subcommands at the shell. 12 built-in tools (`fs_read`, `fs_write`, `fs_edit`, `fs_ls`, `shell`, `search_grep`, `search_glob`, `git`, `browser`, `checkpoint`, `cron`, plus `task` for dynamic sub-agent dispatch). 4 modes (`act`, `plan`, `verify`, `ask`).

---

## Architecture

Every layer pays for itself. Cheap to write = noisy. Expensive to write = curated. Lower layers are firehose; upper layers are signal.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  KB (compiled wiki, vectorless RAG via OpenKB + PageIndex)               │
│  `~/.dirgha/kb/`  ·  `dirgha kb {ingest,query,chat,lint,status,watch}`   │
├──────────────────────────────────────────────────────────────────────────┤
│  Ledger (per-scope JSONL events + agent-rewritten digest)                │
│  `~/.dirgha/ledger/<scope>.{jsonl,md}`  ·  TF-IDF cosine search          │
├──────────────────────────────────────────────────────────────────────────┤
│  Memory (curated key-value facts; loaded into context at boot)           │
│  `~/.dirgha/memory/MEMORY.md` + per-key files                            │
├──────────────────────────────────────────────────────────────────────────┤
│  Audit log (append-only firehose; diagnostic only — model never reads)   │
│  `~/.dirgha/audit/events.jsonl`  ·  `dirgha audit list/tail/search`      │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  cli/main.ts                                                             │
│  ├─ resolveModelAlias  (kimi → moonshotai/kimi-k2-instruct, etc.)        │
│  ├─ hydrateEnvFromPool (multi-key BYOK with cooldown rotation)           │
│  ├─ loadExtensions     (~/.dirgha/extensions/<name>/index.mjs)           │
│  ├─ loadSoul           (~/.dirgha/soul.md or default)                    │
│  ├─ loadProjectPrimer  (DIRGHA.md / CLAUDE.md cwd-walk, 8 KB cap)        │
│  ├─ loadSkills + scanSkillBody  (layer-1 prompt-injection scanner)       │
│  ├─ providers.forModel  ◀── construction-time failover                   │
│  ├─ createCompactionTransform  (75 % trigger; banner + audit)            │
│  └─ SubagentDelegator + register `task` tool                             │
│                                                                          │
│  kernel/agent-loop.ts                                                    │
│  ├─ for each turn:                                                       │
│  │    ├─ beforeTurn hook                                                 │
│  │    ├─ contextTransform (compaction + skill injection)                 │
│  │    ├─ provider.stream(req) → events                                   │
│  │    ├─ for each tool_use:                                              │
│  │    │    ├─ beforeToolCall hook (mode-enforce + user) — can veto       │
│  │    │    ├─ toolExecutor.execute(call, signal)                         │
│  │    │    └─ afterToolCall hook (rewrite)                               │
│  │    └─ afterTurn hook                                                  │
│  └─ stopReason: end_turn | tool_use | max_turns | error | aborted        │
│                                                                          │
│  runtime failover (mid-session): error → registered fallback,            │
│  resume from result.messages with maxTurns − turnCount remaining         │
└──────────────────────────────────────────────────────────────────────────┘
```

~14.5 K LOC across 23 modules in `src_v2/`. Hard rule: every src file ≤ 200 lines.

Deep dive: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). Memory model: [`docs/memory/km-architecture.md`](./docs/memory/km-architecture.md). Efficiency philosophy: [`docs/memory/architecture-efficiency.md`](./docs/memory/architecture-efficiency.md).

---

## Capabilities

| Capability | Score | Where |
|---|---|---|
| Context primer (DIRGHA.md / CLAUDE.md + `git_state` injection, capped) | 10/10 | [`primer.ts`](./src_v2/context/primer.ts) |
| Skills (agentskills.io frontmatter + matchers + git-clone install + scanner) | 10/10 | [`skills/`](./src_v2/skills) |
| Transport abstraction (factory + presets + rate-limit middleware) | 10/10 | [`providers/`](./src_v2/providers) |
| Themes (JSON-driven user themes at `~/.dirgha/themes/`) | 10/10 | [`tui/theme-loader.ts`](./src_v2/tui/theme-loader.ts) |
| Mode enforcement (act / plan / verify / ask, kernel-hook gate) | 10/10 | [`mode-enforcement.ts`](./src_v2/context/mode-enforcement.ts) |
| Long-term memory (typed JSONL ledger + digest + TF-IDF cosine search) | 10/10 | [`ledger.ts`](./src_v2/context/ledger.ts) |
| MCP integration (stdio + HTTP/SSE + `bearerProvider` OAuth rotation) | 10/10 | [`mcp/`](./src_v2/mcp) |
| Streaming UX (TUI + StatusBar with mode badge + tok/s + context meter) | 10/10 | [`tui/ink/`](./src_v2/tui/ink) |
| Model registry (single source: id → window/maxOut/family/price/aliases) | 10/10 | [`prices.ts`](./src_v2/intelligence/prices.ts) |
| Subagents (parallel fleet + dynamic `task` tool inside any session) | 10/10 | [`fleet/`](./src_v2/fleet), [`subagents/`](./src_v2/subagents) |
| Sessions / resume / undo (append-only JSONL, `.bak`-snapshot rewinds) | 10/10 | [`session.ts`](./src_v2/context/session.ts) |
| Compaction (auto-trigger at 75 % + hooks + telemetry banner) | 10/10 | [`compaction.ts`](./src_v2/context/compaction.ts) |
| Cost tracking (`dirgha cost {today,day,week,all}` with USD fold) | 10/10 | [`cost.ts`](./src_v2/intelligence/cost.ts) |
| Error handling (HTTP-status classifier + retryable + fallback + backoff) | 10/10 | [`error-classifier.ts`](./src_v2/intelligence/error-classifier.ts) |
| Audit log (append-only JSONL + `kinds` tally + `--filter` reader) | 10/10 | [`audit/`](./src_v2/audit) |
| Auth / BYOK (legacy keystore + multi-key pool + interactive login) | 10/10 | [`auth/`](./src_v2/auth) |
| Hooks (lifecycle + AgentHooks + config-bridge + composeHooks) | 10/10 | [`hooks/`](./src_v2/hooks) |
| Cancellation (Ctrl+C / AbortSignal correctness; aborted ≠ error) | 10/10 | [`agent-loop.ts`](./src_v2/kernel/agent-loop.ts) |
| Slash commands (20 built-ins: account, clear, compact, …) | 10/10 | [`cli/slash/`](./src_v2/cli/slash) |
| Tool registry (allowlist / denylist / descriptionLimit / MCP-bridged) | 10/10 | [`tools/registry.ts`](./src_v2/tools/registry.ts) |
| Skill safety scanner (prompt-injection / supply-chain heuristics) | new in 1.3.0 | [`security/skill-scanner.ts`](./src_v2/security/skill-scanner.ts) |
| Knowledge base (compiled wiki via OpenKB + PageIndex) | new in 1.3.0 | [`cli/subcommands/kb.ts`](./src_v2/cli/subcommands/kb.ts) |

Full row-by-row scoreboard with code + test citations: [`docs/parity/CLI_PARITY_MATRIX.md`](./docs/parity/CLI_PARITY_MATRIX.md).

---

## Providers

17 known. Multi-key pool with cooldown rotation; legacy single-slot keystore as fallback.

```
anthropic   openai     gemini      openrouter   nvidia      fireworks
deepseek    groq       cerebras    together     deepinfra   mistral
xai         perplexity cohere      kimi         zai
```

Every provider has a default base URL and an env-var priority list ([`auth/providers.ts`](./src_v2/auth/providers.ts)). Set up:

```bash
dirgha login --provider=openrouter --key=sk-or-…   # interactive or flag
dirgha keys pool add ANTHROPIC_API_KEY sk-ant-… --label=primary --priority=10
dirgha keys list
dirgha models refresh                              # live /v1/models fetch
```

Or just export env vars — they win over both the pool and the keystore.

34 model aliases short-circuit the long IDs:

```bash
dirgha "do X" -m kimi      # → moonshotai/kimi-k2-instruct
dirgha "do X" -m hy3       # → tencent/hy3-preview:free  (free-tier)
dirgha "do X" -m opus      # → claude-opus-4-7
dirgha "do X" -m haiku     # → claude-haiku-4-5
# … see `dirgha models list` for the full table
```

---

## Plugins

Drop a TypeScript-or-ESM module at `~/.dirgha/extensions/<name>/index.mjs`:

```js
export default async function (api) {
  api.registerTool({
    name: 'deploy',
    description: 'Deploy to staging.',
    inputSchema: { type: 'object', properties: { env: { type: 'string' } } },
    execute: async (input) => ({ content: 'deployed', isError: false, durationMs: 0 }),
  });
  api.registerSlash({ name: 'stats', description: 'project stats', handler: () => 'OK' });
  api.on('turn_start', (ev) => { /* observe every turn */ });
}
```

The loader awaits async default exports. Extension errors are isolated — a broken extension is named on stderr but doesn't break the rest of the CLI.

A real-world example is [`@dirgha/arniko-plugin`](./docs/agents/arniko-plugin-spec.md) — wraps Arniko's 36-scanner pipeline as a `before_skill_install` hook, runs as Layer 2 of the skill-security defence. Spec only this release; ships next.

Skills work the same way (Markdown + frontmatter):

```bash
dirgha skills install https://github.com/mattpocock/skills
dirgha skills audit                # re-scan everything for prompt-injection risk
dirgha skills list                 # 112 skills loaded today across 4 packs
```

---

## Why this exists

Frontier coding assistants are closed SaaS on someone else's cluster, charging per-seat, piping your repository through their telemetry. The assumption is that the intelligence must live at the vendor.

Dirgha is built from the opposite assumption. Your laptop is the unit of sovereignty. Your keys, your wallet, your session log, your tool executions all live on your machine until you explicitly choose to hit a network. Providers are swappable, not sacred. The agent loop itself is open source and forkable.

Free compute is a first-class user. The same machinery runs on `hy3` (free) and `opus` (premium) — the only thing that changes is the alias.

---

## Documentation

| What | Where |
|---|---|
| Architecture overview | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| Sprint roadmap | [`docs/ROADMAP.md`](./docs/ROADMAP.md) |
| Doc-writing convention + index tree | [`docs/DOCS-CONVENTION.md`](./docs/DOCS-CONVENTION.md) |
| Knowledge management — audit / memory / ledger / KB | [`docs/memory/km-architecture.md`](./docs/memory/km-architecture.md) |
| Architecture efficiency philosophy | [`docs/memory/architecture-efficiency.md`](./docs/memory/architecture-efficiency.md) |
| Skill security threat model + 2-layer defence | [`docs/agents/skill-security.md`](./docs/agents/skill-security.md) |
| Files & search contract (built-ins / `rtk` / `qmd`) | [`docs/agents/files-and-search.md`](./docs/agents/files-and-search.md) |
| Arniko plugin spec (Sprint 11) | [`docs/agents/arniko-plugin-spec.md`](./docs/agents/arniko-plugin-spec.md) |
| Parity-matrix scoreboard | [`docs/parity/CLI_PARITY_MATRIX.md`](./docs/parity/CLI_PARITY_MATRIX.md) |
| Per-release notes | [`changelog/<version>.md`](./changelog) |

---

## Testing

```bash
npm run test:cli:offline   # 40/40 in ~16 s; no network
npm run test:cli           # full sweep including network providers
npm run test:cli:quick     # offline + fast paths only
```

Every closure on the parity matrix cites a code path AND a runnable test. No row closes without an assertion that locks it in.

## Contributing

PRs welcome. Read [`docs/DOCS-CONVENTION.md`](./docs/DOCS-CONVENTION.md) before adding docs. Read [`docs/parity/CLI_PARITY_MATRIX.md`](./docs/parity/CLI_PARITY_MATRIX.md) before adding code — the highest-gap row is the most important work. Every PR adds a `.changeset/<random-name>.md` describing what changed and at what semver tier.

## License

[FSL-1.1-MIT](./LICENSE) — Functional Source License with a 2-year sunset to MIT. Use freely for non-competing purposes; the source becomes pure MIT after two years.
