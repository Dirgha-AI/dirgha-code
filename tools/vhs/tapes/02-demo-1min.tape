# Tape 2 — 1-minute demo: dirgha CLI doing real work
# Shows: version → doctor → models → audit-self → ask with tool use
# Requires: ~/.dirgha seeded (tools/vhs/seed-home.sh) + NVIDIA_API_KEY

Output tools/vhs/output/02-demo-1min.gif
Output tools/vhs/output/02-demo-1min.mp4

Set Shell "bash"
Set FontSize 14
Set Width  1600
Set Height 900
Set Padding 10
Set TypingSpeed 60ms
Set Theme "Dracula"

# ── Banner ───────────────────────────────────────────────────────────────────
Type "clear"
Enter
Sleep 300ms

Type "echo '━━━ Dirgha Code — 1-min demo ━━━'"
Enter
Sleep 500ms

# ── Version + help flag ───────────────────────────────────────────────────────
Type "dirgha --version"
Enter
Sleep 1s

Type "dirgha --help | head -20"
Enter
Sleep 1.5s

# ── Doctor: provider + tool health ───────────────────────────────────────────
Type "dirgha doctor"
Enter
Sleep 3s

# ── Model catalogue (brief) ───────────────────────────────────────────────────
Type "dirgha models list | head -25"
Enter
Sleep 2s

# ── Cost tracker ─────────────────────────────────────────────────────────────
Type "dirgha cost"
Enter
Sleep 1.5s

# ── Non-interactive ask: model call + shell tool use ─────────────────────────
Type "DIRGHA_PROVIDER=nvidia DIRGHA_MODEL=deepseek-ai/deepseek-v4-pro dirgha ask --max-turns 3 --print 'use the shell tool to run: ls -1 src/ | head -8, then summarise what you see in one sentence'"
Enter
Sleep 20s

# ── Audit-codebase (self-audit) ───────────────────────────────────────────────
Type "dirgha audit-codebase --summary 2>&1 | head -20"
Enter
Sleep 5s

# ── Show a session was recorded ───────────────────────────────────────────────
Type "dirgha ledger list 2>/dev/null | head -5 || echo '(no ledger entries yet)'"
Enter
Sleep 1.5s

Type "echo '━━━ Done — see dirgha.ai for the full feature set ━━━'"
Enter
Sleep 2s
