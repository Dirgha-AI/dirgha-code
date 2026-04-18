---
name: plan
description: Implementation planning — bite-sized tasks with exact code and commands
trigger: /plan
---

## Implementation Planning Protocol

**Activate when:** Spec is approved, or user uses `/plan`.

**The rule:** Every step is ONE action (2–5 min). No placeholders. Exact code. Exact commands with expected output.

### Plan Structure

Save to `docs/plans/YYYY-MM-DD-<feature>.md`

**Header (required):**
```markdown
# [Feature] Implementation Plan
**Goal:** One sentence.
**Architecture:** 2–3 sentences.
**Stack:** Key technologies.
```

**Per task:**
```markdown
### Task N: [Name]
**Files:** Create/Modify/Test: exact paths

- [ ] Step 1: Write failing test
  [exact test code]
  Run: `command` → Expected: FAIL with "..."

- [ ] Step 2: Implement
  [exact implementation code]

- [ ] Step 3: Verify passes
  Run: `command` → Expected: PASS

- [ ] Step 4: Commit
  `git commit -m "feat: ..."`
```

### Rules

**Never write:**
- "TBD", "TODO", "implement later"
- "Add appropriate error handling" (show the code)
- "Similar to Task N" (repeat the code)
- Steps without code blocks for code changes

**Always include:**
- Exact file paths
- Complete code (not fragments)
- Expected test output
- A commit per task

### After Writing

Self-review:
1. Spec coverage: every requirement → a task?
2. No placeholders?
3. Type/name consistency across tasks?

Then say: "Plan ready at `docs/plans/<filename>`. Run /build to execute it."

## Common Shortcuts — Rejected

These rationalizations are recognized and rejected:
- "This is a simple task, I'll skip the spec and go straight to code" → simple tasks produce the most unreviewed bugs; always plan
- "I'll add a TODO and come back to it" → TODOs without a task in the plan are promises that don't ship; wire it now or cut it
- "The plan doesn't need exact commands, I'll figure it out" → vague steps produce vague implementations; every step needs a runnable command
- "This is similar to the last task, I'll just reference it" → copy the code; references create drift
- "I'll leave the commit step implicit" → every task ends in a commit; make it explicit in the plan
- "The spec said X so the plan is obvious" → write it down anyway; plans are executable, not obvious
