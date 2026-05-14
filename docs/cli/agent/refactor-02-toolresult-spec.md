# SPEC-02-TOOLRESULT-DISCRIMINANT

## 1. Problem statement

The current `ToolResult` is a flat interface with a boolean `isError` field (`src/kernel/types.ts:110-120`). This gives the agent loop no information about the kind of failure, which error is retryable, and which should abort the session. The loop at `src/kernel/agent-loop.ts:1032-1037` increments a refusal counter when `result.isError` is true, but cannot distinguish a transient network failure from a fatal permission denial. The result: every error is treated uniformly, forcing the loop to either abort on the first refusal (wasting retryable errors) or retry non-retryable errors indefinitely.

Concrete failure modes that the boolean shape cannot express:

- **Refused input** (harmless, model should retry with different args) – current code increments the refusal counter, eventually aborting the session (`agent-loop.ts:788-815`). The model never gets a chance to correct its input.
- **Timeout** (transient, retry with same input) – the loop could retry the exact same call, but the current code lumps timeout into `isError: true` and increments the refusal counter, which may trigger a spurious loop abort.
- **Fatal to the loop** (e.g., tool permissions revoked mid-session) – the loop should stop immediately instead of retrying or collecting more tool results. No boolean can signal this.
- **Retryable vs non-retryable** – the executor at `src/tools/exec.ts:86-97` returns `isError: true` for all errors. The agent loop has no data to decide whether to retry or abort.

The migration to a discriminant union with a typed `ToolError` gives the agent loop the information it needs: `error.retryable` determines auto-retry, `error.fatal_to_loop` determines session abort, and `error.kind` drives the refusal-abort detection separately from technical errors.

Additionally, external MCP tools (`src/mcp/tool-bridge.ts:28-42`) currently return a flat `ToolResult` with `isError` set from the MCP response's `isError` field. After migration, the bridge must convert the external shape to the new discriminant union, which requires the `wrapLegacyResult` shim.

## 2. Target invariants (8-15 statements)

- **MUST**: `ToolResult` is a discriminant union: `{ ok: true; value: T; content: string; metadata?: Record<string, unknown>; durationMs?: number } | { ok: false; error: ToolError; content: string; metadata?: Record<string, unknown>; durationMs?: number }`. (`docs/cli/agent/v1.33.21-architecture-audit.md` Section 5.3)
- **MUST**: `ToolError` has fields `kind`, `message`, `retryable`, `fatal_to_loop`, and optional `cause`. (`docs/cli/agent/v1.33.21-architecture-audit.md` Section 5.3)
- **MUST**: All built-in tools migrate to `resultSchemaVersion: 2`. (Red-team mandate, `docs/cli/agent/refactor-00-redteam-plan.md` Section 8)
- **MUST**: External tools (MCP, plugins) that omit `resultSchemaVersion` default to v1 and pass through `wrapLegacyResult`. (Refactor-00-redteam-plan.md Section 8)
- **MUST**: `wrapLegacyResult({content, isError, data, metadata, durationMs})` produces a valid v2 result. `isError: true` → `{ok: false, error: {kind: 'external', message: content, retryable: false, fatal_to_loop: false}, content}`. `isError: false` → `{ok: true, value: data ?? undefined, content, metadata, durationMs}`. (Section 2 of this spec)
- **MUST**: Every callsite that reads `result.content` continues to work — `content` survives on both branches.
- **MUST**: The provider serialization in `src/kernel/message.ts` (`toolResultMessage`, `appendToolResults`) uses `content` + `ok` to render the right shape for Anthropic/OpenAI wire formats. `ToolResultPart` (`src/kernel/types.ts:18`) keeps its `isError` field; the mapping is `isError = !result.ok`. (Verified: `message.ts:42-47` currently writes `isError` from the parameter; after migration, the caller will pass `!result.ok`.)
- **MUST**: `ToolResult` type generic stays — `ToolResult<MyData>` with `value: MyData` on the ok branch.
- **MAY**: Drop v1 support after 2 major versions (e.g. v1.37). Document the deprecation timeline in the spec.
- **NEVER**: A v2 tool returns a result where `ok` and `error` are both set, or both unset. The discriminant is exclusive.
- **MUST**: The `Tool` interface gains an optional `resultSchemaVersion?: 1 | 2` field, defaulting to 1 when absent. (`src/tools/registry.ts:48-68` – `Tool` interface)
- **MUST**: The executor in `src/tools/exec.ts` checks `tool.resultSchemaVersion` before returning the result. If v1, `wrapLegacyResult` is applied. If v2, the result is used as-is. (Red-team mandate)
- **MUST**: `wrapLegacyResult` is a pure function, exported from `src/kernel/types.ts` or a new helper module, testable in isolation.
- **MUST**: The agent loop's refusal-abort logic at `agent-loop.ts:788-815` uses `!result.ok` (discriminant check) instead of `result.isError`.
- **MUST**: The afterTurn and afterToolCall hooks (`AgentHooks` at `types.ts:167-174`) receive the new `ToolResult` shape. Their consumers must be updated.

