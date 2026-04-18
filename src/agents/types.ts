/**
 * agents/types.ts — Agent team types
 */
export interface Agent {
  id: string;
  name: string;
  role: 'architect' | 'coder' | 'tester' | 'reviewer' | 'researcher';
  model: string;
  systemPrompt: string;
}

export interface AgentTeam {
  id: string;
  agents: Agent[];
  task: Task;
  consensus: 'unanimous' | 'majority' | 'leader';
  votes: Map<string, boolean>;
}

export interface Task {
  id: string;
  description: string;
  context: string;
  deliverables: string[];
}

export interface AgentDecision {
  agentId: string;
  approve: boolean;
  reasoning: string;
  confidence: number;
}
