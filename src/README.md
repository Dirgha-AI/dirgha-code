# CLI Source — Layer Rules

## SQLite Layer Rule

**DO NOT mix `session/db.ts` and `utils/sqlite.ts` (now `sqlite-future.ts`).**

- `session/db.ts` is the **authoritative** data layer. It uses `better-sqlite3` (`BetterSqlite3.Database`).
- `utils/sqlite-future.ts` is a migration shim for Node 22.5+ native `node:sqlite`. It is NOT active.
- All code that needs SQLite calls `getDB()` from `session/db.ts` and types against `BetterSqlite3.Database`.
- Do NOT import from `utils/sqlite.ts` or `utils/sqlite-future.ts` in production code.

## TypeScript Discipline

- All commits to `src/` must pass `npx tsc --noEmit` (0 errors).
- The pre-commit hook at `scripts/hooks/pre-commit-tsc` enforces this.
- Install: `cp scripts/hooks/pre-commit-tsc .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`

## AI Contribution Rules

- Gemini/Kimi generated code must pass `tsc --noEmit` before committing.
- Do NOT let AI rewrite App.tsx wholesale — it's the TUI root (721 lines, stable).
- Do NOT flatten `tui/components/jitter-free/` or `tui/components/code-edit/` subdirs.
