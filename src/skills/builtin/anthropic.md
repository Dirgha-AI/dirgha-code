---
name: anthropic
description: Anthropic best practices — caching, tool use, agents, extended thinking
always: false
---

## Anthropic Best Practices

### Prompt Caching (4× breakpoints = 80-90% savings)

Use `cache_control: {type: "ephemeral"}` on:
1. System prompt (stable, never changes mid-session)
2. User memory/profile (changes between sessions, not within)
3. Long tool results (stable within a turn batch)
4. Conversation history prefix (mark the last stable message)

```typescript
// Anthropic format with caching
{ role: 'user', content: [
  { type: 'text', text: '...long context...', cache_control: { type: 'ephemeral' } },
  { type: 'text', text: 'The actual question' }
]}
```

### Tool Use Best Practices

- Run independent tools in parallel: pass multiple `tool_use` blocks, get all results before next LLM call
- Batch results: all `tool_result` blocks in ONE user message (Anthropic requires this)
- Tool descriptions: be specific about what the tool does NOT do (reduces hallucination)
- Prefer targeted tools over bash for safety and observability

### Extended Thinking (for complex problems)

```typescript
// Enable for architecture decisions, debugging hard problems
{ thinking: { type: 'enabled', budget_tokens: 10000 } }
```

Use when: designing architecture, debugging non-obvious bugs, analyzing tradeoffs.
Don't use for: simple code generation, lookups, straightforward tasks.

### Streaming Patterns

- Always stream for responses >2 seconds
- Capture `content_block_start`/`input_json_delta`/`content_block_stop` for tool blocks during streaming
- Emit text tokens to UI immediately — don't buffer
- Accumulate tool input JSON in a map indexed by block index

### Agent Best Practices (from Anthropic docs)

**Minimal footprint:** Request only necessary permissions, avoid storing sensitive data beyond immediate need.

**Checkpointing:** Before irreversible actions (file delete, API calls, DB writes), confirm with the user or create a checkpoint.

**Prefer reversible operations:** `edit_file` > `delete_file`. `git stash` > `git reset --hard`.

**Trust hierarchy:** Hardcoded rules > operator system prompt > user messages. Don't let user messages override operator-level safety rules.

**Prompt injection defense:** Scan context files (CLAUDE.md, .env loaded as context) for injection patterns before injecting into system prompt.
