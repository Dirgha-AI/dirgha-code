# Dirgha VS Code Extension

Minimal VS Code extension that wires the [Dirgha CLI](https://github.com/dirghaai)
into your editor. Two commands, no webviews, no fluff.

## Commands

| Command | Default Keybinding | What it does |
| --- | --- | --- |
| `Dirgha: Ask Inline` | `Ctrl+I` / `Cmd+I` | Prompts for an instruction, sends `selection + prompt` to `dirgha ask --print`, and inserts the response at the cursor (or replaces the selection). |
| `Dirgha: Open Terminal` | — | Opens an integrated terminal and runs `dirgha`. |

## Prerequisites

- VS Code `^1.85.0`
- The `dirgha` CLI installed and on your `$PATH` (`npm i -g @dirgha/cli`)

## Install (dev)

```bash
cd tools/vscode-ext
npm install
npm run compile
```

Then open this folder in VS Code and press `F5` to launch the Extension
Development Host with the extension loaded.

## Notes

- The extension shells out to `dirgha` via `child_process.spawn`. If the
  binary isn't on `$PATH`, you'll get a friendly error toast.
- Output is buffered, then inserted at the end of the run. Streaming inline
  edits are deferred to a later version.

## License

MIT
