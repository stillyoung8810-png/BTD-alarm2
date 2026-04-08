import type { Portfolio } from '../types';
import { supabase } from './supabase';
import { normalizePortfolioData } from '../utils/portfolioNormalize';
import {
  createServiceError,
  failResult,
  normalizeErrorMessage,
  okResult,
  type ServiceResult,
} from './serviceUtils';

const PORTFOLIOS_CACHE_KEY = 'my_portfolios';
export const PORTFOLIO_FETCH_TIMEOUT_MS = 10_000;
const EMPTY_PORTFOLIOS: Portfolio[] = [];
const PORTFOLIO_SELECT_FIELDS =
  'id, created_at, name, daily_buy_amount, start_date, fee_rate, is_closed, closed_at, final_sell_amount, trades, strategy, alarm_config, is_quarter_mode, user_id, vr_snapshot';

function buildPortfolioCacheKey(userId: string): string {
  return `${PORTFOLIOS_CACHE_KEY}_${userId}`;
}

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === 'AbortError') {
    return true;
  }

  return error.message.toLowerCase().includes('aborted');
}

function createPortfolioQueryServiceError(
  error: unknown,
  fallbackMessage: string,
  userId: string,
) {
  const isAbortError = isAbortLikeError(error);

  return createServiceError(
    isAbortError ? 'TIMEOUT' : 'NETWORK',
    normalizeErrorMessage(error, fallbackMessage),
    {
      retryable: true,
      cause: error,
      context: { userId },
    },
  );
}

function writePortfolioCacheSafe(userId: string, rawData: unknown[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(buildPortfolioCacheKey(userId), JSON.stringify(rawData));
  } catch {
    // 캐시 실패는 원격 성공을 무효화하지 않습니다.
  }
}

export function readPortfolioCacheSafe(userId: string): ServiceResult<Portfolio[]> {
  const safeUserId = userId.trim();
  if (safeUserId.length === 0) {
    return failResult(
      EMPTY_PORTFOLIOS,
      createServiceError('INVALID_INPUT', 'portfolio_cache_user_id_required', {
        context: { userId: safeUserId },
      }),
      { userId: safeUserId },
    );
  }

  if (typeof window === 'undefined') {
    return failResult(
      EMPTY_PORTFOLIOS,
      createServiceError('UNSUPPORTED_ENV', 'portfolio_cache_unavailable', {
        context: { userId: safeUserId },
      }),
      { userId: safeUserId },
    );
  }

  try {
    const cachedData = localStorage.getItem(buildPortfolioCacheKey(safeUserId));
    if (cachedData == null) {
      return failResult(
        EMPTY_PORTFOLIOS,
        createServiceError('NOT_FOUND', 'portfolio_cache_miss', {
          context: { userId: safeUserId },
        }),
        { userId: safeUserId },
      );
    }

    const parsedData: unknown = JSON.parse(cachedData);
    if (!Array.isArray(parsedData)) {
      return failResult(
        EMPTY_PORTFOLIOS,
        createServiceError('INVALID_RESPONSE', 'portfolio_cache_invalid_shape', {
          context: { userId: safeUserId },
        }),
        { userId: safeUserId },
      );
    }

    return okResult(normalizePortfolioData(parsedData), {
      userId: safeUserId,
      source: 'cache',
    });
  } catch (error: unknown) {
    return failResult(
      EMPTY_PORTFOLIOS,
      createPortfolioQueryServiceError(
        error,
        'portfolio_cache_read_failed',
        safeUserId,
      ),
      { userId: safeUserId, source: 'cache' },
    );
  }
}

export async function fetchPortfoliosByUserSafe(
  userId: string,
  signal?: AbortSignal,
): Promise<ServiceResult<Portfolio[]>> {
  const safeUserId = userId.trim();
  if (safeUserId.length === 0) {
    return failResult(
      EMPTY_PORTFOLIOS,
      createServiceError('INVALID_INPUT', 'portfolio_user_id_required', {
        context: { userId: safeUserId },
      }),
      { userId: safeUserId },
    );
  }

  try {
    const baseQuery = supabase
      .from('portfolios')
      .select(PORTFOLIO_SELECT_FIELDS)
      .eq('user_id', safeUserId)
      .order('created_at', { ascending: false });

    const { data, error } = signal
      ? await baseQuery.abortSignal(signal)
      : await baseQuery;

    if (error != null) {
      return failResult(
        EMPTY_PORTFOLIOS,
        createPortfolioQueryServiceError(
          error,
          'portfolio_remote_fetch_failed',
          safeUserId,
        ),
        { userId: safeUserId, source: 'remote' },
      );
    }

    if (!Array.isArray(data)) {
      return failResult(
        EMPTY_PORTFOLIOS,
        createServiceError('INVALID_RESPONSE', 'portfolio_remote_invalid_shape', {
          context: { userId: safeUserId },
        }),
        { userId: safeUserId, source: 'remote' },
      );
    }

    writePortfolioCacheSafe(safeUserId, data);
    return okResult(normalizePortfolioData(data), {
      userId: safeUserId,
      source: 'remote',
    });
  } catch (error: unknown) {
    return failResult(
      EMPTY_PORTFOLIOS,
      createPortfolioQueryServiceError(
        error,
        'portfolio_remote_fetch_failed',
        safeUserId,
      ),
      { userId: safeUserId, source: 'remote' },
    );
  }
}
