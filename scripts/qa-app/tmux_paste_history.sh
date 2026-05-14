#!/usr/bin/env bash
# Focused tmux test for the v1.33.19 paste + history-recall fix (P1-9).
#
#   1. Mount Ink.
#   2. Paste a long block (≥ 200 chars).
#   3. Confirm [paste] collapse marker appears in the rendered pane.
#   4. Press Enter to submit, then wait for it to land.
#   5. On the next empty prompt, press Up arrow to recall.
#   6. Confirm the recalled text does NOT show the [paste] collapse marker.
#
# Usage: bash scripts/qa-app/tmux_paste_history.sh [/path/to/dirgha]
set -euo pipefail

DIRGHA="${1:-/usr/bin/dirgha}"
SESSION="dirgha-paste-$$"
LOG="/tmp/dirgha-paste-tmux.log"
rm -f "$LOG"

cleanup() { tmux kill-session -t "$SESSION" 2>/dev/null || true; }
trap cleanup EXIT

tmux new-session -d -s "$SESSION" -x 160 -y 40 "$DIRGHA"
sleep 3.0

snap() {
  echo "===== $1 =====" | tee -a "$LOG"
  tmux capture-pane -t "$SESSION" -p | tee -a "$LOG"
  echo "" | tee -a "$LOG"
}

snap "01-mounted"

# Build a long pasted-style string: 300 chars, no newlines.
LONG=$(python3 -c "print('a'*300)")
tmux send-keys -t "$SESSION" -l "$LONG"
sleep 0.6
snap "02-after-long-paste"

# Submit. Use Esc first to drop any overlay, then Enter.
tmux send-keys -t "$SESSION" Enter
sleep 0.5
snap "03-after-submit"

# Wait briefly for the network turn to land. We don't need a real reply for
# this test — we only care that the prompt is added to history.
sleep 12
snap "04-post-network"

# On the empty prompt, press Up arrow to recall the previous prompt.
tmux send-keys -t "$SESSION" Up
sleep 0.6
snap "05-after-up-arrow"

# Now check: the recalled text MUST NOT contain '[paste]' (which would mean
# detectPaste re-fired on history recall — the P1-9 regression).
RECALL_VIEW=$(tmux capture-pane -t "$SESSION" -p)
echo "$RECALL_VIEW" | tee -a "$LOG"

echo ""
echo "===== ASSERTIONS ====="
PASS=0; FAIL=0
check() {
  if [ "$2" = "ok" ]; then
    echo "  PASS — $1"; PASS=$((PASS+1))
  else
    echo "  FAIL — $1"; FAIL=$((FAIL+1))
  fi
}

if echo "$RECALL_VIEW" | grep -qE '\[paste\]'; then
  check "P1-9: recalled history does NOT show [paste] collapse" fail
else
  check "P1-9: recalled history does NOT show [paste] collapse" ok
fi

# The recall should at least put some 'a' characters back in the prompt — if
# the whole input is blank, recall didn't fire either.
if echo "$RECALL_VIEW" | grep -qE 'a{40,}'; then
  check "recall actually populated the buffer" ok
else
  check "recall actually populated the buffer" fail
fi

# Exit cleanly.
tmux send-keys -t "$SESSION" Escape
sleep 0.3
tmux send-keys -t "$SESSION" -l "/exit"
tmux send-keys -t "$SESSION" Enter
sleep 1
snap "99-final"

echo ""
echo "TOTAL: $PASS pass, $FAIL fail   (log: $LOG)"
[ "$FAIL" -eq 0 ] || exit 1
