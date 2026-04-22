import { describe, expect, it } from 'vitest';
import {
  simulateAppliedLocRatioRejectsValuesAbove100,
  simulateCeoEdgeCaseUsesMocFirstThenRemainingToLoc,
  simulateExecutableOrdersReuseDisplayReferences,
  simulateCurrentEngineBaselineConsumesLocLeftoverIntoMoc,
  simulateFirstBuyStillShowsHintInsteadOfZeroLines,
  simulateHookExecuteMutexBlocksDuplicateSubmit,
  simulateHookExecuteFailsWhenNoExecutableOrdersExist,
  simulateHookExecuteUsesOnlyExecutableOrders,
  simulateHookRendererReusesReferencesWhenInputsAreStable,
  simulateHookViewModelHidesExecutableFieldsFromUiSurface,
  simulateRemainingToLocKeepsBaseMocQuantityUntouched,
  simulateSplitCompleteStillShowsOnlyTakeProfit,
  simulateZeroShareSummaryLinesStayVisibleWhenBudgetBelowPrice,
} from './no-stop-multisplit-loc-priority-zero-display-simulation-snippets';

describe('no-stop loc-priority and zero-display simulation', () => {
  it('keeps the current engine baseline for comparison', () => {
    expect(() => simulateCurrentEngineBaselineConsumesLocLeftoverIntoMoc()).not.toThrow();
  });

  it('matches the CEO edge case with moc-first and remaining-budget-to-loc allocation', () => {
    expect(() => simulateCeoEdgeCaseUsesMocFirstThenRemainingToLoc()).not.toThrow();
  });

  it('keeps the base MOC quantity untouched during remaining-budget-to-loc allocation', () => {
    expect(() => simulateRemainingToLocKeepsBaseMocQuantityUntouched()).not.toThrow();
  });

  it('shows zero-share LOC and MOC lines for active strategies without executable orders', () => {
    expect(() => simulateZeroShareSummaryLinesStayVisibleWhenBudgetBelowPrice()).not.toThrow();
  });

  it('reuses display order objects for executable orders when quantity is positive', () => {
    expect(() => simulateExecutableOrdersReuseDisplayReferences()).not.toThrow();
  });

  it('rejects appliedLocRatio values above 100 before allocation math runs', () => {
    expect(() => simulateAppliedLocRatioRejectsValuesAbove100()).not.toThrow();
  });

  it('keeps executable fields hidden from the hook view model surface', () => {
    expect(() => simulateHookViewModelHidesExecutableFieldsFromUiSurface()).not.toThrow();
  });

  it('reuses hook references when rerender inputs are referentially identical', () => {
    expect(() => simulateHookRendererReusesReferencesWhenInputsAreStable()).not.toThrow();
  });

  it('builds broker payloads from executable orders only inside the hook callback', async () => {
    await expect(simulateHookExecuteUsesOnlyExecutableOrders()).resolves.toBeUndefined();
  });

  it('fails fast when the hook callback has no executable orders to submit', async () => {
    await expect(simulateHookExecuteFailsWhenNoExecutableOrdersExist()).resolves.toBeUndefined();
  });

  it('blocks duplicate async submits with a synchronous execution mutex', async () => {
    await expect(simulateHookExecuteMutexBlocksDuplicateSubmit()).resolves.toBeUndefined();
  });

  it('keeps the first-buy hint instead of noisy zero-share lines before the first entry', () => {
    expect(() => simulateFirstBuyStillShowsHintInsteadOfZeroLines()).not.toThrow();
  });

  it('removes additional buy lines after split completion and keeps only take-profit guidance', () => {
    expect(() => simulateSplitCompleteStillShowsOnlyTakeProfit()).not.toThrow();
  });
});
