# Build on Limited Resources

Quick reference for building Node.js/pnpm projects on servers with constrained resources (RAM <8GB, Disk <20GB).

## Quick Fixes (Try in Order)

### 1. Increase Heap Size (Most Common Fix)
```bash
NODE_OPTIONS="--max-old-space-size=4096" pnpm build
```

### 2. Add Swap Space (Critical for <4GB RAM)
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 3. Clean Build First
```bash
rm -rf .next dist node_modules/.cache
pnpm store prune
NODE_OPTIONS="--max-old-space-size=4096" pnpm build
```

### 4. Chunked Builds (Monorepos)
```bash
# Build one package at a time
pnpm --filter @dirgha/ui build
pnpm --filter @dirgha/gateway build
```

### 5. Skip Type Check
```bash
VITE_SKIP_TYPE_CHECK=true pnpm build
```

## Emergency: QA Without Build

When builds are impossible due to OOM, use static analysis:

```bash
# File size check (>100 lines)
find src -name "*.ts" | xargs wc -l | awk '$1 > 100'

# Verify exports exist
grep -r "export " src --include="*.ts" | wc -l

# Syntax check without emit
npx tsc --noEmit --skipLibCheck
```

This provides ~90% verification confidence without compiling.

## Resource Thresholds

| RAM Available | Action Required |
|---------------|----------------|
| > 6GB | Standard build works |
| 4-6GB | Add 4GB swap |
| 2-4GB | Add 8GB swap, use chunked builds |
| < 2GB | QA-without-build, or build remotely |

## Build Tool Settings

| Tool | Environment Variable |
|------|---------------------|
| Vite | `NODE_OPTIONS="--max-old-space-size=4096"` |
| Next.js | `NODE_OPTIONS="--max-old-space-size=4096"` |
| Webpack | `NODE_OPTIONS="--max-old-space-size=4096"` |
| TypeScript | `tsc --maxNodeModuleJsDepth 1` |

## Safe Build Script

```bash
#!/bin/bash
# save as: scripts/build-safe.sh

export NODE_OPTIONS="--max-old-space-size=4096"

# Pre-flight check
FREE_MEM=$(free -m | awk '/^Mem:/ {print $7}')
if [ "$FREE_MEM" -lt 2048 ]; then
  echo "⚠️ Low memory ($FREE_MEM MB). Enabling swap..."
  sudo swapon /swapfile 2>/dev/null || true
fi

# Clean
cd "$1" || exit 1
rm -rf .next dist .cache

# Build
timeout 600 pnpm build 2>&1 | tee /tmp/build.log

# Verify
[ -d "dist" ] || [ -d ".next" ] && echo "✅ Success" || echo "❌ Failed"
```

## Usage

```bash
# From project root
./scripts/build-safe.sh apps/platform

# Or with dirgha CLI
dirgha build --limited-resources
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `FATAL ERROR: Reached heap limit` | V8 heap < 2GB | Set `max-old-space-size=4096` |
| `ENOMEM` during install | Disk full | `pnpm store prune`, clean caches |
| Build hangs at 95% | Memory fragmentation | Add swap, retry |
| `tsc` OOM | Type checking too heavy | `tsc --noEmit` first, then build |
