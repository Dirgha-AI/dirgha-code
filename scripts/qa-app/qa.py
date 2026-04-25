#!/usr/bin/env python3
"""QA harness for https://dirgha.ai/app routes.

Pipeline per route:
  1. Headless Chromium (Playwright) navigates to the URL.
  2. Captures: final URL, HTTP status, title, console errors, network
     failures, full-page screenshot, ~3 KB of body text.
  3. Sends the textual evidence (no images — DeepSeek V4 Pro on NIM is
     text-only) to NIM DeepSeek for a structured QA verdict.
  4. Writes screenshot + per-route JSON, then a roll-up markdown report.

Usage:
    NVIDIA_API_KEY=... python qa.py            # run all routes
    NVIDIA_API_KEY=... python qa.py home chat  # subset by name
    python qa.py --no-llm                      # skip DeepSeek step
"""

from __future__ import annotations
import argparse
import json
import os
import re
import sys
import textwrap
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"
OUT.mkdir(exist_ok=True)
ROUTES_PATH = HERE / "routes.json"

# Default to Ling-1T free on OpenRouter — non-thinking, returns clean
# JSON in `content` field (HY3 is thinking-mode and emits to `reasoning`,
# leaving content null which breaks one-shot structured prompts).
# Override with QA_BASE_URL / QA_MODEL env vars.
NIM_BASE = os.environ.get("QA_BASE_URL", "https://openrouter.ai/api/v1")
MODEL = os.environ.get("QA_MODEL", "inclusionai/ling-2.6-1t:free")
API_KEY_ENV = "OPENROUTER_API_KEY" if "openrouter" in NIM_BASE else "NVIDIA_API_KEY"

QA_SYSTEM = """You are a senior frontend QA reviewing a single route of an
agentic AI OS web app. You receive textual evidence captured by a
headless browser. Score the route on a strict 0-10 rubric and return
ONLY a JSON object — no prose, no markdown.

Rubric:
  10 — fully rendered, expected feature visible, no errors
   7 — rendered with minor issues (small layout glitch, one console warning)
   5 — partially rendered or auth-redirected to a working login
   3 — visible breakage (blank screen, 4xx/5xx page, stack trace shown)
   0 — total failure (network error, route crashes, infinite loop)

Output schema (strict JSON):
{
  "score": 0-10,
  "verdict": "<one-sentence summary>",
  "issues": ["<concrete issue 1>", "<concrete issue 2>"],
  "evidence": "<what in the input convinced you>"
}
"""


def call_nim(payload: dict) -> dict:
    """Call NIM DeepSeek V4 Pro for QA verdict. Returns parsed JSON or {error:...}."""
    from openai import OpenAI
    client = OpenAI(base_url=NIM_BASE, api_key=os.environ[API_KEY_ENV])
    user_msg = json.dumps(payload, ensure_ascii=False)[:12_000]
    try:
        # `response_format` is honoured by some providers and ignored by others;
        # we still parse defensively from the content body.
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": QA_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
            max_tokens=600,
        )
        msg = resp.choices[0].message
        # Some thinking models (HY3, DeepSeek-R1, etc.) put their answer in
        # `reasoning` / `reasoning_content` and leave `content` null.
        text = (
            msg.content
            or getattr(msg, "reasoning", None)
            or getattr(msg, "reasoning_content", None)
            or "{}"
        )
    except Exception as e:
        return {"error": f"nim call failed: {e}"}
    # Some servers wrap the JSON; extract the first object.
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    raw = m.group(0) if m else text
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        return {"error": f"json parse failed: {e}", "raw": text[:600]}


def capture_route(ctx, base: str, route: dict) -> dict:
    """Drive Chromium to a single route and capture evidence."""
    url = base + route["path"]
    page = ctx.new_page()
    console: list[str] = []
    network_failures: list[str] = []
    page.on("console", lambda m: console.append(f"[{m.type}] {m.text[:200]}"))
    page.on("pageerror", lambda e: console.append(f"[pageerror] {str(e)[:200]}"))
    page.on("requestfailed", lambda r: network_failures.append(f"{r.url[:120]} :: {r.failure}"))

    status = None
    final_url = url
    title = ""
    body_text = ""
    error = None
    try:
        resp = page.goto(url, wait_until="domcontentloaded", timeout=20_000)
        status = resp.status if resp else None
        # Give SPA a beat to render.
        try:
            page.wait_for_load_state("networkidle", timeout=8_000)
        except PWTimeout:
            pass
        final_url = page.url
        title = page.title()[:200]
        body_text = page.evaluate("() => document.body.innerText")[:3_000]
    except Exception as e:
        error = str(e)[:300]

    shot_path = OUT / f"{route['name']}.png"
    try:
        page.screenshot(path=str(shot_path), full_page=True, timeout=15_000)
    except Exception as e:
        error = (error or "") + f" ; screenshot failed: {e}"

    page.close()
    return {
        "name": route["name"],
        "path": route["path"],
        "expect": route["expect"],
        "url_visited": url,
        "url_final": final_url,
        "http_status": status,
        "title": title,
        "body_text_excerpt": body_text,
        "console": console[-30:],
        "network_failures": network_failures[-15:],
        "screenshot": str(shot_path.relative_to(HERE)) if shot_path.exists() else None,
        "navigation_error": error,
    }


