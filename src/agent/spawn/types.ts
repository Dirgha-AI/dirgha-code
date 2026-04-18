/**
 * agent/spawn/types.ts — Agent spawning type definitions
 */

/** Configuration for spawning an orchestration agent (used by orchestration layer) */
export interface AgentConfig {
  /** Functional role: explore | plan | verify | code | research | custom */
  type: string;
  /** Task prompt to send to the agent */
  task: string;
  /** Model override — defaults to caller's model */
  model?: string;
  /** Working directory for the agent */
  workDir?: string;
  /** Per-agent timeout in ms */
  timeoutMs?: number;
  /** Optional display name (used by slash commands) */
  name?: string;
  /** Optional agent identifier (used by pool/team commands) */
  id?: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Agent capabilities for discovery */
  capabilities?: string[];
  /** Human-readable description */
  description?: string;
}

export interface Agent {
  id: string;
  name: string;
  host: 'local' | 'docker' | 'ssh';
  tmuxSession: string;
  workDir: string;
  status: 'running' | 'idle' | 'stopped';
  provider: string;
  model?: string;
  idleTimeout?: number;
  createdAt: Date;
  lastActivity: Date;
}

export interface CreateAgentOptions {
  name?: string;
  host?: 'local' | 'docker' | 'ssh';
  provider?: string;
  model?: string;
  workDir?: string;
  idleTimeout?: number;
  message?: string;
  noConnect?: boolean;
  args?: string[];
}

export interface SnapshotMeta {
  id: string;
  agentName: string;
  createdAt: string;
}
