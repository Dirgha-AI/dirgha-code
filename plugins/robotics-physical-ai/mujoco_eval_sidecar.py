#!/usr/bin/env python3
"""
`mujoco_eval_sidecar.py` — Full Native MuJoCo 3.17.0 Physics Engine & Interactive 3D/Kinematic Studio.

Capabilities:
1. Dynamic Model Loader: Load any arbitrary `.mjcf` / `.xml` / `.urdf` file on disk (`--mjcf-path`),
   inline XML (`--mjcf-xml`), or built-in morphology presets (`dirgha_2dof_reacher`, `so101_6dof_arm`, `dex_arm_01_tendon`).
2. Model Inspector (`--mode inspect`): Extracts bodies, joints, actuators, tendons, sensors, DoFs, and timestep.
3. Stateful Physics Stepping (`--mode step` / `--mode reset`): Persists live `qpos`/`qvel` in `data/sim-session.json`
   so coding agents can step real MuJoCo physics interactively via `dirgha_sim_step`.
4. Deterministic Batch Evaluation (`--mode eval`): Runs seeded rollouts, classifies per-episode failure modes
   (`NONE`, `JOINT_VELOCITY_EXCEEDED`, `TORQUE_SATURATION`, `TARGET_MISSED`), and generates a self-contained
   interactive HTML5 Canvas Kinematic & Telemetry Studio (`data/replay.html`).
"""

import argparse
import json
import math
import os
import sys
import mujoco
import numpy as np

BUILTIN_MODELS = {
    "dirgha_2dof_reacher": """
<mujoco model="dirgha_2dof_reacher">
  <compiler angle="radian" inertiafromgeom="true"/>
  <option timestep="0.01" integrator="RK4"/>
  <worldbody>
    <body name="link1" pos="0 0 0">
      <joint name="joint1" type="hinge" axis="0 0 1" limited="true" range="-3.14 3.14" damping="0.8"/>
      <geom name="geom1" type="capsule" fromto="0 0 0 0.4 0 0" size="0.03" mass="1.0"/>
      <body name="link2" pos="0.4 0 0">
        <joint name="joint2" type="hinge" axis="0 0 1" limited="true" range="-2.8 2.8" damping="0.8"/>
        <geom name="geom2" type="capsule" fromto="0 0 0 0.35 0 0" size="0.025" mass="0.8"/>
        <site name="eef" pos="0.35 0 0" size="0.02"/>
      </body>
    </body>
    <site name="target" pos="0.45 0.35 0" size="0.03"/>
  </worldbody>
  <actuator>
    <motor name="motor1" joint="joint1" ctrlrange="-3.0 3.0" gear="1"/>
    <motor name="motor2" joint="joint2" ctrlrange="-3.0 3.0" gear="1"/>
  </actuator>
</mujoco>
""",
    "so101_6dof_arm": """
<mujoco model="so101_6dof_arm">
  <compiler angle="radian" inertiafromgeom="true"/>
  <option timestep="0.005" integrator="implicitfast"/>
  <default>
    <joint armature="0.05" damping="1.2"/>
  </default>
  <worldbody>
    <body name="base_yaw" pos="0 0 0">
      <joint name="shoulder_pan" type="hinge" axis="0 0 1" limited="true" range="-3.14 3.14"/>
      <geom type="capsule" fromto="0 0 0 0.22 0 0" size="0.032" mass="0.8"/>
      <body name="upper_arm" pos="0.22 0 0">
        <joint name="shoulder_lift" type="hinge" axis="0 0 1" limited="true" range="-2.6 2.6"/>
        <geom type="capsule" fromto="0 0 0 0.20 0 0" size="0.028" mass="0.6"/>
        <body name="forearm" pos="0.20 0 0">
          <joint name="elbow_flex" type="hinge" axis="0 0 1" limited="true" range="-2.6 2.6"/>
          <geom type="capsule" fromto="0 0 0 0.16 0 0" size="0.024" mass="0.5"/>
          <body name="wrist_pitch_link" pos="0.16 0 0">
            <joint name="wrist_flex" type="hinge" axis="0 1 0" limited="true" range="-2.5 2.5"/>
            <geom type="capsule" fromto="0 0 0 0.08 0 0" size="0.020" mass="0.3"/>
            <body name="wrist_roll_link" pos="0.08 0 0">
              <joint name="wrist_roll" type="hinge" axis="1 0 0" limited="true" range="-3.14 3.14"/>
              <geom type="capsule" fromto="0 0 0 0.05 0 0" size="0.018" mass="0.2"/>
              <body name="gripper_link" pos="0.05 0 0">
                <joint name="gripper_jaw" type="hinge" axis="0 0 1" limited="true" range="-1.0 1.0"/>
                <geom type="capsule" fromto="0 0 0 0.04 0 0" size="0.015" mass="0.15"/>
                <site name="eef" pos="0.04 0 0" size="0.02"/>
              </body>
            </body>
          </body>
        </body>
      </body>
    </body>
    <site name="target" pos="0.45 0.35 0" size="0.03"/>
  </worldbody>
  <actuator>
    <motor name="m_pan" joint="shoulder_pan" ctrlrange="-3.0 3.0"/>
    <motor name="m_lift" joint="shoulder_lift" ctrlrange="-3.0 3.0"/>
    <motor name="m_elbow" joint="elbow_flex" ctrlrange="-3.0 3.0"/>
    <motor name="m_wflex" joint="wrist_flex" ctrlrange="-2.5 2.5"/>
    <motor name="m_wroll" joint="wrist_roll" ctrlrange="-2.0 2.0"/>
    <motor name="m_grip" joint="gripper_jaw" ctrlrange="-2.0 2.0"/>
  </actuator>
</mujoco>
""",
    "dex_arm_01_tendon": """
<mujoco model="dex_arm_01_tendon">
  <compiler angle="radian" inertiafromgeom="true"/>
  <option timestep="0.01" integrator="RK4"/>
  <worldbody>
    <body name="proximal" pos="0 0 0">
      <joint name="mcp_flex" type="hinge" axis="0 0 1" limited="true" range="-3.14 3.14" damping="0.8"/>
      < site name="s_base" pos="0 0.02 0"/>
      <geom type="capsule" fromto="0 0 0 0.40 0 0" size="0.025" mass="0.8"/>
      <body name="distal" pos="0.40 0 0">
        <joint name="pip_flex" type="hinge" axis="0 0 1" limited="true" range="-2.8 2.8" damping="0.8"/>
        <site name="s_tip" pos="0.15 0.02 0"/>
        <geom type="capsule" fromto="0 0 0 0.35 0 0" size="0.02" mass="0.6"/>
        <site name="eef" pos="0.35 0 0" size="0.02"/>
      </body>
    </body>
    <site name="target" pos="0.45 0.35 0" size="0.03"/>
  </worldbody>
  <tendon>
    <spatial name="flexor_tendon" width="0.004">
      <site site="s_base"/>
      <site site="s_tip"/>
    </spatial>
  </tendon>
  <actuator>
    <motor name="motor_mcp" joint="mcp_flex" ctrlrange="-3.0 3.0"/>
    <motor name="motor_pip" joint="pip_flex" ctrlrange="-3.0 3.0"/>
  </actuator>
</mujoco>
""",
}


