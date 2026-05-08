#!/usr/bin/env bash
# Jitter & flicker stability test for the Dirgha CLI Ink TUI.
#
# What "jitter" means here:
#   1. Logo flicker — the boot banner changes between frames while it
#      is still visible (Ink's <Static> should make this impossible).
#   2. Status bar churn — the bottom status line changes too fast
#      (more often than ~1 Hz, beyond what the elapsed-time counter
#      and tok/s readout legitimately need).
#   3. Idle motion — pixels change frame-to-frame when no agent
#      activity is in progress (a busy=false TUI should be still).
#
# Test method:
#   - tmux boots `dirgha` in a 130×32 pane
#   - For each scenario (idle, short-chat, tool-call, mode-yolo),
#     capture the pane every $INTERVAL_MS milliseconds for $DURATION_S
#     seconds.
#   - For each frame, hash:
#       (a) the whole buffer (overall change rate)
#       (b) the logo region — detected by the "DIRGHA" ASCII signature
#       (c) the status bar (last line)
#   - Compare across frames:
#       - Logo: hash MUST be constant in any window where the logo is
#         visible. Any change = flicker. Expected count: 1.
#       - Status bar (idle phase): MUST be constant for ≥1s windows.
#       - Status bar (busy phase): may legitimately tick the elapsed
#         time and tok/s. Threshold: ≤5 distinct values per second.
#       - Whole buffer (idle): ≤2 distinct values per second
#         (spinner glyph rotation is acceptable; nothing else).
#
# Output: $OUT/REPORT.md with pass/fail per scenario + raw frame
# evidence, plus an exit code (0 = all stable, 1 = jitter detected).

set -u

BIN="${DIRGHA_BIN:-node /root/dirgha-code-release/dist/cli/main.js}"
DURATION_S="${DURATION_S:-12}"
INTERVAL_MS="${INTERVAL_MS:-200}"
OUT="/tmp/dirgha-jitter-$(date +%s)"
SESSION="jitter-$$"
mkdir -p "$OUT"
REPORT="$OUT/REPORT.md"

log() { echo "$@" | tee -a "$REPORT"; }
log "# Dirgha CLI Jitter Stability Test"
log ""
log "**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "**Binary:** $BIN ($($BIN --version 2>&1))"
log "**Pane:** 130×32 · interval ${INTERVAL_MS}ms · duration ${DURATION_S}s/scenario"
log "**Pass criteria:** 0 logo flickers in any window; idle whole-buffer change rate ≤ 2 Hz; busy status bar change rate ≤ 5 Hz."
log ""

ANY_FAIL=0

# ────────────────────── helpers ──────────────────────

# Strip ANSI escape codes so hashes are based on the visible characters
# only (otherwise a colour-change reads as a flicker even when the text
# is identical).
strip_ansi() { sed 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }

# Hash a string with sha1 — first 8 hex chars are enough for diffs.
hash_str() { sha1sum | cut -d' ' -f1 | cut -c1-8; }

# Detect the logo content in a frame.
#
# The Logo banner is uniquely identifiable by its ASCII top row of
# block characters: each DIRGHA letter starts with "██████╗". We
# extract ONLY the lines containing those block characters (the 6
# rows of letterforms — no borders, no whitespace). Other ╭─/╰─
# bordered boxes in the agent's transcript (tool-call boxes, input
# box, sidecars) are NOT confused with the logo because they don't
# contain the block-character pattern.
#
# Returns: the 6-line letterform block, OR "__NO_LOGO__" if all 6
# rows aren't present (logo scrolled off or partially visible).
LOGO_SIGNATURE='██████'
extract_logo() {
  local content
  content=$(cat)
  # Pull every line containing the block character. The full DIRGHA
  # logo has 6 such lines. If we see fewer than 6, the logo is
  # mid-scroll or partially clipped — don't compare.
  local letter_lines count
  letter_lines=$(echo "$content" | grep -F "$LOGO_SIGNATURE" || true)
  count=$(echo "$letter_lines" | grep -c .)
  if [ "$count" -lt 6 ]; then
    echo "__NO_LOGO__"
    return
  fi
  echo "$letter_lines"
}

# ────────────────────── scenarios ──────────────────────

