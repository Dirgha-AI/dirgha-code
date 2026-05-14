# Red-Team Audit: Proposed Migration Plan for v1.33.21+ Refactor

## 1. Hidden dependencies between items

### Item 1 → Item 2: LoopGuard → Per-model cooldown

**Claimed order**: LoopGuard (1 day) first, per-model cooldown (1-2 days) second.

**Dependency missed**: LoopGuard observes tool results to detect stagnation and repeated refusals. The current `_refusalCounts` map is keyed by `"${name}:${JSON.stringify(input)}"` (`agent-loop.ts:1032-1037`). The new `StableLoopGuard.observe(call, result)` in the audit doc consumes a `ToolResult` argument. Item 4 (ToolResult discriminant union) is not scheduled until step 4 of the plan, but LoopGuard's `observe` already patterns on the new `{ok:true,value} | {ok:false,error}` shape. If LoopGuard is implemented before Item 4, it will be written against the old `ToolResult` (`content: string, isError: boolean`). That means **LoopGuard will need a second refactor when Item 4 lands**, or it will be coupled to the old shape and will not benefit from typed error discrimination (it will check `isError` as a boolean, not `error.type`). This creates a lateral dependency: LoopGuard's implementation should either wait for Item 4 or be designed generically enough to accept both shapes, but the migration plan does not mention this.

**Recommendation**: Move Item 4 to position 2, or design LoopGuard with a type guard that adapts to old/new `ToolResult` until Item 4 is done. The plan's ordering assumes no such interface coupling, which is false.

### Item 2 → Item 3: Per-model cooldown → Tool output distillation

**Claimed order**: Per-model cooldown (1-2 days) then distillation (2 days).

**Dependency**: The current cooldown system in `health-monitor.ts` is provider-wide, keyed by provider string (line 9). The proposed per-(provider, model) cooldown would need a composite key. Distillation (Item 3) does not depend on cooldown at all — it only touches tool output handling in `tools/exec.ts`. So the order here is sound in isolation.

**But**: Item 2 touches `src/intelligence/health-monitor.ts` and `src/providers/health.ts` (referenced in agent-loop.ts lines for `recordRequest`, `recordRateLimit`, etc.). Item 3 touches `tools/exec.ts`. These files are independent. No hidden dependency.

### Item 3 → Item 4: Distillation → ToolResult union

**Claimed order**: Distillation (2 days) then ToolResult union (3 days).

**Dependency**: Distillation ported from gemini-cli's `ToolOutputDistillationService` (external file `toolDistillationService.ts`) operates on `PartListUnion` (a gemini-cli type). The current dirgha codebase has `ToolResult` with `content: string` and `isError: boolean`. The distillation service will need to ingest tool outputs that are strings, but the new `ToolResult` union may change how metadata is carried (e.g., `metadata` in the old shape vs `value` in the new shape). If distillation is implemented first against the old `ToolResult`, the distillation output (a string) will still work after Item 4 because the new `ToolResult` still has a `value` field for the tool's return data, but the distillation service would likely need to extract the value from `value` instead of `content`. This is a minor API adaptation, but if the distillation service is written against `content: string` of `ToolResult`, it will break silently when `ToolResult` changes to `{ok,value}` because `content` no longer exists. So **Item 3 depends on Item 4** if distillation reads from `ToolResult.content`. If instead distillation operates on the raw output of tool execution before it is wrapped in `ToolResult` (as the gemini-cli service does, taking `content: PartListUnion`), then it is independent. The current `ToolExecutor.execute` returns `ToolResult`, so distillation would need to intercept before wrapping. The plan doesn't specify this detail, suggesting the team may miss the dependency.

**Recommendation**: Explicitly state that distillation operates on the raw tool output, not the `ToolResult` wrapper, to decouple it from Item 4. If not, swap Items 3 and 4.

### Item 4 → Item 5: ToolResult union → TaskLedger

**Claimed order**: Item 4 (3 days) then Item 5 (6 days).

**Dependency**: The TaskLedger is an append-only event log. It will contain `tool_result` entries (see audit doc section 5.1). If Item 4 changes the shape of `ToolResult`, then the ledger's representation of tool results must also change. If the ledger is implemented first (Item 5 before Item 4), it would store old-shape results and then Item 4 would need to handle reading old entries. The plan puts Item 4 before Item 5, which is the correct order. However, Item 5 includes snapshot-based compaction which writes `compaction` entries. Those compaction entries may contain a summary of tool results; if the ToolResult shape changes, the summary text may need to adapt. But summaries are strings, so no breaking change. So this order is sound.

### Summary of hidden dependencies

