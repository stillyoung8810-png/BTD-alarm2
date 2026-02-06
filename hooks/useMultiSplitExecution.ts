/**
 * 다분할 매매법 실행 데이터를 통합 계산하는 커스텀 훅.
 *
 * 기존 Dashboard.tsx의 4개 연쇄 useEffect를 단일 비동기 흐름으로 통합하여
 * cascade effect (state A → effect B → state C → effect D) 안티패턴을 제거합니다.
 *
 * 모든 중간 결과는 로컬 변수로 전달되고, 최종 결과만 한 번의 setState로 반영됩니다.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Portfolio } from '../types';
import { calculateHoldings } from '../utils/portfolioCalculations';
import { fetchStockPrices } from '../services/stockService';
import { getStockPrices, initDatabase } from '../services/db';
import {
  calcT,
  getPhase,
  calcQuarterStopLossOrders,
  calcMultiSplitOrders,
  RECENT_TRADING_DAYS_COUNT,
  type TradeInput,
  type QuarterStopLossResult,
  type MultiSplitExecutionResult,
} from '../utils/multiSplitCalc';

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

async function fetchRecentTradingDays(targetStock: string, days: number): Promise<string[]> {
  try {
    await initDatabase();
    const records = await getStockPrices(targetStock, days * 2);
    if (records.length === 0) return [];
    const sorted = records.sort((a, b) => b.date.localeCompare(a.date));
    return sorted.slice(0, days).map((r) => r.date);
  } catch {
    return [];
  }
}

/** 입력 조합으로부터 안정적인 문자열 키를 생성합니다. */
function buildInputKey(portfolio: Portfolio, multiSplitPhase: string | null, currentRound: number): string {
  return [
    portfolio.id,
    portfolio.strategy.multiSplit?.targetStock ?? '',
    portfolio.strategy.multiSplit?.totalSplitCount ?? 0,
    portfolio.strategy.multiSplit?.targetReturnRate ?? 0,
    portfolio.dailyBuyAmount,
    portfolio.feeRate,
    portfolio.trades.length,
    portfolio.isQuarterMode ?? false,
    multiSplitPhase ?? '',
    currentRound,
  ].join('|');
}

// ---------------------------------------------------------------------------
// 훅 본체
// ---------------------------------------------------------------------------

