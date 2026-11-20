# DIRGHA.md

Project notes that Dirgha loads when it works in this repository.

Follow [AGENTS.md](AGENTS.md): it has the build and test commands, the layout and the rules for changes. The short version: keep the safety gate fail-closed, mark simulated results with `"simulated": true`, never commit keys, and run `npm run typecheck`, `npx vitest run --dir src` and `cargo test --workspace` before you finish.

