import { describe, it, expect } from 'vitest';
import { providerFromModelId } from '../dispatch.js';
import { getPricing } from '../../billing/pricing.js';

describe('Elephant Alpha Model', () => {
  it('should be correctly identified as an OpenRouter model', () => {
    const provider = providerFromModelId('openrouter/elephant-alpha');
    expect(provider).toBe('openrouter');
  });

  it('should have free pricing', () => {
    const pricing = getPricing('openrouter/elephant-alpha');
    expect(pricing.inputPricePer1k).toBe(0);
    expect(pricing.outputPricePer1k).toBe(0);
  });
});
