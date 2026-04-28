# Sprint 1.10.0 — "Gemini-parity"

**Owner:** salik
**Started:** 2026-04-28 17:30 IST
**Goal:** Ship Dirgha CLI as a complete product at visual + UX parity with `@google/gemini-cli`. Single release, no patches.

## Why

- Reading model output in dirgha today is painful: raw markdown (`**bold**`, `## header`, ``` ```code``` ```) renders as literal text, no hierarchy.
- Tool calls render as N independent bordered cards — fragments the visual flow of an assistant turn.
- Theme tokens are flat (9 keys); adding new themes is high-friction.
- Compared to gemini, we score 4.8/10 on the audit composite (see `docs/sprints/2026-04-28-restoration-and-parity/...`). Target: ≥ 8.5/10.

## Scope (full release, NOT patches)

### Phase A — Foundation: Semantic theme tokens + 11 themes
| ID | Task | File | Status |
|---|---|---|---|
| A1 | Replace flat `Palette` with semantic tokens (`text.{primary,secondary,accent,response,link}`, `status.{success,warning,error}`, `ui.{active,comment,symbol,focus,dark}`, `border.{default}`, `background.{primary,message,input,focus,diff.{added,removed}}`) | `src/tui/theme.ts`, `theme-context.tsx` | ⬜ |
| A2 | Port 11 baked-in themes (`atom-one-dark`, `ayu-dark`, `dracula`, `github-dark`, `github-dark-colorblind`, `holiday-dark`, `shades-of-purple`, `solarized-dark`, `tokyonight`, `default-dark`, `ansi-dark`) from `gemini-cli/packages/cli/src/ui/themes/builtin/dark/` | `src/tui/themes/*.ts` | ⬜ |
| A3 | Update every `palette.X` callsite (15 files) to new tokens | `src/tui/ink/components/*` | ⬜ |
| A4 | Verify: typecheck clean, lint warnings ≤ existing baseline | — | ⬜ |

### Phase B — Native markdown stack (no `lowlight` dep)
| ID | Task | File | LOC est | Status |
|---|---|---|---|---|
| B1 | Line-by-line markdown parser (state machine) | `src/tui/ink/markdown/parser.ts` | 220 | ⬜ |
| B2 | Inline renderer (`**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[link](url)`) | `src/tui/ink/markdown/inline.tsx` | 100 | ⬜ |
| B3 | **Native** code colorizer — language tokenizers for `ts/tsx/js/jsx/py/sh/bash/go/rust/json/yaml/md/diff/sql/html/css` (regex-based, ~30 LOC each + dispatch) | `src/tui/ink/markdown/colorizer.tsx` + `src/tui/ink/markdown/langs/*.ts` | 500 | ⬜ |
| B4 | Pipe-syntax table renderer | `src/tui/ink/markdown/table.tsx` | 180 | ⬜ |
| B5 | Top-level `MarkdownDisplay` orchestrator | `src/tui/ink/markdown/display.tsx` | 250 | ⬜ |
| B6 | Replace `StreamingText` body with `<MarkdownDisplay>` | `src/tui/ink/components/StreamingText.tsx` | 30 | ⬜ |
| B7 | Verify: dogfood with a fixture markdown response (headings + lists + code-fence + table + inline code) | — | — | ⬜ |

### Phase C — Tool group rendering (gemini-style connected border)
| ID | Task | File | LOC est | Status |
|---|---|---|---|---|
| C1 | New `TOOL_STATUS` glyphs (`o ⊷ ✓ ? - ✗`) | `src/tui/ink/icons.ts` | 15 | ⬜ |
| C2 | New `DenseToolMessage` — single-line render for `fs_read`, `search_grep`, `search_glob`, `fs_ls`, `fs_edit` | `src/tui/ink/components/DenseToolMessage.tsx` | 150 | ⬜ |
| C3 | New `ToolGroup` — wraps consecutive tool calls with `borderStyle="round"`, `borderTop`-on-first / `borderBottom`-on-last; inner tools get `borderLeft + borderRight` only (no top/bottom) | `src/tui/ink/components/ToolGroup.tsx` | 200 | ⬜ |
| C4 | Drop `borderStyle="round"` outer wrap from `ToolBox`; render as connected segment (left+right border only); status icon + name + description + elapsed in one row, output preview indented below | `src/tui/ink/components/ToolBox.tsx` | -40 / +60 | ⬜ |
| C5 | Update `use-event-projection.ts` to group consecutive tool calls under the same assistant turn into a `ToolGroup` item | `src/tui/ink/use-event-projection.ts` | 80 | ⬜ |
| C6 | Verify: live smoke — run a multi-tool prompt (`shell + read + grep`); all calls render in ONE bordered region | — | — | ⬜ |

