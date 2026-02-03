
export enum StrategySection {
  MA1 = 'MA1',
  MA2 = 'MA2',
  MA3 = 'MA3'
}

export interface AlarmConfig {
  enabled: boolean;
  selectedHours: string[]; // e.g., ["15:00", "16:00"] (최대 2개)
  // mode와 repeatCount는 제거됨 (간소화)
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
