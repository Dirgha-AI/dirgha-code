# Getting started

This guide takes you from a fresh clone to a working agent in about ten minutes.

## 1. Install

You need Node.js 22 or later. Rust stable is only needed for the kernel (the safety gate's MCP server, the cockpit and the robotics tools).

```bash
git clone https://github.com/Dirgha-AI/dirgha.git
cd dirgha
npm ci
npm run build
npm run build:native      # optional: the Rust kernel
node bin/dirgha.mjs doctor
```

`doctor` prints JSON. Look for `"status": "HEALTHY"`, `"lokahi_wasm_gate": { "present": true }` and, if you built the kernel, `"rust_native_host": { "present": true }`.

To call it as `dirgha` from anywhere, run `npm link` in the repo. (This replaces a global `@dirgha/code` 1.x install.)

## 2. Pick a model

**Hosted model.** Store a key once:

```bash
dirgha keys set OPENROUTER_API_KEY sk-or-...
dirgha models list
```

Keys go to `~/.dirgha/keys.json`. You can also use environment variables such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY`.

**Local model, no internet.** Install [Ollama](https://ollama.com), then:

```bash
ollama pull qwen2.5-coder:7b
dirgha -m ollama/qwen2.5-coder:7b
```

A quantized 7B model runs on an ordinary laptop without a GPU. See [local-models.md](local-models.md) for llama.cpp.

## 3. First tasks

```bash
cd your-project
dirgha init                                   # writes DIRGHA.md: notes the agent reads every time
dirgha "find where we parse config files and explain it"
dirgha                                        # interactive session
```

In the interactive session, type `/help` for slash commands.

## 4. Check what it did

```bash
dirgha audit tail          # recent tool calls and decisions
dirgha stats today         # usage
dirgha export-session <id> session.json
```

## 5. Go further

- Run several agents in parallel: [tutorials/fleet.md](tutorials/fleet.md)
- Delegate to sub-agents: [tutorials/subagents.md](tutorials/subagents.md)
- Understand the safety gate: [safety.md](safety.md)
- Use the kernel's tools from another agent: [mcp-tools.md](mcp-tools.md)
- Try robot simulation: [robotics.md](robotics.md)
- On Windows: [windows-installation.md](windows-installation.md)
