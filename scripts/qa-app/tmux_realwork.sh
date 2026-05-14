#!/usr/bin/env bash
# 10-15 turn real-work tmux test for the rebuilt dirgha CLI.
#
# Pretends to be a human asking the agent to audit a real codebase
# (the dirgha-ai monorepo) and plan phase 1 of a product launch.
# Captures every snapshot, the session JSONL, flicker timing,
# and the final tool-call count.
#
# Usage:  bash scripts/qa-app/tmux_realwork.sh [/path/to/dirgha] [model]
set -euo pipefail

DIRGHA="${1:-/usr/bin/dirgha}"
MODEL="${2:-deepseek-v4-flash}"
SESSION="dirgha-rw-$$"
LOG="/tmp/dirgha-realwork.log"
SNAP_DIR="/tmp/dirgha-realwork-snaps"
rm -rf "$LOG" "$SNAP_DIR"
mkdir -p "$SNAP_DIR"

cleanup() { tmux kill-session -t "$SESSION" 2>/dev/null || true; }
trap cleanup EXIT

# Track which session JSONLs existed BEFORE we started.
PRE=$(ls -1 ~/.dirgha/sessions/ 2>/dev/null | sort -u)

tmux new-session -d -s "$SESSION" -x 180 -y 50 "$DIRGHA"
sleep 4.0

snap() {
  local label="$1"
  local path="$SNAP_DIR/$(printf '%02d' $SNAP_N)-$label.txt"
  tmux capture-pane -t "$SESSION" -p > "$path"
  echo "===== $label =====" >> "$LOG"
  cat "$path" >> "$LOG"
  echo "" >> "$LOG"
  SNAP_N=$((SNAP_N+1))
}

SNAP_N=0
snap "00-mount"

# Switch to v4-flash explicitly.
tmux send-keys -t "$SESSION" -l "/model $MODEL"
sleep 0.4
tmux send-keys -t "$SESSION" Enter
sleep 1.5
snap "01-model-switched"

send_prompt() {
  local label="$1"
  local txt="$2"
  local wait_sec="${3:-45}"
  echo "→ TURN: $label" | tee -a "$LOG"
  tmux send-keys -t "$SESSION" -l "$txt"
  sleep 0.4
  tmux send-keys -t "$SESSION" Enter
  sleep "$wait_sec"
  snap "$label"
}

# 14 prompts of real work
send_prompt "T01-read-handoff" \
  "Read /root/dirgha-ai/docs/audit/2026-05-14/HANDOFF.md and tell me in three sentences what Phase 1 of the launch should ship." 50

send_prompt "T02-list-domains" \
  "List the top-level directories inside /root/dirgha-ai/domains using ls. Which ones are likely the login, chat, writer, and marketplace apps?" 40

send_prompt "T03-find-login-ui" \
  "Find the login page component in the dirgha-ai repo. Use a single grep or find command. Just tell me the path." 45

send_prompt "T04-read-login" \
  "Read the first 60 lines of that login component and tell me what backend endpoint it POSTs to on submit." 50

send_prompt "T05-find-chat-entry" \
  "Where does the chat UI live in dirgha-ai? Find a chat component or page file. Just give me the path." 40

send_prompt "T06-find-writer" \
  "Where is the writer module entry? Look under /root/dirgha-ai/domains. Give me one path." 40

send_prompt "T07-find-bucky" \
  "Where is the bucky marketplace UI? Look for a bucky directory or file. Give me one path." 40

send_prompt "T08-prod-readiness" \
  "Read the first 80 lines of /root/dirgha-ai/docs/audit/2026-05-14/PRODUCTION-READINESS.md and tell me the top 3 blockers." 60

send_prompt "T09-git-recent" \
  "Run git log -5 --oneline inside /root/dirgha-ai and tell me what was shipped most recently." 40

send_prompt "T10-gateway-routes" \
  "Find the gateway routes file in dirgha-ai (look for an index.ts under gateway or apps/agent-os). Just one path." 45

send_prompt "T11-summarize-state" \
  "Based on what you've read, summarize the current state of login, chat, writer, and bucky in five short bullets." 60

send_prompt "T12-blockers" \
  "Now list the top 5 blockers to shipping Phase 1 launch this week. Be specific — name file paths or modules where useful." 60

send_prompt "T13-exec-action" \
  "Pick the single highest-leverage fix from your blocker list. State the file path and the exact change in one paragraph." 60

send_prompt "T14-handoff" \
  "Write a 5-sentence handoff for tomorrow morning. What is done, what is next, what is risky." 50

# Exit cleanly.
tmux send-keys -t "$SESSION" -l "/exit"
tmux send-keys -t "$SESSION" Enter
sleep 1.5
snap "99-final"

# Find session JSONL written this run.
POST=$(ls -1 ~/.dirgha/sessions/ 2>/dev/null | sort -u)
NEW=$(comm -13 <(echo "$PRE") <(echo "$POST") | grep '\.jsonl$' | xargs -I{} stat -c "%Y {}" ~/.dirgha/sessions/{} 2>/dev/null | sort -rn | head -1 | awk '{print $2}')
NEW_BASENAME=$(basename "$NEW" 2>/dev/null || true)

echo ""
echo "===== ASSERTIONS ====="
PASS=0; FAIL=0
chk() { if [ "$2" = ok ]; then echo "  PASS $1"; PASS=$((PASS+1)); else echo "  FAIL $1"; FAIL=$((FAIL+1)); fi; }

# Session JSONL was created and contains messages
if [ -n "$NEW" ] && [ -s "$NEW" ]; then
  chk "session JSONL written ($NEW_BASENAME)" ok
  N=$(wc -l < "$NEW")
  chk "session JSONL has ≥ 14 entries (got $N)" $([ "$N" -ge 14 ] && echo ok || echo fail)
else
  chk "session JSONL written" fail
fi

# Tool calls landed
TOOL_CALLS=$(grep -cE '"name":"(read_file|shell|bash|fs_read|fs_list|glob|grep|git|edit)"' "$NEW" 2>/dev/null || echo 0)
chk "≥ 5 tool calls observed (got $TOOL_CALLS)" $([ "$TOOL_CALLS" -ge 5 ] && echo ok || echo fail)

# No runtime errors
if grep -qE "React|TypeError|Cannot read|undefined is not a function|stack trace" "$LOG"; then
  chk "no React/runtime errors" fail
else
  chk "no React/runtime errors" ok
fi

# Flicker: count snapshots that differ by huge chunks (≥80% bytes diff between consecutive snapshots) — those suggest re-render flicker.
# Simple heuristic: line-count delta > 50% triggers concern.
FLICKERS=0
PREV_LINES=0
for f in "$SNAP_DIR"/*.txt; do
  L=$(wc -l < "$f")
  if [ "$PREV_LINES" -gt 5 ]; then
    DELTA=$(( L - PREV_LINES ))
    AD=${DELTA#-}
    HALF=$(( PREV_LINES / 2 ))
    if [ "$AD" -gt "$HALF" ] && [ "$AD" -gt 8 ]; then
      FLICKERS=$((FLICKERS + 1))
    fi
  fi
  PREV_LINES=$L
done
chk "flicker count ≤ 4 across snapshots (got $FLICKERS)" $([ "$FLICKERS" -le 4 ] && echo ok || echo fail)

echo ""
echo "Snapshots: $SNAP_N saved to $SNAP_DIR"
echo "Session:   $NEW"
echo "TOTAL: $PASS pass, $FAIL fail   (full log: $LOG)"
[ "$FAIL" -eq 0 ] || exit 1
