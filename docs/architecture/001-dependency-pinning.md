# ADR-001: Dependency Version Pinning

**Status:** Accepted  
**Date:** 2026-04-11

## Context

The CLI had wildcard dependencies (`*`) for LibP2P packages, creating risks:
- Breaking changes in minor versions
- Supply chain attacks
- Non-reproducible builds

## Decision

Pin all dependencies to exact versions:
```json
"@libp2p/gossipsub": "14.1.0"
"@libp2p/tcp": "10.1.2"
"libp2p": "2.2.1"
```

## Consequences

**Positive:**
- Reproducible builds
- Security audit possible
- Predictable behavior

**Negative:**
- Manual updates required
- Security patches need explicit updates

## Implementation

- Added `scripts/verify-deps.sh`
- CI workflow for weekly audits
- Updated all packages
