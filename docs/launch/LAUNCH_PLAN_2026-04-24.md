# Dirgha Code — Launch Plan

**From:** 4.0/10 (launch-not-ready)  **To:** 9.5/10 (best-in-class OSS CLI)
**Effort:** ~9–10 working days across six sprints.
**Started:** 2026-04-24.

Sprint 1 is the public-launch gate. After S1 the repo can be made public; S2–S6 proceed via normal PR flow post-launch.

Current scorecard → target:

| Category | Now | Target |
|---|---|---|
| Architecture | 4 | 9 |
| Security | 4 | 10 |
| Tests | 3 | 9 |
| Dependencies | 4 | 9 |
| Build / launch readiness | 2 | 10 |
| Docs | 5 | 9 |
| Commit hygiene | 7 | 9 |
| **Weighted overall** | **4.0** | **9.5** |

---

## Sprint 1 — Launch gate (1–2 days → 6.5/10)

Everything that blocks pressing the "make repo public" button.

### 1.1 Fix symlink escape in sandboxPath
**File:** `src/tools/file.ts:37-65`
**PoC:** symlink `link.txt → /etc/passwd` inside workspace bypasses all guards.
**Fix:** add `realpath()` after `resolve()`, reject if realpath lands outside workspace root. Handle ENOENT (new files) by checking parent dir's realpath.
**Verify:** PoC throws; existing tests still pass.

### 1.2 Fresh build works
**a. esbuild externals** — `build.mjs:41-54`: add `@libp2p/mplex`, `@libp2p/noise`, `@libp2p/gossipsub` and any other `@libp2p/*` referenced in src.
**b. `@dirgha/types` imports** — inline the 2 constants (`PROVIDER_RATE_LIMITS` + sibling) into `src/billing/ratelimit.ts`, `src/billing/ratelimit-fixed.ts`, `src/providers/rate-limit.ts`.
**c. Delete `src/commands/dao.ts`** — imports `../../../../../apps/bucky/...` outside repo. Move to experimental if kept, else remove.
**Verify:** `npm run build:public` exits 0 on fresh clone.

### 1.3 Commit package-lock.json
`npm install --legacy-peer-deps` → commit `package-lock.json` to root. Also add `.npmrc` with `legacy-peer-deps=true` until Sprint 4 resolves the marked conflict.

### 1.4 Fix `recall` crash
`TypeError: o is not iterable` at bundled `dist/dirgha.mjs:1862` on any query. Trace to `searchMemory` return shape in `src/memory/unified.ts`. Guard with `Array.isArray` fallback.
**Verify:** `dirgha recall test` prints "No memories" (or results), not a stack trace.

### 1.5 Gate aspirational commands
Move behind `DIRGHA_EXPERIMENTAL=1`:
- `dao`, `make`, `mesh`, `bucky`, `bounties`, `swarm`, `join-mesh`

Approach:
- Add `isExperimentalEnabled()` helper in `src/utils/experimental.ts`.
- In `src/index.ts`, wrap each of the 7 command registrations with `if (isExperimentalEnabled())`.
- Unknown-command fallback in commander: print "experimental command; set DIRGHA_EXPERIMENTAL=1 to enable".

**Verify:** `dirgha --help` shows 52 commands, not 59. `dirgha dao` → gate message.

### 1.6 Gitignore sourcemap
```
git rm --cached dist/dirgha.mjs.map
echo 'dist/*.map' >> .gitignore
```
Keep `dist/dirgha.mjs` tracked for now (unbundle decision is Sprint 4).

### 1.7 Strip LiteLLM residue
- `src/models/router.ts` — delete `LiteLLMUnifiedProvider` import + usage (or delete the file if unused)
- `src/types.ts:48` — remove `'litellm'` from `defaultProvider` union
- `src/providers/messages.ts:5` — fix comment to drop LiteLLM
- Grep `src/` for `litellm`/`LiteLLM`/`LITELLM_` and clean any stragglers.

**Exit criteria (S1):** Fresh clone → `npm ci && npm run build:public && ./dist/dirgha.mjs --version` works end-to-end. No symlink escape. Public `--help` shows only working commands. `recall` doesn't crash.

---

## Sprint 2 — Security hardening (2 days → 7.4/10)

