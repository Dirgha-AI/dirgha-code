# MCP tools

`dirgha-native-host --mcp` serves these tools over stdio. This page is generated from the binary's own `tools/list` reply, so it matches the code.

Every call passes through the safety gate. Tools whose description starts with **Demo:** do not call real models, vendors or services, and their responses include `"simulated": true`.

Total: 24 tools.

| Tool | Description | Inputs |
|---|---|---|
| `lokahi_verify_action` | Evaluate a proposed tool call, shell command, browser click, or robot S0/S1/S2 action against the gate rules (shell, file, secret and network checks, robot joint limits, and the S2 approval check) and append the decision to the signed audit ledger. S2... | `tool_name`*, `payload`*, `safety_class`*, `human_signature_verified`*, `approval_wait_ms`*, `approval_signature_hex`, `approver_public_key_hex`, `joint_velocity_rad_s`, `max_joint_velocity_limit` |
| `arniko_scan_sarif` | Normalize and deduplicate multi-scanner findings (Semgrep, Trivy, Gitleaks, DTrackAuditor) into OASIS SARIF v2.1.0 with deterministic symbolic AST patches. | `findings`* |
| `privacy_mask_text` | Mask raw API keys, tokens, and PII with deterministic <SECRET_HANDLE_NN> handles via PrivacyFlow before cloud LLM transmission. | `text`* |
| `dom_verify_target` | Fail-closed check that an agent's target (requested_generation, idx) matches the live Firefox/Chrome MV3 Compact Agent-DOM snapshot. | `snapshot`*, `requested_generation`*, `idx`* |
| `mgp_memory_recall` | Recall verified trajectories from the HKUDS/MGP v0.1.1 lexical & LightRAG entity graph. | `query`* |
| `vault_list_masked` | Return masked hints (e.g. 'Visa ···· 4242') and bound origins from the OS-keychain AES-256-GCM vault without exposing raw secrets. | none |
| `dirgha_workspace_get` | [L3 Robotics Plugin] Return the resolved robot, scene, policy, simulation, eval and safety configuration. | `workspace_id`* |
| `dirgha_sim_reset` | [L3 Robotics Plugin] Reset a MuJoCo simulation session to the initial state with a deterministic seed. | `session_id`*, `seed` |
| `dirgha_sim_step` | [L3 Robotics Plugin] Apply an action to a simulation session for one or more physics steps. | `session_id`*, `action`* |
| `dirgha_sim_observe` | [L3 Robotics Plugin] Return current joint state, sensor data, and image artifact references. | `session_id`* |
| `dirgha_policy_load` | [L3 Robotics Plugin] Load a LeRobot/openpi policy checkpoint and return its observation/action contract. | `workspace_id`*, `policy_id`* |
| `dirgha_policy_infer` | Demo: [L3 Robotics Plugin] Return a deterministic offline action chunk; no policy model was called. | `policy_session_id`*, `observation`* |
| `dirgha_eval_run` | [L3 Robotics Plugin] Run a reproducible MuJoCo 3.17.0 evaluation suite with Wilson 95% CI and repro_hash. | `workspace_id`*, `suite`* |
| `dirgha_trace_get` | [L3 Robotics Plugin] Return a summary, repro_hash, and safety events for an episode trace. | `trace_id`* |
| `dirgha_replay_create` | [L3 Robotics Plugin] Create a standalone browser replay HTML viewer and return its path and trace hash. | `trace_id`* |
| `dirgha_gate_check` | [L3 Robotics Plugin] Evaluate a release gate against an eval run via Lokahi Rule 14/17/18. | `workspace_id`*, `profile`* |
| `dtrack_generate_vex` | [dtrack-rs / EU CRA] Parse a CycloneDX 1.6, SPDX 3.0, Cargo.lock, or package-lock.json and emit a BLAKE3 + Ed25519 signed OASIS CSAF 2.0 / VEX attestation bundle. | `project_name`*, `project_version`, `sbom_json`, `lockfile_text`, `lockfile_path` |
| `physical_ai_vla_infer` | Demo: [Physical AI Brain & World Gateway] Generate an offline simulated action preview; no pi0/openpi, GR00T/Cosmos, Dream Labs, or LeRobot model/network call is made. | `provider`*, `model_id`*, `task_instruction`*, `joint_positions`, `min_confidence_for_autonomy` |
| `hf_lerobot_dataset_sync` | Demo: [Hugging Face LeRobot Gateway] Package a local placeholder LeRobot v2.0 bundle; nothing is uploaded. | `repo_id`*, `robot_type`*, `fps`, `total_episodes`, `total_frames`, `dof`, `episode_trace_blake3` |
| `hardware_cad_pcb_generate` | Demo: [Hardware CAD/PCB/Blender Gateway] Generate deterministic placeholder CAD/PCB files locally; no vendor service is contacted. | `artifact_id`*, `tool_kind`*, `component_name`*, `params_summary` |
| `hardware_vendor_quote_order` | Demo: [Robotics & PCB Vendor Gateway] Produce a deterministic local quote only; no vendor is contacted and no order is placed. | `quote_id`*, `vendor`*, `design_artifact_blake3`*, `quantity_units`, `place_order`, `lokahi_rule14_approved`, `vault_origin_verified` |
| `robotics_skill_invoke` | Demo: [Assembled Robotics Skills Pack] Invoke deterministic offline skill stubs; fixed outputs are marked simulated. | `skill_id`*, `target_subject`*, `params` |
| `cockpit_state_snapshot` | [Desktop & Mobile Remote Control Cockpit] Return the live multi-tile state snapshot (3D MuJoCo/PCB/Anatomy viewports, WebXR/Touch Teleop joystick, Lokahi Rule 14 approval queue, and event inbox) and write data/cockpit.html. | `active_viewport` |
| `dirgha_acceptance_run` | [Integrator Site Acceptance Pack ($3K-$7K Wedge)] Execute the 20-scenario MuJoCo perturbation matrix (Nominal, Payload +30%, Sensor Noise, Nominal Seed Variations, and Voltage Droop) and emit an Ed25519-signed SiteAcceptanceDossier + customer sign-off HTML... | `site_name`*, `robot_id`*, `safety_limit_rad_s` |

`*` marks required inputs. Run `tools/list` yourself for the full JSON schemas.

## Calling a tool

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"me","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | dirgha-native-host --mcp
```
