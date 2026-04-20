import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { showErrorToast } from '../components/tds-adapter/showErrorToast';
import { APP_SHELL_MESSAGES } from '../constants/messages/appShellMessages';
import type { AppLang, Portfolio } from '../types';
import { areStrictPositiveFiniteScalars } from '../utils/financialScalarGuards';
import { calculateHoldingsFromTrades } from '../utils/portfolioCalculations';
import {
  calcQuarterStopLossOrders,
  calcMultiSplitOrders,
  calcT,
  getPhase,
  RECENT_TRADING_DAYS_COUNT,
  type MultiSplitParams,
  type QuarterStopLossResult,
  type MultiSplitExecutionResult,
} from '../utils/multiSplitCalc';
import {
  fetchLatestStockSnapshot,
  getRecentTradingDaysFromDbSafe,
} from '../services/stockService';
import {
  DEFAULT_PORTFOLIO_FEE_RATE,
  EMPTY_TRADES,
  type MultiSplitNetworkSnapshot,
  toTradeInputsForMultiSplit,
} from './multiSplitExecutionShared';

export interface MultiSplitHookResult {
  /** 현재 시행 회차 T */
  currentRound: number;
  /** 현재 구간 */
  multiSplitPhase: 'first' | 'second' | 'quarter' | null;
  /** 쿼터모드 여부 (DB 플래그) */
  isInQuarterMode: boolean;
  /** T > a-1 조건 충족 여부 (신규 쿼터 진입용) */
  isInQuarterModeByT: boolean;
  /** 쿼터 손절 모드 주문 데이터 */
  quarterStopLossData: QuarterStopLossResult | null;
  /** 전반전/후반전 주문 데이터 */
  multiSplitExecutionData: MultiSplitExecutionResult | null;
  /** 1회 매수금 부족 여부 */
  multiSplitInsufficientAmount: boolean;
}

