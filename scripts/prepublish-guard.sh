#!/usr/bin/env bash
# Pre-publish guard: refuse to publish if the working tree appears
# to be a development checkout or the package has quality issues.
#
# Checks (in order, fast-fail):
#   1. No _legacy_v1 directory
#   2. No workspace: dependency refs
#   3. dist/ directory exists and has CLI entry point
#   4. No test/mock directories leaked into dist/
#   5. Required project files present (README, LICENSE, CHANGELOG, CREDITS)
#   6. No .env files in the package files list
#   7. package.json has all required fields
#   8. No secret-like patterns in distribution files
#   9. CLI binary launches and reports version
#  10. Tarball size under budget (6 MB)
#  11. No TypeScript source files in dist/
#
# Wired into package.json `prepublishOnly` so it runs BEFORE pack +
# publish. `npm pack` and `npm install` skip prepublishOnly, so this
# does not block local build / verify-install loops.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass_count=0
fail_count=0

fail() {
  printf "${RED}  FAIL${NC}  %s\n" "$*" >&2
  fail_count=$((fail_count + 1))
}

pass() {
  printf "${GREEN}  PASS${NC}  %s\n" "$*"
  pass_count=$((pass_count + 1))
}

check() {
  local label="$1"; shift
  printf "${YELLOW}[%2s]${NC} %-45s " "$((pass_count + fail_count + 1))" "$label"
  if "$@"; then
    pass "$label"
    return 0
  else
    fail "$label"
    return 1
  fi
}

echo ""
echo "══════════════════════════════════════════════════════"
echo "  dirgha prepublish guard"
echo "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "══════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────
# 1. No legacy v1 directory
# ─────────────────────────────────────────────
check "no _legacy_v1 dir" bash -c "
  if [ -d '$REPO_ROOT/_legacy_v1' ]; then
    echo 'ERROR: _legacy_v1/ directory present — dev checkout?' >&2
    exit 1
  fi
  exit 0
"

