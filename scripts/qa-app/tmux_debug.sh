#!/usr/bin/env bash
# Debug-mode minimal test: capture stderr to see [evproj] events.
set -euo pipefail
DIRGHA="/usr/bin/dirgha"
SESSION="dirgha-dbg-$$"
LOG="/tmp/dirgha-dbg-tmux.log"
ERR="/tmp/dirgha-dbg-stderr.log"
rm -f "$LOG" "$ERR"
cleanup() { tmux kill-session -t "$SESSION" 2>/dev/null || true; }
trap cleanup EXIT

# Redirect dirgha's stderr to a file so we can see [evproj] lines.
tmux new-session -d -s "$SESSION" -x 140 -y 40 "DIRGHA_DEBUG_EVENTS=1 $DIRGHA 2>$ERR"
sleep 3
tmux send-keys -t "$SESSION" -l "/model inclusionai/ling-2.6-1t:free"
tmux send-keys -t "$SESSION" Enter
sleep 1.5
tmux send-keys -t "$SESSION" -l "hi"
tmux send-keys -t "$SESSION" Enter
sleep 30
tmux capture-pane -t "$SESSION" -p > "$LOG"
tmux send-keys -t "$SESSION" -l "/exit"
tmux send-keys -t "$SESSION" Enter
sleep 1

echo "===== final pane ====="
tail -20 "$LOG"
echo
echo "===== [evproj] events captured ====="
grep -c "^\[evproj\]" "$ERR" || echo "(none)"
echo "first 30:"
grep "^\[evproj\]" "$ERR" | head -30 || true
echo "..."
echo "last 10:"
grep "^\[evproj\]" "$ERR" | tail -10 || true
echo
echo "(full stderr: $ERR)"
