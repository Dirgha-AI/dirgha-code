# Local Mesh CPU LLM for Dirgha CLI

> Distributed team coding with P2P compute sharing

## Overview

The Mesh system enables teams to pool their local CPU/GPU resources for LLM inference, creating a distributed compute mesh with:

- **P2P Discovery**: LibP2P-based mesh networking
- **Team Quotas**: Per-developer limits with role-based defaults
- **Consensus Verification**: PBFT-style result verification
- **Lightning Billing**: Pay-per-inference with automatic team splits

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Dev A      │◄───►│   Dev B      │◄───►│   Dev C      │
│  (Laptop)    │     │  (Desktop)   │     │  (Workstation│
│  8 cores     │     │  16 cores    │     │  32 cores    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            │
                   ┌────────▼────────┐
                   │  MESH NETWORK   │
                   │  (LibP2P)       │
                   └────────┬────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
  ┌──────▼──────┐  ┌───────▼───────┐  ┌──────▼──────┐
  │ Team Pool   │  │  Consensus    │  │ Lightning   │
  │ Quotas      │  │  Engine       │  │ Billing     │
  └─────────────┘  └───────────────┘  └─────────────┘
```

## Quick Start

```bash
# Join team mesh
dirgha mesh join --team acme-corp --workspace engineering

# Check pool status
dirgha mesh status

# Run inference
dirgha ask "Explain this code" --mesh-pool

# Check quota
dirgha mesh quota
```

## Commands

### mesh join
Join a team mesh network and start sharing resources.

```bash
dirgha mesh join -t <team-id> -w <workspace-id> [options]

Options:
  -c, --cpu <percent>     Max CPU to share (default: 50%)
  -m, --memory <gb>       Max RAM to share (default: 4GB)
  -p, --port <number>     P2P listen port (default: random)
```

### mesh leave
Gracefully leave the mesh network.

```bash
dirgha mesh leave
```

### mesh status
Show pool resources and connected peers.

```bash
dirgha mesh status
```

### mesh quota
Check your quota usage and remaining.

```bash
dirgha mesh quota [-m <member-id>]
```

### mesh ask
Run LLM inference through the mesh pool.

```bash
dirgha mesh ask <prompt> [options]

Options:
  -m, --model <name>      Model to use (default: gemma-4)
  --max-tokens <n>        Max tokens (default: 2048)
  -t, --temperature <n>   Temperature (default: 0.7)
  -p, --priority <level>  low/normal/high (default: normal)
```

## Multi-Tenancy

### Team Structure

- **Workspace**: Isolated environment per team (e.g., "engineering", "research")
- **Members**: Developers with role-based quotas
- **Quota Types**:
  - **Daily Tokens**: Per-member inference limit
  - **Monthly Cost**: Spend cap in USD

### Role-Based Defaults

| Role | Daily Tokens | Monthly Cost |
|------|--------------|--------------|
| admin | 500,000 | $100 |
| senior | 300,000 | $50 |
| developer | 100,000 | $20 |
| intern | 50,000 | $10 |

### Cost Allocation

Costs can be split by:
- **Individual**: Each member pays for their usage
- **Project Code**: Costs split by project
- **Team Pool**: Even split across all members

## Consensus

The system uses PBFT-inspired consensus for result verification:

1. Node A generates result
2. Nodes B and C verify by re-running inference
3. If ≥2 nodes agree, result is marked verified
4. Disagreement triggers retry or human review

```
Original      Verification
  Node A         Node B         Node C
    │              │              │
    ▼              ▼              ▼
 "Hello"      "Hello"      "Hello"
    │              │              │
    └──────────────┴──────────────┘
              Matches: 3/3
              Status: VERIFIED
```

## Billing

### Pricing

- **Base Cost**: 10 sats per inference
- **Variable**: 1 sat per 1000 tokens
- **Team Fee**: 5% platform fee

### Lightning Integration

1. Each inference creates Lightning invoice
2. Team members pay via their wallets
3. Automatic settlement when balance > 10K sats
4. Monthly reports with splits by project

## Implementation

### Core Modules

```typescript
import { MeshNode } from './mesh/MeshNode';
import { TeamResourcePool } from './mesh/TeamResourcePool';
import { ConsensusEngine } from './mesh/ConsensusEngine';
import { LightningBilling } from './mesh/LightningBilling';

// Create node
const node = new MeshNode({
  teamId: 'acme-corp',
  workspaceId: 'engineering',
  maxCpuPercent: 50,
  maxMemoryGb: 4,
});

await node.start();

// Create team pool
const pool = new TeamResourcePool('acme-corp', 'engineering', node);

// Add members
pool.addMember({
  id: 'alice',
  name: 'Alice',
  email: 'alice@acme.com',
  role: 'senior',
  canShareCompute: true,
  canUseMesh: true,
});

// Submit inference
const result = await pool.submitInference('alice', {
  model: 'gemma-4',
  prompt: 'Explain this code',
  priority: 'normal',
});
```

## Testing

```bash
cd apps/dirgha-cli
pnpm test mesh
```

## Future Enhancements

- [ ] GPU sharing (CUDA/ROCm)
- [ ] Cross-team compute marketplace
- [ ] Automatic model caching
- [ ] Federated learning mode
- [ ] Performance-based routing
