// src/commands/error-recovery.ts
// Recovery commands for token limit and context errors
// Follows Slice Architecture: <100 lines per command

import { TokenLimitError, checkContextBudget } from '../errors/tokenLimit.js';
import { compactSession } from '../compaction/index.js';

interface RecoveryOptions {
  aggressive?: boolean;
  preserveRecent?: number;
}

export async function handleTokenLimitError(
  error: TokenLimitError,
  options: RecoveryOptions = {}
): Promise<string> {
  console.log(error.getSuggestedFix());
  
  const compressed = error.estimateCompressedSize();
  console.log(`\n📊 AAAK Compression Estimate: ${compressed.toLocaleString()} tokens`);
  
  if (options.aggressive) {
    console.log('\n🗜️  Running aggressive compaction...');
    await compactSession({ 
      mode: 'aggressive',
      preserveRecent: options.preserveRecent || 5
    });
    return 'Context compacted. Retry your request.';
  }
  
  return 'Run "/compact" or "/checkpoint save" then "/new" to continue.';
}

// Slash command: /compact
export async function compactCommand(args: string[]): Promise<string> {
  const mode = args.includes('--aggressive') ? 'aggressive' : 'standard';
  const preserve = args.includes('--preserve') 
    ? parseInt(args[args.indexOf('--preserve') + 1]) || 10
    : 10;
  
  console.log(`🗜️  Compacting session (mode: ${mode}, preserve: ${preserve} turns)...`);
  
  await compactSession({ mode, preserveRecent: preserve });
  
  return `✅ Session compacted. Removed old tool calls and deduplicated content.`;
}

// Slash command: /truncate
export async function truncateCommand(args: string[]): Promise<string> {
  const lines = parseInt(args[0]) || 50;
  
  return [
    `📝 Use line-range reading to reduce context:`,
    ``,
    `   /read file.ts:1-${lines}     - Read first ${lines} lines`,
    `   /read file.ts:50-100         - Read specific range`,
    `   /read file.ts:func:start     - Read function "start"`,
    ``,
    `This prevents loading entire files into context.`
  ].join('\n');
}

// Pre-flight check for all API calls
export function preflightContextCheck(
  files: Map<string, string>,
  history: string
): void {
  const budgetCheck = checkContextBudget(files, history, 200000);
  
  if (budgetCheck) {
    throw new TokenLimitError(budgetCheck);
  }
}
