# ADR-004: Session Trust Level System

**Status:** Accepted  
**Date:** 2026-04-11

## Context

Tools can be exploited. Need automatic protection.

## Decision

Four trust levels with auto-degradation:

| Level | Access | Recovery |
|-------|--------|----------|
| high | Full | - |
| medium | Some | 3 clean calls |
| low | Limited | 3 clean calls |
| untrusted | Minimal | 3 clean calls |

## Triggers for Degradation

- eval() detected
- Function constructor
- Command patterns
- Data exfiltration attempts

## Implementation

```typescript
function guardToolResult(result: string): void {
  if (containsInjection(result)) {
    sessionTrustLevel = 'untrusted';
  }
}
```

## Success

Security system blocked my own tools during audit - proof it works!
