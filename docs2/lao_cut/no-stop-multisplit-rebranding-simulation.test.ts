import { describe, expect, it } from 'vitest';
import {
  simulateBaseLocRatioInputRemainsVisibleWhenTogglesOff,
  simulateChipSectionsShowConditionalGroupsWhenEnabled,
  simulateConditionMissFallsBackToBaseRatio,
  simulateFloorSafeAppliesEpsilonAtQuantityBoundary,
  simulateIndicatorFetchOnlyRunsOnSubmitOrSavedStrategyChange,
  simulateIndicatorSnapshotKeepsCurrentPriceWithoutIndicators,
  simulateMissingIndicatorsFallbacksToBaseRatio,
  simulateMocQuantityUsesSafetyBuffer,
  simulateOnlyTargetHoldingCanDriveExecutionState,
  simulateOnlyTargetHoldingCanConsumeStrategySeed,
  simulateProgressGaugeClampsToZeroAtFullSeed,
  simulateRequirementAwareCacheKeysPreventSilentFallback,
  simulateRuntimeStrategyBuildUsesPresetIds,
  simulateSharedServerSnapshotRejectsEmptyHistoryAndLoadsOnlyRequiredIndicators,
  simulateSplitCompleteKeepsOnlyTakeProfit,
  simulateStricterConditionWinsWhenBothMatch,
  simulateSummaryUsesNewLabelsAndMocQuantityOnly,
} from './no-stop-multisplit-rebranding-simulation-snippets';

describe('no-stop multisplit rebranding simulation', () => {
  it('keeps the base loc ratio as a manual input when both toggles are off', () => {
    expect(() => simulateBaseLocRatioInputRemainsVisibleWhenTogglesOff()).not.toThrow();
  });

  it('shows all conditional chip groups when RSI and alignment toggles are on', () => {
    expect(() => simulateChipSectionsShowConditionalGroupsWhenEnabled()).not.toThrow();
  });

  it('maps only conditional preset ids into runtime strategy rules', () => {
    expect(() => simulateRuntimeStrategyBuildUsesPresetIds()).not.toThrow();
  });

  it('keeps the snapshot valid with current price only and preserves partial indicators', () => {
    expect(() => simulateIndicatorSnapshotKeepsCurrentPriceWithoutIndicators()).not.toThrow();
  });

  it('rejects empty server price history and loads only the indicators required by the strategy', () => {
    expect(() => simulateSharedServerSnapshotRejectsEmptyHistoryAndLoadsOnlyRequiredIndicators()).not.toThrow();
  });

  it('falls back to the base ratio when optional indicators are missing', () => {
    expect(() => simulateMissingIndicatorsFallbacksToBaseRatio()).not.toThrow();
  });

  it('uses requirement-aware cache keys so price-only snapshots do not poison indicator snapshots', () => {
    expect(() => simulateRequirementAwareCacheKeysPreventSilentFallback()).not.toThrow();
  });

  it('does not fetch indicators during draft editing and only fetches on submit or saved strategy changes', () => {
    expect(() => simulateIndicatorFetchOnlyRunsOnSubmitOrSavedStrategyChange()).not.toThrow();
  });

  it('falls back to the manually entered base loc ratio when conditions miss', () => {
    expect(() => simulateConditionMissFallsBackToBaseRatio()).not.toThrow();
  });

  it('uses the stricter LOC ratio when both conditions match', () => {
    expect(() => simulateStricterConditionWinsWhenBothMatch()).not.toThrow();
  });

  it('calculates MOC quantity with the fixed 15 percent safety buffer', () => {
    expect(() => simulateMocQuantityUsesSafetyBuffer()).not.toThrow();
  });

  it('applies epsilon-safe flooring at share quantity boundaries', () => {
    expect(() => simulateFloorSafeAppliesEpsilonAtQuantityBoundary()).not.toThrow();
  });

  it('uses only the configured target holding when deriving execution state', () => {
    expect(() => simulateOnlyTargetHoldingCanDriveExecutionState()).not.toThrow();
  });

  it('uses only the configured target holding when tracking invested seed and split completion', () => {
    expect(() => simulateOnlyTargetHoldingCanConsumeStrategySeed()).not.toThrow();
  });

  it('clamps the progress gauge to zero when the configured seed is exhausted', () => {
    expect(() => simulateProgressGaugeClampsToZeroAtFullSeed()).not.toThrow();
  });

  it('formats execution lines with the new labels and quantity-only MOC output', () => {
    expect(() => simulateSummaryUsesNewLabelsAndMocQuantityOnly()).not.toThrow();
  });

  it('removes additional buy guidance after split completion and keeps only take-profit', () => {
    expect(() => simulateSplitCompleteKeepsOnlyTakeProfit()).not.toThrow();
  });
});
