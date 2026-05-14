# Audit: SPEC-01-V2-PER-MODEL-COOLDOWN

## 1. Problem statement

The current cooldown system in `src/intelligence/health-monitor.ts` keys all state by a single `provider: string`. The internal state is a `Map<string, InternalState>` where the string is the provider name. All public functions—`recordSuccess`, `recordFailure`, `isBlacklisted`, `getHealth`, `getAllHealth`, `resetHealth`—accept and operate on a provider string only. The disk persistence in `health.json` uses a `providers` record keyed by provider name. The design assumes that a provider's health is uniform across all its models.

**Observed bug**: A single model failure poisons all sibling models on the same provider. For example, if `anthropic:claude-haiku` triggers cooldown (5 failures in a window), the provider key `"anthropic"` is blacklisted. Any subsequent request for `anthropic:claude-opus` is blocked because `isBlacklisted("anthropic")` returns true (`health-monitor.ts:216-221`). The model argument at the callsite in `agent-loop.ts:148` passes `cfg.model` (a model string like `"claude-opus"`) to `isBlacklisted`, which currently ignores it. This is a latent bug: the parameter was designed as provider but callers pass model. The refactor must fix this mismatch.

**Red-team P0**: The call at `agent-loop.ts:483` uses `isBlacklisted(cfg.model)` imported from `src/intelligence/failover-chain.ts` (line 100), NOT from `health-monitor.ts`. These are two different functions with the same name. The `failover-chain.ts:100` `isBlacklisted(modelId: string)` is a separate function that maintains a per-model 'blacklist' (different concept from cooldown). It returns true if the model has accumulated `MAX_FAILOVERS` (5) consecutive failovers within the session (`failover-chain.ts:55`). The v2 design merges these two concepts: a model is 'blacklisted' if it has accumulated cooldown failures (the cooldown bit) OR if it has been explicitly marked dead by the failover chain after repeated failovers (the failover bit). Unified state lives in `health-monitor.ts`.

**Red-team P1**: The v1 spec incorrectly asserted `prices.ts findFailover` calls `isBlacklisted` — this is false. There is no such call in `prices.ts`. The v1 spec's Q1 ripple analysis was wrong on this point. The `findFailover` function lives in `failover-chain.ts` and operates purely on model ids, provider-independent.

**Red-team P2**: No `src/web/` dashboard impact analysis — but a verified grep shows ZERO importers of health-monitor in `src/web/`, `src/cli/`, or `scripts/qa-app/`. P2 is moot in practice.

The bug manifests concretely when a model like `deepseek-v4-flash` on provider `deepseek` enters cooldown after 5 failures. The next turn using `deepseek-code` on the same provider is unconditionally blocked, even if that model has never failed. The user sees an unnecessary failover or error message, and the conversation stalls.

## 2. Target invariants

1. MUST: A cooldown entry is uniquely identified by the (provider, model) pair. Storing and querying use both values.

2. MUST: A model that has never been called has no cooldown state. `isBlacklisted(provider, model)` for any pair with no record returns `false`.

3. MUST: A cooldown set on (providerA, modelX) does not affect any request for (providerA, modelY) where modelY != modelX. This is the core invariant.

4. MUST: The `recordSuccess` function accepts both provider and model, and updates state only for that pair. Success on (providerA, modelX) does not reset failures on (providerA, modelY).

5. MUST: The `recordFailure` function accepts both provider and model. Failures are counted per (provider, model) independently.

6. MUST: Disk persistence in `health.json` stores per (provider, model) entries. Old provider-only entries (from versions < v1.34.0) are silently dropped on first read; no migration of legacy values occurs. Reason: legacy entries are ambiguous (which model caused the failures?). A log message is emitted at WARN level.

7. MUST: The `isBlacklisted` function used in the failover chain (`src/intelligence/failover-chain.ts`) and agent loop (`agent-loop.ts:148`) receives both provider and model. The callsite in `agent-loop.ts:148` is corrected from `isBlacklisted(cfg.model)` to `isBlacklisted(provider, model)`.

8. MUST: The in-memory state shape is `Map<HealthKey, HealthState>` where `HealthKey` is a string literal `${provider}:${model}`.

9. MUST: The public API exports `recordSuccess(provider: string, model: string, latencyMs: number): void`, `recordFailure(provider: string, model: string, error: string): void`, `isBlacklisted(provider: string, model: string): boolean`, `getHealth(provider: string, model: string): ProviderHealth | null`, `getAllCooldowns(): ProviderHealth[]`, `resetHealth(provider: string, model: string): void`.

