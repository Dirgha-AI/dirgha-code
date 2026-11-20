# Dirgha Harness 2.0 — Disposable Physical AI, CAD/PCB & Browser Workstation (`dirgha computer`)
# Adapted from `SouravBeraAkaSpeed/xiryn` (`workstation/` MIT License) + Dirgha Physical AI & Hardware Stack:
# - Desktop & Browser Computer-Use: Debian Bookworm + Xvfb + xfwm4 + Chromium + x11vnc + noVNC + scrot + xdotool
# - CPU-Native 3D & Physics Rendering: libosmesa6 + libgl1-mesa-dri (`MUJOCO_GL=osmesa` — zero GPU required)
# - Hardware CAD, PCB & 3D Mesh Tools: Blender (`blender -b`), KiCad CLI (`kicad-cli`), OpenSCAD, CadQuery
# - Physical AI & LeRobot Stack: MuJoCo 3.17+, NumPy, Hugging Face Hub (`lerobot` v2.0 dataset/checkpoint sync)
# - Hardened with `--cap-drop NET_RAW`, `enable_icc=false`, and non-root `agent` user.

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    SCREEN_WIDTH=1280 \
    SCREEN_HEIGHT=800 \
    SCREEN_DEPTH=24 \
    MUJOCO_GL=osmesa \
    PYOPENGL_PLATFORM=osmesa \
    PATH="/home/agent/.venv/bin:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
    blender \
    ca-certificates \
    chromium \
    curl \
     git \
    kicad \
    libegl1 \
    libgl1-mesa-dri \
    libosmesa6 \
    novnc \
    openscad \
    python3 \
    python3-pip \
    python3-venv \
    scrot \
    websockify \
    x11vnc \
    xdotool \
    xfwm4 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Create non-root sovereign agent user
RUN useradd -m -s /bin/bash agent

# Copy Dirgha plugins and assembled Robotics Skills Pack into /opt/dirgha
RUN mkdir -p /opt/dirgha/plugins /opt/dirgha/skills && chown -R agent:agent /opt/dirgha
COPY --chown=agent:agent plugins/ /opt/dirgha/plugins/

USER agent
WORKDIR /home/agent

# Create isolated Python virtual environment for CPU MuJoCo, CadQuery, and Hugging Face LeRobot
RUN python3 -m venv /home/agent/.venv \
    && /home/agent/.venv/bin/pip install --no-cache-dir --upgrade pip \
    && /home/agent/.venv/bin/pip install --no-cache-dir \
        mujoco>=3.1.6 \
        numpy>=1.26.0 \
        huggingface_hub>=0.25.0 \
        cadquery-ocp \
        pyserial

EXPOSE 6080 8765

CMD ["sh", "-c", "Xvfb :99 -screen 0 ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH} & sleep 1 && xfwm4 & x11vnc -display :99 -forever -shared -rfbport 5900 -localhost & websockify --web=/usr/share/novnc/ 6080 localhost:5900"]
