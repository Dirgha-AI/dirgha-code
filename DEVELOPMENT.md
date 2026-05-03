# Developing Dirgha CLI

## Hardening pass — 2026-05-03

- [x] Audit session-storage architecture (`src/context/session.ts`, `src/state/`)
  - Sessions persist as JSONL in `~/.dirgha/sessions/` — crash-safe per-append
  - Gap found: Ink TUI path never created/wrote a Session — messages held only in React state
  - Gap found: no explicit close/auto-save on SIGINT/SIGTERM in TUI or readline REPL
- [x] Audit database and memory system (`src/state/db.ts`, `src/context/memory.ts`)
  - `better-sqlite3` loaded optionally via `require()` — degrades gracefully
  - Memory store is file-backed with optional FTS5 index — correct
  - All 190 tests pass
- [x] Audit parallel-agent system (`src/subagents/`, `src/fleet/runner.ts`)
  - Delegator correctly scopes tools, respects `maxTurns` and `tokenBudget`
  - `SubagentPool` correctly implements bounded concurrency (FIFO + `maxConcurrent`)
  - `LoopDetector` tracks repeated tool calls and output stagnation
  - `runFleet` correctly creates worktrees, spawns agents with `AbortController` timeouts
  - All fleet/dag tests pass
- [x] Fix every failing test — 190 passing, 0 failing, 0 lint errors, 0 typecheck errors
- [x] Add session auto-save on SIGINT / process exit
  - `Session.close()` method added to `src/context/session.ts` — calls `dbCloseSession`
  - `runInkTUI()` in `src/tui/ink/index.ts` — creates `SessionHandle`, flushes on SIGINT/SIGTERM
  - `App.tsx` in `src/tui/ink/` — creates `Session` on mount, saves user + assistant messages
  - `runInteractive()` in `src/cli/interactive.ts` — closes session on SIGINT/SIGTERM/readline close
  - One-shot path in `src/cli/main.ts` — closes session after messages persisted
- [x] Update DEVELOPMENT.md (this file)

## Remaining known issues

- The one-shot SIGINT handler in `main.ts` (line ~352) fires before session creation; if the agent loop is interrupted mid-flight, session state from the pre-loop SIGINT handler may not get a final close call. This is a low-impact edge case since the non-interactive path already saves user + system messages before the loop starts.
- `db.ts` uses `require("better-sqlite3")` (CJS require) inside an ESM project — works today but may break in future Node.js ESM-only environments.

## How we ship

```
git checkout -b feat/my-fix
# ... write code + tests ...
npm run lint && npm run typecheck && npm test
git commit -m "fix: description"
git push
```

The CI pipeline (`publish.yml`) runs on every `v*.*.*` tag push and gates release
on **all** of these passing:

| Step                     | Command                        | Blocks release? |
| ------------------------ | ------------------------------ | :-------------: |
| Tag matches package.json | verify                         |       Yes       |
| Lint                     | `npm run lint`                 |       Yes       |
| License audit            | `npm run license-check`        |       Yes       |
| CVE audit                | `npm audit --audit-level=high` |       Yes       |
| Typecheck                | `npm run typecheck`            |       Yes       |
| Unit tests (188+)        | `npm test`                     |       Yes       |
| Build                    | `npm run build`                |       Yes       |
| Subcommand smoke         | `dirgha ask`, `dirgha doctor`  |       Yes       |
| Headless Ink tests       | `npm run test:cli:offline`     |       Yes       |
| Bundle size budget       | `< 6 MB tarball`               |       Yes       |
| SBOM + cosign sign       | CycloneDX + SPDX               |       No        |
| npm publish              | provenance enabled             |       Yes       |

**Release-please** manages version bumps automatically from conventional commits:

- `fix:` → patch bump (`1.20.18 → 1.20.19`)
- `feat:` → minor bump (`1.20.18 → 1.21.0`)
- `feat!:` or `BREAKING CHANGE:` → major bump

### Pre-tag checklist (developer)

Run these locally before tagging. CI runs the same gates but catch issues early:

```bash
npm run lint                    # 0 warnings
npm run typecheck               # 0 errors
npm test                        # all pass
npm run build                   # clean build
npm run test:cli:offline        # Ink unit + slash audit (local only, no TTY needed)
npm run prepublish-guard        # entry point verification
```

### Common CI failures and fixes

