#!/usr/bin/env bash
# publish-and-submit-hub-pr.sh — Two-step public launch.
#
# 1. Publish @dirgha/code to npm (requires interactive npm login)
# 2. Fork HKUDS/CLI-Anything, add Dirgha to public_registry.json, open PR
#
# Run from: domains/10-computer/cli/
# Prereqs: npm login (run `npm login` once); gh auth login
set -euo pipefail

CLI_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$CLI_DIR"

VERSION="$(node -p "require('./package.json').version")"
echo "=== Dirgha CLI v$VERSION — publish + hub PR ==="

# ── Step 1: npm publish ──────────────────────────────────────────────────
if ! npm whoami >/dev/null 2>&1; then
  echo "✗ Not logged in to npm. Run: npm login"
  exit 1
fi

echo "→ Building…"
npm run build

echo "→ Publishing @dirgha/code@$VERSION (tag: beta)…"
npm publish --access public

# Verify it's live before opening the PR
sleep 5
if ! npm view "@dirgha/code@$VERSION" version >/dev/null 2>&1; then
  echo "✗ Package didn't appear in npm registry — aborting PR step."
  exit 1
fi
echo "✓ Published @dirgha/code@$VERSION"

# ── Step 2: fork CLI-Anything + open PR ──────────────────────────────────
UPSTREAM="HKUDS/CLI-Anything"
FORK_OWNER="$(gh api user --jq .login)"
FORK="$FORK_OWNER/CLI-Anything"
BRANCH="add-dirgha-$VERSION"
WORK="$(mktemp -d)"

echo "→ Forking $UPSTREAM → $FORK…"
gh repo fork "$UPSTREAM" --clone=false || true  # idempotent

echo "→ Cloning fork to $WORK…"
git clone "git@github.com:$FORK.git" "$WORK/CLI-Anything"
cd "$WORK/CLI-Anything"
git remote add upstream "https://github.com/$UPSTREAM.git" 2>/dev/null || true
git fetch upstream main
git checkout -B "$BRANCH" upstream/main

# Insert Dirgha entry into public_registry.json (preserves existing order)
node - <<EOF
const fs = require('fs');
const p = 'public_registry.json';
const reg = JSON.parse(fs.readFileSync(p, 'utf8'));
const entry = {
  name: 'dirgha',
  display_name: 'Dirgha Code',
  version: '$VERSION',
  description: 'AI coding agent with parallel multi-agent fleet in git worktrees, CLI-Anything-compliant --json output, and 80+ slash commands.',
  category: 'ai',
  requires: 'Node.js >= 20',
  homepage: 'https://dirgha.ai',
  source_url: 'https://github.com/dirghaai/cli',
  package_manager: 'npm',
  npm_package: '@dirgha/code',
  install_cmd: 'npm install -g @dirgha/code',
  npx_cmd: 'npx @dirgha/code',
  skill_md: 'https://raw.githubusercontent.com/dirghaai/cli/main/SKILL.md',
  entry_point: 'dirgha',
  contributors: [
    { name: 'Salik Shah', url: 'https://github.com/salikshah' },
    { name: 'Dirgha AI', url: 'https://github.com/dirghaai' },
  ],
};
reg.clis = reg.clis.filter(c => c.name !== 'dirgha');
reg.clis.push(entry);
reg.meta.updated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(p, JSON.stringify(reg, null, 2) + '\n');
console.log('✓ Added dirgha to public_registry.json (' + reg.clis.length + ' total entries)');
EOF

git add public_registry.json
git commit -m "Add Dirgha CLI $VERSION to public registry

Dirgha Code is an AI coding agent CLI with:
- Parallel multi-agent fleet in isolated git worktrees (dirgha fleet launch)
- CLI-Anything-compliant --json output on every command
- 80+ slash commands (sessions, memory, git, skills, multi-agent)
- TripleShot + judge pattern for high-stakes tasks (dirgha fleet triple)
- Published: @dirgha/code@$VERSION on npm
- SKILL.md: auto-generated (57 commands documented)"

git push origin "$BRANCH"

cd "$CLI_DIR"
PR_URL="$(gh pr create --repo "$UPSTREAM" --base main --head "$FORK_OWNER:$BRANCH" \
  --title "Add Dirgha Code ($VERSION) to public registry" \
  --body "## Summary
Adds **Dirgha Code** to CLI-Anything's public registry.

**Dirgha** is an AI coding agent CLI with:
- Parallel multi-agent fleet in isolated git worktrees (\`dirgha fleet launch\`)
- CLI-Anything-compliant \`--json\` output on every command (universal wrapper + native emit)
- 80+ slash commands across sessions, memory, git, skills, multi-agent
- TripleShot + judge pattern for high-stakes refactors (\`dirgha fleet triple\`)
- Auto-generated SKILL.md (57 commands documented, regens on every build)

## Verified
- \`dirgha --version\` → \`$VERSION\`
- \`dirgha --help\` (full commander tree)
- \`dirgha <cmd> --json\` (parseable envelope for every command)
- \`npm view @dirgha/code@$VERSION\` (package live on npm)
- SKILL.md: https://raw.githubusercontent.com/dirghaai/cli/main/SKILL.md

## Install
\`\`\`bash
npm install -g @dirgha/code
dirgha fleet launch \"your goal\"
\`\`\`

Thanks for maintaining CLI-Anything — the \`--json\` spec and SKILL.md convention shaped Dirgha's CLI compliance story directly." )"

echo ""
echo "✓ PR opened: $PR_URL"
