# CLI-Hub Plugin System

CLI-Hub brings CLI-Anything's plugin ecosystem to Dirgha CLI.

## Quick Start

```bash
# Search for plugins
dirgha hub search ai

# Install a plugin
dirgha hub install dirgha-ollama

# List installed
dirgha hub list --installed

# Remove plugin
dirgha hub remove dirgha-ollama
```

## Plugin Structure

```
my-plugin/
├── manifest.json    # Plugin metadata
├── index.js         # Entry point
├── package.json     # npm deps (optional)
└── README.md        # Documentation
```

## Manifest Format

```json
{
  "name": "dirgha-my-plugin",
  "version": "1.0.0",
  "description": "What it does",
  "author": "Your Name",
  "license": "MIT",
  "main": "index.js",
  "categories": ["ai-model", "tool", "integration"],
  "capabilities": [
    { "type": "command", "name": "mycommand", "description": "..." }
  ]
}
```

## Publishing

1. Host on GitHub or npm
2. Submit PR to `registry.json`
3. Or share directly: `dirgha hub install owner/repo`

## Categories

- `ai-model` - LLM providers (Ollama, OpenAI, etc.)
- `tool` - CLI utilities
- `integration` - External services
- `theme` - UI themes
- `language` - Language support
- `workflow` - Pre-built recipes
