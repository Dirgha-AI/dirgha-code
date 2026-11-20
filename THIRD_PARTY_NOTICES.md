# Third-Party Notices & Upstream Open-Source Attributions

Dirgha v2 builds upon and interoperates with the following open-source software and research specifications. We gratefully acknowledge their authors:

1. **`deepseek-ai/deepseek-recipe` (`0.2.0`) & `deepseek-ai/deepseek-harness` (`dsh`)**
   - **Author:** DeepSeek-AI
   - **License:** MIT License (`https://github.com/deepseek-ai/deepseek-recipe`, `https://github.com/deepseek-ai/deepseek-harness`)
   - **Usage in Dirgha v2:** `crates/llm-router` directly links `deepseek-recipe-core@0.2.0` for conversation, prompt, and tool-call structures; `crates/agent-loop` and `plugins/dsh-plugin-dirgha` adopt `dsh`'s Cordis waterfall hook semantics (`agent/pre-step`, `tools/pre-execute`, `tools/post-execute`) and `session.vN.jsonl` log invariants.

2. **`SouravBeraAkaSpeed/xiryn`**
   - **Author:** Sourav Bera
   - **License:** MIT License (`https://github.com/SouravBeraAkaSpeed/xiryn`)
   - **Usage in Dirgha v2:** Architectural patterns for `<untrusted source="...">` prompt-injection defusal (`crates/dirgha-core`), `prepareStep` sliding-window context compaction (retaining the 2 most recent screenshots and 6 most recent tool outputs), OS-keychain `AES-256-GCM` (Windows DPAPI, macOS Keychain, Linux `secret-tool`) origin-verified `vault_fill`, and disposable Docker `workstation/` + Telegram takeover tunnel (`dirgha computer`).

3. **`traycerai/traycer`**
   - **Author:** Traycer AI, Inc.
   - **License:** MIT License (Clients, CLI & Protocol: `https://github.com/traycerai/traycer`)
   - **Usage in Dirgha v2:** Architectural inspiration for monotonic `generation`-stamped accessibility tree snapshots (`STALE_DOM_GENERATION` fail-closed ref verification in `crates/dirgha-core` and `extensions/firefox-mv3/`) and MCP/BYOA integration.

4. **`HKUDS` (Data Intelligence Lab @ The University of Hong Kong)**
   - **Repositories:** `HKUDS/AgentPilot`, `HKUDS/AutoSwarm`, `HKUDS/CLI-Anything`, `HKUDS/PhoneCLI`, `HKUDS/LightRAG`, `HKUDS/HELIX` (arXiv:2608.13951), `HKUDS/MGP`, `HKUDS/PrivacyFlow`
   - **License:** MIT License / Apache-2.0 (`https://github.com/HKUDS`)
   - **Usage in Dirgha v2:** `PrivacyFlow` local `<SECRET_HANDLE_01>` masking in `crates/llm-router`; `AgentPilot` KL-UCB (`D1/D2/D3`) search state + `HELIX` 96-port harness atom recomposition in `crates/flywheel-engine`; `RSI Arena` benchmark protocol; and `AutoSwarm` / `CLI-Anything` L3/L4 bridges.

5. **`thinksabin/DTrackAuditor`**
   - **Author:** Sabin Ranjit (external contributor)
   - **License:** Apache-2.0 / MIT (`https://github.com/thinksabin/DTrackAuditor`)
   - **Usage in Dirgha v2:** Core OWASP Dependency-Track SBOM policy and vulnerability auditing logic integrated into `crates/arniko-audit`.