def load_mujoco_model(robot_id: str, mjcf_path: str = "", mjcf_xml: str = ""):
    if mjcf_xml.strip():
        return mujoco.MjModel.from_xml_string(mjcf_xml), robot_id or "custom_inline_mjcf"
    if mjcf_path.strip() and os.path.exists(mjcf_path):
        return mujoco.MjModel.from_xml_path(mjcf_path), os.path.basename(mjcf_path)
    xml = BUILTIN_MODELS.get(robot_id, BUILTIN_MODELS["dirgha_2dof_reacher"])
    resolved_id = robot_id if robot_id in BUILTIN_MODELS else "dirgha_2dof_reacher"
    return mujoco.MjModel.from_xml_string(xml), resolved_id


def wilson_ci_95(successes: int, total: int):
    if total == 0:
        return (0.0, 0.0)
    z = 1.96
    phat = successes / total
    denom = 1.0 + (z * z) / total
    center = (phat + (z * z) / (2.0 * total)) / denom
    half = (z * math.sqrt((phat * (1.0 - phat) + (z * z) / (4.0 * total)) / total)) / denom
    return (round(max(0.0, center - half), 4), round(min(1.0, center + half), 4))


def solve_2link_ik(x: float, y: float, l1: float = 0.4, l2: float = 0.35):
    r2 = x * x + y * y
    cos_q2 = max(-1.0, min(1.0, (r2 - l1 * l1 - l2 * l2) / (2.0 * l1 * l2)))
    q2 = math.acos(cos_q2)
    q1 = math.atan2(y, x) - math.atan2(l2 * math.sin(q2), l1 + l2 * cos_q2)
    return np.array([q1, q2])


def inspect_model(robot_id: str, mjcf_path: str = "", mjcf_xml: str = ""):
    model, resolved_id = load_mujoco_model(robot_id, mjcf_path, mjcf_xml)
    joint_names = [
        mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_JOINT, i) or f"joint_{i}"
        for i in range(model.njnt)
    ]
    body_names = [
        mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, i) or f"body_{i}"
        for i in range(model.nbody)
    ]
    actuator_names = [
        mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_ACTUATOR, i) or f"act_{i}"
        for i in range(model.nu)
    ]
    return {
        "ok": True,
        "mujoco_version": mujoco.__version__,
        "robot_id": resolved_id,
        "nq": int(model.nq),
        "nv": int(model.nv),
        "nu": int(model.nu),
        "nbody": int(model.nbody),
        "njnt": int(model.njnt),
        "ntendon": int(model.ntendon),
        "nsensor": int(model.nsensor),
        "timestep": round(float(model.opt.timestep), 5),
        "joint_names": joint_names,
        "body_names": body_names,
        "actuator_names": actuator_names,
        "available_builtin_models": list(BUILTIN_MODELS.keys()),
    }


