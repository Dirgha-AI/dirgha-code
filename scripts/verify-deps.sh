#!/bin/bash
set -e

echo "Verifying dependencies..."

# Check for wildcard dependencies
if grep -q '"\*"' package.json; then
  echo "ERROR: Wildcard dependencies found in package.json"
  grep '"\*"' package.json
  exit 1
fi

# Run security audit
pnpm audit --prod --audit-level=moderate

# Check outdated packages
pnpm outdated || true

echo "Dependencies verified ✓"
