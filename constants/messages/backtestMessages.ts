import type { AppLang } from '@/types';

export interface BacktestMessageSet {
  dailyLimitReached: string;
  usageVerificationFailed: string;
  startRun: string;
  backToStrategy: string;
  backtestUnavailableTitle: string;
  stockSelectionHeader: string;
  lowLocBudgetRatioLabel: string;
  highLocPremiumLabel: string;
  highLocPremiumHint: string;
  takeProfitLabel: string;
  takeProfitHint: string;
}

export const BACKTEST_MESSAGES: Record<AppLang, BacktestMessageSet> = {
  ko: {
    dailyLimitReached:
      '일일 백테스트 한도에 도달했습니다. 내일 다시 시도하거나 멤버십을 업그레이드하세요.',
    usageVerificationFailed: '사용량 확인 중 오류가 발생했습니다.',
    startRun: '백테스트 실행',
    backToStrategy: '전략 선택으로',
    backtestUnavailableTitle: '백테스트 실행 불가',
    stockSelectionHeader: '종목 선택',
    lowLocBudgetRatioLabel: '저가(평단가) LOC 예산 비율 (%)',
    highLocPremiumLabel: '고가 LOC 프리미엄 (%)',
    highLocPremiumHint:
      '현재가 대비 +X% 가격에 LOC 주문을 겁니다. (매일 체결 보장용)',
    takeProfitLabel: '익절 목표 수익률 (%)',
    takeProfitHint: '평단 대비 +Y%에서 전량 지정가 매도합니다.',
  },
  en: {
    dailyLimitReached:
      'Daily backtest limit reached. Try again tomorrow or upgrade your membership.',
    usageVerificationFailed: 'An error occurred while verifying usage.',
    startRun: 'Run Backtest',
    backToStrategy: 'Back to strategy',
    backtestUnavailableTitle: 'Backtest could not run',
    stockSelectionHeader: 'Select Stock',
    lowLocBudgetRatioLabel: 'Low LOC Budget Ratio (%)',
    highLocPremiumLabel: 'High LOC Premium (%)',
    highLocPremiumHint:
      'Places LOC at current price +X% (for daily fill).',
    takeProfitLabel: 'Take Profit (%)',
    takeProfitHint: 'Sell full position at avg price +Y%.',
  },
};
