/**
 * agent/collaboration/consensus.ts — Multi-agent voting and decision consensus
 * Phase 2: Democratic decision making between agents
 */

import { randomUUID } from 'node:crypto';
import type { AgentId } from '../orchestration/types.js';
import type { Proposal, Vote, ConsensusResult } from './types.js';

/** Config for session-scoped consensus (used by slash commands) */
export interface ConsensusSessionConfig {
  id?: string;
  topic: string;
  agents?: AgentId[];
  strategy?: 'voting' | 'supermajority' | 'unanimous';
  quorum?: number;
}

/** Simplified vote state for slash command display */
export interface ConsensusState {
  topic: string;
  status: 'open' | 'resolved';
  strategy: string;
  agents: AgentId[];
  votes: Map<AgentId, { option: string; reason?: string }>;
}

/** Simplified resolve result for slash command display */
export interface ConsensusResolveResult {
  winners: string[];
  confidence: number;
}

export class ConsensusEngine {
  private proposals = new Map<string, Proposal>();
  private votes = new Map<string, Map<AgentId, Vote>>();
  private onConsensusCallbacks: ((result: ConsensusResult) => void)[] = [];

  // Session-mode state (used by slash /consensus commands)
  private _session?: { config: ConsensusSessionConfig; proposalId?: string };

  constructor(sessionConfig?: ConsensusSessionConfig) {
    if (sessionConfig) {
      this._session = { config: sessionConfig };
    }
  }

  /** Add a vote in session mode (used by /consensus vote) */
  addVote(agentId: AgentId, option: string, reason?: string): void {
    if (!this._session) throw new Error('Not in session mode');
    const { config } = this._session;

    // Lazily create the session proposal
    if (!this._session.proposalId) {
      const proposal = this.createProposal(
        'system',
        config.topic,
        [], // free-form options
        { minVoters: config.quorum ?? 2 }
      );
      this._session.proposalId = proposal.id;
    }

    this.castVote(this._session.proposalId, agentId, option, 0.8, reason);
  }

  /** Get current consensus state in session mode */
  getState(): ConsensusState {
    if (!this._session) throw new Error('Not in session mode');
    const { config, proposalId } = this._session;
    const voteMap = new Map<AgentId, { option: string; reason?: string }>();

    if (proposalId) {
      const rawVotes = this.votes.get(proposalId);
      if (rawVotes) {
        for (const [id, vote] of rawVotes) {
          voteMap.set(id, { option: vote.choice, reason: vote.reasoning });
        }
      }
    }

    const proposal = proposalId ? this.proposals.get(proposalId) : undefined;
    return {
      topic: config.topic,
      status: proposal?.status === 'open' ? 'open' : 'resolved',
      strategy: config.strategy ?? 'voting',
      agents: config.agents ?? [],
      votes: voteMap,
    };
  }

  /** Resolve the session consensus */
  resolve(): ConsensusResolveResult {
    if (!this._session) throw new Error('Not in session mode');
    const { proposalId } = this._session;

    if (!proposalId) return { winners: [], confidence: 0 };

    const result = this.closeProposal(proposalId);
    if (!result) return { winners: [], confidence: 0 };

    const winners = result.winningOption ? [result.winningOption] : [];
    return { winners, confidence: result.confidence };
  }

  /** Create a new proposal */
  createProposal(
    proposer: AgentId,
    description: string,
    options: string[],
    config: {
      type?: Proposal['type'];
      minVoters?: number;
      deadlineMinutes?: number;
    } = {}
  ): Proposal {
    const id = randomUUID();
    const deadline = new Date();
    deadline.setMinutes(deadline.getMinutes() + (config.deadlineMinutes || 5));
    
    const proposal: Proposal = {
      id,
      proposer,
      type: config.type || 'decision',
      description,
      options: options.length > 0 ? options : ['yes', 'no', 'abstain'],
      deadline,
      minVoters: config.minVoters || 2,
      status: 'open',
    };
    
    this.proposals.set(id, proposal);
    this.votes.set(id, new Map());
    
    // Auto-close on deadline
    this.scheduleDeadlineCheck(id, deadline);
    
    return proposal;
  }
  
  /** Cast a vote */
  castVote(
    proposalId: string,
    voter: AgentId,
    choice: string,
    confidence: number = 0.8,
    reasoning?: string
  ): boolean {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.status !== 'open') return false;
    
    const proposalVotes = this.votes.get(proposalId)!;
    
    // Check deadline
    if (new Date() > proposal.deadline) {
      this.closeProposal(proposalId);
      return false;
    }
    
    // Validate option
    if (!proposal.options.includes(choice)) return false;
    
    const vote: Vote = {
      proposalId,
      voter,
      choice,
      confidence: Math.max(0, Math.min(1, confidence)),
      reasoning,
      timestamp: new Date(),
    };
    
    proposalVotes.set(voter, vote);
    
    // Check if we have enough votes
    if (proposalVotes.size >= proposal.minVoters) {
      this.checkConsensus(proposalId);
    }
    
