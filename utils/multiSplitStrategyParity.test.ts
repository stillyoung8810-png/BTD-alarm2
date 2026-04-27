import { describe, expect, it } from 'vitest';
import type {
  MultiSplitIndicatorSnapshot,
  MultiSplitStrategy,
} from '../types';
import {
  calcHoldings as calcClientHoldings,
  calculateMultiSplitBuyGuide as calculateClientMultiSplitBuyGuide,
  calculateMultiSplitCashUsagePct as calculateClientMultiSplitCashUsagePct,
  calculateMultiSplitGuideState as calculateClientMultiSplitGuideState,
  calculateMultiSplitSellGuide as calculateClientMultiSplitSellGuide,
  calculateRemainingBudget as calculateClientRemainingBudget,
  collectIndicatorRequirements as collectClientIndicatorRequirements,
  normalizeMultiSplitReturnRates as normalizeClientMultiSplitReturnRates,
  type TradeInput,
} from './multiSplitCalc';
import {
  calcHoldings as calcEdgeHoldings,
  calculateMultiSplitBuyGuide as calculateEdgeMultiSplitBuyGuide,
  calculateMultiSplitCashUsagePct as calculateEdgeMultiSplitCashUsagePct,
  calculateMultiSplitGuideState as calculateEdgeMultiSplitGuideState,
  calculateMultiSplitSellGuide as calculateEdgeMultiSplitSellGuide,
  calculateRemainingBudget as calculateEdgeRemainingBudget,
  collectIndicatorRequirements as collectEdgeIndicatorRequirements,
  normalizeMultiSplitReturnRates as normalizeEdgeMultiSplitReturnRates,
} from '../supabase/functions/_shared/multiSplitShared.ts';

const BASE_STRATEGY: MultiSplitStrategy = {
  targetStock: 'TQQQ',
  targetReturnRate: 15,
  intermediateReturnRate: 5,
  totalSplitCount: 10,
  baseLocRatio: 40,
  mainTakeProfitRatioPct: 60,
  riskCutRatioPct: 20,
  rsiRule: {
    threshold: 40,
    locRatio: 70,
  },
  alignmentRule: {
    shortPeriod: 5,
    longPeriod: 20,
    locRatio: 70,
  },
};

const SNAPSHOT: MultiSplitIndicatorSnapshot = {
  currentPrice: 110,
  rsi: 35,
  maByPeriod: {
    5: 111,
    20: 100,
  },
};

const TRADES: TradeInput[] = [
  {
    type: 'buy',
    stock: 'TQQQ',
    date: '2026-01-02',
    price: 100,
    quantity: 5,
    fee: 1,
  },
  {
    type: 'buy',
    stock: 'TQQQ',
    date: '2026-01-03',
    price: 105,
    quantity: 5,
    fee: 1,
  },
  {
    type: 'sell',
    stock: 'TQQQ',
    date: '2026-01-04',
    price: 115,
    quantity: 2,
    fee: 1,
  },
];

describe('Multi-split strategy client/edge parity', () => {
  it('동일한 거래·스냅샷 입력이면 핵심 가이드 상태를 동일하게 계산한다', () => {
    const input = {
      trades: TRADES,
      strategy: BASE_STRATEGY,
      oneTimeAmount: 1_000,
      feeRate: 0.25,
      snapshot: SNAPSHOT,
    };

    expect(calculateEdgeMultiSplitGuideState(input)).toEqual(
      calculateClientMultiSplitGuideState(input),
    );
    expect(calculateEdgeMultiSplitGuideState(input)).toMatchObject({
      currentQuantity: 8,
      appliedLocRatioPct: 70,
    });
  });

  it('매수·매도 주문 금액과 수량을 1센트 단위까지 동일하게 계산한다', () => {
    const buyInput = {
      buyTrancheBudget: 750,
      feeRate: 0.25,
      avgPrice: 102.7,
      snapshot: SNAPSHOT,
      strategy: BASE_STRATEGY,
    };
    const sellInput = {
      currentQuantity: 17,
      avgPrice: 102.7,
      targetReturnRate: BASE_STRATEGY.targetReturnRate,
      intermediateReturnRate: BASE_STRATEGY.intermediateReturnRate,
      mainTakeProfitRatioPct: BASE_STRATEGY.mainTakeProfitRatioPct,
      riskCutRatioPct: BASE_STRATEGY.riskCutRatioPct,
    };

    expect(calculateEdgeMultiSplitBuyGuide(buyInput)).toEqual(
      calculateClientMultiSplitBuyGuide(buyInput),
    );
    expect(calculateEdgeMultiSplitSellGuide(sellInput)).toEqual(
      calculateClientMultiSplitSellGuide(sellInput),
    );
    expect(calculateEdgeMultiSplitSellGuide(sellInput)).toMatchObject({
      displayMainTakeProfit: {
        price: 118.1,
        quantity: 10,
      },
      displayIntermediateTakeProfit: {
        price: 107.84,
        quantity: 7,
      },
    });
  });

  it('보유 계산·예산 계산·지표 요구사항 정규화가 동일하다', () => {
    expect(calcEdgeHoldings(TRADES)).toEqual(calcClientHoldings(TRADES));
    expect(
      normalizeEdgeMultiSplitReturnRates({
        targetReturnRate: 200,
        intermediateReturnRate: 0,
      }),
    ).toEqual(
      normalizeClientMultiSplitReturnRates({
        targetReturnRate: 200,
        intermediateReturnRate: 0,
      }),
    );
    expect(
      calculateEdgeMultiSplitCashUsagePct({
        investedCost: 1_250,
        oneTimeAmount: 500,
        totalSplitCount: 10,
      }),
    ).toBe(
      calculateClientMultiSplitCashUsagePct({
        investedCost: 1_250,
        oneTimeAmount: 500,
        totalSplitCount: 10,
      }),
    );
    expect(
      calculateEdgeRemainingBudget({
        oneTimeAmount: 500,
        totalInvested: 1_250,
        totalSplitCount: 10,
      }),
    ).toBe(
      calculateClientRemainingBudget({
        oneTimeAmount: 500,
        totalInvested: 1_250,
        totalSplitCount: 10,
      }),
    );
    expect(collectEdgeIndicatorRequirements(BASE_STRATEGY)).toEqual(
      collectClientIndicatorRequirements(BASE_STRATEGY),
    );
  });
});
