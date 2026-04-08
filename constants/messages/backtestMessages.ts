import type { AppLang } from '@/types';

export interface BacktestMessageSet {
  dailyLimitReached: string;
  usageVerificationFailed: string;
  startRun: string;
  processing: string;
  errorRunFailed: string;
  monthsInputAria: string;
  amountInputAria: string;
  backToStrategy: string;
  backtestUnavailableTitle: string;
  stockSelectionHeader: string;
  lowLocBudgetRatioLabel: string;
  highLocPremiumLabel: string;
  highLocPremiumHint: string;
  takeProfitLabel: string;
  takeProfitHint: string;
  benchmarkCompare: string;
  benchmarkCompareUpgrade: string;
  upgradeNow: string;
}

export const BACKTEST_MESSAGES: Record<AppLang, BacktestMessageSet> = {
  ko: {
    dailyLimitReached:
      '일일 백테스트 한도에 도달했습니다. 내일 다시 시도하거나 멤버십을 업그레이드하세요.',
    usageVerificationFailed: '사용량 확인 중 오류가 발생했습니다.',
    startRun: '백테스트 실행',
    processing: '처리 중…',
    errorRunFailed: '백테스트 실행에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.',
    monthsInputAria: '백테스트 기간(개월)',
    amountInputAria: '백테스트 일회 투자 금액(USD, 양의 정수)',
    backToStrategy: '전략 선택으로',
    backtestUnavailableTitle: '백테스트 실행 불가',
    stockSelectionHeader: '종목 선택',
    lowLocBudgetRatioLabel: '저가(평단가) LOC 예산 비율 (%)',
    highLocPremiumLabel: '고가 LOC 프리미엄 (%)',
    highLocPremiumHint:
      '현재가 대비 +X% 가격에 LOC 주문을 겁니다. (매일 체결 보장용)',
    takeProfitLabel: '익절 목표 수익률 (%)',
    takeProfitHint: '평단 대비 +Y%에서 전량 지정가 매도합니다.',
    benchmarkCompare: '벤치마크 비교 (PRO)',
    benchmarkCompareUpgrade:
      'UPGRADE TO COMPARE WITH S&P 500 & NASDAQ',
    upgradeNow: 'UPGRADE NOW',
  },
  en: {
    dailyLimitReached:
      'Daily backtest limit reached. Try again tomorrow or upgrade your membership.',
    usageVerificationFailed: 'An error occurred while verifying usage.',
    startRun: 'Run Backtest',
    processing: 'Processing…',
    errorRunFailed:
      'Backtest failed. Check your network and try again.',
    monthsInputAria: 'Backtest period (months)',
    amountInputAria:
      'One-time backtest investment amount (USD, positive integer)',
    backToStrategy: 'Back to strategy',
    backtestUnavailableTitle: 'Backtest could not run',
    stockSelectionHeader: 'Select Stock',
    lowLocBudgetRatioLabel: 'Low LOC Budget Ratio (%)',
    highLocPremiumLabel: 'High LOC Premium (%)',
    highLocPremiumHint:
      'Places LOC at current price +X% (for daily fill).',
    takeProfitLabel: 'Take Profit (%)',
    takeProfitHint: 'Sell full position at avg price +Y%.',
    benchmarkCompare: 'Benchmark Compare (PRO)',
    benchmarkCompareUpgrade:
      'UPGRADE TO COMPARE WITH S&P 500 & NASDAQ',
    upgradeNow: 'UPGRADE NOW',
  },
};

const BACKTEST_MESSAGE_CACHE = new Map<AppLang, BacktestMessageSet>();

export function getBacktestMessages(lang: AppLang): BacktestMessageSet {
  const cached = BACKTEST_MESSAGE_CACHE.get(lang);
  if (cached != null) {
    return cached;
  }

  const messages = BACKTEST_MESSAGES[lang];
  BACKTEST_MESSAGE_CACHE.set(lang, messages);
  return messages;
}