### Phase D — Polish + UX
| ID | Task | File | LOC est | Status |
|---|---|---|---|---|
| D1 | Live elapsed timer in busy hint (`(esc to cancel · 12s · ctrl+c×2 exit)`) | `src/tui/ink/components/InputBox.tsx` + `App.tsx` | 30 | ⬜ |
| D2 | **Auto-prompt model switch on failure** — wire `findFailover` into agent-loop catch path; render inline yellow `model X failed (400) · try Y? [y/n/p=picker]` chooser | `src/kernel/agent-loop.ts`, `src/tui/ink/App.tsx`, new `ModelSwitchPrompt.tsx` | 120 | ⬜ |
| D3 | **Opencode-style ModelPicker upgrade**: provider grouping (already have), filled `●` for current, fuzzy filter via leading `/`, right-aligned footer with `tier`/`free`/`price`, bottom keybind hint bar | `src/tui/ink/components/ModelPicker.tsx` | +90 | ⬜ |

### Phase E — Provider extensibility
| ID | Task | File | LOC est | Status |
|---|---|---|---|---|
| E1 | Skill file with the 6-step add-provider recipe (clone provider, register in index, add dispatch rule, add price row, add to setup BYOK list, add unit test) | `src/skills/add-provider.md` | 80 | ⬜ |
| E2 | Slash command `/provider add <name>` that runs the skill | `src/cli/slash/provider.ts` | 100 | ⬜ |
| E3 | Doc: `docs/extending/PROVIDERS.md` | — | 60 | ⬜ |

## Discipline rules

1. **Phase order is sequential.** A1 → A4 → B1 → … → E3. Don't start phase N+1 until phase N typechecks clean.
2. **NEW files preferred over edits.** When the task can be solved by a new file imported in one place, prefer that — minimises blast radius.
3. **Verify after each phase** (typecheck + lint + relevant unit tests + smoke if UX-visible). Stop on first red.
4. **No hy3 dispatch for refactors** — burned by InputBox refactor 4h ago. Only dispatch for self-contained NEW files (where verification is easy and rollback is `rm -f`). Decision: zero hy3 dispatch this sprint — porting directly from gemini's Apache-2.0 source is faster + zero hallucination risk.
5. **No git config edits.** Hard rule from `feedback_no_git_config_edits.md`.
6. **Pre-publish dogfood is mandatory.** Per `feedback_publish_dogfood.md`: `npm pack` → `npm i -g --force ./tgz` → run every phase verification against the installed `dirgha` binary, NOT `node dist/...`.
7. **Single commit per phase** with conventional-commit subject. Release-please picks them up; we ship as `1.10.0` once the last phase is green.

## Out of scope (deferred to 1.11)

- `StickyHeader` (uses gemini ink-fork extension `<Box sticky>` — not in stock ink@5; skipping until we want to fork ink).
- `lowlight` dependency (writing tokenizers natively).
- Compact-mode toggle setting (gemini's `ui.errorVerbosity` + compact tools enable/disable). Defer; ship with compact tools always-on.
- Markdown alternate-buffer scroll viewer.
- ModelStatsDisplay / quota indicators.
- Subagent group display.

## Verification matrix

After each phase commit:
- `npm run typecheck` → exit 0
- `npm run lint` → ≤ 25 warnings (current baseline)
- `npm test` → 72/72 (current) + new tests passing
- After phases B/C/D: `npm pack` → `npm i -g --force ./tgz` → `dirgha ask --max-turns 5 -m tencent/hy3-preview:free "<phase-fixture>"` → eyeball the rendering

After E (last phase):
- All of the above
- `dirgha --version` shows new version (release-please decides; we don't bump manually)
- Smoke matrix from `docs/sprints/2026-04-28-restoration-and-parity/CLI-DOGFOOD.md` re-run, 9/9 PASS
- Side-by-side capture: same prompt to dirgha + gemini, paste both outputs into `docs/sprints/2026-04-28-gemini-parity/SIDE-BY-SIDE.md`

## Why no hy3 dispatch

I considered fanning out the markdown stack across hy3 agents (B1-B5 are independent files). Three reasons against:

1. **Today's evidence**: hy3 wrote a broken InputBox refactor at ~16:00 IST. 20+ TS errors, dropped `React` import, untyped destructure. We reverted it. Same trap as 2026-04-20.
2. **Apache-2.0 source available**: gemini's `MarkdownDisplay`, `InlineMarkdownRenderer`, `TableRenderer`, `markdownParsingUtils` are all open-source. Direct port + token swap is mechanical and verifiable. No model hallucination risk.
3. **Native colorizer is ~500 LOC of regex tokenizers**: I can write the dispatch + 5 most-used languages (`ts/js/py/sh/json`) faster than scaffolding a hy3 prompt that captures the per-language token contract. The remaining 10 languages can extend over time.

If a future sprint has a self-contained new file with a clean spec, I'll dispatch then.
