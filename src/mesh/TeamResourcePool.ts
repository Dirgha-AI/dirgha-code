// @ts-nocheck
/**
 * Team Resource Pool - Aggregated compute with per-dev quotas
 * Multi-tenant allocation with burst scaling
 */

import EventEmitter from 'events';
import { MeshNode, NodeResources, InferenceRequest, InferenceResult } from './MeshNode';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'senior' | 'developer' | 'intern';
  dailyTokenQuota: number;
  monthlyCostQuota: number;  // USD
  canShareCompute: boolean;
  canUseMesh: boolean;
}

export interface TeamQuota {
  memberId: string;
  tokensUsed: number;
  tokensRemaining: number;
  costAccrued: number;
  lastReset: Date;
}

export interface ResourceAllocation {
  nodeId: string;
  cpuShare: number;     // Percentage of node's CPU
  memoryShare: number; // GB allocated
  gpuShare: number;    // GPU count allocated
}

export interface PoolMetrics {
  totalNodes: number;
  onlineNodes: number;
  totalCpuCores: number;
  totalMemoryGb: number;
  totalGpuCount: number;
  activeInferences: number;
  queueDepth: number;
  avgLatencyMs: number;
  tokensPerSecond: number;
}

export class TeamResourcePool extends EventEmitter {
  private teamId: string;
  private workspaceId: string;
  private meshNode: MeshNode;
  private members: Map<string, TeamMember> = new Map();
  private quotas: Map<string, TeamQuota> = new Map();
  private allocations: Map<string, ResourceAllocation[]> = new Map();
  private activeInferences: Map<string, InferenceRequest> = new Map();
  private inferenceQueue: InferenceRequest[] = [];

  constructor(
    teamId: string,
    workspaceId: string,
    meshNode: MeshNode
  ) {
    super();
    this.teamId = teamId;
    this.workspaceId = workspaceId;
    this.meshNode = meshNode;

    // Listen to mesh events
    this.meshNode.on('inference:result', (result: InferenceResult) => {
      this.handleInferenceResult(result);
    });
  }

  /**
   * Add team member with role-based defaults
   */
  addMember(member: TeamMember): void {
    // Apply role-based defaults if not specified
    if (!member.dailyTokenQuota) {
      member.dailyTokenQuota = this.getDefaultQuota(member.role);
    }
    if (!member.monthlyCostQuota) {
      member.monthlyCostQuota = this.getDefaultCostQuota(member.role);
    }

    this.members.set(member.id, member);
    
    // Initialize quota tracking
    this.quotas.set(member.id, {
      memberId: member.id,
      tokensUsed: 0,
      tokensRemaining: member.dailyTokenQuota,
      costAccrued: 0,
      lastReset: new Date(),
    });

    this.emit('member:added', member);
  }

  /**
   * Update member quota (admin only)
   */
  updateQuota(
    adminId: string,
    memberId: string,
    updates: Partial<TeamMember>
  ): boolean {
    const admin = this.members.get(adminId);
    if (!admin || admin.role !== 'admin') {
      throw new Error('Only admins can update quotas');
    }

    const member = this.members.get(memberId);
    if (!member) return false;

    Object.assign(member, updates);
    
    // Reset quota if daily limit changed
    if (updates.dailyTokenQuota) {
      const quota = this.quotas.get(memberId)!;
      quota.tokensRemaining = updates.dailyTokenQuota - quota.tokensUsed;
    }

    this.emit('quota:updated', { memberId, updates });
    return true;
  }

  /**
   * Check if member can make inference request
   */
  canRequestInference(memberId: string, estimatedTokens: number): {
    allowed: boolean;
    reason?: string;
    quotaRemaining: number;
  } {
    const member = this.members.get(memberId);
    if (!member) {
      return { allowed: false, reason: 'Member not found', quotaRemaining: 0 };
    }

    if (!member.canUseMesh) {
      return { allowed: false, reason: 'Mesh access disabled', quotaRemaining: 0 };
    }

    const quota = this.quotas.get(memberId)!;
    
    // Check if quota needs reset (daily reset)
    const now = new Date();
    const lastReset = new Date(quota.lastReset);
    if (now.getDate() !== lastReset.getDate()) {
      quota.tokensUsed = 0;
      quota.tokensRemaining = member.dailyTokenQuota;
      quota.lastReset = now;
    }

    if (quota.tokensRemaining < estimatedTokens) {
      return {
        allowed: false,
        reason: `Insufficient quota. Need ${estimatedTokens}, have ${quota.tokensRemaining}`,
        quotaRemaining: quota.tokensRemaining,
      };
    }

    return {
      allowed: true,
      quotaRemaining: quota.tokensRemaining,
    };
  }

  /**
   * Submit inference request to pool
   */
  async submitInference(
    memberId: string,
    request: Omit<InferenceRequest, 'id' | 'requestedBy'>
  ): Promise<InferenceResult> {
    const member = this.members.get(memberId);
    if (!member) {
      throw new Error('Member not found');
    }

    const estimatedTokens = request.maxTokens || 2048;
    const check = this.canRequestInference(memberId, estimatedTokens);
    
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    const fullRequest: InferenceRequest = {
      id: crypto.randomUUID(),
      requestedBy: memberId,
      priority: request.priority || 'normal',
      ...request,
    };

    this.queueInference(fullRequest);
    this.emit('inference:submitted', fullRequest);

    // Route to best available peer (or local fallback)
    const result = await this.meshNode.routeInference(fullRequest);

    // Update quota after successful inference
    this.updateQuotaUsage(memberId, result.tokensGenerated);
    this.activeInferences.delete(fullRequest.id);
    this.emit('inference:completed', result);

    return result;
  }

