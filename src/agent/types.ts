/**
 * agent/types.ts — Structured output for agent-native CLI.
 * Based on CLI-Anything agent output patterns.
 */

/** Machine-parseable output wrapper for all commands. */
export interface AgentOutput<T = unknown> {
  /** Structured data for programmatic consumption. */
  data?: T;
  /** Human-readable text fallback. */
  text: string;
  /** Standard exit code (0 = success). */
  exitCode: number;
  /** Actionable next steps for agents. */
  suggestions?: string[];
  /** Command that produced this output. */
  command: string;
  /** Timestamp for tracking. */
  timestamp: string;
  /** Metadata about execution. */
  meta?: {
    durationMs?: number;
    tokensUsed?: number;
    model?: string;
    provider?: string;
  };
}

/** Command specification for SKILL.md generation. */
export interface CommandSpec {
  name: string;
  description: string;
  args: ArgSpec[];
  flags: FlagSpec[];
  output: 'text' | 'json' | 'both';
  examples: string[];
}

export interface ArgSpec {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'file';
  required: boolean;
  description: string;
}

export interface FlagSpec {
  name: string;
  short?: string;
  type: 'string' | 'number' | 'boolean';
  default?: unknown;
  description: string;
}

/** Skill definition for agent discovery. */
export interface SkillDef {
  name: string;
  version: string;
  description: string;
  commands: CommandSpec[];
}

/** Parse result for agent mode input. */
export interface AgentInput {
  command: string;
  args: Record<string, unknown>;
  flags: Record<string, unknown>;
  raw: string;
}
