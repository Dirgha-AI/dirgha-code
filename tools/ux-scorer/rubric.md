# Dirgha CLI — UX Scoring Rubric

**Version**: 1.0
**Date**: 2026-04-28
**Used by**: `tools/ux-scorer/run.mjs`
**Gate**: median score < 7.0 across the agent fleet → block tag push

Each scripted journey is rated on five dimensions, each 0–10. Median (not mean) across the fleet of agents is the release-blocking number — one outlier agent shouldn't sway the gate.

## Dimensions

### 1. Discoverability
"Could a new user find the feature without external docs?"
- **10** — first thing they tried worked
- **7–9** — needed `--help` or one wrong attempt
- **4–6** — needed external docs / Google
- **0–3** — feature exists but the path to it is hidden

### 2. Narration quality
"When the CLI is doing something, do you understand what?"
- **10** — every state change has a one-line explanation; spinners say what's spinning
- **7–9** — most states explained; one or two opaque waits
- **4–6** — generic "loading" / silence in places
- **0–3** — long silent stretches; user can't tell if hung

### 3. Tool-call correctness
"When the agent invokes a tool, does it do the right thing with the right args?"
- **10** — tools fire only when needed, with sane args, output handled
- **7–9** — one minor mis-fire (e.g. unnecessary tool call)
- **4–6** — tool fires with wrong args once but recovers
- **0–3** — wrong tool, wrong args, no recovery

### 4. Visible-state freshness
"Does the UI reflect reality?"
- **10** — token count, mode badge, model id, cwd all match what's actually happening
- **7–9** — small lag (≤200ms) on one indicator
- **4–6** — one stale indicator that confuses the user
- **0–3** — UI lies (e.g. shows old model, wrong cwd, wrong tier)

### 5. Error recovery
"When something goes wrong, can the user fix it without restarting?"
- **10** — error states have a clear next action and the CLI offers it
- **7–9** — error message is clear; user knows what to do
- **4–6** — error message is technical but accurate
- **0–3** — error message is misleading or absent

## Journeys

Each journey is a tape of (input, expected-state) pairs run against the installed `dirgha` binary. The agent observes each frame and rates the dimensions on completion.

### J1 — Cold-start sign-in
1. `dirgha` (REPL launches, banner + input box)
2. `/login` (device-code prompt or "already signed in")
3. Submit (close out)
**Most-hit dimensions**: discoverability, narration

### J2 — First chat with tool call
1. `dirgha` (REPL)
2. Type "list files in /tmp using shell, then count them"
3. Submit (agent uses shell tool, reports count)
**Most-hit dimensions**: tool-call correctness, narration

### J3 — Switch model
1. `/models` (picker opens)
2. Arrow to a different free model
3. Enter (status bar updates)
**Most-hit dimensions**: visible-state freshness, discoverability

### J4 — Theme switch
1. `/theme` (picker opens)
2. Arrow to a different palette
3. Enter (palette flips immediately)
**Most-hit dimensions**: visible-state freshness

### J5 — Recover from rate limit
1. Burst three quick chats with the same tiny prompt
2. Provider 429s (or fallback announces)
3. Composer recovers
**Most-hit dimensions**: error recovery, narration

## Aggregation

Per journey × per agent:
```json
{
  "journey": "J1",
  "agent": "hy3",
  "scores": {
    "discoverability": 9,
    "narration_quality": 8,
    "tool_call_correctness": null,
    "visible_state_freshness": 7,
    "error_recovery": null
  },
  "transcript": "...",
  "notes": "Picker opened on first try. Banner is busy. Login prompt clear."
}
```

`null` is allowed when the journey doesn't exercise the dimension. Median ignores nulls.

Per release, the aggregator emits:
```json
{
  "version": "1.7.11",
  "fleet": ["hy3", "deepseek-v4-pro", "kimi-k2.5"],
  "journeys": ["J1", "J2", "J3", "J4", "J5"],
  "median_per_dimension": {
    "discoverability": 8.5,
    "narration_quality": 7.0,
    "tool_call_correctness": 8.0,
    "visible_state_freshness": 9.0,
    "error_recovery": 7.5
  },
  "overall_median": 8.0,
  "passes_gate": true
}
```

## Fleet

Default fleet (free + cheap):
- `tencent/hy3-preview:free` (openrouter)
- `deepseek-ai/deepseek-v4-pro` (nvidia)
- `moonshotai/kimi-k2-instruct` (groq, $0.18/M)

Optional paid fleet (nightly only):
- `claude-haiku-4-5` (Anthropic)
- `gpt-5-nano` (OpenAI)

## CI integration

- Run on tag push only (not every PR — costs)
- Cache OPENROUTER_API_KEY + NVIDIA_API_KEY as repo secrets
- Skip a model if its key isn't set (degrade gracefully)
- Single-agent run is allowed but median is replaced by that agent's score
