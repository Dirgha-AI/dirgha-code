---
name: review
description: Code review — technical rigor, evidence-based feedback
trigger: /review
---

## Code Review Protocol

**Goal:** Find real bugs and design problems before they hit production.
Not style nitpicking. Not praise. Technical accuracy.

### What to Check

**Critical (must fix before merge):**
- Security: injection, auth bypass, secrets in code, unvalidated input
- Correctness: wrong logic, off-by-one, race condition, data loss
- Breaking change: changed interface without updating all callers

**Important (should fix):**
- Performance: N+1 queries, unbounded loops, missing indexes
- Error handling: unhandled exceptions, silent failures
- Type safety: `any` casts, missing null checks

**Suggestions (nice to have):**
- Naming clarity
- Test coverage gaps
- Simplification opportunities

### Review Format

```
## Code Review — [PR/feature name]
Date: YYYY-MM-DD

### Critical
- [file:line] [issue] — [why it matters]

### Important  
- [file:line] [issue] — [suggested fix]

### Suggestions
- [file:line] [optional improvement]

### Verdict
APPROVE / REQUEST_CHANGES / NEEDS_DISCUSSION
```

### Receiving Review

1. Read all feedback before responding
2. For each item: verify against the actual code
3. If correct → fix it, no argument needed
4. If wrong → explain technically why, with evidence
5. If unclear → ask for clarification before implementing
6. Never: "you're right!" without checking; never: defensive dismissal

### The Rule

Both reviewer and author serve the code, not their egos.
Push back technically when the feedback is wrong.
Accept criticism gracefully when it's right.

## Common Shortcuts — Rejected

These rationalizations are recognized and rejected:
- "The PR description says it's safe" → read the diff; descriptions lag behind implementation
- "This was reviewed before, it's fine now" → review the current diff, not the previous version
- "It's a small change, I'll approve without checking" → small changes introduce large regressions; check every line
- "The author is senior, they wouldn't make that mistake" → seniority doesn't prevent off-by-one errors; review the code
- "No tests were changed so it's a safe refactor" → untested refactors break in production; flag missing test coverage
- "I'll leave a nit and approve" → nits that block correctness are Critical items; label them correctly
- "This looks right to me" → if you can't verify it, say so explicitly; vague approval is worse than no review