10. MUST: The cooldown backoff logic (exponential levels, failure window, recovery successes) remains identical per (provider, model) pair. The constants `FAILURE_WINDOW_MS`, `FAILURE_TRIGGER`, `COOLDOWN_BACKOFF_MS`, `RECOVERY_SUCCESSES` are unchanged.

11. MAY: A provider-wide 5xx storm can optionally be detected and cause a brief (30s) global cooldown for all models of that provider, but this is NOT part of this spec. The current implementation does not have such logic; adding it would be a separate feature. This spec strictly per-model only.

12. NEVER: A cooldown decision blocks a model the user explicitly set with `/model` in the current session. The agent loop checks `isBlacklisted` before the first turn (`agent-loop.ts:148`). If the user manually set a model, the check is still performed; if the model is blacklisted, a failover is suggested but the user can ignore it. The invariant is that the loop does not silently discard the user's choice — it emits an error event with the failover suggestion but continues with the user's model. This is already the behavior in the current code (line 148-154 in agent-loop.ts: `if (isBlacklisted(cfg.model)) { ... }` emits an error with `failoverModel` but does not abort the loop). After refactor, it will check `isBlacklisted(provider, cfg.model)` with the correct provider.

**New invariants from unification**:

13. MUST: `isBlacklisted` is a single function exported from `health-monitor.ts`. Signature: `isBlacklisted(provider: string, model: string): boolean`.

14. MUST: `failover-chain.ts`'s `isBlacklisted(modelId)` is REMOVED. `failover-chain.ts` re-exports `isBlacklisted` from `health-monitor` for caller compatibility, OR the failover-chain code that calls it switches to import from `health-monitor` with the new signature. The chosen design: `failover-chain.ts` no longer defines its own `isBlacklisted`. It re-exports from `health-monitor`: `export { isBlacklisted } from './health-monitor.js';`. This keeps backward compat for any code that imports `isBlacklisted` from `failover-chain`.

15. MUST: `failover-chain.ts`'s `recordFailover(modelId)` updates the unified state — when a model exceeds `MAX_FAILOVERS` (5), the model's `failoverBlacklist` flag is set in the health state for that model's provider+model pair. `isBlacklisted` returns true if cooldown OR failoverBlacklist is true.

16. MUST: A model that has NEITHER cooldown NOR failover-blacklist is healthy.

17. MAY: a model that has ONLY failover-blacklist (no cooldown) still gets failover suggestions but the user CAN override (existing behavior preserved).

## 3. Concrete TypeScript interfaces

### Current signatures (pre-refactor)

**`src/intelligence/health-monitor.ts`** (from provided file):
```ts
export function recordSuccess(provider: string, latencyMs: number): void;
export function recordFailure(provider: string, _error: string): void;
export function isBlacklisted(provider: string): boolean;
export function getHealth(provider: string): ProviderHealth | null;
export function getAllHealth(): ProviderHealth[];
export function resetHealth(provider: string): void;
```

**`src/intelligence/failover-chain.ts`** (from provided file, relevant functions):
```ts
// Per-session failover count & blacklist (file:55-60)
const failoverCounts = new Map<string, number>();
const blacklistedModels = new Set<string>();

export function recordFailover(modelId: string, sessionLogger?: ... ): void; // file:~70
export function isBlacklisted(modelId: string): boolean; // file:100
export function resetFailoverState(): void;             // file:~108
export function resetModelBlacklist(modelId: string): void; // file:~112

export function buildFailoverChain(modelId: string, opts?: ... ): FailoverChain; // file:~120
```

Note: `findFailover` is in `prices.ts` (file:line ~570), NOT in `failover-chain.ts`. Its current signature:
```ts
export function findFailover(modelId: string): string | undefined;
```
It does not call `isBlacklisted` at all.

**Calling pattern in `agent-loop.ts`**:
```ts
import {
  recordFailover,
  isBlacklisted,
} from "../intelligence/failover-chain.js";  // line 25-26

import {
  recordSuccess as recordHealthSuccess,
  recordFailure as recordHealthFailure,
} from "../intelligence/health-monitor.js";  // line 27-28
```

### Proposed signatures (post-refactor)

**`src/intelligence/health-monitor.ts`** (unified state, per-model):
```ts
export type HealthKey = `${string}:${string}`; // "provider:model"
function toKey(provider: string, model: string): HealthKey {
  return `${provider}:${model}`;
}

export function recordSuccess(provider: string, model: string, latencyMs: number): void;
export function recordFailure(provider: string, model: string, error: string): void;
export function isBlacklisted(provider: string, model: string): boolean;
export function getHealth(provider: string, model: string): ProviderHealth | null;
export function getAllHealth(): ProviderHealth[];
export function resetHealth(provider: string, model: string): void;
// New function for failover chain integration:
export function recordFailoverEvent(provider: string, model: string): void;
// Returns true if the model is blacklisted due to failover (distinct from cooldown)
export function isFailoverBlacklisted(provider: string, model: string): boolean;
// Clears failover blacklist for a model
export function resetFailoverBlacklist(provider: string, model: string): void;
```

