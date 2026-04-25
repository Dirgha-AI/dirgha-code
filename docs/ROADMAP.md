# dirgha-cli — Roadmap

The shipped state and the binding contract for what comes next. The `docs/parity/CLI_PARITY_MATRIX.md` file is the per-row burndown; this doc is the per-sprint chronology.

## Shipped (1.4.0)

- ✓ Soul: short Markdown persona at `~/.dirgha/soul.md` with a tested 4 KB-capped loader and 17-assertion test floor
- ✓ Multi-key BYOK pool with priority + LRU + cooldown + atomic file lock; 17 known providers
- ✓ `dirgha login --provider=<id> [--key=…]` interactive flow with hidden prompt and POSIX 0600 keys.json
- ✓ `dirgha update --check / --packages / --self [--yes]` with audit logging and registry probing
- ✓ `dirgha models refresh` parallel `/v1/models` fetch + 24 h cache (live: 499 models in <1 s)
- ✓ TypeScript / ESM extensions API: `registerTool / registerSlash / registerSubcommand / on(event)` + `loadExtensions(~/.dirgha/extensions)` with isolated load failures
- ✓ Mid-session failover: stopReason=error swaps to the registered fallback and resumes from `result.messages`
- ✓ NIM `delta.reasoning` parsing (was silently dropping content on deepseek-v4-flash)
- ✓ `dirgha undo [N]` rolls back N user-turns from the most-recent session with a `.bak` snapshot
- ✓ TF-IDF cosine search over the JSONL ledger; `dirgha ledger search` defaults to ranked, `--exact` falls back to substring
- ✓ MCP HTTP transport with async `bearerProvider` for OAuth token rotation
- ✓ StatusBar live tok/s readout in green when busy ≥ 250 ms
- ✓ `dirgha cost {today,day,week,all}` reads the audit log, folds USD via `findPrice`
- ✓ Compaction telemetry: `[compacted] X → Y tokens (-Z%)` banner + `kind:compaction` audit entry
- ✓ Workspace `git_state` injection (interactive sessions only — distracts small models on one-shot prompts)
- ✓ `ask` mode (read-only Q&A) + StatusBar cyan badge

## In flight

- Sprint 5 — **Hyperframes recon complete.** Apache 2.0, runs locally, requires Node ≥ 22 (we have 20). Enables Sprint 7.
- Sprint 6 — hy3 audits the entire `src_v2/` + `scripts/qa-app/`, surfaces dead code / weak assertions / contradictions, output to `docs/audits/HY3-AUDIT-<date>.md`.
- Sprint 7 — promo asciinema demo + a 45–60 s rendered video via hyperframes.
- Sprint 8 — `npm publish 1.4.0` (needs OTP from user) + tweet draft referencing only what's shipped + tested + green.

## On deck

- **Pi-package npm marketplace** — `dirgha install npm:@foo/dirgha-pack` and `dirgha install git:github.com/user/repo` for full packages bundling extensions + skills + prompts + themes (today: skills only via git clone).
- **OAuth flows for Anthropic Pro / ChatGPT Plus / Copilot** — needs maintained client_ids per provider; multi-day commitment.
- **Web dashboard** — live HTML view of audit + cost + ledger.
- **Provider catalogue auto-expansion** — sync `~/.dirgha/models-cache.json` against `models.dev` so newly-added providers show up without a CLI version bump.
- **Sub-agent orchestration patterns** — `dirgha fleet` already does parallel git-worktree dispatch; more orchestration shapes (consensus voting, divide-and-conquer) are post-1.3.

## Constraints

- Every src file ≤ 200 lines.
- Every parity-matrix row closure cites a code path and a test.
- Every sprint ends with `npm run test:cli:offline` green.
- Soul and tone are not changed without explicit user request.
- No competitor names in code comments, file content, or stdout/stderr messages.

## How a fresh contributor picks up the work

1. Read `docs/ARCHITECTURE.md` for the kernel + provider model
2. Read `docs/parity/CLI_PARITY_MATRIX.md` for current scores; pick the highest-gap row
3. Run `npm run test:cli:offline` to confirm the green baseline
4. Write or extend a test before changing code
5. Cite the code + test in the matrix row when closing
