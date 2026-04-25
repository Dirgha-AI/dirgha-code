# dirgha-cli — Architecture

A terminal coding agent that adapts to your workflow without forcing a fork. Headless one-shots, an Ink TUI, a readline REPL, parallel sub-agent fleets, and remote MCP servers all run on the same kernel + provider abstraction.

## Purpose

Engineers ship working code. dirgha is a thin loop between an LLM and the filesystem / shell / git / browser, glued by audit-everything persistence so a long sprint survives context resets, network blips, and provider outages.

It is **free-tier-first**: the same machinery runs on free OpenRouter `:free` models and on premium Claude / GPT / Gemini, with mid-session failover that swaps a dead key for a live one without losing the partial transcript.

## Vision

1. **One source of truth.** The parity matrix file scores dirgha against every dimension a coding agent needs. Mean is currently **9.82 / 10**, sum-of-gaps is **0**, and 38 offline tests run in 16 s. Every fix cites code + test in the matrix.
2. **Adapt to workflows; don't fork dirgha.** Skills, themes, hooks, MCP servers, and **TypeScript / ESM extensions** are loadable artifacts, not patches.
3. **Every model. Every wire. Every transport.** OpenAI chat-completions, Anthropic messages, Gemini generate, MCP stdio, MCP HTTP/SSE — one factory, providers as config blobs.
4. **Free compute is a first-class user.** NIM (kimi/deepseek/qwen) + OpenRouter free tier (hy3, ling) work end-to-end including multi-turn coding sprints — proven by dogfood in `/tmp/dogfood-*`.
5. **Failover is silent and lossless.** When `claude-opus-4-7` has no Anthropic key, the request routes to `anthropic/claude-opus-4-7` via OR. Mid-session timeouts resume from the partial transcript with `maxTurns − turnCount` budget remaining.
6. **Multi-key BYOK with cooldown rotation.** A free-tier 429 cools that key out for the rate-limit window; the next-priority key takes over without restarting the CLI. 17 providers known, lock-protected concurrent writes.
7. **Crash-safe persistence.** Append-only JSONL sessions replayed on `dirgha resume`. Audit log with `kinds` tally and `--filter`. Ledger with TF-IDF cosine search for semantic memory across sessions.
8. **Every model has a soul.** A short Markdown file at `~/.dirgha/soul.md` (or the default that ships with the package) defines tone, boundaries, end-of-turn norms.
9. **Self-update with permission.** `dirgha update --check` polls npm. `dirgha update [--yes]` installs after confirmation. `dirgha update --packages` refreshes installed skill packs. Audit-logged.
10. **Self-fetching catalogue.** `dirgha models refresh` queries `/v1/models` on each configured provider in parallel, caches at `~/.dirgha/models-cache.json` with a 24 h TTL. Live: 499 models pulled in <1 s during dogfood.

## What dirgha is

- **Terminal coding agent.** `dirgha "prompt"` (one-shot), `dirgha` (Ink TUI), `dirgha resume <id>` (continue session), `dirgha fleet launch <goal>` (parallel git-worktree sub-agents), `dirgha verify "<goal>" --accept "<cmd>"` (gated agent loop).
- **Multi-provider with one transport-abstraction.** Adding a new provider is a config-blob diff in `presets.ts`, not a new class.
- **Tool surface:** `fs_read`, `fs_write`, `fs_edit`, `fs_ls`, `shell`, `search_grep`, `search_glob`, `git`, `browser`, `checkpoint`, `cron`, plus dynamic `task` for sub-agent dispatch.
- **MCP-aware** with stdio + HTTP/SSE transports and async `bearerProvider` for OAuth token rotation.
- **20 slash commands** in interactive mode.
- **18 subcommands** for headless workflows.
- **Modes:** `act`, `plan`, `verify`, `ask`. Kernel-hook gate blocks every write tool in non-`act` modes.
- **Model aliases** (kimi, opus, sonnet, haiku, gemini, flash, deepseek, llama, ling, hy3, …) resolved before routing.

## What dirgha is NOT (yet)

- A web dashboard. `dirgha audit tail` is the live view; HTML rendering is on the roadmap.
- Auto-updating without permission. Update is opt-in and prompts unless `--yes`.
- Wired into npm marketplaces for plugin packs. Git-cloned skill packs work today; `dirgha install npm:@foo/pack` is roadmap.
- OAuth-native for every provider. API-key BYOK + dirgha gateway device-code work today; per-provider OAuth (Anthropic Pro / ChatGPT Plus) is roadmap.

## Architecture

