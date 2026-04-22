import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { showErrorToast } from '../components/tds-adapter/showErrorToast';
import { APP_SHELL_MESSAGES } from '../constants/messages/appShellMessages';
import type { AppLang, Portfolio } from '../types';
import { DEFAULT_FETCH_TIMEOUT_MS } from '../services/serviceUtils';
import {
  buildIndicatorRequirementCacheKey,
  fetchIndicatorAwareSnapshot,
} from '../services/stockService';
import {
  calcNoStopCurrentRound,
  calculateNoStopExecution,
  collectIndicatorRequirements,
  type IndicatorRequirements,
  type NoStopAlignmentRule,
  type NoStopIndicatorSnapshot,
  type NoStopMultiSplitStrategy,
  type NoStopRsiRule,
} from '../utils/noStopMultiSplitCalc';
import { areStrictPositiveFiniteScalars } from '../utils/financialScalarGuards';
import {
  DEFAULT_PORTFOLIO_FEE_RATE,
  toTradeInputsForMultiSplit,
} from './multiSplitExecutionShared';

const EMPTY_INDICATOR_REQUIREMENTS: IndicatorRequirements = {
  needsRsi: false,
  maPeriods: [],
};
const NO_STOP_SNAPSHOT_FETCH_TIMEOUT_MS = DEFAULT_FETCH_TIMEOUT_MS;

const NO_STOP_LOC_RATIO_PRESET_VALUES = [70, 50, 30] as const;
const NO_STOP_RSI_THRESHOLD_PRESET_VALUES = [30, 40, 50] as const;
const NO_STOP_SHORT_MOVING_AVERAGE_PERIOD_VALUES = [5, 20, 60] as const;
const NO_STOP_LONG_MOVING_AVERAGE_PERIOD_VALUES = [20, 60, 120] as const;

type IndicatorFetchTrigger =
  | 'draft-change'
  | 'step-submit'
  | 'saved-strategy-mount';

type SnapshotFetchStatus = 'idle' | 'loading' | 'ready' | 'error';

export type NoStopMultiSplitExecutionStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'invalid_strategy'
  | 'invalid_amount'
  | 'fetch_error';

export interface NoStopMultiSplitHookExecutionData {
  currentRound: number;
  progressPct: number;
  appliedLocRatio: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  displayLowLoc?: { price: number; quantity: number };
  displayMocBuy?: { quantity: number };
  takeProfit?: { price: number; quantity: number };
}

