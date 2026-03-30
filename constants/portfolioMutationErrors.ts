import type { AppLang } from '../types';

export const PORTFOLIO_MUTATION_ERROR_CODES = {
  sessionExpired: 'portfolio_session_expired',
  portfolioLimitReached: 'portfolio_limit_reached',
  nameRequired: 'portfolio_name_required',
  nameTooLong: 'portfolio_name_too_long',
  dailyBuyAmountInvalid: 'portfolio_daily_buy_amount_invalid',
  dailyBuyAmountTooLarge: 'portfolio_daily_buy_amount_too_large',
  feeRateInvalid: 'portfolio_fee_rate_invalid',
  startDateInvalid: 'portfolio_start_date_invalid',
  saveFailed: 'portfolio_save_failed',
  closeHistoryFailed: 'portfolio_close_history_failed',
  closeUpdateFailed: 'portfolio_close_update_failed',
  updateNameInvalid: 'portfolio_update_name_invalid',
  updateDailyBuyAmountInvalid: 'portfolio_update_daily_buy_amount_invalid',
  updateFeeRateInvalid: 'portfolio_update_fee_rate_invalid',
  updateFailed: 'portfolio_update_failed',
  targetNotFound: 'portfolio_target_not_found',
  addTradeFailed: 'portfolio_add_trade_failed',
  deleteTradeFailed: 'portfolio_delete_trade_failed',
  deleteFailed: 'portfolio_delete_failed',
  deleteHistoryFailed: 'portfolio_delete_history_failed',
  clearHistoryFailed: 'portfolio_clear_history_failed',
} as const;

export type PortfolioMutationErrorCode =
  (typeof PORTFOLIO_MUTATION_ERROR_CODES)[keyof typeof PORTFOLIO_MUTATION_ERROR_CODES];

type PortfolioMutationErrorWithCause = Error & {
  cause?: unknown;
};

type PortfolioLimitCause = {
  maxPortfolios: number;
  effectiveTier: string;
};

export interface PortfolioMutationNotice {
  title: string;
  body: string;
}

const PORTFOLIO_NOTICE_TITLE: Record<AppLang, string> = {
  ko: '포트폴리오 안내',
  en: 'Portfolio Notice',
};

function getTierLabel(lang: AppLang, effectiveTier: string): string {
  if (effectiveTier === 'free') {
    return lang === 'ko' ? '무료' : 'free';
  }

  return effectiveTier;
}

function isPortfolioLimitCause(value: unknown): value is PortfolioLimitCause {
  if (value == null || typeof value !== 'object') {
    return false;
  }

  return 'maxPortfolios' in value && 'effectiveTier' in value;
}

export function isPortfolioMutationErrorCode(
  value: string,
): value is PortfolioMutationErrorCode {
  return Object.values(PORTFOLIO_MUTATION_ERROR_CODES).includes(
    value as PortfolioMutationErrorCode,
  );
}

export function createPortfolioMutationError(
  code: PortfolioMutationErrorCode,
  cause?: unknown,
): Error {
  if (cause === undefined) {
    return new Error(code);
  }

  return new Error(code, { cause });
}

