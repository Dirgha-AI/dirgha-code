# Audit: Memory Input Clear Bug

## 1. Root Cause

**File:** `src/tui/ink/components/InputBox.tsx`, lines 315–325 (focus transition effect) and the absence of equivalent logic for external value resets.

**Detailed mechanism:**

When the user submits `/memory` in `App.tsx`, `handleSubmit` calls `setInput("")` at line ~671 (App.tsx). This sets React state `input` to `""`. The `InputBox` component re-renders with `value=""`. However, the child `<TextInput>` from `ink-text-input` does not synchronize its internal state when the `value` prop changes after the initial mount. The component was mounted with `value="/memory"` and its internal state remains `"/memory"` permanently. The `value` prop is ignored for display after mount. This is a known behavior of many Ink input components: they use the initial value prop to seed internal state and do not re-sync on subsequent changes.

`InputBox` uses a `key={textInputKey}` prop on `<TextInput>` to force unmount/remount when the value should be reset externally. Currently, `textInputKey` is incremented only in these scenarios:

- **Focus transition** (false → true) — lines 315–325
- **History recall** (up/down arrow) — lines 249, 260
- **Paste collapse invalidation** — lines 164, 174, 185
- **Vim mode INSERT→NORMAL** — line 292

**Nowhere is `textInputKey` incremented when the parent programmatically clears the input via `setInput("")`.** Therefore, after the user submits `/memory`, the input state in App is `""` but the `<TextInput>` instance never re-mounts with that value; it continues to display its stale internal `"/memory"`.

When the user types subsequent characters, the `onChange` fires with the new concatenated value (`"/memory/clear"`). `InputBox`'s `handleChange` (line 199) calls `props.onChange` with that concatenated text, propagating it upstream and producing the observed concatenation behavior.

## 2. Why `/status` works but `/memory` doesn't — concrete difference

**Short answer:** both commands suffer from the same root cause. However, `/status` may appear to work because of an incidental focus transition that remounts `<TextInput>` — or the test scenario differed. There is no fundamental difference in the slash handlers that would cause one to clear input and the other not.

**Evidence:**

- Both `/status` and `/memory` are dispatched via the same code path in `handleSubmit` (App.tsx lines ~703–748). Both call `setInput("")` before dispatching.
- `memory.ts` and `status.ts` are both async SlashCommand implementations; `memory.ts` does I/O (`fs.readdir`, `fs.readFile` per entry) while `status.ts` does one file read.
- Neither handler calls any setter on the `SlashContext` that would modify React state (no `clear`, no `setModel`, no `status` calls).
- The only observable difference in rendering is the **transcript output**: `/memory` produces a multi-line list; `/status` produces a multi-line summary with a header. Neither output triggers any state change that would affect input.

**Probable explanation for observed difference (not guaranteed from code alone):**

