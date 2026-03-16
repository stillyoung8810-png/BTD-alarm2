/** 앱 전역 언어. 모든 컴포넌트의 lang props는 이 타입을 사용한다. */
export type AppLang = 'ko' | 'en';

export enum StrategySection {
  MA1 = 'MA1',
  MA2 = 'MA2',
  MA3 = 'MA3'
}

export interface AlarmConfig {
  enabled: boolean;
  selectedHours: string[]; // e.g., ["15:00", "16:00"] (최대 2개)
  timezone?: string; // IANA timezone (e.g., "Asia/Seoul")
}

export interface Strategy {
  ma0: {
    stock: string;
    rsiEnabled: boolean;
    /** 이동평균선 a > b 일 때만 매수할지 여부 (정배열 매수) */
    alignmentEnabled?: boolean;
    /** 단기 이평선 기간(일). 구간 판정에 사용. 백테스트 maAPeriod와 동일. */
    maAPeriod?: number;
    /** 장기 이평선 기간(일). 구간 판정에 사용. 백테스트 maBPeriod와 동일. */
    maBPeriod?: number;
  };
  ma1: {
    stock: string;
    rsiThreshold?: number;
    /** 중간 이익 실현 사용 시 목표 수익률(%) */
    takePartialProfit?: boolean;
    partialProfitTargetPct?: number;
  };
  ma2: {
    stock: string;
    splitCount: number;
    rsiThreshold?: number;
    takePartialProfit?: boolean;
    partialProfitTargetPct?: number;
  };
  ma3: {
    stock: string;
    rsiThreshold?: number;
    takePartialProfit?: boolean;
    partialProfitTargetPct?: number;
  };
  // 다분할 매매법 전용 필드
  multiSplit?: {
    targetStock: string;
    targetReturnRate: number; // A: 목표 수익률 (5-30)
    totalSplitCount: number; // a: 총 분할 횟수 (20-80)
  };
  // 다분할 매매법(무손절) 전용 필드
  noStopMultiSplit?: {
    targetStock: string;
    lowLocBudgetRatio: number; // 저가 LOC 예산 비율 (%)
    highLocPremiumPct: number; // 고가 LOC 프리미엄 (%)
    takeProfitPct: number; // 익절 목표 수익률 (%)
    totalSplitCount: number; // 총 분할 횟수
  };
  /** VR 밴드 전략 설정. SSOT — 초기 설정은 이 필드 단 한 곳에만 존재. */
  vrBand?: VrBandStrategyParams;
}

export interface Trade {
  id: string;
  type: 'buy' | 'sell';
  stock: string;
  date: string; // ISO format or YYYY-MM-DD
  price: number;
  quantity: number;
  fee: number;
  isMOC?: boolean; // MOC 매도 여부 (매도일 때만 사용)
  /** VR 전략: pool_after 등 체결 직후 상태. 다른 전략은 확장 가능. */
  metadata?: { pool_after?: number; [key: string]: unknown };
}

/** VR 예약 주문 한 레벨 (매수/매도 공통) */
export interface OrderLevel {
  step: number;
  price: number;
  qty: number;
  isBuffer: boolean;
  sharesAfter: number;
  poolAfter: number;
}

/** VR 전략 실시간 상태(덮어쓰기용). DB 저장·조회, 증권사 API 현금과 혼용 금지. */
export interface VrSnapshot {
  currentV: number;
  pool: number;
  shares: number;
  avgPrice: number;
  bandLow: number;
  bandHigh: number;
  buyOrders: OrderLevel[];
  sellOrders: OrderLevel[];
}

/** VR 밴드 전략 공통 필드. Optional 속성 없음(필수만). */
export interface VrBandStrategyBase {
  initialV: number;
  initialCapital: number;
  bandRateUpper: number;
  bandRateLower: number;
  feeRate: number;
  G: number;
  minOrderQty: number;
  poolUsageRateBuy: number;
}

/** 적립식: 매 사이클 deltaCash 필수 */
export interface VrBandAccumulate extends VrBandStrategyBase {
  vrMode: 'accumulate';
  deltaCash: number;
}

/** 인출식: 매 사이클 인출 금액 필수 */
export interface VrBandWithdraw extends VrBandStrategyBase {
  vrMode: 'withdraw';
  deltaCash: number;
}

/** 거치식: deltaCash는 리터럴 0으로 강제 */
export interface VrBandLumpSum extends VrBandStrategyBase {
  vrMode: 'lump_sum';
  deltaCash: 0;
}

/** Strategy.vrBand 에 넣을 설정. SSOT — 포트폴리오 VR 설정은 이 타입 단 한 곳. */
export type VrBandStrategyParams =
  | VrBandAccumulate
  | VrBandWithdraw
  | VrBandLumpSum;

/**
 * 다음 V 계산 시 사용할 deltaCash.
 * 금융 데이터 방어를 위해 모드별 부호를 강제로 적용한다.
 * - accumulate: +|deltaCash|
 * - withdraw:  -|deltaCash|
 * - lump_sum:  0
 */
export function getVrDeltaCashForNextV(params: VrBandStrategyParams): number {
  switch (params.vrMode) {
    case 'accumulate':
      return Math.abs(params.deltaCash);
    case 'withdraw':
      return -Math.abs(params.deltaCash);
    case 'lump_sum':
      return 0;
    default: {
      const _exhaustive: never = params;
      return _exhaustive;
    }
  }
}

export interface Portfolio {
  id: string;
  name: string;
  dailyBuyAmount: number;
  startDate: string;
  feeRate: number;
  strategy: Strategy;
  trades: Trade[];
  isClosed: boolean;
  closedAt?: string;
  finalSellAmount?: number;
  alarmconfig?: AlarmConfig;
  /** 다분할 매매법: T > a-1 이면 true. LOC 매도(24% 이상 감소) 또는 +A% 지정가 매도(99% 이상 감소) 시 false. */
  isQuarterMode?: boolean;
  /** VR 밴드 전략: 실시간 상태(Pool/V/밴드/주문표). 잔액 계산은 이 값만 사용. 초기 설정은 strategy.vrBand 단일 소스. */
  vrSnapshot?: VrSnapshot;
}

export interface StockData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  rsi: number;
  ma20: number;
  ma60: number;
  ma120: number;
}
