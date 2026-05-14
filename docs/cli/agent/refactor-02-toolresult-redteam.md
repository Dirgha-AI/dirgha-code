# Audit: ToolResult Discriminant Spec (REDTEAM-02-TOOLRESULT)

## 1. Honest Verdict

Needs revisions. The architecture is sound but three blocking issues must be resolved before implementation.

### Top 3 Blockers

**Blocker 1 — Executor internal errors produce v1-shaped results that the spec leaves ambiguous.**  
Exec.ts returns `{content, isError: true}` for tool-not-found, permission-denied, abort, timeout, and catch blocks (exec.ts:62-68, 84-89, 126-132, 144-147, 158-162). The spec says “must return `{ok: false, error: ..., content: …}` directly” (spec §4 Phase A bullet 5) but does not define the `ToolError` values for these cases. Every internal error needs a consistent `error.kind`, `retryable`, and `fatal_to_loop`. Without that the agent loop cannot distinguish e.g. a transient timeout from a permanent “tool not found”. The spec’s `wrapLegacyResult` defaults `kind` to `'external'` (spec §2), which is wrong for internal execution errors — they should be `'internal'`. Delaying this definition will cause reintroduction of the boolean `isError` problem these internal paths.

**Blocker 2 — No runtime guard for v2 tools that return malformed shapes.**  
The executor checks `tool.resultSchemaVersion === 2` before deciding to wrap (spec §4). If a tool declares `resultSchemaVersion: 2` but returns a v1 shape (e.g. `{content, isError: true}`), the executor does not wrap. `agent-loop.ts` then reads `!result.ok` which is `!undefined = true` — every such malformed result is treated as an error. The spec acknowledges this in failure mode 3 (spec §7) but does not mandate a runtime guard. The test plan’s T13 is a “recommended” test, not required. A missing guard in the executor will produce silent data corruption.

**Blocker 3 — The agent loop’s refusal-abort logic uses `result.isError` in more places than the spec lists.**  
The spec’s callsite table (spec §3) lists three locations in `agent-loop.ts`. The provided source reveals additional uses:  
- Inside `executeToolCalls`, the refusal-count increment at agent-loop.ts:1252 (`if (result.isError && refusalCounts !== undefined)`)  
- The `appendToolResults` call at agent-loop.ts:1307 passes `isError: r.result.isError`  
- The `tool_exec_end` event emission at agent-loop.ts:1318 uses `result.isError`  
- The retry-on-timeout path at agent-loop.ts:1299 emits `tool_exec_end` with `result.isError`  

The spec must enumerate every callsite in `agent-loop.ts` and confirm each is changed to `!result.ok`. The current table is incomplete.

Until these three blockers are addressed, the implementation is not safe to land.

## 2. Hidden Interface Coupling

### 2.1 Disassembled callsites of `result.isError` and `result.content`

Every callsite that reads `result.isError` or `result.content` must be examined for breakage under the v2 union.