- Item 1 (LoopGuard) has an implicit dependency on Item 4 (ToolResult discriminant) because it consumes `ToolResult`. Not acknowledged in the plan.
- Item 3 (Distillation) depends on whether it reads from `ToolResult` or raw output. If it reads from `ToolResult`, it depends on Item 4. Not made explicit.
- All other adjacent pairs are independent or correctly ordered.

**Proposed adjusted order**: 2, 4, 1, 3, 5 (or 4, 1, 2, 3, 5) to respect interface dependencies.

---

## 2. Hidden breaking-change risks

### Item 1: Unified LoopGuard

**Public surfaces that change**:
- `AgentLoopConfig.loopDetector` field (`agent-loop.ts:88-92`) — has type `{ track, isLoopDetected, reason }`. The new `LoopGuard` interface (`StableLoopGuard`) has `observe(call, result)` instead of `track(turn)`. Any code that currently passes a `loopDetector` must switch to the new interface.
- `loopDetector.track()` call site (`agent-loop.ts:706-712`) — will change to `loopGuard.observe(call, result)` which requires the result to be passed. Currently track receives only the turn object.
- The old `refusalCounts` map (`agent-loop.ts:170-175`) and `_contentRefusalCounts` map are internal and will be removed. Any external tests that assert on `_refusalCounts` via reflection or mocks will break.
- The `LoopDetector` class in `src/subagents/loop-detector.ts` will be deleted.

**Consumers**:
- CLI users: no direct impact.
- MCP authors: no impact (tool interface unchanged).
- Unit tests: 351 tests. At least the tests that mock `loopDetector` will need to change. The `loopDetector` parameter may be optional (`loopDetector?`), so existing tests that don't provide it may still pass.
- The offline smoke harness and `scripts/qa-app/*.mjs` may use the `loopDetector` if they run agent loops programmatically. This is unlikely but possible.

**Notification**: The loopDetector field is internal, not part of the public API. No advance notification needed beyond code review.

### Item 2: Per-(provider, model) cooldown

**Public surfaces**:
- `recordSuccess`, `recordFailure`, `isBlacklisted` functions in `src/intelligence/health-monitor.ts` currently take a `provider: string`. Changing to `provider, model` is a signature change.
- `getHealth` and `getAllHealth` return `ProviderHealth` interface. If composite keys are used, the return shape changes.
- `health.json` file format on disk. If the key changes from a single string to a pair, old entries will be ignored and cooldown state for that (provider, model) pair starts fresh. That's a silent reset, which may surprise users who relied on the previous cooldown state.

**Consumers**:
- `agent-loop.ts` calls `recordRequest`, `recordRateLimit`, `recordHealthFailure`/`recordHealthSuccess`. Those call sites pass just a provider ID. They will need to also pass the model string. This is a direct breaking change.
- Health monitor internal calls in `isBlacklisted` at `agent-loop.ts:148` (line 148 checks `isBlacklisted(cfg.model)` — note: currently `isBlacklisted` takes a provider, but line 148 passes `cfg.model` which is a model string; this looks like a bug in the current code, but the plan will expose it). After the change, `isBlacklisted` will take `(provider, model)`, so the call at line 148 will need both.
- The telemetry/offline harness that reads health.json will break if the format changes.

**Notification**: The health.json is user-facing. If the format changes without a migration, users who upgrade and then downgrade will have stale state.

### Item 3: Tool output distillation

**Public surfaces**:
- `ToolExecutor.execute` return type is `ToolResult` (unchanged by this item). Distillation intercepts inside `createToolExecutor` (`tools/exec.ts`). No public signature change.
- However, if distillation modifies the content of `ToolResult` (e.g., replaces `content` with a truncated placeholder), any code that inspects the full `content` (like loggers, test assertions) will see the truncated version. This is a behavioral change but not a type change.
- `ToolContext` gains no new fields unless distillation needs a callback. The plan says "integrate into the tool executor", so likely internal.

**Consumers**:
- Tests that check exact tool output strings will break if distillation truncates.
- The TUI's event display for `tool_exec_end` will show truncated content. The plan says "distilled outputs are saved to `~/.dirgha/tool-outputs/` and the placeholder includes the file path". The TUI may need to render a link or note. This is a UI change but not breaking.

**Notification**: None needed at the API level. But test authors must be aware that tool outputs may be truncated.

### Item 4: ToolResult discriminant union

