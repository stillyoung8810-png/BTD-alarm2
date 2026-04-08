import type { AlarmConfig, Portfolio, Trade, VrSnapshot } from '../types';
import { supabase } from './supabase';
import { normalizePortfolioData } from '../utils/portfolioNormalize';
import {
  createServiceError,
  failResult,
  normalizeErrorMessage,
  okResult,
  type ServiceResult,
} from './serviceUtils';

interface PersistPortfolioTradeMutationInput {
  portfolioId: string;
  trades: Trade[];
  vrSnapshot?: VrSnapshot;
  isQuarterMode: boolean;
}

interface PersistPortfolioClosureInput {
  userId: string;
  portfolioId: string;
  historyPayload: {
    portfolio_id: string;
    user_id: string;
    portfolio_name: string;
    total_invested: number;
    total_return: number;
    total_profit: number;
    yield_rate: number;
    start_date: string;
    end_date: string;
    strategy_detail: {
      strategy: Portfolio['strategy'];
      daily_buy_amount: number;
      fee_rate: number;
      alarmconfig?: AlarmConfig;
    };
  };
  portfolioUpdate: {
    is_closed: boolean;
    closed_at: string;
    final_sell_amount: number;
    trades: Trade[];
  };
}

interface DeletePortfolioScope {
  userId: string;
  portfolioId: string;
}

