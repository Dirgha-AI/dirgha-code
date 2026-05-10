#!/usr/bin/env bash
# Multi-provider smoke matrix — tests each of the 17 providers with
# a minimal "say OK" call via the ask subcommand. Designed for nightly
# CI (free models only) or manual pre-release validation.
#
# Usage:
#   bash scripts/smoke-matrix.sh              # free models only (default)
#   bash scripts/smoke-matrix.sh all          # free + paid models (needs API keys)
#   bash scripts/smoke-matrix.sh list         # print provider matrix, exit
#
# Env:
#   OPENROUTER_API_KEY — used for all OR-proxied providers
#   Provider-specific keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
#     enable their native round-trip cells.
#
# Output: /tmp/dirgha-smoke-providers-<ts>/REPORT.md
set -euo pipefail

MODE="${1:-free}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="node ${ROOT}/dist/cli/main.js"
OUT="/tmp/dirgha-smoke-providers-$(date +%s)"
mkdir -p "$OUT"
REPORT="$OUT/REPORT.md"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log() { echo "$@" | tee -a "$REPORT"; }

# Each cell: provider_id model_id required_env required_key
# free=true means the model costs $0 via OpenRouter or a native free tier.
CELLS=(
  "anthropic|anthropic/claude-haiku-4-5|ANTHROPIC_API_KEY|sk-ant-|false"
  "openai|gpt-5-mini|OPENAI_API_KEY|sk-|false"
  "gemini|google/gemini-2.0-flash-001|OPENROUTER_API_KEY|sk-or-v1-|true"
  "openrouter|inclusionai/ring-2.6-1t:free|OPENROUTER_API_KEY|sk-or-v1-|true"
  "nvidia|deepseek-ai/deepseek-v4-pro|NVIDIA_API_KEY|nvapi-|true"
  "deepseek|deepseek-chat|DEEPSEEK_API_KEY|sk-|false"
  "mistral|mistral-large-latest|MISTRAL_API_KEY|<no-prefix>|false"
  "cohere|command-r-plus|COHERE_API_KEY|<no-prefix>|false"
  "cerebras|llama3.1-70b|CEREBRAS_API_KEY|<no-prefix>|false"
  "together|deepseek-ai/DeepSeek-V3|TOGETHER_API_KEY|<no-prefix>|false"
  "perplexity|sonar-pro|PERPLEXITY_API_KEY|pplx-|false"
  "xai|grok-2-1212|XAI_API_KEY|xai-|false"
  "groq|groq/llama-3.3-70b-versatile|GROQ_API_KEY|gsk_|false"
  "zai|glm-4-9b-chat|ZAI_API_KEY|<no-prefix>|false"
  "fireworks|accounts/fireworks/models/llama-v3p2-3b-instruct|FIREWORKS_API_KEY|fw_|false"
)

if [ "$MODE" = "list" ]; then
  echo "Provider smoke matrix:"
  for cell in "${CELLS[@]}"; do
    IFS='|' read -r prov model key_env _ free <<< "$cell"
    printf "  %-15s %-55s %s\n" "$prov" "$model" "${free:+[FREE]}"
  done
  exit 0
fi

log "# Dirgha Multi-Provider Smoke Matrix"
log ""
log "**Date:** $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
log "**Mode:** $MODE"
log "**Binary:** $($BIN --version 2>&1)"
log ""

has_key() {
  local env_name="$1"
  [ -n "${!env_name:-}" ]
}

strip_prefix() {
  local key="$1"
  [ -z "${!key}" ] && echo "(missing)" || echo "${!key}" | head -c 12 | sed 's/./*/g'
}

PASS=0
FAIL=0
SKIP=0

log "| # | Provider | Model | Result | Details |"
log "|---|----------|-------|--------|---------|"

run_cell() {
  local prov="$1" model="$2" key_env="$3" key_prefix="$4" free="$5"
  local idx=$((PASS + FAIL + SKIP + 1))

  if [ "$MODE" = "free" ] && [ "$free" != "true" ]; then
    SKIP=$((SKIP + 1))
    log "| $idx | $prov | $model | SKIP | needs paid key ($key_env) |"
    echo -e "${YELLOW}  SKIP${NC}  $prov ($model) — paid tier, skipped in free mode"
    return
  fi

  if ! has_key "$key_env"; then
    SKIP=$((SKIP + 1))
    local reason="missing $key_env"
    if [ "$key_env" = "OPENROUTER_API_KEY" ]; then
      reason="no OPENROUTER_API_KEY — skipped"
    fi
    log "| $idx | $prov | $model | SKIP | $reason |"
    echo -e "${YELLOW}  SKIP${NC}  $prov — $key_env not set"
    return
  fi

  local out="$OUT/${prov}.txt"
  local start=$(date +%s)
  local rc=0

  timeout 120 env \
    DIRGHA_MODEL="$model" \
    $BIN ask \
    --max-turns 2 \
    --print \
    'say exactly OK and nothing else' \
    > "$out" 2>&1 || rc=$?

  local elapsed=$(( $(date +%s) - start ))

  if [ "$rc" -eq 0 ] && grep -q 'OK' "$out"; then
    PASS=$((PASS + 1))
    log "| $idx | $prov | $model | PASS | ${elapsed}s |"
    echo -e "${GREEN}  PASS${NC}  $prov (${elapsed}s)"
  else
    FAIL=$((FAIL + 1))
    local tail_line=$(tail -5 "$out" | tr '\n' ' ' | head -c 120)
    log "| $idx | $prov | $model | FAIL | rc=$rc — $tail_line |"
    echo -e "${RED}  FAIL${NC}  $prov (rc=$rc, ${elapsed}s)"
    echo "          last lines: $(tail -3 "$out" | tr '\n' '; ')"
  fi
}

log ""
log "## Results"
log ""

for cell in "${CELLS[@]}"; do
  IFS='|' read -r prov model key_env key_prefix free <<< "$cell"
  run_cell "$prov" "$model" "$key_env" "$key_prefix" "$free"
done

log ""
log "## Summary"
log ""
log "| Result | Count |"
log "|--------|-------|"
log "| PASS   | $PASS |"
log "| FAIL   | $FAIL |"
log "| SKIP   | $SKIP |"
log "| **Total** | $((PASS + FAIL + SKIP)) |"
log ""

echo ""
echo "══════════════════════════════════════════════════════"

if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}  PASS: $PASS providers / $FAIL failures / $SKIP skipped${NC}"
  log ""
  log "**Verdict:** ALL providers passing."
else
  echo -e "${RED}  PASS: $PASS / FAIL: $FAIL / SKIP: $SKIP${NC}"
  log ""
  log "**Verdict:** $FAIL provider(s) failed — see individual logs."
fi

echo "══════════════════════════════════════════════════════"
echo ""
echo "Full report: $REPORT"
echo "Per-provider logs: $OUT/"
echo ""

[ "$FAIL" -eq 0 ] || exit 1
