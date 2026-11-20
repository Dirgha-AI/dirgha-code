<h1 align="center">Dirgha</h1>

<p align="center"><strong>Open infrastructure for AI that acts: run agents on your own machine, and check every action before it happens.</strong></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0"></a>
  <a href="https://github.com/Dirgha-AI/dirgha/actions/workflows/ci.yml"><img src="https://github.com/Dirgha-AI/dirgha/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@dirgha/code"><img src="https://img.shields.io/npm/dt/@dirgha/code.svg?label=npm%20downloads" alt="npm downloads"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/protocol-MCP-purple.svg" alt="Protocol: MCP"></a>
</p>

AI agents now open files, run commands, send messages and, increasingly, move machines. Dirgha is a harness for those agents. It runs a coding agent in your terminal and robot simulations in MuJoCo with the same engine, works with local models or any provider you choose, and puts a safety gate between the agent and everything it touches. Your keys, memory and logs stay on your machine.

Dirgha is built by [Dirgha AI](#about-dirgha-ai) and released under Apache-2.0.

```bash
git clone https://github.com/Dirgha-AI/dirgha.git && cd dirgha
npm ci && npm run build
node bin/dirgha.mjs            # start the agent
```

---

## Contents

- [Who it's for](#who-its-for)
- [What you get](#what-you-get)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Everyday use](#everyday-use)
- [Models and providers](#models-and-providers)
- [Safety model](#safety-model)
- [Robotics and physical AI](#robotics-and-physical-ai)
- [Documentation](#documentation)
- [For AI agents](#for-ai-agents)
- [The Dirgha AI stack](#the-dirgha-ai-stack)
- [Project status](#project-status)
- [Roadmap](#roadmap)
- [For organisations](#for-organisations)
- [About Dirgha AI](#about-dirgha-ai)
- [Contributing, security and licence](#contributing-security-and-licence)

## Who it's for

- **Developers** who want a capable coding agent that runs locally, uses the model they pick, and keeps a record of what it did.
- **Teams** that need agents to follow written rules: which files they may touch, which commands need a person's yes, where data may go.
- **Robotics and physical-AI builders** who want to test agent behaviour in simulation, with the same gate in front of physical actions.
- **Researchers and educators** who need an inspectable, offline-capable agent they can change.

## What you get

| | |
|---|---|
| **A coding agent** | Interactive terminal UI, one-shot mode (`dirgha "fix the failing test"`), headless mode for scripts, and NDJSON event output for other tools |
| **Real tools** | Files, shell, grep and glob search, git and GitHub, a browser, language-server lookups (definitions, references, symbols), checkpoints, scheduled tasks, a local knowledge base and code graph |
| **Parallel agents** | `dirgha fleet` runs sub-agents in separate git worktrees and merges their work |
| **Your choice of model** | 14 hosted provider families plus any OpenAI-compatible endpoint, or fully local models through Ollama and llama.cpp |
| **Local memory** | Long-term memory and search in SQLite under `~/.dirgha/` |
| **MCP both ways** | Connects to MCP servers (stdio and HTTP/SSE), and the Rust kernel serves 24 MCP tools of its own |
| **A safety gate** | A WebAssembly gate screens every tool call; it refuses when it can't check |
| **An audit trail** | Append-only local logs, and a signed, hash-chained ledger for gate decisions |
| **Extensibility** | Skills in the [agentskills.io](https://agentskills.io) format, hooks, and an ESM plugin API |
| **Robot evaluation** | A MuJoCo sidecar for seeded rollouts, failure triage and HTML replays |

## How it works

```
             you / your scripts / other agents
                         │
            ┌────────────▼────────────┐
            │  dirgha (bin/dirgha.mjs) │  one entry point
            └──────┬──────────┬───────┘
                   │          │
   ┌───────────────▼──┐   ┌───▼─────────────────────────┐
   │ TypeScript agent │   │ Rust kernel                 │
   │ (src/)           │   │ dirgha-native-host (~1 MB)  │
   │ loop, tools,     │   │ 24 MCP tools, cockpit,      │
   │ providers, TUI   │   │ browser native messaging    │
   └───────┬──────────┘   └───┬─────────────────────────┘
           │                  │
           └──────┬───────────┘
                  ▼
       Safety gate (WebAssembly, crates/lokahi-gate)
       checks each action → allow / refuse / needs approval
                  │
                  ▼
   files · shell · git · browser · MCP servers · robots (simulated)
```

The TypeScript agent handles conversation, tools and providers. The Rust kernel handles the gate, the ledger, the MCP server, the local cockpit and the robotics tools. Both sit behind one command.

## Quick start

**Requirements:** Node.js 22 or later. Rust stable if you want to build the kernel.

```bash
git clone https://github.com/Dirgha-AI/dirgha.git
cd dirgha
npm ci
npm run build                  # TypeScript agent
npm run build:native           # Rust kernel (optional)
node bin/dirgha.mjs doctor     # check your setup
```

Add a key, or use a local model:

```bash
node bin/dirgha.mjs keys set OPENROUTER_API_KEY sk-or-...   # stored in ~/.dirgha/keys.json
# or run fully offline with Ollama:
ollama pull qwen2.5-coder:7b
node bin/dirgha.mjs -m ollama/qwen2.5-coder:7b
```

Start working:

```bash
node bin/dirgha.mjs                                  # interactive
node bin/dirgha.mjs "explain src/kernel/agent-loop.ts"
echo "summarise the last 5 commits" | node bin/dirgha.mjs --print
```

> `npm install -g @dirgha/code` installs the 1.x release today. 2.0 will be published to npm shortly; until then, run from source.

## Everyday use

| Command | What it does |
|---|---|
| `dirgha` | Interactive agent |
| `dirgha "<prompt>"` / `dirgha ask "<prompt>"` | One task, with tools, then exit |
| `dirgha chat "<prompt>"` | Plain model call, no tools |
| `dirgha init` | Write a `DIRGHA.md` with notes about your project for the agent |
| `dirgha fleet launch ...` | Parallel agents in git worktrees |
| `dirgha verify "<goal>" --accept "<cmd>"` | Run a goal, succeed only if your command exits 0 |
| `dirgha memory add|list|show|remove` | Long-term memory |
| `dirgha models list` / `dirgha keys list` | Models and keys |
| `dirgha audit tail` | Recent actions from the local audit log |
| `dirgha export-session <id>` / `import-session <path>` | Move sessions between machines |
| `dirgha doctor` | Environment and kernel checks |
| `dirgha cockpit` | Local web cockpit (needs the kernel) |
| `dirgha --self-test` | Kernel self-test |

Run `dirgha --help` for the full list.

## Models and providers

Bring your own keys for Anthropic, OpenAI, Google Gemini, OpenRouter, DeepSeek, NVIDIA NIM, Fireworks, Groq, Mistral, Cohere, Together, Cerebras, Perplexity and xAI, or point Dirgha at any OpenAI-compatible endpoint. For local and offline work, use Ollama or llama.cpp; a quantized 7B model runs on an ordinary laptop with no GPU.

Keys live in `~/.dirgha/keys.json` or environment variables (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `NVIDIA_API_KEY`). Dirgha sends them only to the provider they belong to.

## Safety model

- **Every tool call is checked first.** The WebAssembly gate screens shell commands, file paths, secrets and network targets. If the gate is missing or errors, the call is refused (`DIRGHA_ALLOW_UNGATED=1` turns this off for local development and prints a warning).
- **Physical actions need a person.** Actions marked S2 (irreversible or physical) are refused unless they carry an Ed25519 signature from an approver you configured. The agent cannot approve itself.
- **Silence means no.** An approval that doesn't arrive in time is a refusal.
- **Decisions are recorded.** Gate decisions go into a hash-chained, signed ledger you can verify with your own public key.
- **The cockpit is locked.** Its API needs a bearer token and accepts no cross-origin requests.
- **No telemetry by default.** Usage statistics are off unless you run `dirgha telemetry enable`.

The built-in gate is a fast first-pass filter. For rules your team writes and signs, approvals from separate people, and evidence an auditor can check, use [LOKAHI](https://github.com/Dirgha-AI/lokahi) (`pip install lokahi`). Dirgha is moving to LOKAHI's reference rules; see the [roadmap](#roadmap).

## Robotics and physical AI

Dirgha uses the same harness for robots. Today that means simulation:

- `dirgha eval-robot` runs seeded MuJoCo rollouts on bundled arm models and reports success with confidence intervals, failure classes and an HTML replay.
- `dirgha_sim_reset`, `dirgha_sim_step` and `dirgha_sim_observe` let an agent drive a simulation step by step over MCP.
- `dirgha_gate_check` puts the safety gate in front of a proposed robot action.

Several robotics and hardware tools are **demos**: they show the interface but do not call real models, vendors or services, and every response includes `"simulated": true`. They are `dirgha_policy_infer`, `physical_ai_vla_infer`, `hf_lerobot_dataset_sync`, `hardware_cad_pcb_generate`, `hardware_vendor_quote_order` and `robotics_skill_invoke`.

## Documentation

| Guide | |
|---|---|
| [Getting started](docs/getting-started.md) | Install, pick a model, first tasks |
| [Safety model](docs/safety.md) | The gate, S2 approvals, the ledger, the cockpit |
| [MCP tools](docs/mcp-tools.md) | All 24 kernel tools, generated from the binary |
| [Robotics](docs/robotics.md) | MuJoCo evaluation and simulation tools |
| [Local models](docs/local-models.md) | Ollama and llama.cpp |
| [Fleet](docs/tutorials/fleet.md) and [sub-agents](docs/tutorials/subagents.md) | Parallel and delegated work |
| [Extensions](docs/extensions.md) | Plugin API |

## For AI agents

If you are an AI agent working with or on this repository:

- **[AGENTS.md](AGENTS.md)** tells you how to build, test and change this codebase safely.
- **[llms.txt](llms.txt)** is a short index of the docs, for loading into context.
- **[docs/agents/](docs/agents/)** has task guides: long-running commands, file search, skill security.
- To use Dirgha's tools from another agent, run `dirgha-native-host --mcp` (stdio). Call `tools/list` for the 24 tools and their schemas. Respect `"simulated": true` in responses.

## The Dirgha AI stack

Dirgha is one part of a small set of open tools, each usable on its own:

| Step | Project | What it does | Licence |
|---|---|---|---|
| Scan | [Arniko](https://github.com/Dirgha-AI/arniko) | Runs existing security scanners over an agent's code and dependencies and merges the findings | Apache-2.0 |
| Assess | [Ahimsa AI](https://github.com/Dirgha-AI/ahimsa-ai) | Scores a project's risk of harm and public benefit, and compiles approved projects into rules | MIT |
| Enforce | [LOKAHI](https://github.com/Dirgha-AI/lokahi) | An open rules format and gate: signed rules files, approvals from separate people, evidence packs, a conformance suite | Apache-2.0 |
| Run | **Dirgha** | The harness that runs agents and robots behind a gate | Apache-2.0 |

## Project status

Dirgha 2.0 is an early release for developers and pilots.

- The coding agent is the most mature part; it grew out of the 1.x releases on npm.
- The Rust kernel, gate and MuJoCo sidecar work and are tested in CI on Linux and Windows.
- The robotics model and hardware integrations listed above are demos.
- Nothing here has been independently security-reviewed. Don't rely on it to protect production systems yet.

## Roadmap

1. Run LOKAHI's reference rules inside Dirgha, passing the same conformance suite as the Python implementation.
2. Prebuilt kernel binaries for Windows, macOS and Linux; 2.0 on npm.
3. Arniko as an optional built-in scan before an agent runs.
4. Real robot policy adapters in place of the demos, behind the same gate.
5. A remote cockpit to approve actions and read logs from your phone.

## For organisations

Dirgha and LOKAHI are free and open source. If your organisation wants to run agents under written rules, Dirgha AI can help with setup, custom rule packs, pilots and support. Open an [issue](https://github.com/Dirgha-AI/dirgha/issues/new) titled "Pilot" and we will reply.

## About Dirgha AI

Dirgha AI builds open infrastructure so AI agents and robots act only within rules people set, and can prove it. We think the people who live with an AI system's actions should decide what it may do, and that the tools to check those decisions should belong to everyone. That is why the core is open source, runs on hardware people already own, and works offline.

Dirgha AI is led by [Salik Shah](https://salikshah.com), working with an open community of contributors.

## Contributing, security and licence

- **Contributing:** issues and pull requests are welcome. Sign off your commits (`git commit -s`) under the [Developer Certificate of Origin](https://developercertificate.org/). See [CONTRIBUTORS.md](CONTRIBUTORS.md).
- **Security:** report vulnerabilities privately to security@dirgha.ai. See [SECURITY.md](SECURITY.md).
- **Licence:** Apache-2.0 ([LICENSE](LICENSE), [NOTICE](NOTICE)). Copyright 2026 Salik Shah. Releases 1.x of `@dirgha/code` keep their FSL-1.1-MIT licence, and each becomes MIT two years after release. Third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
