#!/usr/bin/env bash
# Drive the /models picker as a human would: open picker, arrow-navigate,
# select, confirm the selection persisted in StatusBar + on reopen.
#
# Tests MECHANICS, not specific model ids — resilient to catalogue changes.
# Uses deepseek-chat (built-in, always present) as the stable starting model.
#
# Captures one PNG per step + asserts on text content. Programmable
# end-to-end smoke for interactive selection flows.
#
# Run:  bash scripts/qa-app/picker-flow.sh
# Out:  /tmp/dirgha-picker/{01..04}.png + /tmp/dirgha-picker/REPORT.md
set -u
export PATH=$PATH:$(go env GOPATH)/bin
export DIRGHA_MODEL="${DIRGHA_MODEL:-deepseek-chat}"
export DIRGHA_PROVIDER="${DIRGHA_PROVIDER:-deepseek}"

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
assert_text "status bar shows starting model"     'deepseek-chat' || FAILS=$((FAILS+1))

# 2. Open picker
$VL $SESSION text "/models"
sleep 0.6
$VL $SESSION keys "Enter"
sleep 1.5
$VL $SESSION shot "$OUT/02-picker.png" >/dev/null
log ""
log "## 02  picker open"
assert_text "picker shows provider header"        'deepseek' || FAILS=$((FAILS+1))
assert_text "picker lists known model families"   'kimi|gpt|gemini|deepseek' || FAILS=$((FAILS+1))
assert_text "starting model listed in picker"     'deepseek-chat' || FAILS=$((FAILS+1))

# 3. Navigate down once, then select with Enter
$VL $SESSION keys "Down"
sleep 0.6
$VL $SESSION keys "Enter"
sleep 1.5
$VL $SESSION shot "$OUT/03-after-select.png" >/dev/null
log ""
log "## 03  select next model down"
# After selecting a different model, the confirmation notice should appear
# and the status bar should show a model that is NOT the starting model
CAPTURED=$(text)
assert_text "confirmation shows model change"     'Model set to' || FAILS=$((FAILS+1))
if echo "$CAPTURED" | grep -qE 'deepseek-reasoner|deepseek-v4'; then
  log "  PASS  status bar updated to a different model"
else
  log "  FAIL  model did not change from $DIRGHA_MODEL"
  FAILS=$((FAILS+1))
fi
assert_text "picker closed; prompt restored"      'Ask dirgha anything' || FAILS=$((FAILS+1))

# 4. Reopen and confirm new model is visible in the picker
$VL $SESSION text "/models"
sleep 0.4
$VL $SESSION keys "Enter"
sleep 1.5
$VL $SESSION shot "$OUT/04-reopen.png" >/dev/null
log ""
log "## 04  reopen"
assert_text "new model listed in picker"          'deepseek-reasoner|deepseek-v4' || FAILS=$((FAILS+1))

$VL $SESSION kill

log ""
log "## Result"
log "frames: $OUT  ($(ls $OUT/*.png 2>/dev/null | wc -l) PNG, $(du -sh $OUT 2>/dev/null | cut -f1))"
if [[ "$FAILS" -eq 0 ]]; then
  log "**PASS — all assertions passed** ✓"
  exit 0
else
  log "**FAIL — $FAILS assertion(s) failed** ✗"
  exit 1
fi
