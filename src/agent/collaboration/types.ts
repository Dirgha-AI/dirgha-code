/**
 * agent/collaboration/types.ts — Collaboration types for multi-agent messaging
 * Phase 2: Real-time message bus and shared context
 */

import type { AgentId, TaskId } from '../orchestration/types.js';

/** Message types for agent communication */
export type MessageType = 
  | 'chat'
  | 'task_update'
  | 'proposal'
  | 'vote'
  | 'consensus'
  | 'context_update'
  | 'query'
  | 'response'
  | 'broadcast';

/** Priority levels for messages */
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

/** Message between agents */
export interface AgentMessage {
  id: string;
  type: MessageType;
  from: AgentId;
  to?: AgentId; // undefined = broadcast
  content: string;
  metadata?: Record<string, unknown>;
  priority: MessagePriority;
  replyTo?: string;
  timestamp: Date;
  expiresAt?: Date;
}

/** Message channel/topic */
export type Channel = 
  | 'general'
  | 'task_updates'
  | 'proposals'
  | 'context'
  | `task-${TaskId}`
  | `agent-${AgentId}`
  | string;

/** Message handler callback */
export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

/** Subscription to a channel */
export interface Subscription {
  id: string;
  channel: Channel;
  handler: MessageHandler;
  filter?: (msg: AgentMessage) => boolean;
}

/** Shared context entry */
export interface ContextEntry {
  key: string;
  value: unknown;
  agentId: AgentId;
  timestamp: Date;
  version: number;
  ttl?: number; // Time to live in seconds
}

/** Shared context snapshot */
export interface ContextSnapshot {
  entries: Map<string, ContextEntry>;
  version: number;
  lastUpdated: Date;
  agentCount: number;
}

/** Consensus proposal */
export interface Proposal {
  id: string;
  proposer: AgentId;
  type: 'decision' | 'plan' | 'design' | 'other';
  description: string;
  options: string[];
  deadline: Date;
  minVoters: number;
  status: 'open' | 'closed' | 'accepted' | 'rejected';
}

/** Vote on a proposal */
export interface Vote {
  proposalId: string;
  voter: AgentId;
  choice: string;
  confidence: number; // 0-1
  reasoning?: string;
  timestamp: Date;
}

/** Consensus result */
export interface ConsensusResult {
  proposalId: string;
  status: 'accepted' | 'rejected' | 'tie' | 'insufficient_votes';
  winningOption?: string;
  votes: Map<AgentId, Vote>;
  totalVotes: number;
  requiredVotes: number;
  confidence: number;
}

/** Collaboration bus configuration */
export interface BusConfig {
  maxHistoryPerChannel: number;
  defaultTtlSeconds: number;
  enablePersistence: boolean;
  enableEncryption: boolean;
  compressionThreshold: number; // bytes
}

/** Message statistics */
export interface BusStats {
  totalMessages: number;
  messagesByChannel: Map<Channel, number>;
  activeSubscriptions: number;
  queueDepth: number;
  avgLatencyMs: number;
}
