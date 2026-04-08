import { useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { APP_SHELL_MESSAGES } from '../constants/messages/appShellMessages';
import {
  createPortfolioMutationError,
  isPortfolioMutationErrorCode,
  PORTFOLIO_MUTATION_ERROR_CODES,
} from '../constants/portfolioMutationErrors';
import { useMutexAction } from './useMutexAction';
import type { SettlementResult } from './portfolioTypes';
import {
  calculateHoldings,
  calculateTotalInvested,
  getTotalSellProceeds,
} from '../utils/portfolioCalculations';
import {
  calculatePoolDelta,
  computeVrSnapshotAfterTrade,
} from '../utils/vrBandStrategy';
import { getEffectiveSubscription } from '../utils/subscriptionUtils';
import type { AppLang, Portfolio, Trade, VrBandStrategyParams } from '../types';
import type { AppUserProfile } from '../types/appUserProfile';
import {
  clearClosedPortfolioHistorySafe,
  deletePortfolioByIdSafe,
  deletePortfolioHistorySafe,
  deletePortfolioTradeSafe,
  insertPortfolioSafe,
  persistPortfolioClosureSafe,
  persistPortfolioTradeMutationSafe,
  updatePortfolioSafe,
  type PortfolioRecordPayload,
} from '../services/portfolioMutationService';

interface UsePortfolioMutationsArgs {
  userId: string | null;
  userProfile: AppUserProfile | null;
  portfolios: Portfolio[];
  setPortfolios: Dispatch<SetStateAction<Portfolio[]>>;
  lang: AppLang;
}

interface TradeDraftResult {
  nextPortfolio: Portfolio;
  nextIsQuarterMode: boolean;
}

interface ClosePortfolioDraftResult {
  nextPortfolio: Portfolio;
  settlementResult: SettlementResult;
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
      alarmconfig?: Portfolio['alarmconfig'];
    };
  };
}

type FinalSellInput = Array<{
  stock: string;
  quantity: number;
  price: number;
  fee: number;
}>;

type LegacyVrStrategyShape = Portfolio['strategy'] & {
  vr_band?: VrBandStrategyParams;
  vrBandStrategy?: VrBandStrategyParams;
};

function getVrStrategyParams(
  strategy: Portfolio['strategy'],
): VrBandStrategyParams | null {
  const legacyStrategy = strategy as LegacyVrStrategyShape;
  return (
    strategy.vrBand ??
    legacyStrategy.vr_band ??
    legacyStrategy.vrBandStrategy ??
    null
  );
}

function requireSignedInUserId(userId: string | null): string {
  const trimmedUserId = (userId ?? '').trim();
  if (trimmedUserId.length === 0) {
    throw createPortfolioMutationError(
      PORTFOLIO_MUTATION_ERROR_CODES.sessionExpired,
    );
  }

  return trimmedUserId;
}

function findPortfolioOrThrow(
  portfolios: Portfolio[],
  portfolioId: string,
): Portfolio {
  const targetPortfolio = portfolios.find((portfolio) => portfolio.id === portfolioId);
  if (targetPortfolio != null) {
    return targetPortfolio;
  }

  throw createPortfolioMutationError(
    PORTFOLIO_MUTATION_ERROR_CODES.targetNotFound,
  );
}

function toPortfolioRecordPayload(portfolio: Portfolio): PortfolioRecordPayload {
  return {
    name: portfolio.name,
    daily_buy_amount: portfolio.dailyBuyAmount,
    start_date: portfolio.startDate,
    fee_rate: portfolio.feeRate,
    strategy: portfolio.strategy,
    trades: portfolio.trades,
    is_closed: portfolio.isClosed,
    closed_at: portfolio.closedAt ?? null,
    final_sell_amount: portfolio.finalSellAmount ?? null,
    alarm_config: portfolio.alarmconfig ?? null,
    is_quarter_mode: portfolio.isQuarterMode ?? false,
    vr_snapshot: portfolio.vrSnapshot ?? null,
  };
}