**`src/intelligence/failover-chain.ts`** (simplified):
```ts
// Remove local isBlacklisted entirely.
// Re-export from health-monitor:
export { isBlacklisted } from './health-monitor.js';

// recordFailover now updates both the local failover count AND the health-monitor's failover blacklist.
// Signature unchanged for backward compat: (modelId: string)
export function recordFailover(modelId: string, sessionLogger?: ...): void;

// buildFailoverChain uses health-monitor.isBlacklisted(provider, model) internally (it already
// has access to provider via PRICES lookup).
// No other signature changes.
```

**Internal state changes in health-monitor.ts**:

New `HealthState`:
```ts
interface HealthState {
  provider: string;
  model: string;
  totalRequests: number;
  failures: number;
  lastFailure: number;
  lastSuccess: number;
  avgLatencyMs: number;
  blacklistedUntil: number | null;   // cooldown blacklist
  cooldownLevel: number;
  failureWindowStart: number;
  failuresInWindow: number;
  probeActive: boolean;
  consecutiveSuccesses: number;
  lastCooldownDecay: number;
  // New fields for failover integration:
  failoverBlacklist: boolean;         // true if failover chain blacklisted this model
  failoverCount: number;              // consecutive failovers (resets on success)
}
```

State map: `const state = new Map<HealthKey, HealthState>();`

**Disk persistence shape**:

Old format (`providers` key) → at health-monitor.ts:99-109 (current persist writes `providers` map).

New format (`entries` key):
```json
{
  "updatedAt": "2025-04-01T12:00:00.000Z",
  "entries": {
    "anthropic:claude-haiku": { "provider": "anthropic", "model": "claude-haiku", "totalRequests": 100, "cooldownLevel": 0, "failoverBlacklist": false, "failoverCount": 0, ... },
    "anthropic:claude-opus": { "provider": "anthropic", "model": "claude-opus", "totalRequests": 50, ... }
  }
}
```

### Callsites in `agent-loop.ts` that need updating

Inspected agent-loop.ts lines from provided source:

1. **Line 148** (`agent-loop.ts:148`): 
   - Current: `if (turnIndex === 0 && isBlacklisted(cfg.model)) {`
   - Import: `import { ... isBlacklisted } from "../intelligence/failover-chain.js";` (line 25)
   - New: change import to `import { ... isBlacklisted } from "../intelligence/health-monitor.js";` OR keep import from failover-chain which will re-export. The call must become `isBlacklisted(cfg.provider.id, cfg.model)`. The provider id is available via `cfg.provider.id` (used elsewhere, e.g., `recordRequest(cfg.provider.id, ...)` at line ~485).

2. **Line 483** (in the catch block for stream errors): 
   - Current: `recordHealthFailure(cfg.provider.id, errMsg);` — this already passes provider id but no model.
   - New: `recordHealthFailure(cfg.provider.id, cfg.model, errMsg);`

3. **Line 500** (in `recordFailover` call): 
   - Current: `recordFailover(cfg.model);` — passes only model.
   - New: `recordFailover(cfg.model);` — signature unchanged (modelId only). The internal implementation of `recordFailover` will need to resolve the provider from the model to update health-monitor state. The simplest approach: `recordFailover` remains model-only, and inside it calls `health-monitor.recordFailoverEvent(provider, model)` where provider is looked up via `resolveModelForDispatch` or from a registry. Since `recordFailover` is called from agent-loop where provider is known, we could also change its signature to `(modelId: string, provider?: string)` but that’s a larger change. Per accepted Q1, we keep the single-arg signature for backward compat and resolve provider internally via the price catalogue. If provider cannot be resolved, we log a warning and skip the unified blacklist update (the session-level blacklist still operates).

4. **Line 724** (in tool execution after successful turn): 
   - Current: `recordHealthSuccess(cfg.provider.id, 0);` 
   - New: `recordHealthSuccess(cfg.provider.id, cfg.model, 0);`

5. **Line 498** (in `recordFailover` call after failover):
   - Current: `recordFailover(cfg.model);` (same as line 500)
   - Same treatment.

6. **Other callsites**: grep confirmed:
   - `agent-loop.ts:148` — isBlacklisted (from failover-chain)
   - `agent-loop.ts:500` — recordFailover (model only)
   - `agent-loop.ts:724` — recordHealthSuccess (provider only)
   - `agent-loop.ts:483` — recordHealthFailure (provider only)
   - `agent-loop.ts:498` — recordFailover (model only)
   - No other imports of health-monitor or failover-chain in agent-loop.ts.

