# Dirgha CLI — Index

> Latest: **v1.33.5** | [npm](https://www.npmjs.com/package/@dirgha/code) | [GitHub](https://github.com/Dirgha-AI/dirgha-code)

## Quick Links

| Section                                            |                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Rendering & TUI](#rendering--tui)                 | Alternate buffer, message splitting, virtualized transcript, flicker detector, scroll indicator, paste collapse, vim paste fallback, paste threshold, double separator fix, pinnedEndIdx transcript scroll |
| [Streaming & Performance](#streaming--performance) | Flush throttle, Static committed history, spinners, React.memo, per-turn stream timeout, tool-call dropping gap fix |
| [Models & Providers](#models--providers)           | Per-provider catalogues, live sync, vendor prefix routing, health monitor     |
| [Context Windows & Rate Limits](#context-windows--rate-limits) | models.dev sync, maxOutputFor, circuit breaker, TPM sliding window |
| [Authentication & Login](#authentication--login)   | Device OAuth, TUI token loading, signup flow, secure approval                 |
| [Autonomous Systems](#autonomous-systems)          | Self-healing failover, remote config, auto-update, startup health, event listener leak fix, MCP lazy load race fix |
| [Sub-agents & Delegation](#sub-agents--delegation)  | Subagent Dashboard, task tool fixes, provider routing, error propagation |
| [Testing & Quality](#testing--quality)             | Self-test suite, E2E tests, regression guards, CI pipeline                    |
| [Developer Experience](#developer-experience)      | Interactive wizard, error UX, prompt history, syntax highlighting, full history cycling |
| [Architecture Decisions](#architecture-decisions)  | Smart backoff, no-aggressive-blacklist, vendor prefix priority                |
| [Internal Docs](#internal-docs)                    | Publish setup, model context/rate-limit architecture                          |
| [Release History](#release-history)                | Full changelog v1.20.9 → v1.42.14                                             |

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

### v1.33.3 — Live Item Cap Increase & Scroll Indicator

**Files:** `src/tui/ink/App.tsx`

The flicker overflow cap was 3x too aggressive (`Math.max(2, floor((rows-6)/4))` = 4 items on 24-row term). After the first overflow (which happens on any session > 5 turns), the user could only see the last 4 live items for the entire session — everywhere at the start of long responses was hidden.

**Fixed:** Formula changed to `Math.max(4, floor((rows-6)/1.5))` = 12 items on a 24-row term, 22 on 40-row. Plus a scroll indicator `[↑ N more items above — scroll up]` renders above the visible live items when capped.

### v1.33.3 — Paste Collapse Shows Lines Only

**Files:** `src/tui/ink/components/PasteCollapse.tsx`

Collapsed paste placeholder previously showed `[3 lines pasted, 42 chars]`. The char count was noise — users only care about lines. Changed to `[3 lines pasted]`. Expanded view similarly shows `[3 lines expanded]` instead of `[3 lines, 42 chars expanded]`.

### v1.33.3 — Vim NORMAL Paste Fallback

**Files:** `src/tui/ink/components/InputBox.tsx`

When in vim NORMAL mode with TextInput `focus=false`, paste events arriving through `useInput` as rapid keystrokes were silently dropped — `applyVimKey` returned `handled=false` for unrecognized characters.

**Fixed:** When an unrecognized printable key arrives in NORMAL mode, the character is inserted at the cursor position and the mode auto-switches to INSERT. Subsequent paste characters arrive with TextInput `focus=true` and are captured normally.

### v1.33.3 — Event Listener Leak Fix (Long Sprints)

**Files:** `src/kernel/agent-loop.ts`

The approval prompt race attached an abort listener to `cfg.signal` (the loop-level signal) via `addEventListener("abort", handler, { once: true })`. The `once` flag only self-removes if the signal fires — but in normal operation the signal never aborts. Every tool call across a long autonomous sprint accumulated one listener on the loop signal. After ~11 tool calls, Node hit its default `maxListeners` warning.

**Fixed:** The handler is now stored in a ref object and explicitly removed via `removeEventListener` after the Promise.race resolves. Zero accumulation across turns.

### v1.33.3 — Per-Turn Stream Timeout

**Files:** `src/kernel/agent-loop.ts`

`cfg.provider.stream()` had no timeout — if the provider hung (dropped connection, never sent a terminal event), the agent loop blocked forever. The user had to kill the process.

**Fixed:** Added `streamTimeoutMs` config option (default 300_000 / 5 min). Uses the same `raceSignals` + `setTimeout` pattern as the tool timeout. A per-turn `AbortController` races against the loop signal; if the timer fires, the stream is aborted and the error is classified as a retryable timeout. Timer and race listener are cleaned up in a `finally` block every turn. Also added `streamTtfbTimeoutMs` config (default 180_000 / 3 min) for future TTFB enforcement.

### v1.33.3 — MCP Lazy Load Race Fix

**Files:** `src/cli/main.ts`, `src/tools/exec.ts`

First tool call to a lazy-loaded MCP server returned "not registered" because `registry.get()` is synchronous — it fired `lazyLoadMcp()` but returned `origGet(name)` immediately before MCP servers finished loading.

**Fixed:** Added `mcpLoadPromise` that resolves when MCP lazy load completes. The `ToolExecutor` accepts `lazyLoadPromise` in its options; when a tool isn't found and the promise is pending, it awaits the promise and retries the lookup once. All 13+ call sites (agent loop, subcommands, fleet, ACP server, daemon) inherit this automatically.

### v1.33.3 — Per-Tool Timeout for rtk & Browser

**Files:** `src/tools/rtk.ts`, `src/tools/browser.ts`

Added `timeoutMs: 120_000` to both tool definitions. Previously only the agent loop's 120s catch-all protected them, producing a generic error message. Now the timeout error reads `Tool "rtk" timed out after 120000ms.` with proper duration metadata.

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

### v1.42.14 — Paste Collapse Threshold Lowered

**Files:** `src/tui/ink/components/PasteCollapse.tsx`

Collapse threshold lowered from 100 chars / 2 lines to **2 chars / 1 line**. Any multi-line paste is now summarised with a line count. Single-line pastes >= 80 chars show char count.

### v1.42.14 — Double Separator Line Removed

**Files:** `src/tui/ink/components/InputBox.tsx:14-21`, `src/tui/ink/App.tsx:1572`

InputBox had an extra `borderTop` box creating a double-thick separator above the input field. Removed the box — the `Divider` component at `App.tsx:1572` already provides the single separator line.

### v1.42.14 — Transcript Scroll Wiring (pinnedEndIdx)

**Files:** `src/tui/ink/App.tsx:404-421`, `src/tui/ink/use-transcript-scroll.ts`

Replaced flicker-based live item truncation with pinned-absolute-index virtual scrolling. `pinnedEndIdx` tracks the last visible live item — when the user scrolls up, new streaming items no longer push the viewport. Auto-scroll only fires when the user was at the bottom before the new item arrived. PageUp/PageDown scroll by half terminal height; Ctrl+PageUp/PageDown for input-focused mode; End (or Ctrl+End when focused) jumps to live tail. Indicator shows `[↓ N items below — scroll down]` when content exists below the viewport.

### v1.42.14 — Subagent Dashboard

**File:** `src/tui/ink/components/SubagentDashboard.tsx`

New Ink panel that tracks the full sub-agent lifecycle from the parent event stream: `toolcall_start` → `toolcall_end` (prompt capture), `tool_exec_start` → `tool_exec_end` (execution). Shows status (○ pending, ● running, ✓ completed, ✗ error), truncated prompt label, duration, and output preview. Handles race conditions where events arrive out of order. Rendered alongside existing `SubagentPanel` — both coexist. Full report: [`docs/cli/subagent-dashboard-and-delegation-fixes-2026-04-25.md`](subagent-dashboard-and-delegation-fixes-2026-04-25.md)

---

## Streaming & Performance

### v1.20.9 — DeepSeek Multi-Turn Fix

**Files:** `src/providers/openai-compat.ts`

Removed `if (this.includeThinking)` gate from reasoning_content delta capture. DeepSeek API returns `reasoning_content` regardless of the thinking model flag. Dropping it caused HTTP 400 on every subsequent turn ("reasoning_content must be passed back to the API"). Fix: always capture and echo back.

### v1.20.10 — Logo Jitter Fix

**Files:** `src/tui/ink/App.tsx`

`<Static items={[{ key: "logo" }]}>` memoized via `useMemo(() => [{ key: "logo" }], [])`. Previous code created new array/object references on every render, causing Ink's Static to re-evaluate.

### v1.42.14 — Tool-Call Dropping Gap Fix (commitLive)

**Files:** `src/tui/ink/use-event-projection.ts:commitLive`

Added synchronous drain of `pendingToolUpdatesRef` into `liveItemsRef.current` before `commitLive` reads `liveItemsRef` to build committed transcript items. Previously, `commitLive` and the async tool-update render path ran on different microtask ticks — if `commitLive` fired between a tool-spawned microtask and its `queueMicrotask` flush, the tool-call's output was lost (the tool appeared committed but silent). The drain guarantees all pending tool outputs are reflected in the committed snapshot.

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

## Sub-agents & Delegation

### v1.42.14 — Delegator Fixes (Tool Names, Provider Routing, Error Prop)

**File:** `src/subagents/delegator.ts`, `src/tools/task.ts`

Three systemic fixes to the sub-agent delegation pipeline:

1. **Tool name correction** — `DEFAULT_SUBAGENT_TOOLS` used wrong names
   (`read_file` → `fs_read`, `write_file` → `fs_write`, `edit_file` → `fs_edit`,
   `hover` → `hover_documentation`, `list_symbols` → `document_symbols`,
   `git_read` → `git`). Sub-agents with default tools could not read, write, or
   edit files.

2. **Provider routing** — `DelegatorOptions` changed from a single resolved
   `Provider` instance to `providers?: ProviderRegistry`. When a task requests
   a different model (e.g. `deepseek-v4-pro` while the parent uses Anthropic),
   the delegator now calls `providers.forModel()` to get the correct provider.
   Backward compat via optional `provider` fallback.

3. **Error propagation** — when the agent loop errors with no assistant message,
   the last tool error is extracted and returned instead of
   `"(sub-agent produced no output)"`.

Full report: [`docs/cli/subagent-dashboard-and-delegation-fixes-2026-04-25.md`](subagent-dashboard-and-delegation-fixes-2026-04-25.md)

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

### v1.42.14 — Arrow Up/Down Full History Cycling

**Files:** `src/tui/ink/components/InputBox.tsx:147-173`

Replaced single-recall history navigation with bash-style cycling through a `historyCacheRef`. Previously, pressing Up once recalled the last prompt but a second Up returned to the current draft (losing the historical trail). Now Up iterates backwards through the last 100 prompts; Down returns through them; at the bottom of the stack the original draft is restored. `historyCacheRef` snapshots the draft on first Up press so it survives navigation.

---

## Context Windows & Rate Limits

> Full spec: [`docs/_internal/MODEL_CONTEXT_RATELIMIT_ARCH.md`](../../_internal/MODEL_CONTEXT_RATELIMIT_ARCH.md)

### v1.33.5 — Proactive Compaction + WAL Checkpoint

**Files:** `src/kernel/agent-loop.ts`, `src/state/db.ts`, `src/intelligence/prices.ts`

- `contextLimit: contextWindowFor(activeModel)` wired into `runAgentLoop` — proactive compaction fires at 80% of the model's actual context window, not a hardcoded 128k fallback
- `"deepseek-ai/deepseek-chat": 128_000` added to `CONTEXT_WINDOWS` override map
- `PRAGMA wal_checkpoint(TRUNCATE)` added to `dbCloseSession` — prevents `dirgha.db-wal` from growing unbounded across long sessions

### v1.33.5 — models.dev as Context Window Source of Truth

**Files:** `src/intelligence/models-dev-sync.ts`, `src/intelligence/prices.ts`

**Problem:** `CONTEXT_WINDOWS` in `prices.ts` is a ~70-entry manually maintained map. Unknown models fall back to `DEFAULT_CONTEXT_WINDOW = 32_000`, causing premature compaction.

**Fix:** `models-dev-sync.ts` already fetches `https://models.dev/api.json` (4517 models, each with `contextWindow` + `maxOutput`). Adding a synchronous in-memory Map loaded at module init. `contextWindowFor()` queries this map first.

Lookup chain:
1. `CONTEXT_WINDOWS` override map (corrections for known-wrong models.dev entries)
2. models-dev Map: exact `modelId` match
3. models-dev Map: strip provider prefix (`"deepseek-ai/deepseek-chat"` → `"deepseek-chat"`)
4. `PRICES` catalog (`findContextWindow`)
5. `DEFAULT_CONTEXT_WINDOW = 64_000` (bumped from 32k)

New export: `maxOutputFor(modelId)` — same chain, returns `limit.output`. Used by providers to set `max_tokens`.

### v1.33.5 — Production Rate Limiter

**Files:** `src/providers/rate-limiter.ts`

Current rate-limiter uses a static per-provider RPS token bucket with no awareness of actual provider limits. Replacing with:

- **Static table** of RPM + TPM + concurrency per provider/tier (see arch doc for full table)
- **Dynamic header parsing** — `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` from every response
- **Circuit breaker** — opens after 5 consecutive 429s, cooldown starts at 60s and doubles (max 5min)
- **TPM sliding window** — 60-second rolling token counter per provider (replaces broken per-request delay math)
- **Jitter** on exponential backoff — `1s ± rand(1s)`, `2s ± rand(1s)`, … prevents thundering herd
- **Safety buffer** — buckets run at 85% of stated RPM to account for clock skew
- Backward-compatible: `withRateLimit()` decorator API preserved

---

## Internal Docs

| Doc | Purpose |
|---|---|
| [`docs/_internal/PUBLISH_SETUP.md`](../../_internal/PUBLISH_SETUP.md) | npm OIDC Trusted Publishers setup, what not to do, troubleshooting |
| [`docs/_internal/MODEL_CONTEXT_RATELIMIT_ARCH.md`](../../_internal/MODEL_CONTEXT_RATELIMIT_ARCH.md) | Full architecture spec for context windows + rate limits (written by DeepSeek, reviewed) |
| [`docs/audits/AUDIT-multi-agent-tui-landscape-2026-04-25.md`](../../audits/AUDIT-multi-agent-tui-landscape-2026-04-25.md) | Multi-agent TUI landscape analysis — X-Orchestrator, Cognigy, Claude Code, OpenAI Orchestration SDK, etc. |

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
| **v1.42.14** | 2026-04-25 | Arrow up/down full history cycling, paste collapse threshold lowered, double separator removed, tool-call dropping gap fix, pinnedEndIdx transcript scroll wiring |
| **v1.33.5**  | 2026-05-14 | models.dev context window source-of-truth, `maxOutputFor()`, production rate limiter (static table + circuit breaker + TPM window + header parsing), proactive compaction wired to real model context limit, WAL checkpoint on session close |
| **v1.33.3**  | 2026-04-25 | Startup perf (parallel BYOK, lazy MCP, deferred DB, fire-and-forget extensions), tool auto-retry, paste cursor fix, **event listener leak fix**, **per-turn stream timeout**, **MCP lazy load race fix**, **vim paste fallback**, **flicker cap increase + scroll indicator**, **paste collapse line-only**, **per-tool timeouts** |
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

_Last updated: 2026-04-25. Current build v1.42.14._