# ─────────────────────────────────────────────
# 2. No workspace: dependency refs
# ─────────────────────────────────────────────
check "no workspace: refs" bash -c "
  if ! node -e '
    const fs = require(\"fs\");
    const pkg = JSON.parse(fs.readFileSync(\"$REPO_ROOT/package.json\", \"utf8\"));
    const depTypes = [\"dependencies\", \"devDependencies\", \"peerDependencies\", \"optionalDependencies\"];
    for (const type of depTypes) {
      const deps = pkg[type];
      if (deps && typeof deps === \"object\") {
        for (const [key, val] of Object.entries(deps)) {
          if (typeof val === \"string\" && val.startsWith(\"workspace:\")) {
            console.error(type + \".\" + key + \"=\" + val);
            process.exit(1);
          }
        }
      }
    }
  ' 2>&1; then
    exit 1
  fi
  exit 0
"

# ─────────────────────────────────────────────
# 3. dist/ exists with CLI entry point
# ─────────────────────────────────────────────
check "dist/cli/main.js exists" bash -c "
  if [ ! -f '$REPO_ROOT/dist/cli/main.js' ]; then
    echo 'ERROR: dist/cli/main.js missing — run npm run build first' >&2
    exit 1
  fi
  exit 0
"

# ─────────────────────────────────────────────
# 4. No test/mock directories in dist/
# ─────────────────────────────────────────────
check "no __tests__ in dist/" bash -c "
  dirs=\$(find '$REPO_ROOT/dist' -type d -name '__tests__' -o -name '__mocks__' -o -name '__fixtures__' 2>/dev/null || true)
  if [ -n \"\$dirs\" ]; then
    echo 'ERROR: test/mock directories found in dist/:' >&2
    echo \"\$dirs\" >&2
    exit 1
  fi
  exit 0
"

# ─────────────────────────────────────────────
# 5. Required project files
# ─────────────────────────────────────────────
check "required files present" bash -c "
  missing=''
  for f in README.md LICENSE CHANGELOG.md CREDITS.md; do
    if [ ! -f '$REPO_ROOT/'\"\$f\" ]; then
      missing=\"\$missing \$f\"
    fi
  done
  if [ -n \"\$missing\" ]; then
    echo \"ERROR: missing required files:\$missing\" >&2
    exit 1
  fi
  exit 0
"

# ─────────────────────────────────────────────
# 6. No .env files in package files
# ─────────────────────────────────────────────
check "no .env files" bash -c "
  found=\$(find '$REPO_ROOT' -maxdepth 1 -name '.env*' -o -name 'credentials*.json' 2>/dev/null || true)
  pem_secrets=\$(find '$REPO_ROOT' -maxdepth 1 -name '*.pem' 2>/dev/null | xargs -r grep -l 'PRIVATE KEY' 2>/dev/null || true)
  found="\$found\${found:+\$'\n'}\$pem_secrets"
  found=\$(echo "\$found" | sed '/^\$/d')
  if [ -n \"\$found\" ]; then
    echo 'ERROR: sensitive files at repo root (matched .env*, credentials*.json, or private-key *.pem):' >&2
    echo \"\$found\" >&2
    exit 1
  fi

  if node -e \"
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$REPO_ROOT/package.json', 'utf8'));
    const files = pkg.files || [];
    const envFiles = files.filter(f => f.match(/\\.env|credentials|secret|private.*\\.pem|\\.key\\.pem/i));
    if (envFiles.length > 0) {
      console.error('ERROR: sensitive files in package.json files array:', envFiles.join(', '));
      process.exit(1);
    }
  \" 2>&1; then
    exit 0
  else
    exit 1
  fi
"

# ─────────────────────────────────────────────
# 7. package.json required fields
# ─────────────────────────────────────────────
check "package.json fields valid" bash -c "
  if ! node -e '
    const fs = require(\"fs\");
    const pkg = JSON.parse(fs.readFileSync(\"$REPO_ROOT/package.json\", \"utf8\"));
    const required = [\"name\", \"version\", \"description\", \"main\", \"types\", \"bin\", \"files\", \"license\", \"repository\"];
    const missing = required.filter(f => !pkg[f]);
    if (missing.length > 0) {
      console.error(\"ERROR: missing required package.json fields:\", missing.join(\", \"));
      process.exit(1);
    }
    const semver = /^\\d+\\.\\d+\\.\\d+(-[a-z0-9.]+)?$/;
    if (!semver.test(pkg.version)) {
      console.error(\"ERROR: invalid version:\", pkg.version);
      process.exit(1);
    }
    if (!pkg.bin || !pkg.bin.dirgha) {
      console.error(\"ERROR: missing bin.dirgha entry\");
      process.exit(1);
    }
  ' 2>&1; then
    exit 1
  fi
  exit 0
"

# ─────────────────────────────────────────────
# 8. No secret-like patterns in dist/ files
# ─────────────────────────────────────────────
check "no secrets in dist/" bash -c "
  # Only flag actual key-like values (not env var names used in code).
  # Uses word-boundary and value-length heuristics to avoid false positives
  # on process.env.OPENROUTER_API_KEY style references.
  patterns=(
    'sk-ant-api[0-9]{2}-[a-zA-Z0-9_-]{40,}'
    'sk-proj-[a-zA-Z0-9_-]{40,}'
    'sk-[a-zA-Z0-9]{48,}'
    'nvapi-[a-zA-Z0-9_-]{40,}'
    'gsk_[a-zA-Z0-9]{40,}'
    'xai-[a-zA-Z0-9]{40,}'
    'AIza[0-9A-Za-z_-]{30,}'
    'hf_[a-zA-Z0-9]{30,}'
  )
  found=0
  for pat in \"\${patterns[@]}\"; do
    matches=\$(grep -rEl \"\$pat\" '$REPO_ROOT/dist/' 2>/dev/null || true)
    if [ -n \"\$matches\" ]; then
      echo \"WARN: potential secret matching '\$pat' in:\" >&2
      echo \"\$matches\" | while read f; do echo \"       \$f\" >&2; done
      found=1
    fi
  done
  if [ \"\$found\" -eq 1 ]; then
    exit 1
  fi
  exit 0
"

# ─────────────────────────────────────────────
# 9. CLI binary launches
# ─────────────────────────────────────────────
check "CLI --version works" bash -c "
  out=\$(node '$REPO_ROOT/dist/cli/main.js' --version 2>&1 || true)
  if ! echo \"\$out\" | grep -qE '^dirgha [0-9]+'; then
    echo \"ERROR: binary did not report version: \$out\" >&2
    exit 1
  fi
  exit 0
"

# ─────────────────────────────────────────────
# 10. Tarball size under budget (6 MB)
# ─────────────────────────────────────────────
check "tarball under 6 MB" bash -c "
  budget=6291456
  cd '$REPO_ROOT'
  rm -f dirgha-code-*.tgz
  npm pack >/dev/null 2>/dev/null
  tarball=\$(ls -t dirgha-code-*.tgz 2>/dev/null | head -1)
  if [ -z \"\$tarball\" ]; then
    echo 'ERROR: could not pack tarball'
    exit 1
  fi
  bytes=\$(stat -c%s \"\$tarball\" 2>/dev/null || echo 0)
  rm -f dirgha-code-*.tgz
  if [ \"\$bytes\" -eq 0 ]; then
    echo 'ERROR: could not get tarball size'
    exit 1
  fi
  if [ \"\$bytes\" -gt \"\$budget\" ]; then
    echo \"ERROR: tarball \$bytes bytes exceeds budget \$budget bytes\"
    exit 1
  fi
  echo \"(\$bytes bytes)\"
  exit 0
"

# ─────────────────────────────────────────────
# 11. No TypeScript source files in dist/
# ─────────────────────────────────────────────
check "no .ts files in dist/" bash -c "
  ts_files=\$(find '$REPO_ROOT/dist' -name '*.ts' -not -name '*.d.ts' 2>/dev/null || true)
  if [ -n \"\$ts_files\" ]; then
    echo 'ERROR: .ts source files found in dist/:' >&2
    echo \"\$ts_files\" >&2
    exit 1
  fi
  exit 0
"

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
if [ "$fail_count" -eq 0 ]; then
  printf "${GREEN}  ALL %s CHECKS PASSED — safe to publish.${NC}\n" "$pass_count"
  echo "══════════════════════════════════════════════════════"
  echo ""
  exit 0
else
  printf "${RED}  %s passed, %s failed — fix before publishing.${NC}\n" "$pass_count" "$fail_count"
  echo "══════════════════════════════════════════════════════"
  echo ""
  exit 1
fi
