# ADR-003: 100-Line File Budget

**Status:** Accepted  
**Date:** 2026-04-11

## Context

Large files reduce:
- Code readability
- Testability
- Review efficiency
- Maintainability

## Decision

Enforce 100-line limit per file:
- Single responsibility
- Barrel exports for modules
- Split when approaching limit

## Enforcement

ESLint rule:
```javascript
'max-lines': ['error', { max: 100 }]
```

## Example

```
Before: src/commands/mesh.ts (324 lines)
After:  src/commands/mesh/*.ts (10 files, avg 32 lines)
```

## Exceptions

None. Split into multiple files.
