#!/usr/bin/env bash
# Vision loop: drive dirgha in tmux, capture frames as PNG.
# Usage: vision-loop.sh <session> <action> [args...]
#   start                        spawn detached dirgha session
#   keys "<keys>"                send keys (tmux send-keys syntax)
#   text "<string>"              send literal string
#   shot <out.png>               capture pane -> PNG
#   wait <ms>                    sleep
#   kill                         kill session
set -u
export PATH=$PATH:$(go env GOPATH)/bin

SESSION="${1:?session name required}"; shift
ACTION="${1:?action required}"; shift

case "$ACTION" in
  start)
    tmux kill-session -t "$SESSION" 2>/dev/null
    # 120x32 is wide enough for slash menus without truncation
    tmux new-session -d -s "$SESSION" -x 120 -y 32 "dirgha"
    sleep 1.5
    ;;
  keys)
    tmux send-keys -t "$SESSION" "$@"
    ;;
  text)
    tmux send-keys -t "$SESSION" -l "$*"
    ;;
  shot)
    OUT="${1:?output path required}"
    tmux capture-pane -t "$SESSION" -e -p > "/tmp/${SESSION}.ansi"
    freeze -o "$OUT" --width 1400 --height 700 --font.size 14 \
      --background "#0a0a0a" "/tmp/${SESSION}.ansi" 2>&1 | tail -1
    echo "saved: $OUT"
    ;;
  wait)
    MS="${1:-500}"
    sleep "$(awk "BEGIN{print $MS/1000}")"
    ;;
  kill)
    tmux kill-session -t "$SESSION" 2>/dev/null
    ;;
  *)
    echo "unknown action: $ACTION" >&2; exit 1
    ;;
esac
