import type { AppLang } from '@/types';

export interface CommonMessageSet {
  save: string;
  processing: string;
  close: string;
  closeDialog: string;
  acknowledge: string;
  notice: string;
  portfolioName: string;
  dailyBuyAmount: string;
  feeRatePercent: string;
  shortMaPeriod: string;
  longMaPeriod: string;
  periodicWithdrawal: string;
  createStrategy: string;
  setupDescription: string;
  saveAriaLabel: string;
  namePlaceholder: string;
  saveFailed: string;
  validationNameRequired: string;
  validationNameLength: string;
  validationDailyBuy: string;
  validationFeeRate: string;
  validationMaPeriod: string;
  validationWithdrawalNonFinite: string;
  validationWithdrawalNegative: string;
  validationWithdrawalTooLarge: string;
  legalDisclaimerMinimal: string;
  legalDisclaimerStandard: string;
  legalDisclaimerAccent: string;
}

export type CommonMessageKey = keyof CommonMessageSet;

export const COMMON_MESSAGES: Record<AppLang, CommonMessageSet> = {
  ko: {
    save: '저장하기',
    processing: '처리 중…',
    close: '닫기',
    closeDialog: '대화상자 닫기',
    acknowledge: '확인',
    notice: '안내',
    portfolioName: '포트폴리오 이름',
    dailyBuyAmount: '일매수 금액',
    feeRatePercent: '수수료율(%)',
    shortMaPeriod: '단기 이평 기간',
    longMaPeriod: '장기 이평 기간',
    periodicWithdrawal: '주기별 인출금',
    createStrategy: '전략 생성',
    setupDescription: '이평선 구간 전략의 기본값을 설정합니다.',
    saveAriaLabel: '전략 저장',
    namePlaceholder: '예: 나스닥 적립식',
    saveFailed: '저장 중 오류가 발생했습니다.',
    validationNameRequired: '포트폴리오 이름을 입력해 주세요.',
    validationNameLength: '포트폴리오 이름은 100자 이내여야 합니다.',
    validationDailyBuy:
      '매일 매수 금액은 1 이상 1,000,000 이하여야 합니다.',
    validationFeeRate: '수수료율은 0% 이상 10% 이하여야 합니다.',
    validationMaPeriod:
      '단기·장기 이평 기간은 1 이상 250 이하의 유효한 숫자여야 합니다.',
    validationWithdrawalNonFinite: '인출 금액은 유효한 숫자여야 합니다.',
    validationWithdrawalNegative:
      '인출 금액은 0 이상만 입력할 수 있습니다. 음수는 입력할 수 없습니다.',
    validationWithdrawalTooLarge:
      '인출 금액은 $1,000,000 이하여야 합니다.',
    legalDisclaimerMinimal:
      '본 서비스 정보는 참고용이며 투자 권유가 아닙니다.',
    legalDisclaimerStandard:
      '본 서비스는 투자 참고용 정보만 제공하며, 투자 판단과 책임은 이용자에게 있습니다.',
    legalDisclaimerAccent:
      '진행 전에 본 서비스가 투자 권유가 아닌 참고용 정보임을 확인해 주세요.',
  },
  en: {
    save: 'Save',
    processing: 'Processing…',
    close: 'Close',
    closeDialog: 'Close dialog',
    acknowledge: 'OK',
    notice: 'Notice',
    portfolioName: 'Portfolio Name',
    dailyBuyAmount: 'Daily Buy Amount',
    feeRatePercent: 'Fee Rate (%)',
    shortMaPeriod: 'Short MA Period',
    longMaPeriod: 'Long MA Period',
    periodicWithdrawal: 'Periodic Withdrawal',
    createStrategy: 'Create Strategy',
    setupDescription:
      'Configure defaults for the moving-average interval strategy.',
    saveAriaLabel: 'Save strategy',
    namePlaceholder: 'e.g. Nasdaq accumulation',
    saveFailed: 'Failed to save.',
    validationNameRequired: 'Please enter a portfolio name.',
    validationNameLength: 'Portfolio name must be 100 characters or less.',
    validationDailyBuy:
      'Daily buy amount must be between 1 and 1,000,000.',
    validationFeeRate: 'Fee rate must be between 0% and 10%.',
    validationMaPeriod:
      'Short and long MA periods must be valid numbers between 1 and 250.',
    validationWithdrawalNonFinite:
      'Withdrawal amount must be a valid number.',
    validationWithdrawalNegative:
      'Withdrawal amount must be zero or greater. Negative values are not allowed.',
    validationWithdrawalTooLarge:
      'Withdrawal amount must be $1,000,000 or less.',
    legalDisclaimerMinimal:
      'This service provides information for reference only and is not investment advice.',
    legalDisclaimerStandard:
      'This service provides reference information only; all investment decisions and responsibility remain with the user.',
    legalDisclaimerAccent:
      'Before proceeding, please confirm this service is for reference only and not investment advice.',
  },
};

export function getCommonMessages(lang: AppLang): CommonMessageSet {
  return COMMON_MESSAGES[lang];
}