| # | Task | Files |
|---|---|---|
| 2.1 | Permission test suite — 30+ cases (trust downgrades, allowlist, yolo bypass, needsConfirmation edges, stored decisions) | `src/permission/*.test.ts` |
| 2.2 | Memory tests — 20+ cases (store/recall/forget, serialization, corruption recovery, path sandbox in memory files) | `src/memory/*.test.ts` |
| 2.3 | LLM trust-boundary fuzz — prompt-injection payloads in tool results, trust-downgrade verify, auto-recovery gate | `src/agent/tool-execution.test.ts` |
| 2.4 | File sandbox property tests — symlinks, `..`, Windows drives, UNC, null bytes, unicode NFC/NFD | `src/tools/file.test.ts` |
| 2.5 | Shell sandbox negative tests — `dd of=/dev/sda`, `curl | sh`, env injection, sudo, rm -rf obfuscation | `src/tools/shell.test.ts` |
| 2.6 | Strip `@ts-nocheck` from `src/runtime/` (6 files) — fix real type errors | `src/runtime/*.ts` |
| 2.7 | Mark `voice/` experimental — move to `src/experimental/voice/`, keep `@ts-nocheck` scoped | path move |
| 2.8 | Reduce `as any` 239 → <80 — triage, keep justified ones in provider stream parsing | 40+ files |

**Exit:** 600+ tests, permission+memory coverage >80%. `@ts-nocheck` 85 → ~25. `as any` 239 → <80.

---

## Sprint 3 — Architecture consolidation (2 days → 8.3/10)

1. Produce `docs/ARCHITECTURE.md` cataloguing every top-level `src/` dir: purpose, status (core/experimental/deprecated), LoC.
2. Delete dead dirs: `recipes/`, `business/`, `analytics/` (if unused), `hub/` (if unused).
3. Move experimental under `src/experimental/`: `mesh/`, `dao/`, `make/`, `swarm/`.
4. Modular command registration — replace 59 inline `program.command()` in `src/index.ts` with `registerCommands(program, modules)`. Each command file exports `register(program)`.
5. Core/plugin split — stable surface documented, everything else tagged `@experimental` with runtime warning.
6. `src/index.ts` reduction from 20KB to <5KB.

**Exit:** ≤25 dirs under `src/`. `src/index.ts` <200 lines. `docs/ARCHITECTURE.md` exists.

---

## Sprint 4 — Dependencies + CI/CD (1 day → 8.9/10)

1. Resolve `marked` peer conflict — downgrade to `^15` to match `marked-terminal@7`. `npm install` works without `--legacy-peer-deps`. Delete `.npmrc` legacy-peer-deps from S1.
2. Move `libp2p` + `@libp2p/*` to `optionalDependencies`. Mesh command lazy-loads; shows install hint if missing. Bundle shrinks ~1.8MB.
3. Drop `@tensorflow/tfjs-node` if unused.
4. `.github/workflows/ci.yml` — matrix Node 20/22, runs `npm ci && npm run lint && npm test && npm run build:public && node dist/dirgha.mjs --version`.
5. `.github/workflows/publish.yml` — on tag push, `npm publish --access public` via `NPM_TOKEN`.
6. `files` whitelist in `package.json` — ships only `dist/dirgha.mjs`, `LICENSE`, `README.md`.

**Exit:** Fresh `npm ci` green. CI matrix green. `npm pack` tarball <5MB. CI badge on README.

---

## Sprint 5 — Docs (1 day → 9.1/10)

1. README accuracy pass — correct tool/provider counts, drop LiteLLM, verify every codeblock, add troubleshooting.
2. `docs/USAGE.md` — one-page guide, 10 worked examples.
3. `docs/SECURITY.md` — threat model, sandbox guarantees, `--dangerously-skip-permissions` scope, vuln reporting.
4. `docs/PROVIDERS.md` — per-provider env vars, models, quirks.
5. `docs/ARCHITECTURE.md` — polished from Sprint 3.
6. `CONTRIBUTING.md` polish — PR expectations, local-run checklist, link to ARCHITECTURE.

**Exit:** Zero false claims. Every codeblock copy-pasteable. 5 core doc files, each <500 lines.

---

## Sprint 6 — Tests + changelog (2 days → 9.5/10)

1. Provider tests — each of 13 providers gets stream-parse + error-map + quota coverage. 90% line coverage on `src/providers/`.
2. Agent loop tests — tool-use loop, stop sequences, compaction trigger, interruption, recovery.
3. E2E CLI tests — 20 scenarios spawning the bundle (mocked auth): chat, tools, sessions, model switch.
4. CI coverage gate — fail PRs <60% overall or <85% on `src/{agent,tools,permission,memory,providers}`.
5. `CHANGELOG.md` populated with 0.1.0 entry covering S1–S6. Future PRs must update.

**Exit:** 60% overall / 85% security-critical coverage, CI-enforced. CHANGELOG authoritative.

---

## Progress tracking

| Sprint | Status | Started | Finished | Exit score |
|---|---|---|---|---|
| S1 Launch gate | complete | 2026-04-24 | 2026-04-24 | 6.5 |
| S2 Security | pending | — | — | 7.4 |
| S3 Architecture | pending | — | — | 8.3 |
| S4 Deps + CI | pending | — | — | 8.9 |
| S5 Docs | pending | — | — | 9.1 |
| S6 Tests | pending | — | — | 9.5 |
