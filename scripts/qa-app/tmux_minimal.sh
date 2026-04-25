#!/usr/bin/env bash
# Minimal Ink streaming test: spawn dirgha, swap to free model, send "hi",
# observe whether streamed text appears. Snapshots every 2s for 40s.
set -euo pipefail

DIRGHA="${1:-/usr/bin/dirgha}"
SESSION="dirgha-min-$$"
LOG="/tmp/dirgha-min-tmux.log"
rm -f "$LOG"

cleanup() { tmux kill-session -t "$SESSION" 2>/dev/null || true; }
trap cleanup EXIT

tmux new-session -d -s "$SESSION" -x 140 -y 40 "$DIRGHA"
sleep 3.0

snapshot() {
  echo "===== $1 =====" >> "$LOG"
  tmux capture-pane -t "$SESSION" -p >> "$LOG"
}

snapshot "00-mounted"

# Swap model with explicit pauses so the controlled-input cycle settles.
tmux send-keys -t "$SESSION" -l "/model inclusionai/ling-2.6-1t:free"
sleep 0.5
snapshot "01-typed-/model"
tmux send-keys -t "$SESSION" Enter
sleep 1.5
snapshot "02-after-/model-enter"

# Send hi
tmux send-keys -t "$SESSION" -l "hi"
sleep 0.5
snapshot "03-typed-hi"
tmux send-keys -t "$SESSION" Enter
sleep 0.5
snapshot "04-after-hi-enter"

# Watch for 40 seconds, snapshot every 2s
for s in $(seq 5 25); do
  sleep 2
  snapshot "$(printf "%02d-t=%ds" "$s" "$((s*2 - 4))")"
done

tmux send-keys -t "$SESSION" -l "/exit"
tmux send-keys -t "$SESSION" Enter
sleep 1
snapshot "99-final"

# Surface whether streamed text appeared at any snapshot
echo "--- looking for streamed reply across snapshots ---"
if grep -qE "(?i)hello|hi there|how can i|how may" "$LOG"; then
  echo "PASS: reply found"
  grep -nE "(?i)hello|hi there|how can i|how may" "$LOG" | head -5
  exit 0
else
  echo "FAIL: no streamed reply at any snapshot"
  echo "Showing snapshot 04-after-hi-enter:"
  awk '/===== 04-after-hi-enter/,/===== 05/' "$LOG"
  echo "Showing snapshot 12-t=20s:"
  awk '/===== 12-t=20s/,/===== 13/' "$LOG"
  echo "Showing snapshot 24-t=44s:"
  awk '/===== 24-t=44s/,/===== 25/' "$LOG"
  exit 1
fi
