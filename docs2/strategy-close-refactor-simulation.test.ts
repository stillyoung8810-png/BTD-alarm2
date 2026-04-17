import { describe, expect, it } from 'vitest';
import {
  simulateAggregateRoiGuardsDivisionByZero,
  simulateAggregateRoiUsesCapitalWeightedFormula,
  simulateCloseBlockedWhenActiveSharesRemain,
  simulateCloseGoesDirectlyToSettlementWhenNoSharesRemain,
  simulateCloseMutexBlocksDoubleSubmit,
  simulateCloseMutexUnlocksAfterFailure,
  simulateHistoryAndSettlementMetricsStaySynced,
  simulateSettlementModalHidesObsoleteFields,
} from './strategy-close-refactor-simulation-snippets';

describe('strategy close refactor simulation', () => {
  it('blocks close when active shares remain', () => {
    expect(() => simulateCloseBlockedWhenActiveSharesRemain()).not.toThrow();
  });

  it('goes directly to settlement when no shares remain', () => {
    expect(() =>
      simulateCloseGoesDirectlyToSettlementWhenNoSharesRemain(),
    ).not.toThrow();
  });

  it('blocks duplicate close requests with a synchronous mutex', async () => {
    await expect(simulateCloseMutexBlocksDoubleSubmit()).resolves.toBeUndefined();
  });

  it('unlocks the close mutex after failure so retry remains possible', async () => {
    await expect(simulateCloseMutexUnlocksAfterFailure()).resolves.toBeUndefined();
  });

  it('keeps history metrics synced with settlement metrics', () => {
    expect(() => simulateHistoryAndSettlementMetricsStaySynced()).not.toThrow();
  });

  it('uses capital-weighted aggregate ROI instead of average yield', () => {
    expect(() => simulateAggregateRoiUsesCapitalWeightedFormula()).not.toThrow();
  });

  it('guards aggregate ROI division by zero', () => {
    expect(() => simulateAggregateRoiGuardsDivisionByZero()).not.toThrow();
  });

  it('hides obsolete settlement rows', () => {
    expect(() => simulateSettlementModalHidesObsoleteFields()).not.toThrow();
  });
});