export function useMultiSplitExecution(portfolio: Portfolio): MultiSplitHookResult {
  const isMultiSplit = !!portfolio.strategy.multiSplit;

  // ---- 동기 계산 (useMemo) ----
  const currentRound = useMemo(() => {
    if (!isMultiSplit) return 0;
    return calcT(portfolio.trades as TradeInput[], portfolio.dailyBuyAmount);
  }, [isMultiSplit, portfolio.trades, portfolio.dailyBuyAmount]);

  const multiSplitPhase = useMemo(() => {
    if (!isMultiSplit) return null;
    return getPhase(currentRound, portfolio.strategy.multiSplit!.totalSplitCount);
  }, [isMultiSplit, currentRound, portfolio.strategy.multiSplit?.totalSplitCount]);

  const a = portfolio.strategy.multiSplit?.totalSplitCount ?? 0;
  const isInQuarterModeByT = currentRound > a - 1 && currentRound <= a;
  const isInQuarterMode = portfolio.isQuarterMode === true;

  // ---- 비동기 통합 state ----
  const [quarterStopLossData, setQuarterStopLossData] = useState<QuarterStopLossResult | null>(null);
  const [multiSplitExecutionData, setMultiSplitExecutionData] = useState<MultiSplitExecutionResult | null>(null);
  const [multiSplitInsufficientAmount, setMultiSplitInsufficientAmount] = useState(false);

  // 중복 계산 방지용 키
  const lastKeyRef = useRef<string | null>(null);

  // ---- 단일 통합 useEffect ----
  useEffect(() => {
    if (!isMultiSplit) {
      // 다분할이 아니면 전부 초기화
      setQuarterStopLossData(null);
      setMultiSplitExecutionData(null);
      setMultiSplitInsufficientAmount(false);
      lastKeyRef.current = null;
      return;
    }

    const inputKey = buildInputKey(portfolio, multiSplitPhase, currentRound);
    if (lastKeyRef.current === inputKey) return;

    let cancelled = false;

    const run = async () => {
      const ms = portfolio.strategy.multiSplit!;
      const targetStock = ms.targetStock;

      // 1) recentTradingDays (로컬 변수 — state 불필요)
      const recentTradingDays = await fetchRecentTradingDays(targetStock, RECENT_TRADING_DAYS_COUNT);
      if (cancelled) return;

      // 2) holdings (공용)
      const holdings = calculateHoldings(portfolio);
      const targetHolding = holdings.find((h) => h.stock === targetStock) ?? (holdings.length > 0 ? holdings[0] : null);
      const avgPrice = targetHolding?.avgPrice || 0;
      const currentQuantity = targetHolding?.quantity || 0;

      // 3) quarterStopLossData (쿼터모드일 때만)
      let nextQuarter: QuarterStopLossResult | null = null;
      if (isInQuarterMode && recentTradingDays.length > 0) {
        nextQuarter = calcQuarterStopLossOrders({
          trades: portfolio.trades as TradeInput[],
          dailyBuyAmount: portfolio.dailyBuyAmount,
          multiSplit: ms,
          feeRate: portfolio.feeRate || 0.25,
          recentTradingDays,
          avgPrice,
          currentQuantity,
        });
      }
      if (cancelled) return;

      // 4) multiSplitExecutionData (전반전/후반전)
      let nextExecution: MultiSplitExecutionResult | null = null;
      if (multiSplitPhase === 'first' || multiSplitPhase === 'second') {
        // 현재 주가 fetch (basePrice 결정에 필요)
        let currentPrice = 0;
        try {
          const stockPrices = await fetchStockPrices([targetStock]);
          if (cancelled) return;
          currentPrice = stockPrices[targetStock]?.price || 0;
        } catch (err) {
          console.warn('[useMultiSplitExecution] fetchStockPrices 실패:', targetStock, err);
          if (cancelled) return;
        }

        const basePrice = avgPrice > 0 ? avgPrice : (currentPrice > 0 ? currentPrice : 0);
        if (basePrice <= 0) {
          console.warn('[useMultiSplitExecution] basePrice=0 → 주문 계산 불가 (avgPrice=%f, currentPrice=%f)', avgPrice, currentPrice);
        }
        if (basePrice > 0) {
          const A = ms.targetReturnRate;
          const aCount = ms.totalSplitCount;
          nextExecution = calcMultiSplitOrders({
            phase: multiSplitPhase,
            A,
            a: aCount,
            T: currentRound,
            basePrice,
            currentQuantity,
            oneTimeAmount: portfolio.dailyBuyAmount,
            feeRate: portfolio.feeRate || 0.25,
          });
        }
      }
      if (cancelled) return;

      // 5) insufficientAmount (주가 기반)
      let nextInsufficient = false;
      try {
        const stockPrices = await fetchStockPrices([targetStock]);
        if (cancelled) return;
        const cp = stockPrices[targetStock]?.price ?? 0;
        nextInsufficient = cp > 0 && portfolio.dailyBuyAmount < cp;
      } catch (err) {
        console.warn('[useMultiSplitExecution] insufficientAmount 체크용 주가 fetch 실패:', err);
      }
      if (cancelled) return;

      // ---- 한 번의 setState 배치 ----
      lastKeyRef.current = inputKey;
      setQuarterStopLossData(nextQuarter);
      setMultiSplitExecutionData(nextExecution);
      setMultiSplitInsufficientAmount(nextInsufficient);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    isMultiSplit,
    portfolio.id,
    portfolio.strategy.multiSplit?.targetStock,
    portfolio.strategy.multiSplit?.totalSplitCount,
    portfolio.strategy.multiSplit?.targetReturnRate,
    portfolio.dailyBuyAmount,
    portfolio.feeRate,
    portfolio.trades.length,
    portfolio.isQuarterMode,
    multiSplitPhase,
    currentRound,
    isInQuarterMode,
  ]);

  return {
    currentRound,
    multiSplitPhase,
    isInQuarterMode,
    isInQuarterModeByT,
    quarterStopLossData,
    multiSplitExecutionData,
    multiSplitInsufficientAmount,
  };
}