| File | Line(s) | Current pattern | v2 break? | Resolution |
|------|---------|-----------------|------------|------------|
| `agent-loop.ts` | 1252 | `result.isError` | Yes — `isError` does not exist on v2. | Change to `!result.ok`. |
| `agent-loop.ts` | 1307 | `r.result.isError` (in `appendToolResults` call) | Yes — same. | Change to `!r.result.ok`. |
| `agent-loop.ts` | 1318 | `result.isError` (in `tool_exec_end` event) | Yes — same. | Change to `!result.ok`. |
| `agent-loop.ts` | 1299 | `result.isError` (retry path event) | Yes — same. | Change to `!result.ok`. |
| `exec.ts` | 62-68 | Returns `{content, isError: true}` | Not breakage — these are producer sites. Must change to v2. | Return `{ok: false, error: {kind: 'internal', message: …, retryable: false, fatal_to_loop: false}, content: …}`. |
| `exec.ts` | 84-89 | Returns `{content, isError: true}` | Same. | Same. |
| `exec.ts` | 126-132 | Returns `{content, isError: true}` | Same. | Same. |
| `exec.ts` | 144-147 | Returns `{content, isError: true, durationMs}` | Same. | Same. |
| `exec.ts` | 158-162 | Returns `{content, isError: true, durationMs}` | Same. | Same. |
| `message.ts` | 42-47 | `toolResultMessage(toolUseId, content, isError=false)` | No breakage — function signature unchanged. Callers must pass `!result.ok`. | No change to signature. |
| `message.ts` | 52-60 | `appendToolResults(history, results)` where `results` elements have `isError: boolean` | No breakage — function signature unchanged. Callers must set `isError: !result.ok`. | No change to signature. |
| `mcp/tool-bridge.ts` | 27 | `return {content, isError: response.isError ?? false}` | Producer — will be wrapped by executor because MCP tool has no `resultSchemaVersion`. | No change to bridge; executor wraps. |
| `mcp/tool-bridge.ts` | 30 | `return {content, isError: true}` | Same. | Same. |
| `shell.ts` | 149 | `return {content, isError: true}` | Producer — must be migrated. | After migration to v2, return `{ok: false, error: …, content: …}`. |
| `shell.ts` | 193 | `return {content, isError: exitCode !== 0, data, …}` | Same. | Same. |
| `shell.ts` | 209 | `return {content, isError: true}` | Same. | Same. |
| `shell.ts` | 283 | `return {content, data, isError: exitCode !== 0}` | Same. | Same. |
| `git.ts` | 30-33 | `return {content, data, isError: true}` | Same. | Same. |
| `git.ts` | 36-38 | `return {content, isError: true}` | Same. | Same. |
| `git.ts` | 40-44 | `return {content, data, isError: result.code !== 0}` | Same. | Same. |

**Total producer sites that must be rewritten**: exec.ts (5), shell.ts (4), git.ts (3), mcp/tool-bridge.ts (2) but bridge is wrapped. **Consumer sites** in agent-loop.ts (4) must change from `isError` to `!result.ok`.

### 2.2 wrapLegacyResult `data` → `value` mapping

The spec defines `wrapLegacyResult` (spec §2):
- `isError: false` → `{ok: true, value: data ?? undefined, content, metadata, durationMs}`
- `isError: true` → `{ok: false, error: {kind: 'external', ...}, content, metadata, durationMs}`

**Problem**: `data` may be `undefined` on a legacy success result. In that case `value` becomes `undefined`. For a generic `ToolResult<T>`, `value: T` but `undefined` is only valid if `T` includes `undefined`. TypeScript will accept this if `T = Foo | undefined`, but the consumer must narrow. The built-in tools (shell, git) currently populate `data` with an `Output` object on success (shell.ts:193,283; git.ts:30-44). However, tools that do not set `data` (e.g. a future MCP tool returning only `content` and `isError: false`) will produce `value: undefined`. The agent loop does not read `value` directly — it reads `content` and `isError`. But hook consumers (`afterToolCall`) receive the `ToolResult` and may depend on `value`. The spec should document this: **wrapped legacy results without `data` produce `value: undefined`, and consumers must handle that.**

Moreover, the bridge does not pass `data` at all — MCP `callTool` responses have no `data` field (mcp/tool-bridge.ts:27-30). After wrapping, those successes will have `value: undefined`. If any downstream code expects `value` to be present, it will get `undefined` silently.

**Recommendation**: Add a note in the spec: “Tools migrating to v2 should ensure they set `value` on the ok branch. Legacy results that lack `data` produce `value: undefined`. Consumers should treat both `value` and `undefined` as valid on the ok branch.” Also, `wrapLegacyResult` should use `data` as-is rather than `data ?? undefined` — the `??` is redundant because `undefined` is already the default for `data`. Keep `value: data` to preserve the explicit `undefined` from the legacy shape.

## 3. Test Plan Gaps

The spec’s 12 tests are a good baseline but miss three critical scenarios.

### Gap 1: v2 tool returns v1 shape from execute body but sets resultSchemaVersion: 2

A tool author writes `resultSchemaVersion: 2` but the execute body returns `{content: 'fail', isError: true}` (the old shape). The executor sees `resultSchemaVersion === 2`, does NOT wrap, and returns the malformed result to the agent loop. The agent loop reads `!result.ok` → `!undefined = true` and treats it as an error, but the ToolError object is missing. Downstream hooks and serialization break.

