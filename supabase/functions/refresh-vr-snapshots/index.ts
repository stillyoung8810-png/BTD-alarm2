/// <reference lib="deno.ns" />
/**
 * VR 스냅샷 일괄 갱신 — 사이클 전환(T+1 Forward) 시 V·밴드·주문표 재계산.
 * 배포: supabase functions deploy refresh-vr-snapshots --no-verify-jwt
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  buildRefreshedVrSnapshot,
  processVrRefreshBatch,
} from '../_shared/vrSnapshotRefresh.ts';
import type { PortfolioRow, VrSnapshot } from '../_shared/types.ts';

interface EdgeMutationResult {
  error: unknown;
}

interface EdgeSelectResult<Row> {
  data: Row[] | null;
  error: unknown;
}

interface EdgePortfoliosGateway {
  select(columns: string): {
    eq(column: 'is_closed', value: boolean): {
      range(from: number, to: number): Promise<EdgeSelectResult<PortfolioRow>>;
    };
  };
  update(payload: { vr_snapshot: VrSnapshot }): {
    eq(column: 'id', value: string): Promise<EdgeMutationResult>;
  };
}

interface EdgeSupabase {
  from(table: 'portfolios'): EdgePortfoliosGateway;
}

async function refreshVrSnapshotForPortfolio(
  supabase: EdgeSupabase,
  portfolio: { strategy: { vrBand?: unknown }; vrSnapshot?: VrSnapshot },
  portfolioId: string,
  targetCycleIndex: number,
): Promise<void> {
  const updatedSnapshot = buildRefreshedVrSnapshot(portfolio, targetCycleIndex);
  if (!updatedSnapshot) return;

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

    await processVrRefreshBatch(batch, {
      refreshPortfolio: async (portfolio, portfolioId, targetCycleIndex) => {
        await refreshVrSnapshotForPortfolio(
          supabase,
          portfolio,
          portfolioId,
          targetCycleIndex,
        );
      },
    });

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
