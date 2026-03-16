import type { AppLang } from '../types';
import type { VrBandStrategyParams } from '../types';

/** VR 타입 배지 모드. VrBandStrategyParams에서 추출. */
export type VrMode = VrBandStrategyParams['vrMode'];

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
    tabSell: '상단 매도 주문',
    tabBuy: '하단 매수 주문',
    step: '단계',
    price: '주문가($)',
    qty: '수량',
    sharesAfter: '체결 후 주수',
    poolAfter: '체결 후 Pool',
    currentState: '현재 상태',
    guide: '가이드',
    emptyOrder: '해당 탭에 예약 주문 내역이 없습니다.',
  },
  en: {
    title: 'VR Limit Orders',
    tabSell: 'Sell (Band Top)',
    tabBuy: 'Buy (Band Bottom)',
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
      'text-[9px] font-bold px-2 py-0.5 rounded-md text-slate-600 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-500/20',
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

/** 대시보드 VR 전략 안내 힌트 (단일 소스) */
export const VR_DASHBOARD_HINT: Record<AppLang, { ready: string; pending: string }> = {
  ko: {
    ready: 'VR 밴드 룰에 따라 예약 주문표를 참고하여 매매하세요.',
    pending: 'VR 밴드 전략 초기화 대기 중...',
  },
  en: {
    ready: 'Follow the VR Band rules using the reservation order table.',
    pending: 'Waiting for VR band strategy initialization...',
  },
};
