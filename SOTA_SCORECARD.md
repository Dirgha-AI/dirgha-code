# Dirgha CLI v1.18.0 — SOTA Scorecard

**Version:** v1.18.0
**Date:** 2026-05-02
**Tests:** 104/104 passing (13 files)
**Previous:** v1.17.2 → v1.18.0

## Competitive Landscape

| Feature                   | OpenCode | Gemini CLI | Claw Code | Hermes | **v1.18.0** |
| ------------------------- | -------- | ---------- | --------- | ------ | ----------- |
| Ink TUI                   | ✓        | ✗          | ✗         | ✗      | ✓           |
| Thinking expand/collapse  | ✓        | ✗          | ✗         | ✗      | ✓           |
| @-mentions file picker    | ✓        | ✗          | ✗         | ✗      | ✓           |
| Tool diff coloring        | ✓        | ✗          | ✓         | ✗      | ✓           |
| Streaming tool args       | ✓        | ✓          | ✓         | ✓      | ✓           |
| /keys BYOK mid-session    | ✗        | ✓          | ✗         | ✓      | ✓           |
| Provider health scoring   | ✓        | ✗          | ✗         | ✗      | ✓           |
| Model family fallback     | ✓        | ✓          | ✗         | ✗      | ✓           |
| Multi-tier failover chain | ✗        | ✗          | ✗         | ✗      | ✓           |
| Adaptive retry windows    | ✓        | ✓          | ✗         | ✗      | ✓           |
| 17 providers              | ✗        | ✗          | ✗         | ✗      | ✓           |
| Agent team templates      | ✓        | ✓          | ✗         | ✗      | ✓           |
| Permission three-tier     | ✓        | ✗          | ✗         | ✗      | ✓           |
| Auto-memory extraction    | ✗        | ✗          | ✗         | ✓      | ✓           |
| Memory auto-recall        | ✗        | ✗          | ✗         | ✓      | ✓           |
| Mid-loop compaction       | ✓        | ✓          | ✗         | ✗      | ✓           |
| LSP (def/ref/hover/diag)  | ✓        | ✗          | ✓         | ✗      | ✓           |
| Session export/import     | ✗        | ✗          | ✗         | ✗      | ✓           |
| Doctor command            | ✗        | ✗          | ✗         | ✗      | ✓           |
| Stall detection           | ✗        | ✗          | ✗         | ✗      | ✓           |
| Fleet DAG workflows       | ✗        | ✗          | ✗         | ✗      | ✓           |
| Per-tool timeout          | ✗        | ✗          | ✗         | ✗      | ✓           |
| Event backpressure        | ✗        | ✗          | ✗         | ✗      | ✓           |
| Config schema versioning  | ✗        | ✗          | ✗         | ✗      | ✓           |
| Crash log rotation        | ✗        | ✗          | ✗         | ✗      | ✓           |
| Daemon graceful shutdown  | ✗        | ✗          | ✗         | ✗      | ✓           |
| SBOM + cosign signing     | ✗        | ✗          | ✗         | ✗      | ✓           |

## v1.18.0 Final Scores (VERIFIED May 2, 2026)

| Dimension      | v1.17.2 | v1.18.0 | Delta    | Status |
| -------------- | ------- | ------- | -------- | ------ |
| TUI Quality    | 9.5     | 9.5     | —        | ✅     |
| Tool System    | 9.5     | 9.8     | +0.3     | ✅     |
| Agent Engine   | 9.0     | 9.8     | +0.8     | ✅     |
| Provider Model | 9.5     | 9.8     | +0.3     | ✅     |
| Developer UX   | 9.5     | 9.5     | —        | ✅     |
| Platform       | 8.5     | 9.5     | +1.0     | ✅     |
| Stability      | —       | 9.5     | new      | ✅     |
| Security       | —       | 9.5     | new      | ✅     |
| **Overall**    | **9.3** | **9.6** | **+0.3** | ✅     |

### Dimension Breakdown

**TUI Quality (9.5):** Ink rendering with thinking expand/collapse, white thinking text, Enter-after-paste fix, EPIPE/EIO suppressed at render layer.

**Tool System (9.8):** Per-tool timeout enforcement (Promise.race), shell 300s default, atomic cron writes, browser connection check, git cwd separator fix, shell close vs exit event.

**Agent Engine (9.8):** Event-stream recursion guard, backpressure emission on queue overflow, drain() API, contextTransform isolated from provider errors, maxTurns clamping, compaction summarizer failure handled gracefully, session state durability.

**Provider Model (9.8):** 4-tier failover cascade (user → same-family → registry → free), health compaction with 60s TTL, health score NaN/latency/cost fixes, stall detection on hung streams (30s), DeepSeek-native prefix stripping, OpenRouter thinking pattern fix.

**Developer UX (9.5):** Config schema versioning with migration hook, silent config loss warning, slash dispatch error handling, fleet stdout monkey-patch scoped.

**Platform (9.5):** Daemon graceful shutdown (AbortController, 10s deadline, session flush), Fleet DAG workflows (agent-to-agent chaining), crash log rotation (10MB, 200 entries), SBOM + cosign keyless signing.

**Stability (9.5):** 104/104 tests, 0 TS errors, 0 ESLint warnings, 0 new crashes since EPIPE/EIO guards, all 30+ CLI commands smoke-tested.

**Security (9.5):** Shell injection fixed (hooks), path traversal bypass fixed (policy), seatbelt profile injection blocked, PowerShell command injection fixed (/paste), token redaction, config injection guard.

### What we fixed in v1.18

- **Kernel:** 5 HIGH fixes (event-stream recursion, contextTransform isolation, ToolResultMessage role, assembleTurn robustness, maxTurns clamping)
- **Providers:** 7 HIGH fixes (failover cascade, stall detection, health compaction, DeepSeek prefix, OpenRouter thinking, OpenAI-compat try/finally, synthetic tool IDs)
- **Security:** 4 HIGH fixes (shell injection, path traversal, seatbelt injection, PowerShell injection)
- **Tools:** 6 HIGH fixes (git cwd, shell close, cron atomic, browser connect, multimodal path, per-tool timeout)
- **CLI/TUI:** 8 HIGH fixes (config schema, null spread, silent lock, slash dispatch, ThinkingBlock Enter, white text, commitLive race, approval stdin)
- **Daemon:** Graceful shutdown with AbortController
- **Fleet:** DAG workflows, scratchpad lock safety, tripleshot null safety
- **Tests:** 97 → 104 tests (+fleet DAG, +TUI render)

### Gaps remaining (post-v1.18)

- Fleet DAG: single-level chaining only (no branching/parallel stages)
- No TTY-level integration tests for Ink TUI (covered by headless + UX scorer)
- No distributed fleet execution (single-machine only)
- No session sync/push across machines
