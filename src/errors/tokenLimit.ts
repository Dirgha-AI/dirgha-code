// src/errors/tokenLimit.ts
// Token limit error handling for Dirgha CLI
// Enforces the 100-line file budget to prevent context overflow

export interface TokenLimitContext {
  actualTokens: number;
  maxTokens: number;
  filesIncluded: number;
  linesOfCode: number;
}

export class TokenLimitError extends Error {
  public readonly context: TokenLimitContext;
  
  constructor(context: TokenLimitContext) {
    const overage = context.actualTokens - context.maxTokens;
    super(
      `Context window exceeded: ${context.actualTokens.toLocaleString()} tokens ` +
      `> ${context.maxTokens.toLocaleString()} limit (+${overage.toLocaleString()})`
    );
    this.context = context;
    this.name = 'TokenLimitError';
  }
  
  getSuggestedFix(): string {
    const { actualTokens, maxTokens, filesIncluded, linesOfCode } = this.context;
    const overage = actualTokens - maxTokens;
    
    return [
      `❌ Token Limit Exceeded: ${actualTokens.toLocaleString()} > ${maxTokens.toLocaleString()}`,
      `   Overflow: +${overage.toLocaleString()} tokens`,
      '',
      '💡 Immediate Solutions:',
      '1. Run "/compact" - Compress conversation history (AAAK pattern)',
      '2. Run "/checkpoint save" then "/new" - Fresh context session',
      '3. Read specific ranges: "/read file.ts:1-50" (not full file)',
      '',
      '📏 Root Cause (File Budget Violation):',
      `   - Files sent: ${filesIncluded}`,
      `   - Total lines: ${linesOfCode}`,
      `   - Lines/file avg: ${Math.round(linesOfCode / filesIncluded)}`,
      '',
      '🔧 Prevention (Slice Architecture):',
      '   - Maximum 100 lines per file',
      '   - Maximum 500 words per doc section',
      '   - Split large files immediately',
      '   - Use progressive disclosure (tree → summary → detail)',
      '',
      'See: docs/ERROR_HANDLING.md'
    ].join('\n');
  }
  
  estimateCompressedSize(): number {
    // AAAK compression typically reduces by 60-85%
    return Math.floor(this.context.actualTokens * 0.3);
  }
}

// Pre-flight token estimation
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for code
  return Math.ceil(text.length / 4);
}

export function checkContextBudget(
  files: Map<string, string>,
  conversationHistory: string,
  maxTokens: number = 200000
): TokenLimitContext | null {
  let linesOfCode = 0;
  let fileContents = '';
  
  for (const [path, content] of files) {
    const lines = content.split('\n').length;
    linesOfCode += lines;
    fileContents += content;
    
    // Pre-flight file budget check
    if (lines > 100) {
      throw new Error(
        `File ${path} violates 100-line budget (${lines} lines). ` +
        `Split into smaller files before submission.`
      );
    }
  }
  
  const totalText = fileContents + conversationHistory;
  const actualTokens = estimateTokens(totalText);
  
  if (actualTokens > maxTokens) {
    return {
      actualTokens,
      maxTokens,
      filesIncluded: files.size,
      linesOfCode
    };
  }
  
  return null;
}

// Progressive disclosure helper
export function createProgressiveContext(
  files: Map<string, string>,
  phase: 'tree' | 'summary' | 'detail'
): string {
  switch (phase) {
    case 'tree':
      return Array.from(files.keys()).join('\n');
    
    case 'summary':
      return Array.from(files.entries())
        .map(([path, content]) => {
          const lines = content.split('\n');
          const first30 = lines.slice(0, 30).join('\n');
          return `// ${path} (${lines.length} lines)\n${first30}\n...`;
        })
        .join('\n\n');
    
    case 'detail':
      return Array.from(files.entries())
        .map(([path, content]) => `// ${path}\n${content}`)
        .join('\n\n');
  }
}
