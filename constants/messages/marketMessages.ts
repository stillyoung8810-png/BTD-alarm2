import type { AppLang } from '@/types';
import { ALL_STOCKS } from '@/constants';

export interface MarketMessageSet {
  defaultTickers: readonly string[];
  chartLoading: string;
  chartEmpty: string;
  sectionTitle: string;
  scrollLeftAria: string;
  scrollRightAria: string;
  selectedLabel: string;
  priceLabel: string;
  paidOnlyLabel: string;
  bondNoticeTitle: string;
  bondNoticeBadge: string;
  rsiLabel: string;
  bondInfoOnly: string;
  stockInfoHeader: string;
  holdingsOnlyToggle: string;
  oneXOnlyToggle: string;
  holdingsEmpty: string;
}

const MARKET_MESSAGES: Record<AppLang, MarketMessageSet> = {
  ko: {
    defaultTickers: ALL_STOCKS,
    chartLoading: '차트 데이터 로딩 중...',
    chartEmpty: '차트 데이터 없음',
    sectionTitle: '종목 정보',
    scrollLeftAria: '왼쪽으로 스크롤',
    scrollRightAria: '오른쪽으로 스크롤',
    selectedLabel: '선택됨',
    priceLabel: '가격',
    paidOnlyLabel: 'PRO/PREMIUM 전용',
    bondNoticeTitle:
      '해당 종목은 초단기/채권형 ETF로, 가격 변동폭이 작아 RSI 지표의 신뢰도가 낮을 수 있습니다.',
    bondNoticeBadge: '주의',
    rsiLabel: 'RSI (14)',
    bondInfoOnly: '참고용',
    stockInfoHeader: '종목 정보',
    holdingsOnlyToggle: '보유 종목만 보기',
    oneXOnlyToggle: '1배수만 보기',
    holdingsEmpty: '보유 중인 종목이 없습니다.',
  },
  en: {
    defaultTickers: ALL_STOCKS,
    chartLoading: 'Loading chart data...',
    chartEmpty: 'No chart data',
    sectionTitle: 'Stock info',
    scrollLeftAria: 'Scroll left',
    scrollRightAria: 'Scroll right',
    selectedLabel: 'Selected',
    priceLabel: 'Price',
    paidOnlyLabel: 'PRO/PREMIUM only',
    bondNoticeTitle:
      'This is a short-duration/bond ETF; very small price moves can make RSI less reliable.',
    bondNoticeBadge: 'Info',
    rsiLabel: 'RSI (14)',
    bondInfoOnly: 'Info only',
    stockInfoHeader: 'Stock Info',
    holdingsOnlyToggle: 'Holdings only',
    oneXOnlyToggle: '1x only',
    holdingsEmpty: 'No holdings available.',
  },
};

const MARKET_MESSAGE_CACHE = new Map<AppLang, MarketMessageSet>();

export function getMarketMessages(lang: AppLang): MarketMessageSet {
  const cached = MARKET_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = MARKET_MESSAGES[lang];
  MARKET_MESSAGE_CACHE.set(lang, messages);
  return messages;
}
