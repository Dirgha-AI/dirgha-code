---
name: dirgha-cli
version: 2.0.0
description: AI-powered coding assistant CLI with chat, knowledge graph, and code execution
commands:
  - name: chat
    description: Start AI conversation with streaming responses
    output: both
    args:
      - name: message
        type: string
        required: false
    flags:
      - name: model
        short: m
        type: string
      - name: json
        type: boolean
      - name: no-stream
        type: boolean
  - name: clip
    description: Capture web content to knowledge graph
    output: json
    args:
      - name: url
        type: string
        required: true
    flags:
      - name: category
        short: c
        type: string
      - name: json
        type: boolean
  - name: agent
    description: Run in headless agent mode with structured output
    output: json
    flags:
      - name: input
        type: string
      - name: json
        type: boolean
  - name: auth
    description: Authentication management
    output: text
  - name: checkpoint
    description: Save/restore code checkpoints
    output: text
  - name: compact
    description: Compact conversation history
    output: text
  - name: curate
    description: Add knowledge to graph
    output: json
    args:
      - name: content
        type: string
        required: true
    flags:
      - name: tag
        short: t
        type: string
  - name: query
    description: Search knowledge graph
    output: json
    args:
      - name: query
        type: string
        required: true
---

# Dirgha CLI

AI-powered coding assistant with structured output for agents.

## Key Features

- **Dual Mode**: Interactive TUI + headless agent mode
- **Structured Output**: All commands support `--json` flag
- **Knowledge Graph**: Capture, curate, and query code knowledge
- **Streaming**: Real-time AI responses with tool calling

## Agent Usage

```bash
# Headless mode with JSON output
dirgha agent chat "How do I fix this?" --json

# Complex task via file input
dirgha agent --input task.json --json

# Traditional interactive mode
dirgha chat
```

## Exit Codes

- `0` - Success
- `1` - Error
- `130` - Cancelled (SIGINT)

## Examples

```bash
# Chat with model selection
dirgha chat "Explain this code" --model claude-3.5-sonnet --json

# Capture URL to knowledge graph
dirgha clip https://github.com/example/repo --category Study --json

# Query knowledge
dirgha query "authentication patterns" --json
```
