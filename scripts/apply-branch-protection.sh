#!/usr/bin/env bash
#
# apply-branch-protection.sh — Apply branch protection rules to main
#
# WHAT THIS DOES:
#   This script applies GitHub branch protection settings to the
#   Dirgha-AI/dirgha-code repository's main branch via the GitHub API.
#
#   Settings applied (must match .github/settings.yml):
#   - Require 1 approving review (dismiss stale reviews: true)
#   - No code owner reviews required
#   - Required status checks: Test (ubuntu-latest · Node 22),
#     Test (macos-latest · Node 22), Test (windows-latest · Node 22)
#   - Enforce admins: true (Salik must follow the rule too)
#   - Required linear history: true (no merge commits)
#   - Allow force pushes: false
#   - Allow deletions: false
#   - Required signatures: false (not enforced via REST API)
#
# REQUIREMENTS:
#   - `gh` CLI installed and authenticated (https://cli.github.com/)
#   - Admin access to the Dirgha-AI/dirgha-code repository
#   - GitHub token with `repo` or `admin:org` scope
#   - `jq` (optional, for pretty-printing the response)
#
# USAGE:
#   bash scripts/apply-branch-protection.sh
#
# IDEMPOTENT: Yes — the PUT endpoint updates or creates the protection.
#
# WARNING: Running this script will RESTRICT the main branch. Ensure
#          you want these settings before running. You'll need admin
#          access to change them later via the GitHub UI or API.
#
# See also: .github/settings.yml (Probot Settings app format, documentary)

set -euo pipefail

REPO="Dirgha-AI/dirgha-code"
BRANCH="main"

echo "==> Applying branch protection to ${REPO}:${BRANCH}"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "ERROR: gh CLI is not installed. Install from https://cli.github.com/"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo "ERROR: Not authenticated with gh CLI. Run: gh auth login"
    exit 1
fi

# Check if user has admin access (try to read current protection)
echo "==> Checking current protection (if any)..."
CURRENT=$(gh api "repos/${REPO}/branches/${BRANCH}/protection" 2>/dev/null || echo "null")
if [ "$CURRENT" = "null" ]; then
    echo "    No protection currently set (or insufficient access to read)."
else
    echo "    Current protection exists. Will be updated."
fi

echo ""
echo "==> Applying protection settings..."

# Build the JSON payload for the branch protection API.
# See: https://docs.github.com/en/rest/branches/branch-protection
#
# Note: The status check context names must match exactly what GitHub
# reports. Our ci.yml workflow produces:
#   "Test (ubuntu-latest · Node 22)"
#   "Test (macos-latest · Node 22)"
#   "Test (windows-latest · Node 22)"
#
# Note: The Node 20 matrix entries are excluded in ci.yml, so we only
# require the Node 22 checks.

PAYLOAD=$(cat <<'EOF'
{
  "required_status_checks": {
    "strict": false,
    "contexts": [
      "Test (ubuntu-latest · Node 22)",
      "Test (macos-latest · Node 22)",
      "Test (windows-latest · Node 22)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_signatures": false,
  "restrictions": null
}
EOF
)

# Apply the protection settings
echo "$PAYLOAD" | gh api \
  --method PUT \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  --header "Accept: application/vnd.github+json" \
  --input -

echo ""
echo "==> Branch protection applied successfully!"
echo ""

# Try to display the current settings
echo "==> Current settings:"
if command -v jq &> /dev/null; then
    gh api "repos/${REPO}/branches/${BRANCH}/protection" 2>/dev/null | jq . || echo "(Could not read back settings — check admin access)"
else
    gh api "repos/${REPO}/branches/${BRANCH}/protection" 2>/dev/null || echo "(Could not read back settings — check admin access)"
fi

echo ""
echo "Done. The main branch is now protected."
echo "See .github/settings.yml for the declarative documentation."
