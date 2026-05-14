# REDTEAM-01-PER-MODEL-COOLDOWN – Adversarial Audit

## 1. Honest verdict

The spec is thoughtful and covers most design decisions well, but it contains one factual error that undermines the entire caller-identification section and a significant blind spot in the failover-chain wrapper. It is **not ready to implement** as written. The top three blockers are:  

*P0* – `agent-loop.ts:148` calls `isBlacklisted` imported from `src/intelligence/failover-chain.ts`, *not* from `health-monitor.ts`. The spec never mentions `failover-chain.ts`. The refactor will miss the wrapper, so `isBlacklisted` in `agent-loop.ts` will still use the old single-string signature, silently ignoring the new model parameter.  

*P1* – The spec incorrectly asserts that `findFailover` in `prices.ts` calls `isBlacklisted` with a provider string. In the actual source (`prices.ts`) there is no call to `isBlacklisted` at all. The claimed ripple effect is based on a false premise, so the spec’s guidance on updating `findFailover` is misleading.  

*P2* – No analysis of `src/web/` dashboard impact. `getAllHealth()` returns multiple entries per provider after the refactor; existing dashboard code that iterates over results as unique providers will break silently at runtime.  

Blockers P0 and P1 must be resolved before implementation begins. P2 can be mitigated by adding a compatibility note and updating the dashboard separately.

## 2. Hidden interface coupling

### 2.1 Direct callers of `health-monitor.ts` public functions (from provided sources)

| Function | File:line | Current call | Will break at compile time? | Runtime risk |
|---|---|---|---|---|
| `recordSuccess` (exported as `recordHealthSuccess`) | `agent-loop.ts:724` | `recordHealthSuccess(cfg.provider.id, 0)` | **Yes** – new signature needs three args. | N/A – TS will error. |
| `recordFailure` (exported as `recordHealthFailure`) | `agent-loop.ts:500` | `recordHealthFailure(cfg.provider.id, errMsg)` | **Yes** – new signature needs three args. | N/A – TS will error. |
| `isBlacklisted` | `agent-loop.ts:148` | `isBlacklisted(cfg.model)` – imported from `failover-chain.ts` | **No** – `failover-chain.isBlacklisted` may not get updated; compile passes but runtime returns wrong result. | **Critical** – `isBlacklisted` will ignore the provider entirely (if wrapper passes only model) or still key by provider only (if wrapper unchanged). The cooldown bug persists. |
| `getAllHealth` | unknown in web; possibly `src/web/dashboard.ts` | expects `ProviderHealth[]` with unique providers | No – new interface still has `provider` field, but now multiple entries per provider. | **Runtime** – dashboard may show duplicate provider rows or misaggregate. |
| `getHealth` | unknown | `getHealth(provider)` | No – new signature needs two args; TypeScript may allow partial? Actually `getHealth(provider, model)` would require second arg; if existing call passes only one, TS error. | Compile error if strict. |
| `resetHealth` | unknown | `resetHealth(provider)` | Yes – new signature needs model. | Compile error. |

### 2.2 Indirect callers through `failover-chain.ts`

`agent-loop.ts` imports `isBlacklisted` and `recordFailover` from `../intelligence/failover-chain.js`. The spec does not provide that file, but its existence is confirmed by the import. The spec must ensure `failover-chain.ts` exports `isBlacklisted(provider, model)` and forwards both arguments to the health-monitor function. Without this, the `agent-loop.ts:148` call remains broken. This is P0.

### 2.3 Other likely callers not provided

- `src/intelligence/__tests__/health-monitor.test.ts` – will be rewritten per spec.
- `src/providers/health.ts` – the spec says it wraps `recordRequest` and `recordRateLimit`, not health-monitor; no conflict.
- `src/web/dashboard.ts` – unknown but needs explicit audit.
- `scripts/qa-app/*.mjs` – likely directly imports `health-monitor.ts` functions. The spec must add a grep step for these.

### 2.4 Compile-time vs runtime breakage

