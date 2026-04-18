// @ts-nocheck

import { describe, it, expect } from 'vitest';
import { scanForThreats, SECURITY_RULES } from './rules.js';

describe('Security Rules', () => {
  it('detects eval() usage', () => {
    const code = 'eval(userInput)';
    const threats = scanForThreats(code);
    expect(threats).toContainEqual(
      expect.objectContaining({ category: 'command-injection' })
    );
  });

  it('detects Function constructor', () => {
    const code = 'new Function("return 1")';
    const threats = scanForThreats(code);
    expect(threats.length).toBeGreaterThan(0);
  });

  it('allows safe code', () => {
    const code = 'console.log("hello")';
    const threats = scanForThreats(code);
    expect(threats).toHaveLength(0);
  });

  it('has all required rules', () => {
    const required = ['SEC-008', 'SEC-009', 'SEC-010'];
    for (const rule of required) {
      expect(SECURITY_RULES.some(r => r.id === rule)).toBe(true);
    }
  });
});