    return true;
  }
  
  /** Get proposal status */
  getProposal(id: string): Proposal | undefined {
    return this.proposals.get(id);
  }
  
  /** Get votes for proposal */
  getVotes(proposalId: string): Map<AgentId, Vote> | undefined {
    return this.votes.get(proposalId);
  }
  
  /** Close a proposal manually */
  closeProposal(id: string): ConsensusResult | null {
    const proposal = this.proposals.get(id);
    if (!proposal) return null;
    
    proposal.status = 'closed';
    return this.calculateResult(id);
  }
  
  /** Check if consensus reached and calculate result */
  private checkConsensus(proposalId: string): ConsensusResult | null {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return null;
    
    const proposalVotes = this.votes.get(proposalId);
    if (!proposalVotes || proposalVotes.size < proposal.minVoters) {
      return null;
    }
    
    // Check for supermajority (>66%)
    const result = this.calculateResult(proposalId);
    
    if (result.status === 'accepted' && result.confidence > 0.66) {
      proposal.status = 'accepted';
      this.notifyConsensus(result);
      return result;
    }
    
    return null;
  }
  
  /** Calculate consensus result */
  private calculateResult(proposalId: string): ConsensusResult {
    const proposal = this.proposals.get(proposalId)!;
    const votes = this.votes.get(proposalId) || new Map();
    
    const counts = new Map<string, { count: number; confidence: number }>();
    
    for (const vote of votes.values()) {
      const current = counts.get(vote.choice) || { count: 0, confidence: 0 };
      counts.set(vote.choice, {
        count: current.count + 1,
        confidence: current.confidence + vote.confidence,
      });
    }
    
    // Find winner
    let winningOption: string | undefined;
    let maxVotes = 0;
    let winningConfidence = 0;
    
    for (const [option, data] of counts) {
      if (data.count > maxVotes) {
        maxVotes = data.count;
        winningOption = option;
        winningConfidence = data.confidence / data.count;
      }
    }
    
    const totalVotes = votes.size;
    const requiredVotes = proposal.minVoters;
    
    let status: ConsensusResult['status'];
    
    if (totalVotes < requiredVotes) {
      status = 'insufficient_votes';
    } else if (!winningOption) {
      status = 'tie';
    } else {
      const winPercentage = maxVotes / totalVotes;
      if (winPercentage > 0.5) {
        status = 'accepted';
      } else {
        status = 'rejected';
      }
    }
    
    const result: ConsensusResult = {
      proposalId,
      status,
      winningOption,
      votes,
      totalVotes,
      requiredVotes,
      confidence: winningConfidence,
    };
    
    return result;
  }
  
  /** Schedule automatic deadline check */
  private scheduleDeadlineCheck(proposalId: string, deadline: Date): void {
    const now = Date.now();
    const delay = deadline.getTime() - now;
    
    if (delay > 0) {
      setTimeout(() => {
        this.closeProposal(proposalId);
      }, delay);
    }
  }
  
  /** Register consensus callback */
  onConsensus(callback: (result: ConsensusResult) => void): () => void {
    this.onConsensusCallbacks.push(callback);
    return () => {
      const idx = this.onConsensusCallbacks.indexOf(callback);
      if (idx >= 0) this.onConsensusCallbacks.splice(idx, 1);
    };
  }
  
  /** Notify all consensus callbacks */
  private notifyConsensus(result: ConsensusResult): void {
    for (const callback of this.onConsensusCallbacks) {
      try {
        callback(result);
      } catch (error) {
        console.error('Consensus callback error:', error);
      }
    }
  }
  
  /** Get all open proposals */
  getOpenProposals(): Proposal[] {
    return Array.from(this.proposals.values())
      .filter(p => p.status === 'open');
  }
  
  /** Get agent's voting history */
  getAgentVotes(agentId: AgentId): Vote[] {
    const history: Vote[] = [];
    for (const votes of this.votes.values()) {
      const vote = votes.get(agentId);
      if (vote) history.push(vote);
    }
    return history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
  
  /** Quick consensus for simple decisions */
  quickConsensus(
    agents: AgentId[],
    question: string,
    options: string[]
  ): Promise<ConsensusResult> {
    return new Promise((resolve) => {
      const proposal = this.createProposal(
        'system',
        question,
        options,
        { minVoters: agents.length }
      );
      
      // Unsubscribe after resolution
      const unsub = this.onConsensus((result) => {
        if (result.proposalId === proposal.id) {
          unsub();
          resolve(result);
        }
      });
      
      // Simulate agent votes (in real use, agents vote via message bus)
      setTimeout(() => {
        for (const agent of agents) {
          const randomChoice = options[Math.floor(Math.random() * options.length)];
          this.castVote(proposal.id, agent, randomChoice, 0.7);
        }
      }, 100);
    });
  }
  
  /** Clear all proposals */
  clear(): void {
    this.proposals.clear();
    this.votes.clear();
    this.onConsensusCallbacks = [];
  }
}

/** Create global consensus engine */
export const globalConsensus = new ConsensusEngine();