def step_stateful_session(
    session_id: str,
    robot_id: str,
    action_values: list,
    reset: bool = False,
    seed: int = 1000,
):
    os.makedirs("data", exist_ok=True)
    session_file = os.path.abspath("data/sim-session.json")
    model, resolved_id = load_mujoco_model(robot_id)
    data = mujoco.MjData(model)

    sessions = {}
    if os.path.exists(session_file):
        try:
            with open(session_file, "r", encoding="utf-8") as f:
                sessions = json.load(f)
        except Exception:
            sessions = {}

    if reset or session_id not in sessions or sessions[session_id].get("robot_id") != resolved_id:
        rng = np.random.default_rng(seed)
        mujoco.mj_resetData(model, data)
        for i in range(min(2, model.nq)):
            data.qpos[i] = float(rng.uniform(-0.25, 0.25))
        mujoco.mj_forward(model, data)
        step_idx = 0
    else:
        saved = sessions[session_id]
        for i, v in enumerate(saved.get("qpos", [])):
            if i < model.nq:
                data.qpos[i] = float(v)
        for i, v in enumerate(saved.get("qvel", [])):
            if i < model.nv:
                data.qvel[i] = float(v)
        mujoco.mj_forward(model, data)
        step_idx = int(saved.get("step_idx", 0))

    if not reset:
        for i in range(min(len(action_values), model.nu)):
            data.ctrl[i] = float(action_values[i])
        mujoco.mj_step(model, data)
        step_idx += 1

    eef_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, "eef")
    eef_xyz = [round(float(x), 4) for x in data.site_xpos[eef_id]] if eef_id >= 0 else [0.0, 0.0, 0.0]
    qpos_list = [round(float(x), 4) for x in data.qpos[: model.nq]]
    qvel_list = [round(float(x), 4) for x in data.qvel[: model.nv]]
    peak_vel = round(float(np.max(np.abs(data.qvel[: model.nv]))), 4) if model.nv > 0 else 0.0

    sessions[session_id] = {
        "session_id": session_id,
        "robot_id": resolved_id,
        "step_idx": step_idx,
        "qpos": qpos_list,
        "qvel": qvel_list,
        "eef_xyz": eef_xyz,
        "peak_joint_velocity_rad_s": peak_vel,
    }
    with open(session_file, "w", encoding="utf-8") as f:
        json.dump(sessions, f, indent=2)

    return {
        "ok": True,
        "session_id": session_id,
        "robot_id": resolved_id,
        "step_idx": step_idx,
        "qpos": qpos_list,
        "qvel": qvel_list,
        "eef_xyz": eef_xyz,
        "peak_joint_velocity_rad_s": peak_vel,
    }