If the user tested `/status` **right after launching the application** (before any previous submission), the `<TextInput>` internal state starts empty. Submitting `/status` calls `setInput("")` while internal state is `"/status"`. If the subsequent async dispatch completes **before the next React render** (e.g., `dirghaSummary` returns quickly because DIRGHA.md doesn't exist), the `setTranscript` state update may batch together with `setInput("")` in the same render. In that specific render, the `<TextInput>` is mounted with `value=""` because it hasn't been mounted yet with the old value? No, it was already mounted during the first render. The likely scenario: the user's `/status` test was performed in a **new session after a `/clear`** which also clears history but not input — but /clear does call `setInput("")`? Actually /clear does NOT call setInput; it only clears history and transcript. So the input retains the last value. Hard to explain.

**More likely: the bug exists for all slash commands, but the reporter only noticed it with `/memory` because `/memory` is longer and concatenation is more visible.** The bug description explicitly states `/status` works, but this could be a testing artifact (different pressing timing, or `/status` was tested after a remount from another interaction). No code path treats `/status` differently.

**Concrete diff in handler shape:**

| Property | memory.ts | status.ts |
|---|---|---|
| Async I/O | `store.list()` — readdir + stat + read for each file | `dirghaSummary()` — one readFile |
| Uses ctx | only `args` | `ctx.sessionId`, `ctx.model`, `ctx.showCost()` |
| Return shape | `string` | `string` |
| Box in transcript output | none (plain text) | none (plain text) — "box" in report might refer to the border of the InputBox itself, which can change color when busy, but neither sets busy. |

No handler calls any input-modifying method. The difference is irrelevant to input clearing.

## 3. Proposed Minimal Fix

**Location:** `InputBox.tsx`, add a `useEffect` that watches `props.value` and increments `textInputKey` when the value changes externally (i.e., not as a result of `onChange`).

**Change set (≤30 lines):**

In `InputBox.tsx`, after the existing `prevFocusRef` effect (around line 315), insert:

```tsx
// Force remount of <TextInput> when the value is reset externally
// (e.g., via setInput("") in handleSubmit). Without this, ink-text-input
// retains its internal state and won't show the new value.
const prevValueForRemount = React.useRef(props.value);
React.useEffect(() => {
  if (props.value !== prevValueForRemount.current) {
    prevValueForRemount.current = props.value;
    // Only bump key on external changes: if the value was non-empty
    // and became empty (clear), or if it changed due to setInput.
    // We use the onInternalChangeRef to know if the last change was
    // from within InputBox (onChange). If the ref is false, it's external.
    if (!onInternalChangeRef.current) {
      setTextInputKey((k) => k + 1);
    }
    onInternalChangeRef.current = false;
  }
}, [props.value]);
```

Additional change: in `handleChange`, set a ref `onInternalChangeRef.current = true` to indicate that the value change originated from within InputBox. This ref must be declared at component top:

```tsx
const onInternalChangeRef = React.useRef(false);
```

In `handleChange`, add the line:

```tsx
onInternalChangeRef.current = true; // mark that this change originated internally
```

Total additional lines: ~15.

**Rationale:** The external-change detection avoids bumping the key for every keystroke (which would cause cursor reset). The ref approach is cheap and avoids adding `textInputKey` to dependency arrays elsewhere.

**Alternative simpler fix:** Remove the condition and always bump key on any value change, because `textInputKey` bumps cause unmount/remount and could reset cursor position. The internal change flag preserves cursor behavior.

**Fallback fix if flag feels fragile:** Increment `textInputKey` only when `props.value` changes from a non-empty string to an empty string. This covers the specific bug (external clear) and does not affect typing flow because typing rarely transitions from non-empty to empty (backspace only). History recall and dequeue already bump the key independently. However, this misses cases where external setInput changes value from one non-empty string to another (e.g., dequeue, which already bumps key) or from empty to non-empty (not relevant here). The ref-based approach is more general.

## 4. Edge Cases the Fix Must Handle

| Edge case | Current behavior | Required behavior after fix |
|---|---|---|
| User types normally | onChange fires, internal state synced, no remount needed | No remount; cursor stays at correct position. `onInternalChangeRef.current = true` in `handleChange` prevents key bump. |
| Programmatic clear via `setInput("")` | TextInput retains old value; bug | Key incremented, TextInput remounts with empty value, cursor at end. |
| History recall (up arrow) | Already bumps key (line 249) | No change. Existing code sets `setTextInputKey((k) => k + 1)`. The new effect should NOT also bump key here because the recall updates `props.value` after the key bump. To avoid double bump, the effect must check `onInternalChangeRef`. Since history recall calls `props.onChange` directly, `onInternalChangeRef.current` will be `true` (because it goes through `handleChange`? Actually history recall does NOT go through `handleChange`; it calls `props.onChange` directly. That means `onInternalChangeRef.current` would remain false, causing the effect to bump key again. **Add**: inside the history recall block, set `onInternalChangeRef.current = true` to suppress the effect's key bump. Similarly for dequeue-for-edit (line 88) and paste-collapse clear (line 203). |
| Dequeue from prompt queue | Calls `setInput` in App, which passes value prop. InputBox's handleChange not called. | External change → key bump. Acceptable because dequeue already remounts? Dequeue code in App sets input via `setInput(last)`, then `setTextInputKey` in InputBox? Looking at InputBox, the dequeue is triggered by the user pressing up arrow while busy; the handler is in the always-active `useInput` (line 224) which calls `onDequeueForEdit` and then `setTextInputKey((k) => k + 1)` directly. So key is bumped. The new effect should not bump again. Add flag flag in that handler: `onInternalChangeRef.current = true`. |
| Paste collapse invalidated (user edits inside pasted block) | Bumps key via `setTextInputKey` (lines 164, 174, 185) | Same — set flag before onChange. |
| Ctrl+E toggle expand | Bumps key (line 268) | Set flag before toggling. |
| Vim NORMAL→INSERT transition | Bumps key (line 292) | Set flag. |
| Focus transition (false→true) | Bumps key (line 317) | This effect runs after the InputBox component has already rendered with the new value; it is part of the same commit. Setting `onInternalChangeRef.current = true` in that effect's callback would prevent the new value-change effect from bumping again. |
| `props.value` changes rapidly (e.g., during streaming from parent?) | Currently not used for streaming; input changes only on user action or programmatic set. | Stale closure not an issue. |

**Summary of additional flag assignments:**

In addition to the two main changes (new effect and `onInternalChangeRef` in `handleChange`), insert `onInternalChangeRef.current = true` before every call to `setTextInputKey` that is already present. This prevents the new effect from double-bumping. The flag is reset to `false` at the end of the effect's execution (after the key bump decision).

**Total test scenario coverage:**

- `/memory` submit → input cleared, placeholder shown
- `/status` submit → same
- `/help` submit → overlay opens, input cleared
- All other slash commands → input cleared
- Normal typing, backspace, paste → no spurious remounts
- History recall, dequeue → cursor resets to end, no double remount
- Vim mode transitions → cursor resets, no double remount
- Ctrl+C to clear input → input cleared, no stale internal state
- Busy state queue → setInput called with empty, clears buffer for queue; when dequeued, input restored with correct value

The fix is minimal (~15 lines added to InputBox.tsx) and robust.