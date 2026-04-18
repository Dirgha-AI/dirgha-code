// @ts-nocheck

import { describe, it, expect } from 'vitest';
import { redactSecrets } from './index.js';

describe('CLI Entry', () => {
  it('redacts secrets in crash logs', () => {
    const crash = 'Error: ' + ['sk', '1234567890abcdef1234567890abcdef'].join('-');
    const redacted = redactSecrets(crash);
    expect(redacted).toContain('[REDACTED]');
  });
});
