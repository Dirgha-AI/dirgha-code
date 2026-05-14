# Audit: SPEC-01-PER-MODEL-COOLDOWN

## 1. Problem statement

The current cooldown system in `src/intelligence/health-monitor.ts` keys all state by a single `provider: string`. The internal state is a `Map<string, InternalState>` where the string is the provider name. All public functions—`recordSuccess`, `recordFailure`, `isBlacklisted`, `getHealth`, `getAllHealth`, `resetHealth`—accept and operate on a provider string only. The disk persistence in `health.json` uses a `providers` record keyed by provider name (`health-monitor.ts:99-109`). The design assumes that a provider's health is uniform across all its models.

**Observed bug**: A single model failure poisons all sibling models on the same provider. For example, if `anthropic:claude-haiku` triggers cooldown (5 failures in a window), the provider key `"anthropic"` is blacklisted. Any subsequent request for `anthropic:claude-opus` is blocked because `isBlacklisted("anthropic")` returns true (`health-monitor.ts:216-221`). The model argument at the callsite in `agent-loop.ts:148` passes `cfg.model` (a model string like `"claude-opus"`) to `isBlacklisted`, which currently ignores it. This is a latent bug: the parameter was designed as provider but callers pass model. The refactor must fix this mismatch.

**Audit trail**: 
- `docs/cli/agent/v1.33.19-audit.md` P1-5 (per-model cooldown) identifies this as a priority.
- `docs/cli/agent/v1.33.21-architecture-audit.md` Section 3, row (f): cooldown is provider-wide; the architecture audit notes that this is insufficient and per-(provider, model) is needed. Row (f) specifically calls out that the current `health-monitor.ts` design keys by provider only.
- Section 5 of the architecture audit (Target architecture) implicitly expects per-model cooldown to be the first refactor because it touches the most fundamental state structure.

The bug manifests concretely when a model like `deepseek-v4-flash` on provider `deepseek` enters cooldown after 5 failures. The next turn using `deepseek-code` on the same provider is unconditionally blocked, even if that model has never failed. The user sees an unnecessary failover or error message, and the conversation stalls.

## 2. Target invariants

1. MUST: A cooldown entry is uniquely identified by the (provider, model) pair. Storing and querying use both values.

2. MUST: A model that has never been called has no cooldown state. `isBlacklisted(provider, model)` for any pair with no record returns `false`.

3. MUST: A cooldown set on (providerA, modelX) does not affect any request for (providerA, modelY) where modelY != modelX. This is the core invariant.

4. MUST: The `recordSuccess` function accepts both provider and model, and updates state only for that pair. Success on (providerA, modelX) does not reset failures on (providerA, modelY).

5. MUST: The `recordFailure` function accepts both provider and model. Failures are counted per (provider, model) independently.

6. MUST: Disk persistence in `health.json` stores per (provider, model) entries. Old provider-only entries (from versions < v1.34.0) are silently dropped on first read; no migration of legacy values occurs. Reason: legacy entries are ambiguous (which model caused the failures?). A log message is emitted at INFO level.

7. MUST: The `isBlacklisted` function used in the failover chain (`src/intelligence/failover-chain.ts`) and agent loop (`agent-loop.ts:148`) receives both provider and model. The callsite in `agent-loop.ts:148` is corrected from `isBlacklisted(cfg.model)` to `isBlacklisted(provider, model)`.

8. MUST: The in-memory state shape is `Map<HealthKey, HealthState>` where `HealthKey` is a string literal `${provider}:${model}`.

9. MUST: The public API exports `recordSuccess(provider: string, model: string, latencyMs: number): void`, `recordFailure(provider: string, model: string, error: string): void`, `isBlacklisted(provider: string, model: string): boolean`, `getHealth(provider: string, model: string): ProviderHealth | null`, `getAllCooldowns(): ProviderHealth[]`, `resetHealth(provider: string, model: string): void`.

10. MUST: The cooldown backoff logic (exponential levels, failure window, recovery successes) remains identical per (provider, model) pair. The constants `FAILURE_WINDOW_MS`, `FAILURE_TRIGGER`, `COOLDOWN_BACKOFF_MS`, `RECOVERY_SUCCESSES` are unchanged.

