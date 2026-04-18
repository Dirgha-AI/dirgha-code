/**
 * agents/ensemble.ts — MoA (Mixture of Agents) ensemble
 */
import type { Agent, AgentDecision, Task } from './types.js';

export interface EnsembleConfig {
  layer1: Agent[];
  layer2: Agent;
  useFor: 'complex' | 'critical' | 'planning';
  confidenceThreshold: number;
}

export interface EnsembleResult {
  decision: boolean;
  consensus: number;
  layer1Decisions: AgentDecision[];
  layer2Synthesis: string;
  confidence: number;
}

export async function runEnsemble(
  config: EnsembleConfig,
  task: Task
): Promise<EnsembleResult> {
  // Layer 1: Independent agent decisions
  const layer1Decisions: AgentDecision[] = [];
  
  for (const agent of config.layer1) {
    const decision = await getAgentDecision(agent, task);
    layer1Decisions.push(decision);
  }
  
  // Layer 2: Aggregation
  const approveCount = layer1Decisions.filter(d => d.approve).length;
  const consensus = approveCount / layer1Decisions.length;
  
  const synthesis = await aggregateDecisions(config.layer2, task, layer1Decisions);
  
  return {
    decision: consensus >= 0.5,
    consensus,
    layer1Decisions,
    layer2Synthesis: synthesis,
    confidence: Math.min(consensus, 0.95)
  };
}

async function getAgentDecision(agent: Agent, task: Task): Promise<AgentDecision> {
  // Simplified - in reality would call LLM
  return {
    agentId: agent.id,
    approve: true,
    reasoning: `${agent.role} approves based on expertise`,
    confidence: 0.8
  };
}

async function aggregateDecisions(
  aggregator: Agent,
  task: Task,
  decisions: AgentDecision[]
): Promise<string> {
  const summary = decisions.map(d => 
    `${d.agentId}: ${d.approve ? 'approve' : 'reject'} (${d.reasoning})`
  ).join('; ');
  
  return `${aggregator.role} synthesis: ${summary}`;
}
