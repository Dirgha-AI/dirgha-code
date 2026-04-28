#!/usr/bin/env bash
# Smoke matrix runner. Drives dirgha through every slash command via tmux
# + freeze, and shells every non-interactive subcommand. Writes one frame
# (or stdout dump) per cell and a per-cell PASS/FAIL line to a report.
#
# Usage: smoke-matrix.sh [tier1|all]
set -u
TIER="${1:-tier1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VL="$ROOT/scripts/vision-loop.sh"
OUT="/tmp/dirgha-smoke-$(date +%s)"
mkdir -p "$OUT"
REPORT="$OUT/REPORT.md"
SESSION="smoke"

export PATH=$PATH:$(go env GOPATH)/bin
# Pin every smoke run to hy3-free via openrouter — zero quota burn
export DIRGHA_MODEL="tencent/hy3-preview:free"
export DIRGHA_PROVIDER="openrouter"
[[ -z "${OPENROUTER_API_KEY:-}" ]] && export OPENROUTER_API_KEY="$(grep -E '^OPENROUTER_API_KEY' ~/.dirgha/.env 2>/dev/null | cut -d= -f2- | tr -d '\"')"

log() { echo "$@" | tee -a "$REPORT"; }
log "# Dirgha smoke matrix — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "binary: $(which dirgha)  ($(dirgha --version 2>&1))"
log "frames: $OUT"
log ""

# ---------- non-interactive subcommands ----------
log "## Non-interactive subcommands"
log ""
sub_smoke() {
  local name="$1" cmd="$2" expect_re="$3"
  local out="$OUT/sub_${name// /_}.txt"
  log -n "- \`$cmd\` … "
  bash -c "$cmd" > "$out" 2>&1 &
  local pid=$!
  ( sleep 25; kill -9 $pid 2>/dev/null ) & local timer=$!
  wait $pid 2>/dev/null
  local rc=$?
  kill -9 $timer 2>/dev/null
  if grep -qE "$expect_re" "$out"; then
    log "PASS (rc=$rc) → $(basename $out)"
  else
    log "FAIL (rc=$rc, no /$expect_re/) → $(basename $out)"
  fi
}

sub_smoke "doctor"     "dirgha doctor"                        "Node|Provider|API|env"
sub_smoke "status"     "dirgha status"                        "model|account|provider|session"
sub_smoke "modelsList" "dirgha models list"                   "kimi|gpt|deepseek|gemini"
sub_smoke "help"       "dirgha --help"                        "Subcommands|Interactive|REPL"
sub_smoke "fleetHelp"  "dirgha fleet --help 2>&1 || dirgha fleet" "fleet|launch|list|worktree"

# ---------- interactive slash commands (vision loop) ----------
log ""
log "## Interactive slash commands (frame-captured)"
log ""

slash_smoke() {
  local name="$1" keys="$2" wait_ms="$3" expect_text="$4"
  local frame="$OUT/slash_${name//\//}.png"
  local txt="$OUT/slash_${name//\//}.txt"
  local body="$OUT/slash_${name//\//}.body.txt"
  log -n "- \`$name\` … "

  $VL $SESSION kill 2>/dev/null
  $VL $SESSION start
  sleep 1.8
  for k in $keys; do
    if [[ "$k" == ENTER ]]; then
      $VL $SESSION keys "Enter"
      sleep 0.7
    elif [[ "$k" == ESC ]]; then
      $VL $SESSION keys "Escape"
      sleep 0.4
    else
      $VL $SESSION text "$k"
      sleep 0.6
    fi
  done
  $VL $SESSION wait "$wait_ms"
  tmux capture-pane -t $SESSION -p > "$txt" 2>&1
  # Strip banner (lines 1-9: dirgha ASCII art + "Dirgha Code v1.7.6") so regex
  # actually evaluates command output, not the always-present splash
  tail -n +10 "$txt" > "$body"
  $VL $SESSION shot "$frame" >/dev/null
  $VL $SESSION kill

  if grep -qE "$expect_text" "$body"; then
    log "PASS → $(basename $frame)"
  else
    log "FAIL (no /$expect_text/ in body) → $(basename $frame), $(basename $body)"
  fi
}

# tier1 = the 10 picker-visible commands
slash_smoke "/help"     "/help ENTER"     3500 "slash command|/init|/models|↑↓|filter|Keyboard|help"
slash_smoke "/init"     "/init ENTER"     3500 "Wrote|already exists|DIRGHA\.md"
slash_smoke "/keys"     "/keys ENTER"     3500 "BYOK|key|provider|nvidia|openai"
slash_smoke "/models"   "/models ENTER"   2000 "kimi|gpt|deepseek|moonshot"
slash_smoke "/clear"    "/clear ENTER"    1000 "Ask dirgha|cleared|"
slash_smoke "/login"    "/login ENTER"    6000 "device|code|browser|sign|already|Visit|enter|Login |failed|HTTP|Open"
slash_smoke "/setup"    "/setup ENTER"    3500 "provider|key|wizard|setup"
slash_smoke "/status"   "/status ENTER"   3500 "model|session|provider|account"
slash_smoke "/memory"   "/memory ENTER"   3500 "memory|/.dirgha|file|empty"
slash_smoke "/compact"  "/compact ENTER"  3500 "compact|nothing|summari|0 turns"
slash_smoke "/update"   "/update ENTER"   5000 "@dirgha/code|up to date|newer available|registry|update check"

if [[ "$TIER" == "all" ]]; then
  # /mode toggles ACT↔PLAN inline (hardcoded branch in App.tsx)
  slash_smoke "/mode"    "/mode ENTER"    3500 "Mode:|ACT|PLAN"
  # /theme opens picker overlay
  slash_smoke "/theme"   "/theme ENTER"   3500 "theme|Theme|palette|dark|cabinet|theme picker|↑↓|███"
  # /resume — usage hint + session list (we have ~350 sessions)
  # 350 sessions overflow the pane — header off-screen — match UUID-shape lines
  slash_smoke "/resume"  "/resume ENTER"  3500 "Available sessions|Usage: /resume|no saved sessions|[a-f0-9]{8}-[a-f0-9]{4}"
  # /config defaults to 'show' which dumps DIRGHA.md
  slash_smoke "/config"  "/config ENTER"  3500 "DIRGHA|Conventions|No DIRGHA.md|first line"
  # /account — needs auth; without token returns "Not signed in"
  slash_smoke "/account" "/account ENTER" 3500 "Not signed in|Account|tier|balance|free|pro"
  # /upgrade — without token returns sign-in prompt + upgrade URL
  slash_smoke "/upgrade" "/upgrade ENTER" 3500 "Not signed in|Upgrade:|http|dirgha\\.ai"
  # /session — defaults to list — same content as /resume essentially
  slash_smoke "/session" "/session ENTER" 3500 "Available|saved|sessions|session|Usage|-\\s[a-f0-9]"
  # /history — empty session has 0 prompts
  slash_smoke "/history" "/history ENTER" 3500 "no prompts|no session|Last \\d+ prompts"
  # /fleet — root command should print usage when no args
  slash_smoke "/fleet"   "/fleet ENTER"   3500 "fleet|launch|list|worktree|Usage|status"
fi

log ""
log "## Done"
log "Frames + transcripts: $OUT"
echo ""
echo "==================================================="
echo "REPORT: $REPORT"
echo "==================================================="
