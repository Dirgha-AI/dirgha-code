#!/usr/bin/env bash
# Pre-publish guard: refuse to publish if the working tree is the
# private monorepo (where v1 source lives quarantined) OR if any
# dependency is a workspace: ref (which is unresolvable on npm).
#
# The single-source-of-truth rule: only /root/dirgha-code-release/
# publishes. Both conditions catch a developer who tries to publish
# from /root/dirgha-ai/domains/10-computer/cli/ by mistake.
#
# Wired into package.json `prepublishOnly` so it runs BEFORE pack +
# publish. `npm pack` and `npm install` skip prepublishOnly, so this
# does not block local build / verify-install loops.
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -d "$REPO_ROOT/_legacy_v1" ]; then
  echo "prepublish-guard: refusing to publish — _legacy_v1/ present at $REPO_ROOT/_legacy_v1" >&2
  echo "prepublish-guard: this looks like the private monorepo. Publish from /root/dirgha-code-release/ instead." >&2
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
