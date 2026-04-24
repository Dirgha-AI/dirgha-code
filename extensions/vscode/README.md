# Dirgha Code — VS Code extension

Thin VS Code wrapper over the `@dirgha/code` CLI. Nothing is re-implemented:
the extension shells to the locally-installed `dirgha` binary, so every
new CLI tool, provider, or sandbox guarantee is available here the
moment the CLI releases it.

## Prereqs

```sh
npm install -g @dirgha/code
dirgha login          # or set ANTHROPIC_API_KEY / OPENAI_API_KEY / etc.
```

## Install (development)

```sh
cd extensions/vscode
npm install
npm run compile
# Launch the Extension Development Host from VS Code: F5 in this folder
```

Or package it:

```sh
npx vsce package          # produces dirgha-code-vscode-0.1.0.vsix
code --install-extension dirgha-code-vscode-0.1.0.vsix
```

## Commands

| Command | Keybinding | Effect |
|---|---|---|
| `Dirgha: Ask about current file` | — | Prompt → runs `dirgha ask "<prompt>\nContext: read_file(<path>)"` |
| `Dirgha: Ask about selection` | `⌘K ⌘D` / `Ctrl+K Ctrl+D` | Prompt → runs `dirgha ask` with the selection as context |
| `Dirgha: Open REPL in integrated terminal` | `⌘K ⌘R` / `Ctrl+K Ctrl+R` | Opens a terminal and launches the full agent |
| `Dirgha: Show account status` | — | Runs `dirgha status` |

Right-click in the editor with a selection to see `Dirgha: Ask about
selection` in the context menu.

## Settings

| Setting | Default | Notes |
|---|---|---|
| `dirgha.binaryPath` | `dirgha` | Absolute path if you don't want to use PATH |
| `dirgha.defaultModel` | `""` | Overrides the CLI's default via `DIRGHA_CODE_MODEL` for this workspace |
| `dirgha.showOutput` | `panel` | `panel` for the output channel, `terminal` for an integrated terminal (streams better) |

## Why so thin?

Philosophy: the agent lives in the CLI, not in the editor. Every new
CLI feature should show up in VS Code, Cursor, JetBrains, etc. without
per-IDE plumbing. If you want richer IDE integration (inline
completions, diff preview, per-cell applies), open an issue — those
are the natural follow-ons and need design.

## Publishing

Not yet on the Marketplace. When it is:

```sh
npx vsce publish
```

Requires a Publisher account under the `dirgha` namespace.