export function getPortfolioMutationNotice(
  lang: AppLang,
  error: unknown,
): PortfolioMutationNotice {
  const fallbackNotice: PortfolioMutationNotice =
    lang === 'ko'
      ? {
          title: PORTFOLIO_NOTICE_TITLE.ko,
          body: '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        }
      : {
          title: PORTFOLIO_NOTICE_TITLE.en,
          body: 'Something went wrong. Please try again in a moment.',
        };

  if (!(error instanceof Error) || !isPortfolioMutationErrorCode(error.message)) {
    return fallbackNotice;
  }

  const typedError = error as PortfolioMutationErrorWithCause;
  const title = PORTFOLIO_NOTICE_TITLE[lang];

  switch (typedError.message) {
    case PORTFOLIO_MUTATION_ERROR_CODES.sessionExpired:
      return lang === 'ko'
        ? {
            title,
            body: '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.',
          }
        : {
            title,
            body: 'Your session expired. Please sign in again.',
          };
    case PORTFOLIO_MUTATION_ERROR_CODES.portfolioLimitReached: {
      if (isPortfolioLimitCause(typedError.cause)) {
        const tierLabel = getTierLabel(lang, typedError.cause.effectiveTier);
        return lang === 'ko'
          ? {
              title,
              body: `${tierLabel} 플랜에서는 최대 ${typedError.cause.maxPortfolios}개의 포트폴리오만 생성할 수 있습니다.`,
            }
          : {
              title,
              body: `You can only create up to ${typedError.cause.maxPortfolios} portfolios on the ${tierLabel} plan.`,
            };
      }

      return lang === 'ko'
        ? {
            title,
            body: '포트폴리오 생성 한도에 도달했습니다.',
          }
        : {
            title,
            body: 'You have reached the portfolio creation limit.',
          };
    }
    case PORTFOLIO_MUTATION_ERROR_CODES.nameRequired:
      return lang === 'ko'
        ? { title, body: '포트폴리오 이름을 입력해 주세요.' }
        : { title, body: 'Please enter a portfolio name.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.nameTooLong:
      return lang === 'ko'
        ? { title, body: '포트폴리오 이름은 100자 이내여야 합니다.' }
        : { title, body: 'Portfolio name must be 100 characters or less.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.dailyBuyAmountInvalid:
      return lang === 'ko'
        ? { title, body: '매일 매수 금액은 0보다 큰 값이어야 합니다.' }
        : { title, body: 'Daily buy amount must be greater than 0.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.dailyBuyAmountTooLarge:
      return lang === 'ko'
        ? { title, body: '매일 매수 금액은 $1,000,000 이하여야 합니다.' }
        : { title, body: 'Daily buy amount must be $1,000,000 or less.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.feeRateInvalid:
      return lang === 'ko'
        ? { title, body: '수수료율은 0% ~ 10% 사이여야 합니다.' }
        : { title, body: 'Fee rate must be between 0% and 10%.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.startDateInvalid:
      return lang === 'ko'
        ? { title, body: '시작일을 올바른 형식(YYYY-MM-DD)으로 입력해 주세요.' }
        : { title, body: 'Please enter a valid start date (YYYY-MM-DD).' };
    case PORTFOLIO_MUTATION_ERROR_CODES.saveFailed:
      return lang === 'ko'
        ? { title, body: '포트폴리오 저장에 실패했습니다.' }
        : { title, body: 'Failed to save the portfolio.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.closeHistoryFailed:
      return lang === 'ko'
        ? {
            title,
            body: '이력 저장에 실패하여 포트폴리오를 종료하지 않았습니다. 다시 시도해 주세요.',
          }
        : {
            title,
            body: 'Failed to save portfolio history. Please try again.',
          };
    case PORTFOLIO_MUTATION_ERROR_CODES.closeUpdateFailed:
      return lang === 'ko'
        ? { title, body: '전략 종료 저장에 실패했습니다.' }
        : { title, body: 'Failed to save termination.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.updateNameInvalid:
      return lang === 'ko'
        ? { title, body: '포트폴리오 이름은 1~100자여야 합니다.' }
        : { title, body: 'Portfolio name must be 1-100 characters.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.updateDailyBuyAmountInvalid:
      return lang === 'ko'
        ? {
            title,
            body: '매일 매수 금액은 $0 초과 ~ $1,000,000 이하여야 합니다.',
          }
        : {
            title,
            body: 'Daily buy amount must be between $0 and $1,000,000.',
          };
    case PORTFOLIO_MUTATION_ERROR_CODES.updateFeeRateInvalid:
      return lang === 'ko'
        ? { title, body: '수수료율은 0% ~ 10% 사이여야 합니다.' }
        : { title, body: 'Fee rate must be between 0% and 10%.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.updateFailed:
      return lang === 'ko'
        ? { title, body: '포트폴리오 업데이트에 실패했습니다.' }
        : { title, body: 'Failed to update the portfolio.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.targetNotFound:
      return lang === 'ko'
        ? { title, body: '대상 포트폴리오를 찾을 수 없습니다.' }
        : { title, body: 'The target portfolio could not be found.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.addTradeFailed:
      return lang === 'ko'
        ? { title, body: '거래 추가에 실패했습니다.' }
        : { title, body: 'Failed to add the trade.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.deleteTradeFailed:
      return lang === 'ko'
        ? { title, body: '거래 삭제에 실패했습니다.' }
        : { title, body: 'Failed to delete the trade.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.deleteFailed:
      return lang === 'ko'
        ? { title, body: '포트폴리오 삭제에 실패했습니다.' }
        : { title, body: 'Failed to delete the portfolio.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.deleteHistoryFailed:
      return lang === 'ko'
        ? { title, body: '종료 내역 삭제에 실패했습니다.' }
        : { title, body: 'Failed to delete history.' };
    case PORTFOLIO_MUTATION_ERROR_CODES.clearHistoryFailed:
      return lang === 'ko'
        ? { title, body: '종료 내역 전체 삭제에 실패했습니다.' }
        : { title, body: 'Failed to clear history.' };
    default:
      return fallbackNotice;
  }
}
