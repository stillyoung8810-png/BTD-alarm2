import type { Dispatch, SetStateAction } from 'react';
import type { AppLang, Portfolio, Trade } from '../types';
import type { AppUserProfile } from '../types/appUserProfile';

export interface SettlementResult {
  portfolio: Portfolio;
  totalInvested: number;
  alreadyRealized: number;
  finalSellAmount: number;
  totalReturn: number;
  profit: number;
  yieldRate: number;
}

export interface PortfolioMutationCommand<Args extends unknown[], Result> {
  run: (...args: Args) => Promise<Result>;
  isExecuting: boolean;
}

export interface UsePortfoliosOptions {
  userId: string | null;
  userProfile: AppUserProfile | null;
  portfolios: Portfolio[];
  setPortfolios: Dispatch<SetStateAction<Portfolio[]>>;
  lang: AppLang;
}

export interface UsePortfoliosReturn {
  portfolios: Portfolio[];
  setPortfolios: Dispatch<SetStateAction<Portfolio[]>>;
  fetchPortfolios: (userId: string) => void;
  loadPortfoliosFromCache: (userId: string) => boolean;
  handleAddPortfolio: (
    newP: Omit<Portfolio, 'id'>,
    onSuccess?: () => void | Promise<void>,
  ) => Promise<void>;
  handleClosePortfolio: (
    portfolioId: string,
    finalSells: Array<{
      stock: string;
      quantity: number;
      price: number;
      fee: number;
    }>,
    additionalFee: number,
  ) => Promise<SettlementResult | null>;
  handleUpdatePortfolio: (updated: Portfolio) => Promise<void>;
  handleAddTrade: (portfolioId: string, trade: Trade) => Promise<void>;
  handleDeleteTrade: (portfolioId: string, tradeId: string) => Promise<void>;
  deletePortfolioById: (id: string) => Promise<void>;
  handleDeleteHistory: (portfolioId: string) => Promise<void>;
  handleClearHistory: () => Promise<void>;
  addPortfolioCommand: PortfolioMutationCommand<
    [newP: Omit<Portfolio, 'id'>, onSuccess?: () => void | Promise<void>],
    void
  >;
  closePortfolioCommand: PortfolioMutationCommand<
    [
      portfolioId: string,
      finalSells: Array<{
        stock: string;
        quantity: number;
        price: number;
        fee: number;
      }>,
      additionalFee: number,
    ],
    SettlementResult | null
  >;
  updatePortfolioCommand: PortfolioMutationCommand<
    [updated: Portfolio],
    void
  >;
  addTradeCommand: PortfolioMutationCommand<
    [portfolioId: string, trade: Trade],
    void
  >;
  deletePortfolioCommand: PortfolioMutationCommand<[id: string], void>;
}
