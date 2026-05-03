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

## Self-Healing Architecture

Every feature we ship must satisfy these principles. If it doesn't, it's a draft.

### 1. Declarative Configuration

- Models are catalogued, not regex'd. See `src/providers/*-catalogue.ts`.
- Routing rules are ordered by explicitness (vendor prefix > catalogue > catch-all).
- Adding a model is a one-line JSON entry in the catalogue. No code changes needed.

### 2. Live-Aware Tests

- Every provider has at least one E2E test that calls the real API.
- CI skips E2E when credentials are absent (forks, external PRs).
- Unit tests cover the routing layer; E2E tests cover the wire.

### 3. Graceful Degradation

- Failovers are automatic. See `src/intelligence/failover-chain.ts`.
- The last-resort fallback is `tencent/hy3-preview:free` (always available).
- After 5 consecutive failovers on a model, it's blacklisted for the session.

### 4. Self-Diagnostics

- `dirgha doctor` checks all providers, session store, memory store, disk space.
- CI runs doctor in publish pipeline. A failing doctor blocks release.
- Users run `dirgha doctor` before filing bugs.

### 5. Session Persistence

- Sessions survive SIGINT, SIGTERM, and crashes.
- Auto-save fires in the TUI, readline REPL, and one-shot modes.
- Sessions are stored in `~/.dirgha/sessions/` as JSONL + SQLite.

### 6. Error UX

- Errors are classified into 12 reasons. See `src/intelligence/error-classifier.ts`.
- Every error message includes: what happened, why, how to fix it.
- Never show raw API responses to users.

### 7. Versioned Artifacts

- Releases are tagged `vX.Y.Z` matching `package.json`.
- CI gates on: lint, typecheck, tests, build, smoke, bundle budget, SBOM, cosign.
- Release-please manages version bumps from conventional commits.

### 8. Regression Guards

- Every bug fix includes a regression test in `src/__tests__/regression.test.ts`.
- The test name references the GitHub issue and date fixed.
- Regression tests are the first line of defense against reintroduced bugs.

## Ship Confident Checklist

Before tagging a release, confirm all of these:

- [ ] `npm run lint` — 0 errors, 0 warnings
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm test` — all tests pass (190+)
- [ ] `npm run test:cli:offline` — headless Ink + slash audit pass
- [ ] `npm run prepublish-guard` — entry points verified
- [ ] `npm run build` — clean build
- [ ] `dirgha doctor` — all providers reachable (skip if no keys)
- [ ] `node src/__tests__/e2e-gate.test.ts` — live E2E gate passes (skip if no keys)
- [ ] Version in `package.json` matches git tag (`vX.Y.Z`)
- [ ] `.release-please-manifest.json` is synced
- [ ] No hardcoded paths, secrets, or tokens in source
- [ ] Bundle size under 6 MB (CI checks this)
- [ ] Manual smoke: `dirgha ask` with real model responds correctly

## Known Gaps

| Gap                                           | Impact                                     | Planned fix                                 |
| --------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
| No branch protection rules on GitHub          | Bad merges bypass CI                       | Configure in repo settings (requires admin) |
| No UI for model discovery in non-TUI mode     | Readline REPL users can't browse models    | `/models` slash command (done in TUI)       |
| Compaction drops thinking content             | Multi-turn with reasoning may lose context | Keep reasoning in compaction summary        |
| Fire-and-forget DB writes (no error handling) | DB corruption silently ignored             | Add telemetry on DB write failures          |

## Policy: Don't Be Aggressive

These design rules prevent over-engineering that hurts users:

1. **Health blacklist uses exponential backoff, not hard thresholds.**
   5 failures → 30s cooldown, not 30min. Only escalate when the provider
   keeps failing after cooldown expires. 2 successes = fresh start.
   See `src/intelligence/health-monitor.ts`.

2. **Failover blacklist is session-scoped, never persisted.**
   If a model fails 5 consecutive times within ONE conversation, it's
   avoided for that session. Restarting the CLI resets everything.
   See `src/intelligence/failover-chain.ts`.

3. **Rate limits trigger automatic backoff, never errors.**
   The agent waits and retries. Users never see rate-limit errors
   unless ALL providers are rate-limited simultaneously.

4. **Fallback is always available.**
   `tencent/hy3-preview:free` is the eternal last resort. It requires
   no API key and is always routed through OpenRouter. No user ever
   gets stuck with "no model available."

5. **Error messages tell the user WHAT to do, not WHAT happened.**
   "Your key was rejected (401). Get a new one at dashboard." — not
   "Authentication failed." Every error includes a concrete next action.

6. **Nothing breaks silently.**
   DB write failure → logged. Config parse error → warns.
   Remote catalogue fetch fails → falls back to hardcoded catalogues.
   Every failure path has a fallback. Nothing is required for startup.
