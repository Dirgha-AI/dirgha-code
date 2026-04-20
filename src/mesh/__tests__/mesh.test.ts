// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MeshNode, type MeshNodeConfig } from '../MeshNode';
import { TeamResourcePool, type TeamMember } from '../TeamResourcePool';
import { ConsensusEngine } from '../ConsensusEngine';
import { LightningBilling } from '../LightningBilling';

describe('Mesh System', () => {
  describe('MeshNode', () => {
    let node: MeshNode;
    const config: MeshNodeConfig = {
      teamId: 'test-team',
      workspaceId: 'test-workspace',
      nodeId: 'test-node',
      maxCpuPercent: 50,
      maxMemoryGb: 4,
      ollamaPort: 11434,
      listenPort: 0,
    };

    beforeEach(() => {
      node = new MeshNode(config);
    });

    it('should create node with correct config', () => {
      expect(node).toBeDefined();
    });

    it('should detect local resources', () => {
      const resources = node.getAggregatedResources();
      expect(resources.cpuCores).toBeGreaterThan(0);
      expect(resources.totalMemoryGb).toBeGreaterThan(0);
    });
  });

  describe('TeamResourcePool', () => {
    let pool: TeamResourcePool;
    let mockNode: any;

    beforeEach(() => {
      mockNode = {
        getPeers: () => [],
        getAggregatedResources: () => ({
          cpuCores: 8,
          totalMemoryGb: 16,
          availableMemoryGb: 8,
          gpuCount: 0,
          models: ['gemma-4', 'qwen-3'],
        }),
        on: vi.fn(),
      };
      pool = new TeamResourcePool('test-team', 'test-workspace', mockNode);
    });

    it('should add member with default quota', () => {
      const member: TeamMember = {
        id: 'dev-1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'developer',
        dailyTokenQuota: 0,
        monthlyCostQuota: 0,
        canShareCompute: true,
        canUseMesh: true,
      };

      pool.addMember(member);
      const quotas = pool.getQuotaStatus();
      expect(quotas).toHaveLength(1);
      expect(quotas[0].tokensRemaining).toBe(100000); // Default for developer
    });

    it('should check quota before inference', () => {
      pool.addMember({
        id: 'dev-1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'developer',
        dailyTokenQuota: 1000,
        monthlyCostQuota: 10,
        canShareCompute: true,
        canUseMesh: true,
      });

      const check = pool.canRequestInference('dev-1', 500);
      expect(check.allowed).toBe(true);
      expect(check.quotaRemaining).toBe(1000);

      const check2 = pool.canRequestInference('dev-1', 2000);
      expect(check2.allowed).toBe(false);
    });
  });

  describe('ConsensusEngine', () => {
    let engine: ConsensusEngine;

    beforeEach(() => {
      engine = new ConsensusEngine({
        verificationThreshold: 2,
        timeoutMs: 5000,
      });
    });

    it('should start verification round', async () => {
      const result = {
        id: 'result-1',
        requestId: 'req-1',
        content: 'Hello world',
        tokensGenerated: 10,
        latencyMs: 100,
        verified: false,
      };

      const round = await engine.startVerification(result, ['node-a', 'node-b', 'node-c']);
      expect(round.status).toBe('pending');
      expect(round.threshold).toBe(2);
    });

    it('should reach consensus with matching verifications', () => {
      const result = {
        id: 'result-1',
        requestId: 'req-1',
        content: 'Hello world',
        tokensGenerated: 10,
        latencyMs: 100,
        verified: false,
      };

      engine.startVerification(result, ['node-a', 'node-b']);

      // Submit matching verifications
      engine.submitVerification('result-1', 'node-a', 'Hello world', 150);
      engine.submitVerification('result-1', 'node-b', 'Hello world', 160);

      const round = engine.getVerificationStatus('result-1');
      expect(round?.status).toBe('verified');
    });

    it('should fail consensus with mismatching results', () => {
      const result = {
        id: 'result-1',
        requestId: 'req-1',
        content: 'Hello world',
        tokensGenerated: 10,
        latencyMs: 100,
        verified: false,
      };

      engine.startVerification(result, ['node-a', 'node-b']);

      // Submit different results
      engine.submitVerification('result-1', 'node-a', 'Hello world', 150);
      engine.submitVerification('result-1', 'node-b', 'Goodbye world', 160);

      const round = engine.getVerificationStatus('result-1');
      expect(round?.status).toBe('pending'); // Not enough matching
    });
  });

  describe('LightningBilling', () => {
    let billing: LightningBilling;

    beforeEach(() => {
      billing = new LightningBilling('test-team', {
        tokensPerSat: 1000,
        baseCostSats: 10,
        teamFeePercent: 5,
      });
    });

    it('should calculate cost correctly', () => {
      const cost = billing.calculateCost(5000); // 5000 tokens
      // base 10 + 5000/1000 = 15 sats
      expect(cost.sats).toBe(15);
      expect(cost.usd).toBeGreaterThan(0);
    });

    it('should create invoice with team fee', async () => {
      const invoice = await billing.createInvoice('dev-1', 5000, 'Test inference');
      expect(invoice.status).toBe('pending');
      expect(invoice.amountSats).toBeGreaterThan(15); // 15 + 5% fee
    });

    it('should calculate team cost split', () => {
      const usage = new Map([
        ['dev-1', 3000],
        ['dev-2', 2000],
      ]);

      const splits = billing.calculateSplit(5000, usage, 'project-x');
      expect(splits).toHaveLength(2);
      expect(splits[0].percentage).toBe(60); // 3000/5000
      expect(splits[1].percentage).toBe(40); // 2000/5000
    });
  });
});
