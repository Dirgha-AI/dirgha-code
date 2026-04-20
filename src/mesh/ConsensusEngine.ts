// @ts-nocheck
/**
 * Consensus Engine - PBFT-inspired verification for distributed inference
 * Verifies results across multiple mesh nodes for Byzantine fault tolerance
 */

import EventEmitter from 'events';
import { InferenceRequest, InferenceResult } from './MeshNode';

export interface VerificationRound {
  resultId: string;
  requestId: string;
  originalResult: string;
  verifications: Map<string, Verification>; // nodeId -> verification
  status: 'pending' | 'verified' | 'failed';
  createdAt: Date;
  threshold: number; // Minimum matching verifications needed
}

export interface Verification {
  nodeId: string;
  resultHash: string;
  matches: boolean;
  timestamp: Date;
  latencyMs: number;
}

export interface ConsensusConfig {
  verificationThreshold: number;  // Default: 2 (need 2 matching)
  maxRounds: number;              // Default: 3 retries
  timeoutMs: number;              // Default: 30000
  similarityThreshold: number;  // Default: 0.95 (95% similar)
}

export class ConsensusEngine extends EventEmitter {
  private config: ConsensusConfig;
  private activeRounds: Map<string, VerificationRound> = new Map();
  private completedRounds: Map<string, VerificationRound> = new Map();

  constructor(config: Partial<ConsensusConfig> = {}) {
    super();
    this.config = {
      verificationThreshold: 2,
      maxRounds: 3,
      timeoutMs: 30000,
      similarityThreshold: 0.95,
      ...config,
    };
  }

  /**
   * Start verification round for an inference result
   */
  async startVerification(
    result: InferenceResult,
    availableVerifiers: string[]
  ): Promise<VerificationRound> {
    const round: VerificationRound = {
      resultId: result.id,
      requestId: result.requestId,
      originalResult: result.content,
      verifications: new Map(),
      status: 'pending',
      createdAt: new Date(),
      threshold: Math.min(this.config.verificationThreshold, availableVerifiers.length),
    };

    this.activeRounds.set(result.id, round);
    this.emit('verification:started', round);

    // Request verifications from available nodes
    for (const verifierId of availableVerifiers.slice(0, this.config.maxRounds + 1)) {
      this.requestVerification(result, verifierId);
    }

    // Set timeout
    setTimeout(() => {
      this.checkVerificationTimeout(result.id);
    }, this.config.timeoutMs);

    return round;
  }

  /**
   * Submit verification from a mesh node
   */
  submitVerification(
    roundId: string,
    nodeId: string,
    resultContent: string,
    latencyMs: number
  ): void {
    const round = this.activeRounds.get(roundId);
    if (!round || round.status !== 'pending') return;

    const matches = this.compareResults(round.originalResult, resultContent);
    
    const verification: Verification = {
      nodeId,
      resultHash: this.hashResult(resultContent),
      matches,
      timestamp: new Date(),
      latencyMs,
    };

    round.verifications.set(nodeId, verification);
    this.emit('verification:received', { roundId, nodeId, matches });

    // Check if we have enough verifications
    this.checkConsensus(round);
  }

  /**
   * Check if we have reached consensus
   */
  private checkConsensus(round: VerificationRound): void {
    const matchingCount = Array.from(round.verifications.values())
      .filter(v => v.matches).length;

    if (matchingCount >= round.threshold) {
      round.status = 'verified';
      this.activeRounds.delete(round.resultId);
      this.completedRounds.set(round.resultId, round);
      
      this.emit('consensus:reached', {
        resultId: round.resultId,
        requestId: round.requestId,
        verifications: matchingCount,
        total: round.verifications.size,
      });
    }
  }

  /**
   * Handle verification timeout
   */
  private checkVerificationTimeout(resultId: string): void {
    const round = this.activeRounds.get(resultId);
    if (!round) return;

    if (round.status === 'pending') {
      round.status = 'failed';
      this.activeRounds.delete(resultId);
      this.completedRounds.set(resultId, round);

      this.emit('consensus:failed', {
        resultId,
        requestId: round.requestId,
        verificationsReceived: round.verifications.size,
        threshold: round.threshold,
      });
    }
  }

  /**
   * Compare two results for semantic similarity
   */
  private compareResults(a: string, b: string): boolean {
    // Normalize both results
    const normalizedA = this.normalize(a);
    const normalizedB = this.normalize(b);

    // Exact match (fast path)
    if (normalizedA === normalizedB) return true;

    // Jaccard similarity on word sets
    const similarity = this.jaccardSimilarity(normalizedA, normalizedB);
    return similarity >= this.config.similarityThreshold;
  }

  /**
   * Normalize text for comparison
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  /**
   * Calculate Jaccard similarity between two strings
   */
  private jaccardSimilarity(a: string, b: string): number {
    const setA = new Set(a.split(' '));
    const setB = new Set(b.split(' '));
    
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    
    return intersection.size / union.size;
  }

  /**
   * Hash a result for quick comparison
   */
  private hashResult(content: string): string {
    // Simple hash - in production use crypto.subtle
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Request verification from a specific node
   */
  private requestVerification(
    result: InferenceResult,
    verifierId: string
  ): void {
    // In real implementation, this would send via mesh
    this.emit('verification:requested', {
      resultId: result.id,
      verifierId,
      originalRequest: result.requestId,
    });
  }

  /**
   * Get verification status for a result
   */
  getVerificationStatus(resultId: string): VerificationRound | undefined {
    return this.activeRounds.get(resultId) || this.completedRounds.get(resultId);
  }

  /**
   * Get consensus statistics
   */
  getStats(): {
    activeRounds: number;
    completedRounds: number;
    verifiedCount: number;
    failedCount: number;
    averageVerifications: number;
  } {
    const completed = Array.from(this.completedRounds.values());
    const verified = completed.filter(r => r.status === 'verified');
    const failed = completed.filter(r => r.status === 'failed');

    const avgVerifications = completed.length > 0
      ? completed.reduce((sum, r) => sum + r.verifications.size, 0) / completed.length
      : 0;

    return {
      activeRounds: this.activeRounds.size,
      completedRounds: completed.length,
      verifiedCount: verified.length,
      failedCount: failed.length,
      averageVerifications: avgVerifications,
    };
  }
}

export default ConsensusEngine;
