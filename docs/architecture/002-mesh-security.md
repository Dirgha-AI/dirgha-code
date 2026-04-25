# ADR-002: LibP2P Mesh Security

**Status:** Accepted  
**Date:** 2026-04-11

## Context

P2P networks face threats:
- DDoS amplification
- Eclipse attacks
- Malicious peers
- Message flooding

## Decision

Implement defense in depth:

1. **Connection Limits:** 50 max connections
2. **Rate Limiting:** 100 messages/second
3. **Peer Reputation:** Track and block bad actors
4. **Message Validation:** Size and content checks

## Code

```typescript
export const MESH_SECURITY = {
  maxConnections: 50,
  rateLimitPerSecond: 100,
  maxMessageSize: 10 * 1024 * 1024, // 10MB
  messageTimeoutMs: 30000,
};
```

## Verification

Tests in `src/mesh/__tests__/security.test.ts`
