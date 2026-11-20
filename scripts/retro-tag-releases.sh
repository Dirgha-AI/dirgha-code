#!/usr/bin/env bash
# Retro-tag missing GitHub releases on Dirgha-AI/dirgha-code.
#
# Versions 1.5.0, 1.5.2, 1.6.0, 1.7.0, 1.7.1, 1.7.6 were published to
# npm but never tagged or released on GitHub. This script creates the
# missing tags + releases so the public-repo history matches npm.
#
# v1.7.6 is published as a deprecated/broken release with explicit
# "do not use, see v1.7.7" copy.
#
# Run from /root/dirgha-code-release/ on `main` after pushing v1.7.7:
#   bash <abs-path-to>/retro-tag-releases.sh
#
# Requires: `gh auth login` already done. Read-only by default —
# pass --apply to actually create the releases.

set -euo pipefail

REPO="Dirgha-AI/dirgha-code"
DRY=1
if [ "${1:-}" = "--apply" ]; then DRY=0; fi

say() { printf '%s\n' "$*" >&2; }

if ! command -v gh >/dev/null 2>&1; then
  say "gh CLI not found. Install: https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  say "gh not authenticated. Run: gh auth login"
  exit 1
fi

# ---------- existing tags + releases ----------
say "Fetching existing tags from $REPO..."
EXISTING_TAGS=$(gh api "repos/$REPO/tags" --paginate --jq '.[].name' | sort -u)
say "  $(echo "$EXISTING_TAGS" | wc -l) existing tags"
say ""

# ---------- candidate releases ----------
# Each line: TAG | TITLE | NOTES_BODY | OPTIONAL_FLAGS
declare -a CANDIDATES=(
  "v1.5.0|v1.5.0 — setup wizard, slash autocomplete, themes, yolo mode|Setup wizard, slash autocomplete polish, tool icons, 12-theme palette, yolo mode. See CHANGELOG.md for full detail.|"
  "v1.5.2|v1.5.2 — theme picker, autocomplete polish, restored logo|Theme picker overlay, slash autocomplete polish, restored violet-storm logo, footer cleanup.|"
  "v1.6.0|v1.6.0 — local model provider (llama.cpp + Ollama)|First-class local-model support: llama.cpp + Ollama provider, hardware-aware GGUF recommendation via dirgha hardware, setup wizard Local option, doctor probes for both servers.|"
  "v1.7.0|v1.7.0 — webfetch + websearch tools|Adds dynamic webfetch + websearch tools to the agent's tool surface. Internal kernel tests added.|"
  "v1.7.1|v1.7.1 — provider polish|Provider routing and dispatch polish.|"
  "v1.7.6|v1.7.6 — DEPRECATED (broken install) — use v1.7.7|This release shipped with two unresolvable dependencies (workspace ref + cli-html→fieldset deleted GitHub repo). \`npm install -g @dirgha/code@1.7.6\` fails for every user. Use v1.7.7 instead. Deprecated on npm.|--prerelease"
)

# ---------- iterate ----------
for entry in "${CANDIDATES[@]}"; do
  IFS='|' read -r tag title body flags <<<"$entry"
  if echo "$EXISTING_TAGS" | grep -qx "$tag"; then
    say "  skip   $tag — tag already exists"
    continue
  fi
  if [ "$DRY" -eq 1 ]; then
    say "  PLAN   gh release create $tag $flags --title \"$title\""
    say "         body: ${body:0:80}…"
  else
    say "  CREATE $tag …"
    # shellcheck disable=SC2086
    gh release create "$tag" \
      --repo "$REPO" \
      --title "$title" \
      --notes "$body" \
      $flags
    say "  done   $tag"
  fi
done

say ""
if [ "$DRY" -eq 1 ]; then
  say "DRY RUN complete. Re-run with --apply to actually create the releases."
else
  say "All retro-tags applied."
fi
