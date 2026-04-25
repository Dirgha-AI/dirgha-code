# Pattern: Awaiting Agent Results
**Anti-Pattern:** Fire-and-Forget Agents

## The Problem

```typescript
// ❌ WRONG: Fire-and-forget
spawn_agent({ type: "code", task: "Analyze repo" });
// Immediately proceeds without results
console.log("Analysis complete"); // LIE - no results yet
```

```typescript
// ❌ WRONG: Assuming synchronous return
const result = spawn_agent({ type: "code", task: "Analyze repo" });
console.log(result); // Just a handle/reference, not actual data
```

## The Fix

### Option 1: Await with Timeout
```typescript
// ✅ CORRECT: Await with timeout
const result = await withTimeout(
  spawn_agent({ type: "code", task: "Analyze repo" }),
  30000 // 30 second timeout
);

if (result?.success) {
  console.log(result.data);
} else {
  console.error("Agent failed:", result?.error);
}
```

### Option 2: Callback Pattern
```typescript
// ✅ CORRECT: Callback when complete
spawn_agent({
  type: "code",
  task: "Analyze repo",
  onComplete: (result) => {
    console.log("Done:", result);
  },
  onError: (err) => {
    console.error("Failed:", err);
  }
});
```

### Option 3: Poll for Results
```typescript
// ✅ CORRECT: Poll until ready
const handle = spawn_agent({ type: "code", task: "Analyze repo" });

const result = await poll(
  () => handle.getStatus(),
  (status) => status === "complete",
  { interval: 1000, timeout: 30000 }
);
```

### Option 4: Sequential Blocking (Safest)
```typescript
// ✅ CORRECT: Execute directly without agents for critical path
const result = await run_command("git clone ... && analyze.sh");
// Or use research() which is synchronous
```

## When to Use Each

| Pattern | Use When | Example |
|---------|----------|---------|
| `await withTimeout` | Need result, have time limit | API call analysis |
| `callback` | Fire multiple, process as complete | Parallel repo analysis |
| `poll` | Long-running, need progress | Multi-file refactoring |
| `direct execution` | Critical path, must have result | Security fixes |

## Anti-Pattern Detection

**Smell:** "Spawned X agents" but never checking `result`

**Fix:** Add verification step:
```typescript
// After spawning agents
const results = await Promise.allSettled(agentPromises);
const completed = results.filter(r => r.status === 'fulfilled');
console.log(`Completed: ${completed.length}/${agents.length}`);
```

## Real-World Example (Fixed)

```typescript
// ❌ BEFORE (what we did wrong)
spawn_agent({ type: "code", task: "Clone and analyze cline" });
spawn_agent({ type: "code", task: "Clone and analyze aider" });
spawn_agent({ type: "code", task: "Clone and analyze continue" });
// Proceeded with analysis - NO DATA

// ✅ AFTER (correct)
const analyses = await Promise.all([
  spawn_agent({ type: "code", task: "Clone and analyze cline" }),
  spawn_agent({ type: "code", task: "Clone and analyze aider" }),
  spawn_agent({ type: "code", task: "Clone and analyze continue" })
].map(p => withTimeout(p, 60000)));

for (const analysis of analyses) {
  if (analysis.success) {
    saveCompetitorData(analysis.repo, analysis.data);
  } else {
    logError(`Failed to analyze ${analysis.repo}: ${analysis.error}`);
  }
}
```

## CLI Implementation

Add to Dirgha CLI:

```bash
# Check agent status
dirgha agent status <agent-id>

# Wait for completion
dirgha agent wait <agent-id> --timeout 60

# List active agents
dirgha agent list --status running
```

## Lesson

**Always verify agent completion before proceeding.**

Fire-and-forget is fine for background tasks (notifications, logging).
Fire-and-await is required for critical path (analysis, code changes).
