/** 앱 전역 언어. 모든 컴포넌트의 lang props는 이 타입을 사용한다. */
export type AppLang = 'ko' | 'en';

/**
 * Strategy 객체와 1:1인 전략 데이터 슬라이스 키 SSOT.
 * UI 탭 ID가 아니라 `Strategy` 내부 필드 식별 전용이며, 새 전략 필드가 추가되면 이 배열만 갱신합니다.
 */
export const STRATEGY_SLICE_KEY_VALUES = [
  'ma0',
  'ma1',
  'ma2',
  'ma3',
  'multiSplit',
  'noStopMultiSplit',
  'vrBand',
] as const;

export type StrategySliceKey =
  (typeof STRATEGY_SLICE_KEY_VALUES)[number];

export const NO_STOP_LOC_RATIO_PRESET_VALUES = [70, 50, 30] as const;
export type NoStopLocRatioPreset =
  (typeof NO_STOP_LOC_RATIO_PRESET_VALUES)[number];

export const NO_STOP_RSI_THRESHOLD_PRESET_VALUES = [30, 40, 50] as const;
export type NoStopRsiThresholdPreset =
  (typeof NO_STOP_RSI_THRESHOLD_PRESET_VALUES)[number];

export const NO_STOP_SHORT_MA_PERIOD_VALUES = [5, 20, 60] as const;
export const NO_STOP_LONG_MA_PERIOD_VALUES = [20, 60, 120] as const;

export type NoStopShortMovingAveragePeriod =
  (typeof NO_STOP_SHORT_MA_PERIOD_VALUES)[number];
export type NoStopLongMovingAveragePeriod =
  (typeof NO_STOP_LONG_MA_PERIOD_VALUES)[number];
export type NoStopMovingAveragePeriod =
  | NoStopShortMovingAveragePeriod
  | NoStopLongMovingAveragePeriod;

export interface NoStopRsiRule {
  threshold: NoStopRsiThresholdPreset;
  locRatio: NoStopLocRatioPreset;
}

export interface NoStopAlignmentRule {
  shortPeriod: NoStopShortMovingAveragePeriod;
  longPeriod: NoStopLongMovingAveragePeriod;
  locRatio: NoStopLocRatioPreset;
}

export interface NoStopMultiSplitStrategy {
  targetStock: string;
  baseLocRatio: number;
  takeProfitPct: number;
  totalSplitCount: number;
  rsiRule?: NoStopRsiRule;
  alignmentRule?: NoStopAlignmentRule;
}

export interface NoStopIndicatorSnapshot {
  currentPrice: number;
  rsi?: number;
  maByPeriod?: Partial<Record<NoStopMovingAveragePeriod, number>>;
}

export const MULTI_SPLIT_LOC_RATIO_PRESET_VALUES =
  NO_STOP_LOC_RATIO_PRESET_VALUES;
export type MultiSplitLocRatioPreset = NoStopLocRatioPreset;
export type MultiSplitRsiThresholdPreset = NoStopRsiThresholdPreset;
export type MultiSplitShortMovingAveragePeriod =
  NoStopShortMovingAveragePeriod;
export type MultiSplitLongMovingAveragePeriod = NoStopLongMovingAveragePeriod;
export type MultiSplitMovingAveragePeriod = NoStopMovingAveragePeriod;

export interface MultiSplitRsiRule {
  threshold: MultiSplitRsiThresholdPreset;
  locRatio: MultiSplitLocRatioPreset;
}

export interface MultiSplitAlignmentRule {
  shortPeriod: MultiSplitShortMovingAveragePeriod;
  longPeriod: MultiSplitLongMovingAveragePeriod;
  locRatio: MultiSplitLocRatioPreset;
}

export interface MultiSplitStrategy {
  targetStock: string;
  targetReturnRate: number;
  intermediateReturnRate: number;
  totalSplitCount: number;
  baseLocRatio: number;
  mainTakeProfitRatioPct: number;
  riskCutRatioPct: number;
  rsiRule?: MultiSplitRsiRule;
  alignmentRule?: MultiSplitAlignmentRule;
}

export interface MultiSplitIndicatorSnapshot {
  currentPrice: number;
  rsi?: number;
  maByPeriod?: Partial<Record<MultiSplitMovingAveragePeriod, number>>;
}

export interface IndicatorRequirements {
  needsRsi: boolean;
  maPeriods: readonly NoStopMovingAveragePeriod[];
}

export type NotificationAgreementSuccessStatus = 'newAgreement' | 'alreadyAgreed';

export interface AlarmConfig {
  enabled: boolean;
  selectedHours: string[]; // e.g., ["15:00", "16:00"] (최대 2개)
  timezone?: string; // IANA timezone (e.g., "Asia/Seoul")
  notificationAgreementTemplateCode?: string;
  notificationAgreementStatus?: NotificationAgreementSuccessStatus;
  notificationAgreementAgreedAt?: string;
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
  // 다분할 매매법(스마트 스플릿) 전용 필드
  multiSplit?: MultiSplitStrategy;
  // 다분할 매매법(무손절) 전용 필드
  noStopMultiSplit?: NoStopMultiSplitStrategy;
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
  /** 현재 진행 중인 리밸런싱 사이클 회차 (0부터 시작). 기존 저장 스냅샷에는 없을 수 있음. */
  cycleIndex?: number;
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
  /** 리밸런싱 주기(주). 1~12 사이의 정수. */
  cycleWeeks: number;
  baseGrowthRatePct: number;
  smartBrakeThresholdPct: number;
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
  /** VR 밴드 전략: 실시간 상태(Pool/V/밴드/주문표). 잔액 계산은 이 값만 사용. 초기 설정은 strategy.vrBand 단일 소스. */
  vrSnapshot?: VrSnapshot;
}

/** DB(Supabase)에서 가져온 snake_case 행(매핑 전). Record 확장으로 추가 컬럼도 허용. */
export interface PortfolioRow extends Record<string, unknown> {
  id?: string | null;
  user_id?: string | null;
  name?: string | null;
  daily_buy_amount?: number | null;
  start_date?: string | null;
  /** 일부 클라이언트/Edge 매핑용 camelCase */
  startDate?: string | null;
  fee_rate?: number | null;
  /** 레거시/일부 클라이언트에서 camelCase로 올 수 있음 — `fee_rate` 우선 */
  feeRate?: number | null;
  strategy?: Strategy;
  trades?: Trade[] | null;
  alarm_config?: AlarmConfig | null;
  is_closed?: boolean | null;
  closed_at?: string | null;
  final_sell_amount?: number | null;
  vr_snapshot?: VrSnapshot | null;
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
