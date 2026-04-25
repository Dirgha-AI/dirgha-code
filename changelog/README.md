# Release notes

One file per release at `changelog/<version>.md`. The root [`CHANGELOG.md`](../CHANGELOG.md) is the npm-visible summary; this folder holds the long-form notes, dogfood evidence, migration guides, and per-release media (tweet drafts, promo MP4s).

## File layout per release

```
changelog/
├── README.md              this file — convention + index
├── 1.3.0.md               release notes (long-form)
├── 1.3.0-tweet.md         tweet thread draft for the release
├── 1.3.0-promo.mp4        45 s promo video (committed via Git LFS for files > 1 MB)
└── 1.4.0.md               next release (in flight)
```

## Convention for writing a release note

1. **Title:** `# <version> — <ISO date>`
2. **Quote pull:** one-line summary in a `>` blockquote — the user-visible "what changed".
3. **Highlights:** 5–10 bullets of the user-visible changes, grouped by theme.
4. **All changes:** Added / Fixed / Internal sections, each as a flat bullet list. Cite source paths.
5. **Dogfood evidence:** if features were built using dirgha itself (with hy3 etc.), note which ones and the test pass rates.
6. **Migration:** breaking changes + how to handle them. Even no-breaking-change releases include an empty bullet ("No breaking API changes.").
7. **Documentation landing:** a small table linking to the architecture / roadmap / per-feature docs that ship with this release.
8. **Acknowledgements:** any third-party project leaned on this release.

## How GitHub manages this

| Artifact | Where it lives | How it's produced |
|---|---|---|
| **Source tag** `v1.3.0` | git tag on the commit that bumped `package.json` | `git tag v1.3.0 && git push origin v1.3.0` |
| **GitHub release** | `https://github.com/<org>/<repo>/releases/tag/v1.3.0` | `gh release create v1.3.0 -F changelog/1.3.0.md` |
| **npm package** | `https://npmjs.com/package/@dirgha/code/v/1.3.0` | `npm publish` (after tag + release) |
| **Promo media** | `changelog/1.3.0-promo.mp4`, attached to the GH release | `gh release upload v1.3.0 changelog/1.3.0-promo.mp4` |
| **Tweet thread** | `changelog/1.3.0-tweet.md` (NEVER posted before user confirms) | hand-drafted; posting is a separate step |

## Order of operations for a release

```bash
# 1. Bump version, ensure CHANGELOG.md head + changelog/<v>.md are written.
npm version 1.3.0 --no-git-tag-version
$EDITOR CHANGELOG.md              # add the 1.3.0 entry
$EDITOR changelog/1.3.0.md         # write the long-form notes

# 2. Verify the build + sweep + scanner all green.
npm run build:v2
npm run test:cli:offline           # must be 100% green

# 3. Commit + tag.
git add -A
git commit -m "release: 1.3.0"
git tag v1.3.0

# 4. Push branch + tag.
git push origin main
git push origin v1.3.0

# 5. Create the GitHub release with the per-version notes.
gh release create v1.3.0 \
  --title "1.3.0" \
  --notes-file changelog/1.3.0.md \
  changelog/1.3.0-promo.mp4

# 6. Publish to npm (needs OTP).
npm publish

# 7. Post the tweet — only after npm install -g @dirgha/code@1.3.0
#    smoke-tests on a clean machine.
```

## Why not just rely on `git log` or auto-generated GitHub release notes?

Auto-generated notes are noise — they list every commit, including chore: bumps and merge commits. The per-release file is curated. It's the canonical "what to read if you want to know what changed". The user-facing tweet, the upgrade-from notes, and the dogfood evidence all stem from this one file.