**Proposed test case**: Create a tool that sets `resultSchemaVersion: 2` but returns `{content: 'x', isError: false}` from execute. Assert that the executor either (a) wraps it as v1 and emits a warning, or (b) rejects the result with a clear error. The spec currently says “warn + best-effort interpret as v1” (spec §7 failure mode 3). This must be a mandatory test, not a “recommended” T13.

### Gap 2: Wire serialization — is_error = !result.ok for v2 error with different error.kind

The spec asserts `is_error = !result.ok` (spec §8). For a v2 result with `ok: false` and `error.kind: 'refusal'`, `isError` is `true`. That is correct: Anthropic expects `is_error: true` when the tool itself failed. But for a v2 result with `ok: true` and `error` not present (no error), `isError` is `false`. Good. However, the spec does not test what happens when a tool returns `ok: true` but includes an `error` field (invariant violation). Should `is_error` be `false` or `true`? According to spec failure mode 4, the executor discards the error field. That means `is_error` remains `false`. The test plan should verify this: serialize both a clean v2 success and a v2 success with spurious error field; confirm `is_error` is `false` in both.

**Proposed test case**: T14 — v2_success_with_spurious_error. Result `{ok:true, value: "x", content:"", error: {kind:'refusal', message:'should be ignored'}}`. Verify `toolResultMessage` produces `isError: false`.

### Gap 3: metadata shape consistency on ok vs error branches

The spec maintains `metadata?: Record<string, unknown>` on both branches. Some tools (e.g. shell.ts) currently pass `metadata` via the event system but not on the ToolResult itself (shell.ts does not set metadata on the result). However, MCP responses may contain arbitrary extra fields (customField in the response object). `wrapLegacyResult` returns `metadata` from the legacy input but does not extract extra fields. The test plan does not verify that metadata survives on both branches after wrapping, nor that extra fields from MCP are captured.

**Proposed test case**: T15 — v1_with_extra_fields_wrap. Legacy result `{content:'done', isError:false, customField:'x', unknownField: 42}`. After `wrapLegacyResult`, assert `metadata.customField === 'x'` and `metadata.unknownField === 42`. Currently `wrapLegacyResult` only copies `metadata` if it already exists; it does not merge unrecognised top-level fields.

## 4. Migration Strategy Holes

### 4.1 Upgrade v1.34.1 → v1.35.0 with existing session JSONL

The spec claims rollback safety because session JSONL stores `ToolResultPart` with `isError` boolean, not the in-memory `ToolResult`. On resume, the new code reads `isError` from the stored message and passes it to `toolResultMessage` or `appendToolResults`. Those functions accept a boolean `isError` parameter, unchanged. So resume is clean **only if** the resume path never reconstructs a `ToolResult` object from the stored data. The spec does not show the resume code. If the session JSONL is loaded and parsed into messages, and those messages are then fed back into the agent loop, the loop will call `toolResultMessage` with the stored `isError`. That works. But if any code path converts a `ToolResultPart` back into a `ToolResult` (e.g. for display in a hook), the old `isError` boolean must be mapped to the new discriminant. The spec should explicitly audit the resume path and confirm no `ToolResult` reconstruction occurs.

### 4.2 Third-party MCP server returns customField

A third-party MCP server returns `{content: 'ok', isError: false, customField: 'x'}`. The MCP bridge returns `{content: 'ok', isError: false}` (it ignores `customField`). `wrapLegacyResult` receives only `{content: 'ok', isError: false, metadata: undefined, data: undefined}`. The `customField` is lost. The spec should decide: are MCP tool results allowed to carry arbitrary fields? If yes, the bridge should extract all non-standard fields into `metadata` before returning to the executor. If no (the spec currently says bridge returns raw v1 shape), then customField is silently dropped. For backward compatibility, the bridge should copy all unknown response fields into `metadata`. The current bridge at mcp/tool-bridge.ts:27-30 returns only `content` and `isError`. This is a **risk**: users who rely on MCP tool metadata will lose it after upgrade.

### 4.3 Downgrade v1.35.0 → v1.34.1

