#!/usr/bin/env bash
# Seed ~/.dirgha so the first-run setup wizard skips during tape replays.
# Idempotent — safe to call repeatedly. Used by `tools/vhs/run.sh` and
# the CI workflow's "Seed dirgha home" step.
set -euo pipefail

DIR="$HOME/.dirgha"
mkdir -p "$DIR"

if [ ! -f "$DIR/config.json" ]; then
  cat > "$DIR/config.json" <<'JSON'
{
  "version": "1.0.0",
  "project": { "name": "vhs", "root": "/tmp", "type": "node" },
  "context": { "files": [] }
}
JSON
fi

if [ ! -f "$DIR/keys.json" ]; then
  if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    python3 -c "import json,os; json.dump({'OPENROUTER_API_KEY': os.environ['OPENROUTER_API_KEY']}, open(os.path.expanduser('~/.dirgha/keys.json'), 'w'))"
  else
    # isFirstRun() returns false as long as keys.json exists, regardless of
    # contents — so an empty {} is fine for tapes that don't make API calls.
    echo '{}' > "$DIR/keys.json"
  fi
fi

echo "seeded $DIR"
ls -la "$DIR" | head -10
