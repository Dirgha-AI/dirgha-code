// @ts-nocheck
/**
 * swarm/collaboration/CRDT.ts — L2: Conflict-free Replicated Data Types
 */
import type { CRDTDocument, CRDTNode, VectorClock, AgentID } from '../types.js';

export class CRDTDocumentImpl implements CRDTDocument {
  id: string;
  content: CRDTNode[] = [];
  version: VectorClock = {};
  agents: Set<AgentID> = new Set();
  
  constructor(id: string) {
    this.id = id;
  }
  
  insert(position: number, text: string, agentId: AgentID): void {
    this.agents.add(agentId);
    
    // Increment vector clock
    this.version[agentId as string] = (this.version[agentId as string] || 0) + 1;
    
    // Create nodes for each character
    const timestamp = Date.now();
    for (let i = 0; i < text.length; i++) {
      const node: CRDTNode = {
        id: `${agentId}-${timestamp}-${i}`,
        char: text[i],
        agentId,
        timestamp: timestamp + i,
        deleted: false,
      };
      
      // Insert at position (accounting for deleted nodes)
      let actualPos = 0;
      let visibleIndex = 0;
      for (const node of this.content) {
        if (!node.deleted) {
          if (visibleIndex === position) break;
          visibleIndex++;
        }
        actualPos++;
      }
      
      this.content.splice(actualPos + i, 0, node);
    }
  }
  
  delete(rangeStart: number, rangeEnd: number, agentId: AgentID): void {
    this.agents.add(agentId);
    this.version[agentId as string] = (this.version[agentId as string] || 0) + 1;
    
    let visibleIndex = 0;
    for (const node of this.content) {
      if (!node.deleted) {
        if (visibleIndex >= rangeStart && visibleIndex < rangeEnd) {
          node.deleted = true;
        }
        visibleIndex++;
      }
    }
  }
  
  merge(remoteState: CRDTDocument): void {
    // Merge vector clocks
    for (const [agent, count] of Object.entries(remoteState.version)) {
      this.version[agent] = Math.max(this.version[agent] || 0, count);
    }
    
    // Merge agents
    for (const agent of remoteState.agents) {
      this.agents.add(agent);
    }
    
    // Merge content (union of both)
    const localIds = new Set(this.content.map(n => n.id));
    
    for (const remoteNode of remoteState.content) {
      if (!localIds.has(remoteNode.id)) {
        // New node from remote
        this.content.push(remoteNode);
      } else {
        // Node exists, check for deletion
        const localNode = this.content.find(n => n.id === remoteNode.id)!;
        localNode.deleted = localNode.deleted || remoteNode.deleted;
      }
    }
    
    // Sort by timestamp
    this.content.sort((a, b) => a.timestamp - b.timestamp);
  }
  
  toString(): string {
    return this.content
      .filter(n => !n.deleted)
      .map(n => n.char)
      .join('');
  }
  
  getLength(): number {
    return this.content.filter(n => !n.deleted).length;
  }
  
  getStats(): { total: number; visible: number; deleted: number } {
    const total = this.content.length;
    const deleted = this.content.filter(n => n.deleted).length;
    return {
      total,
      visible: total - deleted,
      deleted,
    };
  }
}

export class CRDTFactory {
  private documents = new Map<string, CRDTDocumentImpl>();
  
  create(id: string): CRDTDocumentImpl {
    const doc = new CRDTDocumentImpl(id);
    this.documents.set(id, doc);
    return doc;
  }
  
  get(id: string): CRDTDocumentImpl | undefined {
    return this.documents.get(id);
  }
  
  list(): string[] {
    return Array.from(this.documents.keys());
  }
  
  sync(fromId: string, toId: string): boolean {
    const from = this.documents.get(fromId);
    const to = this.documents.get(toId);
    
    if (!from || !to) return false;
    
    to.merge(from);
    return true;
  }
}