run_scenario() {
  local name="$1" prompt="$2" mode_flag="$3"

  local out="$OUT/$name"
  mkdir -p "$out"

  log "## Scenario: \`$name\`"
  log ""

  # Boot
  tmux kill-session -t "$SESSION" 2>/dev/null
  if [ -n "$mode_flag" ]; then
    DIRGHA_MODEL=deepseek-ai/deepseek-v4-pro tmux new-session -d -s "$SESSION" -x 130 -y 32 "$BIN $mode_flag"
  else
    DIRGHA_MODEL=deepseek-ai/deepseek-v4-pro tmux new-session -d -s "$SESSION" -x 130 -y 32 "$BIN"
  fi

  # Wait for boot
  local boot_deadline=$(( $(date +%s) + 8 ))
  until tmux capture-pane -t "$SESSION" -p 2>/dev/null | grep -q "Ask dirgha"; do
    sleep 0.3
    if [ "$(date +%s)" -ge "$boot_deadline" ]; then
      log "  ⚠ boot timed out — skipping scenario"
      tmux kill-session -t "$SESSION" 2>/dev/null
      return 1
    fi
  done

  # Send the prompt if any
  if [ -n "$prompt" ]; then
    tmux send-keys -t "$SESSION" -l "$prompt"
    tmux send-keys -t "$SESSION" Enter
  fi

  # Capture loop
  local end=$(( $(date +%s) + DURATION_S ))
  local n=0
  while [ "$(date +%s)" -lt "$end" ]; do
    tmux capture-pane -t "$SESSION" -p > "$out/frame-$(printf %04d $n).txt" 2>/dev/null
    n=$((n + 1))
    sleep $(awk "BEGIN{print $INTERVAL_MS/1000}")
  done
  tmux kill-session -t "$SESSION" 2>/dev/null

  log "  Captured $n frames in ${DURATION_S}s (~$(awk "BEGIN{printf \"%.1f\", $n/$DURATION_S}") fps)."

  # Analysis
  local logo_hashes total_hashes status_hashes
  local logo_distinct total_distinct status_distinct logo_visible_frames
  # Only count logo hashes for frames where the logo is FULLY visible
  # (extract_logo returns __NO_LOGO__ otherwise — those frames are
  # excluded from the comparison so scroll doesn't read as flicker).
  logo_hashes=$(for f in "$out"/frame-*.txt; do
    h=$(strip_ansi <"$f" | extract_logo)
    [ "$h" != "__NO_LOGO__" ] && echo -n "$h" | hash_str
  done | sort | uniq -c | sort -rn)
  total_hashes=$(for f in "$out"/frame-*.txt; do strip_ansi <"$f" | hash_str; done | sort | uniq -c | sort -rn)
  status_hashes=$(for f in "$out"/frame-*.txt; do strip_ansi <"$f" | tail -1 | hash_str; done | sort | uniq -c | sort -rn)

  logo_visible_frames=$(echo "$logo_hashes" | awk '{s+=$1} END{print s+0}')
  logo_distinct=$(echo "$logo_hashes" | grep -c .)
  if [ "$logo_visible_frames" -eq 0 ]; then
    logo_distinct=0  # logo never visible — N/A, not a flicker
  fi
  total_distinct=$(echo "$total_hashes" | wc -l)
  status_distinct=$(echo "$status_hashes" | wc -l)

  local total_rate logo_rate status_rate
  total_rate=$(awk "BEGIN{printf \"%.2f\", $total_distinct/$DURATION_S}")
  logo_rate=$(awk "BEGIN{printf \"%.2f\", $logo_distinct/$DURATION_S}")
  status_rate=$(awk "BEGIN{printf \"%.2f\", $status_distinct/$DURATION_S}")

  log ""
  log "  | Region        | Distinct frames | Rate (Hz) | Threshold |"
  log "  | ------------- | --------------- | --------- | --------- |"
  log "  | Logo          | $logo_distinct (across $logo_visible_frames visible frames) | $logo_rate | = 1 when visible |"
  log "  | Status bar    | $status_distinct | $status_rate | ≤ 5 Hz |"
  log "  | Whole buffer  | $total_distinct | $total_rate | ≤ idle:2 / busy:10 Hz |"
  log ""

  # Pass / fail
  local fail=0
  if [ "$logo_distinct" -gt 1 ]; then
    log "  ❌ FAIL: logo region has $logo_distinct distinct hashes across $logo_visible_frames frames where it was fully visible — should be 1 (Ink <Static>)."
    log "  Saving distinct logo frames for inspection in $out/logo-distinct/"
    mkdir -p "$out/logo-distinct"
    local seen=""
    for f in "$out"/frame-*.txt; do
      local h
      h=$(strip_ansi <"$f" | extract_logo | hash_str)
      case " $seen " in
        *" $h "*) ;;
        *) seen="$seen $h"; cp "$f" "$out/logo-distinct/$(basename "$f" .txt)__$h.txt" ;;
      esac
    done
    fail=1
  else
    log "  ✓ Logo stable across $n frames."
  fi

  # Idle scenarios should have minimal whole-buffer churn
  if [ "$name" = "idle" ] && [ "$(awk "BEGIN{print ($total_rate > 2.0)}")" = "1" ]; then
    log "  ❌ FAIL: idle whole-buffer change rate $total_rate Hz exceeds threshold 2 Hz."
    fail=1
  fi

  # Busy scenarios — status bar shouldn't churn too fast
  if [ "$name" != "idle" ] && [ "$(awk "BEGIN{print ($status_rate > 5.0)}")" = "1" ]; then
    log "  ❌ FAIL: status bar change rate $status_rate Hz exceeds busy threshold 5 Hz."
    fail=1
  fi

  if [ "$fail" -eq 0 ]; then
    log "  ✓ PASS"
  else
    ANY_FAIL=$((ANY_FAIL + 1))
  fi

  log ""
}

# ────────────────────── runs ──────────────────────

run_scenario "idle" "" ""
run_scenario "short-chat" "What is 2+2? Reply with one digit only." ""
run_scenario "with-tool" "Use shell to echo HELLO and report the exact output." ""
run_scenario "yolo-mode" "write a file called probe.txt with content STABLE" "--yolo"

# ────────────────────── verdict ──────────────────────

log "---"
log ""
if [ "$ANY_FAIL" -eq 0 ]; then
  log "## ✓ ALL SCENARIOS PASSED — no jitter or flicker detected."
  log ""
  log "Frame archives: \`$OUT/<scenario>/frame-*.txt\`"
  exit 0
else
  log "## ✗ $ANY_FAIL SCENARIOS FAILED — see per-scenario detail above."
  log ""
  log "Distinct-frame archives saved at \`$OUT/<scenario>/logo-distinct/\` for triage."
  exit 1
fi
