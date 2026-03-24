/// <reference lib="deno.ns" />
/**
 * VR 스냅샷 일괄 갱신 — 사이클 전환(T+1 Forward) 시 V·밴드·주문표 재계산.
 * 배포: supabase functions deploy refresh-vr-snapshots --no-verify-jwt
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import type { AlarmConfig, Portfolio, PortfolioRow, VrSnapshot } from '../_shared/types.ts';
import { LEGACY_FEE_RATE_PCT } from '../_shared/vrConstants.ts';
import {
  calculateBands,
  calculateCycleIndexFromDates,
  calculateNextV,
  generateBuyOrders,
  generateSellOrders,
  sanitizeVrCycleWeeks,
} from '../_shared/vrBandStrategy.ts';

/**
 * Supabase JS + 생성된 Database 타입 없이 Edge에서 사용 — PostgREST 체인만 호출.
 * (향후 `Database` 제네릭 연동 시 `any` 제거)
 */
// deno-lint-ignore-file no-explicit-any
type EdgeSupabase = any;

function mapPortfolioRow(row: PortfolioRow): Portfolio | null {
  if (!row?.strategy) return null;

  const rawTrades = row.trades;
  const trades = Array.isArray(rawTrades) ? rawTrades : [];

  const rawSnap = row.vr_snapshot ?? row['vrSnapshot'];

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
    alarmconfig: (row.alarm_config ?? row.alarmconfig) as AlarmConfig | undefined,
    isQuarterMode: Boolean(row.is_quarter_mode ?? false),
    vrSnapshot:
      rawSnap === null || rawSnap === undefined ? undefined : (rawSnap as VrSnapshot),
  };
}

function calculateNextCycleIndex(portfolio: Portfolio): number | null {
  const vrBand = portfolio.strategy?.vrBand;
  if (!vrBand) return null;
  if (!portfolio.vrSnapshot) return null;

  const startDate = new Date(`${portfolio.startDate}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime())) return null;

  const cycleWeeks = sanitizeVrCycleWeeks(vrBand.cycleWeeks);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;

  if (!y || !m || !d) {
    console.error('[VR_Scheduler_Error] Date formatting failed', { y, m, d });
    return null;
  }

  const usDateString = `${y}-${m}-${d}`;
  const logicalToday = new Date(`${usDateString}T00:00:00Z`);

  const targetCycleIndex = calculateCycleIndexFromDates(
    startDate.getTime(),
    logicalToday.getTime(),
    cycleWeeks,
  );

  const lastCycleIndex = portfolio.vrSnapshot.cycleIndex ?? -1;

  return targetCycleIndex > lastCycleIndex ? targetCycleIndex : null;
}

async function refreshVrSnapshotForPortfolio(
  supabase: EdgeSupabase,
  portfolio: Portfolio,
  portfolioId: string,
  targetCycleIndex: number,
): Promise<void> {
  const params = portfolio.strategy.vrBand;
  const prev = portfolio.vrSnapshot;
  if (!params || !prev) return;

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

  const updatedSnapshot: VrSnapshot = {
    ...prev,
    currentV: nextV,
    bandLow,
    bandHigh,
    buyOrders,
    sellOrders,
    cycleIndex: targetCycleIndex,
  };

  const { error } = await supabase
    .from('portfolios')
    .update({ vr_snapshot: updatedSnapshot })
    .eq('id', portfolioId);

  if (error) {
    console.error(`[VR_Refresh_Error] portfolio ${portfolioId}:`, error);
    throw error;
  }
}

const PAGE_SIZE = 1000;
const SELECT_COLUMNS =
  'id, user_id, name, daily_buy_amount, fee_rate, strategy, trades, alarm_config, is_quarter_mode, is_closed, vr_snapshot, start_date';

export async function processAllVrPortfolios(supabase: EdgeSupabase): Promise<void> {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: rows, error } = await supabase
      .from('portfolios')
      .select(SELECT_COLUMNS)
      .eq('is_closed', false)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (rows ?? []) as PortfolioRow[];
    if (batch.length === 0) break;

    await Promise.allSettled(
      batch.map(async (row) => {
        try {
          const portfolio = mapPortfolioRow(row);
          if (!portfolio?.strategy.vrBand) return;

          const targetIdx = calculateNextCycleIndex(portfolio);
          if (targetIdx !== null) {
            await refreshVrSnapshotForPortfolio(
              supabase,
              portfolio,
              String(row.id ?? ''),
              targetIdx,
            );
          }
        } catch (err) {
          console.error(`[VR_Batch_Error] Failed portfolio ${row.id}:`, err);
        }
      }),
    );

    hasMore = batch.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }
}

serve(async () => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({
          error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const supabase: EdgeSupabase = createClient(supabaseUrl, serviceKey);
    await processAllVrPortfolios(supabase);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