function buildPortfolioInsertPayload(
  portfolio: Omit<Portfolio, 'id'>,
  userId: string,
): PortfolioRecordPayload & { id: string; user_id: string } {
  const portfolioId = crypto.randomUUID();
  return {
    ...toPortfolioRecordPayload({
      ...portfolio,
      id: portfolioId,
    }),
    id: portfolioId,
    user_id: userId,
  };
}

function normalizeTradeInput(trade: Trade): Trade {
  return {
    ...trade,
    price: Number(trade.price),
    quantity: Number(trade.quantity),
    fee: Number(trade.fee ?? 0),
  };
}

function buildTradeDraft(
  portfolio: Portfolio,
  trade: Trade,
): TradeDraftResult {
  const normalizedTrade = normalizeTradeInput(trade);
  const vrParams = getVrStrategyParams(portfolio.strategy);
  const isVrStrategy = vrParams != null;

  let nextVrSnapshot = portfolio.vrSnapshot ?? null;
  let nextPoolAfter: number | null = null;

  if (isVrStrategy && vrParams != null) {
    const currentPool = nextVrSnapshot?.pool ?? vrParams.initialCapital;
    const feeRate = Number(portfolio.feeRate ?? vrParams.feeRate);
    const delta = calculatePoolDelta(
      normalizedTrade.type,
      normalizedTrade.price,
      normalizedTrade.quantity,
      feeRate,
    );
    nextPoolAfter = currentPool + delta;
    nextVrSnapshot = computeVrSnapshotAfterTrade(
      nextVrSnapshot,
      normalizedTrade,
      nextPoolAfter,
      vrParams,
    );
  }

  const nextTrade: Trade =
    isVrStrategy && nextPoolAfter !== null
      ? {
          ...normalizedTrade,
          metadata: {
            ...(normalizedTrade.metadata ?? {}),
            pool_after: nextPoolAfter,
          },
        }
      : normalizedTrade;

  const nextPortfolio: Portfolio = {
    ...portfolio,
    trades: [nextTrade, ...portfolio.trades],
    vrSnapshot: nextVrSnapshot ?? portfolio.vrSnapshot,
  };

  let nextIsQuarterMode = portfolio.isQuarterMode ?? false;
  if (
    portfolio.strategy.multiSplit != null &&
    nextIsQuarterMode &&
    normalizedTrade.type === 'sell'
  ) {
    const holdingsBefore = calculateHoldings(portfolio);
    const holdingsAfter = calculateHoldings(nextPortfolio);
    const quantityBefore =
      holdingsBefore.find((holding) => holding.stock === normalizedTrade.stock)
        ?.quantity ?? 0;
    const quantityAfter =
      holdingsAfter.find((holding) => holding.stock === normalizedTrade.stock)
        ?.quantity ?? 0;

    if (quantityBefore > 0) {
      const dropRatio = (quantityBefore - quantityAfter) / quantityBefore;
      if (dropRatio >= 0.2 || dropRatio >= 0.99 || quantityAfter <= 0) {
        nextIsQuarterMode = false;
      }
    }
  }

  return {
    nextPortfolio: {
      ...nextPortfolio,
      isQuarterMode: nextIsQuarterMode,
    },
    nextIsQuarterMode,
  };
}

