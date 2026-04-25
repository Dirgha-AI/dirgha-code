#!/usr/bin/env bash
# Real terminal smoke test for the Ink TUI via tmux.
#
# tmux gives us a real PTY with proper raw-mode handling — the keystrokes
# we send go through the same byte path a human keyboard would, so Ink's
# setRawMode + keypress parser behaves identically. This is the test
# pexpect couldn't reliably do.
#
# Usage:
#   bash scripts/qa-app/tmux_smoke.sh           # interactive smoke
#   bash scripts/qa-app/tmux_smoke.sh /path/to/dirgha  # alt binary
set -euo pipefail

DIRGHA="${1:-/usr/bin/dirgha}"
SESSION="dirgha-smoke-$$"
LOG="/tmp/dirgha-tmux.log"
rm -f "$LOG"

cleanup() {
  tmux kill-session -t "$SESSION" 2>/dev/null || true
}
trap cleanup EXIT

# 40x140 terminal — wide enough for the Ink boxes
tmux new-session -d -s "$SESSION" -x 140 -y 40 "$DIRGHA"
echo "→ session up; waiting 2.5s for Ink to mount"
sleep 2.5

capture() {
  tmux capture-pane -t "$SESSION" -p
}

snapshot() {
  echo
  echo "=========== SNAPSHOT: $1 ==========="
  capture | tee -a "$LOG"
  echo
}

snapshot "after-mount"

# 1. /help
echo "→ /help"
tmux send-keys -t "$SESSION" -l "/help"; tmux send-keys -t "$SESSION" Enter
sleep 1.8
snapshot "after-/help"

tmux send-keys -t "$SESSION" Escape
sleep 0.8

# 2. swap to a free model
echo "→ /model"
tmux send-keys -t "$SESSION" -l "/model inclusionai/ling-2.6-1t:free"; tmux send-keys -t "$SESSION" Enter
sleep 1.8
snapshot "after-/model"

# 3. real prompt
echo "→ hi"
tmux send-keys -t "$SESSION" -l "hi"; tmux send-keys -t "$SESSION" Enter
echo "→ wait up to 60s for streamed reply…"
for s in $(seq 1 60); do
  sleep 1
  pane=$(capture)
  # Take periodic snapshots so we can see how the screen evolves.
  if [ $((s % 5)) -eq 0 ]; then
    echo "  …t=${s}s"
    echo "----- mid-turn pane @ t=${s}s -----" >> "$LOG"
    echo "$pane" >> "$LOG"
  fi
  if echo "$pane" | grep -qiE "hello|hey|how can i|how may"; then
    echo "  reply detected at t=${s}s"
    break
  fi
done
snapshot "after-hi"

# 4. exit
tmux send-keys -t "$SESSION" -l "/exit"; tmux send-keys -t "$SESSION" Enter
sleep 1
snapshot "after-/exit"

echo
echo "=========== ASSERTIONS ==========="
# Stitch line-wrapping out of the log so substrings that the pane wraps
# across two lines still match (e.g. "Model set to inclusionai/ling-…\nfree").
final="$(tr -d '\n' < "$LOG")"
multi="$(cat "$LOG")"
pass=0; fail=0
check() {
  local label="$1"; local matched="$2"
  if [ "$matched" = "yes" ]; then
    echo "  ✓ $label"
    pass=$((pass+1))
  else
    echo "  ✗ $label"
    fail=$((fail+1))
  fi
}

# title not stale
if echo "$multi" | grep -q "v0\.2\.0"; then check "title not stale 0.2.0" "no"; else check "title not stale 0.2.0" "yes"; fi
# /help overlay shows slash names (Keyboard label is reliable in the unwrapped multi-line pane)
if echo "$multi" | grep -qE "Keyboard|type to filter"; then check "/help overlay rendered" "yes"; else check "/help overlay rendered" "no"; fi
# model swap notice — use stitched-line grep
if echo "$final" | grep -qE "Model set to inclusionai/ling-2\.6-1t:?free"; then check "/model swap notice appeared" "yes"; else check "/model swap notice appeared" "no"; fi
# agent reply (LLM is non-deterministic — match any greeting-shaped token)
if echo "$multi" | grep -qiE "hello|hey|how can i|how may|hi there"; then check "agent streamed a reply" "yes"; else check "agent streamed a reply" "no"; fi
# no errors
if echo "$multi" | grep -qE "TypeError|ReferenceError|Unhandled|Cannot read"; then check "no React/runtime errors" "no"; else check "no React/runtime errors" "yes"; fi

echo
total=$((pass + fail))
if [ "$fail" -eq 0 ]; then
  echo "PASS — $pass/$total"
  exit 0
else
  echo "FAIL — $pass/$total (full log: $LOG)"
  exit 1
fi