All three calls in `agent-loop.ts` (lines 148, 500, 724) will break at compile time if they are directly from `health-monitor.ts`. However, line 148 uses the `failover-chain.ts` import – that call *will not break at compile time* if `failover-chain.ts` remains unchanged, because the wrapper's signature still matches `(string) => boolean`. The code compiles but the per-model cooldown is not enforced. This is the most dangerous runtime mistake.

**Verdict**: The spec's claim that line 148 will be "corrected from `isBlacklisted(cfg.model)` to `isBlacklisted(provider, model)`" is correct only if the import source changes to `health-monitor.ts`. The spec must either (a) update the import in `agent-loop.ts` to use health-monitor directly, or (b) update `failover-chain.ts` to forward both parameters. Neither is specified.

## 3. Test plan gaps

### Gap 1: Legacy health.json round-trip – data leakage after first persist

**Scenario**: User has v1.33.25 health.json with a provider-wide entry for "deepseek". After upgrade, no health events occur, so `persist` is never called. The legacy file remains. On second startup, `loadPersisted` again ignores the legacy data. Then the user runs a session that triggers a `recordFailure` on `("deepseek", "deepseek-v4-flash")`. The entry is written as `"deepseek:deepseek-v4-flash"`. Now the file has both `"providers"` (old) and `"entries"` (new). On next restart, the new code reads `store.entries` and ignores `store.providers`. No data leakage. Good.

But what if `recordSuccess` is called on a model before any failure, and then `persist` writes the new file – the `providers` key is gone. That's clean.

**Why likely missed**: The spec asserts legacy data is "silently dropped", but only tests T03 (load without crash). It does not test that after loading legacy, then persisting, then reloading, the persisted file contains exactly the expected new-format entries and no legacy entries remain (even if the legacy file had extra keys). A malicious legacy file with extra fields in `providers` (e.g., `"unknownProvider": {...}`) should not appear in `entries`.

**Concrete test**: Create a legacy file with two providers: one valid (matching a real provider) and one with a non-string provider value. Load, then call `recordSuccess("testProvider", "testModel", 100)`, persist, reload. Assert that `state` contains only the `testProvider:testModel` entry. Assert that no entry with provider "unknownProvider" exists.

### Gap 2: Model name containing colon

**Scenario**: The `PRICES` array in `prices.ts` includes models like `"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"` which contains a colon. The `HealthKey` is `${provider}:${model}`. For provider "openrouter" and model "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", the key becomes `"openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"`. This string contains two colons. The spec does not define any parsing function, but if any future code attempts to split on the first colon to extract provider, it will get `"openrouter"` and the remainder `"nvidia/...:free"`. That works if the parser splits only on the first colon. However, the spec says the key is opaque and model is stored in the `HealthState.model` field. So the key is never parsed. The ambiguity is not a runtime bug, but a maintenance hazard.

**Why likely missed**: All examples in the spec use simple model names without colons. The team may assume model names never contain colons. But the `:free` suffix is common in OpenRouter. The spec should document the encoding rule and add a test.

**Concrete test**: `recordSuccess("openrouter", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", 100)`. Assert `isBlacklisted("openrouter", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free")` returns false (no cooldown). Assert `getAllHealth()` returns one entry with `model` including the colon. Assert that the persisted JSON has key `"openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"`.

### Gap 3: Atomic write failure – cross-device rename and orphaned tmp files

**Scenario**: The spec recommends write-to-tmp-then-rename. If the health.json is on a different filesystem than the system temp directory (e.g., `~/tmp` is on a different mount), `renameSync` throws `EXDEV`. The spec's exception handler is silent; the file is not persisted silently.

**Why likely missed**: Most developers assume tmp and target are on the same filesystem. On macOS and Linux, if `TMPDIR` points to a tmpfs and `HOME` to an ext4 disk, this fails. The spec's catch block would need to fall back to `writeFileSync` or log a warning. Not tested.