**Public surfaces**:
- `ToolResult` type in `src/kernel/types.ts` (lines 110-121). Changes from `interface ToolResult { content: string; data?: T; isError: boolean; metadata?: Record<string, unknown>; durationMs?: number; }` to a discriminant union `{ ok: true, value: T, metadata? } | { ok: false, error: ToolError }`. This is a **breaking change** for every tool author and every consumer of ToolResult.
- All tool implementations in the registry must change their return values.
- `ToolExecutor.execute` returns `ToolResult`. The interface changes. Every caller (agent-loop.ts, hook systems, approval bus, etc.) must handle the new shape.
- The `Tool` interface in `registry.ts` has `execute(input: unknown, ctx: ToolContext): Promise<ToolResult>`. Changing ToolResult changes the tool interface.
- The `ToolResultPart` type in types.ts (line 18) has `isError?: boolean`. This is a separate type for message parts, not the same as `ToolResult`. However, the migration must ensure that `ToolResultPart` still works for the provider API, which expects `isError` in some providers. So the new ToolResult must be serializable back to the old part shape for provider calls.

**Consumers**:
- CLI users: none directly, but any config or scripting that parses tool results from stderr/logs may be affected.
- MCP authors: this is a breaking change for every external MCP server. The MCP transport layer converts `ToolResult` to wire format. If the wire format changes, all MCP servers must update.
- The 351 unit tests: many test tool results. They will all need to update assertion patterns from `result.content` to `result.ok ? result.value.content : result.error.message` (or similar).
- `scripts/qa-app/*.mjs`: if these run tools and inspect results, they break.
- The publish workflow: not directly impacted, but the tool API is documented. This change must be communicated prominently in the release notes as a breaking change.

**Notification**: This is too big for a single version without a deprecation period. The plan should include a phase where both shapes are accepted (the `wrapLegacyResult` mentioned in the audit doc) and warn MCP authors. The team plans "no-op shim during rollout", but if the shim is not part of the rollout strategy, this change will break every MCP server immediately.

### Item 5: TaskLedger + ConversationProjection + snapshot compaction + crash-safe persistence

**Public surfaces**:
- `runAgentLoop` config: currently accepts `session?: Session`. The plan says it will accept a `TaskLedger` and remove `history: Message[]` as a parameter. That changes the agent loop's caller API completely. All callers: `App.tsx:1001-1016`, `interactive.ts`, any tests that call `runAgentLoop` directly must pass a `TaskLedger` and not pass `history`.
- `Session` interface (`src/context/session.ts`) will be reduced to a wrapper around TaskLedger. All existing session methods may change.
- The JSONL session file format (`~/.dirgha/sessions/{id}.jsonl`) may change from `SessionEntry` to `LedgerEntry`. On-disk format change means old sessions cannot be resumed with the new code without a migration.
- `compaction.ts` will be rewritten. The `createCompactionTransform` return type changes. Any custom `contextTransform` callers break.

**Consumers**:
- CLI users: every existing session file will be unreadable if the format changes incompatibly.
- The offline smoke harness, `scripts/qa-app/*.mjs`, tests: massive invasive changes.

**Notification**: This is a foundational refactor that touches almost every file. It cannot be shipped silently. A migration script for old session files is required.

---

## 3. Test plan gaps

For each item, three most important test scenarios likely missed.

### Item 1: Unified LoopGuard

1. **Scenario**: A tool that returns `ok:true` with identical output for several turns but different input arguments. The old `refusalCounts` only tracks `isError` results, so this would not have been caught. The new LoopGuard should detect output stagnation via hashing. **Missing test**: Create a tool that always returns `value: "ok"` regardless of input, run the agent loop with 6 turns (maxRepeatedCalls=5). Verify that `stopReason` is `"loop"` after 5 identical outputs, even though each call had different arguments. Current loop-detector.ts `track` does check output stagnation (line "lastOutputHash") but only if `message` is present; the new LoopGuard must do the same.

2. **Scenario**: A tool that returns `ok:false` with `error.type: "refusal"` but the `content` (or `error.message`) varies slightly between calls (e.g., different backoff suggestion). The stagnancy hash would change, so LoopGuard may not fire. But the refusal count should still detect repeated refusals of the same tool+args. **Test**: Same args, tool returns `{ok:false, error: {type:"refusal", message:"rate limited, retry in 2 seconds"}}` on first call, then `{ok:false, error: {type:"refusal", message:"rate limited, retry in 5 seconds"}}` on second. Verify loop still aborts after 3 identical (name, args) refusals despite differing messages.

3. **Scenario**: LoopGuard reset between prompts. The agent loop should call `loopGuard.reset()` between prompts (audit doc section 5.4). **Test**: run two separate prompts in the same session. First prompt triggers a loop; loopGuard should fire and abort. Second prompt should start with a clean slate. Simulate by running agent loop with two user turns separated by a `reset()`. Verify the second turn does not inherit the first turn's call frequency map.

