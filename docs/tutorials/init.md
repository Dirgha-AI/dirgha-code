# Dirgha Tutorial: Project Initialization

**Time:** 5 minutes
**Prerequisites:** Dirgha CLI installed (`npm install -g @dirgha/code`)

## What is `dirgha init`?

`dirgha init` scans your project and creates a `DIRGHA.md` file that teaches
Dirgha about your project's conventions, architecture, and preferences. The
better your `DIRGHA.md`, the better Dirgha's code will be.

## Step 1: Run init

```bash
cd your-project
dirgha init
```

If `DIRGHA.md` already exists, dirgha will show what it found:

```
$ dirgha init
DIRGHA.md already exists in this directory.
Key conventions found:
  - Use TypeScript strict mode
  - Tab size: 2 spaces
  - Test framework: vitest
  - Package manager: npm
```

## Step 2: What DIRGHA.md contains

A well-written `DIRGHA.md` includes:

```markdown
# Project conventions for Dirgha

## Architecture

- Backend in `src/server/`, frontend in `src/client/`
- Database: PostgreSQL via Prisma ORM
- API: REST with Express + Zod validation

## Code style

- TypeScript strict mode — no `@ts-ignore`, no `any`
- Use `Result<T, E>` type for error handling (no throw)
- Name React components with `PascalCase`, hooks with `use` prefix

## Testing

- Run `npm test` for all tests (vitest)
- Test files next to source: `src/foo/bar.test.ts`
- Coverage must stay above 80%

## Common gotchas

- The `.env` file uses `DATABASE_URL`, not `DB_URL`
- Port 3000 is reserved for the dev server
```

## Step 3: Customize for your project

Edit `DIRGHA.md` to add your specific needs:

- **Naming conventions:** "Use kebab-case for file names"
- **Dependency rules:** "Never add deps to `dependencies` unless they ship with the bundle"
- **Tool preferences:** "Use `Edit` over `Write` for existing files"
- **Build commands:** "Run `npm run build` before committing"
- **Git conventions:** "Commit messages: `type: subject` format"

## Step 4: Verify

Run `dirgha doctor` to confirm Dirgha is reading your conventions:

```
$ dirgha doctor
  DIRGHA.md  found (34 lines, 5 conventions)
  Node        v22.11.0
  Git         2.45.2
  ...
```

## Pro tip: Use `CLAUDE.md` for dual-agent support

If you use both Dirgha and Claude Code (or another agent that reads Claude.md),
name your file `DIRGHA.md` — Dirgha reads it. If you **only** use Claude Code,
create `.claude/CLAUDE.md` and Dirgha will read that too.

## Next steps

- See [fleet tutorial](./fleet.md) for parallel agents
- See [subagents tutorial](./subagents.md) for nested delegation
- Read about [primer loading](../architecture.md#primer-loading) for multi-file conventions
