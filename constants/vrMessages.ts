import type { AppLang } from '../types';
import type { VrBandStrategyParams } from '../types';

/** VR 타입 배지 모드. VrBandStrategyParams에서 추출. */
export type VrMode = VrBandStrategyParams['vrMode'];

/** VR 운용 방식 — 폼에서 as 없이 순회용 SSOT */
export const VR_MODE_KEYS: readonly VrMode[] = ['lump_sum', 'accumulate', 'withdraw'];

/** VR 예약 주문 모달 — 탭/테이블 라벨 (단일 소스) */
export const VR_MODAL_LABELS: Record<
  AppLang,
  {
    title: string;
    tabSell: string;
    tabBuy: string;
    step: string;
    price: string;
    qty: string;
    sharesAfter: string;
    poolAfter: string;
    currentState: string;
    guide: string;
    emptyOrder: string;
  }
> = {
  ko: {
    title: 'VR 예약 주문',
    tabSell: '매도 주문',
    tabBuy: '매수 주문',
    step: '단계',
    price: '가격 ($)',
    qty: '수량',
    sharesAfter: '보유량',
    poolAfter: 'Pool',
    currentState: '현재',
    guide: '가이드',
    emptyOrder: '해당 탭에 예약 주문 내역이 없습니다.',
  },
  en: {
    title: 'VR Limit Orders',
    tabSell: 'Sell Orders',
    tabBuy: 'Buy Orders',
    step: 'Step',
    price: 'Price ($)',
    qty: 'Qty',
    sharesAfter: 'Shares After',
    poolAfter: 'Pool After',
    currentState: 'Current State',
    guide: 'Guide',
    emptyOrder: 'No reservation orders in this tab.',
  },
};

/** VR 요약 Fallback 메시지 (에러/대기) */
export const VR_FALLBACK: Record<AppLang, { error: string; pending: string }> = {
  ko: {
    error: '전략 데이터 생성에 실패했거나 동기화 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    pending: '로봇이 전략 데이터를 계산 중입니다...',
  },
  en: {
    error: 'Strategy data failed to load or sync error occurred. Please try again later.',
    pending: 'Calculating strategy data...',
  },
};

/** VR 요약 — 버튼·힌트 문구. maxBuyHint는 {{n}}을 N으로 치환하여 사용. */
export const VR_SUMMARY: Record<AppLang, { viewOrderTable: string; maxBuyHint: (n: number) => string }> = {
  ko: {
    viewOrderTable: '예약 주문 가격표 보기',
    maxBuyHint: (n) => `예약 매수는 표의 ${n}번까지 주문하세요`,
  },
  en: {
    viewOrderTable: 'View Reservation Order Table',
    maxBuyHint: (n) => `Place reserve buy orders up to row ${n}.`,
  },
};

/** VR 타입 배지 — 텍스트·스타일 (단일 소스) */
export const VR_BADGE_CONFIG: Record<
  VrMode,
  { textKo: string; textEn: string; classes: string }
> = {
  lump_sum: {
    textKo: '거치식',
    textEn: 'Lump Sum',
    classes:
      'text-[9px] font-bold px-2 py-0.5 rounded-md text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30',
  },
  accumulate: {
    textKo: '적립식',
    textEn: 'Accumulate',
    classes:
      'text-[9px] font-bold px-2 py-0.5 rounded-md text-emerald-600 dark:text-emerald-400 bg-emerald-100/50 dark:bg-emerald-500/20',
  },
  withdraw: {
    textKo: '인출식',
    textEn: 'Withdraw',
    classes:
      'text-[9px] font-bold px-2 py-0.5 rounded-md text-amber-500 dark:text-amber-300 bg-amber-200/50 dark:bg-amber-500/25',
  },
};

/** VR 모달 탭 아이콘 (하드코딩 제거) */
export const VR_TAB_ICONS: Record<'sell' | 'buy', string> = {
  sell: '🔴 ',
  buy: '🔵 ',
};

