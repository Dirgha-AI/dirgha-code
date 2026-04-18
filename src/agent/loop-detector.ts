/**
 * agent/loop-detector.ts — Advanced Infinite Loop & Stagnation Detection
 */

interface ToolCall {
  name: string;
  input: Record<string, any>;
  inputHash: string;
  timestamp: number;
}

export class LoopDetector {
  private history: ToolCall[] = [];
  private readonly windowSize: number;
  private readonly repeatThreshold: number;
  private readonly stagnationThreshold: number;

  constructor(windowSize = 10, repeatThreshold = 3, stagnationThreshold = 4) {
    this.windowSize = windowSize;
    this.repeatThreshold = repeatThreshold;
    this.stagnationThreshold = stagnationThreshold;
  }

  record(name: string, input: Record<string, any>): void {
    const inputHash = stableHash(input);
    this.history.push({ 
      name, 
      input, 
      inputHash, 
      timestamp: Date.now() 
    });
    if (this.history.length > this.windowSize) this.history.shift();
  }

  /** Returns true if agent appears stuck in a loop or stagnating */
  isLooping(): boolean {
    if (this.history.length < this.repeatThreshold) return false;

    // 1. Exact Repetition Detection
    const recent = this.history.slice(-this.repeatThreshold);
    const first = recent[0]!;
    const isExactRepeat = recent.every(c => c.name === first.name && c.inputHash === first.inputHash);
    if (isExactRepeat) return true;

    // 2. Semantic Stagnation Detection
    // Detect if the agent is calling the same file-modifying tools on the same path repeatedly
    const fileTools = ['write_file', 'edit_file', 'edit_file_all', 'apply_patch'];
    const recentFileActions = this.history.filter(c => fileTools.includes(c.name));
    
    if (recentFileActions.length >= this.stagnationThreshold) {
      const paths = recentFileActions.map(c => c.input['path']).filter(Boolean);
      if (paths.length >= this.stagnationThreshold) {
        // Check if the last N actions were on the same path
        const lastPath = paths[paths.length - 1];
        const samePathCount = paths.slice(-this.stagnationThreshold).filter(p => p === lastPath).length;
        if (samePathCount >= this.stagnationThreshold) {
          return true; // Stagnating on the same file
        }
      }
    }

    return false;
  }

  /** Get details about why it thinks it is looping */
  getLoopReason(): string {
    const fileTools = ['write_file', 'edit_file', 'edit_file_all', 'apply_patch'];
    const recentFileActions = this.history.filter(c => fileTools.includes(c.name));
    if (recentFileActions.length >= this.stagnationThreshold) {
      const paths = recentFileActions.map(c => c.input['path']).filter(Boolean);
      const lastPath = paths[paths.length - 1];
      if (paths.slice(-this.stagnationThreshold).every(p => p === lastPath)) {
        return `stagnating on file: ${lastPath}`;
      }
    }
    return 'repeating exact tool calls';
  }

  reset(): void {
    this.history = [];
  }
}

function stableHash(obj: unknown): string {
  try {
    return JSON.stringify(obj, Object.keys(obj as object).sort());
  } catch {
    return String(obj);
  }
}

/** Build a reflection prompt based on iteration progress and loop state */
export function buildReflectionPrompt(iteration: number, maxIterations: number, reason?: string): string {
  const pct = Math.round((iteration / maxIterations) * 100);
  
  let systemMsg = `[SYSTEM: You have used ${iteration}/${maxIterations} iterations (${pct}%). `;
  
  if (reason) {
    systemMsg += `CRITICAL: It appears you are ${reason}. `;
  }

  if (iteration >= Math.floor(maxIterations * 0.8)) {
    return systemMsg + `You must complete or summarize your work now — do not start new sub-tasks. ` +
      `Deliver a final response with what you have accomplished.]`;
  }

  return systemMsg + `Pause and reflect: have you made real progress toward the goal? ` +
    `If you are stuck, try a different approach or verify your assumptions using read_file or search_files.]`;
}