## 3. Concrete TypeScript interfaces

### Current ToolResult (`src/kernel/types.ts:110-120`)
```ts
export interface ToolResult<T = unknown> {
  content: string;
  data?: T;
  isError: boolean;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}
```

### Proposed ToolResult, ToolError (`docs/cli/agent/v1.33.21-architecture-audit.md` Section 5.3 + red-team mandate)
```ts
export type ToolResult<T = unknown> =
  | { ok: true; value: T; content: string; metadata?: Record<string, unknown>; durationMs?: number }
  | { ok: false; error: ToolError; content: string; metadata?: Record<string, unknown>; durationMs?: number };

export interface ToolError {
  kind: 'refusal' | 'timeout' | 'permission' | 'malformed_input' | 'internal' | 'external';
  message: string;
  retryable: boolean;
  fatal_to_loop: boolean;
  cause?: unknown;
}
```

### Tool interface with resultSchemaVersion (`src/tools/registry.ts:48-68` – add field)
```ts
export type ToolResultSchemaVersion = 1 | 2;

export interface Tool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  timeoutMs?: number;
  requiresApproval?: (input: unknown) => boolean;
  resultSchemaVersion?: ToolResultSchemaVersion; // defaults to 1
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}
```

### ToolExecutor.execute return type (`src/kernel/types.ts:158-160` – unchanged in shape, but type changes)
```ts
// Still returns ToolResult, but now it's the discriminant union.
export interface ToolExecutor {
  execute(call: ToolCall, signal: AbortSignal): Promise<ToolResult>;
}
```

### wrapLegacyResult function signature
```ts
export function wrapLegacyResult<T>(old: {
  content: string;
  data?: T;
  isError: boolean;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}): ToolResult<T>;
```

### Helper predicates
```ts
export function isToolError(r: ToolResult): r is { ok: false; error: ToolError } {
  return !r.ok;
}
```

### Every callsite that must change

| File | Lines | Current pattern | New pattern |
|------|-------|-----------------|-------------|
| `agent-loop.ts` | 1032-1037 | `result.isError` | `!result.ok` |
| `agent-loop.ts` | 788-815 | `result.isError` | `!result.ok` |
| `agent-loop.ts` | 795 | `r.result.isError` (in `appendToolResults` call) | `!r.result.ok` |
| `exec.ts` | 86-97 | `isError: true` on tool not found, permission denied, catch | Must return `{ok: false, error: ..., content: ...}` directly |
| `exec.ts` | 112-130 | `isError: true` on abort or timeout | Same change |
| `message.ts` | 42-47 (`toolResultMessage`) | `isError = false` parameter | Will still accept `isError` for backward compat, but callers pass `!result.ok` |
| `message.ts` | 52-60 (`appendToolResults`) | Same `isError` field in result param | Same change |
| `shell.ts` | final return statements | `isError: exitCode !== 0` | `{ok: false, error: ..., content}` or `{ok: true, value: ..., content}` |
| `fs-read.ts` | final returns | `isError: true/false` | Same migration |
| `fs-write.ts` | final returns | `isError: false` | Same |
| `fs-edit.ts` | final returns | `isError: true/false` | Same |
| `fs-ls.ts` | final returns | `isError: false` | Same |
| `git.ts` | final return | `isError: result.code !== 0` | Same |
| `mcp/tool-bridge.ts` | 28–42 | `isError: response.isError ?? false` | After resultSchemaVersion v1 default, bridge returns raw; executor applies wrapLegacyResult. But bridge itself may need to return v1 shape. |

## 4. Migration strategy

### Phase A (this version, v1.35.0)

