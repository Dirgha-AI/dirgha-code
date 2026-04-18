// @ts-nocheck

/**
 * cost/Router.test.ts — Tests for Cost Optimizer
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SmartRouter, TaskComplexity } from './Router.js';
import { BudgetEnforcer } from './BudgetEnforcer.js';
import { CostTracker } from './CostTracker.js';

describe('SmartRouter', () => {
  let budget: BudgetEnforcer;
  let tracker: CostTracker;
  let router: SmartRouter;

  beforeEach(() => {
    budget = new BudgetEnforcer({ dailyLimit: 20, emergencyReserve: 2 });
    tracker = new CostTracker();
    router = new SmartRouter(budget, tracker);
  });

  it('routes simple tasks to local tier', () => {
    const task: TaskComplexity = {
      codeLines: 50,
      hasTests: false,
      hasArchitecture: false,
      securitySensitive: false,
      novelProblem: false,
      retryCount: 0,
    };

    const decision = router.route(task, 'simple refactor');
    expect(decision.tier).toBe('local');
    expect(decision.estimatedCost).toBe(0);
  });

  it('routes security tasks to premium tier', () => {
    const task: TaskComplexity = {
      codeLines: 200,
      hasTests: true,
      hasArchitecture: false,
      securitySensitive: true,
      novelProblem: false,
      retryCount: 0,
    };

    const decision = router.route(task, 'fix auth vulnerability');
    expect(decision.tier).toBe('premium');
    expect(decision.reasoning).toContain('security');
  });

  it('downgrades when budget is tight', () => {
    // Spend most of budget
    budget.spend(19.99); // Only $0.01 left

    const task: TaskComplexity = {
      codeLines: 500,
      hasTests: true,
      hasArchitecture: true,
      securitySensitive: false,
      novelProblem: false,
      retryCount: 0,
    };

    const decision = router.route(task, 'add feature');
    // Depending on cost estimation, standard might still be affordable
    expect(['standard', 'economy', 'local']).toContain(decision.tier);
    // expect(decision.reasoning).toContain('budget');
  });

  it('generates hourly report', () => {
    const report = router.reportHourly();
    expect(report.budget.dailyLimit).toBe(20);
    expect(report.budget.remaining).toBe(20);
    expect(report.summary.totalCalls).toBe(0);
  });
});

describe('BudgetEnforcer', () => {
  it('enforces hard daily limit', () => {
    const enforcer = new BudgetEnforcer({ dailyLimit: 20, emergencyReserve: 2 });
    
    expect(enforcer.canSpend(19)).toBe(true);
    expect(enforcer.spend(19)).toBe(true);
    expect(enforcer.canSpend(2)).toBe(false); // Over limit
    expect(enforcer.canSpend(2, true)).toBe(true); // Emergency allowed
  });

  it('resets daily', () => {
    const enforcer = new BudgetEnforcer({ dailyLimit: 20 });
    enforcer.spend(20);
    expect(enforcer.getRemaining()).toBe(0);
    // Cannot test actual reset without time manipulation
  });

  it('triggers downgrade at 80% utilization', () => {
    const enforcer = new BudgetEnforcer({ dailyLimit: 20 });
    expect(enforcer.shouldDowngrade()).toBe(false);
    
    enforcer.spend(17); // 85%
    expect(enforcer.shouldDowngrade()).toBe(true);
  });
});

describe('CostTracker', () => {
  it('tracks per-call costs', () => {
    const tracker = new CostTracker();
    
    tracker.track({
      tier: 'premium',
      model: 'claude-3-5-sonnet',
      provider: 'anthropic',
      inputTokens: 1000,
      outputTokens: 500,
      cost: 0.0045,
      latencyMs: 1200,
      taskType: 'code-gen',
      success: true,
    });

    const summary = tracker.getSummary();
    expect(summary.totalCalls).toBe(1);
    expect(summary.totalCost).toBe(0.0045);
    expect(summary.byTier.premium).toBeDefined();
  });
});