  private queueInference(request: InferenceRequest): void {
    // Priority queue: high first, then normal, then low
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const insertIndex = this.inferenceQueue.findIndex(
      r => priorityOrder[r.priority] > priorityOrder[request.priority]
    );
    
    if (insertIndex === -1) {
      this.inferenceQueue.push(request);
    } else {
      this.inferenceQueue.splice(insertIndex, 0, request);
    }
  }

  private async processInference(request: InferenceRequest): Promise<InferenceResult> {
    this.activeInferences.set(request.id, request);

    // Find best node for this request
    const targetNode = this.selectBestNode(request);
    
    if (!targetNode) {
      throw new Error('No available nodes for inference');
    }

    // Publish request to mesh
    const topic = `dirgha-mesh/${this.teamId}/${this.workspaceId}`;
    // @ts-ignore - meshNode internal
    await this.meshNode.node.pubsub.publish(
      topic,
      new TextEncoder().encode(JSON.stringify({
        type: 'inference:request',
        targetNode,
        ...request,
      }))
    );

    // Wait for result (in practice, the mesh handles this)
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.activeInferences.delete(request.id);
        reject(new Error('Inference processing timeout'));
      }, 60000);

      this.once(`result:${request.id}`, (result: InferenceResult) => {
        clearTimeout(timeout);
        this.activeInferences.delete(request.id);
        
        // Update quota
        this.updateQuotaUsage(request.requestedBy, result.tokensGenerated);
        
        resolve(result);
      });
    });
  }

  private selectBestNode(request: InferenceRequest): string | null {
    const peers = this.meshNode.getPeers().filter(p => p.isOnline);
    
    if (peers.length === 0) return null;

    // Score nodes by: latency, resources, model availability
    const scored = peers.map(peer => {
      let score = 100;
      
      // Prefer lower latency
      score -= peer.latencyMs / 10;
      
      // Prefer nodes with model cached
      if (!peer.resources.models.includes(request.model)) {
        score -= 50;
      }
      
      // Prefer nodes with more available resources
      score += peer.resources.availableMemoryGb * 2;
      score += peer.resources.cpuCores;

      return { peer, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.peer.id || null;
  }

  private handleInferenceResult(result: InferenceResult): void {
    this.emit(`result:${result.requestId}`, result);
    this.emit('inference:completed', result);
  }

  private updateQuotaUsage(memberId: string, tokensUsed: number): void {
    const quota = this.quotas.get(memberId);
    if (!quota) return;

    quota.tokensUsed += tokensUsed;
    quota.tokensRemaining -= tokensUsed;
    
    // Simple cost calculation: $0.0001 per 1000 tokens
    const cost = (tokensUsed / 1000) * 0.0001;
    quota.costAccrued += cost;

    this.emit('quota:consumed', {
      memberId,
      tokensUsed,
      costAccrued: quota.costAccrued,
      remaining: quota.tokensRemaining,
    });
  }

  /**
   * Get pool metrics for dashboard
   */
  getMetrics(): PoolMetrics {
    const peers = this.meshNode.getPeers();
    const resources = this.meshNode.getAggregatedResources();

    return {
      totalNodes: peers.length + 1, // +1 for local node
      onlineNodes: peers.filter(p => p.isOnline).length + 1,
      totalCpuCores: resources.cpuCores,
      totalMemoryGb: resources.totalMemoryGb,
      totalGpuCount: resources.gpuCount,
      activeInferences: this.activeInferences.size,
      queueDepth: this.inferenceQueue.length,
      avgLatencyMs: this.calculateAverageLatency(),
      tokensPerSecond: this.calculateThroughput(),
    };
  }

  private calculateAverageLatency(): number {
    // TODO: Track actual inference latencies
    return 150; // Placeholder
  }

  private calculateThroughput(): number {
    // TODO: Track actual throughput
    return 45; // tokens/sec placeholder
  }

  /**
   * Get quota status for all members
   */
  getQuotaStatus(): TeamQuota[] {
    return Array.from(this.quotas.values());
  }

  /**
   * Reset all quotas (daily cron job)
   */
  resetDailyQuotas(): void {
    for (const [memberId, quota] of this.quotas) {
      const member = this.members.get(memberId);
      if (!member) continue;

      quota.tokensUsed = 0;
      quota.tokensRemaining = member.dailyTokenQuota;
      quota.lastReset = new Date();
    }

    this.emit('quotas:reset');
  }

  private getDefaultQuota(role: string): number {
    const quotas: Record<string, number> = {
      admin: 500000,      // 500K tokens/day
      senior: 300000,     // 300K tokens/day
      developer: 100000,  // 100K tokens/day
      intern: 50000,      // 50K tokens/day
    };
    return quotas[role] || 100000;
  }

  private getDefaultCostQuota(role: string): number {
    const quotas: Record<string, number> = {
      admin: 100,      // $100/month
      senior: 50,      // $50/month
      developer: 20,   // $20/month
      intern: 10,      // $10/month
    };
    return quotas[role] || 20;
  }
}

export default TeamResourcePool;