**Update matrix**:

| File | Line | Current code | New code |
|------|------|-------------|----------|
| `agent-loop.ts:148` | `import { ... isBlacklisted } from "../intelligence/failover-chain.js";` | Change import to `import { ... isBlacklisted, } from "../intelligence/health-monitor.js";` OR keep re-export from failover-chain. Change call to `isBlacklisted(cfg.provider.id, cfg.model)`. |
| `agent-loop.ts:483` | `recordHealthFailure(cfg.provider.id, errMsg)` | `recordHealthFailure(cfg.provider.id, cfg.model, errMsg)` |
| `agent-loop.ts:500` | `recordFailover(cfg.model)` | `recordFailover(cfg.model)` — unchanged, but implementation changed |
| `agent-loop.ts:498` | `recordFailover(cfg.model)` | `recordFailover(cfg.model)` — unchanged |
| `agent-loop.ts:724` | `recordHealthSuccess(cfg.provider.id, 0)` | `recordHealthSuccess(cfg.provider.id, cfg.model, 0)` |

### Callsite corrections for the v1 spec's false claim

The v1 spec stated: "The `findFailover` logic that currently uses `isBlacklisted(provider)` — does it get the model too? `findFailover` is in `src/intelligence/prices.ts` and currently calls `isBlacklisted` with just the provider string. After refactor, it must pass both provider and model." This is incorrect. `prices.ts` (as provided) has no `findFailover` function — `findFailover` is in `failover-chain.ts` (line ~135). It does not call `isBlacklisted` at all. Therefore no change is needed to `findFailover` for health-monitor integration. However, `buildFailoverChain` in `failover-chain.ts` calls `isBlacklisted` (the local one) at lines during tier building (e.g., `if (isBlacklisted(m.model)) continue;`). After unification, those calls must use `isBlacklisted(provider, model)`. Since `buildFailoverChain` already has access to provider via `PRICES`, it can call `isBlacklisted(provider, model)` from health-monitor.

## 4. Migration strategy

### Detection of legacy `health.json`

On startup, `loadPersisted` attempts to read `health.json`. The current code reads `store.providers` and iterates over entries (`health-monitor.ts:114-118`). The new code will first check for `store.entries`. If `store.entries` is missing but `store.providers` exists, that is the legacy format.

**Behavior**: When legacy format is detected:
- A single `console.warn` with prefix `[health-monitor]` is emitted: `Found legacy health.json with provider-wide keys. These are not migrated to per-model keys and will be ignored. Cooldown state starts fresh.` (Red-team recommended `warn` level instead of `info`.)
- Legacy entries are not loaded into state. The `state` map remains empty.
- No file migration is performed. The next `persist()` call overwrites the file with the new format (entries keyed by `provider:model`). This means the old state is permanently lost after the first write. Users upgrading from v1.33.x will lose their provider-wide cooldown history.

**Rationale**: Legacy entries are ambiguous: a cooldown on `"openai"` could have been caused by any model. Migrating them to all models of that provider would poison newly discovered models. Dropping them is safer and simpler. The team acknowledges this loss via the red-team Section 4 but judges it acceptable for a point release.

**Legacy file robustness**: The `loadPersisted` loader must filter out entries with non-string `provider` values (red-team finding). The current code at health-monitor.ts:117 checks `typeof entry.provider !== 'string'` and skips those. This check must be preserved and extended to also skip entries where `provider` is missing or not a string. The new format's `entries` object may also have non-string keys if the JSON is corrupt; the loader should use `typeof key === 'string'` and `typeof entry.provider === 'string'` guard.

### Cross-device atomic-write fallback

The current `persist()` uses `writeFileSync` directly (`health-monitor.ts:122`). This is not atomic and can produce partial files on crash. The new implementation uses write-to-temp-then-rename:

```ts
function persist(): void {
  const dir = join(homedir(), ".dirgha");
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {
    return;
  }
  const store = buildStoreFromState();
  const tmp = HEALTH_PATH + '.tmp';
  try {
    writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    renameSync(tmp, HEALTH_PATH);
  } catch (err) {
    // EXDEV: cross-device link, fall back to direct write
    if (err instanceof Error && 'code' in err && err.code === 'EXDEV') {
      console.warn('[health-monitor] cross-device atomic write fallback');
      try {
        writeFileSync(HEALTH_PATH, JSON.stringify(store, null, 2), 'utf8');
      } catch (fallbackErr) {
        console.warn('[health-monitor] fallback persist also failed:', String(fallbackErr));
      }
    } else {
      console.warn('[health-monitor] failed to persist health.json:', String(err));
    }
  }
}
```

