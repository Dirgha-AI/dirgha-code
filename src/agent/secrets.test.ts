import { describe, it, expect } from 'vitest';
import { redactSecrets } from './secrets.js';

describe('Secret Redaction', () => {
  it('redacts OpenAI keys', () => {
    const key = ['sk', '1234567890abcdef1234567890abcdef1234567890'].join('-');
    const text = `Key: ${key}`;
    const redacted = redactSecrets(text);
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain(key);
  });

  it('redacts AWS keys', () => {
    const text = 'AWS: AKIAIOSFODNN7EXAMPLE';
    const redacted = redactSecrets(text);
    expect(redacted).toContain('[REDACTED]');
  });

  it('redacts GitHub tokens', () => {
    const token = ['ghp', '1234567890abcdef1234567890abcdef1234'].join('_');
    const text = `Token: ${token}`;
    const redacted = redactSecrets(text);
    expect(redacted).toContain('[REDACTED]');
  });

  it('leaves safe text unchanged', () => {
    const text = 'Hello world, no secrets here';
    expect(redactSecrets(text)).toBe(text);
  });
});
