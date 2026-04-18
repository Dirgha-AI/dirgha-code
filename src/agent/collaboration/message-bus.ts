/**
 * agent/collaboration/message-bus.ts — Pub/sub messaging between agents
 * Phase 2: Real-time message bus for agent communication
 */

import { randomUUID } from 'node:crypto';
import type { 
  AgentMessage, 
  Channel, 
  MessageHandler, 
  Subscription,
  BusConfig,
  BusStats,
  MessagePriority 
} from './types.js';

export class MessageBus {
  private subscriptions = new Map<string, Subscription>();
  private history = new Map<Channel, AgentMessage[]>();
  private stats = {
    totalMessages: 0,
    messagesByChannel: new Map<Channel, number>(),
    latencySum: 0,
  };
  
  private config: BusConfig;
  
  constructor(config: Partial<BusConfig> = {}) {
    this.config = {
      maxHistoryPerChannel: 1000,
      defaultTtlSeconds: 3600,
      enablePersistence: false,
      enableEncryption: false,
      compressionThreshold: 1024,
      ...config,
    };
  }
  
  /** Subscribe to a channel */
  subscribe(
    channel: Channel,
    handler: MessageHandler,
    filter?: (msg: AgentMessage) => boolean
  ): string {
    const id = randomUUID();
    
    this.subscriptions.set(id, {
      id,
      channel,
      handler,
      filter,
    });
    
    return id;
  }
  
  /** Unsubscribe by ID */
  unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }
  
  /** Publish message to channel */
  publish(message: Omit<AgentMessage, 'id' | 'timestamp'>): string {
    const id = randomUUID();
    const timestamp = new Date();
    
    const fullMessage: AgentMessage = {
      ...message,
      id,
      timestamp,
    };
    
    const startTime = Date.now();
    
    // Store in history
    this.addToHistory(message.to || 'general', fullMessage);
    
    // Notify subscribers
    this.notifySubscribers(fullMessage);
    
    // Update stats
    this.stats.totalMessages++;
    const channel = message.to || 'general';
    this.stats.messagesByChannel.set(
      channel, 
      (this.stats.messagesByChannel.get(channel) || 0) + 1
    );
    this.stats.latencySum += Date.now() - startTime;
    
    return id;
  }
  
  /** Send direct message to agent */
  send(
    from: string,
    to: string,
    content: string,
    type: AgentMessage['type'] = 'chat',
    priority: MessagePriority = 'normal'
  ): string {
    return this.publish({
      type,
      from,
      to,
      content,
      priority,
    });
  }
  
  /** Broadcast to all agents on channel */
  broadcast(
    from: string,
    channel: Channel,
    content: string,
    type: AgentMessage['type'] = 'broadcast',
    priority: MessagePriority = 'normal'
  ): string {
    return this.publish({
      type,
      from,
      content,
      priority,
      metadata: { channel },
    });
  }
  
  /** Reply to a message */
  reply(
    originalMessageId: string,
    from: string,
    content: string,
    type: AgentMessage['type'] = 'response'
  ): string | null {
    // Find original message
    let original: AgentMessage | undefined;
    for (const messages of this.history.values()) {
      original = messages.find(m => m.id === originalMessageId);
      if (original) break;
    }
    
    if (!original) return null;
    
    return this.publish({
      type,
      from,
      to: original.from,
      content,
      replyTo: originalMessageId,
      priority: 'normal',
    });
  }
  
  /** Get message history for channel */
  getHistory(channel: Channel, limit = 100): AgentMessage[] {
    const messages = this.history.get(channel) || [];
    return messages.slice(-limit);
  }
  
  /** Query messages by criteria */
  query(filters: {
    from?: string;
    to?: string;
    type?: AgentMessage['type'];
    since?: Date;
    until?: Date;
  }): AgentMessage[] {
    const results: AgentMessage[] = [];
    
    for (const messages of this.history.values()) {
      for (const msg of messages) {
        if (filters.from && msg.from !== filters.from) continue;
        if (filters.to && msg.to !== filters.to) continue;
        if (filters.type && msg.type !== filters.type) continue;
        if (filters.since && msg.timestamp < filters.since) continue;
        if (filters.until && msg.timestamp > filters.until) continue;
        
        results.push(msg);
      }
    }
    
    return results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
  
  /** Get bus statistics */
  getStats(): BusStats {
    return {
      totalMessages: this.stats.totalMessages,
      messagesByChannel: new Map(this.stats.messagesByChannel),
      activeSubscriptions: this.subscriptions.size,
      queueDepth: 0, // Real-time, no queue
      avgLatencyMs: this.stats.totalMessages > 0 
        ? this.stats.latencySum / this.stats.totalMessages 
        : 0,
    };
  }
  
  /** Clear all history and subscriptions */
  clear(): void {
    this.subscriptions.clear();
    this.history.clear();
    this.stats.totalMessages = 0;
    this.stats.messagesByChannel.clear();
    this.stats.latencySum = 0;
  }
  
  /** Add message to channel history */
  private addToHistory(channel: Channel, message: AgentMessage): void {
    if (!this.history.has(channel)) {
      this.history.set(channel, []);
    }
    
    const messages = this.history.get(channel)!;
    messages.push(message);
    
    // Trim to max size
    if (messages.length > this.config.maxHistoryPerChannel) {
      messages.splice(0, messages.length - this.config.maxHistoryPerChannel);
    }
    
    // Clean expired messages
    this.cleanExpired(channel);
  }
  
  /** Notify all matching subscribers */
  private notifySubscribers(message: AgentMessage): void {
    for (const sub of this.subscriptions.values()) {
      // Check channel match
      if (!this.channelMatches(sub.channel, message)) continue;
      
      // Check filter
      if (sub.filter && !sub.filter(message)) continue;
      
      // Notify
      try {
        sub.handler(message);
      } catch (error) {
        // Log but don't stop other subscribers
        console.error(`Message handler error: ${error}`);
      }
    }
  }
  
  /** Check if subscription channel matches message */
  private channelMatches(subChannel: Channel, message: AgentMessage): boolean {
    // Direct match
    if (subChannel === 'general' && !message.to) return true;
    if (subChannel === message.to) return true;
    if (subChannel === `agent-${message.from}`) return true;
    if (subChannel === `agent-${message.to}`) return true;
    
    // Wildcard patterns
    if (subChannel === '*') return true;
    if (subChannel.endsWith('*')) {
      const prefix = subChannel.slice(0, -1);
      if (String(message.to || 'general').startsWith(prefix)) return true;
    }
    
    return false;
  }
  
  /** Clean expired messages from channel */
  private cleanExpired(channel: Channel): void {
    const messages = this.history.get(channel);
    if (!messages) return;
    
    const now = Date.now();
    const ttlMs = this.config.defaultTtlSeconds * 1000;
    
    const valid = messages.filter(m => {
      if (!m.expiresAt) return true;
      return m.expiresAt.getTime() > now;
    });
    
    if (valid.length < messages.length) {
      this.history.set(channel, valid);
    }
  }
}

/** Create global message bus instance */
export const globalBus = new MessageBus();
