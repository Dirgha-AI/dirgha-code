#!/usr/bin/env python3
"""Hermes-parity plan runner for dirgha-cli.

Drives a NIM-hosted DeepSeek V4 Pro through the phases defined in
phases.json. The model receives a small tool surface (read_file,
write_file, edit_file, shell, done) and runs autonomously until either
the phase's acceptance command exits 0 or max_iters is reached.

Usage:
    NVIDIA_API_KEY=... python runner.py phase phase-0-baseline
    NVIDIA_API_KEY=... python runner.py all
    NVIDIA_API_KEY=... python runner.py status

Logs each iteration's tool calls to stdout and writes a transcript per
phase to scripts/hermes-plan/logs/.
"""

from __future__ import annotations
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from openai import OpenAI

REPO_ROOT = Path(__file__).resolve().parent.parent.parent  # cli/
PHASES_PATH = Path(__file__).parent / "phases.json"
LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

# Default to OpenRouter HY3 free (tencent/hy3-preview) — independent of
# NVIDIA NIM availability. Override with PLAN_BASE_URL / PLAN_MODEL env vars.
BASE_URL = os.environ.get("PLAN_BASE_URL", "https://openrouter.ai/api/v1")
MODEL = os.environ.get("PLAN_MODEL", "tencent/hy3-preview:free")
API_KEY_ENV = "OPENROUTER_API_KEY" if "openrouter" in BASE_URL else "NVIDIA_API_KEY"
MAX_FILE_READ_BYTES = 12_000
MAX_TOOL_RESULT_BYTES = 8_000
SHELL_TIMEOUT_S = 300

FORBIDDEN_SHELL = [
    "rm -rf /",
    "rm -rf ~",
    "rm -rf $",
    ":(){ :|:& };:",
    "mkfs",
    "dd if=",
    "git push --force",
    "git reset --hard origin",
]

SYSTEM_PROMPT = """You are an autonomous coding agent working on the dirgha-cli
codebase at /root/dirgha-ai/domains/10-computer/cli/.

You will be given a single phase with a clear goal and an acceptance
command. Execute the goal with minimal changes, then call the `done`
tool with a short summary. Do not exceed the goal scope.

Rules:
- All paths in tool calls are relative to the repo root.
- Read files before editing them. Use edit_file for surgical changes;
  use write_file only when creating a new file or fully rewriting one.
- Run `npm run build:v2` from the repo root to verify TypeScript before
  declaring done. The build runs `tsc -p tsconfig.v2.json`.
- Never modify a path listed under `must_not_touch` for the current
  phase.
- Never run destructive shell commands (rm -rf at root, force-push, etc).
- If the acceptance command would not pass with your current changes,
  do not call `done`. Iterate instead.
- Prefer one focused commit-worthy change set per phase.
"""

