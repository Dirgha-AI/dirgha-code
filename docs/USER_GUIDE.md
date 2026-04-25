# Dirgha CLI - User Guide

Complete guide to using Dirgha effectively.

## Table of Contents

1. [Installation](#installation)
2. [First Run](#first-run)
3. [Core Concepts](#core-concepts)
4. [Commands Reference](#commands-reference)
5. [Multi-Modal Features](#multi-modal-features)
6. [Session Management](#session-management)
7. [Configuration](#configuration)
8. [Troubleshooting](#troubleshooting)

---

## Installation

### Option 1: npm (Recommended)

```bash
npm install -g @dirgha-ai/cli
```

### Option 2: Install Script

```bash
curl -fsSL https://raw.githubusercontent.com/salikshah/dirgha-os-v1/main/domains/10-computer/cli/scripts/install.sh | bash
```

### Option 3: Build from Source

```bash
git clone git@github.com:salikshah/dirgha-os-v1.git
cd domains/10-computer/cli
pnpm install
pnpm build
pnpm link --global
```

### Requirements

- Node.js 18 or higher
- pnpm 9 or higher (for development)
- 500MB disk space
- API key for at least one provider (OpenAI, Anthropic, etc.)

---

## First Run

### 1. Initialize Dirgha

```bash
dirgha init
```

This creates:
- `~/.dirgha/` - Configuration directory
- `~/.dirgha/config.json` - Your settings
- `~/.dirgha/sessions.db` - SQLite database for memory

### 2. Configure API Keys

Edit `~/.dirgha/config.json`:

```json
{
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-api03-...",
      "defaultModel": "claude-3-5-sonnet-20241022"
    },
    "openai": {
      "apiKey": "sk-...",
      "defaultModel": "gpt-4o"
    }
  },
  "defaultProvider": "anthropic"
}
```

### 3. Start the Agent

```bash
dirgha start
```

You'll see the prompt:

```
╭─────────────────────────────────────╮
│  Dirgha v0.2.0-beta.1                │
│  Type /help for commands             │
╰─────────────────────────────────────╯
dirgha> 
```

---

## Core Concepts

### The Agent Loop

Dirgha follows a simple pattern:

1. **You** describe a task or ask a question
2. **Agent** analyzes and plans steps
3. **Tools** execute (read files, run commands, browse web)
4. **Response** with results or follow-up questions

### Tool Permissions

When the agent wants to run a shell command, Dirgha asks:

```
Allow running: npm install lodash?
[Y] Yes  [N] No  [A] Always allow this pattern
```

Set in config:
```json
{
  "permissions": {
    "shell": "ask",    // ask | always | never
    "fileWrite": "ask",
    "browser": "always"
  }
}
```

### Context Window

Dirgha automatically manages context:

- **Recent messages** (last 20 exchanges)
- **Project files** (detected automatically)
- **Attached files** (you specify)
- **Browser content** (from `/browse`)

---

## Commands Reference

### Task Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/start <goal>` | Start a new task | `/start create a React todo app` |
| `/plan` | Show current execution plan | `/plan` |
| `/pause` | Pause current task | `/pause` |
| `/resume` | Resume paused task | `/resume` |
| `/stop` | Stop and clear current task | `/stop` |

### Session Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/save [name]` | Save session | `/save react-todo-setup` |
| `/load <id>` | Load session | `/load 550e8400` |
| `/list` | List saved sessions | `/list` |
| `/delete <id>` | Delete session | `/delete 550e8400` |
| `/clear` | Clear conversation | `/clear` |
| `/reset` | Reset completely | `/reset` |

### Information Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/usage` | Show token usage | `/usage` |
| `/context` | Show current context | `/context` |
| `/project` | Show project info | `/project` |
| `/models` | List available models | `/models` |

### Multi-Modal Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/browse <url>` | Browse webpage | `/browse https://docs.react.dev` |
| `/screenshot <url>` | Screenshot page | `/screenshot https://example.com` |
| `/image <path>` | Attach image | `/image ./design.png` |
| `/attach <file>` | Attach file | `/attach ./data.csv` |

### Development Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/commit` | Generate commit message | `/commit` |
| `/pr` | Create PR description | `/pr` |
| `/test` | Run project tests | `/test` |
| `/lint` | Run linter | `/lint` |
| `/debug` | Analyze errors | `/debug` |

### System Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/config` | Edit configuration |
| `/theme` | Change theme |
| `/exit` or Ctrl+C | Quit Dirgha |

---

## Multi-Modal Features

### Working with Images

```bash
# Attach a screenshot for UI feedback
dirgha> /image ./ui-mockup.png
dirgha> "What do you think of this design?"

# Debug visual issues
dirgha> /image ./error-screenshot.png
dirgha> "Why is this layout breaking on mobile?"
```

**Supported formats**: PNG, JPG, GIF, WebP, BMP
**Max size**: 20MB per image
**Models**: Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro

### Browsing the Web

```bash
# Read documentation
dirgha> /browse https://docs.npmjs.com/cli/v10/commands/npm-install

# Research APIs
dirgha> /browse https://api.github.com/users/octocat

# Check issues
dirgha> /browse https://github.com/facebook/react/issues
```

Content is extracted and added to context automatically.

### Attaching Files

```bash
# Code review
dirgha> /attach ./src/components/Button.tsx
dirgha> "Review this component for accessibility issues"

# Data analysis
dirgha> /attach ./sales-data.csv
dirgha> "What's the trend in Q3 revenue?"

# Multiple files
dirgha> /attach ./package.json
dirgha> /attach ./tsconfig.json
dirgha> "Are these configurations compatible?"
```

**Supported formats**: All text files, PDFs, CSV, JSON, XML, code files
**Max size**: 5MB per file (text), 20MB (PDFs)

---

## Session Management

### Understanding Sessions

A session captures:
- Conversation history
- Attached files and images
- Browser pages you've visited
- Token usage statistics
- Project context

### Saving Sessions

```bash
# Auto-named by first user message
dirgha> /save
Session saved: 550e8400-e29b-41d4-a716-446655440000

# Custom name
dirgha> /save react-auth-implementation
Session saved: a1b2c3d4
```

### Listing Sessions

```bash
dirgha> /list
╭──────────────────────────────────────────────────────────────╮
│ Saved Sessions                                               │
├──────────────┬─────────────────────────┬──────────┬──────────┤
│ ID           │ Name                    │ Messages │ Created  │
├──────────────┼─────────────────────────┼──────────┼──────────┤
│ 550e8400...  │ "create a react app"    │ 12       │ 2m ago   │
│ a1b2c3d4...  │ react-auth-implementation│ 45      │ 1h ago   │
│ e5f6g7h8...  │ "debug typescript errors"│ 8       │ 3h ago   │
╰──────────────┴─────────────────────────┴──────────┴──────────╯
```

### Loading Sessions

```bash
# By ID (first 8 chars enough)
dirgha> /load 550e8400
Loaded session: "create a react app" (12 messages)

# Resume alias
dirgha> /resume 550e8400
```

### Project Memory

Sessions are grouped by project automatically:

```bash
dirgha> /project
╭────────────────────────────────────────────╮
│ Project: my-react-app                        │
├────────────────────────────────────────────┤
│ Path: /home/user/projects/my-react-app       │
│ Sessions: 5                                  │
│ Messages: 156                                │
│ Last active: 2 hours ago                     │
╰────────────────────────────────────────────╯
```

---

## Configuration

### Config File Location

```
~/.dirgha/config.json
```

### Full Configuration Example

```json
{
  "version": "1.0",
  "defaultProvider": "anthropic",
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-api03-...",
      "defaultModel": "claude-3-5-sonnet-20241022",
      "timeout": 120000
    },
    "openai": {
      "apiKey": "sk-...",
      "defaultModel": "gpt-4o",
      "timeout": 60000
    },
    "fireworks": {
      "apiKey": "fw-...",
      "defaultModel": "accounts/fireworks/models/llama-v3p1-405b-instruct"
    },
    "openrouter": {
      "apiKey": "sk-or-...",
      "defaultModel": "anthropic/claude-3.5-sonnet"
    }
  },
  "permissions": {
    "shell": "ask",
    "fileRead": "always",
    "fileWrite": "ask",
    "browser": "always",
    "network": "always"
  },
  "context": {
    "maxRecentMessages": 20,
    "maxFileContext": 10000,
    "autoIndexFiles": true
  },
  "ui": {
    "theme": "system",
    "compactMode": false,
    "showTokenCount": true
  }
}
```

### Environment Variables

Override config with env vars:

```bash
export DIRGHA_ANTHROPIC_API_KEY="sk-ant-..."
export DIRGHA_OPENAI_API_KEY="sk-..."
export DIRGHA_DEFAULT_PROVIDER="openai"
export DIRGHA_THEME="dark"
```

---

## Troubleshooting

### Common Issues

#### "No API key configured"

```bash
# Check config exists
cat ~/.dirgha/config.json

# Or set env var
export DIRGHA_ANTHROPIC_API_KEY="your-key-here"
```

#### "Rate limit exceeded"

```bash
# Check usage
dirgha> /usage

# Wait or upgrade tier
# See: https://dirgha.ai/pricing
```

#### "Command not found after install"

```bash
# For npm global installs, ensure PATH includes:
# macOS/Linux: ~/.npm-global/bin or /usr/local/bin
# Windows: %APPDATA%\npm

# Or use npx
npx @dirgha-ai/cli start
```

#### "SQLite database locked"

```bash
# Kill any hanging processes
pkill -f "dirgha"

# Or delete and recreate (loses history)
rm ~/.dirgha/sessions.db
dirgha init
```

### Debug Mode

Enable verbose logging:

```bash
DEBUG=dirgha:* dirgha start
```

### Getting Help

```bash
# In-app help
dirgha> /help

# Command-specific help
dirgha> /help browse

# Report issues
# https://github.com/salikshah/dirgha-os-v1/issues
```

---

## Tips & Best Practices

1. **Start with context**: Use `/start` with a clear goal
2. **Save frequently**: Use `/save` after completing milestones
3. **Attach files early**: Include relevant code/data upfront
4. **Use browser for docs**: `/browse` for current documentation
5. **Check usage**: `/usage` to monitor token consumption
6. **Resume sessions**: Don't lose context with `/resume`

---

## Next Steps

- Read [API Reference](./API_REFERENCE.md) for technical details
- Explore [Examples](./EXAMPLES.md) for real-world workflows
- Learn about [Contributing](./CONTRIBUTING.md) to Dirgha
