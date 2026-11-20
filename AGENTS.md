# AGENTS.md

Instructions for AI coding agents working in this repository. Humans: see [README.md](README.md).

## What this repo is

Dirgha 2.0: a TypeScript coding agent (`src/`) and a Rust kernel (`crates/`) behind one launcher (`bin/dirgha.mjs`). The launcher sends kernel verbs (`--self-test`, `--mcp`, `cockpit`, `eval-robot`, and others listed in `V2_KERNEL_VERBS`) to `dirgha-native-host`, and everything else to the TypeScript CLI in `dist/cli/main.js`.

## Build and test

```bash
npm ci                              # Node 22+, npm 11 (the lock file is written by npm 11)
npm run typecheck                   # must report 0 errors
npm run build                       # TypeScript -> dist/
npx vitest run --dir src            # TypeScript unit tests
node --test ./bin/dirgha.test.mjs   # launcher tests
cargo test --workspace              # Rust tests
cargo build --release -p native-host
```

CI runs all of these on every push to `main` (Rust on Linux and Windows, TypeScript on Linux). Some TypeScript tests are slow or flaky on Windows because they share `~/.dirgha`; run them on Linux or set `HOME` to a temporary folder.

## Layout

| Path | What lives there |
|---|---|
| `src/kernel/` | Agent loop, messages, event stream |
| `src/tools/` | Built-in tools and their registry (`index.ts`) |
| `src/providers/` | Model providers; add a new OpenAI-compatible one with `define-openai-compat.ts` |
| `src/safety/policy.ts` | Loads the WebAssembly gate; must fail closed |
| `src/cli/` | Subcommands and slash commands |
| `crates/native-host/` | MCP server, cockpit, CLI verbs (`src/lib.rs` holds the tool table) |
| `crates/lokahi-gate/` | Rules, S2 signature checks, ledger; also built to WebAssembly |
| `crates/*` | Other kernel crates (see README) |
| `plugins/robotics-physical-ai/` | MuJoCo sidecar (`mujoco_eval_sidecar.py`) |
| `extensions/firefox-mv3/` | Browser extension and the built `lokahi_gate.wasm` |

## Rules for changes

1. **Keep the gate fail-closed.** Any change to `src/safety/policy.ts` or `crates/lokahi-gate` must keep refusing when the gate is missing, errors or returns an unknown value. Add a test for each new case.
2. **Never report a result you did not compute.** Tools that don't call a real service must return `"simulated": true` and start their description with `Demo:`.
3. **No secrets in the repo.** Tests may create keys under `data/keys/`; that folder is git-ignored. Never commit `.key`, `.pem` or `.env` files, or real API keys in fixtures.
4. **No new network calls in tests.** Tests run offline in CI.
5. **Keep tool counts honest.** If you add or remove an MCP tool, update `bin/dirgha.mjs`, `bin/dirgha.test.mjs` and the README.
6. **Licence.** New files are Apache-2.0. Don't copy code from projects with incompatible licences; record third-party code in `THIRD_PARTY_NOTICES.md`.
7. **Sign off commits** (`git commit -s`).

## Using Dirgha's tools from another agent

Start the MCP server over stdio:

```bash
dirgha-native-host --mcp          # or: node bin/dirgha.mjs --mcp
```

Send `initialize`, then `tools/list`. Every tool call passes through the gate. If a response includes `"simulated": true`, treat it as demo output, not a real result.
