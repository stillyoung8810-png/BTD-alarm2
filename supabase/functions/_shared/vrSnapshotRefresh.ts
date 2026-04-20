import type { Portfolio, PortfolioRow, VrSnapshot } from './types.ts';
import { LEGACY_FEE_RATE_PCT } from './vrConstants.ts';
import {
  calculateBands,
  calculateCycleIndexFromDates,
  calculateNextV,
  generateBuyOrders,
  generateSellOrders,
  sanitizeVrCycleWeeks,
} from './vrBandStrategy.ts';

export function mapPortfolioRowForRefresh(row: PortfolioRow): Portfolio | null {
  if (!row?.strategy) return null;

  const rawTrades = row.trades;
  const trades = Array.isArray(rawTrades) ? rawTrades : [];
  const rawSnap = row.vr_snapshot ?? row.vrSnapshot;

  return {
    id: row.id == null ? '' : String(row.id),
    name: row.name == null ? '' : String(row.name),
    dailyBuyAmount: Number(row.daily_buy_amount ?? 0),
    startDate: String(row.start_date ?? row.startDate ?? ''),
    feeRate: Number(row.fee_rate ?? row.feeRate ?? LEGACY_FEE_RATE_PCT),
    strategy: row.strategy,
    trades,
    isClosed: Boolean(row.is_closed ?? false),
    closedAt: row.closed_at == null ? undefined : String(row.closed_at),
    finalSellAmount:
      row.final_sell_amount == null ? undefined : Number(row.final_sell_amount),
    alarmconfig: row.alarm_config ?? row.alarmconfig ?? undefined,
    isQuarterMode: Boolean(row.is_quarter_mode ?? false),
    vrSnapshot: rawSnap ?? undefined,
  };
}

export function getLogicalNewYorkDate(now: Date): Date | null {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;

  if (!y || !m || !d) {
    console.error('[VR_Scheduler_Error] Date formatting failed', { y, m, d });
    return null;
  }

  return new Date(`${y}-${m}-${d}T00:00:00Z`);
}

export function calculateNextCycleIndexForPortfolio(
  portfolio: Portfolio,
  now: Date = new Date(),
): number | null {
  const vrBand = portfolio.strategy?.vrBand;
  if (!vrBand) return null;
  if (!portfolio.vrSnapshot) return null;

  const startDate = new Date(`${portfolio.startDate}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime())) return null;

  const logicalToday = getLogicalNewYorkDate(now);
  if (!logicalToday) return null;

  const targetCycleIndex = calculateCycleIndexFromDates(
    startDate.getTime(),
    logicalToday.getTime(),
    sanitizeVrCycleWeeks(vrBand.cycleWeeks),
  );
  const lastCycleIndex = portfolio.vrSnapshot.cycleIndex ?? -1;

  return targetCycleIndex > lastCycleIndex ? targetCycleIndex : null;
}

export function buildRefreshedVrSnapshot(
  portfolio: Portfolio,
  targetCycleIndex: number,
): VrSnapshot | null {
  const params = portfolio.strategy.vrBand;
  const prev = portfolio.vrSnapshot;
  if (!params || !prev) return null;

  const nextV = calculateNextV(prev.currentV, prev.pool, params);
  const { bandLow, bandHigh } = calculateBands(
    nextV,
    params.bandRateUpper,
    params.bandRateLower,
  );

  const buyOrders = generateBuyOrders({
    shares: prev.shares,
    pool: prev.pool,
    bandLow,
    minOrderQty: params.minOrderQty,
    feeRate: params.feeRate,
    poolUsageRateBuy: params.poolUsageRateBuy,
  });

  const sellOrders = generateSellOrders({
    shares: prev.shares,
    pool: prev.pool,
    bandHigh,
    minOrderQty: params.minOrderQty,
    feeRate: params.feeRate,
  });

  return {
    ...prev,
    currentV: nextV,
    bandLow,
    bandHigh,
    buyOrders,
    sellOrders,
    cycleIndex: targetCycleIndex,
  };
}

export function refreshPortfolioSnapshotIfDue(
  portfolio: Portfolio,
  now: Date = new Date(),
): VrSnapshot | null {
  const targetCycleIndex = calculateNextCycleIndexForPortfolio(portfolio, now);
  if (targetCycleIndex === null) return null;

  return buildRefreshedVrSnapshot(portfolio, targetCycleIndex);
}

export interface ProcessVrRefreshBatchDeps {
  refreshPortfolio: (
    portfolio: Portfolio,
    portfolioId: string,
    targetCycleIndex: number,
  ) => Promise<void>;
  now?: Date;
}

export async function processVrRefreshBatch(
  rows: PortfolioRow[],
  deps: ProcessVrRefreshBatchDeps,
): Promise<void> {
  const now = deps.now ?? new Date();

  await Promise.allSettled(
    rows.map(async (row) => {
      try {
        const portfolio = mapPortfolioRowForRefresh(row);
        if (!portfolio?.strategy.vrBand) return;

        const targetCycleIndex = calculateNextCycleIndexForPortfolio(portfolio, now);
        if (targetCycleIndex === null) return;

        await deps.refreshPortfolio(
          portfolio,
          String(row.id ?? ''),
          targetCycleIndex,
        );
      } catch (error) {
        console.error(`[VR_Batch_Error] Failed portfolio ${row.id}:`, error);
      }
    }),
  );
}
