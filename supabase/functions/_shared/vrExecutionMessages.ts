import { getStrategyName, type Lang } from './strategyNames.ts';

export type { Lang };

export type VrExecutionMode = 'lump_sum' | 'accumulate' | 'withdraw';

export interface VrExecutionMessageMap {
  strategyName: string;
  alarmTimes: string;
  targetValue: string;
  pool: string;
  band: string;
  noOrder: string;
  readyHint: string;
  pendingHint: string;
  modeLabel: Record<VrExecutionMode, string>;
  cyclePeriod: (cycleIndex: number, start: string, end: string) => string;
  maxBuyHint: (step: number) => string;
}

const VR_EXECUTION_MESSAGES: Record<Lang, Omit<VrExecutionMessageMap, 'strategyName'>> = {
  ko: {
    alarmTimes: '알람 시간',
    targetValue: 'T (목표 밸류)',
    pool: 'Pool (가상 금고)',
    band: '밴드',
    noOrder: '대기 중인 주문 없음',
    readyHint: 'TVC 전략 룰에 따라 예약 주문표를 참고하여 매매하세요.',
    pendingHint:
      'TVC 전략 데이터를 계산하는 중입니다. 첫 매수를 T값 안에서 진행해 주세요.',
    modeLabel: {
      lump_sum: '거치식',
      accumulate: '적립식',
      withdraw: '인출식',
    },
    cyclePeriod: (cycleIndex, start, end) => `#${cycleIndex}: ${start} ~ ${end}`,
    maxBuyHint: (step) => `예약 매수는 표의 ${step}번까지 주문하세요`,
  },
  en: {
    alarmTimes: 'Alarm times',
    targetValue: 'T (Target Value)',
    pool: 'Pool',
    band: 'Band',
    noOrder: 'No pending orders',
    readyHint: 'Follow the TVC strategy rules using the reservation order table.',
    pendingHint:
      'Calculating TVC strategy data. Please execute your first buy within the T value.',
    modeLabel: {
      lump_sum: 'Lump sum',
      accumulate: 'Accumulate',
      withdraw: 'Withdraw',
    },
    cyclePeriod: (cycleIndex, start, end) =>
      `Cycle ${cycleIndex}: ${start} to ${end}`,
    maxBuyHint: (step) => `Place reserve buy orders up to row ${step}.`,
  },
};

export function getVrExecutionMessages(lang: Lang): VrExecutionMessageMap {
  const messages = VR_EXECUTION_MESSAGES[lang] ?? VR_EXECUTION_MESSAGES.ko;
  return {
    strategyName: getStrategyName(lang, 'vr_band'),
    ...messages,
  };
}