- Land the discriminant union type `ToolResult` in `src/kernel/types.ts`.
- Implement `wrapLegacyResult` in `src/kernel/types.ts` (or a new `src/kernel/legacy-tool-result.ts`).
- Add `resultSchemaVersion` optional field to `Tool` interface in `src/tools/registry.ts`.
- Modify executor in `src/tools/exec.ts` to check `tool.resultSchemaVersion`:
  - If undefined or 1: execute tool, then `wrapLegacyResult(raw)`.
  - If 2: return the result as-is.
- Modify the executor's own error returns (not found, permission denied, catch, abort, timeout) to produce v2 shape directly (they are internal, not tool-specific).
- Mark all built-in tools (`shell.ts`, `fs-read.ts`, `fs-write.ts`, `fs-edit.ts`, `fs-ls.ts`, `git.ts`) with `resultSchemaVersion: 2`. Update their execute bodies:
  - Change all `isError: true/false` to `{ok: false, error: ToolError, content}` or `{ok: true, value: data}`.
  - Keep `content` present on both branches.
  - Ensure `data` is moved to `value`.
- Update agent-loop.ts consumers:
  - `result.isError` → `!result.ok`
  - Refusal abort logic at lines 788–815 uses `!result.ok`.
  - `appendToolResults` call passes `!result.result.ok` for `isError` parameter.
- Update `message.ts`:
  - `toolResultMessage` and `appendToolResults` keep the same signature (accept `isError` boolean). Callers compute `isError = !result.ok`.
- MCP bridge: results pass through `wrapLegacyResult` at the executor level (since MCP tools have default `resultSchemaVersion` 1). No change to `mcp/tool-bridge.ts` itself.
- Red-team mandate: `resultSchemaVersion` defaults to 1 for back-compat. New tools must explicitly set `resultSchemaVersion: 2`.

### Phase B (v1.36 or later)

- The `resultSchemaVersion` field becomes required for new tools registered via `ToolRegistry.register`. Old tools still work via shim.
- A deprecation warning is emitted when a tool without `resultSchemaVersion` is registered: "Tool 'X' does not specify resultSchemaVersion. Defaulting to v1. Set resultSchemaVersion: 2 to suppress this warning. v1 support will be removed in v1.38."
- The warning is logged via `console.warn` or the tool's `Context.log` if available.

### Phase C (v1.37+)

- v1 support is deprecated with a warning on every execution of a v1 tool.
- After v1.38, v1 support is removed. Tools without `resultSchemaVersion: 2` will be rejected at registration time with an error.
- `wrapLegacyResult` is deleted.

## 5. Test plan (TDD)

At least 12 test cases, each named, with assertion.

