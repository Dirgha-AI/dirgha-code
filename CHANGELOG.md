# Dirgha CLI — Changelog

All notable changes are tracked here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); we use [Semantic Versioning](https://semver.org/).

## [1.20.1] — 2026-05-02

### Fixed

- CI: Windows runner now uses `npm install` to resolve platform-specific rolldown native binding (`@rolldown/binding-win32-x64-msvc`) omitted from Linux-generated lockfile.
- CI: Browser tool offline test now skips gracefully when Playwright Chromium executable is not installed (instead of failing the suite).
- Publish: prepublish-guard no longer flags cosign SBOM certificate `.pem` files as secrets; only PEM files containing `PRIVATE KEY` are blocked.

## [1.20.0] — 2026-05-02

### Added

- BYOK multi-key pool: rotate across multiple provider keys, health-aware eviction.
- `dirgha update` command: self-update CLI to latest npm release.
- `dirgha cost` command: show token spend per session and cumulative totals.
- `dirgha undo` command: revert last agent-applied file change.
- Ask mode: `--ask` flag gates all tool executions behind a confirmation prompt.
- 34 new model aliases across NVIDIA, OpenRouter, and local Ollama.
- 41 new unit + integration tests (vitest).
- MCP OAuth bearer rotation: auto-refresh expired MCP server tokens.
- StatusBar tok/s display: real-time tokens-per-second in the TUI footer.
- `git_state` injection: current branch + dirty status appended to system prompt.
- Compaction telemetry: log context compaction events to crash-log.
- Ledger ranked search: cost ledger now supports ranked/fuzzy queries.
- TS extensions API: `dirgha.extensions.register()` for first-party plugin hooks.
- `audit-codebase` one-liner skill shortcut.
- Prepublish guard: blocks `npm publish` if dist/ is stale or tests are failing.

### Fixed

- NIM delta.reasoning streaming: correctly buffers partial reasoning_content chunks.
- Mid-session failover: provider failover no longer drops the current tool result.
- BYOK env hydration: env-var keys are now loaded before first request, not lazily.
- Login flag passthrough: `--login` correctly forwarded through the CLI entry point.
- Task tool wiring: TaskCreate/TaskUpdate/TaskGet now resolve in agent tool loop.
- ErrorClassifier wiring: classifier applied to all provider errors, not just OpenAI.
- Skills install URL flag-injection rejection: `dirgha skills install` validates URLs.

## [1.18.0] — Kernel hardening, supply-chain hardening, security audit

### Stability

- EPIPE/EIO crash guards: process stdout/stderr/stdin error handlers prevent crash-log spam on PTY close.
- Stall detection: HTTP streaming aborts after 30s of no bytes received (prevents 5-min hangs).
- Crash log rotation: auto-rotates at 10 MB, keeps last 200 entries.
- Per-tool timeout enforcement: every tool gets a configurable `timeoutMs`; shell defaults to 5 min.
- Event queue backpressure: queue overflow emits a synthetic `backpressure` error event instead of silent drops; `drain()` API added.

### Daemon

- Graceful shutdown: state-machine (`running → shuttingDown → exited`), AbortController signals all in-flight agents, 10s deadline, session flush.

### Providers

- Failover cascade: `buildFailoverChain()` — 4-tier chain (user → same-family → registry → free), health-aware.
- DeepSeek-native prefix stripping (`deepseek-native/`).
- OpenRouter thinking pattern fix for `tencent/hy3` models.
- OpenAI-compat: synthetic tool call IDs, try/finally around SSE loop, dead `thinkBuffer` removed.
- Health scoring: 60s TTL compaction prunes stale windows; NaN/latency/cost fixes.

### Security

- Shell injection fix in hooks config-bridge (argv splitting, shell: false).
- Path traversal bypass fixed in safety policy (relative path resolution).
- Seatbelt profile injection blocked (reject unsafe chars).
- PowerShell command injection fixed in /paste.

### Kernel

- Event-stream handler recursion guard (max depth 1).
- contextTransform errors isolated from provider errors.
- `toolResultMessage` accepts configurable role.
- `assembleTurn` handles duplicate tool IDs, unmatched toolcall_end, missing toolcall_start.
- `maxTurns` clamping (0–1000), validated at config load.
- `StopReason` union expanded with `max_turns`.

### Tools

- Git cwd separator fix (`startsWith` → `startsWith(cwd + sep)`).
- Shell `exit` → `close` event for pipe closure handling.
- Cron atomic writes (temp file + rename), `dirname()` instead of `lastIndexOf('/')`.
- Browser connection check (`isConnected?.() !== false`).
- Multimodal path containment check.
- Tripleshot `handleFor` null-safe return.

### CLI/TUI

- Config schema versioning (`schemaVersion: 1`) with `migrateConfigSchema()`.
- Silent config loss now warns to stderr.
- Null config spread guard (`value !== null` check).
- ThinkingBlock: `useInput({ isActive: false })` fixes Enter-after-paste; text color changed to white.
- commitLive race condition fixed (liveItemsRef synchronous mirror).
- Slash dispatch errors caught and surfaced instead of freezing REPL.
- Fleet stdout monkey-patch scoped and restored.
- Input approval stdin error handling.

### Fleet

- DAG workflows: `runDag()` chains agents sequentially with cumulative context propagation.
- `withLock` timeout recovery with atomic write fallback.
- `ledger-hook` empty array guard.

### Security (second pass — depth audit)

- Path traversal in `/memory` — `assertValidKey()` now enforced in `get`, `upsert`, `remove` (previously only in the adapter's `save`).
- Path traversal in `/session rename` — `sessionPath()` validates id via `basename()` before building the file path.
- Path traversal in `scaffold --name` — `deriveName()` rejects names containing path separators.
- API key leak in TUI — `inputFocus` is now `false` when `KeySetOverlay` or `ApprovalPrompt` is active; keystrokes no longer bleed into the chat input box.
- `meta/llama-3.3-70b-instruct` was misattributed to `provider: "nvidia"` in `prices.ts` while dispatch routes it via OpenRouter — cost tracking now matches actual routing.

### Reliability (second pass)

- `cost.ts` NaN guard — malformed token counts from providers no longer poison session totals; `safeInt()` sanitizes before accumulation.
- `lsp/client.ts` timer leak — `setTimeout` handle now `clearTimeout`-ed when response resolves first; accumulation across long sessions prevented.
- `models-dev-sync.ts` — `getCatalogue()` falls back to stale cache on network failure instead of throwing.
- `web/server.ts` URL routing — route matching now uses `URL.pathname` so query-string requests (e.g. `?foo=bar`) are handled correctly.

### TUI

- `ThinkingBlock` — `isActive: false` on `useInput` was silently dead; expand/collapse via Enter now works.

### CI / Supply-chain

- `npm audit --audit-level=high --omit=dev` is now a CI gate (blocks PRs with high+ CVEs).
- SBOM emitted on every release in CycloneDX + SPDX formats; cosign-signed and attached to GitHub Releases.
- Bundle-size budget updated to 6 MB (vendor/rtk binary included since v1.17).
- Dependabot weekly PRs (grouped: eslint, ink, types, vitest stack).
- OpenSSF Scorecard runs weekly + on push to main; result published to scorecard.dev.
- TypeScript upgraded to `^5.9.3` (required by `@tobilu/qmd` peer dep); Buffer type strictness fixes across 7 files.
- `react` pinned to `^18.3.1` to satisfy `react-reconciler@0.29.2` peer dep.

### Tests

- 104 tests passing (97 → 104: +4 fleet DAG, +3 TUI render).
- TypeScript 0 errors, ESLint 0 warnings.
- All 30+ CLI subcommands smoke-tested.
- Full codebase depth audit: 14 parallel agents × all subsystems, 25+ bugs identified and fixed.

## [1.13.1](https://github.com/Dirgha-AI/dirgha-code/compare/v1.13.0...v1.13.1) (2026-04-30)

### Bug Fixes

- reasoning_content multi-turn + /up alias ([9920e61](https://github.com/Dirgha-AI/dirgha-code/commit/9920e61a2b2244d7fde4debe2d5b5ff49c77b54b))

## [1.13.0](https://github.com/Dirgha-AI/dirgha-code/compare/v1.12.3...v1.13.0) (2026-04-30)

### Features

- **providers:** add DeepSeek native models + fix NVIDIA NIM routing ([48eb272](https://github.com/Dirgha-AI/dirgha-code/commit/48eb27211157a57d50cbc3e68ebeffb63f345239))

### Bug Fixes

- inline key setup overlay + pack update resilience + Windows update crash ([af259cc](https://github.com/Dirgha-AI/dirgha-code/commit/af259cc4112cd3be0641eeaf6253dd2e8de2f4e5))
- **tests:** update dispatch tests + add DeepSeek V4/Prover prices ([1d4856f](https://github.com/Dirgha-AI/dirgha-code/commit/1d4856f1d18abca83ad301e3be4969143c136193))

## [1.12.3](https://github.com/Dirgha-AI/dirgha-code/compare/v1.12.2...v1.12.3) (2026-04-28)

### Bug Fixes

- **slash:** /provider list reads from dispatch — adds 8 missing providers ([5a2741e](https://github.com/Dirgha-AI/dirgha-code/commit/5a2741e9177d325731292dd5302841cf6ff16565))

## [1.12.2](https://github.com/Dirgha-AI/dirgha-code/compare/v1.12.1...v1.12.2) (2026-04-28)

### Bug Fixes

- **windows:** cross-platform shell + auto readline-fallback + mount banner ([ecef403](https://github.com/Dirgha-AI/dirgha-code/commit/ecef4038249961fe3da6f73925d9a0851df2c7b0))

## [1.12.1](https://github.com/Dirgha-AI/dirgha-code/compare/v1.12.0...v1.12.1) (2026-04-28)

### Bug Fixes

- **tui:** Ink-native approval prompt — fixes tool-stall on Windows ([2612454](https://github.com/Dirgha-AI/dirgha-code/commit/26124547222fe8d556fec10b294627bdb8c7361e))

## [1.12.0](https://github.com/Dirgha-AI/dirgha-code/compare/v1.11.0...v1.12.0) (2026-04-28)

### Features

- **tui:** two-step provider→model picker + 2026-04-28 OpenRouter top models ([ceaa720](https://github.com/Dirgha-AI/dirgha-code/commit/ceaa720d93d4de00d97717516a06f3154ef510b8))

## [1.11.0](https://github.com/Dirgha-AI/dirgha-code/compare/v1.10.0...v1.11.0) (2026-04-28)

### Features

- **providers:** add 8 native providers + missing-key warning on /models switch ([4b07807](https://github.com/Dirgha-AI/dirgha-code/commit/4b078075c067eb9a0db49484c208f951b789f908))

## [1.10.0](https://github.com/Dirgha-AI/dirgha-code/compare/v1.9.0...v1.10.0) (2026-04-28)

### Features

- model-switch prompt + opencode picker + /provider skill ([587fe72](https://github.com/Dirgha-AI/dirgha-code/commit/587fe72b87a5a7f495386c859df6dff7ab35c23b))
- **tui:** connected-border tool group + DenseToolMessage (gemini parity) ([72077c7](https://github.com/Dirgha-AI/dirgha-code/commit/72077c72d5c35dd080da5574239748516aa80cbd))
- **tui:** native markdown rendering + semantic theme tokens + 5 themes ([49130b1](https://github.com/Dirgha-AI/dirgha-code/commit/49130b1ca7191b186fd3d72eb1b0943cccfeee93))

### Bug Fixes

- auto-migrate deprecated model IDs + readable theme + busy-state hint ([50c0c50](https://github.com/Dirgha-AI/dirgha-code/commit/50c0c507a390d2da17c0f8b262ca93b8bb806557))
- **tui:** busy-hint reads 'ctrl+c clear' instead of 'ctrl+c×2 exit' ([6b0f367](https://github.com/Dirgha-AI/dirgha-code/commit/6b0f367295d3a30ccc1ae8fe7911b69e561d1709))

## [1.9.0](https://github.com/Dirgha-AI/dirgha-code/compare/v1.8.1...v1.9.0) (2026-04-28)

### Features

- **providers,ask:** DeepSeek native provider + dirgha ask --cwd ([ab4351f](https://github.com/Dirgha-AI/dirgha-code/commit/ab4351f8cd9ae76973fc4af1afdfd3b3c0135ce9))

### Bug Fixes

- **audit-codebase,gitignore:** add --help handler + un-ignore dist/ ([76c3c0a](https://github.com/Dirgha-AI/dirgha-code/commit/76c3c0a31dbb9337710f195c24b2e52497d154b7))

## [1.8.1](https://github.com/Dirgha-AI/dirgha-code/compare/v1.8.0...v1.8.1) (2026-04-28)

### Bug Fixes

- **ci:** pin ossf/scorecard-action to correct v2.4.3 SHA ([b92f002](https://github.com/Dirgha-AI/dirgha-code/commit/b92f0022877a531d7b16edc9442b839e25ab518f))
- **ci:** repin three actions to verified-real SHAs ([491e799](https://github.com/Dirgha-AI/dirgha-code/commit/491e799ba239a60996a3a770052d2792be10d523))

## [1.8.0](https://github.com/Dirgha-AI/dirgha-code/compare/v1.7.15...v1.8.0) (2026-04-28)

### Features

- **scaffold:** dirgha scaffold "&lt;prompt&gt;" — instant Vite/Hono starter ([1ff456b](https://github.com/Dirgha-AI/dirgha-code/commit/1ff456b6defda145881509963b723a69b8e343bb))
- **tui:** Ctrl+C clears buffer + non-disruptive prompt queue ([12fe781](https://github.com/Dirgha-AI/dirgha-code/commit/12fe7817b16f8710fbf99f8900f3ba6fd9fc6579))

## 1.7.12 — 2026-04-28

**CI-6 — Posthog telemetry endpoint live + minimal-data schema.**

### Added

- `src_v2/telemetry/sender.ts` — Posthog-compatible sender, fires events on subcommand exit (when opt-in).
- 1s `Promise.race` cap so a slow Posthog never blocks the user.

### Changed

- Telemetry payload tightened to **5 fields** for command events (event, version, command, os, node) — no more `os_release`, `arch`, `duration_ms`. **6 fields** on errors (+ `error_class`).
- `docs/privacy/CLI-TELEMETRY.md` updated with the exact minimum data table.

## 1.7.11 — 2026-04-28

**CI-3 + CI-4 — multi-agent UX scorer + telemetry scaffold.**

### Added

- `tools/ux-scorer/run.mjs` — N-judge fleet records 5 scripted journeys via tmux, scores against `tools/ux-scorer/rubric.md`. Median ≥ 7.0 release-blocking.
- Default judge: `inclusionai/ling-2.6-1t:free`. Optional: `tencent/hy3-preview:free`, `deepseek-v4-pro`, `kimi-k2`.
- `dirgha telemetry <status|enable|disable|endpoint>` subcommand. Default OFF.

### Fixed

- ux-scorer unsets `CI`/`GITHUB_ACTIONS`/`CONTINUOUS_INTEGRATION` before launching `dirgha` inside tmux so Ink doesn't suppress dynamic output (`is-in-ci` detection).

## 1.7.10 — 2026-04-28

**CI-2 — headless Ink overlay tests + StatusBar tok/s.**

### Added

- `scripts/qa-app/ink_unit_test.mjs` extended to 11 assertions — `/help`, `/theme`, `/models` slash overlay journeys.
- `FakeStdin` upgraded to a Readable-stream mimic (Ink listens on `'readable'`, not `'data'`).
- StatusBar now actually computes `tok/s` (was a declared-but-unused prop). 4 cases covered: arithmetic, idle, zero-output, sub-250ms warmup.

### Fixed

- `tool_exec_end → done` Ink test regex allows the tool icon glyph between ✓ and "Shell".
- Ink CI-mode suppressed dynamic output → `debug:true` escape.
- `kb` test reclassified `needs: 'NETWORK'` (was sneakily network-bound).

## 1.7.9 — 2026-04-28

**CI-1 — production-grade pre-release gates + `/theme` bug fix.**

### Fixed

- `/theme` overlay race condition (1.7.8 regression): SlashComplete `onPick` and InputBox `onSubmit` both fire on Enter; explicit `setActive(null)` was overwriting `openOverlay('theme')`. Removed the explicit clear; the `useEffect` on `slashQuery=null` handles cleanup safely.

### Added

- ESLint flat config + `npm run lint` (max-warnings 25 baseline).
- `npm run license-check` (fails on GPL/AGPL/LGPL).
- Cross-OS CI matrix: ubuntu × macos × windows × Node 20/22.
- Smoke matrix tier1 gained `/theme`, `/update`, and a tool-call cell.

## 1.7.8 — never published

Tagged but pulled when `/theme` overlay race surfaced. Fixed in 1.7.9.

## 1.7.7 — 2026-04-27

### Fixed (P0 — install)

- **`npm i -g @dirgha/code` failed for every user since 1.5.x.** Two compounding issues in the publishes that came from the wrong working tree: `dependencies."@dirgha/pricing": "workspace:*"` was unresolvable outside the monorepo, and `dependencies."cli-markdown": "^1.0.0"` (unused) transitively required `cli-html@1.9.4 → boxen/fieldset@github:horosgrisa/fieldset`, a deleted GitHub repo. Both deps gone. Verified by `scripts/verify-install.sh` which packs the tarball, installs in a clean throwaway dir, and boots `dirgha --version` + `doctor` + `--help`.

### Fixed (TUI dispatch)

- **Ink TUI `handleSubmit` did not dispatch through `SlashRegistry`.** The slash picker showed all 20 commands, but Enter only ran the 5 hardcoded branches (/clear, /help, /model[s], /theme); 15 others (account, compact, config, fleet, history, init, keys, login, memory, mode, resume, session, setup, status, upgrade) were either silently sent to the LLM as user prompts (this tree) or rejected as "Unknown command" (private monorepo tree). Now `App.tsx` builds a `SlashContext` from component state and dispatches via the registry before the user-prompt path. `runInkTUI` constructs the registry via `createDefaultSlashRegistry` + `registerBuiltinSlashCommands`, mirroring `interactive.ts`.

### Added (release safety)

- **`scripts/verify-install.sh`** — pre-publish gate. Packs, installs in `/tmp/dirgha-verify-install-$$`, asserts the binary launches and `doctor` + `--help` print expected sections.
- **`scripts/prepublish-guard.sh`** — refuses publish if `_legacy_v1/` exists in cwd OR any dep value starts with `workspace:`. Catches the failure mode that put the broken 1.7.0/1.7.1/1.7.6 on npm.
- **`prepublishOnly` chain** = `prepublish-guard && build && verify-install`. A broken artifact can no longer reach npm.
- **`.github/workflows/release.yml`** — on `v*.*.*` tag push: tag-vs-package.json version match check, npm ci, all gates above, `npm publish --access public --provenance` (OIDC-signed). Manual laptop publishes are no longer the path.

### Changed

- **Quarantined v1 source tree.** `src/` and `tsconfig.json` (the legacy v1 build config) moved to `_legacy_v1/`. `src_v2/` has been the canonical tree since 1.x; the legacy tree was dead code in the repo. Recoverable via `git checkout`. `dist/` (legacy build output) deleted and gitignored.

### Added (test infrastructure)

- **Vision-loop smoke matrix.** `scripts/vision-loop.sh` (tmux PTY driver + charmbracelet/freeze for ANSI→PNG capture) + `scripts/smoke-matrix.sh` (drives every slash + subcommand, asserts on body content excluding the splash banner). 24/24 PASS.
- **Picker-flow smoke.** `scripts/qa-app/picker-flow.sh` drives `/models` end-to-end as a human would: open with /models, navigate Down × 5, Enter, then verify the confirmation message + StatusBar update + persistence on reopen. 10/10 assertions across 5 PNG frames.
- New npm scripts: `test`, `test:tui`, `test:smoke`, `verify-install`, `prepublish-guard`.
- Vitest added as devDependency.

### Fixed (tests)

- 7 stale `dispatch.test.ts` assertions updated to match `routeModel` intent: prefixed slugs (anthropic/, openai/, google/, minimaxai/, z-ai/, meta/) go via OpenRouter as the catch-all; only NIM-whitelisted exact IDs go to nvidia. Routing implementation unchanged. `npm test` now green.

### Known issues (open, not regressions)

- **Gateway `/api/auth/device/start` returns 404.** `/login` surfaces this clearly; CLI is correct, server-side endpoint missing.
- **Gateway `/account` and `/upgrade` return 401** against a stale token. CLI handles gracefully.

## 1.6.0 — 2026-04-26

### Added

- **Local model provider** — first-class llama.cpp + Ollama support. New `LlamaCppProvider` at `src_v2/providers/llamacpp.ts` (default `http://localhost:8080/v1`, `LLAMACPP_URL` override). Model ids prefixed `llamacpp/…` route there; `ollama/…` continues to route to the existing Ollama provider.
- **Setup wizard — Local option.** New "Local (llama.cpp / Ollama)" step in `dirgha setup` (option 2, right after Dirgha hosted). Auto-probes both `localhost:11434` and `localhost:8080`, lists installed models from each (`/api/tags` + `/v1/models`), and falls through with placeholder + install hints when neither server is up.
- **`dirgha doctor` — Local probes.** Added Ollama (`http://localhost:11434/api/tags`) and llama.cpp (`http://localhost:8080/v1/models`) checks; warn (not fail) when not running, since local servers are optional.
- **Hardware-aware model recommendation.** New `dirgha hardware` subcommand (alias `sysinfo` / `system`) detects CPU cores, RAM, NVIDIA VRAM, AVX2, then ranks the top 5 GGUF models that fit. The Local step in `dirgha setup` runs the same probe and surfaces top-3 download-able models when neither local server is up. Catalogue: 9 ungated Q4_K_M GGUFs from `bartowski/` and `unsloth/` on HuggingFace, refreshed Apr 2026 (Qwen 3.5, Phi-4, Gemma 4, Mistral Small 3.2). `--json` emits the full profile + recommendations.
- **Five pillars.** README intro + `package.json` description rewritten to surface the new local-models pillar alongside BYOK, parallel agents, persistent memory, and skills.

## 1.4.0 — 2026-04-25

### Added

- **Soul.** Short Markdown persona shipped at `~/.dirgha/soul.md` (override) or the default that ships with the package. Defines tone, boundaries, end-of-turn norms. 4 KB cap.
- **Multi-key BYOK pool** with priority + LRU + cooldown + atomic file lock. 17 known providers (anthropic, openai, gemini, openrouter, nvidia, fireworks, deepseek, groq, cerebras, together, deepinfra, mistral, xai, perplexity, cohere, kimi, zai). `dirgha keys pool {add,list,remove,clear}`.
- **`dirgha login --provider=<id> [--key=…]`** interactive BYOK flow with hidden prompt fallback. Mode 0600.
- **`dirgha update --check / --self / --packages [--yes]`** — npm registry probing, prompt-gated upgrade, audit-logged.
- **`dirgha models refresh`** — parallel `/v1/models` fetch across configured providers, 24 h cache. Live: 499 models in <1 s.
- **TypeScript / ESM extensions API** — `~/.dirgha/extensions/<name>/index.mjs` exports a default function that calls `api.registerTool / registerSlash / registerSubcommand / on(event)`. Isolated load failures.
- **`dirgha undo [N]`** rolls back N user-turns from the most-recent session with a `.bak` snapshot. `--list / --json / --session=<id>` flags.
- **TF-IDF cosine search over the JSONL ledger** — `dirgha ledger search` defaults to ranked, `--exact` falls back to substring.
- **MCP HTTP transport** with async `bearerProvider` for OAuth token rotation per request.
- **StatusBar live tok/s readout** in green when busy ≥ 250 ms with non-zero output.
- **`dirgha cost {today,day,week,all}`** — reads the audit log, folds USD via the price registry.
- **`ask` mode** (read-only Q&A) — kernel-hook gate blocks every write tool. Cyan `[ASK]` badge.
- **34 model aliases** — `kimi`, `opus`, `sonnet`, `haiku`, `gemini`, `flash`, `deepseek`, `llama`, `ling`, `hy3`, … resolved before routing in main + resume + ask + chat + verify + fleet.
- **Workspace `git_state` injection** — branch + dirty + last 5 commits + staged diff (capped 4 KB) wired into the system prompt for interactive sessions.
- **Compaction telemetry** — `[compacted] X → Y tokens (-Z%)` banner + `kind:compaction` audit entry.
- `docs/ARCHITECTURE.md` + `docs/ROADMAP.md` + `docs/audits/HY3-AUDIT-2026-04-25.md`.

### Fixed

- **NIM streaming** silently dropped content on `deepseek-v4-flash` because the parser only recognised `delta.reasoning_content`, not `delta.reasoning`. Both keys are now accepted.
- **NIM + OR per-call timeouts** were 60 s / 120 s — too tight for multi-turn reasoning models. Bumped to 300 s.
- **Mid-session failover** previously triggered only on turn 0 errors. It now resumes from `result.messages` with `maxTurns − turnCount` budget remaining.
- **`dirgha keys set <ENV>` never reached providers** because the keystore wasn't hydrated into `process.env` at startup. Fixed; shell env still wins.
- **Login subcommand flags swallowed** by the top-level parser. Now passed through verbatim.
- **`task` tool was implemented but never registered** with the runtime tool registry. Wired in main.ts via SubagentDelegator.
- **ErrorClassifier was implemented but never instantiated.** Now wired into runAgentLoop in all three entry points.
- **`skills install <url>` flag injection** — defensively reject URLs starting with `-`.
- **Test paths hardcoded** to absolute prefixes — now portable via `import.meta.url`.

### Test floor

`npm run test:cli:offline` — **38 / 38 green in 16 s**. New suites this release: keypool (19/19), soul (17/17), update (23/23), models-refresh (24/24), extensions (29/29), nim-stream (10/10).

### Dogfood evidence

The 1.4.0 features were built using `dirgha -m hy3` as the implementation worker. The promo video at `changelog/1.4.1-promo.mp4` was authored from a brief and rendered by hyperframes.

## 0.2.0-beta.1 (2026-04-24) — new core + NVIDIA streaming fix

Second-generation CLI core under `src_v2/`, shipped as the `dirgha-v2` binary alongside the existing `dirgha` binary so users can switch on demand during the beta.

### Added (v2 core)

- Layered architecture with strict bottom-up dependency direction.
- Kernel: agent loop (ReAct + plan-execute hybrid), typed event stream, message assembly.
- Providers: unified interface + one canonical HTTP helper + adapters for NVIDIA NIM, OpenRouter (including the free-tier Ling 2.6 1T code workhorse), OpenAI, Anthropic (native Messages API), Google Gemini, Ollama, and a deprecated Fireworks shim.
- Tools: typed registry with per-model sanitisation, permission seam, diff engine, eight built-in tools (fs_read / fs_write / fs_edit / fs_ls / shell / search_grep / search_glob / git).
- Context: file-backed memory store, append-only JSONL sessions, automatic compaction via the summariser model, session branching.
- Extensions: skill loader (project / user / npm), MCP stdio client, subagent delegator + pool (with `task` tool), lifecycle hook registry.
- Surfaces: streaming terminal renderer, readline-based interactive REPL with slash commands, JSON-RPC daemon protocol + server, ACP adapter for IDE embedding.
- Safety: declarative policy engine, approval bus with pluggable subscribers, sandbox adapters for Seatbelt / Landlock (fallback) / bubblewrap / Windows / noop, hash-chained audit log.
- Intelligence: smart router (cheap vs. strong), provider-agnostic error classifier with recovery hints, cost tracker with per-session budgets, opt-in telemetry.
- Parity harness with scripted streaming / tool-call / unicode scenarios and a pluggable mock SSE server.
- Eval harness scaffold (internal regression runner, SWE-Bench / Terminal-Bench stubs, reporter).
- Integration clients: device-code auth flow, full Bucky surface (≈19 endpoints), Arniko security scanner with bootstrap helper, Dirgha Deploy projects + deployments + tarball upload + SSE log stream, entitlements check.
- Full-cycle composition flow (`plan → security scan → register → deploy → logs`).

### Fixed

- **NVIDIA NIM streaming stutter** (structural).
  Root cause: prior implementation sent `Content-Type: application/json` alongside `Accept: application/json`, breaking NIM's SSE content negotiation and producing truncated chunks. The v2 provider layer owns all HTTP headers in a single module; `Accept: text/event-stream` for streaming responses, `Content-Type: application/json` only when a request body is present, and the `extraHeaders` escape hatch explicitly rejects `accept` and `content-type` overrides. The class of bug cannot recur.

### Policy

- No source file, comment, identifier, or string literal in the v2 tree references any competing coding-agent CLI by name. Design documentation under `docs/dirgha-code/2026-04-23/` is the sole place competitor architectures are discussed, and those documents are internal reference material only.

## 0.1.0 (2026-04-20) — first public release

**Initial ship.** All surface stable; 27 slash command modules active, 85 user-facing slash commands, universal `--json` output, parallel multi-agent fleet.

### Added

- **Fleet** — parallel multi-agent in isolated git worktrees (`src/fleet/`)
  - `dirgha fleet launch <goal>` — decomposes goal, spawns N agents in parallel worktrees
  - `dirgha fleet triple <goal>` — 3 variants (conservative/balanced/bold) + judge picks winner
  - `dirgha fleet merge <agent-id>` — transient-commit 3-way apply-back (maw pattern)
  - `dirgha fleet list` / `dirgha fleet cleanup`
  - FleetPanel TUI live dashboard
- **Hub** — CLI-Anything plugin system (`dirgha hub search|install|list|remove|info|categories`)
- **Universal `--json`** — every command supports both `dirgha --json <cmd>` and `<cmd> --json`; output envelope is `{data, text, exitCode, command, timestamp, meta: {durationMs}}`
- **`/side <prompt>`** — Codex-style ephemeral sub-agent fork; doesn't pollute main history
- **Modal `/help`** — searchable overlay (type to filter, ↑↓ scroll, q/Esc close)
- **Spinner + elapsed time** on in-flight tool cells
- **Inline paste-collapse** — long pastes render as `[paste: N lines]` with first-line preview
- **Paste-burst detector** — Windows/terminal-safe; rapid `\n`-bursts coalesce instead of early-submitting
- **Fleet indicator** in status bar — `fleet × N` when ≥2 tools run in parallel
- **Auto-generated SKILL.md** on every `npm run build` (57 commands documented)
- **`__dump_spec`** — machine-readable commander introspection for tooling

### Fixed

- Tool calls piling up as "running…" — `onToolResult` now wired to agent loop
- StreamContainer event order — tools + text now interleave chronologically
- User prompt text-tearing on long pastes — width-constrained Boxes
- `dirgha hub --help` launched TUI instead of showing help (missing from SUBCOMMANDS)
- `dirgha ask` 500 — gateway URL was `/api/chat/completions` (broken) → `/api/cli/completions`
- NVIDIA BYOK model routing — added fallback chains for `minimaxai/minimax-m2.7` → `minimax-m2` → OpenRouter free tier
- Status bar `holo` phantom text removed
- Duplicate "⏳ queued" indicators
- User prompt disappearing on submit — now echoes immediately

### Removed

- 11 broken slash commands disabled (depended on missing `ctx.print` / `ctx.stream.markdown`): `/drop`, `/undo`, `/what`, `/screen`, `/scan`, `/secrets`, and all `/voice*`, `/net*`, `/fs*`, `/team*`, `/consensus*`, `/agent-*` families. Modules kept for future fix. See `docs/TUI_PARITY_ROADMAP.md`.
- 4 failing/cron GitHub Actions workflows (cost burn)

### Infrastructure

- Auto-SKILL.md regen as `postbuild` step
- `scripts/gen-skill-md.mjs` introspects commander at runtime
- `src/agent/output.ts` — shared `emit()` / `writeRaw()` / `installJsonCaptureIfEnabled()` for CLI-Anything JSON compliance

### Known issues

- NVIDIA NIM sometimes returns transient 502 — now handled by fallback chains
- Quota shows exceeded on local `dirgha status` (dev env) — honest reporting, not a bug
- TUI needs a real TTY — can't run in CI non-interactive mode (use `dirgha ask` for headless)

### Under the hood — standard terminology lock-in

Adopted industry-standard terms from the multi-agent workspace ecosystem audit (ccpm, claudio, genie, devteam, citadel, maw, agent-worktree):

| Term         | Meaning                                               |
| ------------ | ----------------------------------------------------- |
| **worktree** | Isolation unit (git worktree)                         |
| **fleet**    | Parallel agents on one goal                           |
| **subtask**  | Parallelizable stream within a fleet                  |
| **runtime**  | Compute environment (local / worktree / SSH — future) |
| **skill**    | Reusable capability bundle (CLI-Anything)             |