The spec says downgrade is clean because wire format unchanged. But consider: in v1.35.0, a built-in tool (shell) returns v2 shape natively (`{ok:true, value:..., content:...}`). The executor for that tool does not wrap. The session JSONL still stores the tool result as a `ToolResultPart` with `isError: !result.ok`. Since `ok` is true, `isError` becomes false. That is correct. The stored JSONL is byte-identical to what v1.34.1 would have stored had it executed the same tool. So downgrade is clean **for built-in tools that were migrated to v2**. However, if a third-party tool in v1.35.0 also returned v2 shape (because the user installed a new plugin), that tool would not have existed in v1.34.1, so no downgrade path needed. The only risk is if the user compiled custom plugins against v1.35.0’s types and then downgraded — but the binary would reject the plugin API version mismatch. Acceptable.

## 5. wrapLegacyResult Gotchas

### 5.1 Input is null or undefined

The spec does not define behaviour for `null` or `undefined` input. The function signature expects an object. If called with `null` or `undefined`, TypeScript will not catch it at runtime (as JavaScript). It will throw a `TypeError: Cannot destructure property 'content' of null`. The executor should guard: if `old == null`, return a v2 error result with `error.kind: 'malformed_input'`. The spec should mandate this guard.

### 5.2 Input is a string

Some tools historically returned a plain string as `ToolResult`? The current type is `ToolResult` object, not a string. But MCP responses have `content` as an array of content items; the bridge already flattens to a string. No legacy tool returns a raw string. Still, `wrapLegacyResult` should check `typeof old === 'string'` and treat it as `{content: old, isError: false}` for robustness. Not strictly required but adds resilience.

### 5.3 Mixed shape — both `ok` and `isError` fields present

A v2 tool returning v2 shape (`{ok:true, value:...}`) will not have `isError`. A v1 tool returning `{content, isError}` will not have `ok`. But if a confused tool author includes both, e.g. `{content: 'done', isError: false, ok: true}`, the executor currently checks `tool.resultSchemaVersion` to decide. If v1, it goes through `wrapLegacyResult`; if v2, it passes through. In `wrapLegacyResult`, the function destructures `isError` from the input. If `isError` is `false` and `ok` is `true`, the function returns v2 with `ok:true, value: undefined`. That is valid but ignores the `ok` field. If the tool set `isError: false` but `ok: false` (contradiction), `wrapLegacyResult` returns `ok:true` because `isError` is false — ignoring the `ok` field. This could hide an author mistake. The spec should add a check: if `'ok' in old`, then the input is likely already v2 and should not be wrapped. The executor should detect this before calling `wrapLegacyResult`: if the result has `ok` field, treat it as v2 regardless of `resultSchemaVersion`, and log a mismatch.

### 5.4 Default error.kind: 'external' vs 'internal'

The spec defaults `error.kind` to `'external'` for legacy wraps (spec §2). The justification is “caller doesn’t know the origin.” But the executor also wraps legacy results from MCP tools (which are external) and from built-in tools that haven’t migrated yet (which are internal). Using `'external'` for all legacy wraps means the agent loop cannot distinguish between “tool threw an unexpected exception” (internal) and “MCP server returned an error” (external). The loop might treat an internal bug as something that could be fixed by retrying, or vice versa.

**Recommendation**: The executor should set `error.kind` based on the tool source. For MCP-bridge tools, use `'external'`. For built-in tools, use `'internal'`. However, the executor does not know which tools are MCP vs built-in without metadata. Alternatively, `wrapLegacyResult` could accept an optional second parameter `kind: ToolError['kind']` defaulting to `'external'`. The executor can pass `'internal'` for its own internal errors and for built-in tools that mistakenly haven’t set `resultSchemaVersion: 2` yet. The spec should record this.

## 6. resultSchemaVersion Runtime Check

### 6.1 v2 tool returns v1 shape — detection gap

As described in Gap 1 of §3, a tool with `resultSchemaVersion: 2` that returns `{content, isError}` is not wrapped. The agent loop may crash or misbehave. The executor needs a runtime validation function:

```ts
function isV2Result(result: unknown): result is { ok: boolean } {
  return typeof result === 'object' && result !== null && 'ok' in result;
}
```

After executing the tool, before returning:

