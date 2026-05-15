import React, { useCallback } from 'react';
import type { Portfolio } from '@/types';
import type { TradeExecutionGuideData } from '@/components/TradeExecutionModal';
import { APP_HASH, APP_SHELL_MESSAGES } from '@/constants/appShellMessages';
import { resolvePaidTier } from '@/utils/appEntryHelpers';

import Landing from '@/components/Landing';
import Pricing from '@/components/Pricing';
import Privacy from '@/components/Privacy';
import Terms from '@/components/Terms';

const Dashboard = React.lazy(() => import('@/components/Dashboard'));
const Markets = React.lazy(() => import('@/components/Markets'));
const Backtest = React.lazy(() => import('@/components/Backtest'));
const History = React.lazy(() => import('@/components/History'));
const Benefits = React.lazy(() => import('@/components/Benefits'));

export type ActiveTab =
  | 'dashboard'
  | 'markets'
  | 'history'
  | 'benefits'
  | 'backtest'
  | 'pricing'
  | 'privacy'
  | 'terms';

export interface TabContentProps {
  activeTab: ActiveTab;
  lang: 'ko' | 'en';
  user: { id: string; email: string } | null;
  activePortfolios: Portfolio[];
  portfolios: Portfolio[];
  closedPortfolios: Portfolio[];
  canAccessPaidStocks: boolean;
  currentTier: string;
  totalValuation: number;
  totalValuationChange: number;
  totalValuationChangePct: number;

  onDailyExecutionSummaryChange: (summary: string | null) => void;
  onOpenLogin: () => void;
  onOpenSignup: () => void;
  onContinueWithToss: () => void;
  onRequestOpenCreator: () => void;
  onOpenAlarm: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onOpenQuickInput: (
    id: string,
    activeSection: 1 | 2 | 3 | undefined,
  ) => void;
  onOpenExecution: (id: string, guideData?: TradeExecutionGuideData) => void;
  onOpenAIImage: (id: string) => void;
  onClosePortfolio: (id: string) => void;
  onDeletePortfolio: (id: string) => Promise<void>;
  onUpdatePortfolio: (portfolio: Portfolio) => Promise<void>;
  onDeleteHistory: (portfolioId: string) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onSelectCheckoutPlan: (planId: 'pro' | 'premium') => void;
  onBackToDashboard: (hash: string) => void;
  onOpenPricingTab: () => void;
}

const SuspenseFallback = React.memo(({ message }: { message: string }) => (
  <div className="flex min-h-[50vh] items-center justify-center font-bold text-slate-500 dark:text-slate-400">
    {message}
  </div>
));
SuspenseFallback.displayName = 'SuspenseFallback';

const TabContentComponent: React.FC<TabContentProps> = (props) => {
  const {
    activeTab,
    lang,
    user,
    activePortfolios,
    portfolios,
    closedPortfolios,
    canAccessPaidStocks,
    currentTier,
    totalValuation,
    totalValuationChange,
    totalValuationChangePct,
    onDailyExecutionSummaryChange,
    onOpenLogin,
    onOpenSignup,
    onContinueWithToss,
    onRequestOpenCreator,
    onOpenAlarm,
    onOpenDetails,
    onOpenQuickInput,
    onOpenExecution,
    onOpenAIImage,
    onClosePortfolio,
    onDeletePortfolio,
    onUpdatePortfolio,
    onDeleteHistory,
    onClearHistory,
    onSelectCheckoutPlan,
    onBackToDashboard,
    onOpenPricingTab,
  } = props;

  const copy = APP_SHELL_MESSAGES[lang];
  const paidTier = resolvePaidTier(currentTier);
  const shouldShowAds = paidTier === 'free';

  const handlePricingUpgrade = useCallback(
    (planId: 'pro' | 'premium') => {
      if (user?.id == null) {
        onOpenLogin();
        return;
      }
      onSelectCheckoutPlan(planId);
    },
    [user?.id, onOpenLogin, onSelectCheckoutPlan],
  );

  const handlePrivacyBack = useCallback(() => {
    onBackToDashboard(APP_HASH.privacy);
  }, [onBackToDashboard]);

  const handleTermsBack = useCallback(() => {
    onBackToDashboard(APP_HASH.terms);
  }, [onBackToDashboard]);

  switch (activeTab) {
    case 'dashboard':
      if (user == null) {
        return (
          <Landing
            lang={lang}
            onOpenSignup={onOpenSignup}
            onOpenLogin={onOpenLogin}
            onContinueWithToss={onContinueWithToss}
          />
        );
      }

      return (
        <React.Suspense
          fallback={<SuspenseFallback message={copy.loadingDashboard} />}
        >
          <Dashboard
            lang={lang}
            portfolios={activePortfolios}
            shouldShowAds={shouldShowAds}
            onClosePortfolio={onClosePortfolio}
            onDeletePortfolio={onDeletePortfolio}
            onOpenCreator={onRequestOpenCreator}
            onOpenAlarm={onOpenAlarm}
            onOpenDetails={onOpenDetails}
            onOpenQuickInput={onOpenQuickInput}
            onOpenExecution={onOpenExecution}
            onOpenAIImage={onOpenAIImage}
            totalValuation={totalValuation}
            totalValuationChange={totalValuationChange}
            totalValuationChangePct={totalValuationChangePct}
            onDailyExecutionSummaryChange={onDailyExecutionSummaryChange}
          />
        </React.Suspense>
      );

    case 'markets':
      return (
        <React.Suspense
          fallback={<SuspenseFallback message={copy.loadingGeneric} />}
        >
          <Markets
            lang={lang}
            portfolios={portfolios}
            canAccessPaidStocks={canAccessPaidStocks}
            shouldShowAds={shouldShowAds}
          />
        </React.Suspense>
      );

    case 'backtest':
      return (
        <React.Suspense
          fallback={<SuspenseFallback message={copy.loadingBacktest} />}
        >
          <Backtest
            lang={lang}
            currentTier={paidTier}
            onRequestUpgrade={onOpenPricingTab}
          />
        </React.Suspense>
      );

    case 'pricing':
      return (
        <Pricing
          lang={lang}
          currentTier={paidTier}
          onUpgrade={handlePricingUpgrade}
        />
      );

    case 'history':
      return (
        <React.Suspense
          fallback={<SuspenseFallback message={copy.loadingGeneric} />}
        >
          <History
            lang={lang}
            portfolios={closedPortfolios}
            shouldShowAds={shouldShowAds}
            onOpenDetails={onOpenDetails}
            onDeleteHistory={onDeleteHistory}
            onClearHistory={onClearHistory}
          />
        </React.Suspense>
      );

    case 'benefits':
      return (
        <React.Suspense
          fallback={<SuspenseFallback message={copy.loadingGeneric} />}
        >
          <Benefits
            lang={lang}
            shouldShowAds={shouldShowAds}
            isAuthenticated={user != null}
          />
        </React.Suspense>
      );

    case 'privacy':
      return <Privacy lang={lang} onBack={handlePrivacyBack} />;

    case 'terms':
      return <Terms lang={lang} onBack={handleTermsBack} />;

    default: {
      const _exhaustiveCheck: never = activeTab;
      void _exhaustiveCheck;
      return <SuspenseFallback message={copy.loadingGeneric} />;
    }
  }
};

TabContentComponent.displayName = 'TabContent';

export const TabContent = React.memo(TabContentComponent);