export function useMultiSplitExecution(
  portfolio: Portfolio,
  lang: AppLang,
): MultiSplitHookResult {
  const multiSplitStrategy = portfolio.strategy.multiSplit ?? null;
  const isMultiSplit = multiSplitStrategy != null;
  const targetStock = multiSplitStrategy?.targetStock ?? '';
  const targetReturnRate = multiSplitStrategy?.targetReturnRate ?? 0;
  const totalSplitCount = multiSplitStrategy?.totalSplitCount ?? 0;
  const { trades, dailyBuyAmount: dailyBuyAmountRaw, isQuarterMode, feeRate } =
    portfolio;
  const dailyBuyAmount = dailyBuyAmountRaw ?? 0;
  const isDailyBuyAmountValid = areStrictPositiveFiniteScalars(dailyBuyAmount);
  const isTargetReturnRateValid =
    areStrictPositiveFiniteScalars(targetReturnRate);

  const tradeInputs = useMemo(
    () => toTradeInputsForMultiSplit(trades),
    [trades],
  );

  const { avgPrice, currentQuantity } = useMemo(() => {
    const holdings = calculateHoldingsFromTrades(trades ?? EMPTY_TRADES);
    const targetHolding = holdings.find((holding) => holding.stock === targetStock);
    return {
      avgPrice: targetHolding?.avgPrice ?? 0,
      currentQuantity: targetHolding?.quantity ?? 0,
    };
  }, [trades, targetStock]);

  const requestIdRef = useRef(0);
  const networkErrorMsg = APP_SHELL_MESSAGES[lang].dailySummaryNetworkError;
  const networkErrorMsgRef = useRef(networkErrorMsg);

  useLayoutEffect(() => {
    networkErrorMsgRef.current = networkErrorMsg;
  }, [networkErrorMsg]);

  const [networkSnapshot, setNetworkSnapshot] =
    useState<MultiSplitNetworkSnapshot | null>(null);

  useEffect(() => {
    if (!isMultiSplit) {
      requestIdRef.current += 1;
      setNetworkSnapshot((previous) => (previous !== null ? null : previous));
      return;
    }

    setNetworkSnapshot((previous) => (previous !== null ? null : previous));
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const runFetch = async () => {
      try {
        const [recentDaysResult, quoteResult] = await Promise.all([
          getRecentTradingDaysFromDbSafe(targetStock, RECENT_TRADING_DAYS_COUNT),
          fetchLatestStockSnapshot(targetStock),
        ]);

        if (requestIdRef.current !== requestId) {
          return;
        }

        const isQuoteInvalid =
          quoteResult.ok &&
          (!Number.isFinite(quoteResult.data.price) || quoteResult.data.price <= 0);

        if (!recentDaysResult.ok || !quoteResult.ok || isQuoteInvalid) {
          if (requestIdRef.current !== requestId) {
            return;
          }
          setNetworkSnapshot((previous) => (previous !== null ? null : previous));
          if (requestIdRef.current !== requestId) {
            return;
          }
          showErrorToast(networkErrorMsgRef.current);
          return;
        }

        if (requestIdRef.current !== requestId) {
          return;
        }

        setNetworkSnapshot({
          currentPrice: quoteResult.data.price,
          recentTradingDays: recentDaysResult.data,
        });
      } catch {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setNetworkSnapshot((previous) => (previous !== null ? null : previous));
        if (requestIdRef.current !== requestId) {
          return;
        }
        showErrorToast(networkErrorMsgRef.current);
      }
    };

    void runFetch();

    return () => {
      requestIdRef.current += 1;
    };
  }, [targetStock]);

  const currentRound =
    !isMultiSplit || !isDailyBuyAmountValid
      ? 0
      : calcT(tradeInputs, dailyBuyAmount);

  const multiSplitPhase =
    !isMultiSplit ||
    totalSplitCount === 0 ||
    !isDailyBuyAmountValid
      ? null
      : getPhase(currentRound, totalSplitCount);

  const {
    quarterStopLossData,
    multiSplitExecutionData,
    multiSplitInsufficientAmount,
  } = useMemo(() => {
    if (
      !isMultiSplit ||
      networkSnapshot == null ||
      !isTargetReturnRateValid ||
      totalSplitCount === 0 ||
      !isDailyBuyAmountValid
    ) {
      return {
        quarterStopLossData: null,
        multiSplitExecutionData: null,
        multiSplitInsufficientAmount: false,
      };
    }

    const { currentPrice, recentTradingDays } = networkSnapshot;
    const basePrice = avgPrice > 0 ? avgPrice : currentPrice;
    const safeStrategyObj: MultiSplitParams = {
      targetStock,
      targetReturnRate,
      totalSplitCount,
    };

    let nextQuarterStopLossData: QuarterStopLossResult | null = null;
    if ((isQuarterMode ?? false) && recentTradingDays.length > 0) {
      nextQuarterStopLossData = calcQuarterStopLossOrders({
        trades: tradeInputs,
        dailyBuyAmount,
        multiSplit: safeStrategyObj,
        feeRate: feeRate ?? DEFAULT_PORTFOLIO_FEE_RATE,
        recentTradingDays,
        avgPrice,
        currentQuantity,
      });
    }

    let nextMultiSplitExecutionData: MultiSplitExecutionResult | null = null;
    if (
      !(isQuarterMode ?? false) &&
      (multiSplitPhase === 'first' || multiSplitPhase === 'second') &&
      basePrice > 0
    ) {
      nextMultiSplitExecutionData = calcMultiSplitOrders({
        phase: multiSplitPhase,
        A: targetReturnRate,
        a: totalSplitCount,
        T: currentRound,
        basePrice,
        currentQuantity,
        oneTimeAmount: dailyBuyAmount,
        feeRate: feeRate ?? DEFAULT_PORTFOLIO_FEE_RATE,
      });
    }

    return {
      quarterStopLossData: nextQuarterStopLossData,
      multiSplitExecutionData: nextMultiSplitExecutionData,
      multiSplitInsufficientAmount: dailyBuyAmount < currentPrice,
    };
  }, [
    avgPrice,
    currentQuantity,
    currentRound,
    dailyBuyAmount,
    feeRate,
    isDailyBuyAmountValid,
    isMultiSplit,
    isQuarterMode,
    isTargetReturnRateValid,
    multiSplitPhase,
    networkSnapshot,
    targetReturnRate,
    targetStock,
    totalSplitCount,
    tradeInputs,
  ]);

  return {
    currentRound,
    multiSplitPhase,
    isInQuarterMode: isQuarterMode === true,
    isInQuarterModeByT: multiSplitPhase === 'quarter',
    quarterStopLossData,
    multiSplitExecutionData,
    multiSplitInsufficientAmount,
  };
}
