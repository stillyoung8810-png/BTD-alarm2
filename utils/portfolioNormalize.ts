/**
 * Supabase 응답(snake_case) → 앱에서 사용하는 Portfolio(camelCase) 정규화
 * DRY: App.tsx 및 handleAddPortfolio 내 중복 제거
 */
import type { Portfolio } from '../types';

export function normalizePortfolioData(data: any[]): Portfolio[] {
  return (data as any[]).map((item) => ({
    ...item,
    dailyBuyAmount: item.daily_buy_amount ?? 0,
    startDate: item.start_date ?? item.startDate ?? '',
    feeRate: item.fee_rate ?? item.feeRate ?? 0.25,
    isClosed: item.is_closed ?? item.isClosed ?? false,
    closedAt: item.closed_at ?? item.closedAt ?? undefined,
    finalSellAmount: item.final_sell_amount ?? item.finalSellAmount ?? undefined,
    alarmconfig: item.alarm_config ?? item.alarmconfig ?? undefined,
    isQuarterMode: item.is_quarter_mode ?? item.isQuarterMode ?? false,
    strategy: item.strategy,
  })) as Portfolio[];
}
