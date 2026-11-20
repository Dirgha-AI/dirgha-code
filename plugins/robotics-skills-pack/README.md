# `robotics-skills-pack` — Assembled Native Robotics & Hardware Skills for Dirgha Harness 2.0

This pack assembles all 7 domain-specialized robotics, mechanical design review, isometric anatomy, and deployment verification skills directly into the Dirgha Harness 2.0 runtime (`robotics_skill_invoke` MCP tool and `/opt/dirgha/plugins/robotics-skills-pack` inside `workstation/Dockerfile`).

## Assembled Skills

| Skill ID | Engineering Purpose in Dirgha Harness 2.0 |
| :--- | :--- |
| **`hardware-design-review`** | Independently re-derives actuator torque ($\tau = K_t I N \eta$), thermal dissipation ($I^2 R$), structural safety factor, and evidence grades before hardware release or vendor ordering. |
| **`anatomy`** | Generates crafted isometric SVG technical figures with four-tone shading, convex solid parts, painter's order, and live readouts for actuators, gearboxes, and test rigs. |
| **`anatomy-reveal`** | Builds interactive exploded-view dissection pages and 30fps product-reveal storyboards for physical assemblies. |
| **`teleop-verifier`** | Audits robot episodes and demo footage to determine whether execution was **Autonomous (`S1`/`S2`)**, **Human-Teleoperated**, or **Simulated** before publishing or settling escrow. |
| **`disclosure-scorecard`** | Scores any humanoid or manipulator deployment against the 7-field robotics disclosure standard (Autonomy, MTBI, Speed `1.0x`, Uncut Ratio, Environment, Payload, Safety). |
| **`claim-register`** | Registers factual engineering numbers and vendor specs with source tiering (`Tier 1`–`Tier 3`), `BLAKE3` hashes, and expiration dates. |
| **`robotics-visual`** | Selects and configures the lightest high-clarity diagram, torque-speed curve, or workspace envelope visual for engineering reports. |
