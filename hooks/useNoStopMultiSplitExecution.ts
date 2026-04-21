import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { showErrorToast } from '../components/tds-adapter/showErrorToast';
import { APP_SHELL_MESSAGES } from '../constants/messages/appShellMessages';
import type { AppLang, Portfolio } from '../types';
import { fetchLatestStockSnapshot } from '../services/stockService';
import {
  calculateNoStopMultiSplitState,
  type NoStopMultiSplitExecutionData,
  type NoStopMultiSplitParams,
} from '../supabase/functions/_shared/noStopMultiSplitShared.ts';
import { areStrictPositiveFiniteScalars } from '../utils/financialScalarGuards';
import {
  DEFAULT_PORTFOLIO_FEE_RATE,
  type NoStopMultiSplitNetworkSnapshot,
  toTradeInputsForMultiSplit,
} from './multiSplitExecutionShared';

export interface NoStopMultiSplitHookResult {
  currentRound: number;
  executionData: NoStopMultiSplitExecutionData | null;
}

export function useNoStopMultiSplitExecution(
  portfolio: Portfolio,
  lang: AppLang,
): NoStopMultiSplitHookResult {
  const noStopStrategy = portfolio.strategy.noStopMultiSplit ?? null;
  const isNoStopMultiSplit = noStopStrategy != null;
  const targetStock = noStopStrategy?.targetStock ?? '';
  const lowLocBudgetRatio = noStopStrategy?.lowLocBudgetRatio ?? 0;
  const highLocPremiumPct = noStopStrategy?.highLocPremiumPct ?? 0;
  const takeProfitPct = noStopStrategy?.takeProfitPct ?? 0;
  const totalSplitCount = noStopStrategy?.totalSplitCount ?? 0;
  const dailyBuyAmount = portfolio.dailyBuyAmount ?? 0;
  const isDailyBuyAmountValid = areStrictPositiveFiniteScalars(dailyBuyAmount);
  const tradeInputs = useMemo(
    () => toTradeInputsForMultiSplit(portfolio.trades),
    [portfolio.trades],
  );
  const networkErrorMsg = APP_SHELL_MESSAGES[lang].dailySummaryNetworkError;
  const networkErrorMsgRef = useRef(networkErrorMsg);
  const requestIdRef = useRef(0);
  const [networkSnapshot, setNetworkSnapshot] =
    useState<NoStopMultiSplitNetworkSnapshot | null>(null);

  useLayoutEffect(() => {
    networkErrorMsgRef.current = networkErrorMsg;
  }, [networkErrorMsg]);

  useEffect(() => {
    if (!isNoStopMultiSplit) {
      requestIdRef.current += 1;
      setNetworkSnapshot((previous) => (previous !== null ? null : previous));
      return;
    }

    setNetworkSnapshot((previous) => (previous !== null ? null : previous));
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const runFetch = async () => {
      try {
        const quoteResult = await fetchLatestStockSnapshot(targetStock);
        if (requestIdRef.current !== requestId) {
          return;
        }

        const isQuoteInvalid =
          quoteResult.ok &&
          (!Number.isFinite(quoteResult.data.price) || quoteResult.data.price <= 0);

        if (!quoteResult.ok || isQuoteInvalid) {
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

  const noStopState = useMemo(() => {
    if (
      !isNoStopMultiSplit ||
      networkSnapshot == null ||
      !isDailyBuyAmountValid ||
      totalSplitCount === 0
    ) {
      return null;
    }

    const safeStrategyObj: NoStopMultiSplitParams = {
      targetStock,
      lowLocBudgetRatio,
      highLocPremiumPct,
      takeProfitPct,
      totalSplitCount,
    };

    return calculateNoStopMultiSplitState({
      trades: tradeInputs,
      oneTimeAmount: dailyBuyAmount,
      feeRate: portfolio.feeRate ?? DEFAULT_PORTFOLIO_FEE_RATE,
      currentPrice: networkSnapshot.currentPrice,
      strategy: safeStrategyObj,
    });
  }, [
    dailyBuyAmount,
    highLocPremiumPct,
    isDailyBuyAmountValid,
    isNoStopMultiSplit,
    lowLocBudgetRatio,
    networkSnapshot,
    portfolio.feeRate,
    targetStock,
    takeProfitPct,
    totalSplitCount,
    tradeInputs,
  ]);

  return {
    currentRound: noStopState?.currentRound ?? 0,
    executionData: noStopState?.executionData ?? null,
  };
}