| Failure                                       | Fix                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `package.json version does not match git tag` | Run `npm version minor/patch --no-git-tag-version` before tagging           |
| Dispatch test model routing wrong             | Update `providers/__tests__/dispatch.test.ts` to match `dispatch.ts` rules  |
| Parity test deprecated model                  | Update `parity/scenarios.ts` with current model IDs from `nim-catalogue.ts` |
| Bundle size exceeds budget                    | Check `vendor/rtk/` binary, check for accidental large file inclusion       |

## Architecture

```
src/
├── providers/           Model routing, API adapters, per-provider catalogues
│   ├── dispatch.ts      Model ID → provider ID routing rules
│   ├── *-catalogue.ts   Per-provider model descriptors (capabilities, pricing)
│   ├── openai-compat.ts Shared SSE stream parser
│   └── index.ts         ProviderRegistry
├── kernel/              Agent loop, event stream, message assembly
├── tui/ink/             Ink (React) terminal UI
│   ├── App.tsx          Main TUI component
│   ├── use-event-projection.ts  Streaming → React bridge
│   └── components/      InputBox, StatusBar, ToolBox, etc.
├── cli/                 CLI entry points, slash commands, subcommands
├── integrations/        Gateway API clients (device-auth, billing, entitlements)
├── tools/               Built-in tool implementations (fs, shell, browser, git, etc.)
├── fleet/               Multi-agent fleet orchestration
└── context/             Session, memory, compaction, mode enforcement
```

### Adding a new provider

1. Create `src/providers/<name>-catalogue.ts` with `ModelDescriptor[]`
2. Create `src/providers/<name>.ts` implementing the `Provider` interface
3. Register in `src/providers/index.ts` → `construct()`
4. Add routing rule in `src/providers/dispatch.ts` → `RULES[]`
5. Add tests in `src/providers/__tests__/dispatch.test.ts`
6. Add to `isKnownProvider()` in `dispatch.ts`

### Adding a new built-in tool

1. Create `src/tools/<name>.ts` implementing `ToolDefinition`
2. Register in `src/tools/index.ts` → `builtInTools`
3. Add to `WRITE_TOOLS` in `src/context/mode-enforcement.ts` if it modifies files
4. Add to `AUTO_APPROVE_DEFAULTS` if safe in plan mode

## Git workflow

```bash
# Starting new work
git checkout main
git pull
git checkout -b feat/my-thing

# Before tagging
git checkout main
git merge feat/my-thing
npm run lint && npm run typecheck && npm test
npm run build
npm version patch --no-git-tag-version  # bumps package.json only
git add -A
git commit -m "fix: brief description"
git tag -a vX.Y.Z -m "vX.Y.Z: brief description"
git push origin main --tags
```

### Never commit

- `.env` files
- API keys / secrets
- **Don't force push to main** — it breaks the deploy pipeline
- Large binaries outside `vendor/`

## Testing tiers

| Tier        | Location                      | Runs in CI? | What it tests                        |
| ----------- | ----------------------------- | :---------: | ------------------------------------ |
| Unit        | `src/__tests__/*.test.ts`     |     Yes     | Pure functions, routing, utilities   |
| Integration | `src/kernel/__tests__/`       |     Yes     | Agent loop, event streams            |
| TUI capture | `src/__tests__/tui-*.test.ts` |     Yes     | App component in capture buffer      |
| Parity      | `src/parity/__tests__/`       |     Yes     | Provider interface compliance        |
| Offline CLI | `scripts/qa-app/`             |     Yes     | Slash commands, Ink unit, token rate |
| Smoke       | `publish.yml` inline          |     Yes     | `dirgha ask`, `dirgha doctor`        |
| UX scorer   | `tools/ux-scorer/`            |     Yes     | Multi-judge journey scoring          |
| E2E live    | Manual                        |     No      | Full login → chat → tools flow       |

## Environment variables

The CI expects these GitHub Actions secrets:

| Secret               | Used by                              |
| -------------------- | ------------------------------------ |
| `OPENROUTER_API_KEY` | CI smoke test (tool call round trip) |
| `NVIDIA_API_KEY`     | UX scorer (multi-model judges)       |
| `GROQ_API_KEY`       | UX scorer (multi-model judges)       |

## Release process

1. Merge work to `main`
2. Push tag → CI gates kick in → SBOM → sign → publish
3. Release appears on npm: `npm i -g @dirgha/code@latest`
4. Release-please updates CHANGELOG + bumps version in next PR
