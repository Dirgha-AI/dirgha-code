#!/usr/bin/env bash
# Release checklist — runs every pre-release check in order.
# Usage: bash scripts/release-checklist.sh [--dry-run]
#
# Checks (in order):
#   1. Clean git working tree
#   2. Gate script (8 checks)
#   3. Bundle size trend
#   4. Prepublish guard
#   5. CHANGELOG is up to date
#   6. Version tag doesn't exist yet
#   7. dist/ is committed
#
# Exit: 0 if all pass, 1 if any fail.
set -euo pipefail

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0
FAIL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

check() {
  local label="$1"; shift
  printf "${YELLOW}[%s]${NC} %-45s " "$((PASS + FAIL + 1))" "$label"
  if "$@"; then
    printf "${GREEN}PASS${NC}\n"
    PASS=$((PASS + 1))
    return 0
  else
    printf "${RED}FAIL${NC}\n"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

echo ""
echo "══════════════════════════════════════════════════════"
echo "  Dirgha Release Checklist"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
[ "$DRY_RUN" = true ] && echo "  DRY RUN — skip slow checks"
echo "══════════════════════════════════════════════════════"
echo ""

# 1. Clean working tree
check "clean working tree" bash -c "
  cd '$ROOT'
  if [ -n \"\$(git status --porcelain)\" ]; then
    echo 'ERROR: working tree is dirty — commit or stash changes first' >&2
    git status --short
    exit 1
  fi
  exit 0
"

# 2. Gate script
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[*]${NC} DRY RUN — skipping gate (run bash scripts/gate.sh manually)"
else
  check "gate.sh (8 checks)" bash -c "
    cd '$ROOT'
    bash scripts/gate.sh > /tmp/dirgha-release-gate.log 2>&1 || {
      echo 'ERROR: gate failed' >&2
      tail -30 /tmp/dirgha-release-gate.log >&2
      exit 1
    }
    exit 0
  "
fi

# 3. Bundle size trending
check "bundle size trend" bash -c "
  cd '$ROOT'
  node scripts/bundle-trend.mjs --summary > /tmp/dirgha-release-bundle.log 2>&1 || {
    echo 'ERROR: bundle trend failed' >&2
    exit 1
  }
  exit 0
"

# 4. Prepublish guard
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[*]${NC} DRY RUN — skipping prepublish guard"
else
  check "prepublish guard (11 checks)" bash -c "
    cd '$ROOT'
    npm run build > /dev/null 2>&1
    bash scripts/prepublish-guard.sh > /tmp/dirgha-release-guard.log 2>&1 || {
      echo 'ERROR: prepublish guard failed' >&2
      tail -20 /tmp/dirgha-release-guard.log >&2
      exit 1
    }
    exit 0
  "
fi

# 5. CHANGELOG has current version
check "CHANGELOG up to date" bash -c "
  cd '$ROOT'
  ver=\$(node -p \"require('./package.json').version\")
  if ! grep -q \"^\${ver}\" CHANGELOG.md; then
    echo \"ERROR: CHANGELOG.md missing entry for version \$ver\" >&2
    echo '  Run: node scripts/changelog-bump.mjs' >&2
    exit 1
  fi
  exit 0
"

# 6. Version tag doesn't exist
check "tag v$(node -p "require('$ROOT/package.json').version") free" bash -c "
  cd '$ROOT'
  ver=\$(node -p \"require('./package.json').version\")
  if git tag -l \"v\${ver}\" | grep -q .; then
    echo \"ERROR: git tag v\${ver} already exists\" >&2
    exit 1
  fi
  exit 0
"

# 7. dist/ is committed
check "dist/ is committed" bash -c "
  cd '$ROOT'
  if git status --porcelain -- dist/ | grep -q .; then
    echo 'ERROR: dist/ has uncommitted changes — run npm run build && git add dist/' >&2
    git status --porcelain -- dist/
    exit 1
  fi
  exit 0
"

# Summary
echo ""
echo "══════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  printf "${GREEN}  ALL %s CHECKS PASSED — ready to release.${NC}\n" "$PASS"
  printf "${GREEN}  Next: npm run build && git tag v%s && git push --tags${NC}\n" \
    "$(node -p "require('$ROOT/package.json').version")"
  echo "══════════════════════════════════════════════════════"
  echo ""
  exit 0
else
  printf "${RED}  %s passed, %s failed — fix before releasing.${NC}\n" "$PASS" "$FAIL"
  echo "══════════════════════════════════════════════════════"
  echo ""
  exit 1
fi
