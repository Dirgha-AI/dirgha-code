#!/usr/bin/env bash
# Pre-publish guard: refuse to publish if the working tree appears
# to be a development checkout (legacy v1 source still present, or
# any dependency declared with a `workspace:` ref that npm can't
# resolve). Catches a developer who runs `npm publish` from the
# wrong directory by mistake.
#
# Wired into package.json `prepublishOnly` so it runs BEFORE pack +
# publish. `npm pack` and `npm install` skip prepublishOnly, so this
# does not block local build / verify-install loops.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -d "$REPO_ROOT/_legacy_v1" ]; then
  echo "prepublish-guard: refusing to publish — _legacy_v1/ present at $REPO_ROOT/_legacy_v1" >&2
  echo "prepublish-guard: this looks like a development checkout, not the published-tree clone. Publish from a fresh clone of Dirgha-AI/dirgha-code instead." >&2
  exit 1
fi

if [ -f "$REPO_ROOT/package.json" ]; then
  if ! (cd "$REPO_ROOT" && node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const depTypes = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
    const offenders = [];
    for (const type of depTypes) {
      const deps = pkg[type];
      if (deps && typeof deps === "object") {
        for (const [key, val] of Object.entries(deps)) {
          if (typeof val === "string" && val.startsWith("workspace:")) {
            offenders.push(`${type}.${key}=${val}`);
          }
        }
      }
    }
    if (offenders.length > 0) {
      console.error("prepublish-guard: workspace: ref found in dependencies:");
      for (const o of offenders) console.error("  " + o);
      console.error("prepublish-guard: pin to a real semver, publish the dep, or bundle its source.");
      process.exit(1);
    }
    process.exit(0);
  '); then
    exit 1
  fi
fi

exit 0