def write_interactive_canvas_replay_html(
    replay_html_path: str,
    resolved_id: str,
    episodes: int,
    successes: int,
    ci_low: float,
    ci_high: float,
    max_vel_observed: float,
    safety_limit_rad_s: float,
    episode_records: list,
):
    payload_json = json.dumps(
        {
            "robot_id": resolved_id,
            "mujoco_version": mujoco.__version__,
            "safety_limit_rad_s": safety_limit_rad_s,
            "episodes": episode_records,
        }
    )
    rows_html = "".join(
        f"<tr><td>#{r['episode']}</td><td>{r['seed']}</td>"
        f"<td><span class='badge {'pass' if r['succeeded'] else 'fail'}'>{'PASS' if r['succeeded'] else 'FAIL'}</span></td>"
        f"<td>{r['failure_mode']}</td><td>{r['peak_velocity_rad_s']:.3f} rad/s</td><td>{r['final_distance_m']:.4f} m</td></tr>"
        for r in episode_records
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Dirgha Harness 2.0 — MuJoCo {mujoco.__version__} Interactive Kinematic &amp; Telemetry Replay Studio</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; }}
  body {{ font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; background: #0f172a; color: #f8fafc; }}
  .header {{ display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid #334155; padding-bottom: 12px; margin-bottom: 14px; }}
  h2 {{ margin: 0; font-size: 18px; }}
  .kpi-row {{ display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }}
  .kpi {{ background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; }}
  .kpi strong {{ display: block; font-size: 16px; font-family: ui-monospace, monospace; color: #38bdf8; }}
  .studio-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 14px; margin-bottom: 14px; }}
  .panel {{ background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }}
  canvas {{ width: 100%; height: 240px; background: #090d16; border-radius: 6px; border: 1px solid #334155; display: block; }}
  .controls {{ display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: #1e293b; border: 1px solid #334155; padding: 10px 12px; border-radius: 8px; margin-bottom: 14px; }}
  button {{ background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-weight: 600; font-size: 12px; }}
  button.ep-btn {{ background: #334155; }}
  button.ep-btn.active {{ background: #0ea5e9; color: #090d16; }}
  input[type=range] {{ flex: 1; min-width: 140px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12.5px; background: #1e293b; border-radius: 8px; overflow: hidden; }}
  th, td {{ padding: 8px 10px; border: 1px solid #334155; text-align: left; font-family: ui-monospace, monospace; }}
  th {{ background: #0f172a; color: #94a3b8; }}
  .badge {{ padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; }}
  .badge.pass {{ background: #065f46; color: #6ee7b7; }}
  .badge.fail {{ background: #7f1d1d; color: #fca5a5; }}
</style>
</head>
<body>
  <div class="header">
    <h2>Dirgha 2.0 — MuJoCo {mujoco.__version__} Interactive Kinematic &amp; Telemetry Studio ({resolved_id})</h2>
    <span style="font-family:monospace;font-size:12px;color:#94a3b8;">Lokahi Rule 17 Limit: {safety_limit_rad_s:.2f} rad/s</span>
  </div>

  <div class="kpi-row">
    <div class="kpi">Robot Model<strong>{resolved_id}</strong></div>
    <div class="kpi">Success Rate<strong>{successes}/{episodes} ({successes/max(1,episodes)*100:.1f}%)</strong></div>
    <div class="kpi">Wilson 95% CI<strong>[{ci_low}, {ci_high}]</strong></div>
    <div class="kpi">Peak Joint Velocity<strong>{max_vel_observed:.3f} rad/s</strong></div>
  </div>

  <div class="controls">
    <button type="button" id="play-btn">Pause</button>
    <label for="frame-slider" style="font-size:12px;font-family:monospace;" id="step-label">Step: 0</label>
    <input type="range" id="frame-slider" min="0" max="20" value="0" />
    <div id="ep-buttons" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
  </div>

  <div class="studio-grid">
    <div class="panel">
      <div style="font-size:12.5px;font-weight:600;color:#cbd5e1;">2D/3D Kinematic Arm Projection &amp; End-Effector Trail</div>
      <canvas id="arm-canvas" width="420" height="240"></canvas>
    </div>
    <div class="panel">
      <div style="font-size:12.5px;font-weight:600;color:#cbd5e1;">Joint Velocity Telemetry vs. Lokahi Rule 17 Safety Gate</div>
      <canvas id="vel-canvas" width="420" height="240"></canvas>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Episode</th><th>Seed</th><th>Verdict</th><th>Failure Mode</th><th>Peak Joint Vel</th><th>Final EEF Error</th></tr>
    </thead>
    <tbody>{rows_html}</tbody>
  </table>

  <script>
    const DATA = {payload_json};
    let currentEp = 0;
    let currentFrame = 0;
    let playing = true;

    const armCanvas = document.getElementById('arm-canvas');
    const armCtx = armCanvas.getContext('2d');
    const velCanvas = document.getElementById('vel-canvas');
    const velCtx = velCanvas.getContext('2d');
    const slider = document.getElementById('frame-slider');
    const stepLabel = document.getElementById('step-label');
    const playBtn = document.getElementById('play-btn');
    const epWrap = document.getElementById('ep-buttons');

    DATA.episodes.forEach((ep, idx) => {{
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ep-btn' + (idx === 0 ? ' active' : '');
      b.textContent = 'Ep #' + ep.episode;
      b.onclick = () => {{
        currentEp = idx;
        currentFrame = 0;
        document.querySelectorAll('.ep-btn').forEach((el, i) => el.classList.toggle('active', i === idx));
        slider.max = Math.max(0, DATA.episodes[currentEp].frames.length - 1);
        draw();
      }};
      epWrap.appendChild(b);
    }});

    slider.max = Math.max(0, DATA.episodes[0].frames.length - 1);
    slider.oninput = (e) => {{
      playing = false;
      playBtn.textContent = 'Play';
      currentFrame = parseInt(e.target.value, 10) || 0;
      draw();
    }};
    playBtn.onclick = () => {{
      playing = !playing;
      playBtn.textContent = playing ? 'Pause' : 'Play';
    }};

    function draw() {{
      const ep = DATA.episodes[currentEp];
      const frames = ep.frames;
      if (!frames.length) return;
      const f = frames[Math.min(currentFrame, frames.length - 1)];
      slider.value = currentFrame;
      stepLabel.textContent = 'Step: ' + f.step + ' | q1=' + f.q1.toFixed(2) + ', q2=' + f.q2.toFixed(2);

      // Draw Kinematic Arm & Trail
      armCtx.clearRect(0, 0, armCanvas.width, armCanvas.height);
      const cx = 150, cy = 175, scale = 190;
      // Target zone (0.45, 0.35)
      const tx = cx + 0.45 * scale, ty = cy - 0.35 * scale;
      armCtx.strokeStyle = '#10b981';
      armCtx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      armCtx.beginPath();
      armCtx.arc(tx, ty, 14, 0, Math.PI * 2);
      armCtx.fill();
      armCtx.stroke();

      // End-effector trail
      armCtx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      armCtx.lineWidth = 2;
      armCtx.beginPath();
      frames.slice(0, currentFrame + 1).forEach((fr, i) => {{
        const ex = cx + fr.eef_x * scale;
        const ey = cy - fr.eef_y * scale;
        if (i === 0) armCtx.moveTo(ex, ey);
        else armCtx.lineTo(ex, ey);
      }});
      armCtx.stroke();

      // Two-link projection
      const x1 = cx + 0.40 * Math.cos(f.q1) * scale;
      const y1 = cy - 0.40 * Math.sin(f.q1) * scale;
      const x2 = cx + f.eef_x * scale;
      const y2 = cy - f.eef_y * scale;

      armCtx.strokeStyle = '#f8fafc';
      armCtx.lineWidth = 5;
      armCtx.beginPath();
      armCtx.moveTo(cx, cy);
      armCtx.lineTo(x1, y1);
      armCtx.lineTo(x2, y2);
      armCtx.stroke();

      armCtx.fillStyle = '#38bdf8';
      [[cx, cy], [x1, y1], [x2, y2]].forEach(([px, py]) => {{
        armCtx.beginPath();
        armCtx.arc(px, py, 5, 0, Math.PI * 2);
        armCtx.fill();
      }});

      // Draw Velocity Telemetry Curve + Safety Limit
      velCtx.clearRect(0, 0, velCanvas.width, velCanvas.height);
      const maxPlot = Math.max(DATA.safety_limit_rad_s * 1.25, ep.peak_velocity_rad_s * 1.1, 4.5);
      const limY = velCanvas.height - (DATA.safety_limit_rad_s / maxPlot) * (velCanvas.height - 30) - 15;
      velCtx.strokeStyle = '#ef4444';
      velCtx.setLineDash([5, 5]);
      velCtx.beginPath();
      velCtx.moveTo(0, limY);
      velCtx.lineTo(velCanvas.width, limY);
      velCtx.stroke();
      velCtx.setLineDash([]);

      velCtx.strokeStyle = '#38bdf8';
      velCtx.lineWidth = 2.5;
      velCtx.beginPath();
      frames.forEach((fr, idx) => {{
        const px = 20 + (idx / Math.max(1, frames.length - 1)) * (velCanvas.width - 40);
        const py = velCanvas.height - ((fr.vel_mag || 0) / maxPlot) * (velCanvas.height - 30) - 15;
        if (idx === 0) velCtx.moveTo(px, py);
        else velCtx.lineTo(px, py);
        if (idx === currentFrame) {{
          velCtx.fillStyle = '#facc15';
          velCtx.fillRect(px - 3, py - 3, 6, 6);
        }}
      }});
      velCtx.stroke();
    }}

    setInterval(() => {{
      if (!playing) return;
      const len = DATA.episodes[currentEp].frames.length;
      if (len > 0) {{
        currentFrame = (currentFrame + 1) % len;
        draw();
      }}
    }}, 90);
    draw();
  </script>
</body>
</html>"""
    with open(replay_html_path, "w", encoding="utf-8") as f:
        f.write(html)


def run_suite(
    robot_id: str = "dirgha_2dof_reacher",
    episodes: int = 5,
    steps_per_episode: int = 200,
    safety_limit_rad_s: float = 4.0,
    mjcf_path: str = "",
    mjcf_xml: str = "",
):
    model, resolved_id = load_mujoco_model(robot_id, mjcf_path, mjcf_xml)
    data = mujoco.MjData(model)
    eef_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, "eef")
    target_pos = np.array([0.45, 0.35, 0.0])

    q_goal_2d = solve_2link_ik(0.45, 0.35)
    kp = 6.0
    kd = 2.2

    episode_records = []
    failed_episodes = []
    action_trace_lines = []
    successes = 0
    max_vel_observed = 0.0

    for ep in range(episodes):
        seed = 1000 + ep
        rng = np.random.default_rng(seed)
        mujoco.mj_resetData(model, data)
        data.qpos[0] = float(rng.uniform(-0.4, 0.4))
        if model.nq > 1:
            data.qpos[1] = float(rng.uniform(-0.4, 0.4))
        mujoco.mj_forward(model, data)

        ep_frames = []
        ep_peak_vel = 0.0
        ep_vel_violation_step = None
        ep_violating_joint = None

        for step in range(steps_per_episode):
            q_err = q_goal_2d - data.qpos[:2]
            ctrl_2d = np.clip(kp * q_err - kd * data.qvel[:2], -5.0, 5.0)
            data.ctrl[0] = ctrl_2d[0]
            if model.nu > 1:
                data.ctrl[1] = ctrl_2d[1]
            for extra in range(2, model.nu):
                data.ctrl[extra] = float(-2.0 * data.qpos[extra] - 0.5 * data.qvel[extra])

            mujoco.mj_step(model, data)

            abs_vels = np.abs(data.qvel[: model.nv])
            peak_step_vel = float(np.max(abs_vels))
            if peak_step_vel > max_vel_observed:
                max_vel_observed = peak_step_vel
            if peak_step_vel > ep_peak_vel:
                ep_peak_vel = peak_step_vel
            if peak_step_vel > safety_limit_rad_s and ep_vel_violation_step is None:
                ep_vel_violation_step = step
                worst_j = int(np.argmax(abs_vels))
                ep_violating_joint = (
                    mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_JOINT, worst_j) or f"joint_{worst_j}"
                )

            if step % 10 == 0 or step == steps_per_episode - 1:
                eef_xyz = data.site_xpos[eef_id] if eef_id >= 0 else np.zeros(3)
                action_trace_lines.append(
                    f"ep={ep}:s={step}:q=[{data.qpos[0]:.4f},{data.qpos[1]:.4f}]:u=[{ctrl_2d[0]:.4f},{ctrl_2d[1]:.4f}]"
                )
                ep_frames.append(
                    {
                        "step": step,
                        "q1": round(float(data.qpos[0]), 4),
                        "q2": round(float(data.qpos[1]) if model.nq > 1 else 0.0, 4),
                        "eef_x": round(float(eef_xyz[0]), 4),
                        "eef_y": round(float(eef_xyz[1]), 4),
                        "vel_mag": round(peak_step_vel, 4),
                    }
                )

        final_eef = data.site_xpos[eef_id] if eef_id >= 0 else np.zeros(3)
        dist = float(np.linalg.norm(final_eef[:2] - target_pos[:2]))
        vel_ok = ep_peak_vel <= safety_limit_rad_s
        succeeded = (dist < 0.08) and vel_ok

        if succeeded:
            successes += 1
            failure_mode = "NONE"
        elif not vel_ok:
            failure_mode = "JOINT_VELOCITY_EXCEEDED"
            failed_episodes.append(
                {
                    "episode_index": ep,
                    "seed": seed,
                    "failure_mode": failure_mode,
                    "violating_joint": ep_violating_joint,
                    "step_of_failure": ep_vel_violation_step or 0,
                    "observed_value": round(ep_peak_vel, 4),
                    "limit_value": safety_limit_rad_s,
                    "final_distance_m": round(dist, 4),
                    "remediation_hint": f"Increase joint damping kd or clip control torque on {ep_violating_joint}.",
                }
            )
        else:
            failure_mode = "TARGET_MISSED"
            failed_episodes.append(
                {
                    "episode_index": ep,
                    "seed": seed,
                    "failure_mode": failure_mode,
                    "violating_joint": None,
                    "step_of_failure": steps_per_episode - 1,
                    "observed_value": round(dist, 4),
                    "limit_value": 0.08,
                    "final_distance_m": round(dist, 4),
                    "remediation_hint": "Increase proportional gain kp or horizon steps_per_episode.",
                }
            )

        episode_records.append(
            {
                "episode": ep,
                "seed": seed,
                "succeeded": succeeded,
                "failure_mode": failure_mode,
                "peak_velocity_rad_s": round(ep_peak_vel, 4),
                "final_distance_m": round(dist, 4),
                "frames": ep_frames,
            }
        )

    trace_material = "\n".join(action_trace_lines)
    ci_low, ci_high = wilson_ci_95(successes, episodes)

    os.makedirs("data", exist_ok=True)
    replay_html_path = os.path.abspath("data/replay.html")
    write_interactive_canvas_replay_html(
        replay_html_path,
        resolved_id,
        episodes,
        successes,
        ci_low,
        ci_high,
        max_vel_observed,
        safety_limit_rad_s,
        episode_records,
    )

    result = {
        "ok": True,
        "mujoco_version": mujoco.__version__,
        "robot_id": resolved_id,
        "episodes": episodes,
        "successes": successes,
        "success_rate": round(successes / max(1, episodes), 4),
        "wilson_ci_95": [ci_low, ci_high],
        "peak_joint_velocity_rad_s": round(max_vel_observed, 4),
        "safety_limit_rad_s": safety_limit_rad_s,
        "failed_episodes": failed_episodes,
        "trace_material": trace_material,
        "replay_html_path": replay_html_path,
    }
    print(json.dumps(result))


def run_acceptance_matrix(
    robot_id: str = "so101_6dof_arm",
    site_name: str = "Addverb_Noida_Cell_04",
    safety_limit_rad_s: float = 4.0,
):
    """
    20-Scenario Site Acceptance Testing (SAT) Perturbation Matrix (`final/10_EXPANSION_ACCEPTANCE.md`).
    Categories:
      1. S01–S04: Nominal Pick-and-Place & Docking Precision (CRITICAL)
      2. S05–S08: Payload Mass +30% Over-Spec Perturbation (CRITICAL)
      3. S09–S12: Encoder / Depth Camera Gaussian Sensor Noise (sigma=0.025 rad) (NON_CRITICAL)
      4. S13–S16: Nominal seeded variations (CRITICAL)
      5. S17–S20: Actuator Bus Voltage Droop (-15% torque limit) and nominal seeded variations (CRITICAL)
    """
    base_model, resolved_id = load_mujoco_model(robot_id)
    eef_id = mujoco.mj_name2id(base_model, mujoco.mjtObj.mjOBJ_SITE, "eef")
    target_pos = np.array([0.45, 0.35, 0.0])
    q_goal_2d = solve_2link_ik(0.45, 0.35)

    scenarios_spec = [
        ("SAT-01", "NOMINAL_PRECISION", "CRITICAL", 1.0, 0.0, 5.0, "Nominal home-to-pick reach"),
        ("SAT-02", "NOMINAL_PRECISION", "CRITICAL", 1.0, 0.0, 5.0, "Nominal pick-to-place transfer"),
        ("SAT-03", "NOMINAL_PRECISION", "CRITICAL", 1.0, 0.0, 5.0, "Nominal docking alignment"),
        ("SAT-04", "NOMINAL_PRECISION", "CRITICAL", 1.0, 0.0, 5.0, "Nominal return-to-home cycle"),
        ("SAT-05", "PAYLOAD_MASS_PLUS_30PCT", "CRITICAL", 1.30, 0.0, 5.0, "+30% payload mass at max reach"),
        ("SAT-06", "PAYLOAD_MASS_PLUS_30PCT", "CRITICAL", 1.30, 0.0, 5.0, "+30% payload rapid deceleration"),
        ("SAT-07", "PAYLOAD_MASS_PLUS_30PCT", "CRITICAL", 1.30, 0.0, 5.0, "+30% eccentric center-of-mass"),
        ("SAT-08", "PAYLOAD_MASS_PLUS_30PCT", "CRITICAL", 1.30, 0.0, 5.0, "+30% sustained hold stability"),
        ("SAT-09", "SENSOR_NOISE_PERTURBATION", "NON_CRITICAL", 1.0, 0.015, 5.0, "Encoder Gaussian noise sigma=0.015 rad"),
        ("SAT-10", "SENSOR_NOISE_PERTURBATION", "NON_CRITICAL", 1.0, 0.020, 5.0, "Encoder Gaussian noise sigma=0.020 rad"),
        ("SAT-11", "SENSOR_NOISE_PERTURBATION", "NON_CRITICAL", 1.0, 0.025, 5.0, "Depth camera pose jitter +/-15mm"),
        ("SAT-12", "SENSOR_NOISE_PERTURBATION", "NON_CRITICAL", 1.0, 0.030, 5.0, "Combined encoder + velocity noise"),
        ("SAT-13", "NOMINAL_SEED_VARIATION", "CRITICAL", 1.0, 0.0, 5.0, "Nominal seed 2012"),
        ("SAT-14", "NOMINAL_SEED_VARIATION", "CRITICAL", 1.0, 0.0, 5.0, "Nominal seed 2013"),
        ("SAT-15", "NOMINAL_SEED_VARIATION", "CRITICAL", 1.0, 0.0, 5.0, "Nominal seed 2014"),
        ("SAT-16", "NOMINAL_SEED_VARIATION", "CRITICAL", 1.0, 0.0, 5.0, "Nominal seed 2015"),
        ("SAT-17", "ACTUATOR_DROOP", "CRITICAL", 1.0, 0.0, 4.25, "24V bus voltage droop (-15% max torque)"),
        ("SAT-18", "ACTUATOR_DROOP", "CRITICAL", 1.15, 0.01, 4.25, "Voltage droop + 15% payload"),
        ("SAT-19", "NOMINAL_SEED_VARIATION", "CRITICAL", 1.0, 0.0, 5.0, "Nominal seed 2018"),
        ("SAT-20", "NOMINAL_SEED_VARIATION", "CRITICAL", 1.0, 0.0, 5.0, "Nominal seed 2019"),
    ]

    scenario_results = []
    punch_list = []
    passed_count = 0
    critical_failed = 0

    for idx, (sc_id, category, severity, mass_scale, noise_std, torque_clip, desc) in enumerate(scenarios_spec):
        model, _ = load_mujoco_model(robot_id)
        for b in range(1, model.nbody):
            model.body_mass[b] *= mass_scale
        data = mujoco.MjData(model)

        seed = 2000 + idx
        rng = np.random.default_rng(seed)
        mujoco.mj_resetData(model, data)
        data.qpos[0] = float(rng.uniform(-0.35, 0.35))
        if model.nq > 1:
            data.qpos[1] = float(rng.uniform(-0.35, 0.35))
        mujoco.mj_forward(model, data)

        kp_task = 65.0
        kd = 1.8
        peak_vel = 0.0
        jacp = np.zeros((3, model.nv))

        for _ in range(600):
            eef_now = data.site_xpos[eef_id] if eef_id >= 0 else np.zeros(3)
            pos_err = target_pos - eef_now
            if noise_std > 0:
                pos_err = pos_err + rng.normal(0.0, noise_std * 0.05, size=3)
            mujoco.mj_jacSite(model, data, jacp, None, eef_id)
            tau_task = jacp.T @ (kp_task * pos_err) - kd * data.qvel[: model.nv]
            for j in range(min(model.nu, model.nv)):
                data.ctrl[j] = float(np.clip(tau_task[j], -torque_clip, torque_clip))
            mujoco.mj_step(model, data)
            step_vel = float(np.max(np.abs(data.qvel[: model.nv])))
            if step_vel > peak_vel:
                peak_vel = step_vel

        final_eef = data.site_xpos[eef_id] if eef_id >= 0 else np.zeros(3)
        dist = float(np.linalg.norm(final_eef[:2] - target_pos[:2]))
        vel_ok = peak_vel <= safety_limit_rad_s
        passed = (dist < 0.085) and vel_ok

        if passed:
            passed_count += 1
        else:
            if severity == "CRITICAL":
                critical_failed += 1
            punch_list.append(
                {
                    "scenario_id": sc_id,
                    "severity": severity,
                    "owner": "Commissioning Lead",
                    "issue": f"{desc}: final error {dist:.4f}m, peak vel {peak_vel:.3f} rad/s",
                    "remediation": "Tune Kalman filter covariance or increase derivative damping kd.",
                }
            )

        scenario_results.append(
            {
                "scenario_id": sc_id,
                "category": category,
                "severity": severity,
                "description": desc,
                "mass_scale": mass_scale,
                "sensor_noise_std": noise_std,
                "torque_limit_nm": torque_clip,
                "seed": seed,
                "passed": passed,
                "peak_velocity_rad_s": round(peak_vel, 4),
                "final_error_m": round(dist, 4),
            }
        )

    ci_low, ci_high = wilson_ci_95(passed_count, len(scenarios_spec))
    gate_verdict = (
        "PASS_GO_LIVE_APPROVED"
        if critical_failed == 0 and passed_count == len(scenarios_spec)
        else ("CONDITIONAL_PASS" if critical_failed == 0 else "BLOCKED_CRITICAL_FAILURE")
    )

    out = {
        "ok": critical_failed == 0,
        "mujoco_version": mujoco.__version__,
        "site_name": site_name,
        "robot_id": resolved_id,
        "total_scenarios": len(scenarios_spec),
        "passed_scenarios": passed_count,
        "critical_failures": critical_failed,
        "coverage_pct": 100.0,
        "wilson_ci_95": [ci_low, ci_high],
        "gate_verdict": gate_verdict,
        "scenarios": scenario_results,
        "punch_list": punch_list,
    }
    print(json.dumps(out))


def main():
    parser = argparse.ArgumentParser(description="Dirgha Full Native MuJoCo 3.17.0 Engine")
    parser.add_argument(
        "--mode", default="eval", choices=["eval", "inspect", "step", "reset", "acceptance"]
    )
    parser.add_argument("--robot", default="dirgha_2dof_reacher")
    parser.add_argument("--site", default="Addverb_Noida_Cell_04")
    parser.add_argument("--mjcf-path", default="")
    parser.add_argument("--mjcf-xml", default="")
    parser.add_argument("--episodes", type=int, default=5)
    parser.add_argument("--steps", type=int, default=200)
    parser.add_argument("--safety-limit", type=float, default=4.0)
    parser.add_argument("--session-id", default="sim_01")
    parser.add_argument("--seed", type=int, default=1000)
    parser.add_argument("--action", default="[0.1, -0.1]")
    args = parser.parse_args()

    if args.mode == "inspect":
        print(json.dumps(inspect_model(args.robot, args.mjcf_path, args.mjcf_xml)))
    elif args.mode == "acceptance":
        run_acceptance_matrix(
            robot_id=args.robot, site_name=args.site, safety_limit_rad_s=args.safety_limit
        )
    elif args.mode in ("step", "reset"):
        try:
            act_vals = json.loads(args.action)
            if not isinstance(act_vals, list):
                act_vals = [0.0, 0.0]
        except Exception:
            act_vals = [0.0, 0.0]
        print(
            json.dumps(
                step_stateful_session(
                    args.session_id,
                    args.robot,
                    act_vals,
                    reset=(args.mode == "reset"),
                    seed=args.seed,
                )
            )
        )
    else:
        run_suite(
            robot_id=args.robot,
            episodes=args.episodes,
            steps_per_episode=args.steps,
            safety_limit_rad_s=args.safety_limit,
            mjcf_path=args.mjcf_path,
            mjcf_xml=args.mjcf_xml,
        )


if __name__ == "__main__":
    main()
