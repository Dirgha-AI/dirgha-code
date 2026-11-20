#!/bin/bash
# scripts/test-browser-integration.sh — Browser integration test suite
# Tests both internal browser commands and Playwright-based commands

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TEST_URL="https://example.com"
CLI_PATH="${CLI_PATH:-./dist/dirgha.mjs}"
TIMEOUT=30
PASSED=0
FAILED=0

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; PASSED=$((PASSED + 1)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; FAILED=$((FAILED + 1)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Cleanup function
cleanup() {
  log_info "Cleaning up test resources..."
  # Kill any lingering browser processes
  pkill -f "chromium" 2>/dev/null || true
  pkill -f "playwright" 2>/dev/null || true
  # Remove test screenshots/pdfs
  rm -f /tmp/test-*.png /tmp/test-*.pdf 2>/dev/null || true
}

trap cleanup EXIT

# Test runner
run_test() {
  local name="$1"
  local cmd="$2"
  local expected="$3"
  
  log_info "Running: $name"
  
  if output=$(eval "$cmd" 2>&1); then
    if [[ -n "$expected" ]] && [[ "$output" == *"$expected"* ]]; then
      log_pass "$name"
      return 0
    elif [[ -z "$expected" ]]; then
      log_pass "$name"
      return 0
    else
      log_fail "$name - Expected '$expected' not found in output"
      echo "  Output: $output"
      return 1
    fi
  else
    log_fail "$name - Command failed"
    echo "  Output: $output"
    return 1
  fi
}

# Main test suite
echo "=========================================="
echo "Dirgha CLI Browser Integration Tests"
echo "=========================================="
echo ""

# Check if CLI is available
if [[ ! -f "$CLI_PATH" ]]; then
  log_warn "CLI not found at $CLI_PATH, trying npm run build..."
  npm run build 2>/dev/null || {
    log_fail "Could not build CLI. Please run 'npm run build' first."
    exit 1
  }
fi

log_info "Testing with CLI: $CLI_PATH"
echo ""

# Test 1: Browser command help
run_test \
  "Browser help command" \
  "timeout $TIMEOUT node $CLI_PATH browser --help" \
  "navigate"

# Test 2: Internal navigate command (simulated)
run_test \
  "Internal browser navigate" \
  "timeout $TIMEOUT node $CLI_PATH browser navigate $TEST_URL" \
  "Navigated"

# Test 3: Internal click command (simulated)
run_test \
  "Internal browser click" \
  "timeout $TIMEOUT node $CLI_PATH browser click '#test'" \
  "Clicked"

# Test 4: Internal type command (simulated)
run_test \
  "Internal browser type" \
  "timeout $TIMEOUT node $CLI_PATH browser type '#input' 'test text'" \
  "Typed"

# Test 5: Internal snapshot command (simulated)
run_test \
  "Internal browser snapshot" \
  "timeout $TIMEOUT node $CLI_PATH browser snapshot" \
  "Accessibility Snapshot"

# Check if Playwright is installed for full browser tests
if node -e "require('playwright-core')" 2>/dev/null || node -e "require('playwright')" 2>/dev/null; then
  log_info "Playwright detected, running full browser tests..."
  
  # Test 6: Playwright goto command
  run_test \
    "Playwright browser goto" \
    "timeout $TIMEOUT node $CLI_PATH browser goto $TEST_URL" \
    "Loaded"
  
  # Test 7: Playwright goto with screenshot
  run_test \
    "Playwright browser goto with screenshot" \
    "timeout $TIMEOUT node $CLI_PATH browser goto $TEST_URL --screenshot" \
    "Screenshot"
  
  # Test 8: Playwright extract command
  run_test \
    "Playwright browser extract" \
    "timeout $TIMEOUT node $CLI_PATH browser extract $TEST_URL" \
    "Extracted"
  
  # Test 9: Playwright pdf command
  run_test \
    "Playwright browser pdf" \
    "timeout $TIMEOUT node $CLI_PATH browser pdf $TEST_URL --output /tmp/test-output.pdf" \
    "PDF saved"
  
else
  log_warn "Playwright not installed, skipping full browser tests"
  log_warn "Install with: npm i -g playwright"
fi

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

# Exit with appropriate code
if [[ $FAILED -eq 0 ]]; then
  log_info "All tests passed! ✓"
  exit 0
else
  log_fail "Some tests failed. See above for details."
  exit 1
fi
