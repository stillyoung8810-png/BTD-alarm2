import { describe, expect, it } from 'vitest';
import {
  simulateAiBuyThenSellPass,
  simulateAiMutexBlocksDoubleClick,
  simulateAiMutexUnlocksAfterFailure,
  simulateAiSelectedTradesOnly,
  simulateAiSequentialOversellBlock,
  simulateChronologicalHoldingQuantity,
  simulateExactSellPass,
  simulateFloatingPointSellPass,
  simulateLazyValidationSkipsOversellLookup,
  simulateMemoizedAvailableSellQuantity,
  simulateNoHoldingsMessagePriority,
  simulateQuickInputSellLimit,
  simulateTradeExecutionSellLimit,
} from './sell-quantity-guard-refactor-simulation-snippets';

describe('sell quantity guard simulation', () => {
  it('keeps holdings quantity stable for latest-first trade arrays', () => {
    expect(() => simulateChronologicalHoldingQuantity()).not.toThrow();
  });

  it('blocks oversell in quick input', () => {
    expect(() => simulateQuickInputSellLimit()).not.toThrow();
  });

  it('blocks oversell in trade execution modal', () => {
    expect(() => simulateTradeExecutionSellLimit()).not.toThrow();
  });

  it('allows exact full-position sell', () => {
    expect(() => simulateExactSellPass()).not.toThrow();
  });

  it('allows floating-point full-position sell within epsilon', () => {
    expect(() => simulateFloatingPointSellPass()).not.toThrow();
  });

  it('keeps no-holdings message priority', () => {
    expect(() => simulateNoHoldingsMessagePriority()).not.toThrow();
  });

  it('skips oversell lookup when base inputs are already invalid', () => {
    expect(() => simulateLazyValidationSkipsOversellLookup()).not.toThrow();
  });

  it('reuses memoized available sell quantity for identical deps', () => {
    expect(() => simulateMemoizedAvailableSellQuantity()).not.toThrow();
  });

  it('validates selected AI trades only', () => {
    expect(() => simulateAiSelectedTradesOnly()).not.toThrow();
  });

  it('blocks sequential AI oversell after prior selected sell', () => {
    expect(() => simulateAiSequentialOversellBlock()).not.toThrow();
  });

  it('allows AI buy-then-sell batches when running holdings stay non-negative', () => {
    expect(() => simulateAiBuyThenSellPass()).not.toThrow();
  });

  it('blocks duplicate AI save clicks with a synchronous mutex', async () => {
    await expect(simulateAiMutexBlocksDoubleClick()).resolves.toBeUndefined();
  });

  it('unlocks AI save mutex after failure so retry remains possible', async () => {
    await expect(simulateAiMutexUnlocksAfterFailure()).resolves.toBeUndefined();
  });
});