def make_tools() -> list:
    return [
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read a file. Path relative to repo root.",
                "parameters": {
                    "type": "object",
                    "properties": {"path": {"type": "string"}},
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write or overwrite a file. Use sparingly — prefer edit_file for existing files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "content": {"type": "string"},
                    },
                    "required": ["path", "content"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Replace exact old_string with new_string in a file. old_string must be unique in the file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "old_string": {"type": "string"},
                        "new_string": {"type": "string"},
                    },
                    "required": ["path", "old_string", "new_string"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "shell",
                "description": "Run a shell command from the repo root. Captures stdout, stderr, exit code.",
                "parameters": {
                    "type": "object",
                    "properties": {"cmd": {"type": "string"}},
                    "required": ["cmd"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "done",
                "description": "Mark the current phase complete. Provide a short summary.",
                "parameters": {
                    "type": "object",
                    "properties": {"summary": {"type": "string"}},
                    "required": ["summary"],
                },
            },
        },
    ]


def safe_path(rel: str, must_not_touch: list[str]) -> Path | None:
    p = (REPO_ROOT / rel).resolve()
    try:
        p.relative_to(REPO_ROOT)
    except ValueError:
        return None  # path escapes repo
    rel_norm = str(p.relative_to(REPO_ROOT))
    for bad in must_not_touch:
        bad_norm = bad.rstrip("/")
        if rel_norm == bad_norm or rel_norm.startswith(bad_norm + "/"):
            return None
    return p


def call_tool(name: str, args: dict, must_not_touch: list[str]) -> tuple[str, bool]:
    """Returns (result_text, is_done)."""
    if name == "read_file":
        rel = args.get("path", "")
        p = (REPO_ROOT / rel).resolve()
        try:
            p.relative_to(REPO_ROOT)
        except ValueError:
            return f"ERROR: path escapes repo: {rel}", False
        if not p.exists():
            return f"ERROR: file not found: {rel}", False
        if not p.is_file():
            return f"ERROR: not a file: {rel}", False
        text = p.read_text(errors="replace")
        if len(text) > MAX_FILE_READ_BYTES:
            return text[:MAX_FILE_READ_BYTES] + f"\n…[truncated, full size {len(text)}]", False
        return text, False

    if name == "write_file":
        rel = args.get("path", "")
        p = safe_path(rel, must_not_touch)
        if p is None:
            return f"ERROR: write blocked (must_not_touch or escape): {rel}", False
        p.parent.mkdir(parents=True, exist_ok=True)
        content = args.get("content", "")
        p.write_text(content)
        return f"wrote {rel} ({len(content)} bytes)", False

    if name == "edit_file":
        rel = args.get("path", "")
        p = safe_path(rel, must_not_touch)
        if p is None:
            return f"ERROR: edit blocked (must_not_touch or escape): {rel}", False
        if not p.exists():
            return f"ERROR: file not found: {rel}", False
        text = p.read_text()
        old = args.get("old_string", "")
        new = args.get("new_string", "")
        if old not in text:
            return f"ERROR: old_string not found in {rel}", False
        if text.count(old) > 1:
            return f"ERROR: old_string is not unique in {rel} ({text.count(old)} occurrences) — provide more context", False
        p.write_text(text.replace(old, new, 1))
        return f"edited {rel}", False

    if name == "shell":
        cmd = args.get("cmd", "")
        for bad in FORBIDDEN_SHELL:
            if bad in cmd:
                return f"ERROR: blocked dangerous command containing: {bad!r}", False
        try:
            r = subprocess.run(
                cmd, shell=True, cwd=REPO_ROOT,
                capture_output=True, text=True, timeout=SHELL_TIMEOUT_S,
            )
            out = r.stdout[:MAX_TOOL_RESULT_BYTES]
            err = r.stderr[:2_000]
            return f"exit={r.returncode}\nSTDOUT:\n{out}\nSTDERR:\n{err}", False
        except subprocess.TimeoutExpired:
            return f"ERROR: shell command timed out after {SHELL_TIMEOUT_S}s", False

    if name == "done":
        return args.get("summary", "(no summary)"), True

    return f"ERROR: unknown tool {name!r}", False


def render_phase_prompt(phase: dict) -> str:
    must_read_listing = "\n".join(f"  - {p}" for p in phase.get("must_read", []))
    must_not_touch_listing = "\n".join(f"  - {p}" for p in phase.get("must_not_touch", []))
    acceptance = phase.get("acceptance", "(none)")
    return f"""Phase: {phase['name']}

Goal:
{phase['goal']}

Files to read first:
{must_read_listing or '  (none specified)'}

Off-limits paths (you must NOT touch these):
{must_not_touch_listing or '  (none)'}

Acceptance test (will be run by the harness AFTER you call done):
  {acceptance}

When the goal is met, call the done tool with a one-line summary.
"""


def run_phase(client: OpenAI, phase: dict, max_iters: int) -> bool:
    name = phase["name"]
    must_not_touch = phase.get("must_not_touch", [])
    acceptance = phase.get("acceptance", "true")

    log_path = LOG_DIR / f"{name}-{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.log"
    log_f = log_path.open("w")

    def log(s: str):
        print(s)
        log_f.write(s + "\n")
        log_f.flush()

    log(f"\n=========================================")
    log(f" PHASE: {name}")
    log(f" log: {log_path}")
    log(f"=========================================\n")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": render_phase_prompt(phase)},
    ]
    tools = make_tools()
    declared_done = False
    done_summary = ""

    for it in range(max_iters):
        log(f"\n--- iter {it + 1}/{max_iters} ---")
        try:
            req_kwargs = dict(
                model=MODEL,
                messages=messages,
                tools=tools,
                temperature=0.3,
                max_tokens=8_000,
            )
            # NIM DeepSeek accepts the chat_template_kwargs hint; OpenRouter
            # ignores unknown keys for most models, but to be safe we only
            # send it when targeting NIM.
            if "nvidia" in BASE_URL:
                req_kwargs["extra_body"] = {"chat_template_kwargs": {"thinking": True, "reasoning_effort": "medium"}}
            resp = client.chat.completions.create(**req_kwargs)
        except Exception as e:
            log(f"ERROR calling NIM: {e}")
            time.sleep(5)
            continue

        msg = resp.choices[0].message
        msg_dict = msg.model_dump(exclude_none=True)
        # Some servers return reasoning_content; we don't echo it but we keep
        # the bare assistant turn in messages so context flows.
        clean = {"role": "assistant", "content": msg_dict.get("content")}
        if msg_dict.get("tool_calls"):
            clean["tool_calls"] = msg_dict["tool_calls"]
        messages.append(clean)

        if msg.content:
            log("agent: " + msg.content[:600])

        if not msg.tool_calls:
            log("(agent emitted no tool calls — stopping)")
            break

        for tc in msg.tool_calls:
            fname = tc.function.name
            try:
                fargs = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                fargs = {}
            preview_keys = list(fargs.keys())
            log(f"  → {fname}({preview_keys})")
            if fname == "shell":
                log(f"     cmd: {fargs.get('cmd', '')[:200]}")
            if fname in ("write_file", "edit_file", "read_file"):
                log(f"     path: {fargs.get('path', '')}")

            result, is_done = call_tool(fname, fargs, must_not_touch)

            log(f"     result: {result[:300]}")
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result[:MAX_TOOL_RESULT_BYTES],
            })

            if is_done:
                declared_done = True
                done_summary = result
                break

        if declared_done:
            break

    log(f"\n--- agent finished. declared_done={declared_done} summary={done_summary!r} ---")

    log("\nrunning acceptance test:")
    log(f"  $ {acceptance}")
    r = subprocess.run(acceptance, shell=True, cwd=REPO_ROOT, capture_output=True, text=True, timeout=SHELL_TIMEOUT_S)
    log(f"  exit={r.returncode}")
    if r.stdout.strip():
        log(f"  stdout: {r.stdout.strip()[:600]}")
    if r.stderr.strip():
        log(f"  stderr: {r.stderr.strip()[:600]}")
    passed = r.returncode == 0
    log(f"\n PHASE {name}: {'PASS' if passed else 'FAIL'}")
    log_f.close()
    return passed