11. MAY: A provider-wide 5xx storm can optionally be detected and cause a brief (30s) global cooldown for all models of that provider, but this is NOT part of this spec. The current implementation does not have such logic; adding it would be a separate feature. This spec strictly per-model only.

12. NEVER: A cooldown decision blocks a model the user explicitly set with `/model` in the current session. The agent loop checks `isBlacklisted` before the first turn (`agent-loop.ts:148`). If the user manually set a model, the check is still performed; if the model is blacklisted, a failover is suggested but the user can ignore it. The invariant is that the loop does not silently discard the user's choice — it emits an error event with the failover suggestion but continues with the user's model. This is already the behavior in the current code (line 148-154 in agent-loop.ts: `if (isBlacklisted(cfg.model)) { ... }` emits an error with `failoverModel` but does not abort the loop). After refactor, it will check `isBlacklisted(provider, cfg.model)` with the correct provider.

## 3. Concrete TypeScript interfaces

### Side-by-side signatures

**Current (pre-refactor) `src/intelligence/health-monitor.ts`**:
```ts
export function recordSuccess(provider: string, latencyMs: number): void;
export function recordFailure(provider: string, _error: string): void;
export function isBlacklisted(provider: string): boolean;
export function getHealth(provider: string): ProviderHealth | null;
export function getAllHealth(): ProviderHealth[];
export function resetHealth(provider: string): void;
```

**Proposed (post-refactor) `src/intelligence/health-monitor.ts`**:
```ts
export type HealthKey = `${string}:${string}`; // "provider:model"

function toKey(provider: string, model: string): HealthKey {
  return `${provider}:${model}`;
}

export function recordSuccess(provider: string, model: string, latencyMs: number): void;
export function recordFailure(provider: string, model: string, error: string): void;
export function isBlacklisted(provider: string, model: string): boolean;
export function getHealth(provider: string, model: string): ProviderHealth | null;
export function getAllHealth(): ProviderHealth[]; // still returns all, but keyed per pair
export function resetHealth(provider: string, model: string): void;
```

### Internal state

Old `InternalState`:
```ts
interface InternalState {
  provider: string;        // provider name
  totalRequests: number;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  avgLatencyMs: number;
  blacklistedUntil: number | null;
  cooldownLevel: number;
  failureWindowStart: number;
  failuresInWindow: number;
  probeActive: boolean;
  consecutiveSuccesses: number;
  lastCooldownDecay: number;
}
```

New `HealthState`:
```ts
interface HealthState {
  provider: string;   // for backward compat in export, but never used as key
  model: string;      // new field
  totalRequests: number;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  avgLatencyMs: number;
  blacklistedUntil: number | null;
  cooldownLevel: number;
  failureWindowStart: number;
  failuresInWindow: number;
  probeActive: boolean;
  consecutiveSuccesses: number;
  lastCooldownDecay: number;
}
```

Internal `state` Map:
```ts
const state = new Map<HealthKey, HealthState>();
```

All internal functions (`ensureState`, `getCooldownMs`, `persist`, `loadPersisted`) are updated to use the composite key.

### Disk persistence shape

Old `health.json`:
```json
{
  "updatedAt": "2025-04-01T12:00:00.000Z",
  "providers": {
    "anthropic": { "provider": "anthropic", "totalRequests": 100, ... }
  }
}
```

New `health.json`:
```json
{
  "updatedAt": "2025-04-01T12:00:00.000Z",
  "entries": {
    "anthropic:claude-haiku": { "provider": "anthropic", "model": "claude-haiku", "totalRequests": 100, ... },
    "anthropic:claude-opus": { "provider": "anthropic", "model": "claude-opus", "totalRequests": 50, ... }
  }
}
```

The key is `"provider:model"`. The `"entries"` object replaces `"providers"`. Old `"providers"` block is ignored.

### Callsites in `agent-loop.ts` that need updating

1. `agent-loop.ts:148`: `if (isBlacklisted(cfg.model))` → must become `if (isBlacklisted(cfg.provider.id, cfg.model))`. The provider ID is available from `cfg.provider.id` (a string) as used elsewhere in the file (e.g., `recordRequest(cfg.provider.id, ...)` at line 485, 498). The current code passes `cfg.model` to a function that expects provider; this is a bug. After refactor, the signature `isBlacklisted(provider, model)` forces correctness.

