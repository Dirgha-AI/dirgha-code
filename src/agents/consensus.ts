/**
 * agents/consensus.ts — Agent team voting
 */
import type { AgentTeam, AgentDecision } from './types.js';

export interface ConsensusResult {
  approved: boolean;
  votesFor: number;
  votesAgainst: number;
  required: number;
  reasoning: string;
}

export function vote(team: AgentTeam, agentId: string, approve: boolean): void {
  team.votes.set(agentId, approve);
}

export function resolveConsensus(team: AgentTeam): ConsensusResult {
  const votes = Array.from(team.votes.values());
  const votesFor = votes.filter(v => v).length;
  const votesAgainst = votes.length - votesFor;
  
  let required: number;
  switch (team.consensus) {
    case 'unanimous':
      required = team.agents.length;
      break;
    case 'majority':
      required = Math.ceil(team.agents.length / 2);
      break;
    case 'leader':
      required = 1; // Leader's vote is decisive
      break;
    default:
      required = Math.ceil(team.agents.length / 2);
  }
  
  const approved = votesFor >= required;
  
  return {
    approved,
    votesFor,
    votesAgainst,
    required,
    reasoning: `${votesFor}/${team.agents.length} votes (${team.consensus} consensus)`
  };
}

export function resetVotes(team: AgentTeam): void {
  team.votes.clear();
}
