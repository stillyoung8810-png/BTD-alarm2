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
import type { Portfolio, PortfolioRow, VrSnapshot } from '../_shared/types.ts';

interface EdgePostgrestError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

interface EdgeSelectResult<Row> {
  data: Row[] | null;
  error: EdgePostgrestError | null;
}

interface EdgeMutationResult {
  error: EdgePostgrestError | null;
}

type EdgeAsyncResult<Result> = PromiseLike<Result>;

type EdgePortfolioTable = 'portfolios';
type EdgePortfolioEqColumn = 'is_closed';
type EdgePortfolioNotColumn = 'strategy->vrBand';
type EdgePortfolioUpdateColumn = 'id';
type EdgePostgrestIsOperator = 'is';

interface EdgeQueryFilter<Row> {
  eq(
    column: EdgePortfolioEqColumn,
    value: boolean,
  ): EdgeQueryFilter<Row>;
  not(
    column: EdgePortfolioNotColumn,
    operator: EdgePostgrestIsOperator,
    value: null,
  ): EdgeQueryFilter<Row>;
  range(from: number, to: number): EdgeAsyncResult<EdgeSelectResult<Row>>;
}

interface EdgeUpdateFilter {
  eq(
    column: EdgePortfolioUpdateColumn,
    value: string,
  ): EdgeAsyncResult<EdgeMutationResult>;
}

interface EdgePortfolioSnapshotUpdate {
  vr_snapshot: VrSnapshot;
}

interface EdgeTableGateway<Row, UpdatePayload> {
  select(columns: string): EdgeQueryFilter<Row>;
  update(payload: UpdatePayload): EdgeUpdateFilter;
}

interface EdgeSupabase {
  from<Row = unknown, UpdatePayload = never>(
    table: EdgePortfolioTable,
  ): EdgeTableGateway<Row, UpdatePayload>;
}

type EdgeSupabaseFactory = (
  supabaseUrl: string,
  serviceKey: string,
) => EdgeSupabase;

function createEdgeSupabaseClient(
  supabaseUrl: string,
  serviceKey: string,
): EdgeSupabase {
  const createEdgeClient = createClient as unknown as EdgeSupabaseFactory;
  return createEdgeClient(supabaseUrl, serviceKey);
}

async function refreshVrSnapshotForPortfolio(
  supabase: EdgeSupabase,
  portfolio: Portfolio,
  portfolioId: string,
  targetCycleIndex: number,
): Promise<void> {
  const updatedSnapshot = buildRefreshedVrSnapshot(portfolio, targetCycleIndex);
  if (!updatedSnapshot) return;

  const { error } = await supabase
    .from<PortfolioRow, EdgePortfolioSnapshotUpdate>('portfolios')
    .update({ vr_snapshot: updatedSnapshot })
    .eq('id', portfolioId);

  if (error) {
    console.error(`[VR_Refresh_Error] portfolio ${portfolioId}:`, error);
    throw error;
  }
}

const PAGE_SIZE = 1000;
const SELECT_COLUMNS =
  'id, name, daily_buy_amount, fee_rate, strategy, trades, alarm_config, is_closed, vr_snapshot, start_date';

export async function processAllVrPortfolios(supabase: EdgeSupabase): Promise<void> {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: rows, error } = await supabase
      .from<PortfolioRow>('portfolios')
      .select(SELECT_COLUMNS)
      .eq('is_closed', false)
      // DB 단계에서 TVC 포트폴리오만 가져와 비-TVC row egress를 제거합니다.
      .not('strategy->vrBand', 'is', null)
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

    const supabase = createEdgeSupabaseClient(supabaseUrl, serviceKey);
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