- **T01: v2_ok_pass_through** – A v2 tool returns `{ok:true, value: "result", content: "done"}`. Executor passes through unchanged.
- **T02: v2_error_pass_through** – A v2 tool returns `{ok:false, error: {kind:'timeout', message:'timed out', retryable:true, fatal_to_loop:false}, content: 'timed out'}`. Executor preserves the error.
- **T03: v1_success_wrap** – Legacy tool returns `{content: 'hi', isError: false}`. `wrapLegacyResult` produces `{ok:true, value: undefined, content: 'hi', metadata: undefined, durationMs: undefined}`.
- **T04: v1_error_wrap** – Legacy tool returns `{content: 'denied', isError: true}`. `wrapLegacyResult` produces `{ok:false, error: {kind:'external', message:'denied', retryable:false, fatal_to_loop:false}, content: 'denied'}`.
- **T05: v1_with_data_wrap** – Legacy `{content:'ok', isError:false, data: {x:1}}` → `{ok:true, value: {x:1}, content:'ok'}`.
- **T06: mcp_passes_through_v1_shim** – MCP bridge returns raw v1 shape. Executor sees tool with no `resultSchemaVersion` (defaults to 1) and applies `wrapLegacyResult`. Assert final result is v2.
- **T07: refusal_loop_detection_reads_ok_field** – `REFUSAL_ABORT_THRESHOLD` uses `!result.ok` not `result.isError`. Create a tool that returns `{ok:false, error: {kind:'refusal', message:'denied', retryable:false, fatal_to_loop:false}}`. Run agent loop with 2 identical calls. Verify `stopReason` is `'loop'`.
- **T08: message_serialization_uses_ok_for_anthropic** – `toolResultMessage` is called with `isError = !result.ok`. For a v2 error result, `isError` is true. Verify the resulting `ToolResultPart` has `isError: true`.
- **T09: message_serialization_uses_ok_for_openai_compat** – Same as T08 but with OpenAI-compat wire format: `toolResultMessage` produces content with isError flag. Verify correct.
- **T10: metadata_preserved_across_wrap** – Legacy result with `metadata: {foo:'bar'}` round-trips through `wrapLegacyResult`. The new result has `metadata: {foo:'bar'}`.
- **T11: durationMs_preserved** – Legacy result with `durationMs: 150` round-trips: `wrapLegacyResult` keeps `durationMs: 150`.
- **T12: typed_error_kinds** – Verify each `ToolError.kind` value produces sensible downstream behaviour: a 'timeout' error is `retryable: true`, a 'permission' error is `retryable: false`, a 'refusal' error is `retryable: false` and `fatal_to_loop: true` (depending on policy – but the test should assert the expected values from the tool's implementation).

Additional test (not in the 12 but recommended): **T13: v2_malformed_result** – A v2 tool returns `{}` (no ok field). Executor should warn and attempt to interpret as v1 (best-effort). Test that the loop does not crash.

## 6. Rollback strategy

If v1.35.0 regresses, users can `npm install -g @dirgha/code@1.34.1` and downgrade. The downgrade is clean because:

- The session JSONL format does not change: `ToolResultPart` still has `isError` field. The new code writes `isError` from the discriminant (`!result.ok`), same as before. v1.34.1 reads it correctly.
- The health.json file is unchanged.
- The `resultSchemaVersion` field is new and optional; v1.34.1 ignores it.
- Built-in tools in v1.34.1 binary use the old shape. The v1.35.0 binary produces session logs that are backward-compatible because the wire format (the `Message` parts) stays the same.
- The only risk: if a v1.35.0 session includes a v2 tool result that contains a `ToolError` object in the session's metadata or data fields (not in the standard `ToolResultPart`), v1.34.1 may not know how to read it. However, no such fields are currently serialized to session JSONL. The session JSONL stores `Message` objects, which contain `ToolResultPart` (with `isError` boolean). The `ToolResult` discriminant union is only in-memory; the wire format for provider calls uses `ToolResultPart`. So rollback is safe.

In case of critical failure, the team should:

1. Downgrade npm dist-tag to v1.34.1 (or the last known-good version).
2. Notify users via `Npm_ERR` or channel.
3. Investigate and fix forward.

## 7. Failure modes (10+)

1. **Third-party MCP server returns a malformed result** – Neither old nor new shape (e.g., missing `content` and `isError`). `wrapLegacyResult` must handle gracefully: return `{ok:false, error:{kind:'malformed_input', message:'Unknown tool result shape', retryable:false, fatal_to_loop:true}}` and warn via console.
2. **Two tools with same name, one v1 + one v2** – Shouldn't be possible; `ToolRegistry.register` rejects duplicates.
3. **A tool's `resultSchemaVersion` is wrong (says 2 but returns old shape)** – Executor should detect at runtime: after `tool.execute`, check if the returned object has `ok` property. If not, treat as v1 and apply `wrapLegacyResult`, emit a warning: "Tool 'X' declares resultSchemaVersion 2 but returned a v1-shaped result. Using wrapLegacyResult."
4. **A v2 tool returns `ok:true` AND `error` field set** – Invariant violation. The executor should warn and discard the error field: return the ok branch as-is.
5. **The legacy `ToolResult.metadata` had arbitrary keys; the v2 `metadata` constraint is the same** – No issue.
6. **TypeScript narrows the discriminant in user code — but JavaScript at runtime doesn't enforce it. A v2 tool could return `{}` (no `ok` field).** – Executor should check `'ok' in result` and `typeof result.ok === 'boolean'`. If not, treat as v1 with warning (see 3).
7. **The wire serialization for Anthropic uses `tool_result: { content, is_error }`. For v2 results, `is_error = !result.ok`.** – Must ensure this mapping is correct. The provider serialization code (likely in `message.ts` or provider-specific files) must compute `isError` from the discriminant.
8. **The OpenAI-compat wire format uses just `tool_call_id + content`. The isError flag is conveyed by the content text (e.g., prepend "[ERROR]").** – No change; content is already present on both branches.
9. **Agent loop's refusal abort fires too early** – If the discriminant logic incorrectly treats a v2 non-error as `!result.ok` when `ok` is `false` but `error.retryable` is true, the refusal logic should not increment the refusal counter. The code at `agent-loop.ts:1032-1037` must be updated to only count refusals when `!result.ok && result.error.kind === 'refusal'` (or a predicate). The current code increments on `isError` unconditionally; the migration must refine.
10. **Hooks that return `ToolResult` (e.g., `afterToolCall`) must handle both branches.** The `AgentHooks.afterToolCall` signature currently returns `Promise<ToolResult>`. After migration, it returns the new union type. The hook implementations must be updated; if they return the old shape, the executor must apply `wrapLegacyResult` again.
11. **The `wrapLegacyResult` shim is used in multiple places (executor, maybe hooks).** If a hook returns a v2 result, the executor must not double-wrap. The executer should only wrap when the raw result from the tool is v1 (detected via missing `ok`). After `afterToolCall` hook, the result is always v2 (since hooks are expected to return the new shape). The executor should not re-wrap.
12. **session JSONL replay with old shape** – If a user resumes an old session that has `isError` in `ToolResultPart`, the new code must read it correctly. The `appendToolResults` and `toolResultMessage` already accept `isError` boolean, so no change. The session replay path does not process `ToolResult` objects; it only reads `Message`. Safe.

## 8. Estimated dispatches

- **Substep A**: `types.ts` union + `wrapLegacyResult` helper + `isToolError` predicate. Tests T03-T05, T10-T12. (~1 dispatch)
- **Substep B**: `Tool` interface + executor logic + MCP bridge wrap. Tests T01-T02, T06. (~1 dispatch)
- **Substep C**: `agent-loop.ts` consumers (refusal abort, etc.) updated to use `!result.ok`. Tests T07. (~1 dispatch)
- **Substep D**: `message.ts` wire serialization updated. Tests T08-T09. (~1 dispatch)
- **Substep E**: All built-in tools (`shell`, `fs-*`, `git`) tagged `resultSchemaVersion: 2`. Migrate their execute bodies if they use `isError` directly. Otherwise no body change. (~2 dispatches: one for tools with simple returns, one for complex ones)
- **Substep F**: This spec document. (~0.5 dispatch)
- **Substep G**: Red-team verification of compatibility contract (resultSchemaVersion, wrapLegacyResult). (~0.5 dispatch)
- **Substep H**: Integration tests (end-to-end smoke with real tools). (~1 dispatch)

Total: ~8 dispatches.

## 9. Definition of done

- `npm run tsc` clean
- `npm run lint` clean (verification gate)
- 365+ existing unit tests pass + 12 new (T01-T12)
- 41 offline smoke pass (the existing smoke tests)
- Built-in tools all return v2 shape natively
- MCP bridge wraps external results via `wrapLegacyResult`
- `agent-loop.ts` uses `!result.ok` everywhere `result.isError` was checked
- No regressions in session JSONL replay or provider wire format

## 10. Open questions

- **Should `resultSchemaVersion` be REQUIRED on new tools or have a default?**  
  **Recommend**: optional with default = 1 for back-compat. Tools explicitly opt into v2 via `resultSchemaVersion: 2`. The red-team mandate requires this.

- **Should we hard-fail or warn when a v2 tool returns a malformed result?**  
  **Recommend**: warn + best-effort interpret as v1. Don't crash. The agent loop is resilient; a malformed result should not take down the session.

- **Should `ToolError.kind` be open (`'refusal' | 'timeout' | ... | string`) or closed?**  
  **Recommend**: start closed (`'refusal' | 'timeout' | 'permission' | 'malformed_input' | 'internal' | 'external'`). Widen if needed. A closed union gives the loop deterministic branching.

- **Should `wrapLegacyResult` default `error.kind` to `'external'` or to `'internal'`?**  
  **Recommend**: `'external'` — caller doesn't know the origin. The agent loop can re-classify later.

- **Should the new format add a `code` field on `ToolError` for machine-readable HTTP-like statuses?**  
  **Recommend**: defer. Don't bloat the shape now. Future expansion can add an optional `code`.

- **Should `retryable` + `fatal_to_loop` be a single `retryable` field?**  
  **Recommend**: keep separate. `fatal_to_loop` is stronger — it means "exit the loop entirely", not just "don't retry this turn". The loop should abort immediately, not collect more tool results.