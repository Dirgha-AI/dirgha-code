#!/usr/bin/env python3
"""Drive the Ink TUI through pexpect and assert on what it renders.

Spawns `dirgha` in a real PTY (pexpect handles that), sends keystrokes
the way a human would, and captures what the TUI actually paints. This
is the test we should have been running all along instead of trusting
the dist build alone.

Usage:
    python ink_smoke.py
"""

from __future__ import annotations
import re
import sys
import time

import pexpect

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[=>]")


def strip(s: str) -> str:
    return ANSI.sub("", s).replace("\r", "")


def main() -> int:
    import os, tty, termios
    env = os.environ.copy()
    env.update({"TERM": "xterm-256color"})
    p = pexpect.spawn(
        "/usr/bin/dirgha",
        env=env,
        encoding="utf-8",
        timeout=20,
        dimensions=(40, 120),
    )
    # Default PTY is in cooked mode — kernel buffers input until \n and
    # ships the line as one chunk, which makes Ink see "/model X\n" as
    # literal text (including the newline) instead of an Enter keypress.
    # Switching the slave PTY to raw mode forwards each byte to dirgha
    # immediately, so \r maps to key.return and ink-text-input.onSubmit
    # actually fires.
    tty.setraw(p.child_fd)
    p.logfile_read = open("/tmp/dirgha-ink.log", "w")

    def type_keys(s: str, per_key_ms: int = 40):
        """Send characters one at a time so Ink's keypress dispatcher
        fires per byte instead of buffering an entire line."""
        for ch in s:
            p.send(ch)
            time.sleep(per_key_ms / 1000)

    def submit():
        # Try CR first; if input box doesn't clear, ink-text-input will
        # have appended the byte. Adding LF too is harmless because Ink
        # collapses both to key.return.
        p.send("\r")
        time.sleep(0.4)

    print("→ wait for initial prompt")
    p.expect_exact("❯", timeout=15)
    time.sleep(1.5)  # let initial render settle

    # ---- /help test ----
    print("→ send /help")
    type_keys("/help")
    submit()
    time.sleep(2.0)
    p.send("\x1b")  # esc to close overlay
    time.sleep(0.8)

    # ---- model swap + hi ----
    print("→ send /model <free model>")
    type_keys("/model inclusionai/ling-2.6-1t:free")
    submit()
    time.sleep(2.0)
    print("→ send hi")
    type_keys("hi")
    submit()
    print("→ wait up to 30s for streamed reply")
    streamed = ""
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            chunk = p.read_nonblocking(size=4096, timeout=0.5)
            streamed += chunk
        except pexpect.exceptions.TIMEOUT:
            # heuristic: if we've seen a recent assistant token, give it 2s of quiet to call it done
            if streamed and re.search(r"[a-zA-Z]{3,}", strip(streamed[-200:])):
                time.sleep(1.5)
                try:
                    extra = p.read_nonblocking(size=4096, timeout=0.5)
                    streamed += extra
                    continue
                except pexpect.exceptions.TIMEOUT:
                    break

    # ---- exit ----
    print("→ exit")
    type_keys("/exit")
    submit()
    try:
        p.expect(pexpect.EOF, timeout=5)
    except pexpect.TIMEOUT:
        p.terminate(force=True)

    p.logfile_read.close()
    full_log = open("/tmp/dirgha-ink.log").read()
    plain = strip(full_log)

    print()
    print("====== rendered (plain) ======")
    print(plain[-3000:])
    print("====== assertions ======")

    # Stricter checks: text the AGENT must produce, not text the user typed.
    # We assert on transcript artifacts that only appear if the kernel
    # actually streamed events back into the Ink TUI.
    has_help_overlay = "0 commands" not in plain and ("Keyboard" in plain or "Slash" in plain or "type to filter" in plain)
    model_swap_succeeded = "Model set to inclusionai/ling-2.6-1t:free" in plain
    # The agent's reply contains lowercase letters AFTER the user's `hi`
    # in the transcript — easiest signal: a reply line that isn't part of
    # the input box framing or the 'hi' echo.
    streamed_reply = bool(re.search(r"(?i)\b(hello|hi there|hey|how can i)\b", plain))
    no_set_spam = plain.count("Model set to") <= 1
    no_runtime_errors = not any(s in plain for s in ["TypeError", "ReferenceError", "Network error", "Unhandled"])

    checks = [
        ("title is not stale 0.2.0", "v0.2.0" not in plain),
        ("/help overlay rendered with commands", has_help_overlay),
        ("/model command set the model (notice in transcript)", model_swap_succeeded),
        ("agent streamed a reply (greeting word found)", streamed_reply),
        ("no duplicate 'Model set' notices", no_set_spam),
        ("no React/runtime errors leaked", no_runtime_errors),
    ]
    failed = 0
    for label, ok in checks:
        mark = "✓" if ok else "✗"
        if not ok:
            failed += 1
        print(f"  {mark} {label}")

    print()
    print(f"{'PASS' if failed == 0 else 'FAIL'} — {len(checks) - failed}/{len(checks)} checks passed")
    print(f"full log: /tmp/dirgha-ink.log")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
