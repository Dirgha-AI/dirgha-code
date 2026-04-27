#!/usr/bin/env bash
# Drive the /models picker as a human would: open picker, arrow-navigate,
# select, confirm the selection persisted in StatusBar + on reopen.
#
# Captures one PNG per step + asserts on text content. Programmable
# end-to-end smoke for interactive selection flows.
#
# Run:  bash scripts/qa-app/picker-flow.sh
# Out:  /tmp/dirgha-picker/{01..05}.png + /tmp/dirgha-picker/REPORT.md
set -u
export PATH=$PATH:$(go env GOPATH)/bin
export DIRGHA_MODEL="${DIRGHA_MODEL:-tencent/hy3-preview:free}"
export DIRGHA_PROVIDER="${DIRGHA_PROVIDER:-openrouter}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VL="$ROOT/scripts/vision-loop.sh"
OUT="/tmp/dirgha-picker"
SESSION="picker"
mkdir -p "$OUT"
REPORT="$OUT/REPORT.md"
: > "$REPORT"

log()  { echo "$@" | tee -a "$REPORT"; }
text() { tmux capture-pane -t "$SESSION" -p; }

assert_text() {
  local name="$1" pattern="$2"
  local body
  body=$(text)
  if echo "$body" | grep -qE "$pattern"; then
    log "  PASS  $name"
    return 0
  else
    log "  FAIL  $name (no /$pattern/)"
    log '\`\`\`'
    echo "$body" | head -30 >> "$REPORT"
    log '\`\`\`'
    return 1
  fi
}

log "# Picker flow smoke — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "binary: $(which dirgha)  ($(dirgha --version))"
log "starting model: \`$DIRGHA_MODEL\`"
log ""

FAILS=0

# 1. Boot
$VL $SESSION kill 2>/dev/null
$VL $SESSION start
sleep 2
$VL $SESSION shot "$OUT/01-splash.png" >/dev/null
log "## 01  splash"
assert_text "splash shows version banner"         'Dirgha Code|v1\.[0-9]' || FAILS=$((FAILS+1))
assert_text "status bar shows current model"      'hy3-preview:free' || FAILS=$((FAILS+1))

# 2. Open picker
$VL $SESSION text "/models"
sleep 0.6
$VL $SESSION keys "Enter"
sleep 1.5
$VL $SESSION shot "$OUT/02-picker.png" >/dev/null
log ""
log "## 02  picker open"
assert_text "picker shows openrouter header"      'openrouter' || FAILS=$((FAILS+1))
assert_text "picker shows known models"           'kimi|gpt|gemini|deepseek' || FAILS=$((FAILS+1))
assert_text "current model marked with cursor"    '> +tencent/hy3-preview:free' || FAILS=$((FAILS+1))

# 3. Arrow Down 5
for i in 1 2 3 4 5; do
  $VL $SESSION keys "Down"
  sleep 0.15
done
sleep 0.6
$VL $SESSION shot "$OUT/03-down-5.png" >/dev/null
log ""
log "## 03  down x5"
assert_text "cursor moved off hy3"                '> +z-ai/glm-4\.5-air:free' || FAILS=$((FAILS+1))

# 4. Select with Enter
$VL $SESSION keys "Enter"
sleep 1.5
$VL $SESSION shot "$OUT/04-after-select.png" >/dev/null
log ""
log "## 04  Enter to select"
assert_text "confirmation message"                'Model set to z-ai/glm-4\.5-air:free' || FAILS=$((FAILS+1))
assert_text "status bar updated"                  'glm-4\.5-air:free' || FAILS=$((FAILS+1))
assert_text "picker closed; prompt restored"      'Ask dirgha anything' || FAILS=$((FAILS+1))

# 5. Reopen and confirm new model is the cursor target
$VL $SESSION text "/models"
sleep 0.4
$VL $SESSION keys "Enter"
sleep 1.5
$VL $SESSION shot "$OUT/05-reopen.png" >/dev/null
log ""
log "## 05  reopen"
assert_text "new selection is cursor target"      '> +z-ai/glm-4\.5-air:free' || FAILS=$((FAILS+1))

$VL $SESSION kill

log ""
log "## Result"
log "frames: $OUT  ($(ls $OUT/*.png 2>/dev/null | wc -l) PNG, $(du -sh $OUT 2>/dev/null | cut -f1))"
if [[ "$FAILS" -eq 0 ]]; then
  log "**PASS — 10/10 assertions** ✓"
  exit 0
else
  log "**FAIL — $FAILS of 10 assertions failed** ✗"
  exit 1
fi
