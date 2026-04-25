# Error Handling Guide

## Token Limit Errors

### Error Pattern
```
invalid_request_error: The prompt is too long: 273046, 
model maximum context length: 262143
```

### Immediate Fix
When this error occurs, the CLI must:

1. **Truncate Conversation History**
   - Keep only last 10 message turns
   - Summarize older context using local LLM

2. **Split Large Files**
   - Any file >100 lines must be chunked
   - Show summary + relevant section only

3. **Use Progressive Disclosure**
   - Phase 1: File tree (no content)
   - Phase 2: Specific files on demand
   - Phase 3: Deep dive selected functions

### Prevention
- File budget: 100 lines max (enforced pre-flight)
- Context budget: 150K tokens max (50K buffer)
- Auto-compact after every 20 tool calls

### Code Implementation
```typescript
// src/errors/tokenLimit.ts
export class TokenLimitError extends Error {
  constructor(
    public readonly actual: number,
    public readonly max: number
  ) {
    super(`Context too long: ${actual} > ${max}`);
  }
  
  suggestFix(): string {
    const overage = this.actual - this.max;
    return [
      `Context exceeds limit by ${overage} tokens.`,
      'Solutions:',
      '1. Run "/compact" to compress history',
      '2. Run "/checkpoint save" then "/new" for fresh context',
      '3. Use "@file.ts:1-50" to read specific line ranges',
      '4. Split files >100 lines before submission'
    ].join('\n');
  }
}
```

## Related
- See MEMORY_SYSTEM_FINAL.md for GEPA compaction
- See SLICE_ARCHITECTURE.md for file budgeting
