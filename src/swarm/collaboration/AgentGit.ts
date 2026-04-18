// @ts-nocheck
/**
 * swarm/collaboration/AgentGit.ts — L2: Agent-aware version control
 */
import type { AgentCommit, Operation, VerificationResult } from '../types.js';

export interface MergeResult {
  type: 'fast-forward' | 'auto-resolved' | 'needs-review' | 'conflict';
  commit: AgentCommit;
  conflicts?: Conflict[];
  resolution?: Resolution;
}

export interface Conflict {
  file: string;
  ours: string;
  theirs: string;
  base?: string;
}

export interface Resolution {
  strategy: 'ours' | 'theirs' | 'merged' | 'manual';
  mergedContent?: string;
}

export class AgentGit {
  private commits = new Map<string, AgentCommit>();
  private trunkHead: string | null = null;
  private streams = new Map<string, string[]>(); // agentId -> commitIds
  
  async commit(agentCommit: AgentCommit): Promise<MergeResult> {
    // Store the commit
    this.commits.set(agentCommit.id, agentCommit);
    
    // Add to agent's stream
    const agentCommits = this.streams.get(agentCommit.agentId as string) || [];
    agentCommits.push(agentCommit.id);
    this.streams.set(agentCommit.agentId as string, agentCommits);
    
    // If no trunk yet, this becomes trunk
    if (!this.trunkHead) {
      this.trunkHead = agentCommit.id;
      return { type: 'fast-forward', commit: agentCommit };
    }
    
    // Check for conflicts with trunk
    const trunkCommit = this.commits.get(this.trunkHead)!;
    const conflicts = this.detectConflicts(agentCommit, trunkCommit);
    
    if (conflicts.length === 0) {
      // Fast-forward merge
      this.trunkHead = agentCommit.id;
      return { type: 'fast-forward', commit: agentCommit };
    }
    
    // Attempt automatic resolution
    const resolution = await this.autoResolve(conflicts);
    
    if (resolution.strategy === 'merged') {
      // Update commit with resolution
      agentCommit.metadata.verificationStatus.status = 'passed';
      this.trunkHead = agentCommit.id;
      return { type: 'auto-resolved', commit: agentCommit, resolution };
    }
    
    // Needs manual review
    return { type: 'needs-review', commit: agentCommit, conflicts };
  }
  
  private detectConflicts(newCommit: AgentCommit, trunkCommit: AgentCommit): Conflict[] {
    const conflicts: Conflict[] = [];
    
    const newFiles = new Set(newCommit.metadata.filesChanged);
    const trunkFiles = new Set(trunkCommit.metadata.filesChanged);
    
    // Find overlapping files
    for (const file of newFiles) {
      if (trunkFiles.has(file)) {
        // Check if operations overlap
        const newOps = newCommit.operations.filter(o => o.path === file);
        const trunkOps = trunkCommit.operations.filter(o => o.path === file);
        
        for (const newOp of newOps) {
          for (const trunkOp of trunkOps) {
            if (this.rangesOverlap(newOp.range, trunkOp.range)) {
              conflicts.push({
                file,
                ours: `Operation ${newOp.type} at ${newOp.range.start}`,
                theirs: `Operation ${trunkOp.type} at ${trunkOp.range.start}`,
              });
            }
          }
        }
      }
    }
    
    return conflicts;
  }
  
  private rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
    return a.start < b.end && b.start < a.end;
  }
  
  private async autoResolve(conflicts: Conflict[]): Promise<Resolution> {
    // Simple resolution strategy: if all conflicts are in different files, merge
    const files = new Set(conflicts.map(c => c.file));
    
    if (files.size === conflicts.length) {
      // Each conflict is in a different file - can merge
      return { strategy: 'merged' };
    }
    
    // Same file modified - needs review
    return { strategy: 'manual' };
  }
  
  getTrunkHead(): string | null {
    return this.trunkHead;
  }
  
  getCommit(id: string): AgentCommit | undefined {
    return this.commits.get(id);
  }
  
  getAgentStream(agentId: string): AgentCommit[] {
    const commitIds = this.streams.get(agentId) || [];
    return commitIds.map(id => this.commits.get(id)!).filter(Boolean);
  }
  
  getHistory(since?: string): AgentCommit[] {
    const commits = Array.from(this.commits.values());
    
    if (since) {
      const sinceTime = new Date(since).getTime();
      return commits.filter(c => c.timestamp > sinceTime);
    }
    
    return commits.sort((a, b) => b.timestamp - a.timestamp);
  }
  
  getStats(): {
    totalCommits: number;
    uniqueAgents: number;
    autoMerged: number;
    needsReview: number;
  } {
    const commits = Array.from(this.commits.values());
    
    return {
      totalCommits: commits.length,
      uniqueAgents: new Set(commits.map(c => c.agentId)).size,
      autoMerged: commits.filter(c => 
        c.metadata.verificationStatus.status === 'passed'
      ).length,
      needsReview: commits.filter(c =>
        c.metadata.verificationStatus.status === 'failed'
      ).length,
    };
  }
}
