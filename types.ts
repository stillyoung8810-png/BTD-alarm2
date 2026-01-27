
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
  };
  ma1: {
    period: number;
    stock: string;
    rsiThreshold?: number;
  };
  ma2: {
    period1: number;
    period2: number;
    stock: string;
    splitCount: number;
    rsiThreshold?: number;
  };
  ma3: {
    period: number;
    stock: string;
    rsiThreshold?: number;
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