### Item 2: Per-(provider, model) cooldown

1. **Scenario**: Model reassignment mid-session. The user starts with `gemini-2.0-flash` on provider A, then switches to `gemini-1.5-pro` on provider A. The old health was for (A, gemini-2.0-flash). The new cooldown state for (A, gemini-1.5-pro) should be independent. **Test**: Simulate 5 failures for (A, flash). Blacklist kicks in. Switch to (A, pro) and make a call. It should not be blacklisted. Use `isBlacklisted("providerA", "gemini-1.5-pro")` after blacklist of flash.

2. **Scenario**: Cooldown decay after 24h of good behavior. The current health monitor decays cooldown level after `COOLDOWN_DECAY_INTERVAL_MS` if `blacklistedUntil` is null and sufficient success elapsed. **Test**: set cooldownLevel to 2, lastSuccess > 24h ago, then call `recordSuccess`. Verify cooldownLevel decrements to 1. This is currently tested? Possibly, but the per-model variant introduces many more states (cooldownLevel per (provider, model)). Need a test that ensures decay on one model does not affect another.

3. **Scenario**: `isBlacklisted` called with a (provider, model) pair that has no health record yet. Should return false. **Test**: query non-existent pair. Should return false and not create a new state entry (or create with default values). The current `ensureState` creates a new InternalState on first access. That is fine, but `isBlacklisted` must not block the first request.

### Item 3: Tool output distillation

1. **Scenario**: MCP tool whose output is a stream of binary data (e.g., image generation returning base64 string of length 500k). The distillation service (`toolDistillationService.ts`) expects string content and applies proportional truncation. Binary/very long base64 will be drastically truncated, producing a broken base64 string that cannot be decoded. The TUI/TTY will see partial garbage. **Test**: Simulate a tool returning 1MB of base64 data. Distillation kicks in. Verify the truncated content is still a valid base64 prefix (no partial token? Not possible). But the test should verify that the `outputFile` is saved and the placeholder points to it. The agent should still be able to reference the file. The distillation logic must truncate at a clean boundary, not mid-character.

2. **Scenario**: Tool output that has no text at all (e.g., only images/generated files, no text). The gemini-cli service handles `PartListUnion` which can include images. In dirgha, ToolResult.content is a `string` or `ContentPart[]`? Current `ToolResult.content` is always `string`? (types.ts line 111: `content: string`). But `Message.content` can be `string | ContentPart[]`. The distillation service will receive a string. If the tool returns a data URL or file path, the string is short and distillation is a no-op. But if the tool returns an empty string, distillation should not crash. **Test**: Tool returns `"".` Distillation app returns immediately without saving file. Verify placeholder shows "full output saved to" but not truncated.

3. **Scenario**: Distillation fails due to disk full when saving truncated tool output. The `saveTruncatedToolOutput` may throw. The current executor catches errors from `runTool`. If distillation is integrated into `createToolExecutor`'s `execute` method, a failure in distillation after tool execution could result in `ToolResult` with error content "Tool 'x' failed: ...", losing the actual tool output. **Test**: Mock `saveTruncatedToolOutput` to throw. Verify that the tool result still contains the original output (fallback to untruncated). This is important for resilience.

### Item 4: ToolResult discriminant union

1. **Scenario**: Tool that returns both `ok: true` AND a non-empty content field currently (`isError: false`). The new shape separates `ok: true` with `value` containing the data. If the tool currently uses `content` as a string and also sets `data` (custom metadata), the migration must ensure both are preserved. **Test**: Write a tool that returns `{ content: "result", data: { extra: true }, isError: false }`. Under the new type, it should become `{ ok: true, value: "result", metadata: { extra: true } }`. Verify that consumers that read `value` get the string, and those reading `metadata` get the extra field.

2. **Scenario**: The `ToolResultPart` in types.ts (line 18) still has `isError?: boolean`. This is used for provider-bound message parts. The new `ToolResult` must map to `ToolResultPart` correctly. If a tool returns `{ ok: false, error: { type: "refusal", ... } }`, the agent loop needs to convert that to a `ToolResultPart` with `isError: true` and `content` being the error message. **Test**: After a tool returns `{ ok: false, error: { type: "refusal", message: "denied" } }`, the message sent to the provider should have `isError: true, content: "denied"`. Verify the serialization roundtrip.

