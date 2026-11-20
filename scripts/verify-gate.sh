#!/usr/bin/env bash
# Pre-tag verification gate. ALL must pass before `git tag` and push.
# Added 2026-05-14 after v1.34.0 publish failed because lint was not
# checked locally.
set -euo pipefail

echo "── typecheck ──────────────────────────────────────"
npm run typecheck

echo "── lint ───────────────────────────────────────────"
npm run lint

echo "── unit tests ─────────────────────────────────────"
npm run test 2>&1 | grep -E "Test Files|Tests" | tail -3

echo "── offline smoke ──────────────────────────────────"
npm run test:cli:offline 2>&1 | tail -3

echo "── build ──────────────────────────────────────────"
npm run build 2>&1 | tail -3

echo ""
echo "── secret scan on staged diff ─────────────────────"
SECRETS=$(git diff --cached \
  | grep -vE "grep -E|secret pattern|sk-\[a-zA" \
  | grep -E 'sk-[a-zA-Z0-9]{32}|xoxb-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{30,}|AKIA[0-9A-Z]{16}' \
  | head -3)
if [ -n "$SECRETS" ]; then
  echo "ABORT — secrets found in staged diff:"
  echo "$SECRETS"
  exit 1
fi
echo "clean"

echo ""
echo "✓ all gates passed — safe to tag + push"