```ts
if (tool.resultSchemaVersion === 2) {
  if (!isV2Result(raw)) {
    console.warn(`Tool "${tool.name}" declares resultSchemaVersion 2 but returned v1 shape. Wrapping as v1.`);
    raw = wrapLegacyResult(raw as any);
  } else if ('ok' in raw && 'isError' in raw) {
    console.warn(`Tool "${tool.name}" returned both ok and isError fields. Using ok field.`);
    // Remove isError to avoid confusion downstream
    delete (raw as any).isError;
  }
}
```

The spec should mandate this guard and include it in test T13 (make T13 required).

### 6.2 Proposal for executor guard

Add the following to `exec.ts` after `tool.execute` returns (spec §4 Phase A step for executor):

```ts
let raw = await tool.execute(input, ctx);
if (tool.resultSchemaVersion === 2) {
  if (typeof raw !== 'object' || raw === null || !('ok' in raw)) {
    console.warn(`Tool "${tool.name}" declares resultSchemaVersion 2 but returned a result without 'ok' field. Wrapping as legacy.`);
    raw = wrapLegacyResult(raw as any);
  } else if ('isError' in raw) {
    console.warn(`Tool "${tool.name}" returned a result with both 'ok' and 'isError'. Removing isError.`);
    const { ok, error, value, content, metadata, durationMs } = raw as any;
    raw = ok
      ? { ok: true, value, content, metadata, durationMs }
      : { ok: false, error, content, metadata, durationMs };
  }
} else {
  raw = wrapLegacyResult(raw as any);
}
```

## 7. ToolError.kind Closed Enum

### 7.1 Missing kinds

The closed enum `['refusal', 'timeout', 'permission', 'malformed_input', 'internal', 'external']` covers the failure modes described in the spec’s problem statement. However, real usage may reveal additional categories:

- **`rate_limit`**: A tool may hit its own rate limit (e.g. GitHub API). The agent loop should not treat this as a fatal error; it should backoff and retry. Currently, a `rate_limit` error could be shoehorned into `'external'` with `retryable: true`, but explicit `kind` would allow the loop to apply provider-style rate-limit handling (e.g. exponential backoff from error metadata).
- **`network`**: An MCP tool call fails due to network timeout. This is retryable but not rate-limited. Distinguished from `'timeout'` which could be just a slow tool.
- **`context_length`**: A tool returns a result that exceeds the provider’s context limit (e.g. shell output too large). The agent loop could truncate and retry. Currently no kind for this.

**Recommendation**: Widen the enum to include `'rate_limit'` and `'network'` from the start. The `'context_length'` can be added later when tool-level context handling is implemented.

### 7.2 Graceful degradation with ok=true but truncated content

The scenario: a tool ran successfully but in a degraded mode (e.g. fs-read returned a truncated file with `isError: false` in the old shape). Under v2, this should be `ok:true, content: "[truncated] ...", durationMs, metadata: {truncated: true}`. The agent loop does not need a new `kind` for this; the metadata field signals the truncation. The spec should document that `ok:true` results may contain warnings or degradation indicators in `content` or `metadata`, and that the loop must not treat them as errors. The test plan should include a case where a v2 success with a warning content is not misclassified as an error.

## 8. Wire-Format Serialization

### 8.1 Anthropic is_error mapping

The spec says `is_error = !result.ok` (spec §8). For a v2 result with `ok:false`, `is_error` is `true`. This matches Anthropic’s expectation: when a tool returns an error, the provider’s tool_result block should have `is_error: true`. For `ok:true`, `is_error` is `false`. Correct.

**However**, Anthropic’s `is_error` field has specific semantics: it should be `true` only when the tool itself failed, not when the model used the tool incorrectly. Consider a v2 result with `ok:false`, `error.kind: 'refusal'`. The tool itself rejected the input (a model misbehaviour). Anthropic may still expect `is_error: true` because the tool call did not succeed. The spec’s mapping sets `is_error = !result.ok = true`, which is correct. But what about a v2 result with `ok:true` but the tool’s response indicates the user should not have called it? That is not an error; `is_error` stays `false`. Good.

### 8.2 OpenAI-compat wire format

