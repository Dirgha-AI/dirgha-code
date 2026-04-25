# Contributing to Dirgha CLI

Thank you for your interest in contributing! This document covers everything you need to know.

## Table of Contents

1. [Development Setup](#development-setup)
2. [Project Structure](#project-structure)
3. [Code Style](#code-style)
4. [Testing](#testing)
5. [Pull Request Process](#pull-request-process)
6. [Architecture Guidelines](#architecture-guidelines)

---

## Development Setup

### Prerequisites

- Node.js 18+ and pnpm 9+
- Git
- SQLite (usually included with Node.js)

### Fork and Clone

```bash
# Fork the repo on GitHub, then:
git clone git@github.com:YOUR_USERNAME/dirgha-os-v1.git
cd domains/10-computer/cli
```

### Install Dependencies

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Run Tests

```bash
pnpm test           # Run all tests
pnpm test:watch     # Run in watch mode
pnpm test:coverage  # With coverage report
```

### Run Locally

```bash
# Link for local testing
pnpm link --global

# Or run directly
node dist/dirgha.mjs init
node dist/dirgha.mjs start
```

---

## Project Structure

```
src/
├── agent/              # Agentic loop and orchestration
│   ├── loop.ts         # Main conversation loop
│   ├── context.ts      # System prompt generation
│   ├── moim.ts         # Context assembly
│   ├── secrets.ts      # Secret redaction
│   ├── tool-execution.ts # Tool orchestration
│   ├── memory-sync.ts  # Post-loop memory update
│   └── tools/          # Tool implementations
│       ├── index.ts
│       ├── shell.ts    # Shell execution (SECURE)
│       ├── browser.ts  # Browser automation
│       ├── fs.ts       # File operations
│       └── ...
├── billing/            # Usage tracking
│   ├── types.ts
│   ├── db.ts
│   ├── ratelimit.ts
│   └── middleware.ts
├── multimodal/         # Images, files, browser
│   ├── types.ts
│   ├── attachments.ts
│   └── slash.ts
├── providers/          # LLM providers
│   ├── types.ts
│   ├── index.ts
│   ├── litellm.ts      # OpenAI-compatible
│   ├── anthropic.ts    # Claude
│   ├── fireworks.ts    # Fireworks AI
│   ├── openrouter.ts   # OpenRouter
│   └── ...
├── repl/               # Interactive terminal
│   ├── index.ts
│   ├── input.ts
│   └── slash/          # Slash commands
│       ├── types.ts
│       ├── index.ts
│       ├── session.ts
│       ├── config.ts
│       └── ...
├── session/            # Persistence
│   ├── db.ts           # SQLite
│   ├── persistence.ts  # File + DB dual storage
│   └── commands/
├── types.ts            # Core types
└── utils/              # Utilities
```

---

## Code Style

### TypeScript

- Use strict TypeScript (`strict: true` in tsconfig)
- Explicit return types on exported functions
- No `any` types (use `unknown` with type guards)
- Prefer interfaces over type aliases for objects

```typescript
// ✅ Good
export async function processUser(
  input: string,
  options: ProcessOptions
): Promise<Result> {
  const validated = validate(input);
  if (!validated) {
    throw new ValidationError('Invalid input');
  }
  return await transform(validated, options);
}

// ❌ Avoid
export async function processUser(input, options) {
  return transform(input, options);
}
```

### File Organization

**Critical: Every file must be under 200 lines.**

When a file grows beyond this:

1. **Split by responsibility**, not by technical layer
2. Each unit should have one clear purpose
3. Define the interface contract first

```
# ✅ Good split
providers/
├── types.ts          # Shared types
├── index.ts          # Main dispatcher
├── detection.ts      # Provider detection
├── http.ts            # HTTP utilities
├── litellm.ts         # LiteLLM provider
└── tools-format.ts    # Tool conversion

# ❌ Bad split (by technical layer)
providers/
├── types/
│   └── index.ts
├── utils/
│   └── http.ts
├── logic/
│   └── litellm.ts
└── index.ts
```

### Naming Conventions

```typescript
// Files: kebab-case
my-file.ts           // ✅
myFile.ts            // ❌

// Functions: camelCase
processUser()         // ✅
process_user()        // ❌

// Types/Interfaces: PascalCase
interface UserConfig  // ✅
interface userConfig  // ❌

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;  // ✅
const maxRetries = 3;   // ❌
```

### Imports

```typescript
// Order: Node built-ins → external → internal
import fs from 'node:fs';                    // 1. Node built-ins
import path from 'node:path';

import chalk from 'chalk';                    // 2. External
import inquirer from 'inquirer';

import type { Message } from './types.js';   // 3. Internal (types first)
import { callGateway } from './gateway.js';   // 4. Internal (code)

// Use explicit .js extensions for ES modules
import { helper } from './utils.js';         // ✅
import { helper } from './utils';           // ❌
```

---

## Testing

### Test File Location

Colocate tests with source files:

```
src/
├── billing/
│   ├── ratelimit.ts
│   └── ratelimit.test.ts    # ✅ Next to source
```

### Test Structure

```typescript
import { describe, it, expect, vi } from 'vitest';
import { processData } from './data.js';

describe('processData', () => {
  it('should process valid input', async () => {
    const result = await processData('valid');
    expect(result).toEqual({ status: 'ok' });
  });

  it('should throw on invalid input', async () => {
    await expect(processData('')).rejects.toThrow('Invalid');
  });

  it('should handle edge cases', async () => {
    const result = await processData('  spaced  ');
    expect(result.trimmed).toBe('spaced');
  });
});
```

### Mocking

```typescript
// Mock external dependencies
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('mock content'),
  writeFileSync: vi.fn()
}));

// Mock with spy
const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

// Restore after test
spy.mockRestore();
```

### Test Coverage Requirements

- New features: 80%+ coverage
- Bug fixes: Include regression test
- Refactors: Maintain or improve coverage

---

## Pull Request Process

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make Changes

- Follow code style guidelines
- Keep files under 200 lines
- Add/update tests
- Update documentation if needed

### 3. Test Locally

```bash
pnpm test
pnpm build
```

### 4. Commit

Follow conventional commits:

```bash
# Types: feat, fix, docs, style, refactor, test, chore
feat: add browser screenshot command
fix: prevent shell injection in command parsing
docs: update API reference for multimodal
test: add coverage for rate limiting
```

### 5. Push and PR

```bash
git push origin feature/your-feature-name
```

Then open a PR on GitHub with:
- Clear description of changes
- Link to related issue
- Screenshots (if UI changes)
- Test results

### PR Checklist

- [ ] Tests pass (`pnpm test`)
- [ ] Build succeeds (`pnpm build`)
- [ ] No TypeScript errors (`pnpm tsc --noEmit`)
- [ ] Files under 200 lines
- [ ] Documentation updated
- [ ] No new dependencies without approval

---

## Architecture Guidelines

### Adding a New Provider

1. Create `src/providers/myprovider.ts`
2. Implement required exports:
   - `name: string`
   - `stream()` generator function
   - `detect()` function
   - `defaultModel: string`

3. Register in `src/providers/index.ts`
4. Add test file `src/providers/myprovider.test.ts`

### Adding a New Tool

1. Add to `src/agent/tools/index.ts`:
   - Tool definition in `TOOL_DEFINITIONS`
   - Handler in `executeTool()` switch

2. Update slash commands if needed
3. Add test coverage

### Adding a Slash Command

1. Create command in appropriate `src/repl/slash/*.ts`
2. Export from `src/repl/slash/index.ts`
3. Add help text

Example:

```typescript
// src/repl/slash/myfeature.ts
import type { SlashCommand, ReplContext } from './types.js';

export const myCommand: SlashCommand = {
  name: '/mycommand',
  description: 'Does something useful',
  aliases: ['/mc'],
  async execute(args, context) {
    // Implementation
    console.log('Executed mycommand with:', args);
  }
};

// Register in src/repl/slash/index.ts
import { myCommand } from './myfeature.js';
export const allCommands = [
  // ... existing commands
  myCommand
];
```

---

## Security Guidelines

### Shell Execution

**NEVER use `shell: true` or string concatenation.**

```typescript
// ✅ Secure
import { spawnSync } from 'node:child_process';
const result = spawnSync('npm', ['install', 'lodash'], {
  shell: false,
  cwd: workingDir
});

// ❌ NEVER DO THIS
const result = spawnSync('bash', ['-c', `npm install ${userInput}`], {
  shell: false  // Still vulnerable!
});
```

### Secret Handling

- Redact secrets in logs (see `src/agent/secrets.ts`)
- Never log API keys
- Use environment variables for sensitive data

### Input Validation

- Validate all user input before use
- Sanitize file paths (prevent directory traversal)
- Check MIME types for uploads

---

## Questions?

- Open an issue for bugs
- Start a discussion for feature ideas
- Join our community Discord (coming soon)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
