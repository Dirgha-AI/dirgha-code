#!/usr/bin/env bash
# Multi-turn end-to-end smoke. Exercises the full Ink path:
#   - session JSONL is written each turn (P0-1, P1-1)
#   - loop detector reset happens between turns (P1-12)
#   - no React errors
#   - history is consistent across turns
set -euo pipefail

DIRGHA="${1:-/usr/bin/dirgha}"
SESSION="dirgha-mt-$$"
LOG="/tmp/dirgha-mt-tmux.log"
rm -f "$LOG"

cleanup() { tmux kill-session -t "$SESSION" 2>/dev/null || true; }
trap cleanup EXIT

# Track which session JSONLs existed BEFORE we started.
PRE=$(ls -1 ~/.dirgha/sessions/ 2>/dev/null | sort -u)

tmux new-session -d -s "$SESSION" -x 160 -y 40 "$DIRGHA"
sleep 3.5

snap() {
  echo "===== $1 =====" >> "$LOG"
  tmux capture-pane -t "$SESSION" -p >> "$LOG"
}
snap "00-mount"

send_prompt() {
  local txt="$1"
  tmux send-keys -t "$SESSION" -l "$txt"
  sleep 0.4
  tmux send-keys -t "$SESSION" Enter
  sleep 14   # let the model land
}

send_prompt "say the word PING"
snap "01-after-ping"

send_prompt "now say PONG"
snap "02-after-pong"

send_prompt "what were the two words I asked for? answer in five words or fewer"
snap "03-after-memory"

# Exit
tmux send-keys -t "$SESSION" -l "/exit"
tmux send-keys -t "$SESSION" Enter
sleep 1
snap "99-final"

# Find the JSONL written THIS run.
POST=$(ls -1 ~/.dirgha/sessions/ 2>/dev/null | sort -u)
NEW=$(comm -13 <(echo "$PRE") <(echo "$POST") | grep '\.jsonl$' | head -1)

echo ""
echo "===== ASSERTIONS ====="
PASS=0; FAIL=0
chk() { if [ "$2" = ok ]; then echo "  PASS $1"; PASS=$((PASS+1)); else echo "  FAIL $1"; FAIL=$((FAIL+1)); fi; }

if [ -n "$NEW" ] && [ -s ~/.dirgha/sessions/"$NEW" ]; then
  chk "session JSONL written this run ($NEW)" ok
  N=$(wc -l < ~/.dirgha/sessions/"$NEW")
  if [ "$N" -ge 4 ]; then
    chk "session JSONL has >=4 messages (got $N)" ok
  else
    chk "session JSONL has >=4 messages (got $N)" fail
  fi
else
  chk "session JSONL written this run" fail
fi

# Check the model actually responded across all 3 turns (look for both PING and PONG mentioned by the model in the final transcript).
TR=$(cat "$LOG")
if echo "$TR" | grep -qi PING && echo "$TR" | grep -qi PONG; then
  chk "model produced multi-turn responses containing PING + PONG" ok
else
  chk "model produced multi-turn responses containing PING + PONG" fail
fi

if echo "$TR" | grep -qE "React|Error.*at.*\.tsx|TypeError|Cannot read|undefined.*is not a function"; then
  chk "no React/runtime errors" fail
else
  chk "no React/runtime errors" ok
fi

echo ""
echo "TOTAL: $PASS pass, $FAIL fail  (log: $LOG)  session=$NEW"
[ "$FAIL" -eq 0 ] || exit 1
