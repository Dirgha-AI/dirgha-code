/**
 * agents/orchestrate.ts — Multi-agent dispatch
 */
import type { Agent, Task } from './types.js';

export interface DispatchResult {
  agentId: string;
  result: string;
  latency: number;
}

export async function dispatchToAgent(
  agent: Agent,
  task: Task
): Promise<DispatchResult> {
  const start = Date.now();
  
  // In real implementation: call LLM with agent's system prompt
  const result = `[${agent.name}] Processed: ${task.description}`;
  
  return {
    agentId: agent.id,
    result,
    latency: Date.now() - start
  };
}

export async function dispatchToAll(
  agents: Agent[],
  task: Task
): Promise<DispatchResult[]> {
  return Promise.all(agents.map(agent => dispatchToAgent(agent, task)));
}

export function selectAgentForTask(agents: Agent[], task: Task): Agent {
  // Simple matching based on role keywords
  const keywords: Record<string, string[]> = {
    architect: ['design', 'architecture', 'structure'],
    coder: ['implement', 'code', 'function'],
    tester: ['test', 'verify', 'check'],
    reviewer: ['review', 'audit', 'analyze'],
    researcher: ['research', 'find', 'explore']
  };
  
  for (const agent of agents) {
    const agentKeywords = keywords[agent.role] || [];
    if (agentKeywords.some(kw => task.description.toLowerCase().includes(kw))) {
      return agent;
    }
  }
  
  // Default to first agent
  return agents[0];
}