def render_report(results: list[dict], started: str, finished: str) -> str:
    rows = []
    for r in results:
        v = r.get("verdict", {})
        score = v.get("score", "—")
        line = v.get("verdict", "(no LLM verdict)")
        rows.append(f"| `{r['path']}` | {score} | {r.get('http_status', '—')} | {line} |")
    table = "\n".join(rows)

    details = []
    for r in results:
        v = r.get("verdict") or {}
        issues = v.get("issues") or []
        details.append(textwrap.dedent(f"""
        ### `{r['path']}` — {r['name']}

        - **Expected**: {r['expect']}
        - **Final URL**: {r['url_final']}
        - **HTTP status**: {r['http_status']}
        - **Title**: {r['title']!r}
        - **Score**: {v.get('score', '—')} — {v.get('verdict', '(no verdict)')}
        - **Screenshot**: ![{r['name']}]({r['screenshot']})

        **Issues flagged by DeepSeek:**
        """).strip() + "\n" + ("\n".join(f"  - {i}" for i in issues) or "  - (none)") + "\n\n"
        + ("**Console (last 5):**\n```\n" + "\n".join(r.get("console", [])[-5:] or ["(none)"]) + "\n```\n"
           "**Network failures (last 5):**\n```\n" + "\n".join(r.get("network_failures", [])[-5:] or ["(none)"]) + "\n```\n"))
    return f"""# dirgha.ai/app — Route QA Report

- **Started**: {started}
- **Finished**: {finished}
- **Routes covered**: {len(results)}
- **Engine**: Playwright + Chromium → NVIDIA NIM `{MODEL}`

| Route | Score | HTTP | Verdict |
|---|---|---|---|
{table}

---

{''.join(details)}
"""


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("filter", nargs="*", help="optional list of route names to run")
    parser.add_argument("--no-llm", action="store_true", help="skip DeepSeek QA call")
    parser.add_argument("--user-data-dir", default=None, help="optional Chromium profile dir for auth cookies")
    args = parser.parse_args(argv)

    config = json.loads(ROUTES_PATH.read_text())
    base = config["base"]
    routes = config["routes"]
    if args.filter:
        routes = [r for r in routes if r["name"] in set(args.filter)]
        if not routes:
            print(f"no matching routes; valid names: {[r['name'] for r in config['routes']]}")
            return 2

    if not args.no_llm and API_KEY_ENV not in os.environ:
        print(f"ERROR: {API_KEY_ENV} required for {NIM_BASE} (or pass --no-llm)", file=sys.stderr)
        return 2

    started = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    print(f"# qa pass started {started}")
    print(f"# routes: {[r['name'] for r in routes]}")

    results: list[dict] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx_kwargs = {"viewport": {"width": 1440, "height": 900}, "ignore_https_errors": True}
        if args.user_data_dir:
            ctx = browser.new_context(storage_state=args.user_data_dir, **ctx_kwargs) if Path(args.user_data_dir).exists() else browser.new_context(**ctx_kwargs)
        else:
            ctx = browser.new_context(**ctx_kwargs)

        for r in routes:
            print(f"\n→ {r['path']}")
            ev = capture_route(ctx, base, r)
            print(f"  http={ev['http_status']}  final={ev['url_final']}  console={len(ev['console'])}  netfail={len(ev['network_failures'])}")
            if not args.no_llm:
                payload = {
                    "route": ev["path"],
                    "expected": ev["expect"],
                    "url_final": ev["url_final"],
                    "http_status": ev["http_status"],
                    "title": ev["title"],
                    "body_text_excerpt": ev["body_text_excerpt"],
                    "console": ev["console"],
                    "network_failures": ev["network_failures"],
                    "navigation_error": ev["navigation_error"],
                }
                ev["verdict"] = call_nim(payload)
                v = ev["verdict"]
                if "error" in v:
                    print(f"  llm: ERROR — {v['error']}")
                else:
                    print(f"  llm: score={v.get('score')} — {v.get('verdict', '')[:120]}")
            else:
                ev["verdict"] = {}
            results.append(ev)
            (OUT / f"{r['name']}.json").write_text(json.dumps(ev, indent=2))

        ctx.close()
        browser.close()

    finished = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    report_md = render_report(results, started, finished)
    (OUT / "report.md").write_text(report_md)
    (OUT / "report.json").write_text(json.dumps(results, indent=2))

    print(f"\n# done. report → {OUT / 'report.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