function buildFinalSellTrades(
  finalSells: FinalSellInput,
  endDate: Date,
): Trade[] {
  const endDateText = `${endDate.getFullYear()}-${String(
    endDate.getMonth() + 1,
  ).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

  return finalSells.map((finalSell, index) => ({
    id: `final-${endDate.getTime()}-${index}`,
    type: 'sell',
    stock: finalSell.stock,
    date: endDateText,
    price: finalSell.price,
    quantity: finalSell.quantity,
    fee: finalSell.fee,
  }));
}

function buildClosePortfolioDraft(
  portfolio: Portfolio,
  userId: string,
  finalSells: FinalSellInput,
  additionalFee: number,
): ClosePortfolioDraftResult {
  const totalInvested = calculateTotalInvested(portfolio);
  const alreadyRealized = getTotalSellProceeds(portfolio);
  const totalFinalSellAmount =
    finalSells.reduce(
      (sum, finalSell) =>
        sum + finalSell.price * finalSell.quantity - finalSell.fee,
      0,
    ) - additionalFee;
  const totalReturn = alreadyRealized + totalFinalSellAmount;
  const profit = totalReturn - totalInvested;
  const yieldRate =
    totalInvested > 0 ? (totalReturn / totalInvested - 1) * 100 : 0;

  const endDate = new Date();
  const nextTrades = [
    ...portfolio.trades,
    ...buildFinalSellTrades(finalSells, endDate),
  ];
  const nextPortfolio: Portfolio = {
    ...portfolio,
    isClosed: true,
    closedAt: endDate.toISOString(),
    finalSellAmount: totalFinalSellAmount + additionalFee,
    trades: nextTrades,
  };

  const startDate = portfolio.startDate
    ? new Date(portfolio.startDate)
    : new Date();

  return {
    nextPortfolio,
    settlementResult: {
      portfolio: nextPortfolio,
      totalInvested,
      alreadyRealized,
      finalSellAmount: totalFinalSellAmount + additionalFee,
      totalReturn,
      profit,
      yieldRate,
    },
    historyPayload: {
      portfolio_id: portfolio.id,
      user_id: userId,
      portfolio_name: portfolio.name,
      total_invested: totalInvested,
      total_return: totalReturn,
      total_profit: profit,
      yield_rate: yieldRate,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString(),
      strategy_detail: {
        strategy: portfolio.strategy,
        daily_buy_amount: portfolio.dailyBuyAmount,
        fee_rate: portfolio.feeRate,
        alarmconfig: portfolio.alarmconfig,
      },
    },
  };
}

function toPortfolioMutationError(
  code: keyof typeof PORTFOLIO_MUTATION_ERROR_CODES,
  error: unknown,
): Error {
  return createPortfolioMutationError(PORTFOLIO_MUTATION_ERROR_CODES[code], error);
}

function getClosePortfolioErrorCode(
  errorMessage: string,
): 'closeHistoryFailed' | 'closeUpdateFailed' {
  if (errorMessage === 'portfolio_history_insert_failed') {
    return 'closeHistoryFailed';
  }

  return 'closeUpdateFailed';
}

export function usePortfolioMutations({
  userId,
  userProfile,
  portfolios,
  setPortfolios,
  lang,
}: UsePortfolioMutationsArgs) {
  const getMutationFailureToastMessage = useCallback(
    (error: unknown): string | null => {
      if (
        error instanceof Error &&
        isPortfolioMutationErrorCode(error.message) &&
        error.message === PORTFOLIO_MUTATION_ERROR_CODES.portfolioLimitReached
      ) {
        return null;
      }

      return APP_SHELL_MESSAGES[lang].dailySummaryNetworkError;
    },
    [lang],
  );

  const handleAddPortfolioCore = useCallback(
    async (
      newPortfolio: Omit<Portfolio, 'id'>,
      onSuccess?: () => void | Promise<void>,
    ): Promise<void> => {
      const signedInUserId = requireSignedInUserId(userId);
      const activePortfolios = portfolios.filter((portfolio) => !portfolio.isClosed);
      const maxPortfolios = userProfile?.max_portfolios ?? 3;

      if (maxPortfolios !== -1 && activePortfolios.length >= maxPortfolios) {
        const effectiveTier = getEffectiveSubscription(userProfile).tier;
        throw createPortfolioMutationError(
          PORTFOLIO_MUTATION_ERROR_CODES.portfolioLimitReached,
          {
            maxPortfolios,
            effectiveTier,
          },
        );
      }

      const payload = buildPortfolioInsertPayload(newPortfolio, signedInUserId);
      const result = await insertPortfolioSafe(payload);
      if (!result.ok) {
        throw toPortfolioMutationError('saveFailed', result.error);
      }

      if (result.data.length > 0) {
        setPortfolios((previous) => [...previous, ...result.data]);
        await Promise.resolve(onSuccess?.());
      }
    },
    [portfolios, setPortfolios, userId, userProfile],
  );

  const addPortfolioCommand = useMutexAction(handleAddPortfolioCore, {
    getMutationFailureToastMessage,
  });
  const handleAddPortfolio = addPortfolioCommand.run;

  const handleClosePortfolioCore = useCallback(
    async (
      portfolioId: string,
      finalSells: FinalSellInput,
      additionalFee: number,
    ): Promise<SettlementResult | null> => {
      const signedInUserId = requireSignedInUserId(userId);
      const targetPortfolio = findPortfolioOrThrow(portfolios, portfolioId);
      const prepared = buildClosePortfolioDraft(
        targetPortfolio,
        signedInUserId,
        finalSells,
        additionalFee,
      );

      const result = await persistPortfolioClosureSafe({
        userId: signedInUserId,
        portfolioId,
        historyPayload: prepared.historyPayload,
        portfolioUpdate: {
          is_closed: true,
          closed_at: prepared.nextPortfolio.closedAt ?? '',
          final_sell_amount: prepared.nextPortfolio.finalSellAmount ?? 0,
          trades: prepared.nextPortfolio.trades,
        },
      });

      if (!result.ok) {
        throw toPortfolioMutationError(
          getClosePortfolioErrorCode(result.error.message),
          result.error,
        );
      }

      setPortfolios((previous) =>
        previous.map((portfolio) =>
          portfolio.id === portfolioId ? prepared.nextPortfolio : portfolio,
        ),
      );

      return prepared.settlementResult;
    },
    [portfolios, setPortfolios, userId],
  );

  const closePortfolioCommand = useMutexAction(
    handleClosePortfolioCore,
    {
      getMutationFailureToastMessage,
      lockedReturnValue: null,
    },
  );
  const handleClosePortfolio = closePortfolioCommand.run;

  const handleUpdatePortfolioCore = useCallback(
    async (updatedPortfolio: Portfolio): Promise<void> => {
      const result = await updatePortfolioSafe(
        updatedPortfolio.id,
        toPortfolioRecordPayload(updatedPortfolio),
      );
      if (!result.ok) {
        throw toPortfolioMutationError('updateFailed', result.error);
      }

      setPortfolios((previous) =>
        previous.map((portfolio) =>
          portfolio.id === updatedPortfolio.id ? updatedPortfolio : portfolio,
        ),
      );
    },
    [setPortfolios],
  );

  const updatePortfolioCommand = useMutexAction(
    handleUpdatePortfolioCore,
    {
      getMutationFailureToastMessage,
    },
  );
  const handleUpdatePortfolio = updatePortfolioCommand.run;

  const handleAddTradeCore = useCallback(
    async (portfolioId: string, trade: Trade): Promise<void> => {
      const targetPortfolio = findPortfolioOrThrow(portfolios, portfolioId);
      const prepared = buildTradeDraft(targetPortfolio, trade);
      const result = await persistPortfolioTradeMutationSafe({
        portfolioId,
        trades: prepared.nextPortfolio.trades,
        vrSnapshot: prepared.nextPortfolio.vrSnapshot,
        isQuarterMode: prepared.nextIsQuarterMode,
      });

      if (!result.ok) {
        throw toPortfolioMutationError('addTradeFailed', result.error);
      }

      setPortfolios((previous) =>
        previous.map((portfolio) =>
          portfolio.id === portfolioId ? prepared.nextPortfolio : portfolio,
        ),
      );
    },
    [portfolios, setPortfolios],
  );

  const addTradeCommand = useMutexAction(handleAddTradeCore, {
    getMutationFailureToastMessage,
  });
  const handleAddTrade = addTradeCommand.run;

  const handleDeleteTradeCore = useCallback(
    async (portfolioId: string, tradeId: string): Promise<void> => {
      const targetPortfolio = findPortfolioOrThrow(portfolios, portfolioId);
      const nextTrades = targetPortfolio.trades.filter((trade) => trade.id !== tradeId);
      const result = await deletePortfolioTradeSafe(portfolioId, nextTrades);
      if (!result.ok) {
        throw toPortfolioMutationError('deleteTradeFailed', result.error);
      }

      setPortfolios((previous) =>
        previous.map((portfolio) =>
          portfolio.id === portfolioId
            ? { ...portfolio, trades: nextTrades }
            : portfolio,
        ),
      );
    },
    [portfolios, setPortfolios],
  );

  const { run: handleDeleteTrade } = useMutexAction(handleDeleteTradeCore, {
    getMutationFailureToastMessage,
  });

  const deletePortfolioByIdCore = useCallback(
    async (portfolioId: string): Promise<void> => {
      const signedInUserId = requireSignedInUserId(userId);
      const result = await deletePortfolioByIdSafe({
        userId: signedInUserId,
        portfolioId,
      });
      if (!result.ok) {
        throw toPortfolioMutationError('deleteFailed', result.error);
      }

      setPortfolios((previous) =>
        previous.filter((portfolio) => portfolio.id !== portfolioId),
      );
    },
    [setPortfolios, userId],
  );

  const deletePortfolioCommand = useMutexAction(deletePortfolioByIdCore, {
    getMutationFailureToastMessage,
  });
  const deletePortfolioById = deletePortfolioCommand.run;

  const handleDeleteHistoryCore = useCallback(
    async (portfolioId: string): Promise<void> => {
      const signedInUserId = requireSignedInUserId(userId);
      const result = await deletePortfolioHistorySafe({
        userId: signedInUserId,
        portfolioId,
      });
      if (!result.ok) {
        throw toPortfolioMutationError('deleteHistoryFailed', result.error);
      }

      setPortfolios((previous) =>
        previous.filter((portfolio) => portfolio.id !== portfolioId),
      );
    },
    [setPortfolios, userId],
  );

  const deleteHistoryCommand = useMutexAction(
    handleDeleteHistoryCore,
    {
      getMutationFailureToastMessage,
    },
  );
  const handleDeleteHistory = deleteHistoryCommand.run;

  const handleClearHistoryCore = useCallback(async (): Promise<void> => {
    const signedInUserId = requireSignedInUserId(userId);
    const result = await clearClosedPortfolioHistorySafe(signedInUserId);
    if (!result.ok) {
      throw toPortfolioMutationError('clearHistoryFailed', result.error);
    }

    setPortfolios((previous) =>
      previous.filter((portfolio) => !portfolio.isClosed),
    );
  }, [setPortfolios, userId]);

  const clearHistoryCommand = useMutexAction(handleClearHistoryCore, {
    getMutationFailureToastMessage,
  });
  const handleClearHistory = clearHistoryCommand.run;

  return useMemo(
    () => ({
      handleAddPortfolio,
      handleClosePortfolio,
      handleUpdatePortfolio,
      handleAddTrade,
      handleDeleteTrade,
      deletePortfolioById,
      handleDeleteHistory,
      handleClearHistory,
      addPortfolioCommand,
      closePortfolioCommand,
      updatePortfolioCommand,
      addTradeCommand,
      deletePortfolioCommand,
    }),
    [
      addPortfolioCommand,
      addTradeCommand,
      closePortfolioCommand,
      deletePortfolioCommand,
      deletePortfolioById,
      deleteHistoryCommand,
      clearHistoryCommand,
      handleAddPortfolio,
      handleAddTrade,
      handleClearHistory,
      handleDeleteHistory,
      handleDeleteTrade,
      handleUpdatePortfolio,
      handleClosePortfolio,
      updatePortfolioCommand,
    ],
  );
}
