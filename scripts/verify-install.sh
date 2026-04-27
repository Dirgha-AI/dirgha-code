#!/usr/bin/env bash
# Pre-publish gate: pack the tarball, install it in a CLEAN throwaway dir,
# and verify the binary boots. If this fails, the publish would also fail
# for every user running `npm install -g @dirgha/code`.
#
# Wired into `prepublishOnly` — block any publish that doesn't pass here.
#
# Run:  bash scripts/verify-install.sh
# Exit: 0 on success, non-zero with a precise reason on failure.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_NAME="$(node -p "require('$ROOT/package.json').name")"
PKG_VER="$(node -p "require('$ROOT/package.json').version")"
TARBALL_NAME="$(echo "$PKG_NAME" | sed 's|@||;s|/|-|g')-$PKG_VER.tgz"
TEST_DIR="/tmp/dirgha-verify-install-$$"

cleanup() { rm -rf "$TEST_DIR"; }
trap cleanup EXIT

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
section(){ echo; yellow "=== $* ==="; }

section "1. pack tarball"
cd "$ROOT"
rm -f "$TARBALL_NAME"
npm pack 2>&1 | tail -3
if [[ ! -f "$TARBALL_NAME" ]]; then
  red "FAIL  npm pack did not produce $TARBALL_NAME"
  exit 1
fi
green "  packed $TARBALL_NAME ($(du -h $TARBALL_NAME | cut -f1))"

section "2. clean install in throwaway dir"
mkdir -p "$TEST_DIR"
cp "$TARBALL_NAME" "$TEST_DIR/"
cd "$TEST_DIR"
INSTALL_LOG="$TEST_DIR/install.log"
if ! npm install --no-save "./$TARBALL_NAME" > "$INSTALL_LOG" 2>&1; then
  red "FAIL  npm install rejected the packed tarball"
  echo
  red "Tail of install log:"
  tail -20 "$INSTALL_LOG"
  exit 1
fi
green "  npm install succeeded ($(wc -l < $INSTALL_LOG) log lines)"

section "3. binary launches"
BIN="$TEST_DIR/node_modules/.bin/dirgha"
if [[ ! -x "$BIN" ]]; then
  red "FAIL  binary missing at $BIN"
  ls -la "$TEST_DIR/node_modules/.bin/" 2>&1 | head -5
  exit 1
fi
VERSION_OUT="$("$BIN" --version 2>&1 || true)"
if ! echo "$VERSION_OUT" | grep -qE "^dirgha [0-9]+\.[0-9]+\.[0-9]+"; then
  red "FAIL  dirgha --version output unexpected: $VERSION_OUT"
  exit 1
fi
green "  $VERSION_OUT"

section "4. doctor smoke"
DOCTOR_OUT="$("$BIN" doctor 2>&1 || true)"
if ! echo "$DOCTOR_OUT" | grep -qE "node|provider|dirgha-home"; then
  red "FAIL  dirgha doctor output unexpected"
  echo "$DOCTOR_OUT" | head -10
  exit 1
fi
green "  doctor printed expected sections"

section "5. help smoke"
HELP_OUT="$("$BIN" --help 2>&1 || true)"
if ! echo "$HELP_OUT" | grep -qE "Subcommands|Interactive|REPL"; then
  red "FAIL  dirgha --help output unexpected"
  echo "$HELP_OUT" | head -10
  exit 1
fi
green "  --help printed expected sections"

echo
green "============================================="
green "  PASS  $PKG_NAME@$PKG_VER installs + boots cleanly"
green "============================================="
echo
exit 0