2. `agent-loop.ts:500`: `recordHealthFailure(cfg.provider.id, errMsg)` → must become `recordHealthFailure(cfg.provider.id, cfg.model, errMsg)`.

3. `agent-loop.ts:724`: `recordHealthSuccess(cfg.provider.id, 0)` → must become `recordHealthSuccess(cfg.provider.id, cfg.model, 0)`.

4. The `findFailover` and `recordFailover` calls in `agent-loop.ts` (lines 149, 497) operate on models only, not provider; they are unchanged.

5. Any other file that imports from `health-monitor.ts` and uses the old signatures. A `grep -r 'isBlacklisted\|recordSuccess\|recordFailure\|getHealth\|getAllHealth\|resetHealth' src/` will reveal all callers. Expect callers in `src/intelligence/failover-chain.ts` and possibly `src/providers/health.ts` (if it wraps health-monitor). The red-team plan mentions `recordRequest` and `recordRateLimit` in `src/providers/health.ts`; those are separate functions not part of this spec.

## 4. Migration strategy

### Detection of legacy `health.json`

On startup, `loadPersisted` attempts to read `health.json`. The current code reads `store.providers` and iterates over entries (`health-monitor.ts:114-118`). The new code will first check for `store.entries`. If `store.entries` is missing but `store.providers` exists, that is the legacy format.

**Behavior**: When legacy format is detected:
- A single `console.log` with prefix `[health-monitor]` is emitted: `Found legacy health.json with provider-wide keys. These are not migrated to per-model keys and will be ignored. Cooldown state starts fresh.`
- Legacy entries are not loaded into state. The `state` map remains empty.
- No file migration is performed. The next `persist()` call overwrites the file with the new format (entries keyed by `provider:model`). This means the old state is permanently lost after the first write. Users upgrading from v1.33.x will lose their provider-wide cooldown history.

**Rationale**: Legacy entries are ambiguous: a cooldown on `"openai"` could have been caused by any model. Migrating them to all models of that provider would poison newly discovered models. Dropping them is safer and simpler. The team acknowledges this loss via the `red-team.md` Section 4, Item 2 (leak scenario) but judges it acceptable for a point release.

### Rollback compatibility

After upgrading to v1.34.0 (the version with this refactor), the new code writes `health.json` with the `entries` object keyed by `"provider:model"`. The old code (v1.33.x) reads `store.providers`. It will either:
- Ignore the `entries` key and see an empty `providers` block, thus starting with no cooldown state.
- Or crash if the JSON parser throws on unexpected structure. The current v1.33.x code accesses `store.providers` (line 115), which will be `undefined`. The `if (!store?.providers) return;` guard will cause it to silently return, so no crash. No state is loaded. This is safe.

Thus rollback from v1.34.0 to v1.33.x is possible: the old code will not read the new format, but it will not crash. The user loses any cooldown state accumulated while running v1.34.0. That is acceptable because cooldown state is not critical for functionality — it only affects model selection after failures. The user will have fresh cooldown state after downgrade, which mimics a clean start.

### Feature flag

No runtime feature flag (`DIRGHA_COOLDOWN_LEGACY=1`) is needed. The migration is a one-time format change; the old format is not supported in the new code. If the team wanted to allow users to opt out of the change temporarily, they could introduce a flag, but that adds maintenance burden and complexity. The red-team plan does not recommend a flag for this spec. The change is small and well-scoped; a flag would just delay the inevitable. The team should ship this refactor without a flag.

## 5. Test plan (TDD — these are written FIRST)

All tests live in `src/intelligence/__tests__/health-monitor.test.ts`. The file already contains tests for the provider-wide version; the refactor will rewrite them. Below are the new test cases.

- **T01** `independent_cooldowns_per_model`: Set cooldown on (`anthropic`, `claude-haiku`) by calling `recordFailure` 5 times. Assert `isBlacklisted("anthropic", "claude-opus")` returns `false`. Assert `isBlacklisted("anthropic", "claude-haiku")` returns `true`.

- **T02** `model_reassignment_to_different_provider_mid_session`: Record a failure on (`deepseek`, `deepseek-v4-flash`). Then dispatch the same model via OpenRouter: call `isBlacklisted("openrouter", "deepseek-v4-flash")`. Assert `false`. The cooldown on one provider does not propagate to another.

