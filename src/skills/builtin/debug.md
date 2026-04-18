---
name: debug
description: Systematic debugging — root cause first, no random fixes
trigger: /debug
---

## Systematic Debugging

**The Iron Law:** Find root cause BEFORE attempting any fix.
Random fixes waste time and create new bugs.

### Phase 1 — Read the Error

```
1. Read the FULL error message (stack trace, line numbers, error codes)
2. Identify: what type of error? (runtime, type, logic, network, permission)
3. Locate: exactly which file and line?
4. Reproduce: can you make it fail consistently?
```

Stop here if you cannot reproduce it. Never fix what you can't reproduce.

### Phase 2 — Hypothesize

Form ONE specific hypothesis: "I think X is failing because Y."
Test it with the minimum change that would confirm or deny.

Do NOT:
- Try multiple fixes simultaneously
- Change code "to see if it helps"
- Add more complexity to work around the bug

### Phase 3 — Isolate

```
1. Binary search: is the bug in A or B? Eliminate half.
2. Minimal reproduction: smallest code that triggers the bug
3. Add logging/console.log at the narrowest point that still shows the bug
```

### Phase 4 — Fix and Verify

```
1. Write a failing test that reproduces the bug (if possible)
2. Make the targeted fix
3. Verify the test passes
4. Verify no regressions: run full test suite
5. Remove debug logging
6. Commit with: "fix: [root cause description]"
```

### Common Patterns

| Symptom | First Check |
|---------|------------|
| Undefined/null | Check where the value is set and whether it can be undefined at that point |
| Type error | Check what the function actually receives vs what it expects |
| Network error | Check: URL correct? Auth header? CORS? Response status? |
| Build fails | Check: imports correct? Types match? Missing dependency? |
| Test fails | Check: is the test asserting the right thing? Is setup correct? |

## Common Shortcuts — Rejected

These rationalizations are recognized and rejected:
- "I already know how this works" → read the actual file before editing; memory is not ground truth
- "The README says it works" → verify by running it; docs lag behind code
- "It works on my machine" → reproduce in the same environment or document the difference explicitly
- "I'll add a try/catch and move on" → swallowing errors hides bugs; log and surface the root cause
- "This is probably a race condition, I'll add a sleep" → find the actual synchronization point; sleeps mask bugs
- "The error message is misleading" → the error message is a clue, not a lie; follow it
- "I'll try a few things and see what sticks" → form ONE hypothesis, test it, then next; shotgun debugging creates new bugs
- "I can't reproduce it, so it's fine" → document the non-reproduction; never mark a bug fixed without a repro