export interface NoStopMultiSplitHookResult {
  currentRound: number;
  executionData: NoStopMultiSplitHookExecutionData | null;
  status: NoStopMultiSplitExecutionStatus;
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

function isLocRatioPreset(value: number): value is 70 | 50 | 30 {
  return NO_STOP_LOC_RATIO_PRESET_VALUES.includes(
    value as (typeof NO_STOP_LOC_RATIO_PRESET_VALUES)[number],
  );
}

function isRsiThresholdPreset(value: number): value is 30 | 40 | 50 {
  return NO_STOP_RSI_THRESHOLD_PRESET_VALUES.includes(
    value as (typeof NO_STOP_RSI_THRESHOLD_PRESET_VALUES)[number],
  );
}

function isShortMovingAveragePeriod(value: number): value is 5 | 20 | 60 {
  return NO_STOP_SHORT_MOVING_AVERAGE_PERIOD_VALUES.includes(
    value as (typeof NO_STOP_SHORT_MOVING_AVERAGE_PERIOD_VALUES)[number],
  );
}

function isLongMovingAveragePeriod(value: number): value is 20 | 60 | 120 {
  return NO_STOP_LONG_MOVING_AVERAGE_PERIOD_VALUES.includes(
    value as (typeof NO_STOP_LONG_MOVING_AVERAGE_PERIOD_VALUES)[number],
  );
}

function readRsiRule(strategy: Record<string, unknown>): NoStopRsiRule | undefined {
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
): NoStopAlignmentRule | undefined {
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

function buildNoStopRuntimeStrategy(
  strategy: Portfolio['strategy']['noStopMultiSplit'] | null,
): NoStopMultiSplitStrategy | null {
  if (!isRecord(strategy)) {
    return null;
  }

  const targetStock = readTrimmedString(strategy, 'targetStock');
  const baseLocRatio =
    readFiniteNumber(strategy, 'baseLocRatio') ??
    readFiniteNumber(strategy, 'lowLocBudgetRatio');
  const takeProfitPct = readFiniteNumber(strategy, 'takeProfitPct');
  const totalSplitCount = readFiniteNumber(strategy, 'totalSplitCount');

  if (
    targetStock == null ||
    baseLocRatio == null ||
    takeProfitPct == null ||
    totalSplitCount == null ||
    baseLocRatio < 0 ||
    takeProfitPct < 0 ||
    totalSplitCount <= 0
  ) {
    return null;
  }

  const rsiRule = readRsiRule(strategy);
  const alignmentRule = readAlignmentRule(strategy);

  return {
    targetStock,
    baseLocRatio,
    takeProfitPct,
    totalSplitCount,
    ...(rsiRule != null ? { rsiRule } : {}),
    ...(alignmentRule != null ? { alignmentRule } : {}),
  };
}

function shouldFetchIndicators(args: {
  trigger: IndicatorFetchTrigger;
  previousCacheKey?: string;
  nextCacheKey: string;
}): boolean {
  if (args.trigger === 'draft-change') {
    return false;
  }

  return args.previousCacheKey !== args.nextCacheKey;
}

function toHookExecutionData(args: {
  currentRound: number;
  execution: ReturnType<typeof calculateNoStopExecution>;
}): NoStopMultiSplitHookExecutionData {
  const { currentRound, execution } = args;

  return {
    currentRound,
    progressPct: execution.progressPct,
    appliedLocRatio: execution.appliedLocRatio,
    isFirstBuy: execution.isFirstBuy,
    isSplitComplete: execution.isSplitComplete,
    ...(execution.displayLowLoc != null
      ? { displayLowLoc: execution.displayLowLoc }
      : {}),
    ...(execution.displayMocBuy != null
      ? { displayMocBuy: execution.displayMocBuy }
      : {}),
    ...(execution.takeProfit != null ? { takeProfit: execution.takeProfit } : {}),
  };
}

export function useNoStopMultiSplitExecution(
  portfolio: Portfolio,
  lang: AppLang,
): NoStopMultiSplitHookResult {
  const noStopStrategy = portfolio.strategy.noStopMultiSplit ?? null;
  const hasNoStopStrategy = noStopStrategy != null;
  const runtimeStrategy = useMemo(
    () => buildNoStopRuntimeStrategy(noStopStrategy),
    [noStopStrategy],
  );
  const isNoStopMultiSplit = runtimeStrategy != null;
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
    // Keep fetch inputs stable per cache key so cache->remote portfolio refreshes
    // do not cancel the in-flight snapshot request and strand the card in loading.
    () => indicatorRequirements,
    [indicatorCacheKey],
  );
  const networkErrorMsg = APP_SHELL_MESSAGES[lang].dailySummaryNetworkError;
  const networkErrorMsgRef = useRef(networkErrorMsg);
  const requestIdRef = useRef(0);
  const previousCacheKeyRef = useRef<string | undefined>(undefined);
  const [networkSnapshot, setNetworkSnapshot] =
    useState<NoStopIndicatorSnapshot | null>(null);
  const [snapshotFetchStatus, setSnapshotFetchStatus] =
    useState<SnapshotFetchStatus>('idle');

  useLayoutEffect(() => {
    networkErrorMsgRef.current = networkErrorMsg;
  }, [networkErrorMsg]);

  useEffect(() => {
    if (
      !isNoStopMultiSplit ||
      targetStock === '' ||
      indicatorCacheKey === '' ||
      !isDailyBuyAmountValid
    ) {
      requestIdRef.current += 1;
      previousCacheKeyRef.current = undefined;
      setNetworkSnapshot((previous) => (previous !== null ? null : previous));
      setSnapshotFetchStatus((previous) =>
        previous !== 'idle' ? 'idle' : previous,
      );
      return;
    }

    const nextCacheKey = indicatorCacheKey;
    const previousCacheKey = previousCacheKeyRef.current;
    const shouldStartFetch = shouldFetchIndicators({
      trigger: 'saved-strategy-mount',
      previousCacheKey,
      nextCacheKey,
    });
    const shouldReuseResolvedSnapshot =
      !shouldStartFetch && networkSnapshot != null;
    if (shouldReuseResolvedSnapshot) {
      return;
    }

    previousCacheKeyRef.current = nextCacheKey;
    setNetworkSnapshot((previous) => (previous !== null ? null : previous));
    setSnapshotFetchStatus('loading');
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      abortController.abort();
    }, NO_STOP_SNAPSHOT_FETCH_TIMEOUT_MS);
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

        const snapshotData = snapshotResult.data;
        const isSnapshotInvalid =
          snapshotResult.ok &&
          (
            snapshotData == null ||
            !Number.isFinite(snapshotData.currentPrice) ||
            snapshotData.currentPrice <= 0
          );

        if (!snapshotResult.ok || isSnapshotInvalid) {
          if (requestIdRef.current !== requestId) {
            return;
          }
          setNetworkSnapshot((previous) => (previous !== null ? null : previous));
          setSnapshotFetchStatus('error');
          if (requestIdRef.current !== requestId) {
            return;
          }
          showErrorToast(networkErrorMsgRef.current);
          return;
        }

        if (requestIdRef.current !== requestId) {
          return;
        }

        if (snapshotData == null) {
          return;
        }

        setSnapshotFetchStatus('ready');
        setNetworkSnapshot(snapshotData);
      } catch (error: unknown) {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setNetworkSnapshot((previous) => (previous !== null ? null : previous));
        setSnapshotFetchStatus('error');
        if (requestIdRef.current !== requestId) {
          return;
        }
        showErrorToast(networkErrorMsgRef.current);
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
    indicatorCacheKey,
    isDailyBuyAmountValid,
    isNoStopMultiSplit,
    networkSnapshot,
    portfolio.id,
    portfolio.name,
    targetStock,
  ]);

  const status = useMemo<NoStopMultiSplitExecutionStatus>(() => {
    if (!hasNoStopStrategy) {
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
    hasNoStopStrategy,
    isDailyBuyAmountValid,
    networkSnapshot,
    runtimeStrategy,
    snapshotFetchStatus,
  ]);

  const execution = useMemo(() => {
    if (
      status !== 'ready' ||
      runtimeStrategy == null ||
      networkSnapshot == null ||
      !isNoStopMultiSplit
    ) {
      return null;
    }

    return calculateNoStopExecution({
      trades: tradeInputs,
      oneTimeAmount: dailyBuyAmount,
      feeRate: portfolio.feeRate ?? DEFAULT_PORTFOLIO_FEE_RATE,
      snapshot: networkSnapshot,
      strategy: runtimeStrategy,
    });
  }, [
    dailyBuyAmount,
    isNoStopMultiSplit,
    networkSnapshot,
    portfolio.feeRate,
    runtimeStrategy,
    status,
    tradeInputs,
  ]);

  const noStopState = useMemo(() => {
    if (
      execution == null ||
      runtimeStrategy == null ||
      !isNoStopMultiSplit
    ) {
      return null;
    }

    const currentRound = calcNoStopCurrentRound(
      tradeInputs,
      dailyBuyAmount,
      runtimeStrategy.targetStock,
    );

    return {
      currentRound,
      executionData: toHookExecutionData({
        currentRound,
        execution,
      }),
    };
  }, [
    dailyBuyAmount,
    execution,
    isNoStopMultiSplit,
    runtimeStrategy,
    tradeInputs,
  ]);

  return useMemo(
    () => ({
      currentRound: noStopState?.currentRound ?? 0,
      executionData: noStopState?.executionData ?? null,
      status,
    }),
    [noStopState, status],
  );
}
