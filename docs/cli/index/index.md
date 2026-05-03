# Dirgha CLI — Index

> Latest: **v1.20.25** | [npm](https://www.npmjs.com/package/@dirgha/code) | [GitHub](https://github.com/Dirgha-AI/dirgha-code)

## Quick Links

| Section                                            |                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Rendering & TUI](#rendering--tui)                 | Alternate buffer, message splitting, virtualized transcript, flicker detector |
| [Streaming & Performance](#streaming--performance) | Flush throttle, Static committed history, spinners, React.memo                |
| [Models & Providers](#models--providers)           | Per-provider catalogues, live sync, vendor prefix routing, health monitor     |
| [Authentication & Login](#authentication--login)   | Device OAuth, TUI token loading, signup flow, secure approval                 |
| [Autonomous Systems](#autonomous-systems)          | Self-healing failover, remote config, auto-update, startup health             |
| [Testing & Quality](#testing--quality)             | Self-test suite, E2E tests, regression guards, CI pipeline                    |
| [Developer Experience](#developer-experience)      | Interactive wizard, error UX, prompt history, syntax highlighting             |
| [Architecture Decisions](#architecture-decisions)  | Smart backoff, no-aggressive-blacklist, vendor prefix priority                |
| [Release History](#release-history)                | Full changelog v1.20.9 → v1.20.25                                             |

---

## Rendering & TUI

### v1.20.12 — Static Committed History (Gemini CLI parity)

**Files:** `src/tui/ink/App.tsx`

Committed transcript items now render inside Ink's `<Static>` component. On first render, Static captures and caches the output. On subsequent renders, it re-emits the cached output without re-rendering the React tree. Previously, every flush tick (every 80ms during streaming) re-conciliated the entire transcript — causing visible terminal flicker.

```
Before: <Box>{committedJsx}</Box>          ← re-renders every tick
After:  <Static items={...}>{el => el}</Static>  ← renders once, cached forever
```

### v1.20.12 — Flush Throttle

**Files:** `src/tui/ink/use-event-projection.ts`

Minimum flush delay increased from 30ms to 80ms. Rapid text deltas are accumulated and rendered at 12.5 FPS instead of 33 FPS. 200 raw deltas compress to ~4 render frames (50:1 throttle).

```
flushDelay(short)  = 80ms  (was 30ms)
flushDelay(medium) = 120ms (was 80ms)
flushDelay(long)   = 200ms (was 150ms)
```

### v1.20.14 — Alternate Buffer

**Files:** `src/tui/ink/index.ts`

TUI enters the terminal's alternate screen (`\x1b[?1049h`) on startup and exits (`\x1b[?1049l`) on quit. Eliminates "flashing background" caused by Ink frames writing over accumulated scrollback. SIGINT/SIGTERM restore terminal cleanly. Configurable via `alternateBuffer: false`.

### v1.20.14 — Message Splitting

**Files:** `src/tui/ink/markdown/split-point.ts`, `src/tui/ink/use-event-projection.ts`

Ported `findLastSafeSplitPoint()` from Gemini CLI. During streaming, when accumulated text exceeds 5000 chars, the older portion is split at safe markdown boundaries (`\n\n`, never inside fenced code blocks) and pushed to committed Static history. Only the trailing chunk stays dynamic — preventing React reconciliation thrash on large responses.

### v1.22.0 — Virtualized Transcript

**Files:** `src/tui/ink/components/VirtualTranscript.tsx`, `src/tui/ink/use-transcript-scroll.ts`

Windowed rendering for the transcript list. Only renders visible items + 5-item buffer. PageUp/PageDown scroll by half terminal height. Auto-scrolls to bottom during streaming; manual scroll up pauses auto-scroll. Shows `[N items above]` spacer.

### v1.22.0 — Flicker Detector & Render Metrics

**Files:** `src/tui/ink/use-flicker-detector.ts`, `src/tui/ink/use-render-metrics.ts`

Measures estimated frame height vs terminal rows. Warns on overflow (once per session, suppressed for first 5 startup frames). StatusBar shows `[!]` indicator. Alt+M toggles FPS/avg/p99 frame time metrics in StatusBar.

### v1.20.14 — React.memo & Spinner Sync

**Files:** `src/tui/ink/components/ToolBox.tsx`, `DenseToolMessage.tsx`, `StreamingText.tsx`, `SpinnerGlyph.tsx`

All streaming-sensitive components wrapped in `React.memo`. SpinnerGlyph instances share a module-level `GLOBAL_START` timestamp so all spinners rotate in lockstep — no visual strobing when multiple tools run.

### v1.22.0 — InputBox Cursor Flash Fix

**Files:** `src/tui/ink/components/InputBox.tsx`

Removed `key={textInputResetKey}` remount mechanism. Input reset now uses controlled `value` prop — no unmount/remount flash on clear.

### v1.22.0 — Date.now() Render Cleanup

**Files:** `src/tui/ink/use-elapsed.ts`, `ToolBox.tsx`, `DenseToolMessage.tsx`

Module-level 1s interval shared across all elapsed-time displays. Replaces per-component `Date.now()` calls in render that prevented effective memoization.

### v2.0.0 → v1.20.22 — Gemini CLI-Style Thinking Display

**Files:** `src/tui/ink/components/ThinkingBlock.tsx`

Thinking content rendered as always-visible bubble (Gemini CLI style). First line = bold italic heading (summary). Remainder = left-bordered italic block (body). No toggle/collapse required. No character counts.

### v1.22.0 — Diff Colors from Theme

**Files:** `src/tui/ink/components/ToolBox.tsx`

`renderDiffLines` now uses `palette.status.success/error/ui.focus` instead of hardcoded hex `#50fa7b/#ff5555/#00ffff`.

### v1.22.0 — Theme Consistency

**Files:** All components in `src/tui/ink/components/`

Removed all raw ANSI escape codes. Every color now uses `useTheme()` palette. Tool errors (exit != 0) render in red (`palette.status.error`). Paste collapse uses warning color.

---

## Streaming & Performance

### v1.20.9 — DeepSeek Multi-Turn Fix

**Files:** `src/providers/openai-compat.ts`

Removed `if (this.includeThinking)` gate from reasoning_content delta capture. DeepSeek API returns `reasoning_content` regardless of the thinking model flag. Dropping it caused HTTP 400 on every subsequent turn ("reasoning_content must be passed back to the API"). Fix: always capture and echo back.

### v1.20.10 — Logo Jitter Fix

**Files:** `src/tui/ink/App.tsx`

`<Static items={[{ key: "logo" }]}>` memoized via `useMemo(() => [{ key: "logo" }], [])`. Previous code created new array/object references on every render, causing Ink's Static to re-evaluate.

---

## Models & Providers

### v1.20.16 — Per-Provider Model Catalogues

**Files:** `src/providers/*-catalogue.ts` (12 files)

Unified `ModelDescriptor` interface with a catalogue file per provider. Every `supportsTools()`, `supportsThinking()`, `contextWindowFor()` call derives from the catalogue — no fragile regex. Critical bugs fixed: Anthropic thinking regex for Claude 5+, Gemini thinking regex for Gemini 3+, Perplexity/xAI thinking always false, Groq stale model entry.

### v1.20.18 — Vendor Prefix Priority

**Files:** `src/providers/dispatch.ts`

Vendor-prefix rules moved ABOVE NIM catalogue rule. When a user types `deepseek-ai/deepseek-v4-pro`, they explicitly chose native DeepSeek — the NIM catalogue should not hijack that. `deepseek-ai/` now routes to native `api.deepseek.com`, not NVIDIA NIM. `deepseek-v4-*` entries removed from NIM_CATALOGUE.

### v1.21.0 — Live Model Catalogue Sync

**Files:** `src/intelligence/remote-catalogue.ts`

Fetches live model catalogue from `api.dirgha.ai/api/cli/models` every 6 hours. Caches locally. Falls back to hardcoded catalogues if API unreachable. Gateway endpoint at `routes/cli-models.ts`.

### v1.21.0 — Provider Health Monitor

**Files:** `src/intelligence/health-monitor.ts`

Per-provider health tracking with exponential backoff cooldown. 5 failures in a window → 30s cooldown (not 30min). Each escalation only after persistent probe failures. 2 consecutive successes reset everything. Cooldown level decays after 24h of good behavior. Session-scoped failover blacklist for consecutive failures.

### v1.21.1 — Smart Backoff Policy

**Files:** `DEVELOPMENT.md`, `src/intelligence/health-monitor.ts`

Design principles codified: don't punish transient blips, escalate only for persistent failures, success aggressively decays failure windows, always-available fallback (`tencent/hy3-preview:free`), error messages tell user what to DO not what HAPPENED.

### v1.20.15 — Fleet Model Prefix Fix

**Files:** `src/fleet/tripleshot.ts`, `src/fleet/runner.ts`

Default model changed from `nvidia/minimaxai/minimax-m2.7` to `minimaxai/minimax-m2.7`. Spurious `nvidia/` prefix caused silent OpenRouter routing instead of NVIDIA NIM.

### v1.20.15 — Fireworks Provider

**Files:** `src/providers/fireworks.ts`

Provider fully functional. Stale deprecation comment removed. Wired in dispatch/registry/tests. Fireworks model catalogue added in v1.20.16.

---

## Authentication & Login

### v1.20.15 — TUI Auth Token Loading

**Files:** `src/tui/ink/App.tsx`

TUI previously hardcoded `getToken: () => null`. Now loads auth token from `~/.dirgha/credentials.json` on startup. `/login` slash command properly persists and surfaces tokens in the Ink TUI.

### v1.20.17 — Device Auth Gateway Fixes

**Files:** Gateway `routes/auth/device.ts`, Frontend `CliAuthPage.tsx`, `AuthCallback.tsx`

Gateway now accepts session cookies for `/authorize` (previously JWT-only). CSRF protection added to `/authorize`. Verification URI includes `?code=` for pre-fill. Frontend routes registered: `/device`, `/cli-auth`, `/auth/callback`. Login preserves `next` URL through OAuth roundtrip via `sessionStorage`.

### v1.20.17 — Device Auth Messaging

**Files:** `src/cli/subcommands/login.ts`, `src/cli/slash/login.ts`

Fallback URL and signup link added to device auth output. Handle `?code=` pre-fill from gateway without doubling the parameter.

### v1.20.11 — `/keys set` Process Env Hydration

**Files:** `src/cli/slash/keys.ts`

`/keys set` writes to keystore file AND now sets `process.env[envVar]`. Previously only wrote to file — provider constructors read `process.env` which was still empty, causing auth failures mid-session.

---

## Autonomous Systems

### v1.21.0 — Self-Healing Failover

**Files:** `src/intelligence/failover-chain.ts`, `src/kernel/agent-loop.ts`

Session-scoped failover blacklist. After 5 consecutive failovers on a model, it's blacklisted for the session. Automatic last-resort fallback to `tencent/hy3-preview:free`. Failover events logged to session transcript.

### v1.21.0 — Auto-Update Self

**Files:** `src/tui/ink/App.tsx`, `src/tui/ink/components/InputBox.tsx`, `src/cli/update-check.ts`

Ctrl+U in InputBox → `npm i -g @dirgha/code@latest`. Version-decline tracking in `~/.dirgha/state.json`. Non-blocking banner `[vX.Y.Z available — press Ctrl+U or /upgrade to upgrade]`.

### v1.21.0 — Autonomous Startup Health

**Files:** `src/tui/ink/use-startup-health.ts`

Silent health check on TUI mount: session store writable, memory store writable, disk space >= 100MB, at least one provider key configured. Warning banner if issues found. Cached for 24h.

### v1.21.0 — Live Config Sync

**Files:** `src/intelligence/remote-config.ts`

Remote config from `api.dirgha.ai/api/cli/config`. Recommended model auto-set if none configured. Minimum version nag forces upgrade prompt. MOTD shown once per session. Deprecated model warnings. Gateway endpoint at `routes/cli-config.ts`.

### v1.20.19 — Session Auto-Save

**Files:** `src/tui/ink/index.ts`, `src/cli/interactive.ts`, `src/cli/main.ts`

Sessions survive SIGINT, SIGTERM, and crashes. Auto-save fires in TUI, readline REPL, and one-shot modes. Sessions stored as JSONL + SQLite in `~/.dirgha/sessions/`.

---

## Testing & Quality

### v1.20.13 — TUI Jitter Tests (Vitest)

**Files:** `src/__tests__/tui-jitter.test.ts`

5 vitest tests mount the App component in a CaptureStream buffer and fire synthetic AgentEvents: flush throttle (100 deltas → < 25 frames), Static commit persistence, no duplication, text streaming, tool rendering.

### v1.20.19 — Regression Test Template

**Files:** `src/__tests__/regression.test.ts`

Template for adding regression tests for every bug fix. Tests for: reasoning_content echo-back, YOLO mode tool blocking, `/keys set` env hydration.

### v1.21.0 — E2E Live Tests

**Files:** `src/__tests__/e2e-gate.test.ts`

40 tests against production API: device auth flow, OpenRouter free model chat, tool call round-trip, key management persist/read, provider catalogue integrity (12 catalogues), dispatch routing integrity (all models). Skippable when API keys absent.

### v1.20.24 — Self-Test Suite

**Files:** `scripts/self-test.mjs`

9-test regression suite against live API with deepseek-v4-flash: version, help, update-check, keys, basic chat, shell tool, file read, multi-turn context, error handling. Run before every release.

---

## Developer Experience

### v1.20.19 — Interactive Onboarding Wizard

**Files:** `src/cli/first-run.ts`

Paste any API key on first run — auto-detects provider from key prefix. Saves to `~/.dirgha/keys.json`. Sets recommended model. First chat ready in < 30 seconds. No restart needed.

### v1.20.19 — Error UX (12 Classified Reasons)

**Files:** `src/intelligence/error-classifier.ts`

Errors now tell users WHAT to do, not WHAT happened. Auth errors distinguish "no key configured" from "key rejected (expired/wrong)". Rate limit → wait message. Billing → switch to free model. Model not found → try alternatives. Every error includes a concrete next action.

### v1.20.15 — Up/Down Arrow Prompt History

**Files:** `src/tui/ink/components/InputBox.tsx`, `src/tui/ink/App.tsx`

Navigate last 100 submitted prompts via Up/Down arrows. Current draft restored when navigating back down. Gemini CLI parity.

### v1.21.0 — Model Discovery UI

**Files:** `src/cli/slash/models.ts`

`/models` shows rich table from all 12 catalogues: ⭐ recommended, model ID, provider, context window, tools, thinking support, pricing. Grouped by provider.

### v1.22.0 — Syntax Highlighting in File Reads

**Files:** `src/tui/ink/markdown/syntax-highlight.ts`

Tokenizer highlights keywords (cyan), strings (green), comments (grey), numbers (yellow). Activated for `.ts/.tsx/.js/.py/.rs/.go/.json/.yaml/.sh/.md` files. Applied to `fs_read` tool output in ToolBox and DenseToolMessage.

### v1.22.0 — Compaction Thinking Preservation

**Files:** `src/context/compaction.ts`

Thinking content preserved as `[Previous assistant reasoning: ...]` in compaction summaries. Truncation increased from 300 to 1000 chars. Summariser prompt updated to preserve reasoning context.

### v1.22.0 — DB Write Telemetry

**Files:** `src/state/db-telemetry.ts`

Tracks DB write failures. Warns after 10 errors in a session. Exposed via `dirgha doctor`. No silent corruption.

---

## Architecture Decisions

**Smart Backoff, Not Aggressive Blacklist.** Provider health uses exponential backoff (30s → 2m → 5m → 15m → 30m → 1h → 6h → 24h). Each escalation only after persistent probe failures. 2 successes reset everything. Rewards long-term reliable providers.

**Vendor Prefixes Beat NIM Catalogue.** When a user types `deepseek-ai/deepseek-v4-pro`, the explicit `deepseek-ai/` vendor prefix routes to native DeepSeek — never hijacked by the NIM catalogue. The NIM catalogue is a model list, not a global routing table.

**Session-Scoped, Never Persisted.** Failover blacklists live only in memory and reset on restart. Don't punish a provider for yesterday's outage.

**Fallback Always Available.** `tencent/hy3-preview:free` is the eternal last resort. No API key required. Always routed through OpenRouter. No user gets stuck with "no model available."

**Nothing Breaks Silently.** DB write failure → logged. Config parse error → warns. Remote catalogue fetch fails → falls back to hardcoded catalogues. Every failure path has a fallback. Nothing is required for startup.

---

## Release History

| Version      | Date       | Highlights                                                                                                     |
| ------------ | ---------- | -------------------------------------------------------------------------------------------------------------- |
| **v1.20.25** | 2026-05-03 | Self-test suite, version sync                                                                                  |
| **v1.20.24** | 2026-05-03 | Self-test: 9 live API regression tests                                                                         |
| **v1.20.23** | 2026-05-03 | Flicker detector startup suppression                                                                           |
| **v1.20.22** | 2026-05-03 | Gemini CLI-style thinking display                                                                              |
| **v1.20.21** | 2026-05-03 | Version continuity                                                                                             |
| **v1.22.0**  | 2026-05-03 | Virtualized transcript, flicker detector, render metrics, DB telemetry, syntax highlighting, theme consistency |
| **v1.21.1**  | 2026-05-03 | Smart exponential backoff health monitor                                                                       |
| **v1.21.0**  | 2026-05-03 | Live catalogue sync, auto-update, remote config, E2E tests, regression tests                                   |
| **v1.20.19** | 2026-05-03 | Session auto-save, interactive wizard, error UX, DEVELOPMENT.md                                                |
| **v1.20.18** | 2026-05-03 | Vendor prefix priority, parity fix                                                                             |
| **v1.20.17** | 2026-05-03 | Device auth gateway fixes, auth messaging                                                                      |
| **v1.20.16** | 2026-05-03 | Per-provider catalogues (12 providers)                                                                         |
| **v1.20.15** | 2026-05-03 | TUI auth token, prompt history, fleet fix, fireworks                                                           |
| **v1.20.14** | 2026-05-03 | Alternate buffer, message splitting, React.memo, spinner sync                                                  |
| **v1.20.13** | 2026-05-03 | TUI jitter vitest tests                                                                                        |
| **v1.20.12** | 2026-05-03 | Static committed history, flush throttle                                                                       |
| **v1.20.11** | 2026-05-03 | `/keys set` env hydration fix                                                                                  |
| **v1.20.10** | 2026-05-03 | YOLO mode fix, logo jitter fix                                                                                 |
| **v1.20.9**  | 2026-05-03 | reasoning_content echo-back fix                                                                                |

---

_Last updated: 2026-05-03. CI publishing v1.20.25 to npm._
