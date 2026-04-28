# Tape 1 — cold-start REPL → /help overlay
# Boots dirgha, types /help, presses Enter, captures the help overlay.
# Golden frame asserts the overlay layout doesn't drift between releases.

Output tools/vhs/output/01-cold-start-help.gif
Output tools/vhs/output/01-cold-start-help.png

Set Shell "bash"
Set FontSize 14
Set Width  1400
Set Height 800
Set Padding 8
Set TypingSpeed 50ms
Set Theme "Dracula"

# Boot the REPL. The wizard skip relies on ~/.dirgha/keys.json existing —
# populated by `tools/vhs/seed-home.sh` (run before vhs in CI/local).
Type "dirgha"
Enter
Sleep 3s

# Open the help overlay.
Type "/help"
Sleep 500ms
Enter
Sleep 1.5s

# Capture the final state.
Sleep 500ms