The spec mentions T09 for OpenAI-compat but the current codebase has no OpenAI-compat serialisation in `message.ts`. The `toolResultMessage` function only produces the Anthropic `ToolResultPart`. If an OpenAI-compat provider exists elsewhere, the mapping of `isError` to that format must be consistent. The spec should either remove T09 or specify where the OpenAI-compat code lives and confirm `is_error = !result.ok` there as well.

### 8.3 Wire serialisation for error kinds

The `is_error` boolean is lossy — it loses the `error.kind`. The provider wire format (Anthropic) does not have a field for error kind. This means that when the session is serialised, the `ToolError` details are lost. On session resume, the stored `ToolResultPart` has only `isError: true`, and the new code will reconstruct a `ToolResult` with `ok:false` but no `error.kind`. The resume path must map the boolean back to a default error (e.g. `{kind: 'external', message: content, retryable: false, fatal_to_loop: false}`). The spec does not discuss this round-trip. The rollback strategy (§6) asserts the JSONL format is unchanged, but the **meaning** of the stored boolean is consumed differently after the refactor. The agent loop’s refusal-abort logic now depends on `error.kind === 'refusal'` (spec §9). If the stored boolean is reconstructed as `ok:false` with `error.kind: 'external'`, the refusal-abort counter will not increment, and the loop will not detect repeated refusals from resumed sessions. This is a regression. The spec must define a reconstruction rule for reading old session data: when `isError: true` and no `error.kind` is present, default to `{kind: 'refusal', retryable: false, fatal_to_loop: true}` to preserve the existing behaviour of the refusal-abort logic? Or treat all legacy errors as `external`? The agent loop’s current `refusalCounts` is keyed by `toolName:args`, so even with generic `external` kind, the map will still catch repeated exact-argument errors. That might be acceptable. But the spec should document this choice.

## 9. The ‘One More Thing’

For production safety, I would add the following to the spec:

### 9.1 Lint rule: no bare `isError` access

Add a TypeScript lint rule that bans foreign code from accessing `result.isError` on any `ToolResult`. This prevents tool and hook authors from using the deprecated field. Since `isError` exists only on the old interface, and the new union does not have it, any access will be a type error. But TypeScript may not catch it if the consumer casts to `any`. A lint rule (e.g. `no-toolresult-iserror`) provides an additional safety net during migration Phase A.

### 9.2 Executor: always assign `durationMs`

The executor currently sets `durationMs` on the result only if the tool did not set it (exec.ts:168-169). For v2 results, the tool may set `durationMs` or leave it undefined. If the tool omits it, the executor should always fill in the elapsed wall-clock time from when it started the tool. The spec should mandate: after running tool.execute, the executor must set `result.durationMs = result.durationMs ?? Date.now() - started`. This ensures every ToolResult has a duration for telemetry and debugging.

### 9.3 Hook afterToolCall must return a valid v2 result

The spec says “hooks are expected to return the new shape” (spec §7 failure mode 10). But if a hook returns an invalid shape (e.g. v1 shape without `ok`), the executor must catch it and apply `wrapLegacyResult` a second time, or reject it. The spec should add a runtime check after hooks: if the result does not have `ok` field, treat as v1 and wrap, emitting a warning. This prevents a misbehaving hook from crashing the loop.

### 9.4 Session JSONL migration note

Add a dedicated section: “Resume path must reconstruct ToolResult from ToolResultPart. For old sessions where `isError` is present but `error.kind` is absent, default to `{ok: false, error: {kind: 'external', message: content, retryable: false, fatal_to_loop: false}}`. Document this in the release notes so users understand that resumed sessions will lose error kind information.”

### 9.5 Pre-commit CI test: v2 round-trip

Add a CI test that creates a session, writes it to JSONL, reads it back, and verifies that the reconstructed ToolResult matches the original v2 union modulo the lossy boolean (i.e. `ok` is preserved, `error.kind` becomes `'external'`). This catches regressions in the serialisation layer.

---

This audit identifies 3 blockers, 5 coupling issues, 3 test gaps, 3 migration holes, 4 wrapLegacyResult gotchas, 2 runtime guard gaps, 2 enum additions, 1 wire-format nuance, and 5 production safety additions. The spec is architecturally sound but needs these revisions before implementation.