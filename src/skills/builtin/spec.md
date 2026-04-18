---
name: spec
description: Spec-first workflow — brainstorm, clarify, write spec before any code
trigger: /spec
---

## Spec-First Protocol

**Activate when:** User asks to build something new, or uses `/spec`.

**The rule:** No code until the spec is approved. A spec can be 3 sentences for simple things or 2 pages for complex ones. Always present and get approval.

### Process

**Step 1 — Understand the idea**
- Check existing files/docs first (don't re-invent what exists)
- Ask ONE clarifying question at a time (never multiple)
- Focus on: purpose, constraints, success criteria
- If it's too large (multiple independent subsystems) → decompose first

**Step 2 — Propose 2–3 approaches**
- Lead with your recommendation and why
- Include trade-offs: complexity, performance, maintainability
- YAGNI ruthlessly — cut anything speculative

**Step 3 — Write the spec**
Cover (scaled to complexity):
- Architecture: what components, how they connect
- Data flow: inputs → processing → outputs
- Interface contracts: function signatures, API shapes
- Error handling: what fails, how gracefully
- Testing: what to verify

**Step 4 — Save the spec**
Write to `docs/specs/YYYY-MM-DD-<topic>.md`

**Format:**
```markdown
# [Feature] Spec
**Date:** YYYY-MM-DD
**Status:** Draft

## Goal
One sentence.

## Architecture
...

## Interfaces
...

## Success Criteria
- [ ] ...
```

**Step 5 — Transition to /plan**
Once approved: say "Spec approved. Use /plan to create the implementation plan."
