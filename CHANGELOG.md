# Dirgha CLI — Changelog

All notable changes are tracked here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); we use [Semantic Versioning](https://semver.org/).

## [1.43.3](https://github.com/Dirgha-AI/dirgha-code/compare/v1.43.2...v1.43.3) (2026-05-21)


### Bug Fixes

* **orchestra:** pass LLM keys to spawned agents, add timeout, surface log errors ([65686df](https://github.com/Dirgha-AI/dirgha-code/commit/65686dfaa7f65097d8056bba9182ea591349a53e))

## [1.42.3] — 2026-04-25

### Bug Fixes

* **tui:** input border flicker on mobile — replaced full `borderStyle="single"` box with thin top-only separator, gated behind `isSmallTerminal()`; removed hard-coded `width={cols}` on InputBox (`src/tui/ink/components/InputBox.tsx`)
* **tui:** gap between messages and input bar — `flexGrow={1}` on live transcript area anchors InputBox to bottom (`src/tui/ink/App.tsx`)
* **docs:** agent guidance for long-running shell commands — `nohup` + poll pattern documented at `docs/agents/long-running-commands.md`

## [1.25.0] — 2026-05-11

### Features

* **providers:** DirghaProvider — sign in once with `dirgha login`, get access to 300+ OpenRouter models without managing an API key ([`~/.dirgha/credentials.json`](src/providers/dirgha.ts))
* **cli:** cold-start wizard blocks on unconfigured installs and guides user through login or BYOK setup (`first-run.ts`, `wizard.ts`, `setup.ts`)

### Bug Fixes

* **tui:** mobile jitter — `isSmallTerminal()` now re-evaluates on SIGWINCH instead of caching at startup; flush floor auto-adapts to 200ms, spinner to 200ms, statusbar tick to 3s on terminals <80 cols or <30 rows
* **tui:** SIGWINCH debounced in `index.ts` — phone rotation no longer triggers immediate full Ink repaint, debounced by `minFlushMs()`
* **tui:** `use-elapsed` interval now uses `statusbarTickMs()` instead of hardcoded 1000ms; restarts on resize
* **tui:** tool lifecycle events (`toolcall_start/end`, `tool_exec_start/end`) batched through microtask queue — 4 repaints per tool call reduced to 1
* **tui:** adaptive backpressure — `flushDelay()` raises floor automatically when actual frame render time exceeds `minFlushMs() × 1.5` (EMA smoothed, 500ms cap)
* **providers:** `deepseek/` prefix routes to native DeepSeek direct API (not NVIDIA NIM) — flash model no longer hangs
* **providers:** `ring-2.6-1t:free` replaces retired `ling-2.6-1t:free` across fallback chain, E2E tests, and CI judge fleet

## [1.23.0](https://github.com/Dirgha-AI/dirgha-code/compare/v1.22.0...v1.23.0) (2026-05-08)


### Features

* 10/10 polish — collapsible thinking, theme consistency, syntax highlighting, stream spinner ([e47e687](https://github.com/Dirgha-AI/dirgha-code/commit/e47e687108959823462e8999796a4178c11c8eee))
* dirgha-self-test — 9-test regression suite against live API ([eed2b95](https://github.com/Dirgha-AI/dirgha-code/commit/eed2b95845aa4aaca01260ccdb087cd59aa86ec5))
* dirgha-self-test — comprehensive live API regression suite ([9087b64](https://github.com/Dirgha-AI/dirgha-code/commit/9087b645713aa31e17d3772c911b2945abf85624))
* **embeddings:** local Xenova + remote HTTP adapters ([#68](https://github.com/Dirgha-AI/dirgha-code/issues/68)) ([9f557c1](https://github.com/Dirgha-AI/dirgha-code/commit/9f557c10459cfe43a8f00c61ebc44e22fd009ddd))
* fleet --template &lt;name&gt; wires TEAM_TEMPLATES into runFleet() — skip LLM ([6f88fd3](https://github.com/Dirgha-AI/dirgha-code/commit/6f88fd3f3609522d377ba15e261311d16e9bba82))
* Gemini CLI-style thinking — always visible bubble, summary+body ([8e0c6bc](https://github.com/Dirgha-AI/dirgha-code/commit/8e0c6bc85e744107298ea86a6a9907eb9e369910))
* github tool + shell PTY streaming ([3f3adf2](https://github.com/Dirgha-AI/dirgha-code/commit/3f3adf27a10a7ba69cea5401c276b9b9fb1b688e))
* push CLI audit entries to gateway at turn-end ([13e83d4](https://github.com/Dirgha-AI/dirgha-code/commit/13e83d409665188b7db768090a601d0661599208))
* **safety:** explicit /sandbox mode + Ink picker + 20 regression tests ([6aac42c](https://github.com/Dirgha-AI/dirgha-code/commit/6aac42c1ebda69ed4878a93520dc44a8951cd275))
* **state:** graph_nodes + graph_edges + graph_neighbors + graph_traverse tools ([#66](https://github.com/Dirgha-AI/dirgha-code/issues/66)) ([59bebba](https://github.com/Dirgha-AI/dirgha-code/commit/59bebba7eb938f4f0fd4a34ec8fa37c16f534762))
* **state:** markdown memory/KB → SQLite-backed index + db_workspace_info tool ([#69](https://github.com/Dirgha-AI/dirgha-code/issues/69)) ([b35a296](https://github.com/Dirgha-AI/dirgha-code/commit/b35a296be51227dc866711676166a9b16b666e5b))
* **state:** single-transaction API across relational + FTS + vector + graph ([#67](https://github.com/Dirgha-AI/dirgha-code/issues/67)) ([f098705](https://github.com/Dirgha-AI/dirgha-code/commit/f0987054595179c417ef7390aac9aa9b804d1dea))
* **state:** sqlite-vec extension + embeddings virtual table + kb_search tool ([#65](https://github.com/Dirgha-AI/dirgha-code/issues/65)) ([4939c35](https://github.com/Dirgha-AI/dirgha-code/commit/4939c351c1639ac4dc018db68953d0b95b7b493c))
* **tui:** LLM-emitted session title on first response ([bd4906d](https://github.com/Dirgha-AI/dirgha-code/commit/bd4906d6fdbc133442a553d66b280d354beba7f3))
* v1.20.26 — security hardening + fleet templates + config locking ([6f88fd3](https://github.com/Dirgha-AI/dirgha-code/commit/6f88fd3f3609522d377ba15e261311d16e9bba82))


### Bug Fixes

* add git to WRITE_TOOLS, default-block browser without explicit action ([36c482c](https://github.com/Dirgha-AI/dirgha-code/commit/36c482ce79b0d32bb122a667defc69853afa3d61))
* advisory lockfile around config read+merge+write (10-retry, stale steal). ([6f88fd3](https://github.com/Dirgha-AI/dirgha-code/commit/6f88fd3f3609522d377ba15e261311d16e9bba82))
* **audit:** tail exits cleanly in non-TTY context ([5f084ff](https://github.com/Dirgha-AI/dirgha-code/commit/5f084ff32508000d16510d161fd0e54beb32c6fd))
* **ci:** remove vite override to eliminate rolldown native binding failure ([8b7713f](https://github.com/Dirgha-AI/dirgha-code/commit/8b7713f8abe0bd8cb9208a9bccbd243fda1bf425))
* **cli:** YOLO mode interactive env propagation + jitter stability test harness ([6a5aec0](https://github.com/Dirgha-AI/dirgha-code/commit/6a5aec038e17a5cc9c913a6045a967788f939789))
* **doctor:** cwd-independent playwright probe + singleton memory probe ([21bc276](https://github.com/Dirgha-AI/dirgha-code/commit/21bc276c753b7bdd6d236a7301a681c258461072))
* **doctor:** legacy doctor-probe-&lt;ts&gt; sweep + --strict exit gate ([9bc6cf9](https://github.com/Dirgha-AI/dirgha-code/commit/9bc6cf9a88bf6529bac294c5117aea13eea97977))
* **failover:** demote MiniMax-M2.7 + Llama-4-Maverick from auto-pick ([5c0dc1e](https://github.com/Dirgha-AI/dirgha-code/commit/5c0dc1e9bbdeb3629a46207e9178805998cb9747))
* **kernel:** race tool.execute against ctx.signal — ESC aborts within ~50ms ([48e512a](https://github.com/Dirgha-AI/dirgha-code/commit/48e512ab94cf46136d10fc91a0ea9568ba73cb4e))
* **memory:** slugify single-arg `memory add` + fix terminology ([6b5a1d2](https://github.com/Dirgha-AI/dirgha-code/commit/6b5a1d296056a55410cf6a21d2496d4b38394691))
* **providers:** tighten total request timeout from 5min to 90s ([704d97c](https://github.com/Dirgha-AI/dirgha-code/commit/704d97c1094aceacfb215ff084e24654050c88ac))
* publish uses NODE_AUTH_TOKEN instead of OIDC trusted publisher ([b69eddc](https://github.com/Dirgha-AI/dirgha-code/commit/b69eddc6db09bfee5fa05b8a82213d768b2d008f))
* remove unused vars — unblock CI lint gate ([4e6d35f](https://github.com/Dirgha-AI/dirgha-code/commit/4e6d35f2d7590f6cdfd6c76dfff10b901844b059))
* resolve all 8 CLI offline test failures ([4de18cb](https://github.com/Dirgha-AI/dirgha-code/commit/4de18cbfbeeb437b397ad9cd3ee3101c2e46e777))
* skip vendor builds gracefully when SHA is PENDING ([5fd2d51](https://github.com/Dirgha-AI/dirgha-code/commit/5fd2d51c0ead562c301597b0b839ed646395a17d))
* **smoke:** repair nightly Provider Smoke matrix ([a59469f](https://github.com/Dirgha-AI/dirgha-code/commit/a59469f42ca81948cc95803f0d6d1352a187e141))
* **state:** migrate legacy messages/sessions schema on open ([3b307b7](https://github.com/Dirgha-AI/dirgha-code/commit/3b307b79492cab4c39a681d08078de9b9452a1ca))
* **state:** use createRequire for better-sqlite3 in ESM context ([01b3652](https://github.com/Dirgha-AI/dirgha-code/commit/01b3652d7f0106e27d629d3889323dd4a2035c06))
* suppress flicker detector false-positives during TUI startup (first 5 frames) ([634dfd1](https://github.com/Dirgha-AI/dirgha-code/commit/634dfd1f64e6f347a7e4ae55a4e55d6d6ee9469e))
* sync package.json to v1.20.25 ([49d209c](https://github.com/Dirgha-AI/dirgha-code/commit/49d209c41da659fd5a4a361041b557a00cd74605))
* ThinkingBlock palette.colors.border type error ([53ba9b6](https://github.com/Dirgha-AI/dirgha-code/commit/53ba9b6f405a900e820312e573333e8e90d5d2a3))
* **tui+kernel:** logo re-emit flicker + TTFT retry storm ([4dc8448](https://github.com/Dirgha-AI/dirgha-code/commit/4dc8448eb9343baf3e996a0ade05f44e0ec5075a))
* **tui:** default alt buffer off + emit OSC terminal title ([1f7dbb4](https://github.com/Dirgha-AI/dirgha-code/commit/1f7dbb41ac8eb4fbfad5b0a8ec5f8ab2f0a68336))
* **tui:** eliminate logo flicker and layout instability ([82d8d8f](https://github.com/Dirgha-AI/dirgha-code/commit/82d8d8f1c8142149117892573dde7ce2629048a0))
* **tui:** reliable ESC/Ctrl-C abort + reduced tool-progress flicker ([9fb8998](https://github.com/Dirgha-AI/dirgha-code/commit/9fb89982a72fca10852fcf3e362ce1ac53823368))
* **tui:** stop 1Hz body pulse from idle ToolBox elapsed subscriptions ([c734d97](https://github.com/Dirgha-AI/dirgha-code/commit/c734d976b0cf5953518b19d74148ef19d6fe04de))
* **tui:** upgrade ink 5→7 + react 18→19 for synchronized output (DECSET 2026) ([cf9eb4f](https://github.com/Dirgha-AI/dirgha-code/commit/cf9eb4f3beb50ac7517c6aa4b10114b3c6b6739c))
* **tui:** warming-up hint after 5s on slow free-tier first-token ([3670adb](https://github.com/Dirgha-AI/dirgha-code/commit/3670adba78a811f0f0270a88b8cc0e64a4f14db1))
* unused variable + undefined reference in compaction.ts ([e45d6f1](https://github.com/Dirgha-AI/dirgha-code/commit/e45d6f140f3a8f4827d49af72c88cdce750ec5c2))
* update bug-regression expectations for mode enforcement ([c032a0e](https://github.com/Dirgha-AI/dirgha-code/commit/c032a0ebe405494925cd6b97028c60aad061f956))
* UX scorer non-blocking — recording infra broken in CI (0 chars captured) ([aee9678](https://github.com/Dirgha-AI/dirgha-code/commit/aee96780f76fc616ac4cb33aed8601cf968f4d69))

## [1.22.0](https://github.com/Dirgha-AI/dirgha-code/compare/v1.21.0...v1.22.0) (2026-05-08)


### Features

* 10/10 polish — collapsible thinking, theme consistency, syntax highlighting, stream spinner ([e47e687](https://github.com/Dirgha-AI/dirgha-code/commit/e47e687108959823462e8999796a4178c11c8eee))
* dirgha-self-test — 9-test regression suite against live API ([eed2b95](https://github.com/Dirgha-AI/dirgha-code/commit/eed2b95845aa4aaca01260ccdb087cd59aa86ec5))
* dirgha-self-test — comprehensive live API regression suite ([9087b64](https://github.com/Dirgha-AI/dirgha-code/commit/9087b645713aa31e17d3772c911b2945abf85624))
* fleet --template &lt;name&gt; wires TEAM_TEMPLATES into runFleet() — skip LLM ([6f88fd3](https://github.com/Dirgha-AI/dirgha-code/commit/6f88fd3f3609522d377ba15e261311d16e9bba82))
* Gemini CLI-style thinking — always visible bubble, summary+body ([8e0c6bc](https://github.com/Dirgha-AI/dirgha-code/commit/8e0c6bc85e744107298ea86a6a9907eb9e369910))
* github tool + shell PTY streaming ([3f3adf2](https://github.com/Dirgha-AI/dirgha-code/commit/3f3adf27a10a7ba69cea5401c276b9b9fb1b688e))
* push CLI audit entries to gateway at turn-end ([13e83d4](https://github.com/Dirgha-AI/dirgha-code/commit/13e83d409665188b7db768090a601d0661599208))
* Sprint 4-5 — virtualized transcript, flicker detector, render metrics, InputBox cleanup, Date.now fix, compaction thinking, DB telemetry ([b66803d](https://github.com/Dirgha-AI/dirgha-code/commit/b66803db2400506f8b8ffe28b4a64b903506d224))
* **tui:** LLM-emitted session title on first response ([bd4906d](https://github.com/Dirgha-AI/dirgha-code/commit/bd4906d6fdbc133442a553d66b280d354beba7f3))
* v1.20.26 — security hardening + fleet templates + config locking ([6f88fd3](https://github.com/Dirgha-AI/dirgha-code/commit/6f88fd3f3609522d377ba15e261311d16e9bba82))


### Bug Fixes

* add git to WRITE_TOOLS, default-block browser without explicit action ([36c482c](https://github.com/Dirgha-AI/dirgha-code/commit/36c482ce79b0d32bb122a667defc69853afa3d61))
* advisory lockfile around config read+merge+write (10-retry, stale steal). ([6f88fd3](https://github.com/Dirgha-AI/dirgha-code/commit/6f88fd3f3609522d377ba15e261311d16e9bba82))
* **audit:** tail exits cleanly in non-TTY context ([5f084ff](https://github.com/Dirgha-AI/dirgha-code/commit/5f084ff32508000d16510d161fd0e54beb32c6fd))
* **ci:** remove vite override to eliminate rolldown native binding failure ([8b7713f](https://github.com/Dirgha-AI/dirgha-code/commit/8b7713f8abe0bd8cb9208a9bccbd243fda1bf425))
* **cli:** YOLO mode interactive env propagation + jitter stability test harness ([6a5aec0](https://github.com/Dirgha-AI/dirgha-code/commit/6a5aec038e17a5cc9c913a6045a967788f939789))
* **doctor:** cwd-independent playwright probe + singleton memory probe ([21bc276](https://github.com/Dirgha-AI/dirgha-code/commit/21bc276c753b7bdd6d236a7301a681c258461072))
* **doctor:** legacy doctor-probe-&lt;ts&gt; sweep + --strict exit gate ([9bc6cf9](https://github.com/Dirgha-AI/dirgha-code/commit/9bc6cf9a88bf6529bac294c5117aea13eea97977))
* **failover:** demote MiniMax-M2.7 + Llama-4-Maverick from auto-pick ([5c0dc1e](https://github.com/Dirgha-AI/dirgha-code/commit/5c0dc1e9bbdeb3629a46207e9178805998cb9747))
* **memory:** slugify single-arg `memory add` + fix terminology ([6b5a1d2](https://github.com/Dirgha-AI/dirgha-code/commit/6b5a1d296056a55410cf6a21d2496d4b38394691))
* **providers:** tighten total request timeout from 5min to 90s ([704d97c](https://github.com/Dirgha-AI/dirgha-code/commit/704d97c1094aceacfb215ff084e24654050c88ac))
* publish uses NODE_AUTH_TOKEN instead of OIDC trusted publisher ([b69eddc](https://github.com/Dirgha-AI/dirgha-code/commit/b69eddc6db09bfee5fa05b8a82213d768b2d008f))
* remove unused vars — unblock CI lint gate ([4e6d35f](https://github.com/Dirgha-AI/dirgha-code/commit/4e6d35f2d7590f6cdfd6c76dfff10b901844b059))
* resolve all 8 CLI offline test failures ([4de18cb](https://github.com/Dirgha-AI/dirgha-code/commit/4de18cbfbeeb437b397ad9cd3ee3101c2e46e777))
* skip vendor builds gracefully when SHA is PENDING ([5fd2d51](https://github.com/Dirgha-AI/dirgha-code/commit/5fd2d51c0ead562c301597b0b839ed646395a17d))
* smart exponential-backoff health monitor instead of aggressive blacklist ([79647c3](https://github.com/Dirgha-AI/dirgha-code/commit/79647c32648f059528064d810a61d079d333921f))
* **smoke:** repair nightly Provider Smoke matrix ([a59469f](https://github.com/Dirgha-AI/dirgha-code/commit/a59469f42ca81948cc95803f0d6d1352a187e141))
* **state:** migrate legacy messages/sessions schema on open ([3b307b7](https://github.com/Dirgha-AI/dirgha-code/commit/3b307b79492cab4c39a681d08078de9b9452a1ca))
* **state:** use createRequire for better-sqlite3 in ESM context ([01b3652](https://github.com/Dirgha-AI/dirgha-code/commit/01b3652d7f0106e27d629d3889323dd4a2035c06))
* suppress flicker detector false-positives during TUI startup (first 5 frames) ([634dfd1](https://github.com/Dirgha-AI/dirgha-code/commit/634dfd1f64e6f347a7e4ae55a4e55d6d6ee9469e))
* sync package.json to v1.20.25 ([49d209c](https://github.com/Dirgha-AI/dirgha-code/commit/49d209c41da659fd5a4a361041b557a00cd74605))
* ThinkingBlock palette.colors.border type error ([53ba9b6](https://github.com/Dirgha-AI/dirgha-code/commit/53ba9b6f405a900e820312e573333e8e90d5d2a3))
* **tui+kernel:** logo re-emit flicker + TTFT retry storm ([4dc8448](https://github.com/Dirgha-AI/dirgha-code/commit/4dc8448eb9343baf3e996a0ade05f44e0ec5075a))
* **tui:** default alt buffer off + emit OSC terminal title ([1f7dbb4](https://github.com/Dirgha-AI/dirgha-code/commit/1f7dbb41ac8eb4fbfad5b0a8ec5f8ab2f0a68336))
* **tui:** eliminate logo flicker and layout instability ([82d8d8f](https://github.com/Dirgha-AI/dirgha-code/commit/82d8d8f1c8142149117892573dde7ce2629048a0))
* **tui:** reliable ESC/Ctrl-C abort + reduced tool-progress flicker ([9fb8998](https://github.com/Dirgha-AI/dirgha-code/commit/9fb89982a72fca10852fcf3e362ce1ac53823368))
* **tui:** stop 1Hz body pulse from idle ToolBox elapsed subscriptions ([c734d97](https://github.com/Dirgha-AI/dirgha-code/commit/c734d976b0cf5953518b19d74148ef19d6fe04de))
* **tui:** upgrade ink 5→7 + react 18→19 for synchronized output (DECSET 2026) ([cf9eb4f](https://github.com/Dirgha-AI/dirgha-code/commit/cf9eb4f3beb50ac7517c6aa4b10114b3c6b6739c))
* **tui:** warming-up hint after 5s on slow free-tier first-token ([3670adb](https://github.com/Dirgha-AI/dirgha-code/commit/3670adba78a811f0f0270a88b8cc0e64a4f14db1))
* unused variable + undefined reference in compaction.ts ([e45d6f1](https://github.com/Dirgha-AI/dirgha-code/commit/e45d6f140f3a8f4827d49af72c88cdce750ec5c2))
* update bug-regression expectations for mode enforcement ([c032a0e](https://github.com/Dirgha-AI/dirgha-code/commit/c032a0ebe405494925cd6b97028c60aad061f956))
* UX scorer non-blocking — recording infra broken in CI (0 chars captured) ([aee9678](https://github.com/Dirgha-AI/dirgha-code/commit/aee96780f76fc616ac4cb33aed8601cf968f4d69))

## [1.21.0](https://github.com/Dirgha-AI/dirgha-code/compare/v1.20.39...v1.21.0) (2026-05-08)


### Features

* **tui:** LLM-emitted session title on first response ([bd4906d](https://github.com/Dirgha-AI/dirgha-code/commit/bd4906d6fdbc133442a553d66b280d354beba7f3))

## [1.20.39](https://github.com/Dirgha-AI/dirgha-code/compare/v1.20.38...v1.20.39) (2026-05-08)


### Bug Fixes

* **tui:** default alt buffer off + emit OSC terminal title ([1f7dbb4](https://github.com/Dirgha-AI/dirgha-code/commit/1f7dbb41ac8eb4fbfad5b0a8ec5f8ab2f0a68336))

## [1.20.38](https://github.com/Dirgha-AI/dirgha-code/compare/v1.20.37...v1.20.38) (2026-05-08)


### Bug Fixes

* **tui:** upgrade ink 5→7 + react 18→19 for synchronized output (DECSET 2026) ([cf9eb4f](https://github.com/Dirgha-AI/dirgha-code/commit/cf9eb4f3beb50ac7517c6aa4b10114b3c6b6739c))

## [1.20.37](https://github.com/Dirgha-AI/dirgha-code/compare/v1.20.36...v1.20.37) (2026-05-08)


### Bug Fixes

* **tui:** stop 1Hz body pulse from idle ToolBox elapsed subscriptions ([c734d97](https://github.com/Dirgha-AI/dirgha-code/commit/c734d976b0cf5953518b19d74148ef19d6fe04de))

## [1.20.36](https://github.com/Dirgha-AI/dirgha-code/compare/v1.20.35...v1.20.36) (2026-05-08)


### Bug Fixes

* **tui+kernel:** logo re-emit flicker + TTFT retry storm ([4dc8448](https://github.com/Dirgha-AI/dirgha-code/commit/4dc8448eb9343baf3e996a0ade05f44e0ec5075a))

## [1.20.35](https://github.com/Dirgha-AI/dirgha-code/compare/v1.20.34...v1.20.35) (2026-05-08)


### Bug Fixes

* **cli:** YOLO mode interactive env propagation + jitter stability test harness ([6a5aec0](https://github.com/Dirgha-AI/dirgha-code/commit/6a5aec038e17a5cc9c913a6045a967788f939789))
* **smoke:** repair nightly Provider Smoke matrix ([a59469f](https://github.com/Dirgha-AI/dirgha-code/commit/a59469f42ca81948cc95803f0d6d1352a187e141))

## [1.20.34] — 2026-05-08

### Fixed

- **5-min total-request timeout was too lenient.** `nvidia.ts`, `openrouter.ts`, and `deepseek.ts` defaulted `timeoutMs` to 300_000. Combined with the 30 s mid-stream stall detector that's effectively the worst-case wait a user can hit on a stuck upstream — verified live: `meta/llama-4-maverick-17b-128e-instruct` on NIM hangs 300 s on tool-call requests before erroring out. Lowered to 90_000 across all three adapters: enough headroom for any single-turn LLM response, but the user now waits ≤90 s on a wedged provider instead of 5 min.
- **`buildFailoverChain` could auto-pick known-broken free models.** Two free NIM models reliably hung in the 2026-05-08 audit: `minimaxai/minimax-m2.7` (60 s timeout, 0 bytes) and `meta/llama-4-maverick-17b-128e-instruct` (300 s on tool calls). `src/intelligence/failover-chain.ts` now soft-blacklists both from the free-fallback tier so a primary failure doesn't auto-route onto a wedged model. They remain in `dirgha models list` for manual `--model` selection.
- **`dirgha doctor` cleans up legacy `doctor-probe-<ts>` pollution on first run.** v1.20.33 stopped *creating* timestamped probe entries (singleton id now), but machines upgraded from earlier versions still carried the old pile. `checkMemoryStore` now sweeps any id matching `^doctor-probe-\d+` before writing the singleton, so a single doctor invocation cleans up the backlog.
- **`dirgha doctor` exit code now gates on local checks only by default.** Pre-fix, an invalid Anthropic key (or any remote-auth failure) caused exit 1, breaking the use of `dirgha doctor` as a CI smoke probe. Now: default exit considers only local checks (`node`, `git`, `dirgha-home`, `terminal`, `lsp`, `cron`, `disk-space`, `session-store`, `memory-store`, `db-errors`); pass `--strict` to restore the union behaviour.
- **TUI spinner now shows "warming up" hint on slow first-token.** The `GeneratingIndicator` rendered a static `generating…` for the entire duration of the agent turn. On free-tier NIM models with 10-30 s time-to-first-token (Kimi K2.6 routinely) new users assumed the CLI was stuck. The indicator now shows elapsed seconds and, after 5 s of zero output tokens, switches to `warming up · 12s · first token can take 10-30s on free models`. Flips back to `generating · Xs` once tokens flow.

## [1.20.33] — 2026-05-08

### Fixed

- **SQLite was disabled by an ESM/CJS bug.** `src/state/db.ts` called bare `require("better-sqlite3")` from inside an ES Module. At runtime this threw `ReferenceError: require is not defined`, which the `catch` rewrote as `SQLite unavailable (optional feature) — run "dirgha setup --features" to install.`. Every CLI invocation failed to open `~/.dirgha/dirgha.db`, even though the native module is bundled with `@dirgha/code` and the database file already existed and was healthy. On affected machines, message persistence had been silently failing for an unknown number of releases. Replaced with `createRequire(import.meta.url)`. Same fix applied to dormant `require()` calls in `src/cli/slash/paste.ts` and `src/cli/subcommands/feature-setup.ts`.
- **Spurious "DB writes failing" warning.** `src/state/db-telemetry.ts` armed the stderr warning at `failedWrites >= 10` and persisted that counter across processes, so once an environment crossed the threshold every future run printed the warning forever. The warning also lacked the actual cause. Now the warning includes `telemetry.lastError` (so users see what to fix), and `failedWrites` resets to 0 on the first successful write of the process.
- **`dirgha audit tail` hung in non-TTY contexts.** The subcommand always installed `fs.watch` and waited for SIGINT, so any pipe / script / CI invocation blocked indefinitely. Added `--no-follow` and `-n N` (`--last N`) flags; default to no-follow when `process.stdout.isTTY` is `false`, matching the `journalctl` / `kubectl logs` pattern. The `(following — Ctrl-C to stop)` hint is now suppressed in non-follow mode.
- **`dirgha doctor` playwright check was cwd-dependent.** Spawned `node -e "require('playwright')"` whose subprocess inherited `process.cwd()`, so the resolution matched `<cwd>/node_modules/playwright` and gave false negatives anywhere outside the CLI's own checkout. Replaced with an in-process `createRequire(import.meta.url).resolve("playwright")` probe rooted at the CLI's install location.
- **`dirgha doctor` polluted user memory.** `checkSessionStore` and `checkMemoryStore` wrote a probe entry with id `doctor-probe-${Date.now()}` on every invocation, accumulating in `~/.dirgha/memory/` (one machine had 18 of them, drowning user-authored entries in `dirgha memory list`). Switched to a fixed singleton id `doctor-probe` plus best-effort cleanup; each doctor run now leaves at most one probe entry behind.
- **`dirgha memory add "<long human string>"` was hard-rejected.** A single positional containing spaces, colons, or other non-id characters failed with `Invalid memory key …` (also the wrong noun: the help and rest of the codebase say `id`). Now: when only one positional is supplied and it isn't a valid id, the CLI auto-slugifies it (lowercase, runs of non-id chars → dash, trim, cap at 60 chars, fallback `memory-<unix-ms>`), uses the slug as id and the original string as description, and prints `(slugified from "...")` so the user sees what happened. The two-arg form is unchanged. Validation error message now says "id" not "key".

## [1.20.10] — 2026-05-03

### Fixed

- YOLO mode tool blocking: `enforceMode()` was only exempting `act` mode from write-tool blocking; YOLO mode incorrectly blocked `shell`, `fs_write`, `git`, etc. with "[MODE BLOCK]" errors. Added `yolo` to the exemption.
- Logo jitter in TUI: `<Static items={[{ key: "logo" }]}>` created new array/object references on every render, causing Ink's Static component to re-evaluate the Logo output each frame. Memoized with `useMemo`.

## [1.20.9] — 2026-05-03

### Fixed

- DeepSeek multi-turn 400: `reasoning_content` echo-back. The reasoning channel capture was gated behind `includeThinking` which was `false` for `deepseek-v4-flash` (excluded from `THINKING_MODELS`). The API returns `reasoning_content` regardless — dropping it caused HTTP 400 on every subsequent turn. Removed the gate; reasoning content is now always captured and echoed back for multi-turn compliance.

## [1.20.3] — 2026-05-02

### Fixed

- TUI streaming: reverted Static-around-transcript regression introduced in 1.20.2; committed turns now render in a dynamic Box, preventing duplicate frozen snapshots that pushed the live stream off screen.
- TUI: fixed React key warning on Logo inside Static (`key="logo"` on returned element).

## [1.20.2] — 2026-05-02

### Fixed

- TUI streaming swallow: `commitLive()` now cancels pending flush timers before committing, preventing last-chunk token loss on fast providers.
- TUI Static key: `committedItems` now carries the transcript snapshot; Static render receives `item.transcript` directly, eliminating stale-closure freeze and React key warning.
- `dirgha ask --mode plan/verify/ask`: mode enforcement now correctly blocks write tools (shell, fs_write, fs_edit, git) — previously the `--mode` flag was silently ignored.

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