**Startup tmp file cleanup**: In `loadPersisted`, before reading the main file, attempt to delete any leftover `.tmp` file:

```ts
function loadPersisted(): void {
  try {
    const tmpFile = HEALTH_PATH + '.tmp';
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  } catch { /* ignore */ }
  // ... original load logic ...
}
```

### Rollback compatibility

After upgrading to v1.34.0, the new code writes `health.json` with the `entries` object keyed by `"provider:model"`. The old code (v1.33.x) reads `store.providers`. It will either:
- Ignore the `entries` key and see an empty `providers` block, thus starting with no cooldown state.
- Or crash if the JSON parser throws on unexpected structure. The current v1.33.x code accesses `store.providers` (line 115), which will be `undefined`. The `if (!store?.providers) return;` guard will cause it to silently return, so no crash. No state is loaded. This is safe.

Thus rollback from v1.34.0 to v1.33.x is possible: the old code will not read the new format, but it will not crash. The user loses any cooldown state accumulated while running v1.34.0. That is acceptable because cooldown state is not critical for functionality — it only affects model selection after failures. The user will have fresh cooldown state after downgrade, which mimics a clean start.

**Note**: If the user downgrades and never triggers a health event, the `entries` file persists. On re-upgrade, the new code reads `store.entries` and restores state. State survives a downgrade without health events. The v1 spec claimed state loss is inevitable, but it's conditional on a health event after downgrade. This edge case is acceptable.

### Feature flag

No runtime feature flag (`DIRGHA_COOLDOWN_LEGACY=1`) is needed. The migration is a one-time format change; the old format is not supported in the new code.

## 5. Test plan (TDD — these are written FIRST)

All tests live in `src/intelligence/__tests__/health-monitor.test.ts` unless otherwise noted. The file already contains tests for the provider-wide version; the refactor will rewrite them.

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

**New tests from red-team** (add after T11):

- **T12** `legacy_then_persist_does_not_bleed`: Create a legacy file with two providers: one valid (`"deepseek"`) and one with a non-string provider value (e.g., `"badProvider": { "provider": 123 }`). Call `loadPersisted` (legacy file). Then call `recordSuccess("testProvider", "testModel", 100)`, `persist`, clear state, `loadPersisted`. Assert that `state` contains only the `testProvider:testModel` entry. Assert that no entry with provider `"deepseek"` or `"badProvider"` exists. Assert that the persisted file contains only `entries` key, no `providers`.

- **T13** `model_name_with_colon`: Provider `openrouter`, model `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`. Key is `openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`. round-trips correctly. Call `recordSuccess("openrouter", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", 100)`. Assert `isBlacklisted("openrouter", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free")` returns false (no cooldown). Assert `getAllHealth()` returns one entry with `model` including the colon. Assert that the persisted JSON has key `"openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"`.

- **T14** `cross_device_rename_fallback`: Mock `renameSync` to throw EXDEV. Call `recordFailure` to trigger `persist`. Assert `console.warn` fires with `'[health-monitor] cross-device atomic write fallback'`. Assert target file (`HEALTH_PATH`) is written by the fallback `writeFileSync`. Verify content is valid JSON with `entries`.

- **T15** `failover_chain_unification`: Set failoverBlacklist via `recordFailoverEvent(provider, model)` (or via `recordFailover(modelId)` if it internally updates health state) `MAX_FAILOVERS` (5) times. Assert `isBlacklisted(provider, model)` returns true. Separately, set cooldown via `recordFailure` 5 times on the same (provider, model); assert `isBlacklisted` still returns true (cooldown OR failover). Then clear cooldown via `recordSuccess` until cooldown expires (but failoverBlacklist remains). Assert `isBlacklisted` still true because of failover flag. Reset failoverBlacklist via `resetFailoverBlacklist`. Assert `isBlacklisted` returns false. This test lives in `src/intelligence/__tests__/health-monitor.test.ts` because it tests the unified state directly. A companion integration test in `agent-loop.test.ts` can verify that `recordFailover` from agent-loop triggers the blacklist.

**Test file ownership**: T01-T14 in `src/intelligence/__tests__/health-monitor.test.ts`. T15 partially there, plus a small integration test in `src/kernel/__tests__/agent-loop.test.ts` to verify that calling `recordFailover` 5 times results in `isBlacklisted` returning true for that model.

## 6. Rollback strategy

If this change lands in v1.34.0 and a regression is found within 24 hours:

- **User action**: Run `npm install -g @dirgha/code@1.33.25` (the version just before the refactor). This downgrades the CLI binary.