- **T03** `legacy_health_json_does_not_crash`: Write a legacy format `health.json` (with `"providers"` key) to a temporary directory set as `HOME`. Call `loadPersisted`. Assert no exception. Assert `state.size` is 0. Assert a message is logged (verify via spy).

- **T04** `succeed_then_fail_then_succeed_resets_cooldown`: Sequence: call `recordSuccess(provider, model, 100)`, then `recordFailure` 5 times, then `recordSuccess` once. Assert `isBlacklisted` returns `false`. Assert `cooldownLevel` is 0. This tests the recovery mechanism.

- **T05** `cooldown_level_escalates_on_repeated_failures`: Call `recordFailure` 5 times in a window (within 5 minutes). Assert `cooldownLevel` is 1. Wait for cooldown to expire (call `isBlacklisted` to trigger probe), then fail again 5 more times. Assert `cooldownLevel` is 2. Repeat to level 4. Uses `jest.useFakeTimers`.

- **T06** `cooldown_level_decays_on_consecutive_success`: Set `cooldownLevel` to 2 via direct state manipulation. Call `recordSuccess` 2 times. Assert `cooldownLevel` is 1. Call 2 more successes: `cooldownLevel` becomes 0.

- **T07** `probe_during_cooldown_succeeds_clears_cooldown`: Set `blacklistedUntil` in the future. Call `isBlacklisted` (which sets `probeActive=true` and returns `false`). Then call `recordSuccess`. Assert `blacklistedUntil` is `null`. Assert `cooldownLevel` is decremented.

- **T08** `persistence_round_trip`: Create state with several entries. Call `persist`. Reset `state` map. Call `loadPersisted`. Assert all original entries are restored exactly (compare `HealthState` fields).

- **T09** `explicit_model_override_bypasses_cooldown`: Set cooldown on (`anthropic`, `claude-haiku`). Verify that `isBlacklisted("anthropic", "claude-haiku")` returns `true`. Then simulate the agent loop's first-turn check: emit an error event with `failoverModel` but do not abort. Assert that the loop continues (this test is in `agent-loop.test.ts` not here). In `health-monitor.test.ts`, just verify that `isBlacklisted` returns `true` and the function does not throw.

- **T10** `new_health_json_format_written_on_persist`: After calling `recordFailure` and `persist`, read the file. Assert JSON structure has `"entries"` key, not `"providers"`. Assert keys follow `"provider:model"` pattern.

- **T11** `multiple_callers_same_key_race`: Create two parallel `recordSuccess` calls for the same key. Use `Promise.all`. Assert final state has correct aggregated `totalRequests` (2). This tests that `state.get` and `state.set` are not racy; they are thread-safe in Node single-threaded, but the test documents the expectation.

(We have 11 tests, exceeding the 10 minimum.)

## 6. Rollback strategy

If this change lands in v1.34.0 and a regression is found within 24 hours:

- **User action**: Run `npm install -g @dirgha/code@1.33.25` (the version just before the refactor). This downgrades the CLI binary.

- **State impact**: The downgraded CLI reads `health.json` using the old parser. The new format (`entries` object) will be ignored because `store.providers` is undefined. The `if (!store?.providers) return;` guard in the old `loadPersisted` (current v1.33.x code line 111-112) returns early without loading any state. No crash. The user's cooldown state is lost, but the CLI works. On next startup, a new `health.json` is written with the old format (since the old code writes `providers`). The user experiences a one-time reset of cooldown history. This is acceptable.

