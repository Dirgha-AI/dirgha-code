---
name: qa
description: QA and verification — evidence before claims, structured test runs
trigger: /qa
---

## QA Protocol

**The Iron Law:** Never claim something works without running fresh verification and showing the output.

Forbidden phrases without evidence:
- "should work", "probably works", "seems to work"
- "tests pass" (without running them)
- "fixed" (without verifying the fix)

### Verification Gate (run before any completion claim)

```
1. IDENTIFY: What command proves this claim?
2. RUN: Execute it fresh (not from memory)
3. READ: Full output, exit code
4. VERIFY: Output matches expectation?
5. ONLY THEN: Make the claim
```

### QA Checklist for Code Changes

**Functional:**
- [ ] All existing tests pass: `pnpm test` / `pytest` / `go test ./...`
- [ ] New behavior has a test
- [ ] Edge cases covered (null, empty, boundary)

**Integration:**
- [ ] Build succeeds: `pnpm build`
- [ ] No TypeScript errors: `pnpm tsc --noEmit`
- [ ] No lint errors: `pnpm lint`

**UI (if applicable):**
- [ ] Renders at 375px (mobile)
- [ ] Renders at 768px (tablet)
- [ ] Renders at 1280px (desktop)
- [ ] No console errors in browser
- [ ] Keyboard navigable

**Security:**
- [ ] No secrets in code or logs
- [ ] User input validated/sanitized
- [ ] API routes have auth checks

### Reporting Format

```
QA Report — [feature name]
Date: YYYY-MM-DD

Tests: 42 passing, 0 failing
Build: ✓
Lint: ✓

Issues found: [list or "none"]
Verified: [what was checked]
```

## Common Shortcuts — Rejected

These rationalizations are recognized and rejected:
- "I ran it earlier and it passed" → run it fresh, now; cached results are not evidence
- "This is a minor change, no need to re-run the full suite" → minor changes break unexpected things; always run full suite
- "The TypeScript types are correct so it must work at runtime" → types are compile-time; run it to verify runtime behavior
- "I'll skip the mobile check, it's a backend change" → UI code can be affected by API shape changes; always verify the full contract
- "Build succeeded, so lint errors are fine" → lint errors indicate real problems; fix them before marking done
- "The endpoint returns 200 so it's working" → check the response body, not just the status code
- "No errors in the console means it's clean" → check the network tab too; silent 4xx failures are common
