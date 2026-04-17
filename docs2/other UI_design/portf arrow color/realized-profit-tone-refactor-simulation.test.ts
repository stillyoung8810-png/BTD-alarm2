import { describe, expect, it } from 'vitest';
import {
  simulateLoadingStateKeepsRealizedToneNeutral,
  simulateNegativeRealizedProfitRowUsesLossTone,
  simulatePositiveRealizedProfitRowUsesGainTone,
  simulateRoundedZeroRealizedProfitRowUsesNeutralTone,
} from './realized-profit-tone-refactor-simulation-snippets';

describe('realized profit tone simulation', () => {
  it('uses loss tone for realized loss even when yield is positive', () => {
    expect(() => simulateNegativeRealizedProfitRowUsesLossTone()).not.toThrow();
  });

  it('uses gain tone for realized gain even when yield is negative', () => {
    expect(() => simulatePositiveRealizedProfitRowUsesGainTone()).not.toThrow();
  });

  it('uses neutral tone when realized profit rounds to zero', () => {
    expect(() => simulateRoundedZeroRealizedProfitRowUsesNeutralTone()).not.toThrow();
  });

  it('keeps realized profit tone neutral while metrics are loading', () => {
    expect(() => simulateLoadingStateKeepsRealizedToneNeutral()).not.toThrow();
  });
});
