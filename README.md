# Dirgha

**An open-source agent harness for software and robots, with a safety check in front of every action.**

Dirgha runs AI agents on your own machine. It works with local models and with the providers you already use, connects to tools over the Model Context Protocol (MCP), and checks each action before it runs. The same harness drives a coding agent in your terminal and robot simulations in MuJoCo.

Dirgha is part of a small set of open tools from Dirgha AI:

| Step | Project | What it does |
|---|---|---|
| Scan | [Arniko](https://github.com/Dirgha-AI/arniko) | Finds weaknesses in an agent's code and dependencies before deployment |
| Assess | [Ahimsa AI](https://github.com/Dirgha-AI/ahimsa-ai) | Turns a project's impact review into rules |
| Enforce | [LOKAHI](https://github.com/Dirgha-AI/lokahi) | The open rules format and gate: checks every action against rules people wrote |
| Run | **Dirgha** (this repo) | The harness that runs agents, locally or with your providers |

Arniko and Ahimsa AI are optional.

**Status:** 2.0 is an early release for developers and pilots. It has not been independently security-reviewed. Several robotics and hardware tools are demos that return simulated results; they are listed below.

## What works today

- **Coding agent.** An interactive terminal agent and a headless mode (`dirgha ask`), with 38 subcommands and 18 built-in tools: files, shell, search, git, memory, sub-agents in git worktrees, sessions you can export and import.
- **Any model.** Bring your own keys for OpenRouter, Anthropic, OpenAI, Google and NVIDIA, or run local models through Ollama or llama.cpp. Keys stay in `~/.dirgha/keys.json`.
- **Local memory.** Long-term memory and search in SQLite on your machine. Telemetry is off unless you turn it on.
- **Rust kernel.** `dirgha-native-host`, about 1 MB, serves 24 MCP tools over stdio, browser native messaging and a local HTTP cockpit. The cockpit requires a bearer token and accepts no cross-origin requests.
- **Action gate.** A WebAssembly gate built from `crates/lokahi-gate` screens shell commands, file paths, secrets and network targets before a tool call runs. If the gate is missing or fails, the call is refused. Physical actions (S2) need an Ed25519 signature from a configured approver. Every decision goes into a signed, hash-chained local ledger.
- **Robot evaluation.** A MuJoCo sidecar runs seeded rollouts on simple arm models, reports success rates with confidence intervals, classifies failures, and writes an HTML replay.

This built-in gate is a fast first-pass filter. The full LOKAHI standard (signed rules files, approvals from separate people, evidence packs and a conformance suite) lives in the [LOKAHI repo](https://github.com/Dirgha-AI/lokahi) and is installable with `pip install lokahi`. Dirgha will move to it; see the roadmap.

### Demo tools

These tools exist so you can try the interfaces. They do not call real models, vendors or services, and every response includes `"simulated": true`:

`dirgha_policy_infer`, `physical_ai_vla_infer`, `hf_lerobot_dataset_sync`, `hardware_cad_pcb_generate`, `hardware_vendor_quote_order`, `robotics_skill_invoke`.

## Install from source

Requirements: Node.js 22 or later. Rust stable is needed for the native kernel.

```bash
git clone https://github.com/Dirgha-AI/dirgha.git
cd dirgha
npm ci
npm run build                 # TypeScript CLI
npm run build:native          # Rust kernel (optional)
node bin/dirgha.mjs doctor    # check the setup
node bin/dirgha.mjs           # start the agent
```

Run the tests:

```bash
cargo test --workspace
npx vitest run --dir src
node --test ./bin/dirgha.test.mjs
```

`npm install -g @dirgha/code` currently installs the 1.x release. 2.0 will be published to npm after this release settles.

## Repository layout

| Path | Contents |
|---|---|
| `src/` | TypeScript CLI and agent |
| `bin/` | Launcher that routes commands to the CLI or the Rust kernel |
| `crates/` | Rust workspace: `native-host`, `lokahi-gate`, `dirgha-core`, `llm-router`, `agent-loop`, `memory-mgp`, `arniko-audit`, `dtrack-rs`, `flywheel-engine` |
| `extensions/firefox-mv3/` | Browser extension that runs the WebAssembly gate |
| `plugins/` | Robotics plugins, including the MuJoCo evaluation sidecar |
| `docs/` | Architecture, CLI, security and tutorial docs |

## Roadmap

1. Replace `crates/lokahi-gate` with the LOKAHI reference rules, passing the same conformance suite as the Python implementation.
2. Move the Arniko crates to the Arniko repo, behind an optional `arniko` feature.
3. Prebuilt kernel binaries for Windows, macOS and Linux, and 2.0 on npm.
4. Physical action classes in the LOKAHI spec, and real robot policy adapters in place of the demos.

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Copyright 2026 Salik Shah.

Releases 1.x of `@dirgha/code` were published under FSL-1.1-MIT and keep that licence; each becomes MIT two years after its release. Third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and contributors in [CONTRIBUTORS.md](CONTRIBUTORS.md).

Security issues: security@dirgha.ai (see [SECURITY.md](SECURITY.md)).
