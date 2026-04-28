# Architecture efficiency — how we avoid bloat and decay

How dirgha-cli stays lean, prevents knowledge decay, scales to thousands of docs, and decides what's important.

## 1. Leanness — every layer pays for itself

Cheap to write = noisy. Expensive to write = curated. This shape forces lower layers to be the firehose and upper layers to be the signal.

| Layer | Write cost | Read pattern | Decay mechanism |
|---|---|---|---|
| Audit JSONL | Free (one append per event) | Diagnostic only — model never reads it | Operator rotates the file; nothing depends on old entries |
| Memory KV | One file per fact, written deliberately | Loaded into context at boot | Stale entries get explicitly removed when a contradiction is noticed |
| Ledger | Cheap append + agent rewrites the digest | Digest at boot; JSONL searched on demand | Agent compacts when digest exceeds budget |
| KB (compiled wiki) | Expensive — runs the full ingest pipeline | One reasoning-based query returns 5 ranked snippets | `dirgha kb lint` surfaces orphans, contradictions, stale pages |

Three hard rules in the codebase keep individual files from sprawling:

- **Every `src/*.ts` ≤ 200 lines.** Verified in audit. When a file approaches the cap, it's a refactor signal, not an exception.
- **Every system-prompt section is capped.** Soul 4 KB, primer 8 KB, git_state 4 KB. A blown-up section can't drown the others.
- **Every parity-matrix row closure cites code + test.** No row closes without a runnable assertion. Blocks the "we said we did it but didn't" rot.

## 2. Knowledge decay — three forms, three defences

Decay shows up in three forms.

**Drift** (the doc says X, the code does Y). Defended by:
- The parity matrix. Every cell has a citation. Delete the cited code and the next test run blows up before the matrix lies for a week.
- `dirgha kb lint` — surfaces stale wiki pages whose source text changed.
- `dirgha audit-codebase` — periodic full sweep that compares comment claims to code reality.

**Staleness** (the entry was true once, isn't now). Defended by:
- Timestamps everywhere. `audit.events[].ts`, `keypool[].addedAt`, `models-cache.fetchedAt`. The agent's memory rules say "before recommending from a memory entry, verify it's still true now."
- TTL on caches (`models-cache.json` 24 h).
- Agent-rewrites-digest pattern — old ledger entries get folded into a current summary; raw JSONL stays for forensics but isn't the source of truth.

**Bloat** (you can't see the signal for the noise). Defended by:
- Layer separation above. Model never reads the firehose.
- TF-IDF cosine ranking on ledger search — top-5 instead of top-everything.
- KB tree-of-contents (PageIndex) for long docs — reasoning over structure, not vector similarity over chunks.

One known decay risk we're actively addressing: the audit log itself is unbounded append. Sprint 9-class follow-up is to rotate `events.jsonl` at 100 MB and stream-from-tail for `dirgha audit list`.

## 3. 1000+ md files — what happens

Walk the lifecycle:

1. **Source of truth.** The `docs/` tree. The DOCS-CONVENTION's index tree is the gatekeeper — every new file picks a slot or proposes a new one. Nothing is freeform dropped.
2. **Compile.** `dirgha kb ingest docs/` runs OpenKB once. For each `.md`, PageIndex builds a tree-of-contents structural index (~30 s/doc, parallelisable). LLM-summarises each doc into a short concept page. Auto-extracts entities and creates `[[wikilinks]]`. Stores the wiki at `~/.dirgha/kb/wiki/`. Plain Markdown, Obsidian-compatible.
3. **Query.** `dirgha kb query "how does the failover map work?"` runs reasoning-based retrieval over the tree-of-contents — not over a vector of all 1000 chunks. PageIndex walks the index like a human navigating a doc TOC.
4. **Update.** `--watch` mode re-ingests touched files. The wiki is incrementally maintained, not rebuilt from scratch.
5. **Decay control.** `dirgha kb lint` surfaces orphans (zero incoming wikilinks), contradictions (two pages making opposite claims), stale pages (source `.md` was deleted), gaps (referenced concept that has no page).

Practical numbers: 1000 docs of ~5 KB each = 5 MB raw. PageIndex tree per doc is ~10 KB. Wiki output is roughly the size of the input. Query latency is dominated by the LLM call, not search — typically 2–5 s per query.

The trap to avoid: dumping 1000 raw md files into a vector DB and hoping similarity wins. PageIndex sidesteps it by indexing structure, not embeddings.

## 4. Changesets — what they actually solve

**Problem:** humans forget to update CHANGELOG. Months later it's either marketing fluff or empty.

**Solution:**
1. Each PR adds `.changeset/<random-name>.md` with frontmatter `@dirgha/code: minor` and a one-line summary.
2. CI rejects PRs that touch shipped behaviour without a changeset.
3. `npx changeset version` collapses every pending changeset into a CHANGELOG entry, bumps semver tier accordingly, deletes the changesets.
4. `npx changeset publish` ships to npm.

**Why it matters for KM:** the changesets ARE the project's short-term memory of "what changed". They're append-only (per PR), get compacted into CHANGELOG (per release), and the CHANGELOG itself is one of the docs OpenKB ingests. A question like "when did we add multi-key BYOK?" gets answered from the wiki without anyone manually updating any doc.

Status today: scaffold landed in `.changeset/`. Full CI gating is the next step — coupled to the pnpm workspace, needs a small wrapper to scope to `@dirgha/code` only.

## 5. Importance — short term vs. long term

Three lenses, mapped to artifacts.

### Short term (this sprint)

**Primary signal: the parity matrix sum-of-gaps.** Currently 0. When a new dimension is added or a regression is found, sum-of-gaps rises and the highest-gap row becomes the most important work. Every closure cites code + test, so progress is verifiable, not vibes.

Other short-term signals:
- Failing tests (`npm run test:cli:offline` red)
- Open changesets (work in flight)
- Audit findings rated high-or-critical that haven't been fixed

### Medium term (this release)

**Primary signal: the ROADMAP.md "in flight" section.** Each sprint has one goal, one acceptance test, one binding contract update.

Other medium-term signals:
- Tweet draft for the release — if a feature isn't in the tweet, it's probably not user-facing enough to gate the release on
- The CHANGELOG-since-last-publish — anything large enough to break a contract bumps minor; anything that breaks API bumps major

### Long term (this project)

**Primary signal: the ledger digest at scope `default`.** The project's accumulated learnings — what failed, what worked, what we'd do differently. A fresh agent reads it and catches up in 90 seconds.

Other long-term signals:
- Recurring topics in the audit log's `kind:error` entries — patterns mean architecture wants something different
- The KB's concept-page list — the entities the project keeps coming back to are the project's conceptual core
- The user-feedback memory entries — those are the constraints the project has earned over months. They outlast features.

### How the agent decides

When you ask the agent to do something useful, soul + ledger + memory + parity-matrix-gaps form a 4-corner triangulation:

- **Soul** says how to behave.
- **Memory** says what's true about you and the project.
- **Ledger digest** says what's been tried.
- **Matrix gap** says what's unfinished.

If three of four agree, the agent acts. If they conflict, the agent flags the conflict back to you instead of guessing.

## Summary

The architecture stays lean because nothing is free to write without earning a place in a higher layer. Decay is fought at the boundary between layers — each one is responsible for not letting the layer below become canonical. Importance is a derived property of the artifacts: matrix gap, ledger digest, audit error patterns. There's no separate priority list to maintain.