```
src_v2/
├── kernel/           agent loop, message types, event stream, projection
├── providers/        wire transports + provider classes; rate-limit middleware
├── intelligence/     model catalogue, cost tracker, error classifier, models refresh
├── auth/             keystore (legacy single-slot) + keypool (multi-key, cooldown) + providers (registry of 17)
├── context/          soul, primer, git-state, mode, mode-enforcement, compaction, ledger, session
├── audit/            append-only JSONL writer + reader subcommand
├── extensions/       loadable plugin API (registerTool / registerSlash / registerSubcommand / on)
├── tools/            registry + 11 built-ins + task tool subagent dispatcher
├── mcp/              client + stdio + HTTP/SSE transports + bearerProvider rotation
├── skills/           agentskills.io frontmatter loader + matcher + runtime
├── subagents/        delegator + pool for the `task` tool
├── fleet/            parallel git-worktree dispatch
├── hooks/            registry + AgentHooks shape + config-bridge
├── cli/              entry points (one-shot main, REPL interactive, 18 subcommands, 20 slashes)
└── tui/              Ink TUI with <Static> transcript + StatusBar (cost / tok-rate / context meter / mode badge)
```

**~14.5 K LOC** across 23 modules. Hard rule: every src file ≤ 200 lines.

## How a one-shot turn flows

```
$ dirgha "implement log-histo per SPEC.md" -m hy3
   │
   ▼ cli/main.ts
   ├─ parseFlags + resolveModelAlias        (kimi → moonshotai/kimi-k2-instruct, etc.)
   ├─ hydrateEnvFromPool                     (multi-key BYOK, cooldown-aware)
   ├─ hydrateEnvFromKeyStore                 (legacy single-slot)
   ├─ loadExtensions(~/.dirgha/extensions)   (user plugins register tools / slashes / hooks)
   ├─ loadSoul, loadProjectPrimer, resolveMode, loadSkills + matchSkills
   ├─ providers.forModel  ◀────── construction-time failover
   ├─ createCostTracker, createErrorClassifier
   ├─ buildAgentHooksFromConfig ⊕ enforceMode
   ├─ createCompactionTransform              (75% trigger; prints `[compacted]` banner)
   ├─ SubagentDelegator + register `task` tool
   ▼
runAgentLoop (kernel/agent-loop.ts)
   ├─ for each turn:
   │    ├─ beforeTurn hook (continue / abort)
   │    ├─ contextTransform (compaction + skills injection)
   │    ├─ provider.stream(req) ──── chunks → events
   │    ├─ for each tool_use:
   │    │    ├─ beforeToolCall hook (mode-enforce + user) — can veto
   │    │    ├─ toolExecutor.execute(call, signal)
   │    │    └─ afterToolCall hook (rewrite)
   │    └─ afterTurn hook (usage)
   └─ stopReason: end_turn | tool_use | max_turns | error | aborted
   ▼
runtime failover (mid-session): if stopReason=error and a fallback is registered, swap and resume from result.messages with maxTurns − turnCount remaining
   ▼
persist: session.append(message) for every new message + appendAudit(turn-end)
   ▼
exit
```

## Test floor

`npm run test:cli:offline` — **38 / 38 green in 16 s.** No row in the parity matrix closes without a test that locks it in. 3 network suites (`hooks`, `cancel`, `provider_matrix`) gated on API keys.

## Extending dirgha

Drop an ESM module at `~/.dirgha/extensions/<name>/index.mjs`:

```js
export default async function (api) {
  api.registerTool({
    name: 'deploy',
    description: 'Deploy to staging',
    inputSchema: { type: 'object', properties: { env: { type: 'string' } } },
    execute: async (input) => ({ content: 'deployed', isError: false, durationMs: 0 }),
  });
  api.registerSlash({ name: 'stats', description: 'project stats', handler: () => 'OK' });
  api.on('turn_start', (ev) => { /* observe every turn */ });
}
```

The loader awaits async default exports. Extension errors are isolated — a broken extension is named on stderr but doesn't break the rest of the CLI.

## Authoring a skill

Drop `~/.dirgha/skills/<name>/SKILL.md`:

```markdown
---
name: my-skill
description: Use when the user asks about X
triggers:
  keywords: [foo, bar]
---

# My skill

Step 1. Do this.
Step 2. Then that.
```

Or install from a git repo:

```bash
dirgha skills install https://github.com/user/awesome-pack
dirgha skills list
```

Compatible with the [agentskills.io](https://agentskills.io) frontmatter standard.

## Roadmap

| Sprint | Goal | Status |
|---|---|---|
| 1 | `dirgha update --check / --self / --packages` | ✓ shipped |
| 2 | `dirgha models refresh` | ✓ shipped |
| 3 | TS / ESM extensions API | ✓ shipped |
| 4 | This doc + README + ROADMAP refresh | ✓ shipped |
| 5 | Pi-package npm marketplace (`dirgha install npm:@foo/dirgha-pack`) | spec only |
| 6 | OAuth flows for Anthropic Pro / ChatGPT Plus | spec only |
| 7 | Web dashboard for audit + cost (live HTML view) | not started |

The matrix file and the test sweep are the binding contract for each sprint.
