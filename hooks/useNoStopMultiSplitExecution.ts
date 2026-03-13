import { useEffect, useMemo, useState } from 'react';
import { Portfolio } from '../types';
import { fetchStockPrices } from '../services/stockService';
import {
  calcNoStopCurrentRound,
  calcNoStopMultiSplitOrders,
  type NoStopMultiSplitExecutionData,
} from '../utils/noStopMultiSplitCalc';
import type { TradeInput } from '../utils/multiSplitCalc';

export interface NoStopMultiSplitHookResult {
  currentRound: number;
  executionData: NoStopMultiSplitExecutionData | null;
}

export function useNoStopMultiSplitExecution(portfolio: Portfolio): NoStopMultiSplitHookResult {
  const isNoStopMultiSplit = !!portfolio.strategy.noStopMultiSplit;

  const currentRound = useMemo(() => {
    if (!isNoStopMultiSplit) return 0;
    return calcNoStopCurrentRound(portfolio.trades as TradeInput[], portfolio.dailyBuyAmount);
  }, [isNoStopMultiSplit, portfolio.trades, portfolio.dailyBuyAmount]);

  const [executionData, setExecutionData] = useState<NoStopMultiSplitExecutionData | null>(null);

  useEffect(() => {
    if (!isNoStopMultiSplit) {
      setExecutionData(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      const strategy = portfolio.strategy.noStopMultiSplit!;
      let currentPrice = 0;

      try {
        const prices = await fetchStockPrices([strategy.targetStock]);
        if (cancelled) return;
        currentPrice = prices[strategy.targetStock]?.price ?? 0;
      } catch (err) {
        console.warn('[useNoStopMultiSplitExecution] fetchStockPrices 실패:', strategy.targetStock, err);
        if (cancelled) return;
      }

      const nextExecution = calcNoStopMultiSplitOrders({
        trades: portfolio.trades as TradeInput[],
        oneTimeAmount: portfolio.dailyBuyAmount,
        feeRate: portfolio.feeRate || 0.25,
        currentPrice,
        strategy,
      });

      if (!cancelled) setExecutionData(nextExecution);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    isNoStopMultiSplit,
    portfolio.id,
    portfolio.trades,
    portfolio.dailyBuyAmount,
    portfolio.feeRate,
    portfolio.strategy.noStopMultiSplit?.targetStock,
    portfolio.strategy.noStopMultiSplit?.lowLocBudgetRatio,
    portfolio.strategy.noStopMultiSplit?.highLocPremiumPct,
    portfolio.strategy.noStopMultiSplit?.takeProfitPct,
    portfolio.strategy.noStopMultiSplit?.totalSplitCount,
  ]);

  return { currentRound, executionData };
}