- **No on-disk shim needed**: The downgrade path works without a shim because the old code is tolerant of the new structure (it just doesn't read it). No extra compatibility field required.

- **State loss**: Yes, any cooldown state accumulated while running v1.34.0 is lost on downgrade. This is acceptable because cooldown state is ephemeral and the user may never notice.

## 7. Failure modes considered

1. **Race between two concurrent agent loops recording on the same key**: Two concurrent calls to `recordSuccess` or `recordFailure` for the same (provider, model) pair. Node.js JavaScript is single-threaded, so no data race exists at the language level. The `state` map is mutated synchronously. Concurrency comes from async/await interleaving, not true parallelism. The only point of interleaving is the `persist()` call which is async due to disk I/O, but `recordSuccess` and `recordFailure` are synchronous and complete before `persist` is called. No race condition. **Mitigation**: Ensure all mutating functions (`recordSuccess`, `recordFailure`, `resetHealth`) are synchronous and non-blocking. They are currently synchronous. The `persist` call is fire-and-forget (`try/catch`, no `await`). That is fine.

2. **Disk full when writing `health.json`**: `persist` uses `writeFileSync` inside a try/catch. If the disk is full, the write throws; caught silently. State is not lost because the in-memory state remains, but disk persistence fails. **Mitigation**: The catch block is a no-op; the user gets a console error (the thrown exception is swallowed). To improve, log the error at `console.warn`. The existing code does not log; we should add `console.warn('[health-monitor] failed to persist health.json:', err.message)`. This is a minor improvement outside the spec.

3. **Process killed mid-write (partial JSON)**: `writeFileSync` in Node is typically an atomic rename: it writes to a temp file then renames. The current code uses `writeFileSync` directly, which is not atomic. If the process is killed during the write, the file may be truncated. On next startup, `JSON.parse` will throw. The current catch in `loadPersisted` (line 128) ignores parse errors. **Mitigation**: Use a write-to-temp-then-rename pattern: `writeFileSync(HEALTH_PATH + '.tmp', ...)`, then `renameSync(HEALTH_PATH + '.tmp', HEALTH_PATH)` (atom on same filesystem). Implement this change in this refactor. It's a small addition with high resilience value.

4. **Model identifier changes (e.g., DeepSeek rename `deepseek-v4-flash` to `deepseek-v4.1-flash`)**: The cooldown key uses the exact provider and model strings passed by the caller. If the model name changes (e.g., due to provider API update), old cooldown entries for the old name become inert. They remain in the JSON file but are never queried again. Over time, stale entries accumulate. **Mitigation**: Periodically (during garbage collection or on startup) prune entries whose `lastFailure` or `lastSuccess` is older than 7 days. Not part of this spec; accept stale entries as benign.

5. **Provider returns a 429 with `Retry-After` header in the past**: The `ErrorClassifier` (used in agent-loop.ts) parses retry-after and passes `backoffMs` to the retry logic. This is separate from health-monitor's cooldown. Health-monitor records `recordFailure` on every provider error, regardless of retry-after. If the header is in the past, `backoffMs` would be small or zero; health-monitor still increments the failure count. This is correct: the cooldown is based on failure window, not on retry-after. No change needed.

6. **The `findFailover` logic that currently uses `isBlacklisted(provider)` — does it get the model too?** `findFailover` is in `src/intelligence/prices.ts` and currently calls `isBlacklisted` with just the provider string. After refactor, it must pass both provider and model. The function is used at `agent-loop.ts:149` to suggest a fallback. It must be updated. **Mitigation**: Update `findFailover` signature to accept `(provider: string, model: string)` and call `isBlacklisted` with both. This is a required change.

7. **`recordSuccess` and `recordFailure` are called with a model string that may be 'undefined' or empty in some error paths**: The call at `agent-loop.ts:500` passes `errMsg` as error string but no model. Currently it's `recordHealthFailure(cfg.provider.id, errMsg)`. After changing to `recordHealthFailure(cfg.provider.id, cfg.model, errMsg)`, the model is available (`cfg.model` is a required string in `AgentLoopConfig`). No risk.

8. **The `isBlacklisted` call at `agent-loop.ts:148` currently uses `cfg.model` as provider; after refactor it must use the actual provider. If the provider is not available (e.g., before first dispatch), it could crash.** The provider is always available because `runAgentLoop` takes a `provider: Provider` in config. `cfg.provider.id` is a string. It is safe.

9. **`getAllHealth` returns all entries. The caller may iterate and display them without a model field.** The new `ProviderHealth` interface must include `model: string`. The TUI or telemetry that renders health info must show the model. Add `model` field to `ProviderHealth` interface. The `getAllHealth` function will populate it. The existing callers (if any) that iterate over the returned array and access `.provider` only will still work because `provider` remains. New callers can use `.model`.

10. **New in-memory state uses `Map<HealthKey, HealthState>`. The `ensureState` function creates a new `HealthState` with `model` field. All existing tests that call `recordSuccess(provider, 100)` will break because they lack the model argument. This is intentional.** All test files must be updated.

## 8. Estimated dispatches

1. **Spec dispatch** (this document) – 1 dispatch.
2. **Red-team dispatch** – a second architect reviews the spec and produces a red-team report (the team follows the pattern from `refactor-00-redteam-plan.md`). – 1 dispatch.
3. **Implementation dispatches**: The work is small enough to fit in a single implementation dispatch if the developer is familiar with the codebase. However, to keep each dispatch compiling and passing unit tests, split into:
   - Implementation A: Update types, internal state map, `ensureState`, `toKey`, all public function signatures (add model param). Update `persist` and `loadPersisted` for new format. Update `health-monitor.ts` only. No callsites changed yet. Unit tests for health-monitor (T01, T02, T03, T05, T06, T08, T10, T11) can be written and pass.
   - Implementation B: Update agent-loop.ts callsites (3 lines). Update `findFailover` in prices.ts. Update any other callers found by grep. Add integration test (T09 in agent-loop.test.ts). Write soak test script.
   **Total implementation dispatches**: 2.
4. **Test-writing dispatch**: The tests in the test plan (11 tests) are written as part of Implementation A and B. No separate test dispatch needed; treat as included.
5. **Integration test dispatch**: One dispatch to run the compressed soak harness (50-session synthetic harness) and the real 14-turn session. This may reveal bugs; if so, a fix dispatch is needed.

**Total dispatches**: 5 (1 spec + 1 red-team + 2 implementation + 1 integration). The team should plan `<10 dispatches`. With only 5, this is well within the `<10` threshold.

## 9. Definition of done

Before merging to `main`:
- `tsc --noEmit` passes with no errors.
- All existing 351 unit tests pass. Note: some tests may fail because they call old signatures; they must be updated during Implementation A. "351 existing unit tests still pass" means after updating test calls, the count remains 351 and all pass.
- The 11 new unit tests (T01–T11) pass.
- The compressed soak harness (50 synthetic sessions, each up to 10 turns, alternating models and providers) shows:
  - No false positive aborts (no `loopDetector` trips for cooldown reasons).
  - No cross-model contamination: `isBlacklisted` for model X never returns `true` because of model Y failures.
  - The soak completes without unhandled rejections.
- One real interactive 14-turn session (against a real provider like Anthropic or DeepSeek) shows:
  - Switching models across providers does not cause unexpected cooldown blocks.
  - Manual `/model` override works even if the model is blacklisted (the error event is emitted but the loop proceeds).
- A file `docs/cli/agent/refactor-01-per-model-cooldown-changelog.md` documents the changes:
  - New function signatures for `recordSuccess`, `recordFailure`, `isBlacklisted`, `getHealth`, `resetHealth`.
  - New `ProviderHealth.model` field.
  - `health.json` format changed from `providers` to `entries` keyed by `"provider:model"`.
  - Legacy entries are silently dropped; cooldown state restarts after upgrade.
  - All callers in `agent-loop.ts` and `prices.ts` updated.

## 10. Open questions

1. **Should `findFailover` also be updated to accept the model, or should we keep it provider-only?** The current `findFailover` in `prices.ts` uses `isBlacklisted` with just the provider. After refactor, if we update `findFailover` to pass model, it would correctly skip models that are not blacklisted. But `findFailover` currently returns a fallback model; it may be beneficial to allow failover to a sibling model even if the provider is healthy but one model is not. I recommend updating `findFailover` signature to `(model: string) => string | undefined` so it can check per-model cooldown. This is a minor interface change.

2. **Should the cooldown level decay remain at 2 consecutive successes, or change to 3 to reduce oscillation?** The current `RECOVERY_SUCCESSES = 2` is conservative. After refactor, each model has its own state, so aggressive recovery is safer. Keep 2. No change.

3. **Should the disk persistence move from JSON to SQLite to align with the future ledger?** The architecture audit proposes a `TaskLedger` in JSONL. This refactor (per-model cooldown) is a small change; migrating to SQLite now would overcomplicate the spec. Stick with JSON. The ledger is a separate item.

4. **Should we introduce a provider-wide fallback cooldown for 5xx storms (the MAY invariant from the spec)?** The spec's MAY clause was omitted because it adds complexity not required by the current bug. The team can add it later. For now, strictly per-model.

5. **Who owns the update to `prices.ts` (findFailover) and `agent-loop.ts` callsites?** The implementation dispatches should cover both files. The spec does not assign ownership; the team will assign during implementation.