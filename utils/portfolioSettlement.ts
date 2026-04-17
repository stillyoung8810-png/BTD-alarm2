import type { Portfolio } from '../types';
import { roundMoney } from './financialMath';
import {
  calculateTotalInvested,
  getTotalSellProceeds,
} from './portfolioCalculations';

export interface ClosedStrategySettlementSummary {
  totalInvested: number;
  alreadyRealized: number;
  totalReturn: number;
  profit: number;
  yieldRate: number;
}

export type AggregateRoiInput = Pick<
  ClosedStrategySettlementSummary,
  'totalInvested' | 'profit'
>;

export function buildClosedStrategySettlementSummary(
  portfolio: Portfolio,
): ClosedStrategySettlementSummary {
  const totalInvested = roundMoney(calculateTotalInvested(portfolio));
  const totalReturn = roundMoney(getTotalSellProceeds(portfolio));
  const profit = roundMoney(totalReturn - totalInvested);
  const yieldRate =
    totalInvested > 0 ? roundMoney((profit / totalInvested) * 100) : 0;

  return {
    totalInvested,
    alreadyRealized: totalReturn,
    totalReturn,
    profit,
    yieldRate,
  };
}

export function calculateAggregateHistoryRoi(
  summaries: readonly AggregateRoiInput[],
): number {
  const totalInvested = roundMoney(
    summaries.reduce((sum, summary) => sum + summary.totalInvested, 0),
  );

  if (totalInvested <= 0) {
    return 0;
  }

  const totalProfit = roundMoney(
    summaries.reduce((sum, summary) => sum + summary.profit, 0),
  );

  return roundMoney((totalProfit / totalInvested) * 100);
}
