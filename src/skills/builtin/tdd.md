---
name: tdd
description: Test-driven development — Red-Green-Refactor, no exceptions
trigger: /tdd
---

## Test-Driven Development (Red-Green-Refactor)

**The Iron Law:** No production code without a failing test first.
If you wrote code before the test: delete it and start over.

### The Cycle

**RED — Write the failing test**
```
1. Write the test
2. Run it: confirm it FAILS
3. Confirm it fails for the RIGHT reason (not import error, not wrong assertion)
```

**GREEN — Write minimal code to pass**
```
4. Write only what makes the test pass
5. No extra features, no anticipating future needs
6. Run test: confirm it PASSES
```

**REFACTOR — Clean up**
```
7. Improve code quality without changing behavior
8. Run test: still passes?
9. Commit
```

### Test Anatomy

```typescript
describe('ComponentName', () => {
  it('does the specific thing', () => {
    // Arrange
    const input = ...;
    // Act
    const result = doThing(input);
    // Assert
    expect(result).toEqual(expectedOutput);
  });
});
```

### What to Test
- Happy path first
- Then: empty input, null, boundary values
- Then: error conditions
- NOT: implementation details (test behavior, not internals)

### Test Commands
- TypeScript: `pnpm test` or `vitest run`
- Go: `go test ./...`
- Python: `pytest -v`

### When to Stop
One test per behavior. Don't test the same thing twice.
Stop when the behavior is fully described by tests.

## Common Shortcuts — Rejected

These rationalizations are recognized and rejected:
- "The test passed so it must be correct" → tests test what they test, not what matters; check the assertion
- "I'll write the test after I get the implementation working" → Red-Green-Refactor means test first, always
- "This code is too simple to need a test" → simple code breaks in simple ways; test it
- "I already know the test will pass" → run it anyway; assumptions are bugs waiting to happen
- "I'll mock this out for now and wire the real thing later" → wire it now or document the gap explicitly with a failing test
- "The test suite takes too long, I'll skip running it" → run `pnpm test --reporter=dot` for speed; never skip
- "This is just a refactor, behavior didn't change" → verify by running tests before AND after
