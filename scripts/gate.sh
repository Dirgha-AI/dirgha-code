#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0
STEP=0

run() {
  STEP=$((STEP + 1))
  local label="$1"; shift
  printf "${YELLOW}[%2s/%2s]${NC} %-25s " "$STEP" "8" "$label"
  local start=$(date +%s%N)
  if "$@" > /tmp/dirgha-gate-${STEP}.log 2>&1; then
    local end=$(date +%s%N)
    local ms=$(( (end - start) / 1000000 ))
    printf "${GREEN}PASS${NC} (${ms}ms)\n"
    PASS=$((PASS + 1))
  else
    printf "${RED}FAIL${NC}\n"
    FAIL=$((FAIL + 1))
    echo "  --- last 20 lines ---"
    tail -20 "/tmp/dirgha-gate-${STEP}.log" | sed 's/^/  /'
    echo "  --- full log: /tmp/dirgha-gate-${STEP}.log ---"
  fi
}

echo ""
echo "dirgha pre-push gate — $(date '+%Y-%m-%d %H:%M')"
echo ""

run "typecheck"             npx tsc -p tsconfig.json --noEmit
run "lint"                  npx eslint src --max-warnings 0
run "unit tests"            npx vitest run --dir src
run "build"                 npm run build
run "license audit"         npx license-checker --production --excludePackages 'argparse@1.0.10' --failOn 'GPL;AGPL;LGPL'
run "npm audit"             npm audit --audit-level=high --omit=dev
run "CLI version"           node dist/cli/main.js --version
run "CLI smoke (offline)"   node scripts/qa-app/run-all.mjs --offline

echo ""
if [ "$FAIL" -eq 0 ]; then
  printf "${GREEN}All %s checks passed — safe to push.${NC}\n" "$PASS"
  exit 0
else
  printf "${RED}%s passed, %s failed — fix before pushing.${NC}\n" "$PASS" "$FAIL"
  exit 1
fi
