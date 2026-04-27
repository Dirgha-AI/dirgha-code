# Model picker end_to_end — programmable smoke for /models flow.
# Run via:  cd /tmp/dirgha_tapes && vhs <abs_path_to>/model_picker.tape
# Outputs:  model_picker.gif + 4 named .png frames in cwd

Output model_picker.gif

Set Shell bash
Set FontSize 14
Set Width 1400
Set Height 700
Set Padding 20
Set TypingSpeed 60ms
Set Theme "Dracula"

# Pin a known model so the test starts in a deterministic state.
Env DIRGHA_MODEL "tencent/hy3-preview:free"
Env DIRGHA_PROVIDER "openrouter"

Type "dirgha"
Enter
Sleep 2s

# 1. Picker open
Type "/models"
Sleep 700ms
Enter
Sleep 1500ms
Screenshot 01_picker_open.png

# 2. Navigate down 5 rows
Down@150ms 5
Sleep 600ms
Screenshot 02_down_5.png

# 3. Select the highlighted model
Enter
Sleep 1500ms
Screenshot 03_after_select.png

# 4. Reopen and confirm new selection is the highlighted current
Type "/models"
Sleep 500ms
Enter
Sleep 1500ms
Screenshot 04_reopen_confirm.png

# 5. Esc the picker, exit cleanly
Escape
Sleep 400ms
Type "/exit"
Enter
Sleep 500ms
