#!/bin/sh
# Dirgha CLI one-line installer.
#
# Usage:   curl -fsSL get.dirgha.ai | sh
#
# Idempotent — running twice does no harm.
# Friendly — fails fast with a clear reason rather than silent half-install.
# Cross-platform — Linux + macOS. Windows users see a friendly pointer.

set -e

say() { printf '%s\n' "$*" >&2; }
die() { say "$*"; exit 1; }

say "Dirgha CLI installer"
say ""

# ---------- 1. platform check ----------
UNAME=$(uname 2>/dev/null || echo Unknown)
case "$UNAME" in
  Linux|Darwin)
    say "  platform: $UNAME"
    ;;
  *)
    say "  platform: $UNAME — not supported by this script."
    say "  Manual install: https://github.com/Dirgha-AI/dirgha-code#install"
    exit 0
    ;;
esac

# ---------- 2. Node.js check ----------
if ! command -v node >/dev/null 2>&1; then
  say ""
  say "Node.js is required (>= 18) but not found."
  if [ "$UNAME" = "Darwin" ]; then
    say "  macOS:  brew install node@20"
    say "  brew:   https://brew.sh"
  else
    say "  Linux:  nvm install 20"
    say "  nvm:    https://github.com/nvm-sh/nvm"
  fi
  die ""
fi

NODE_VERSION=$(node --version 2>/dev/null | sed 's/^v//')
NODE_MAJOR=${NODE_VERSION%%.*}
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  say ""
  say "Node.js $NODE_VERSION found, but Dirgha needs Node >= 18."
  if [ "$UNAME" = "Darwin" ]; then
    say "  macOS:  brew install node@20"
  else
    say "  Linux:  nvm install 20  (or upgrade your distro's package)"
  fi
  die ""
fi
say "  node: $NODE_VERSION"

# ---------- 3. npm check ----------
if ! command -v npm >/dev/null 2>&1; then
  die "npm not found. It usually ships with Node — reinstall Node from nodejs.org."
fi
say "  npm:  $(npm --version 2>/dev/null)"

# ---------- 4. install ----------
say ""
say "  \$ npm install -g @dirgha/code"
say ""

if ! npm install -g @dirgha/code; then
  say ""
  say "npm install failed."
  say "  - Permission denied? Try:  sudo npm install -g @dirgha/code"
  say "    or use a user-prefix:    npm config set prefix ~/.npm-global"
  say "  - Version conflict? Try:   npm install -g --force @dirgha/code"
  die ""
fi

# ---------- 5. confirm ----------
if ! command -v dirgha >/dev/null 2>&1; then
  die "Install reported success but 'dirgha' is not on PATH. Add the npm bin dir: \$(npm prefix -g)/bin"
fi

INSTALLED=$(dirgha --version 2>/dev/null || echo "(version check failed)")

say ""
say "  Dirgha CLI installed: $INSTALLED"
say ""
say "Next:"
say "  dirgha doctor       Verify providers + environment"
say "  dirgha              Start the agent"
say ""
say "Docs: https://github.com/Dirgha-AI/dirgha-code"