interface PortfolioRecordPayload {
  name: string;
  daily_buy_amount: number;
  start_date: string;
  fee_rate: number;
  strategy: Portfolio['strategy'];
  trades: Trade[];
  is_closed: boolean;
  closed_at: string | null;
  final_sell_amount: number | null;
  alarm_config: AlarmConfig | null;
  is_quarter_mode: boolean;
  vr_snapshot: VrSnapshot | null;
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

function createPortfolioMutationServiceError(
  error: unknown,
  fallbackMessage: string,
  context: Record<string, string | number | boolean>,
) {
  const isAbortError = isAbortLikeError(error);

  return createServiceError(
    isAbortError ? 'TIMEOUT' : 'NETWORK',
    normalizeErrorMessage(error, fallbackMessage),
    {
      retryable: !isAbortError,
      cause: error,
      context,
    },
  );
}

export async function insertPortfolioSafe(
  payload: PortfolioRecordPayload & { id: string; user_id: string },
): Promise<ServiceResult<Portfolio[]>> {
  try {
    const { data, error } = await supabase
      .from('portfolios')
      .insert([payload])
      .select();

    if (error != null) {
      return failResult(
        [],
        createPortfolioMutationServiceError(error, 'portfolio_insert_failed', {
          portfolioId: payload.id,
          userId: payload.user_id,
        }),
        { portfolioId: payload.id, userId: payload.user_id },
      );
    }

    if (!Array.isArray(data)) {
      return failResult(
        [],
        createServiceError('INVALID_RESPONSE', 'portfolio_insert_invalid_shape', {
          context: { portfolioId: payload.id, userId: payload.user_id },
        }),
        { portfolioId: payload.id, userId: payload.user_id },
      );
    }

    return okResult(normalizePortfolioData(data), {
      portfolioId: payload.id,
      userId: payload.user_id,
    });
  } catch (error: unknown) {
    return failResult(
      [],
      createPortfolioMutationServiceError(error, 'portfolio_insert_failed', {
        portfolioId: payload.id,
        userId: payload.user_id,
      }),
      { portfolioId: payload.id, userId: payload.user_id },
    );
  }
}

export async function updatePortfolioSafe(
  portfolioId: string,
  payload: PortfolioRecordPayload,
): Promise<ServiceResult<null>> {
  try {
    const { error } = await supabase
      .from('portfolios')
      .update(payload)
      .eq('id', portfolioId);

    if (error != null) {
      return failResult(
        null,
        createPortfolioMutationServiceError(error, 'portfolio_update_failed', {
          portfolioId,
        }),
        { portfolioId },
      );
    }

    return okResult(null, { portfolioId });
  } catch (error: unknown) {
    return failResult(
      null,
      createPortfolioMutationServiceError(error, 'portfolio_update_failed', {
        portfolioId,
      }),
      { portfolioId },
    );
  }
}

export async function persistPortfolioTradeMutationSafe({
  portfolioId,
  trades,
  vrSnapshot,
  isQuarterMode,
}: PersistPortfolioTradeMutationInput): Promise<ServiceResult<null>> {
  try {
    const { error } = await supabase
      .from('portfolios')
      .update({
        trades,
        vr_snapshot: vrSnapshot ?? null,
        is_quarter_mode: isQuarterMode,
      })
      .eq('id', portfolioId);

    if (error != null) {
      return failResult(
        null,
        createPortfolioMutationServiceError(error, 'portfolio_trade_persist_failed', {
          portfolioId,
        }),
        { portfolioId },
      );
    }

    return okResult(null, { portfolioId });
  } catch (error: unknown) {
    return failResult(
      null,
      createPortfolioMutationServiceError(error, 'portfolio_trade_persist_failed', {
        portfolioId,
      }),
      { portfolioId },
    );
  }
}

export async function deletePortfolioTradeSafe(
  portfolioId: string,
  trades: Trade[],
): Promise<ServiceResult<null>> {
  try {
    const { error } = await supabase
      .from('portfolios')
      .update({ trades })
      .eq('id', portfolioId);

    if (error != null) {
      return failResult(
        null,
        createPortfolioMutationServiceError(error, 'portfolio_trade_delete_failed', {
          portfolioId,
        }),
        { portfolioId },
      );
    }

    return okResult(null, { portfolioId });
  } catch (error: unknown) {
    return failResult(
      null,
      createPortfolioMutationServiceError(error, 'portfolio_trade_delete_failed', {
        portfolioId,
      }),
      { portfolioId },
    );
  }
}

export async function persistPortfolioClosureSafe({
  userId,
  portfolioId,
  historyPayload,
  portfolioUpdate,
}: PersistPortfolioClosureInput): Promise<ServiceResult<null>> {
  try {
    const { error: historyError } = await supabase
      .from('portfolio_history')
      .insert([historyPayload]);

    if (historyError != null) {
      return failResult(
        null,
        createPortfolioMutationServiceError(
          historyError,
          'portfolio_history_insert_failed',
          {
            portfolioId,
            userId,
          },
        ),
        { portfolioId, userId },
      );
    }

    const { error: updateError } = await supabase
      .from('portfolios')
      .update(portfolioUpdate)
      .eq('id', portfolioId);

    if (updateError == null) {
      return okResult(null, { portfolioId, userId });
    }

    await supabase
      .from('portfolio_history')
      .delete()
      .eq('user_id', userId)
      .eq('portfolio_id', portfolioId);

    return failResult(
      null,
      createPortfolioMutationServiceError(
        updateError,
        'portfolio_close_update_failed',
        {
          portfolioId,
          userId,
        },
      ),
      { portfolioId, userId },
    );
  } catch (error: unknown) {
    return failResult(
      null,
      createPortfolioMutationServiceError(error, 'portfolio_close_persist_failed', {
        portfolioId,
        userId,
      }),
      { portfolioId, userId },
    );
  }
}

export async function deletePortfolioByIdSafe({
  userId,
  portfolioId,
}: DeletePortfolioScope): Promise<ServiceResult<null>> {
  try {
    const { error } = await supabase
      .from('portfolios')
      .delete()
      .eq('user_id', userId)
      .eq('id', portfolioId);

    if (error != null) {
      return failResult(
        null,
        createPortfolioMutationServiceError(error, 'portfolio_delete_failed', {
          portfolioId,
          userId,
        }),
        { portfolioId, userId },
      );
    }

    return okResult(null, { portfolioId, userId });
  } catch (error: unknown) {
    return failResult(
      null,
      createPortfolioMutationServiceError(error, 'portfolio_delete_failed', {
        portfolioId,
        userId,
      }),
      { portfolioId, userId },
    );
  }
}

export async function deletePortfolioHistorySafe({
  userId,
  portfolioId,
}: DeletePortfolioScope): Promise<ServiceResult<null>> {
  try {
    const { error: historyError } = await supabase
      .from('portfolio_history')
      .delete()
      .eq('user_id', userId)
      .eq('portfolio_id', portfolioId);
    const { error: portfolioError } = await supabase
      .from('portfolios')
      .delete()
      .eq('user_id', userId)
      .eq('id', portfolioId);

    if (historyError != null || portfolioError != null) {
      return failResult(
        null,
        createPortfolioMutationServiceError(
          historyError ?? portfolioError,
          'portfolio_history_delete_failed',
          {
            portfolioId,
            userId,
          },
        ),
        { portfolioId, userId },
      );
    }

    return okResult(null, { portfolioId, userId });
  } catch (error: unknown) {
    return failResult(
      null,
      createPortfolioMutationServiceError(
        error,
        'portfolio_history_delete_failed',
        {
          portfolioId,
          userId,
        },
      ),
      { portfolioId, userId },
    );
  }
}

export async function clearClosedPortfolioHistorySafe(
  userId: string,
): Promise<ServiceResult<null>> {
  try {
    const { error: historyError } = await supabase
      .from('portfolio_history')
      .delete()
      .eq('user_id', userId);
    const { error: portfolioError } = await supabase
      .from('portfolios')
      .delete()
      .eq('user_id', userId)
      .eq('is_closed', true);

    if (historyError != null || portfolioError != null) {
      return failResult(
        null,
        createPortfolioMutationServiceError(
          historyError ?? portfolioError,
          'portfolio_history_clear_failed',
          { userId },
        ),
        { userId },
      );
    }

    return okResult(null, { userId });
  } catch (error: unknown) {
    return failResult(
      null,
      createPortfolioMutationServiceError(error, 'portfolio_history_clear_failed', {
        userId,
      }),
      { userId },
    );
  }
}

export type { PortfolioRecordPayload };
