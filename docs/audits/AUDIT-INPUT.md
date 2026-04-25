# dirgha-cli audit

Audit task. Look across `src_v2/` (≤14.5K LOC across 23 modules) and
`scripts/qa-app/` (38 test suites). Use only the read-only tools:
fs_read, fs_ls, search_grep, search_glob.

Find concrete issues in these categories — flag specific file:line:

1. **Dead / unused code** — exports nobody imports, functions never called,
   types declared once and never referenced.
2. **Weak tests** — assertions that pass even when the code is broken
   (e.g. `assert.ok(x)` where x is always truthy, `expect.any(...)` over-broad,
   tests that don't actually exercise the claimed behavior).
3. **Missing test coverage** — public exports that have no test at all.
4. **Security issues** — paths concatenated without resolve, env vars
   logged in plaintext, file permissions wrong, shell injection points.
5. **Contradictions** — comments that don't match code, doc claims that
   diverge from implementation, types that lie about their domain.
6. **Cross-platform bugs** — POSIX-only assumptions (like `/` separators
   in paths), `readFileSync` defaults that vary by platform.
7. **Performance smells** — sync I/O in hot paths, unbounded buffers,
   missing timeouts on network calls.

Output format: a single Markdown table with columns
`severity | category | file:line | finding | suggested fix`. Severity is
critical | high | medium | low. Order from critical to low.

Skip:
- The parity matrix file (it intentionally references competitors)
- node_modules, dist*, .git, .fleet
- Any test sandbox under /tmp
- Style nits (formatting, naming preference, comment density)

Cap: ~30 findings. Prioritize the highest-impact ones. If something
deserves more than one line, give it a paragraph but mark it `[long]`.

Save your final output to `/root/dirgha-ai/domains/10-computer/cli/docs/audits/HY3-AUDIT-2026-04-25.md` then report `done`.

Start by reading `src_v2/cli/main.ts` and `src_v2/kernel/agent-loop.ts`
for orientation, then walk the rest in module order.
