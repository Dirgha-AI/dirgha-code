#!/bin/bash
set -e

# Dirgha CLI Installer
# Usage: curl -fsSL https://dirgha.ai/install.sh | bash

REPO="dirgha-ai/cli"
VERSION="${VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
SHELLRC="${SHELLRC:-$HOME/.bashrc}"

# Detect platform
detect_platform() {
  local os arch
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  arch=$(uname -m)
  
  case "$arch" in
    x86_64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) echo "Unsupported architecture: $arch"; exit 1 ;;
  esac
  
  echo "${os}-${arch}"
}

# Check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Install Node.js if needed
ensure_node() {
  if ! command_exists node; then
    echo "→ Node.js not found. Installing via n..."
    if ! command_exists n; then
      curl -fsSL https://raw.githubusercontent.com/tj/n/master/bin/n | bash -s lts
    fi
    n lts
  fi
  
  local node_version
  node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$node_version" -lt 18 ]; then
    echo "→ Node.js >= 18 required. Current: $(node --version)"
    exit 1
  fi
}

# Install pnpm if needed
ensure_pnpm() {
  if ! command_exists pnpm; then
    echo "→ pnpm not found. Installing..."
    curl -fsSL https://get.pnpm.io/install.sh | sh -
    export PNPM_HOME="$HOME/.local/share/pnpm"
    export PATH="$PNPM_HOME:$PATH"
  fi
}

# Main install
main() {
  echo "=== Dirgha CLI Installer ==="
  echo ""
  
  # Ensure prerequisites
  ensure_node
  ensure_pnpm
  
  # Detect shell for PATH setup
  if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = */zsh ]; then
    SHELLRC="${ZDOTDIR:-$HOME}/.zshrc"
  elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = */bash ]; then
    SHELLRC="$HOME/.bashrc"
  fi
  
  # Install via pnpm
  echo "→ Installing Dirgha CLI..."
  pnpm add -g "@dirgha-ai/cli@$VERSION"
  
  # Verify installation
  if command_exists dirgha; then
    echo ""
    echo "✓ Dirgha CLI installed successfully!"
    echo "  Version: $(dirgha --version 2>/dev/null || echo 'unknown')"
    echo ""
    echo "Get started:"
    echo "  dirgha init     # Initialize your project"
    echo "  dirgha          # Start the REPL"
    echo ""
  else
    echo ""
    echo "⚠ Installation completed but 'dirgha' not in PATH"
    echo "  Add to your shell config ($SHELLRC):"
    echo "    export PATH=\"\$HOME/.local/share/pnpm:\$PATH\""
    echo ""
  fi
}

main "$@"
