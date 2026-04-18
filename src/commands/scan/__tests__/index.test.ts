import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { scanCommand } from '../index.js';

describe('Scan Command', () => {
  it('has correct name', () => {
    expect(scanCommand.name()).toBe('scan');
  });

  it('has correct description', () => {
    expect(scanCommand.description()).toContain('Security');
  });

  it('accepts path argument', () => {
    const args = scanCommand.arguments;
    expect(args.length).toBeGreaterThan(0);
  });

  it('has format option', () => {
    const options = scanCommand.options;
    const formatOpt = options.find(o => o.long === '--format');
    expect(formatOpt).toBeDefined();
  });
});

describe('Scan Utilities', () => {
  it('exports output functions', async () => {
    const utils = await import('../utils.js');
    expect(typeof utils.outputJson).toBe('function');
    expect(typeof utils.outputMarkdown).toBe('function');
    expect(typeof utils.outputSarif).toBe('function');
  });
});
