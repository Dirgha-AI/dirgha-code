#!/usr/bin/env python3
"""Re-run LLM verdicts on already-captured route evidence.

Reads scripts/qa-app/output/<name>.json files, calls the QA LLM on
each route's evidence, writes the verdict back into the JSON, and
regenerates report.md / report.json.

Useful when:
  - The capture pass was correct but the LLM model produced unusable
    output (e.g. a thinking-model put its answer in `reasoning`).
  - You want to compare two models' verdicts on identical evidence.
"""

from __future__ import annotations
import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Reuse the harness from qa.py
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import qa  # noqa: E402


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("filter", nargs="*", help="optional list of route names to re-score")
    parser.add_argument("--model", default=None, help="override QA_MODEL for this run")
    args = parser.parse_args(argv)

    if args.model:
        qa.MODEL = args.model

    if qa.API_KEY_ENV not in os.environ:
        print(f"ERROR: {qa.API_KEY_ENV} required", file=sys.stderr)
        return 2

    out_dir = qa.OUT
    json_files = sorted(p for p in out_dir.glob("*.json") if p.stem not in ("report",))
    if args.filter:
        wanted = set(args.filter)
        json_files = [p for p in json_files if p.stem in wanted]

    if not json_files:
        print("no route json files found in", out_dir)
        return 1

    print(f"# rescore using model {qa.MODEL}")
    print(f"# routes: {[p.stem for p in json_files]}")
    started = datetime.utcnow().isoformat(timespec="seconds") + "Z"

    results: list[dict] = []
    for jp in json_files:
        ev = json.loads(jp.read_text())
        print(f"\n→ {ev['path']}")
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
        verdict = qa.call_nim(payload)
        ev["verdict"] = verdict
        if "error" in verdict:
            print(f"  llm: ERROR — {verdict['error']}")
        else:
            print(f"  llm: score={verdict.get('score')} — {str(verdict.get('verdict', ''))[:120]}")
        jp.write_text(json.dumps(ev, indent=2))
        results.append(ev)

    finished = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    (out_dir / "report.md").write_text(qa.render_report(results, started, finished))
    (out_dir / "report.json").write_text(json.dumps(results, indent=2))
    print(f"\n# done. report → {out_dir / 'report.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