- **State impact**: The downgraded CLI reads `health.json` using the old parser. The new format (`entries` object) will be ignored because `store.providers` is undefined. The `if (!store?.providers) return;` guard in the old `loadPersisted` (current v1.33.x code line 115) returns early without loading any state. No crash. The user's cooldown state is lost, but the CLI works. On next startup, a new `health.json` is written with the old format (since the old code writes `providers`). The user experiences a one-time reset of cooldown history. This is acceptable.

- **No on-disk shim needed**: The downgrade path works without a shim because the old code is tolerant of the new structure (it just doesn't read it). No extra compatibility field required.

- **State loss**: Yes, any cooldown state accumulated while running v1.34.0 is lost on downgrade. This is acceptable because cooldown state is ephemeral and the user may never notice.

- **failover-chain.ts export note**: After unification, `failover-chain.ts` no longer exports `isBlacklisted` (it re-exports from health-monitor). If a user downgrades to v1.33.x, the old code's import from `failover-chain` works because that's the version it was built against. Forward compat is fine. Backward (downgrade) is fine because the old `health.json` format is read-tolerant. No issue.

- **Edge case**: If the user downgrades and never triggers a health event, the `entries` file remains. On re-upgrade, the new code reads `store.entries` and restores state. State survives a downgrade without health events. This is acceptable.

## 7. Failure modes considered

1. **Race between two concurrent agent loops recording on the same key**: Two concurrent calls to `recordSuccess` or `recordFailure` for the same (provider, model) pair. Node.js JavaScript is single-threaded, so no data race exists at the language level. The `state` map is mutated synchronously. Concurrency comes from async/await interleaving, not true parallelism. The only point of interleaving is the `persist()` call which is async due to disk I/O, but `recordSuccess` and `recordFailure` are synchronous and complete before `persist` is called. No race condition. **Mitigation**: Ensure all mutating functions (`recordSuccess`, `recordFailure`, `resetHealth`, `recordFailoverEvent`) are synchronous and non-blocking. They are currently synchronous. The `persist` call is fire-and-forget (try/catch, no await). That is fine.

2. **Disk full when writing `health.json`**: `persist` uses `writeFileSync` inside a try/catch. If the disk is full, the write throws; caught silently. State is not lost because the in-memory state remains, but disk persistence fails. **Mitigation**: The catch block logs a warning via `console.warn('[health-monitor] failed to persist health.json:', err.message)`. The existing code does not log; we add it.

3. **Process killed mid-write (partial JSON)**: The new code uses write-to-temp-then-rename. If the process is killed between `writeFileSync(tmp)` and `renameSync(tmp, HEALTH_PATH)`, the tmp file leaks and the original file is untouched. On next startup, `loadPersisted` reads the original file (unchanged). The `console.warn` does not fire because `renameSync` didn't throw. The tmp file is cleaned up at startup (see Section 4). **Mitigation**: Startup cleanup of `.*.tmp` files. Also, if `renameSync` throws EXDEV, fall back to direct write (Section 4). If `renameSync` throws any other error (e.g., permission denied), log and proceed — state remains in memory.

4. **Model identifier changes (e.g., DeepSeek rename `deepseek-v4-flash` to `deepseek-v4.1-flash`)**: The cooldown key uses the exact provider and model strings passed by the caller. If the model name changes (e.g., due to provider API update), old cooldown entries for the old name become inert. They remain in the JSON file but are never queried again. Over time, stale entries accumulate. **Mitigation**: Periodically (during garbage collection or on startup) prune entries whose `lastFailure` or `lastSuccess` is older than 7 days. Not part of this spec; accept stale entries as benign.

5. **Provider returns a 429 with `Retry-After` header in the past**: The `ErrorClassifier` (used in agent-loop.ts) parses retry-after and passes `backoffMs` to the retry logic. This is separate from health-monitor's cooldown. Health-monitor records `recordFailure` on every provider error, regardless of retry-after. If the header is in the past, `backoffMs` would be small or zero; health-monitor still increments the failure count. This is correct: the cooldown is based on failure window, not on retry-after. No change needed.

6. **`findFailover` does NOT call `isBlacklisted`** (P1 correction): The v1 spec claimed it did. It does not. No change required to `findFailover` for health integration. However, `buildFailoverChain` in `failover-chain.ts` uses `isBlacklisted` (local) to skip models during tier building. After unification, `buildFailoverChain` must call `isBlacklisted(provider, model)` from health-monitor. Since `buildFailoverChain` has access to the provider via `PRICES` (e.g., for each model it looks up the price point and hence provider), this is feasible. The implementation must update the calls to `isBlacklisted(m.model)` to `isBlacklisted(m.provider, m.model)` (where `m` is a `PricePoint` or has a `provider` field). This change is part of Implementation B (failover-chain modifications).

7. **`recordSuccess` and `recordFailure` are called with a model string that may be 'undefined' or empty in some error paths**: The call at `agent-loop.ts:500` passes `errMsg` as error string but no model. Currently it's `recordHealthFailure(cfg.provider.id, errMsg)`. After changing to `recordHealthFailure(cfg.provider.id, cfg.model, errMsg)`, the model is available (`cfg.model` is a required string in `AgentLoopConfig`). No risk.

8. **The `isBlacklisted` call at `agent-loop.ts:148` currently uses `cfg.model` as provider; after refactor it must use the actual provider. If the provider is not available (e.g., before first dispatch), it could crash.** The provider is always available because `runAgentLoop` takes a `provider: Provider` in config. `cfg.provider.id` is a string. It is safe.

9. **`getAllHealth` returns all entries. The caller may iterate and display them without a model field.** The new `ProviderHealth` interface must include `model: string`. The TUI or telemetry that renders health info must show the model. Add `model` field to `ProviderHealth` interface. The `getAllHealth` function will populate it. The existing callers (if any) that iterate over the returned array and access `.provider` only will still work because `provider` remains. New callers can use `.model`.

10. **New in-memory state uses `Map<HealthKey, HealthState>`. The `ensureState` function creates a new `HealthState` with `model` field. All existing tests that call `recordSuccess(provider, 100)` will break because they lack the model argument. This is intentional.** All test files must be updated.

**New failure modes from red-team**:

11. **Model name contains colon** (red-team Gap 2): The key is `${provider}:${model}`. For provider `openrouter`, model `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, the key becomes `"openrouter:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"`. This string contains multiple colons. The spec uses the key as opaque; the model is stored in the `HealthState.model` field and is never parsed. However, any code that attempts to split on the first colon to extract provider would get incorrect results if the model contains a colon. **Mitigation**: Document that the key internal format is opaque and must not be parsed. The `toKey` function converts provider+model to a string; the reverse is never needed. The `entries` dictionary keys in the JSON file follow the same opaque rule. The `loadPersisted` function does not parse the key; it reads `entry.provider` and `entry.model` fields.

12. **SIGKILL between writeFileSync and renameSync** (red-team Section 6): Temp file leaks. **Mitigation**: Startup cleanup as described in Section 4. Also, the tmp file name is deterministic (`HEALTH_PATH + '.tmp'`), so a subsequent startup overwrites the stale tmp before reading.

13. **cooldownLevel == 0 and recordSuccess called** (red-team): The current code at `health-monitor.ts:157-167` uses `Math.max(0, s.cooldownLevel - 1)` when decrementing. This is safe: subtracting one from zero yields zero. No negative values. **Verify** via test.

14. **Legacy file with non-string provider values** (red-team Section 4): The existing `loadPersisted` at line `health-monitor.ts:117` checks `typeof entry.provider !== 'string'` and skips. This handles it. The new loader must also skip entries where `entry.provider` is missing or not a string. Additionally, the legacy file may have `providers` keys that are not valid provider names (e.g., numbers). The `Object.entries` iterates over them; the `provider` field check will filter them out. No crash.

## 8. Estimated dispatches

1. **Spec v2 dispatch** (this document) – 1 dispatch.
2. **Implementation A**: health-monitor.ts unified state, public API changes, persistence with atomic write + EXDEV fallback, startup tmp cleanup. New internal `HealthState` with `failoverBlacklist` and `failoverCount`. New public `recordFailoverEvent`, `isFailoverBlacklisted`, `resetFailoverBlacklist`. Tests T01-T11, T12, T13, T14. – 1 dispatch.
3. **Implementation B**: failover-chain.ts simplified (removes local `isBlacklisted`, re-exports from health-monitor). Update `recordFailover` to call `health-monitor.recordFailoverEvent` (provider resolved internally). Update `buildFailoverChain` to use health-monitor `isBlacklisted(provider, model)`. – 1 dispatch.
4. **Implementation C**: agent-loop.ts callsite updates (lines 148, 483, 500, 498, 724). Update imports. Test T15 in `agent-loop.test.ts`. – 1 dispatch.
5. **Integration test dispatch**: 50-session synthetic harness + 14-turn real session. Verify no cross-model contamination, failover chain unification works end-to-end. – 1 dispatch.
6. **Changelog and documentation**: Write `docs/cli/agent/refactor-01-per-model-cooldown-changelog.md`. – 1 dispatch.

Total: 6 dispatches. Higher than v1's 5 but still under 10.

## 9. Definition of done

Before merging to `main`:
- `tsc --noEmit` passes with no errors.
- All existing unit tests pass after updating signatures.
- The new unit tests T01–T15 pass.
- The compressed soak harness (50 synthetic sessions, each up to 10 turns, alternating models and providers) shows:
  - No false positive aborts (no `loopDetector` trips for cooldown reasons).
  - No cross-model contamination: `isBlacklisted` for model X never returns `true` because of model Y failures.
  - The soak completes without unhandled rejections.
- One real interactive 14-turn session (against a real provider like Anthropic or DeepSeek) shows:
  - Switching models across providers does not cause unexpected cooldown blocks.
  - Manual `/model` override works even if the model is blacklisted (the error event is emitted but the loop proceeds).
- `failover-chain.ts` no longer exports its own `isBlacklisted` function (it re-exports from health-monitor or the imports are changed).
- All `agent-loop.ts` callsites (148, 483, 500, 498, 724) updated to new signatures.
- `console.warn` fires on EXDEV during persist; verified via test T14.
- `.tmp` file is cleaned on startup; verified via test (part of T14 or separate).
- Legacy JSON with non-string provider values does not cause crash; tested in T12.
- Model name with colon round-trips correctly; tested in T13.
- A file `docs/cli/agent/refactor-01-per-model-cooldown-changelog.md` documents the changes:
  - New function signatures for `recordSuccess`, `recordFailure`, `isBlacklisted`, `getHealth`, `resetHealth`.
  - New `ProviderHealth.model` field.
  - `health.json` format changed from `providers` to `entries` keyed by `"provider:model"`.
  - Legacy entries are silently dropped; cooldown state restarts after upgrade.
  - All callers in `agent-loop.ts` and `failover-chain.ts` updated.
  - Unification of cooldown blacklist and failover blacklist in health-monitor.
  - Atomic write with EXDEV fallback.
  - Every public function whose signature changed is listed with old and new.

## 10. Open questions

1. **Should `failover-chain.recordFailover(modelId)` keep its single-arg signature and look up the provider internally, or should it take (provider, model) explicitly?** The simpler answer is to keep the modelId-only signature for backward compat at the failover-chain boundary, but internally call `health-monitor.recordFailoverEvent(provider, model)` where provider is resolved via dispatch (using the price catalogue). This is the design chosen in this spec. However, the architect must confirm: if the provider cannot be resolved (model not found in PRICES), `recordFailoverEvent` should not be called, or should default to some fallback provider string? Recommendation: if provider is unknown, log a warning and skip the unified blacklist update. The session-level blacklist (in `failover-chain.ts`'s local state) still operates regardless, so failover detection still works for unknown models at the session level.

2. **The cooldown failure count and the failover-blacklist count are two separate failure axes. Should they share a `failureCount` field, or stay separate (`failureCount` + `failoverCount`)?** This spec recommends keeping separate: `failuresInWindow` (for cooldown) and `failoverCount` (for failover blacklist). The `failoverBlacklist` boolean is set when `failoverCount >= MAX_FAILOVERS`. This preserves the audit trail and allows independent reset (cooldown can decay while failover blacklist persists). The architect must decide and document.

3. **Should we add a provider-wide fallback cooldown for 5xx storms (the MAY invariant)?** No. This spec is strictly per-model. Provider-wide 5xx detection can be added later as a separate feature.

4. **Who owns the update to `failover-chain.ts` and `agent-loop.ts`?** The implementation dispatches cover both. The team will assign during implementation.

5. **What about `resetFailoverState` export?** It currently resets the session-level blacklist. After unification, it should also reset the failover blacklist in health-monitor for all models? Probably not — the health-monitor state is persistent across sessions, while the failover state is per-session. `resetFailoverState` should continue to reset only the in-memory session-level map, not the health file. The health-monitor failover blacklist is cleared by `resetFailoverBlacklist(provider, model)` or by `recordSuccess` (which resets `failoverCount` to 0). The architect should decide: should a successful turn after a failover clear the failover blacklist? Currently, `recordSuccess` in health-monitor resets `failuresInWindow` but not `failoverCount`. This spec recommends that a successful tool execution (recordSuccess) on a model that had failover blacklist should NOT automatically clear the blacklist — the user must explicitly reset or the failover count must decay over time. However, for simplicity, the architect may choose to reset `failoverCount` to 0 on any successful turn for that model. That aligns with the idea that a successful call indicates the model is working again. Recommendation: on `recordSuccess`, set `failoverCount = 0` and `failoverBlacklist = false`. This is consistent with the existing behavior: a successful probe clears cooldown. Declare this decision and document.