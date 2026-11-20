# Robotics and physical AI

Dirgha runs robot work through the same harness and gate as code. Today that means simulation in MuJoCo. Real-robot adapters are on the roadmap.

## Requirements

- The Rust kernel (`npm run build:native`).
- Python 3.10+ with MuJoCo: `pip install mujoco numpy`.
- No GPU needed. On Linux without a display, set `MUJOCO_GL=osmesa`.

## Evaluate a policy

```bash
dirgha eval-robot
```

The sidecar (`plugins/robotics-physical-ai/mujoco_eval_sidecar.py`) runs seeded rollouts on the bundled models (`dirgha_2dof_reacher`, `so101_6dof_arm`, `dex_arm_01_tendon`), reports the success rate with a confidence interval, classifies each failure, and writes an HTML replay. If the sidecar can't be found, the command returns `sidecar_not_found` instead of a score.

## Drive a simulation from an agent

Over MCP (`dirgha-native-host --mcp`):

| Tool | Use |
|---|---|
| `dirgha_sim_reset` | Load a model and reset it |
| `dirgha_sim_step` | Apply an action for one or more steps |
| `dirgha_sim_observe` | Read the current state |
| `dirgha_gate_check` | Ask the gate whether a proposed robot action is allowed |
| `dirgha_eval_run` | Run an evaluation |
| `dirgha_replay_create` | Write an HTML replay |
| `dirgha_acceptance_run` | Run the acceptance scenarios |

Physical actions use safety class `S2HardwareOrCritical` and need a signed approval; see [safety.md](safety.md).

## Demo tools

These show the interface for future integrations. They do not call real models, vendors or services, and each response includes `"simulated": true`:

- `dirgha_policy_infer`, `physical_ai_vla_infer`: placeholder robot policies, no model is called.
- `hf_lerobot_dataset_sync`: writes a local dataset layout; nothing is uploaded.
- `hardware_cad_pcb_generate`: placeholder CAD and PCB files.
- `hardware_vendor_quote_order`: placeholder quote; no order is placed (`DEMO_QUOTE_ONLY_NOT_ORDERED`).
- `robotics_skill_invoke`: fixed example outputs.

The acceptance scenarios named `NOMINAL_SEED_VARIATION` vary only the random seed.

## Roadmap

- Adapters for real robot policies (LeRobot, openpi) behind the same gate.
- Physical action classes in the LOKAHI rules format, so a team's written limits apply to robots the same way they apply to code.
