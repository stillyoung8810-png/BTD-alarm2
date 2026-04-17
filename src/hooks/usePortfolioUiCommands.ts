import { useCallback, useMemo } from 'react';
import type {
  SettlementResult,
  UsePortfoliosReturn,
} from '@/hooks/usePortfolios';
import type { Portfolio, Trade } from '@/types';

export type TradeDraftInput = Trade;

export interface UiMutationCommand<Args extends unknown[], Result = void> {
  run: (...args: Args) => Promise<Result>;
  isExecuting: boolean;
}

export interface PortfolioUiCommands {
  createPortfolio: UiMutationCommand<[portfolio: Omit<Portfolio, 'id'>]>;
  saveTrade: UiMutationCommand<[portfolioId: string, draft: TradeDraftInput]>;
  updatePortfolio: UiMutationCommand<[portfolio: Portfolio]>;
  deletePortfolio: UiMutationCommand<[portfolioId: string]>;
  closePortfolio: UiMutationCommand<[portfolioId: string], SettlementResult | null>;
}

export function usePortfolioUiCommands(
  bundle: UsePortfoliosReturn,
): PortfolioUiCommands {
  const handleCreatePortfolio = useCallback(
    async (portfolio: Omit<Portfolio, 'id'>): Promise<void> =>
      bundle.addPortfolioCommand.run(portfolio),
    [bundle.addPortfolioCommand],
  );
  const handleSaveTrade = useCallback(
    async (portfolioId: string, draft: TradeDraftInput): Promise<void> =>
      bundle.addTradeCommand.run(portfolioId, draft),
    [bundle.addTradeCommand],
  );
  const handleUpdatePortfolio = useCallback(
    async (portfolio: Portfolio): Promise<void> =>
      bundle.updatePortfolioCommand.run(portfolio),
    [bundle.updatePortfolioCommand],
  );
  const handleDeletePortfolio = useCallback(
    async (portfolioId: string): Promise<void> =>
      bundle.deletePortfolioCommand.run(portfolioId),
    [bundle.deletePortfolioCommand],
  );
  const handleClosePortfolio = useCallback(
    async (portfolioId: string) => bundle.closePortfolioCommand.run(portfolioId),
    [bundle.closePortfolioCommand],
  );

  return useMemo(
    () => ({
      createPortfolio: {
        run: handleCreatePortfolio,
        isExecuting: bundle.addPortfolioCommand.isExecuting,
      },
      saveTrade: {
        run: handleSaveTrade,
        isExecuting: bundle.addTradeCommand.isExecuting,
      },
      updatePortfolio: {
        run: handleUpdatePortfolio,
        isExecuting: bundle.updatePortfolioCommand.isExecuting,
      },
      deletePortfolio: {
        run: handleDeletePortfolio,
        isExecuting: bundle.deletePortfolioCommand.isExecuting,
      },
      closePortfolio: {
        run: handleClosePortfolio,
        isExecuting: bundle.closePortfolioCommand.isExecuting,
      },
    }),
    [
      bundle.addPortfolioCommand.isExecuting,
      bundle.addTradeCommand.isExecuting,
      bundle.closePortfolioCommand.isExecuting,
      bundle.deletePortfolioCommand.isExecuting,
      bundle.updatePortfolioCommand.isExecuting,
      handleClosePortfolio,
      handleCreatePortfolio,
      handleDeletePortfolio,
      handleSaveTrade,
      handleUpdatePortfolio,
    ],
  );
}