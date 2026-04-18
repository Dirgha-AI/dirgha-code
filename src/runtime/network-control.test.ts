/**
 * rivet/network-control.test.ts — Tests for network access control
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkController, isUrlAllowed, networkController } from './network-control.js';

describe('NetworkController', () => {
  let controller: NetworkController;

  beforeEach(() => {
    controller = new NetworkController();
  });

  it('allows localhost by default', () => {
    const decision = controller.evaluate({
      url: 'http://localhost:3000/api',
      method: 'GET',
      headers: {},
    });

    expect(decision.action).toBe('allow');
    expect(decision.reason).toContain('localhost');
  });

  it('allows OpenAI API by default', () => {
    const decision = controller.evaluate({
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: {},
    });

    expect(decision.action).toBe('allow');
    expect(decision.reason).toContain('OpenAI');
  });

  it('denies unknown domains by default', () => {
    const decision = controller.evaluate({
      url: 'https://malicious-site.com/data',
      method: 'GET',
      headers: {},
    });

    expect(decision.action).toBe('deny');
    expect(decision.reason).toMatch(/deny|No matching/i);
  });

  it('respects custom rules', () => {
    // Create controller with only two conflicting rules
    const customController = new NetworkController([
      {
        pattern: 'example.com',
        type: 'domain',
        action: 'allow',
        description: 'Allow example',
        priority: 100,
      },
    ]);

    const decision = customController.evaluate({
      url: 'https://example.com/page',
      method: 'GET',
      headers: {},
    });

    expect(decision.action).toBe('allow');
  });

  it('respects priority ordering', () => {
    // Create controller with only two conflicting rules
    const controller2 = new NetworkController([
      {
        pattern: '*',
        type: 'domain',
        action: 'deny',
        description: 'Deny all',
        priority: 1,
      },
      {
        pattern: '*',
        type: 'domain',
        action: 'allow',
        description: 'Allow all',
        priority: 100, // Higher priority
      },
    ]);

    const decision = controller2.evaluate({
      url: 'https://any-site.com/page',
      method: 'GET',
      headers: {},
    });

    expect(decision.action).toBe('allow');
  });

  it('supports proxy action', () => {
    controller.addRule({
      pattern: 'internal-api.company.com',
      type: 'domain',
      action: 'proxy',
      proxyUrl: 'http://proxy.company.com:8080',
      description: 'Proxy internal API',
      priority: 100,
    });

    const decision = controller.evaluate({
      url: 'https://internal-api.company.com/data',
      method: 'GET',
      headers: {},
    });

    expect(decision.action).toBe('proxy');
    expect(decision.proxyUrl).toBe('http://proxy.company.com:8080');
  });

  it('maintains audit log', () => {
    controller.evaluate({
      url: 'http://localhost:3000/test',
      method: 'GET',
      headers: {},
    }, 'agent-123');

    const log = controller.getAuditLog(undefined, 'agent-123');
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].url).toBe('http://localhost:3000/test');
    expect(log[0].agentId).toBe('agent-123');
  });
});

describe('isUrlAllowed', () => {
  it('returns true for allowed URLs', () => {
    expect(isUrlAllowed('http://localhost:3000')).toBe(true);
    expect(isUrlAllowed('https://api.openai.com')).toBe(true);
  });

  it('returns false for denied URLs', () => {
    expect(isUrlAllowed('https://unknown-site.com')).toBe(false);
  });
});
