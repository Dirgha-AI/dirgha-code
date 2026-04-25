# Changesets

Versioning + CHANGELOG entries for `@dirgha/code` are produced via [changesets](https://github.com/changesets/changesets).

## Quick reference

```bash
# Author a changeset (interactive)
npx changeset

# Apply pending changesets: bump versions + write CHANGELOG entries
npx changeset version

# Publish to npm (after review + commit)
npx changeset publish
```

## Convention

- Every PR that affects the published package adds a changeset under `.changeset/<random-name>.md`.
- The changeset frontmatter is `@dirgha/code: minor|patch|major` plus a one-line summary.
- Entries are flushed into `CHANGELOG.md` on the next `changeset version` run.
- Hand-written CHANGELOG edits stay above the auto-generated section.
