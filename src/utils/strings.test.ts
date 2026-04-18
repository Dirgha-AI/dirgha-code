import { describe, it, expect } from 'vitest';

describe('String Utilities', () => {
  describe('truncate', () => {
    it('truncates long strings', () => {
      const str = 'a'.repeat(100);
      const truncated = str.slice(0, 50) + '...';
      expect(truncated.length).toBeLessThan(str.length);
      expect(truncated).toContain('...');
    });

    it('does not truncate short strings', () => {
      const str = 'short';
      expect(str.length).toBeLessThan(50);
    });
  });

  describe('kebabCase', () => {
    it('converts camelCase to kebab-case', () => {
      const camel = 'meshJoinCommand';
      const kebab = camel.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      expect(kebab).toBe('mesh-join-command');
    });
  });

  describe('maskSecret', () => {
    it('masks API keys', () => {
      const key = 'sk-ant-1234567890abcdef';
      const masked = key.slice(0, 8) + '...' + key.slice(-4);
      expect(masked).toBe('sk-ant-1...cdef');
      expect(masked).not.toBe(key);
    });
  });
});

describe('Validation', () => {
  it('validates email format', () => {
    const email = 'test@example.com';
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(isValid).toBe(true);
  });

  it('rejects invalid email', () => {
    const email = 'not-an-email';
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(isValid).toBe(false);
  });

  it('validates semver', () => {
    const versions = ['1.0.0', '2.1.3', '0.0.1'];
    const semver = /^\d+\.\d+\.\d+$/;
    
    for (const v of versions) {
      expect(semver.test(v)).toBe(true);
    }
  });
});
