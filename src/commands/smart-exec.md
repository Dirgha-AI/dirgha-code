# Smart Execution Commands

Dirgha CLI v2.1 introduces intelligent execution control with automatic timeout recovery, paste management, and process health monitoring.

## Commands

### `dirgha exec`

Execute any command with automatic timeout, retry, and recovery.

```bash
# Basic usage with auto-timeout
 dirgha exec "git log --all --oneline"

# Custom timeout (5 seconds)
 dirgha exec "slow-command" --timeout 5000

# With retries and fallback
 dirgha exec "npm install" --retries 3 --fallback "pnpm install"

# Chunked execution for large outputs
 dirgha exec "cat huge-file.txt" --chunked

# No progress display
 dirgha exec "quiet-command" --no-progress
```

#### Features

- **Automatic Timeout**: Commands get sensible timeouts based on type (git=60s, build=120s, etc.)
- **Progress Tracking**: Shows lines processed, bytes, and duration in real-time
- **Auto-Retry**: Retries failed commands with exponential backoff
- **Fallback Chain**: Falls back to alternative commands on failure
- **Chunked Mode**: Automatically splits large operations into manageable chunks
- **Output Truncation**: Prevents memory issues with 100KB output cap

#### Event Output

```
▶ Attempt 1/2: git log --all --oneline
📊 1,247 lines, 45.2 KB, 1.23s
────────────────────────────────────────────────────────
✅ Success
   Duration: 1.45s
   Attempts: 1
   Strategy: direct
────────────────────────────────────────────────────────
```

### `dirgha paste`

Paste content with intelligent line counting, byte tracking, and preview.

```bash
# Interactive paste mode
 dirgha paste

# Paste from clipboard
 dirgha paste --clipboard

# With limits
 dirgha paste --max-lines 500 --max-chars 10000

# Save to file
 dirgha paste --save ./input.txt

# No preview (just summary)
 dirgha paste --no-preview
```

#### Paste Summary

```
────────────────────────────────────────────────────────
📊 PASTE SUMMARY
────────────────────────────────────────────────────────
   Lines: 247
   Chars: 12,456
   Bytes: 12.5 KB
   Time:  2.34s
────────────────────────────────────────────────────────

👁️  PREVIEW (first 200 chars):
────────────────────────────────────────────────────────
function calculateTotal(items) { ↵ return items.reduce((sum, item) => ↵ ...
────────────────────────────────────────────────────────
```

### `dirgha monitor`

Execute with real-time health monitoring and stuck detection.

```bash
# Monitor any long-running command
 dirgha monitor "npm run build"

# With custom stuck threshold (10 seconds)
 dirgha monitor "slow-test" --timeout 10000

# With memory limits
 dirgha monitor "heavy-task" --memory-warning 300000000 --memory-critical 600000000
```

#### Health Display

```
Monitoring: npm run build
Stuck threshold: 30s
────────────────────────────────────────────────────────
● healthy  | Output: 2.3s | Memory: 45.2 MB | Lines: 1,247
```

Status indicators:
- `● green` = healthy
- `● yellow` = warning (no output >10s)
- `● red` = stuck (no output >30s) or critical memory

## Configuration

### Execution Timeouts by Command Type

| Command Type | Timeout | Example |
|--------------|---------|---------|
| quick | 10s | echo, cat |
| git | 60s | git log, git push |
| build | 120s | npm run build |
| test | 60s | npm test |
| install | 180s | npm install, pnpm install |
| search | 10s | grep, find, ag |
| network | 45s | curl, wget |
| largeFile | 300s | Processing big files |
| default | 30s | Everything else |

### Memory Limits

| Level | Threshold | Action |
|-------|-----------|--------|
| warning | 200 MB | Log warning |
| critical | 500 MB | Kill process |
| max | 1 GB | Hard limit |

### Paste Limits

| Limit | Default | Purpose |
|-------|---------|---------|
| maxLines | 1000 | Prevent paste bombs |
| maxChars | 50,000 | Memory safety |
| previewLength | 200 | Readable preview |

## Recovery Strategies

### When Commands Get Stuck

1. **Auto-detect**: No output for 30 seconds
2. **SIGTERM**: Graceful termination attempt
3. **SIGKILL**: Force kill after 5 seconds
4. **Fallback**: Try alternative command
5. **Chunked**: Split into smaller batches

### When Paste is Too Large

1. **Line limit**: Truncate at 1000 lines
2. **Char limit**: Truncate at 50,000 chars
3. **Progress display**: Show every 50 lines
4. **Clear indication**: ⚠️ Truncated warning

## API (Programmatic Usage)

### ExecutionController

```typescript
import { ExecutionController } from 'dirgha-cli/utils';

const controller = new ExecutionController();

// Monitor events
controller.on('attempt', ({ attempt }) => console.log(`Attempt ${attempt}`));
controller.on('progress', ({ bytes, lines }) => console.log(`${lines} lines`));
controller.on('timeout', () => console.log('Timeout!'));

// Execute
const result = await controller.execute('git', ['log'], {
  timeout: 60000,
  retries: 2,
  fallback: ['git', 'log', '--oneline'],
});
```

### PasteHandler

```typescript
import { PasteHandler } from 'dirgha-cli/utils';

const handler = new PasteHandler();

// Capture paste
const result = await handler.capturePaste({ maxLines: 500 });
console.log(`${result.lineCount} lines pasted`);

// Or from clipboard
const clipboard = await handler.pasteFromClipboard();
```

### HealthMonitor

```typescript
import { createHealthMonitor } from 'dirgha-cli/utils';

const monitor = createHealthMonitor({ stuckThreshold: 30000 });

monitor.on('stuck', ({ recommendation }) => {
  console.log(`Process stuck! ${recommendation}`);
});

monitor.start();
// ... run your process ...
monitor.outputReceived(bytes, lines);
monitor.stop();
```

## Troubleshooting

### "Process killed after timeout"

- Increase timeout: `--timeout 120000`
- Check if command is actually hanging
- Use `--chunked` for large outputs

### "Output truncated"

- This is expected for safety
- Use `--max-output 500000` to increase limit
- Or stream output directly (not through dirgha exec)

### "Clipboard not available"

- Install xclip (Linux): `apt-get install xclip`
- Or pbpaste (Mac): Built-in
- Or use interactive paste mode instead

### High memory usage

- Monitor shows real-time memory
- Process auto-kills at 500MB by default
- Adjust with `--memory-critical`
