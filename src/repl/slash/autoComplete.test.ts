/**
 * repl/slash/autoComplete.test.ts — Test auto-complete logic
 */
import { describe, it, expect } from 'vitest';
import { autoCompleteSlash, getCompletions } from './index.js';

describe('autoCompleteSlash', () => {
  it('returns null for empty or just "/"', () => {
    expect(autoCompleteSlash('/')).toBeNull();
    expect(autoCompleteSlash('')).toBeNull();
    expect(autoCompleteSlash('  ')).toBeNull();
  });

  it('returns null for non-slash input', () => {
    expect(autoCompleteSlash('help')).toBeNull();
    expect(autoCompleteSlash('hello')).toBeNull();
  });

  it('completes partial commands', () => {
    // "hel" → "/help"
    const helpComplete = autoCompleteSlash('/hel');
    expect(helpComplete).toBe('/help');

    // "sta" → "/status"
    const statusComplete = autoCompleteSlash('/sta');
    expect(statusComplete).toBe('/status');

    // "cle" → "/clear"
    const clearComplete = autoCompleteSlash('/cle');
    expect(clearComplete).toBe('/clear');
  });

  it('returns null for unknown commands', () => {
    expect(autoCompleteSlash('/xyz123')).toBeNull();
    expect(autoCompleteSlash('/notacommand')).toBeNull();
  });

  it('returns null if already complete', () => {
    // Exact match should return null (already complete)
    expect(autoCompleteSlash('/help')).toBeNull();
    expect(autoCompleteSlash('/status')).toBeNull();
  });

  it('handles mixed case input', () => {
    expect(autoCompleteSlash('/HEL')).toBe('/help');
    expect(autoCompleteSlash('/Hel')).toBe('/help');
    expect(autoCompleteSlash('/hElP')).toBeNull(); // exact match, case-insensitive
  });
});

describe('getCompletions', () => {
  it('returns matching commands for partial input', () => {
    const matches = getCompletions('/hel');
    expect(matches).toContain('/help');
  });

  it('returns empty for no match', () => {
    const matches = getCompletions('/xyz');
    expect(matches).toHaveLength(0);
  });
});