3. **Scenario**: Third-party MCP tool that returns the old shape (with `isError`). The shim (`wrapLegacyResult`) must handle it. **Test**: feed a mock legacy result `{ isError: true, content: "failed" }` into the agent loop. The shim should convert it to `{ ok: false, error: { type: "internal", message: "failed", retryable: false } }`. Verify that the loop correctly treats it as an error and does not stall.

### Item 5: TaskLedger + ConversationProjection + snapshot compaction + crash-safe persistence

1. **Scenario**: Replaying a ledger that was written by an older CLI version (before the ledger schema). The old session JSONL has different entry types (e.g., `type: "message"` with a `message` field, `type: "compaction"` with `keptFrom`). The new ledger expects `LedgerEntry` with `type: "user_message"`, `type: "tool_call"`, etc. **Test**: Create a sample old-format session file, attempt to open it with the new ledger reader. Verify it either migrates successfully or returns an error that the TUI can handle gracefully (e.g., suggests starting a new session).

2. **Scenario**: Crash during `ledger.append()` for a `compaction` entry. The append writes to JSONL. If the process crashes after writing half the line, the next replay will encounter a malformed JSON line. The `replay` method in `session.ts` currently ignores parse errors (`catch { continue }`). The new ledger must do the same. **Test**: Write a corrupted JSONL (last line partial). Replay. Verify all valid entries are returned and the corrupted line is skipped. No crash.

3. **Scenario**: Snapshot compaction fires and writes a `compaction` entry, but the summarizer returns a summary that is longer than the original history (inflated token count). The `projectConversation` must detect that the compaction entry would cause the token count to increase and either skip the compaction or truncate the summary. The audit doc says "If the token count would be exceeded, it writes a compaction entry" — but if the projection sees a compaction entry that replaces 80% of history with a 10k token summary, it might not reduce enough. **Test**: Feed a ledger with many short turns. Summarizer returns a verbose summary longer than the original. Compaction writes the entry. The projection must still produce a message list that respects the budget, potentially by ignoring the compaction entry and falling back to truncation. Verify the projection does not exceed budget.

---

## 4. Migration strategy holes

For each item, find a scenario where the planned no-op shim leaks old behaviour and a user notices.

### Item 1: Unified LoopGuard

**Proposed shim**: Keep both `loopDetector` and new `LoopGuard` during rollout. The audit doc says "replace the refusal-count map with a single `loopGuard.observe()` call". There is no mention of a dual-running period. If the plan relies on a feature flag to switch between old and new, the shim would be: old code path still exists, new code path behind flag.

**Leak scenario**: A session is in progress when the new code lands. The old `_refusalCounts` map is per-session local variable in `runAgentLoop`. On upgrade, the old map is gone; the new `StableLoopGuard` is created fresh. That's fine. But if the plan has a transitional phase where both `loopDetector.track()` and `loopGuard.observe()` are called, the state could double-count refusals. Old path increments `_refusalCounts`; new path also increments `loopGuard`. If both are enabled, a tool that returns 3 refusals could trigger abort at 1.5 refusals if thresholds are halved? Actually, both maps are independent; the abort check is at `agent-loop.ts:802-815` (old) and `agent-loop.ts:788` (old check) plus new guard. If both conditions are checked, the abort could fire at different thresholds, potentially causing early abort or double abort events. The user would see `[loop]` error prematurely.

**Fix**: Run only one detection path at any time. The shim should forward to both only if the other is explicitly disabled.

### Item 2: Per-(provider, model) cooldown

**Proposed shim**: Keep old provider-wide cooldown for any model not migrated yet. Composite key can fall back to `provider` key for old entries, and use `provider:model` for new. The `health.json` file will have both single-key entries (old) and composite-key entries (new). The `isBlacklisted` function can check both.

**Leak scenario**: A user has a blacklisted provider (e.g., `"openai"`) due to 5 failures on `gpt-3.5-turbo`. After upgrade, the old key `"openai"` is still blacklisted. The user switches to `gpt-4` on the same provider. The new code checks `isBlacklisted("openai", "gpt-4")`, which returns false because no entry for that pair, and the old key `"openai"` is not consulted. The request goes through, fails again (because the provider-side outage is provider-wide, not model-specific), and the user sees the same error. The old cooldown level on `"openai"` is not carried over. The new (provider, model) state starts fresh, so the user may hit the error 5 more times before cooldown kicks in again. This deviates from the expected behavior where switching models would not bypass cooldown.

**Fix**: The migration should propagate existing provider-level cooldown to all known models for that provider, or should continue to respect the old provider-wide key when no model-specific record exists.

### Item 3: Tool output distillation