/** VR 전략 생성 폼 라벨 (단일 소스) */
export const VR_CREATOR_LABELS: Record<
  AppLang,
  {
    strategyTitle: string;
    strategyDesc: string;
    sectionTitle: string;
    modeLabel: string;
    modes: {
      lump_sum: string;
      accumulate: string;
      withdraw: string;
    };
    initialCapital: string;
    initialV: string;
    bandUpper: string;
    bandLower: string;
    minOrderQty: string;
    G: string;
    poolUsage: string;
    deltaCash: string;
    /** 리밸런싱 주기(주) 선택 라벨 */
    cycleWeeks: string;
    feeRate: string;
    portfolioName: string;
    startDate: string;
    submit: string;
    next: string;
    back: string;
  }
> = {
  ko: {
    strategyTitle: '타겟 밸류 채널',
    strategyDesc:
      '성장하는 목표 채널(Channel)을 설정하고, 주가가 채널을 벗어날 때마다 자동으로 비중을 조절해 안정성을 높입니다.',
    sectionTitle: '타겟 밸류 채널 설정',
    modeLabel: '운용 방식 선택',
    modes: {
      lump_sum: '거치식',
      accumulate: '적립식 (매 사이클 적립금 추가)',
      withdraw: '인출식 (매 사이클 인출금 제외)',
    },
    initialCapital: '초기 투자 원금 ($)',
    initialV: '초기 V 값 ($)',
    bandUpper: '상단 밴드 폭 (%)',
    bandLower: '하단 밴드 폭 (%)',
    minOrderQty: '최소 주문 수량 (주)',
    G: 'G (풀-밴드 비율 계수)',
    poolUsage: '매수 시 Pool 사용 비율 (%)',
    deltaCash: '주기별 입·출금 금액 ($)',
    cycleWeeks: '리밸런싱 주기 (주)',
    feeRate: '수수료율 (%)',
    portfolioName: '포트폴리오 이름',
    startDate: '시작일',
    submit: 'VR 전략 시작',
    next: '다음',
    back: '이전',
  },
  en: {
    strategyTitle: 'Target Value Channel',
    strategyDesc:
      'Set a growing target channel and automatically adjust your position when the price deviates, enhancing stability.',
    sectionTitle: 'Target Value Channel Settings',
    modeLabel: 'Select Operation Mode',
    modes: {
      lump_sum: 'Lump-sum',
      accumulate: 'Accumulate (Add funds per cycle)',
      withdraw: 'Withdraw (Take out per cycle)',
    },
    initialCapital: 'Initial Capital ($)',
    initialV: 'Initial V ($)',
    bandUpper: 'Upper Band Width (%)',
    bandLower: 'Lower Band Width (%)',
    minOrderQty: 'Minimum Order Quantity (shares)',
    G: 'G (Pool-to-band ratio)',
    poolUsage: 'Pool Usage on Buy (%)',
    deltaCash: 'Periodic Cash In/Out ($)',
    cycleWeeks: 'Rebalancing cycle (weeks)',
    feeRate: 'Fee Rate (%)',
    portfolioName: 'Portfolio Name',
    startDate: 'Start Date',
    submit: 'Start VR Strategy',
    next: 'Next',
    back: 'Back',
  },
};

/** 대시보드 VR 전략 안내 힌트 (단일 소스) */
export const VR_DASHBOARD_HINT: Record<
  AppLang,
  { ready: string; pending: string; firstBuyPrompt: string; soldOutWaiting: string }
> = {
  ko: {
    ready: 'VR 밴드 룰에 따라 예약 주문표를 참고하여 매매하세요.',
    pending: '아직 첫 매매를 진행하지 않았습니다. 설정된 V값에 맞춰 첫 매수를 진행해 주세요.',
    firstBuyPrompt: '설정된 V값에 맞춰 첫 매수를 진행해 주세요.',
    soldOutWaiting: '전량 매도 상태, 다음 진입 시점 대기.',
  },
  en: {
    ready: 'Follow the VR Band rules using the reservation order table.',
    pending: 'No trades have been executed yet. Please place your first buy according to the configured V value.',
    firstBuyPrompt: 'Please place your first buy according to the configured V value.',
    soldOutWaiting: 'Completely sold out, waiting for the next entry.',
  },
};
