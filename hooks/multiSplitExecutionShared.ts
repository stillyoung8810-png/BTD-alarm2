import type { Trade } from '../types';
import type { TradeInput } from '../utils/multiSplitCalc';

/** Rule 8: 기본 수수료율은 제품 상수와 동일한 단일 소스를 가정합니다. */
export const DEFAULT_PORTFOLIO_FEE_RATE = 0.25;

/** `trades`가 비어 있을 때 참조 안정성을 유지하는 공용 상수입니다. */
export const EMPTY_TRADES: Trade[] = [];

/** 어댑터 빈 결과의 참조 안정성을 보장합니다. */
export const EMPTY_TRADE_INPUTS: TradeInput[] = [];

export type TradingDay = string;

export interface MultiSplitNetworkSnapshot {
  currentPrice: number;
  recentTradingDays: TradingDay[];
}

export interface NoStopMultiSplitNetworkSnapshot {
  currentPrice: number;
}

/**
 * [Option A] `Trade[]`를 B1 엔진 입력 `TradeInput[]`로 연결하는 단일 어댑터입니다.
 * nullish/비배열/빈 배열은 공용 빈 참조를 반환해 불필요한 재계산을 막습니다.
 */
export function toTradeInputsForMultiSplit(
  trades: Trade[] | undefined | null,
): TradeInput[] {
  if (!Array.isArray(trades) || trades.length === 0) {
    return EMPTY_TRADE_INPUTS;
  }

  return trades.map((trade) => ({
    type: trade.type,
    stock: trade.stock,
    date: trade.date,
    price: trade.price,
    quantity: trade.quantity,
    fee: trade.fee,
    ...(trade.isMOC !== undefined ? { isMOC: trade.isMOC } : {}),
  }));
}
