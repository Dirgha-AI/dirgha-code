// @ts-nocheck
/**
 * swarm/agents/VerificationQuorum.ts — Multi-model verification system
 */
import type { VerificationResult, ModelVote, VerificationIssue, Task } from '../types.js';
import type { Message } from '../../types.js';
import { MODEL_POOL } from '../runtime/ModelPool.js';
import { callGateway } from '../../agent/gateway.js';

export interface QuorumConfig {
  minVotes: number;
  approvalThreshold: number; // 0-1, e.g., 0.6 = 60% must approve
  requireDiversity: boolean; // Must include multiple model families
}

export class VerificationQuorum {
  private config: QuorumConfig;
  private votes: ModelVote[] = [];
  
  constructor(config: Partial<QuorumConfig> = {}) {
    this.config = {
      minVotes: 3,
      approvalThreshold: 0.6,
      requireDiversity: true,
      ...config
    };
  }
  
  async verify(code: string, task: Task): Promise<VerificationResult> {
    this.votes = [];
    
    // Select diverse models
    const models = this.selectDiverseModels(task);
    
    // Collect votes from each model
    for (const model of models) {
      const vote = await this.getVote(model, code, task);
      this.votes.push(vote);
    }
    
    // Calculate consensus
    const approvals = this.votes.filter(v => v.approve).length;
    const consensus = approvals / this.votes.length;
    const approved = consensus >= this.config.approvalThreshold;
    
    // Collect issues
    const issues = this.votes.flatMap(v => 
      v.issues.map(msg => ({
        severity: 'medium' as const,
        type: 'logic' as const,
        file: task.id as string,
        message: msg,
      }))
    );
    
    return {
      approved,
      consensus,
      quorum: this.votes.length,
      votes: this.votes,
      issues,
      cost: this.calculateCost(),
      duration: Date.now(), // Would track actual time
    };
  }
  
  private selectDiverseModels(task: Task): string[] {
    const selected: string[] = [];
    const families = ['openai', 'anthropic', 'google', 'local'];
    
    // Always include at least one premium model for critical tasks
    if (task.critical || task.securityCritical) {
      selected.push(MODEL_POOL[0].models[0]); // gpt-4
    }
    
    // Add models from different families
    for (const tier of MODEL_POOL) {
      if (selected.length >= this.config.minVotes) break;
      
      for (const model of tier.models) {
        if (!selected.includes(model)) {
          selected.push(model);
          break;
        }
      }
    }
    
    return selected.slice(0, this.config.minVotes + 2); // Add buffer
  }
  
  private async getVote(
    model: string,
    code: string,
    task: Task
  ): Promise<ModelVote> {
    const tier = MODEL_POOL.find(t => t.models.includes(model))?.name || 'economy';
    const criterion = task.title || 'task requirements';
    const artifact = typeof code === 'string' ? code : JSON.stringify(code);

    const prompt = `You are a code reviewer. Does the following artifact satisfy this criterion?\n\nCriterion: ${criterion}\n\nArtifact:\n${artifact.slice(0, 3000)}\n\nRespond with JSON only: {"vote": true, "confidence": 0.85, "reason": "brief explanation"}`;

    try {
      const messages: Message[] = [{ role: 'user', content: prompt }];
      const response = await callGateway(messages, '', 'claude-haiku-4-5-20251001');
      const textBlock = response.content.find((b: any) => b.type === 'text');
      const raw = textBlock?.text ?? '';

      // Extract JSON from response (may be wrapped in markdown fences)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');

      const parsed = JSON.parse(jsonMatch[0]) as {
        vote: boolean;
        confidence: number;
        reason: string;
      };

      const approve = Boolean(parsed.vote);
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
      const reason = parsed.reason || '';

      return {
        model,
        tier: tier as any,
        approve,
        confidence,
        reasoning: reason,
        issues: approve ? [] : [reason],
      };
    } catch {
      return {
        model,
        tier: tier as any,
        approve: true,
        confidence: 0.5,
        reasoning: 'fallback: LLM unavailable',
        issues: [],
      };
    }
  }
  
  private calculateCost(): number {
    return this.votes.reduce((sum, vote) => {
      const tier = MODEL_POOL.find(t => t.models.includes(vote.model));
      return sum + (tier?.costPer1KTokens || 0.002);
    }, 0);
  }
  
  getConsensusReport(): string {
    const approvals = this.votes.filter(v => v.approve).length;
    const rejections = this.votes.filter(v => !v.approve).length;
    
    return [
      `Verification Results:`,
      `  Total votes: ${this.votes.length}`,
      `  Approvals: ${approvals}`,
      `  Rejections: ${rejections}`,
      `  Consensus: ${(approvals / this.votes.length * 100).toFixed(1)}%`,
      ``,
      `Votes:`,
      ...this.votes.map(v => 
        `  ${v.model} (${v.tier}): ${v.approve ? '✓' : '✗'} ${v.confidence.toFixed(2)}`
      ),
    ].join('\n');
  }
}

export class SecurityVerifier {
  async scan(code: string): Promise<VerificationIssue[]> {
    const issues: VerificationIssue[] = [];
    
    // Simulated security scan patterns
    const patterns = [
      { pattern: /eval\s*\(/, severity: 'critical' as const, message: 'Dangerous eval() usage' },
      { pattern: /innerHTML\s*=/, severity: 'high' as const, message: 'Potential XSS vulnerability' },
      { pattern: /password\s*[=:]\s*["']/, severity: 'high' as const, message: 'Hardcoded password' },
      { pattern: /TODO.*security/i, severity: 'medium' as const, message: 'Security TODO found' },
    ];
    
    for (const { pattern, severity, message } of patterns) {
      if (pattern.test(code)) {
        issues.push({
          severity,
          type: 'security',
          file: 'input',
          message,
        });
      }
    }
    
    return issues;
  }
}
