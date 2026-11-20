# `robotics-physical-ai` — Layer 3 Lazy-Loaded Plugin for Dirgha v2

This plugin mounts the **Oct 27 Physical AI & Robotics Harness** (`final/00_README.md` – `final/10_EXPANSION_ACCEPTANCE.md` and `final/schemas/*.json`) into the **Dirgha v2 Sovereign Agentic Runtime** under the Layer 3 Zero-Idle Lazy-Load ABI (`dirgha_v2_spec_blueprint_roadmap-nov 08 26.md` §4.3).

## Key Properties

- **`0 KB` Idle RAM Footprint:** Remains unmounted on everyday coding and browsing sessions so Dirgha v2 strictly passes the `<25 MB` static binary and `<150 MB` 2 GB Windows 10 (1809) legacy gate.
- **Automatic Activation & 60s Eviction:** Activates automatically on `dirgha sim`, `dirgha eval`, `dirgha gate`, or when `.mjcf` / `.urdf` files are detected in the workspace, and evicts after 60 seconds of inactivity.
- **Unified `lokahi-gate` Hardware Safety (`S0` / `S1` / `S2`):**
  - `S0` (Read) and `S1` (MuJoCo / Isaac / Gazebo simulation) tools execute locally with deterministic `repro_hash` trace logging into `crates/memory-mgp`.
  - `S2` (Real ROS 2 / hardware actuation) is governed by **`crates/lokahi-gate` Rule 14 (Ahimsa 45-Second Timeout)** and **Rule 17/18**, requiring a verified human cryptographic approval signature and passing velocity/force bounds before any physical actuation can occur.