**Shim**: Distillation is a new feature, no old behaviour to replace. The shim is the feature itself: it only truncates when over threshold. The old behavior (no truncation) is the default when distortion is off.

**Leak scenario**: Distillation is enabled by default. A power user relies on the full raw output of a tool (e.g., reading a 10k-line file) being passed verbatim to the model (for code review, etc.). Now the output is truncated to 2000 characters. The model has less context. The user notices the model's analysis is incomplete. Even if the user is aware, they cannot recover the full context without opening the saved file manually. The "leak" is a reduction in recall.

**Fix**: Provide a configuration toggle to disable distillation per tool or globally, and document that users who need full context should set `TOOL_OUTPUT_UNTRUNCATED=true` or similar.

### Item 4: ToolResult discriminant union

**Shim**: `wrapLegacyResult` that converts old-shape tool results (from third-party MCP servers that haven't updated yet) to new shape. The agent loop and all internal consumers work with the new shape.

**Leak scenario**: A third-party MCP server returns `{ content: "result", isError: false }` (old shape). The `wrapLegacyResult` converts it to `{ ok: true, value: { content: "result", isError: false } }`? No, that would be wrong. The shim must recognize the old shape and convert correctly. If the MCP server also includes a `metadata` field, the shim should preserve it. The problem is that the old shape has `content` as a string; the new shape's `value` should be the actual tool output. For an MCP tool, the output is the `content` string. So the shim should produce `{ ok: true, value: content }` when `isError` is false, and `{ ok: false, error: { type: "internal", message: content } }` when `isError` is true. But if the tool returns `isError: false` and `content: "error: some problem"`, the shim would treat it as success, losing the error detection. The old shape's boolean isError is not a reliable substitute for the new discriminated error types.

**Test**: An MCP server that returns `{ isError: true, content: "timeout" }` — the shim should set `error.type` to `"timeout"` based on content matching? No, it must use a heuristic. The leak is that the typed error is replaced with a generic `"internal"` and the retryable/abort decision may be wrong.

**Fix**: The shim should require MCP servers to opt into the new shape, or the agent loop should have a fallback path that treats any unknown result shape as an opaque error. The plan must specify the heuristic for setting `error.type`.

### Item 5: TaskLedger + ConversationProjection

**Shim**: The audit plan says "keep the existing session as a parallel log" and "do not replay existing history into the ledger yet" (Step 1 of audit doc). The ledger writes new entries alongside the old session. The old history array is still the source of truth. Then Step 2 switches to ledger-driven provider calls.

**Leak scenario**: During Step 1, both the old session JSONL and the new ledger are written. If a tool retry or approval occurs, two different append paths (old `session.append` and new `ledger.append`) could get out of sync. For example, the old path appends after a turn, the new path appends after each event. If the process crashes between the two appends, one file has an entry the other does not. On rollback (see Section 5), the old session file is used, but the ledger file contains incomplete data. No backward migration is planned, so the ledger is orphaned.

**Fix**: The parallel write must be guarded by a transaction or at minimum the same single writer. Better to implement Step 2 immediately after Step 1 so there is never a period where two sources of truth exist.

---

## 5. Roll-forward / roll-back asymmetry

### Item 1: Unified LoopGuard

**Data format change**: None. The old state (`_refusalCounts` map) is in-memory only, not persisted. The new LoopGuard also in-memory. Rollback is safe. No disk format change.

### Item 2: Per-(provider, model) cooldown

**Data format change**: `health.json` keys change from `"provider"` to `"provider:model"`. Old format: `{ "openai": {...} }`. New format: `{ "openai:gpt-3.5-turbo": {...} }`. After a single CLI run with the new code, the health.json will contain new-style keys. Old entries with single keys may persist if not cleaned up. Rollback: the old code looks for provider-level keys. It will ignore the new composite keys. The old code's `state` map will be empty for existing providers, so all cooldown state is lost. The user goes back to having no cooldown history.

**Migration**: The migration should, on first run with new code, read old entries and either delete them or migrate them to composite keys (e.g., treat old entry as default for all models of that provider). On rollback, the old code cannot read new entries, so state is lost. This is asymmetry.

**Rollback plan**: The rollback would need to include a downgrade script that re-writes health.json to old format, or the old code must be patched to also look under composite keys as a fallback. The probability of users rolling back the 1-day Item 2 is low, but for Item 5 it's higher.

### Item 3: Tool output distillation

**Data format change**: Distillation saves files to `~/.dirgha/tool-outputs/`. These are not read back by any core logic; they are for user reference. Rollback does not need to read them. No asymmetry.

### Item 4: ToolResult discriminant union

**Data format change**: Potentially affects session JSONL if tool results are persisted as part of session entries. Currently `SessionEntry.type "message"` includes a `Message` which has `content` whose parts include `ToolResultPart` with `content: string, isError: boolean`. The new `ToolResult` does not change `ToolResultPart` in the Message definition (types.ts line 18), because the provider API still expects that shape. So the session file format does not change. However, if any tool result metadata is stored in the session (like in `type: "system"` events or custom serialisation), that could break. But likely not.

**Rollback**: Old code reads session JSONL which still has old-style `isError` fields in `ToolResultPart`. That is fine. The new code writes `isError` in the same fields. No asymmetry.

### Item 5: TaskLedger + ConversationProjection + snapshot compaction

**Data format change**: Massive. New ledger file (`~/.dirgha/ledgers/{sessionId}.jsonl`) uses `LedgerEntry` format with types like `"user_message"`, `"compaction"`, etc. Old session JSONL (`~/.dirgha/sessions/{sessionId}.jsonl`) uses `SessionEntry` type with `"message"`, `"compaction"`, etc. After one CLI run with the new code, both files may exist. The old session JSONL may also be written (if parallel write is used during Step 1). On rollback, the old code only reads old session JSONL. The new ledger file is ignored. If the old session JSONL was not written (because Step 2 switched to ledger-only), then the old session JSONL is stale or empty, and the user loses all session data recorded while the new code was active. This is a hard break.

**Migration**: The rollback must either (a) keep writing to both formats until the next major version, or (b) provide a downgrade script that converts the ledger back to old session JSONL. The plan does not mention any such script.

**Risk**: After the 6-day Item 5, many users will have sessions with the new ledger format. A rollback to v1.33.5 destroys those sessions.

---

## 6. Soak-test design

The team plans "a 24-hour soak between items". The plan does not define what "soak" means. Below is what must be in place for soak to be meaningful.

### Workload

- **Must be synthetic + real**: A synthetic workload that exercises the changed component(s) at high volume, plus a small set of real user sessions (beta testers) to catch integration issues.
- For Item 1 (LoopGuard): The soak should run a series of sessions that trigger loops (e.g., a tool that always refuses) and sessions that don't loop, to verify no false positives. Synthetic workload: 50 sessions, each with 10 turns, randomly injecting looping tools. Verify accuracy of detection vs false positives.
- For Item 2 (per-model cooldown): Soak should alternate between models, trigger rate limits, and verify that cooldown state is correctly scoped per model. Real workload: let users chat with agent switching models occasionally.
- For Item 3 (distillation): Soak should include tools that return large outputs (e.g., `grep -r` on a large codebase). Measure token savings and verify no crashes. Monitor disk usage of `tool-outputs/`.
- For Item 4 (ToolResult union): Soak must run all existing 351 unit tests against the new type, plus integration tests that call real tools. No test should fail.
- For Item 5 (TaskLedger): Soak is the most critical. Must run 1000-turn sessions, crash recovery tests (kill -9), compaction scenarios. Must also run old sessions through the new code to check migration.

### Metrics to monitor

- Tool error rates (should not increase)
- Loop detection precision/recall (measure false abort rate)
- Token usage per turn (compaction effectiveness)
- Session corruption rate (crashed restores)
- Flicker count (if TUI changed)
- Disk usage of `tool-outputs/` and `ledgers/`
- Memory usage of projection function
- Time to resume a session from JSONL vs ledger

### Soak failure criteria

- Any crash during soak (segfault, unhandled exception)
- Any session that cannot be resumed after a simulated kill
- Any tool loop that fires incorrectly more than once in 100 sessions (false positive)
- Token budget exceeded by more than 10% after compaction
- Any structural 400 error after a compaction turn (orphaned tool results)

### Rollback procedure if soak fails on day 18 (mid-Ledger work)

- The team must stipulate that rollback of a partially deployed Item 5 is not safe. If the ledger files have been written with new format, rolling back the code means the files are unreadable. The only safe rollback is to restore the data from nightly backups of `~/.dirgha/sessions/` (assuming the old session JSONL was still written alongside). If the rollback point is day 18, the old session JSONL may be stale if Step 2 has switched to ledger-only. **The plan must specify that the old session JSONL is kept until Item 5 is fully stable and all users have migrated**. Until then, rollback means the user loses any data recorded after the midpoint.

**Recommendation**: Do not merge Item 5 into main until the soak for Item 5 has passed 48 hours with a synthetic workload and 24 hours of real user traffic. Have a clear "green" metric that aborts the migration if not met.

---

## 7. Sequencing risks

### Item 4 (ToolResult union) → Item 5 (TaskLedger)

**Risk**: Item 4 changes `ToolResult` shape. Item 5 includes snapshot-based compaction that writes `compaction` entries containing a summary of the conversation, which includes tool result summaries. If Item 4 is done first, the summaries written during compaction after Item 4 will be in the new shape (e.g., `{ok:true, value:"some summary"}`). But the ledger recording of tool results during Item 4's rollout may still contain old-shape entries in the session JSONL (if the ledger is not yet the source of truth). When Item 5 finally introduces the ledger, it will need to replay those old session entries. The ledger schema must accommodate both old and new `ToolResult` shapes. If the ledger is defined to only accept `LedgerEntry` with typed discriminant (`type: "tool_result"` with a `result` field that uses the new `ToolResult` shape), then old entries from sessions recorded during Item 4 that used the old shape cannot be replayed. This would require a migration step to convert old session JSONL to new ledger format, which Item 5 currently does not plan (Step 1 says "do not replay existing history into the ledger yet").

**Mitigation**: The ledger's `tool_result` entry should use a union or a generic container that can hold both shapes, or the JSONL reading code should have a migration path.

### Item 1 (LoopGuard) → Item 5 (Ledger + compaction)

**Risk**: Both touch `agent-loop.ts`. Item 1 replaces `_refusalCounts` and `loopDetector` with `StableLoopGuard`. Item 5 changes `runAgentLoop`'s signature from accepting `history: Message[]` + `session?: Session` to accepting a `TaskLedger` and using projection. `agent-loop.ts` is the most complex file in the kernel. If two developers independently modify it, merge conflicts are nearly certain. The plan's ordering lists Item 1 first, then Item 5 fourth. Even though Item 5 is 6 days, the team might start it before Item 1 is merged, leading to conflicts. The plan should enforce that only one item touches `agent-loop.ts` at a time, and that changes to that file are merged atomically.

### Item 2 (per-model cooldown) → Item 5 (Ledger persistence)

**Risk**: Item 2 changes `health-monitor.ts` and `agent-loop.ts` calls to `recordFailure` etc. Item 5 also changes `agent-loop.ts` to use ledger-bound crash-safe persistence. The `recordHealthFailure` calls currently happen inside the error handling of the stream iteration. Item 5 will restructure that error handling (maybe moving it into the projection layer). If Item 2 adds model parameters to those calls, the merge may cause type errors in Item 5's new error paths. The risk is moderate.

### Item 3 (Distillation) → Item 5 (Ledger)

**Risk**: Distillation is integrated into `createToolExecutor` in `tools/exec.ts`. Item 5 does not touch that file. No conflict.

---

## 8. The "one more thing"

**If I were doing this refactor at a real company shipping to real customers, the one thing I'd add to this plan that the team didn't think of is: a formal API version contract between the agent loop and tools, with a deprecation window for the old `ToolResult` shape, enforced by a runtime compatibility check at tool registration time.**

The team is about to break every tool author (Item 4) without a bridge. The plan mentions `wrapLegacyResult` for third-party MCP servers, but it does not define how the agent loop will detect which shape a tool returns. The best practice is to add a `version` field to the `Tool` interface or to the `ToolResult` itself, so that the executor can route results through the appropriate shim. Without this, a third-party MCP that hasn't updated will silently misbehave (its results treated as `ok:false` with wrong error types). This is a production incident waiting to happen.

Concrete addition:
- Add `resultSchemaVersion: 1` (old) or `resultSchemaVersion: 2` (new) field to `ToolDefinition` or a new `ToolMeta` that the executor checks at runtime.
- During Item 4 migration, the executor reads the version. If the tool returns old shape, `wrapLegacyResult` is applied; if new shape, use directly.
- After 2 major versions (e.g., v1.35), drop old shape support.

This protects every MCP server author from being forced to update immediately, and lets the team adopt the new shape incrementally. The plan currently has no such mechanism, which means every tool will break on the day Item 4 ships. That alone justifies delaying Item 4 until a compatibility contract is in place.

**Implementation sketch**:
```ts
// In types.ts
export type ToolResultSchemaVersion = 1 | 2;

// In Tool interface
interface Tool {
  name: string;
  // ... existing fields
  resultSchemaVersion?: ToolResultSchemaVersion; // defaults to 1
}

// In executor
if (tool.resultSchemaVersion === undefined || tool.resultSchemaVersion === 1) {
  // call tool.execute, then apply wrapLegacyResult
  const raw = await tool.execute(input, ctx);
  return wrapLegacyResult(raw); // converts to v2
} else {
  return await tool.execute(input, ctx);
}
```