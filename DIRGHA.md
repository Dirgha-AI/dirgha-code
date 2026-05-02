# DIRGHA.md

dirgha-cli (v1.17.2) is a terminal coding agent: a thin loop between an LLM and the filesystem/shell/git/browser, with crash-safe JSONL persistence, multi-provider failover, and a parallel fleet mode for git-worktree sub-agents.

## src/ structure

```
src/
├── kernel/         agent loop, message types, event stream, projection
├── providers/      wire transports + provider classes; rate-limit middleware
├── intelligence/   model catalogue, cost tracker, error classifier
├── auth/           keystore + keypool (multi-key, cooldown rotation) + 17 provider registry
├── context/        soul, primer, kb-init, git-state, mode, compaction, ledger, session
├── audit/          append-only JSONL writer + reader subcommand
├── extensions/     loadable ESM plugin API (registerTool / registerSlash / on)
├── tools/          registry + 11 built-ins + task tool for sub-agent dispatch
├── mcp/            client + stdio + HTTP/SSE transports + bearerProvider
├── skills/         agentskills.io frontmatter loader + matcher + runtime
├── subagents/      delegator + pool for the task tool
├── fleet/          parallel git-worktree dispatch
├── hooks/          registry + AgentHooks shape + config-bridge
├── cli/            entry points: one-shot main, REPL, 18 subcommands, 20 slashes
└── tui/            Ink TUI with <Static> transcript + StatusBar
```

Hard rule: every src file <= 200 lines.

## Key conventions

- **Tools**: add to `src/tools/`. Update `ARCHITECTURE.md` "Tool surface" and `docs/agents/files-and-search.md`.
- **Providers**: add a config blob to `src/providers/presets.ts`. No new class needed.
- **Modes**: `act` (default, all tools), `plan` (no write tools), `verify` (gated), `ask` (read-only Q&A).
- **Test command**: `npm run test:cli:offline` — 38 tests, ~16 s, no API keys required.
- **Type-check**: `npx tsc --noEmit`.
- **Docs convention**: one sentence per line, cite code paths (`src/kernel/agent-loop.ts:42`), no filler. See `docs/DOCS-CONVENTION.md`.
- **Commits**: never commit secrets; soul/tone changes require explicit user request.

## Gotchas

- `loadProjectPrimer` is synchronous (uses `readFileSync` / `statSync`). Keep it that way — it runs in the boot critical path.
- `maybeInitKb` in `src/context/kb-init.ts` is always fire-and-forget (`void ... .catch(() => {})`). Never await it in the boot path.
- Mid-session failover resumes from `result.messages`; the provider swap is in `src/kernel/agent-loop.ts`.
- NVIDIA NIM requires `delta.reasoning` parsing — handled in the provider layer; do not strip it upstream.
- Multi-key cooldown is lock-protected (`src/auth/keypool.ts`). Concurrent writes must go through that module, not direct file edits.
- `qmd_search` uses the `dirgha-docs` collection (seeded from `docs/` on first run via `kb-init.ts`). Do not shell out to `qmd query` when `qmd_search` is available.

## Key docs

- `docs/ARCHITECTURE.md` — kernel + provider model, full turn-flow diagram, extension points
- `docs/agents/files-and-search.md` — when to use fs_read / search_grep / rtk / qmd_search
- `docs/DOCS-CONVENTION.md` — slot index, writing rules, qmd collection setup
- `docs/ROADMAP.md` — shipped / in-flight / on-deck sprints