def cmd_phase(client: OpenAI, name: str, phases: list[dict]) -> int:
    for p in phases:
        if p["name"] == name:
            ok = run_phase(client, p, p.get("max_iters", 10))
            return 0 if ok else 1
    print(f"unknown phase: {name}")
    print(f"available: {[p['name'] for p in phases]}")
    return 2


def cmd_all(client: OpenAI, phases: list[dict]) -> int:
    for p in phases:
        ok = run_phase(client, p, p.get("max_iters", 10))
        if not ok:
            print(f"\nstopping: phase {p['name']} did not pass acceptance.")
            return 1
    print("\nall phases passed.")
    return 0


def cmd_status(phases: list[dict]) -> int:
    print("phases configured:")
    for p in phases:
        print(f"  - {p['name']}  ({p.get('max_iters', 10)} max iters)")
    print(f"\nlogs: {LOG_DIR}")
    if LOG_DIR.exists():
        for f in sorted(LOG_DIR.iterdir())[-5:]:
            print(f"  {f.name}")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_phase = sub.add_parser("phase", help="run a single phase by name")
    p_phase.add_argument("name")
    sub.add_parser("all", help="run every phase in order, stop on first failure")
    sub.add_parser("status", help="show configured phases and recent logs")
    args = parser.parse_args(argv)

    phases = json.loads(PHASES_PATH.read_text())["phases"]

    if args.cmd == "status":
        return cmd_status(phases)

    if API_KEY_ENV not in os.environ:
        print(f"ERROR: {API_KEY_ENV} required for {BASE_URL}", file=sys.stderr)
        return 2

    client = OpenAI(base_url=BASE_URL, api_key=os.environ[API_KEY_ENV])

    if args.cmd == "phase":
        return cmd_phase(client, args.name, phases)
    if args.cmd == "all":
        return cmd_all(client, phases)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
