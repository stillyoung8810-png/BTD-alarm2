import { useEffect, useMemo, useRef, useState } from 'react';
import { showErrorToast } from '../components/tds-adapter/showErrorToast';
import { APP_SHELL_MESSAGES } from '../constants/messages/appShellMessages';
import { DEFAULT_FETCH_TIMEOUT_MS } from '../services/serviceUtils';
import {
  buildIndicatorRequirementCacheKey,
  fetchIndicatorAwareSnapshot,
} from '../services/stockService';
import type {
  AppLang,
  MultiSplitAlignmentRule,
  MultiSplitIndicatorSnapshot,
  MultiSplitLocRatioPreset,
  MultiSplitRsiRule,
  MultiSplitStrategy,
  NoStopLongMovingAveragePeriod,
  NoStopRsiThresholdPreset,
  NoStopShortMovingAveragePeriod,
  Portfolio,
} from '../types';
import {
  MULTI_SPLIT_LOC_RATIO_PRESET_VALUES,
  NO_STOP_LONG_MA_PERIOD_VALUES,
  NO_STOP_RSI_THRESHOLD_PRESET_VALUES,
  NO_STOP_SHORT_MA_PERIOD_VALUES,
} from '../types';
import { areStrictPositiveFiniteScalars } from '../utils/financialScalarGuards';
import {
  calculateMultiSplitGuideState,
  collectIndicatorRequirements,
  type MultiSplitGuideState,
} from '../utils/multiSplitCalc';
import {
  DEFAULT_PORTFOLIO_FEE_RATE,
  toTradeInputsForMultiSplit,
} from './multiSplitExecutionShared';

const EMPTY_INDICATOR_REQUIREMENTS = {
  needsRsi: false,
  maPeriods: [],
} as const;
const MULTI_SPLIT_SNAPSHOT_FETCH_TIMEOUT_MS = DEFAULT_FETCH_TIMEOUT_MS;

type SnapshotFetchStatus = 'idle' | 'loading' | 'ready' | 'error';

export type MultiSplitExecutionStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'invalid_strategy'
  | 'invalid_amount'
  | 'fetch_error';

