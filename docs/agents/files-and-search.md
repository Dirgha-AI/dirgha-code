# Files and search

How the agent should read, search, and shell-out for files. Two external tools complement the built-ins: **rtk** for token-cheap shell + filesystem listing, and **qmd** for hybrid full-text + vector search across long-lived collections.

The default soul references this file. The agent reads it once at boot and follows the rules below.

## Built-ins always available

| Tool | When to use |
|---|---|
| `fs_read` | Read one file. Cheap, no transformations. |
| `fs_write` | Create or overwrite one file. |
| `fs_edit` | String-replace inside one file. Read first or `fs_edit` will refuse. |
| `fs_ls` | List one directory. Cheaper than running `ls` through shell. |
| `search_grep` | Search a regex across a path. Returns matches with file:line. |
| `search_glob` | Match filenames against a glob. |
| `shell` | Anything else. Capped output, captured stderr. |

The built-ins are the default. The two tools below are accessed through `shell` when they save tokens or unlock a query the built-ins can't do well.

## rtk — token-optimised shell proxy

`rtk` rewrites verbose stdout into a fraction of the bytes. Reach for it when a stock command would dump pages of output. Never use rtk to bypass safety; the whitelist of subcommands maps 1:1 to native counterparts.

| Native | rtk equivalent | Why |
|---|---|---|
| `ls -la some/dir` | `rtk ls some/dir` | Trims columns, groups by type. |
| `tree .` | `rtk tree .` | Caps depth, summarises large fanouts. |
| `cat path/to/file.md` | `rtk read path/to/file.md` | Heuristic dedup of repetitive content. |
| `git status / git log / git diff` | `rtk git ...` | Drops cosmetics; preserves what the agent needs. |
| `gh pr view 42 / gh issue list` | `rtk gh ...` | Strips colour, condenses tables. |
| `find . -name "*.ts"` | `rtk find . -name "*.ts"` | Compact tree output. |
| `npm / pnpm logs` | `rtk pnpm ...` | Ultra-compact build output. |
| `<any cmd>` | `rtk err <cmd>` | Show only errors and warnings. |
| `<test cmd>` | `rtk test <cmd>` | Show only failing tests. |

**Rule.** When the agent is about to run a command that's known-verbose (especially `tree`, `git log`, `find`, build/test suites), prefer the rtk equivalent. When in doubt, use the native command — rtk is about token cost, not correctness.

`rtk gain` shows running savings. The agent does not need to invoke this; it's a user-side metric.

## qmd — hybrid full-text + vector search

`qmd` indexes one or more "collections" (directories you tell it about) and supports keyword (BM25), vector, or hybrid (`query`) search. Use it when:

- The user asks a question that spans many files in a long-lived doc collection (e.g. `docs/`, a wiki, a large memo archive).
- `search_grep` would return too many matches to be useful.
- The query is conceptual ("how does the failover map work") and would benefit from reranking.

| Command | Use |
|---|---|
| `qmd collection add docs --name dirgha-docs --mask "**/*.md"` | One-time setup of a collection. |
| `qmd update` | Re-index after changes; pass `--pull` to `git pull` first. |
| `qmd embed` | Build vector embeddings (900 tokens/chunk, 15% overlap). One-time per content change. |
| `qmd query "<question>"` | **Default for the agent.** Hybrid search with reranking. |
| `qmd search "<keyword>"` | BM25 only; cheaper. |
| `qmd vsearch "<concept>"` | Vector only; useful when keywords don't appear verbatim. |
| `qmd get path/to/file.md:42 -l 60` | Open a result at a specific line. |
| `qmd multi-get "**/auth*.md"` | Pull several files in one shot. |

**Rule.** If the question is about long-form documentation that has a `qmd` collection registered, run `qmd query` first and read the top results before answering. The `dirgha-docs` collection is registered by default (see `qmd collection list`); user-registered collections are available too.

`qmd status` shows which collections are indexed; the agent checks this when it doesn't know whether a corpus is searchable.

## When to use what — decision tree

```
Question about a single, known file?       → fs_read
A handful of related files?                  → fs_read each, then synthesize
Need to find files by name pattern?          → search_glob (or rtk find)
Need to find a string across the codebase?   → search_grep
Need to find a CONCEPT, not a string?        → qmd query (if a collection covers it)
Need to run a CLI but its output is verbose? → rtk <subcommand>
None of the above?                            → shell, plain
```

## Cost discipline

- The agent has a token budget per turn. Reading 30 files of 200 lines blows it.
- Prefer search → narrow → read over read-everything-then-decide.
- When the user asks a doc question, `qmd query` returns ~5 reranked snippets; that's typically all you need.
- When the user asks about code, `search_grep` for the symbol → `fs_read` the one match → answer.

## Failure modes and fallbacks

- If `rtk` isn't installed, fall back to the native command unchanged.
- If `qmd` isn't installed, fall back to `search_grep` across the same path.
- If a `qmd` collection isn't indexed for the cwd, the agent says so explicitly and falls back to `search_grep`. It does NOT silently miss files.