**Concrete test**: Mock `renameSync` to throw `EXDEV`. Call `recordFailure` to trigger `persist`. Assert that the function does not throw (it doesn't), but assert that the file was not written (e.g., verify temp file not created and target unchanged). The test should also verify that `console.warn` is called if the spec adds logging. Without logging, the user has no indication that persistence failed.

## 4. Migration strategy holes

### Step-by-step walkthrough

**Start**: v1.33.25 running; `~/.dirgha/health.json`:

```json
{
  "updatedAt": "2025-04-01T12:00:00.000Z",
  "providers": {
    "deepseek": { "provider": "deepseek", "totalRequests": 10, "failures": 2 },
    "anthropic": { "provider": "anthropic", "totalRequests": 5, "failures": 0 }
  }
}
```

**Upgrade to v1.34.0**:

1. `loadPersisted()` called at module init (`health-monitor.ts:121`). The new code reads `store.entries` → undefined. Then reads `store.providers` → exists. Since `store.entries` is missing, `store.providers` is **not checked** – the spec says "If `store.entries` is missing but `store.providers` exists, that is the legacy format." But the actual code in the spec's proposed `loadPersisted` is not provided; we must assume it implements that logic. The spec says legacy entries are dropped; no state loaded.

2. No health events occur yet. The `state` map is empty.

3. First agent session: the user runs a few tool calls. `recordFailure` or `recordSuccess` is called for `("deepseek", "deepseek-v4-flash")`. This creates a new entry. Then `persist()` is called.

4. `persist()` writes the file with:

```json
{
  "updatedAt": "2025-04-01T12:05:00.000Z",
  "entries": {
    "deepseek:deepseek-v4-flash": { "provider": "deepseek", "model": "deepseek-v4-flash", "totalRequests": 1, "failures": 1 }
  }
}
```

The legacy `providers` block is gone.

**User gets an error and downgrades immediately after the first persist**.

5. User runs `npm install -g @dirgha/code@1.33.25`. The old code's `loadPersisted` reads the file: `store.providers` is undefined, `if (!store?.providers) return;` triggers, no state loaded.

6. User runs `dirgha` again. No health data in memory. A health event occurs; `persist()` writes a new file with `providers` key, overwriting the v1.34.0 entries:

```json
{
  "updatedAt": "2025-04-01T12:07:00.000Z",
  "providers": {
    "deepseek": { "provider": "deepseek", "totalRequests": 1, "failures": 1 }
  }
}
```

Note: the provider key is "deepseek" – the entry's model field is absent. The old code does not have a model field. So the downgrade converts the per-model entry to a provider-wide entry, averaged or lost? The old code's `InternalState` has `provider` field; when it restores from `providers.deepseek`, it assigns `s.provider = "deepseek"` and sets other fields. The model information is irreversibly lost.

**Re-upgrade to v1.34.0 a day later**:

7. The file now has `providers` key (from old code). The new code sees `store.entries` missing, sees `store.providers` present, drops it again. Cooldown history is reset to empty. This is acceptable per spec.

**Data-loss-on-upgrade-then-downgrade-then-upgrade**: The v1.34.0 per-model state is lost on the downgrade in step 6. That's inevitable and spec says "acceptable". However, what if the user never triggered a health event during the first v1.34.0 session? Then the file remains in legacy format. On downgrade, old code sees `providers` and loads the legacy data. On re-upgrade, new code drops it. So the legacy data is lost too, but that's also acceptable.

**Missed**: The spec does not handle the case where the user's v1.33.25 health.json contains critical cooldown state (e.g., a provider was blacklisted due to repeated failures). After upgrade, that state is silently dropped. The user may experience more failures against that provider before cooldown kicks in again. The spec acknowledges this via the `console.log`, but does not warn the user about the potential implications. The log message should be at `warn` level, not `info`.

## 5. Rollback strategy holes

**Confirmed**: The v1.33.x code at `health-monitor.ts:111-112` has `if (!store?.providers) return;`. This will silently skip loading when the file has only `entries`. The new code's file is valid JSON, so `JSON.parse` succeeds. The old code will proceed with an empty state.

**What does v1.33.x WRITE back?** When a health event occurs after downgrade, old code's `persist()` writes `store.providers` using the current in-memory state (empty). It writes:

```json
{ "updatedAt": "...", "providers": {} }
```

This overwrites the v1.34.0 `entries` block, losing all per-model data. That's fine.

**But what if no health event happens after downgrade?** The old code never calls `persist()`. The file remains with `entries` block. On next upgrade to v1.34.0, the new code reads `store.entries` (since `store.providers` is undefined? Actually `store.entries` would exist). Wait, the new code checks for `store.entries` first. If the file has only `entries`, it loads that. So if the user downgrades and never runs a session, the file stays with `entries`. On re-upgrade, the new code loads the entries. This means the state *can* survive a downgrade if the user never runs an agent session before re-upgrading. The spec claims state loss is inevitable, but it's not if the downgrade is purely a binary swap with no health events. The rollback story is not "clean" because the old code can leave the new format intact, but the spec does not mention that this is possible.

**Is state loss acceptable?** Yes. But the spec's statement "the user's cooldown state is lost on downgrade" is technically conditional on a health event occurring after downgrade. If the user downgrades, runs `dirgha --version`, re-upgrades, the state survives. The spec should note this edge case.

**No data backup needed**. The spec's conclusion stands.

## 6. Atomic write gotchas

The spec recommends write-to-tmp-then-rename. The current code uses `writeFileSync` directly. The spec says to add the atomic pattern as a "small addition with high resilience value." However, it does not provide the new implementation nor analyze failure modes.

### Failure modes and spec response

| Failure mode | Does the spec address it? | What happens | Recommended fix |
|---|---|---|---|
| Cross-device rename (EXDEV) | No | `renameSync` throws; the catch block (best-effort) silently swallows it; the temp file is left, the original file is not updated. | Fall back to `writeFileSync` if EXDEV, or ensure temp file is created in the same directory as target (e.g., `HEALTH_PATH + '.tmp'` is on same filesystem). Add a `console.warn` for EXDEV. |
| Permission denied on temp file write | No | `writeFileSync` throws; catch block swallows it; temp file not created. | Log the error. Optionally skip rename. |
| SIGKILL between writeFileSync and renameSync | No | Temp file leaks. On next startup, `loadPersisted` reads the original file (unchanged). The temp file is never cleaned up. Over many crashes, temp files accumulate in the home directory. | On startup, delete any `.*.tmp` files in `~/.dirgha/` before `loadPersisted`. Or use a fixed temp name that can be safely overwritten on next write. |
| Crash during writeFileSync before rename | The spec says "target file is untouched. Good." | Yes, that's correct. | No action. |
| Disk full after writeFileSync, before renameSync | No | writeFileSync succeeds (disk full may cause ENOBUFS? Typically writeFileSync will throw on disk full if the write exceeds available space; if the write partially succeeds, the tmp file may be truncated. Then renameSync moves it, corrupting the target. | Ensure atomic rename, but disk full is rare; the spec's logging suggestion handles it. |

**Spec gap**: The spec says "Implement this change in this refactor" but does not specify the implementation details. The catch block in the current `persist()` is `catch { /* best-effort */ }`. The atomic write pattern will introduce new failure points that must be handled.

**Recommended**: Add code in `persist()`:

```ts
const tmp = HEALTH_PATH + '.tmp';
try {
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  renameSync(tmp, HEALTH_PATH);
} catch (err) {
  console.warn('[health-monitor] failed to persist health.json:', err instanceof Error ? err.message : String(err));
  // If rename failed, try to write directly as fallback
  if (err instanceof Error && 'code' in err && err.code === 'EXDEV') {
    try { writeFileSync(HEALTH_PATH, JSON.stringify(store, null, 2), 'utf8'); } catch {}
  }
}
```

And add a startup cleanup:

```ts
try {
  const tmpFile = HEALTH_PATH + '.tmp';
  if (existsSync(tmpFile)) unlinkSync(tmpFile);
} catch { /* ignore */ }
```

## 7. findFailover ripple

### Current signature and behavior

From `prices.ts`:

```ts
export function findFailover(modelId: string): string | undefined
```

It does **not** call `isBlacklisted` or any health-monitor function. It returns a fallback model based on `MODEL_FAILOVERS` map or `familyAlternatives`.

### Spec's claim

Spec Section 7 (failure mode 6) and Section 10 (open question 1) state that `findFailover` currently calls `isBlacklisted` with just the provider and must be updated to pass model. This is incorrect based on the provided source.

### Actual impact

The spec's Q1 ("findFailover becomes per-model") was accepted, but the spec does not define what "per-model" means for `findFailover`. The function already operates per model (takes modelId). The only change needed is if `findFailover` should consider health state when suggesting a fallback. Currently it does not. If the team wants `findFailover` to avoid suggesting a model that is currently blacklisted on the same provider, they need to add health checks. That is a design decision not fully specified.

### Callers of `findFailover` in `agent-loop.ts`

- `agent-loop.ts:149`: `const fallback = findFailover(cfg.model);` – used only to emit a `failoverModel` in error event.
- `agent-loop.ts:497` (spec says line 497, but in source `recordFailover(cfg.model)` is at line? Not found; the spec may be referring to a line number not present in provided source. The provided `agent-loop.ts` does not have `recordFailover` call in the visible excerpt. It might be in the full file not shown. The spec asserts calls at 497 and 724. We see 724 is recordHealthSuccess. 497 likely is a `recordFailover` call. We'll trust the spec's claim.

Both callers pass `cfg.model` (a model string). So `findFailover` already takes model.

### Spec's missed detail

The spec says "Update `findFailover` signature to `(model: string) => string | undefined`". That's the current signature. No change needed.

**Open question**: Should `findFailover` be upgraded to accept a provider parameter and check health before returning a suggestion? If so, the spec must specify that. Currently it doesn't. The spec's Section 10 question recommends updating `findFailover` to check per-model cooldown, but does not include that in the spec's implementation dispatches. This is a gap.

**Recommendation**: The spec should either explicitly state that `findFailover` remains health-agnostic (no change) or add a detailed design for health-aware failover. The current vague recommendation leads to incomplete implementation.

## 8. Dashboard / web impact

No web source provided. We must infer from the rest of the spec and from common patterns.

- The spec says `src/web/` directory has a dashboard that shows model and provider state. It likely uses `getAllHealth` to fetch all health entries and render them.
- Current `ProviderHealth` interface has `provider` (string) but no `model` field. After refactor, `getAllHealth` returns an array of `ProviderHealth` with a new `model` field.
- If the dashboard code displays one row per provider, the dashboard will now show multiple rows per provider (one per model). The code may break if it uses `provider` as a unique key (e.g., in a `Map<provider, ProviderHealth>`). It may show duplicate entries.
- If the dashboard calls `getHealth(provider)` with one argument, it will break at compile time (new signature requires two arguments) or at runtime if the call silently passes `undefined` for model.

**Remediation**: The spec must require an audit of `src/web/` for all imports of health-monitor functions. Even if the file is not provided, the spec should list the known dashboard endpoints (e.g., `/api/health`) and state that the dashboard must be updated to handle the new `model` field and the multi-entry per provider response.

## 9. The 'one more thing'

If I were doing this refactor at a real company shipping to customers, the one thing I would add to this spec that the team didn't think of is:  

**A dedicated `failover-chain.ts` update plan with explicit signature changes and import fixes.**

The spec completely omits this file, but `agent-loop.ts` imports `isBlacklisted` and `recordFailover` from it. The current code path is:

```
agent-loop.ts:148 → failover-chain.isBlacklisted → health-monitor.isBlacklisted
```

The spec's entire callsite analysis (Section 3) assumes `agent-loop.ts:148` calls `health-monitor.isBlacklisted` directly. This is wrong. The implementation will either:  

- Forget to touch `failover-chain.ts`, resulting in a code that compiles but still uses the old provider-only key (the bug remains), or  
- Accidentally update the wrong import, causing a runtime type error when `failover-chain.isBlacklisted` is called with two arguments but its signature remains single-string.

The spec must explicitly:  

1. Import `isBlacklisted` from `health-monitor.ts` directly in `agent-loop.ts` (removing the `failover-chain` import for that function), or  
2. Update `failover-chain.ts` to export `isBlacklisted(provider: string, model: string): boolean` and proxy to health-monitor.

The spec should include a line in the Definition of Done: "`failover-chain.ts` exports `isBlacklisted(provider, model)`." Currently, it does not.

Without this, the refactor will ship with a silent behavior gap.