export interface MultiSplitHookResult {
  executionData: MultiSplitGuideState | null;
  status: MultiSplitExecutionStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function readFiniteNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isLocRatioPreset(value: number): value is MultiSplitLocRatioPreset {
  return MULTI_SPLIT_LOC_RATIO_PRESET_VALUES.includes(
    value as MultiSplitLocRatioPreset,
  );
}

function isRsiThresholdPreset(
  value: number,
): value is NoStopRsiThresholdPreset {
  return NO_STOP_RSI_THRESHOLD_PRESET_VALUES.includes(
    value as NoStopRsiThresholdPreset,
  );
}

function isShortMovingAveragePeriod(
  value: number,
): value is NoStopShortMovingAveragePeriod {
  return NO_STOP_SHORT_MA_PERIOD_VALUES.includes(
    value as NoStopShortMovingAveragePeriod,
  );
}

function isLongMovingAveragePeriod(
  value: number,
): value is NoStopLongMovingAveragePeriod {
  return NO_STOP_LONG_MA_PERIOD_VALUES.includes(
    value as NoStopLongMovingAveragePeriod,
  );
}

function readRsiRule(
  strategy: Record<string, unknown>,
): MultiSplitRsiRule | undefined {
  const rawRule = strategy.rsiRule;
  if (!isRecord(rawRule)) {
    return undefined;
  }

  const threshold = readFiniteNumber(rawRule, 'threshold');
  const locRatio = readFiniteNumber(rawRule, 'locRatio');
  if (
    threshold == null ||
    locRatio == null ||
    !isRsiThresholdPreset(threshold) ||
    !isLocRatioPreset(locRatio)
  ) {
    return undefined;
  }

  return {
    threshold,
    locRatio,
  };
}

function readAlignmentRule(
  strategy: Record<string, unknown>,
): MultiSplitAlignmentRule | undefined {
  const rawRule = strategy.alignmentRule;
  if (!isRecord(rawRule)) {
    return undefined;
  }

  const shortPeriod = readFiniteNumber(rawRule, 'shortPeriod');
  const longPeriod = readFiniteNumber(rawRule, 'longPeriod');
  const locRatio = readFiniteNumber(rawRule, 'locRatio');
  if (
    shortPeriod == null ||
    longPeriod == null ||
    locRatio == null ||
    !isShortMovingAveragePeriod(shortPeriod) ||
    !isLongMovingAveragePeriod(longPeriod) ||
    !isLocRatioPreset(locRatio) ||
    shortPeriod >= longPeriod
  ) {
    return undefined;
  }

  return {
    shortPeriod,
    longPeriod,
    locRatio,
  };
}

function buildMultiSplitRuntimeStrategy(
  strategy: Portfolio['strategy']['multiSplit'] | null,
): MultiSplitStrategy | null {
  if (!isRecord(strategy)) {
    return null;
  }

  const targetStock = readTrimmedString(strategy, 'targetStock');
  const targetReturnRate = readFiniteNumber(strategy, 'targetReturnRate');
  const totalSplitCount = readFiniteNumber(strategy, 'totalSplitCount');
  const baseLocRatio = readFiniteNumber(strategy, 'baseLocRatio');
  const mainTakeProfitRatioPct = readFiniteNumber(
    strategy,
    'mainTakeProfitRatioPct',
  );
  const riskCutRatioPct = readFiniteNumber(strategy, 'riskCutRatioPct');

  if (
    targetStock == null ||
    targetReturnRate == null ||
    totalSplitCount == null ||
    baseLocRatio == null ||
    mainTakeProfitRatioPct == null ||
    riskCutRatioPct == null ||
    totalSplitCount <= 0
  ) {
    return null;
  }

  const rsiRule = readRsiRule(strategy);
  const alignmentRule = readAlignmentRule(strategy);

  return {
    targetStock,
    targetReturnRate,
    totalSplitCount,
    baseLocRatio,
    mainTakeProfitRatioPct,
    riskCutRatioPct,
    ...(rsiRule != null ? { rsiRule } : {}),
    ...(alignmentRule != null ? { alignmentRule } : {}),
  };
}

export function useMultiSplitExecution(
  portfolio: Portfolio,
  lang: AppLang,
): MultiSplitHookResult {
  const savedStrategy = portfolio.strategy.multiSplit ?? null;
  const hasMultiSplitStrategy = savedStrategy != null;
  const runtimeStrategy = useMemo(
    () => buildMultiSplitRuntimeStrategy(savedStrategy),
    [savedStrategy],
  );
  const dailyBuyAmount = portfolio.dailyBuyAmount ?? 0;
  const isDailyBuyAmountValid = areStrictPositiveFiniteScalars(dailyBuyAmount);
  const tradeInputs = useMemo(
    () => toTradeInputsForMultiSplit(portfolio.trades),
    [portfolio.trades],
  );
  const indicatorRequirements = useMemo(
    () =>
      runtimeStrategy == null
        ? EMPTY_INDICATOR_REQUIREMENTS
        : collectIndicatorRequirements(runtimeStrategy),
    [runtimeStrategy],
  );
  const targetStock = runtimeStrategy?.targetStock ?? '';
  const indicatorCacheKey = useMemo(
    () =>
      runtimeStrategy == null
        ? ''
        : buildIndicatorRequirementCacheKey({
            symbol: runtimeStrategy.targetStock,
            requirements: indicatorRequirements,
          }),
    [indicatorRequirements, runtimeStrategy],
  );
  const fetchIndicatorRequirements = useMemo(
    () => indicatorRequirements,
    [indicatorCacheKey],
  );
  const requestIdRef = useRef(0);
  const previousCacheKeyRef = useRef<string>('');
  const [networkSnapshot, setNetworkSnapshot] =
    useState<MultiSplitIndicatorSnapshot | null>(null);
  const [snapshotFetchStatus, setSnapshotFetchStatus] =
    useState<SnapshotFetchStatus>('idle');

  useEffect(() => {
    if (
      !hasMultiSplitStrategy ||
      runtimeStrategy == null ||
      targetStock === '' ||
      indicatorCacheKey === '' ||
      !isDailyBuyAmountValid
    ) {
      requestIdRef.current += 1;
      previousCacheKeyRef.current = '';
      setNetworkSnapshot((previous) => (previous !== null ? null : previous));
      setSnapshotFetchStatus((previous) =>
        previous !== 'idle' ? 'idle' : previous,
      );
      return;
    }

    const shouldReuseResolvedSnapshot =
      previousCacheKeyRef.current === indicatorCacheKey &&
      networkSnapshot != null;
    if (shouldReuseResolvedSnapshot) {
      return;
    }

    previousCacheKeyRef.current = indicatorCacheKey;
    setNetworkSnapshot((previous) => (previous !== null ? null : previous));
    setSnapshotFetchStatus('loading');

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      abortController.abort();
    }, MULTI_SPLIT_SNAPSHOT_FETCH_TIMEOUT_MS);
    const clearFetchTimeout = () => {
      window.clearTimeout(timeoutId);
    };

    const runFetch = async () => {
      try {
        const snapshotResult = await fetchIndicatorAwareSnapshot(
          targetStock,
          fetchIndicatorRequirements,
          { signal: abortController.signal },
        );

        if (requestIdRef.current !== requestId) {
          return;
        }

        const isSnapshotInvalid =
          snapshotResult.ok &&
          (
            snapshotResult.data == null ||
            !Number.isFinite(snapshotResult.data.currentPrice) ||
            snapshotResult.data.currentPrice <= 0
          );

        if (!snapshotResult.ok || isSnapshotInvalid) {
          setNetworkSnapshot((previous) => (previous !== null ? null : previous));
          setSnapshotFetchStatus('error');
          if (requestIdRef.current === requestId) {
            showErrorToast(APP_SHELL_MESSAGES[lang].dailySummaryNetworkError);
          }
          return;
        }

        setNetworkSnapshot(snapshotResult.data);
        setSnapshotFetchStatus('ready');
      } catch {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setNetworkSnapshot((previous) => (previous !== null ? null : previous));
        setSnapshotFetchStatus('error');
        showErrorToast(APP_SHELL_MESSAGES[lang].dailySummaryNetworkError);
      } finally {
        clearFetchTimeout();
      }
    };

    void runFetch();

    return () => {
      requestIdRef.current += 1;
      clearFetchTimeout();
      abortController.abort();
    };
  }, [
    fetchIndicatorRequirements,
    hasMultiSplitStrategy,
    indicatorCacheKey,
    isDailyBuyAmountValid,
    lang,
    networkSnapshot,
    runtimeStrategy,
    targetStock,
  ]);

  const status = useMemo<MultiSplitExecutionStatus>(() => {
    if (!hasMultiSplitStrategy) {
      return 'idle';
    }

    if (runtimeStrategy == null) {
      return 'invalid_strategy';
    }

    if (!isDailyBuyAmountValid) {
      return 'invalid_amount';
    }

    if (networkSnapshot != null) {
      return 'ready';
    }

    if (snapshotFetchStatus === 'error') {
      return 'fetch_error';
    }

    return 'loading';
  }, [
    hasMultiSplitStrategy,
    isDailyBuyAmountValid,
    networkSnapshot,
    runtimeStrategy,
    snapshotFetchStatus,
  ]);

  const executionData = useMemo(() => {
    if (
      status !== 'ready' ||
      runtimeStrategy == null ||
      networkSnapshot == null
    ) {
      return null;
    }

    return calculateMultiSplitGuideState({
      trades: tradeInputs,
      strategy: runtimeStrategy,
      oneTimeAmount: dailyBuyAmount,
      feeRate: portfolio.feeRate ?? DEFAULT_PORTFOLIO_FEE_RATE,
      snapshot: networkSnapshot,
    });
  }, [
    dailyBuyAmount,
    networkSnapshot,
    portfolio.feeRate,
    runtimeStrategy,
    status,
    tradeInputs,
  ]);

  return useMemo(
    () => ({
      executionData,
      status,
    }),
    [executionData, status],
  );
}
