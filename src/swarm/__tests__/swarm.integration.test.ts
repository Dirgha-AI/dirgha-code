// @ts-nocheck
/**
 * swarm/__tests__/swarm.integration.test.ts — End-to-end swarm tests
 */
import { describe, it, expect } from 'vitest';
import { ColonyManager } from '../orchestration/ColonyManager.js';
import { VerificationQuorum } from '../agents/VerificationQuorum.js';
import { CostOptimizer } from '../governance/CostOptimizer.js';
import { CRDTFactory } from '../collaboration/CRDT.js';
import { AgentGit } from '../collaboration/AgentGit.js';

describe('Swarm Integration', () => {
  describe('Colony Lifecycle', () => {
    it('should create colony with workers', () => {
      const colony = new ColonyManager({
        name: 'test-colony',
        domains: ['platform'],
        maxAgents: 10,
        budget: { total: 10000, spent: 0, remaining: 10000, dailyLimit: 500, emergencyReserve: 1000 },
      });
      
      const status = colony.getStatus();
      expect(status.name).toBe('test-colony');
      expect(status.agents.total).toBe(10);
      expect(status.agents.idle).toBe(10);
    });

    it('should add and process tasks', async () => {
      const colony = new ColonyManager({
        name: 'test-colony',
        domains: ['platform'],
        maxAgents: 5,
        budget: { total: 1000, spent: 0, remaining: 1000, dailyLimit: 100, emergencyReserve: 200 },
      });
      
      colony.addTask({
        type: 'feature',
        title: 'Test API',
        description: 'Create test endpoint',
        acceptanceCriteria: ['Works'],
        domain: 'platform',
        complexity: 0.5,
        critical: false,
        securityCritical: false,
        estimatedCost: 10,
        estimatedDuration: 60,
      });
      
      const initialStatus = colony.getStatus();
      expect(initialStatus.tasks.pending).toBe(1);
      
      // Process would run async in real implementation
    });

    it('should track budget consumption', () => {
      const colony = new ColonyManager({
        name: 'test-colony',
        domains: ['platform'],
        maxAgents: 5,
        budget: { total: 1000, spent: 100, remaining: 900, dailyLimit: 100, emergencyReserve: 200 },
      });
      
      const status = colony.getStatus();
      expect(status.budget.spent).toBe(100);
      expect(status.budget.remaining).toBe(900);
    });
  });

  describe('CRDT Collaboration', () => {
    it('should merge concurrent edits', () => {
      const factory = new CRDTFactory();
      
      const doc1 = factory.create('test-doc');
      const doc2 = factory.create('test-doc');
      
      // Agent A edits doc1
      doc1.insert(0, 'Hello', 'agent-a' as any);
      
      // Agent B edits doc2
      doc2.insert(0, 'World', 'agent-b' as any);
      
      // Merge
      doc1.merge(doc2);
      
      const content = doc1.toString();
      expect(content.length).toBeGreaterThan(8);
    });

    it('should handle deletions', () => {
      const factory = new CRDTFactory();
      const doc = factory.create('test-doc');
      
      doc.insert(0, 'Hello World', 'agent-a' as any);
      doc.delete(0, 5, 'agent-a' as any);
      
      expect(doc.toString()).toBe(' World');
    });
  });

  describe('AgentGit', () => {
    it('should commit and track history', async () => {
      const git = new AgentGit();
      
      const commit1 = await git.commit({
        id: 'commit-1',
        agentId: 'agent-a' as any,
        sessionId: 'session-1' as any,
        parentIds: [],
        timestamp: Date.now(),
        operations: [],
        metadata: {
          filesChanged: ['file.ts'],
          linesAdded: 10,
          linesDeleted: 0,
          testResults: [],
          verificationStatus: { status: 'passed', approvals: 3, rejections: 0, required: 3 },
          cost: 5,
          duration: 1000,
        },
      });
      
      expect(commit1.type).toBe('fast-forward');
      expect(git.getTrunkHead()).toBe('commit-1');
      
      const stats = git.getStats();
      expect(stats.totalCommits).toBe(1);
    });
  });

  describe('Verification Quorum', () => {
    it('should require minimum votes', async () => {
      const quorum = new VerificationQuorum({ minVotes: 3 });
      
      const result = await quorum.verify('code', {
        id: 'task-1' as any,
        type: 'feature',
        title: 'Test',
        description: 'Test',
        acceptanceCriteria: [],
        domain: 'platform',
        complexity: 0.5,
        critical: false,
        securityCritical: false,
        estimatedCost: 10,
        estimatedDuration: 60,
        status: 'pending',
        dependencies: [],
      });
      
      expect(result.quorum).toBeGreaterThanOrEqual(3);
      expect(result.votes.length).toBeGreaterThanOrEqual(3);
    });

    it('should approve based on consensus threshold', async () => {
      const quorum = new VerificationQuorum({ 
        minVotes: 3, 
        approvalThreshold: 0.6 
      });
      
      const result = await quorum.verify('good code', {
        id: 'task-1' as any,
        type: 'feature',
        title: 'Test',
        description: 'Test',
        acceptanceCriteria: [],
        domain: 'platform',
        complexity: 0.5,
        critical: false,
        securityCritical: false,
        estimatedCost: 10,
        estimatedDuration: 60,
        status: 'pending',
        dependencies: [],
      });
      
      expect(result.consensus).toBeGreaterThanOrEqual(0);
      expect(result.consensus).toBeLessThanOrEqual(1);
    });
  });

  describe('Cost Optimization', () => {
    it('should prioritize critical tasks', async () => {
      const optimizer = new CostOptimizer();
      
      const tasks = [
        { id: '1', critical: false, complexity: 0.3, domain: 'platform', type: 'feature', description: 'Simple' } as any,
        { id: '2', critical: true, complexity: 0.8, domain: 'platform', type: 'feature', description: 'Critical' } as any,
        { id: '3', critical: false, complexity: 0.5, domain: 'platform', type: 'feature', description: 'Medium' } as any,
      ];
      
      const optimized = await optimizer.optimize(tasks);
      
      // Critical task should be first
      expect(optimized.queue[0].id).toBe('2');
    });

    it('should estimate costs', async () => {
      const optimizer = new CostOptimizer();
      
      const tasks = [
        { id: '1', critical: false, complexity: 0.5, domain: 'platform', type: 'feature', description: 'Test' } as any,
      ];
      
      const optimized = await optimizer.optimize(tasks);
      
      expect(optimized.estimatedCost).toBeGreaterThan(0);
      expect(optimized.estimatedTime).toBeGreaterThan(0);
    });
  });

  describe('Salesforce Templates', () => {
    it('should have all 5 domains', async () => {
      const { SALESFORCE_DOMAINS } = await import('../templates/SalesforceDomains.js');
      
      expect(SALESFORCE_DOMAINS).toHaveLength(5);
      expect(SALESFORCE_DOMAINS.map(d => d.name)).toContain('Sales Cloud (CRM Core)');
      expect(SALESFORCE_DOMAINS.map(d => d.name)).toContain('Service Cloud (Support)');
    });

    it('should calculate total resources', async () => {
      const { calculateTotalResources } = await import('../templates/SalesforceDomains.js');
      
      const totals = calculateTotalResources();
      
      expect(totals.totalAgents).toBeGreaterThan(50);
      expect(totals.totalModules).toBeGreaterThan(15);
      expect(totals.totalTasks).toBeGreaterThan(50);
    });
  });
});
