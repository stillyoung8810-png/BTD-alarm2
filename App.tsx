import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppLang, Portfolio, Trade } from './types';
import { I18N } from './constants';
import Footer from './components/Footer';
import TradeExecutionModal from './components/TradeExecutionModal';
import { TerminationInput, Result as SettlementResult } from './components/SettlementModals';
import { supabase, clearAuthStorage } from './services/supabase';
import { calculateHoldings } from './utils/portfolioCalculations';
import { fetchStockPricesWithPrev, loadInitialStockData, loadPaidStockData } from './services/stockService';
import { getUSSelectionHolidays } from './utils/marketUtils';
import { getCurrentKSTDateString, getDeviceTimeZone } from './utils/dateUtils';
import { useFCMToken } from './hooks/useFCMToken';
import { useAuth } from './hooks/useAuth';
import { usePortfolios } from './hooks/usePortfolios';
import { useMutexAction } from './hooks/useMutexAction';
import { isTossApp } from './services/tossAppBridge';
import {
  AdPreloadProvider,
  useAdPreload,
} from './services/ads/AdPreloadProvider';
import {
  createTossIntegratedFullScreenAdBridge,
  GlobalAdManager,
  type AppAudioManager,
} from './services/ads/globalAdManager';
import { tossIntegratedFullScreenAdApi } from './services/ads/tossIntegratedFullScreenAdApi';
import {
  getInterstitialPlacementDefinitions,
  INTERSTITIAL_PLACEMENT_KEYS,
  type AdRouteKey,
  type InterstitialPlacementKey,
} from './services/ads/interstitialPlacementConfig';
import { closeView } from '@apps-in-toss/web-bridge';
import { restorePendingIapOrders } from './services/payment/tossIapService';
import { TossAppProvider } from './contexts/TossAppContext';
import { buildDailyExecutionSummary } from './utils/dailyExecutionSummary';
import { TdsAlertDialog } from './components/tds-adapter/TdsAlertDialog';
import { TdsConfirmDialog } from './components/tds-adapter/TdsConfirmDialog';
import { showErrorToast } from './components/tds-adapter/showErrorToast';
import { useAsyncTdsConfirm } from './components/tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from './constants/tdsDialogMessages';
import SessionExpiredAlertGate from './components/auth/SessionExpiredAlertGate';
import { getPortfolioMutationNotice } from './constants/portfolioMutationErrors';
import { APP_SHELL_MESSAGES } from './constants/appShellMessages';
import { 
  LayoutDashboard, 
  BarChart3, 
  History as HistoryIcon, 
  LineChart,
  UserCircle,
  Languages,
  Crown,
  Hammer,
  FileText
} from 'lucide-react';
import { 
  getMaxPortfolios, 
  getMaxAlarms, 
  getEffectiveSubscription,
} from './utils/subscriptionUtils';
import { toAdUserTier, type UserTier } from '@/types/userTier';
import { useTierDisplay } from './hooks/useTierDisplay';
import AuthModalCoordinator from './components/auth/AuthModalCoordinator';
import { replaceHashIfMatched } from './utils/appEntryHelpers';
import { TabContent, type ActiveTab } from './components/TabContent';
const QuickInputModal = React.lazy(() => import('./components/QuickInputModal'));
const CheckoutModal = React.lazy(() => import('./components/CheckoutModal'));
const StrategyCreator = React.lazy(() => import('./components/StrategyCreator'));
const AlarmModal = React.lazy(() => import('./components/AlarmModal'));
const PortfolioDetailsModal = React.lazy(() => import('./components/PortfolioDetailsModal'));
const AIImageInputModal = React.lazy(() => import('./components/AIImageInputModal'));

const BOOTSTRAP_AD_USER_TIER: UserTier = 'free';
const INTERSTITIAL_GLOBAL_COOLDOWN_MS = 60_000;
const SILENT_AD_AUDIO_MANAGER: AppAudioManager = {
  pauseAllSounds: () => {},
  resumeAllSounds: () => {},
};
const GLOBAL_INTERSTITIAL_AD_MANAGER = new GlobalAdManager(
  createTossIntegratedFullScreenAdBridge(tossIntegratedFullScreenAdApi),
  getInterstitialPlacementDefinitions(),
  {
    audioManager: SILENT_AD_AUDIO_MANAGER,
    globalCooldownMs: INTERSTITIAL_GLOBAL_COOLDOWN_MS,
    initialTier: BOOTSTRAP_AD_USER_TIER,
  },
);

/** Lazy-loaded 모달 공통 Suspense fallback — DRY */
const LAZY_MODAL_FALLBACK = (
  <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/80 text-slate-400 font-bold">…</div>
);

/** 동일 openId 닫기: setTimeout 기반 물리적 더블 입력 디듀프 */
const UI_DOUBLE_CLICK_PREVENTION_MS = 300;
const NON_BLOCKING_AD_TRIGGER_DELAY_MS = 0;
const TIER_ICON_SIZE_PX = 11;
const DAILY_EXECUTION_DEBOUNCE_MS = 3000;
const DAILY_EXECUTION_ON_CONFLICT = 'user_id,summary_date';

const PRO_TIER_ICON_PROPS = {
  fill: 'currentColor',
  stroke: 'currentColor',
} as const;

interface FinishSignedInFlowOptions {
  shouldShowWelcome: boolean;
}

function getPrimeableAdRouteKey(activeTab: ActiveTab): AdRouteKey | null {
  switch (activeTab) {
    case 'dashboard':
      return 'dashboard';
    case 'history':
      return 'history';
    default:
      return null;
  }
}

interface AdPreloadBridgeProps {
  onShowInstantAdChange: (
    nextShowInstantAd:
      | ((key: InterstitialPlacementKey) => Promise<boolean>)
      | null,
  ) => void;
}

const AdPreloadBridge: React.FC<AdPreloadBridgeProps> = ({
  onShowInstantAdChange,
}) => {
  const { showInstantAd } = useAdPreload();

  useEffect(() => {
    onShowInstantAdChange(showInstantAd);
    return () => {
      onShowInstantAdChange(null);
    };
  }, [onShowInstantAdChange, showInstantAd]);

  return null;
};

interface HeaderBrandButtonProps {
  currentTier: string;
  lang: 'ko' | 'en';
  tierClassName: string;
  tierIconClassName: string;
  tierLabel: string;
  TierIcon: React.ComponentType<{
    size?: number;
    className?: string;
    fill?: string;
    stroke?: string;
  }>;
  onNavigateDashboard: () => void;
}

function HeaderBrandButton({
  currentTier,
  lang,
  tierClassName,
  tierIconClassName,
  tierLabel,
  TierIcon,
  onNavigateDashboard,
}: HeaderBrandButtonProps): React.ReactElement {
  const copy = APP_SHELL_MESSAGES[lang];
  const tierIconProps =
    currentTier === 'pro' ? PRO_TIER_ICON_PROPS : undefined;

  return (
    <button
      type="button"
      onClick={onNavigateDashboard}
      aria-label={copy.entryGoToDashboardAria}
      className="flex items-center gap-4 group"
    >
      <div className="w-11 h-11 relative flex items-center justify-center group-hover:scale-110 transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-indigo-600 to-purple-500 rounded-xl shadow-lg shadow-blue-500/20 transform -rotate-3 group-hover:rotate-0 transition-transform" />
        <div className="relative z-10 text-white font-black text-xl flex items-baseline select-none">
          <span className="tracking-tighter">B</span>
          <span className="text-blue-300 -ml-1.5 opacity-90 translate-y-0.5">
            D
          </span>
        </div>
      </div>
      <div className="hidden sm:block text-left">
        <h1 className="text-lg font-black tracking-tight dark:text-white uppercase leading-none mb-1">
          {copy.entryAppName}
        </h1>
        <div className="mt-[2px]">
          <span className={tierClassName}>
            <TierIcon
              size={TIER_ICON_SIZE_PX}
              className={tierIconClassName}
              {...tierIconProps}
            />
            {tierLabel}
          </span>
        </div>
      </div>
    </button>
  );
}

interface DailyExecutionSummaryUpsertRow {
  user_id: string;
  summary_date: string;
  summary_text: string;
  lang: 'ko' | 'en';
}

async function saveDailyExecutionSummary(params: {
  userId: string;
  summary: string;
  lang: 'ko' | 'en';
}): Promise<{ summaryDate: string; errorMessage: string | null }> {
  const summaryDate = getCurrentKSTDateString();
  const payload: DailyExecutionSummaryUpsertRow = {
    user_id: params.userId,
    summary_date: summaryDate,
    summary_text: params.summary,
    lang: params.lang,
  };

  const { error } = await supabase
    .from('daily_execution_summaries')
    .upsert(payload, {
      onConflict: DAILY_EXECUTION_ON_CONFLICT,
    });

  return {
    summaryDate,
    errorMessage: error?.message ?? null,
  };
}

const App: React.FC = () => {
  const [lang, setLang] = useState<AppLang>('ko');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  /** 웹: 기존과 동일 기본 다크. 토스 미니앱: 출시 가이드(라이트 테마)에 맞춰 라이트 고정. */
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof window !== 'undefined' && isTossApp() ? false : true,
  );
  const [checkoutPlan, setCheckoutPlan] = useState<'pro' | 'premium' | null>(null);
  const fetchPortfoliosRef = useRef<(userId: string) => void>(() => {});
  const showInstantAdRef = useRef<
    ((key: InterstitialPlacementKey) => Promise<boolean>) | null
  >(null);

  const [alarmTargetId, setAlarmTargetId] = useState<string | null>(null);
  const [detailsTargetId, setDetailsTargetId] = useState<string | null>(null);
  const [quickInputTargetId, setQuickInputTargetId] = useState<string | null>(null);
  const [quickInputActiveSection, setQuickInputActiveSection] = useState<1 | 2 | 3 | undefined>(undefined);
  const [executionTargetId, setExecutionTargetId] = useState<string | null>(null);
  const [aiImageTargetId, setAiImageTargetId] = useState<string | null>(null);
  const [totalValuation, setTotalValuation] = useState<number>(0);
  const [totalValuationPrev, setTotalValuationPrev] = useState<number>(0);
  const [totalValuationChange, setTotalValuationChange] = useState<number>(0);
  const [totalValuationChangePct, setTotalValuationChangePct] = useState<number>(0);
  const [dailyExecutionSummaryFromDashboard, setDailyExecutionSummaryFromDashboard] = useState<string | null>(null);

  const onDailyExecutionSummaryChange = useCallback((summary: string | null) => {
    setDailyExecutionSummaryFromDashboard(summary ?? null);
  }, []);

  const STOCK_PRICE_CACHE_KEY = 'STOCK_PRICE_CACHE_V1';
  const KST_UPDATE_HOUR = 7;
  const KST_UPDATE_MINUTE = 20;

  useEffect(() => {
    const syncTabFromLocation = () => {
      if (typeof window === 'undefined') return;
      const hash = window.location.hash;
      if (hash === '#terms') {
        setActiveTab('terms');
        return;
      }
      if (hash === '#privacy') {
        setActiveTab('privacy');
        return;
      }
      const path = window.location.pathname;
      if (path.startsWith('/markets')) {
        setActiveTab('markets');
      }
    };
    syncTabFromLocation();
    window.addEventListener('hashchange', syncTabFromLocation);
    if (isTossApp()) {
      restorePendingIapOrders();
    }
    return () => window.removeEventListener('hashchange', syncTabFromLocation);
  }, []);

  const summaryToSave = useMemo(() => {
    const fromDashboard = dailyExecutionSummaryFromDashboard;
    const base =
      fromDashboard != null && fromDashboard.trim() !== ''
        ? fromDashboard
        : buildDailyExecutionSummary(portfolios, lang);
    return base && base.trim().length > 0 ? base : '';
  }, [portfolios, lang, dailyExecutionSummaryFromDashboard]);

  const dailyExecutionDebounceRef = useRef<number | null>(null);
  const lastSavedSummaryRef = useRef<string | null>(null);

  const { saveFCMToken } = useFCMToken();

  const {
    user,
    setUser,
    userProfile,
    setUserProfile,
    authModal,
    setAuthModal,
    fetchUserProfile,
    justLoggedInRef,
    hasSessionExpired,
    handleDismissSessionExpired,
  } = useAuth({
    setPortfolios,
    saveFCMToken,
    fetchPortfoliosRef,
  });
  const [shouldShowSignedInWelcome, setShouldShowSignedInWelcome] = useState(false);

  const {
    fetchPortfolios,
    handleAddPortfolio,
    handleClosePortfolio,
    handleUpdatePortfolio,
    handleAddTrade,
    handleDeleteTrade,
    deletePortfolioById,
    handleDeleteHistory,
    handleClearHistory,
  } = usePortfolios({
    userId: user?.id ?? null,
    userProfile,
    portfolios,
    setPortfolios,
  });

  const effectiveSubscription = useMemo(
    () => getEffectiveSubscription(userProfile),
    [userProfile],
  );

  // 현재 유저의 실효 구독 티어 (pending_plan / 만료 반영)
  const currentTier = effectiveSubscription.tier;
  const paidTier = useMemo(() => toAdUserTier(currentTier), [currentTier]);
  const adsUserTier = paidTier;

  const canAccessPaidStocks = useMemo(() => {
    const tierOk = currentTier !== 'free';
    return tierOk && effectiveSubscription.isActive && !effectiveSubscription.isExpired;
  }, [currentTier, effectiveSubscription.isActive, effectiveSubscription.isExpired]);

  const { tierLabel, tierClassName, TierIcon, tierIconClassName } = useTierDisplay(
    paidTier,
  );

  const geminiApiKey = useMemo(() => {
    const isPaid = currentTier !== 'free';
    const paid = import.meta.env.VITE_GEMINI_API_KEY_PAID;
    const free = import.meta.env.VITE_GEMINI_API_KEY_FREE;
    const fallback = import.meta.env.VITE_GEMINI_API_KEY;
    return (isPaid ? paid : free) || fallback || undefined;
  }, [currentTier]);

  const [terminateTargetId, setTerminateTargetId] = useState<string | null>(null);
  const [settlementResult, setSettlementResult] = useState<{
    portfolio: Portfolio;
    totalInvested: number;
    alreadyRealized: number;
    finalSellAmount: number;
    totalReturn: number;
    profit: number;
    yieldRate: number;
  } | null>(null);

  const t = I18N[lang];
  const shellCopy = APP_SHELL_MESSAGES[lang];
  const isInTossApp = isTossApp();
  const primeableAdRouteKey = useMemo(
    () => getPrimeableAdRouteKey(activeTab),
    [activeTab],
  );

  useEffect(() => {
    if (!isInTossApp) return;
    setIsDarkMode(false);
  }, [isInTossApp]);

  useEffect(() => {
    if (primeableAdRouteKey === null) {
      return;
    }
    GLOBAL_INTERSTITIAL_AD_MANAGER.primeRoute(primeableAdRouteKey);
  }, [primeableAdRouteKey]);

  useEffect(() => {
    if (detailsTargetId === null) {
      return;
    }
    GLOBAL_INTERSTITIAL_AD_MANAGER.primeRoute('portfolio_details');
  }, [detailsTargetId]);

  useEffect(() => {
    const currentUserId = user?.id;

    if (currentUserId == null) {
      return;
    }

    if (!summaryToSave || summaryToSave.trim().length === 0) {
      return;
    }

    if (dailyExecutionDebounceRef.current != null) {
      window.clearTimeout(dailyExecutionDebounceRef.current);
    }

    dailyExecutionDebounceRef.current = window.setTimeout(async () => {
      try {
        if (lastSavedSummaryRef.current === summaryToSave) {
          return;
        }

        const result = await saveDailyExecutionSummary({
          userId: currentUserId,
          summary: summaryToSave,
          lang,
        });

        if (result.errorMessage != null) {
          showErrorToast(
            `${shellCopy.dailySummarySaveErrorPrefix}${result.errorMessage}`,
          );
          return;
        }

        lastSavedSummaryRef.current = summaryToSave;
        console.log('[DailyExecution] summary upserted for', result.summaryDate);
      } catch (error: unknown) {
        showErrorToast(shellCopy.dailySummaryNetworkError);
        console.error('[DailyExecution] upsert failed:', error);
      }
    }, DAILY_EXECUTION_DEBOUNCE_MS);

    return () => {
      if (dailyExecutionDebounceRef.current == null) {
        return;
      }

      window.clearTimeout(dailyExecutionDebounceRef.current);
      dailyExecutionDebounceRef.current = null;
    };
  }, [user?.id, summaryToSave, lang]);

  const paidStocksLoadedRef = useRef(false);
  useEffect(() => {
    if (!canAccessPaidStocks) return;
    if (paidStocksLoadedRef.current) return;
    paidStocksLoadedRef.current = true;
  
    const run = async () => {
      await loadPaidStockData();
    };
    run();
  }, [canAccessPaidStocks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;

    if (path.startsWith('/auth/reset-password')) {
      setAuthModal('reset-password');
    }
  }, []);

  useEffect(() => {
    if (authModal !== 'profile' || !user?.id) return;
    if (userProfile != null) return;
    fetchUserProfile(user.id);
  }, [authModal, user?.id, userProfile, fetchUserProfile]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        console.log('[App] IndexedDB 초기 데이터 로딩 시작');
        await loadInitialStockData();
        if (isMounted) {
          console.log('[App] IndexedDB 초기 데이터 로딩 완료');
        }
      } catch (error) {
        console.error('[App] IndexedDB 초기 데이터 로딩 실패:', error);
      }
    };
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    fetchPortfoliosRef.current = fetchPortfolios;
  }, [fetchPortfolios]);

  const aggregateHoldings = useMemo(() => {
    const activePortfolios = portfolios.filter(p => !p.isClosed);
    const result: Record<string, number> = {};

    activePortfolios.forEach(p => {
      const holdings = calculateHoldings(p);
      holdings.forEach(h => {
        result[h.stock] = (result[h.stock] || 0) + h.quantity;
      });
    });

    return result;
  }, [portfolios]);

  const activePortfolios = useMemo(
    () => portfolios.filter(p => !p.isClosed),
    [portfolios]
  );

  useEffect(() => {
    const symbols = Object.keys(aggregateHoldings).filter(sym => aggregateHoldings[sym] > 0);

    if (symbols.length === 0) {
      setTotalValuation(0);
      setTotalValuationPrev(0);
      setTotalValuationChange(0);
      setTotalValuationChangePct(0);
      return;
    }

    const calcValuation = async () => {
      try {
        const nowUtc = new Date();
        const nowKst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
        const year = nowKst.getUTCFullYear();
        const month = nowKst.getUTCMonth() + 1;
        const day = nowKst.getUTCDate();
        const hours = nowKst.getUTCHours();
        const minutes = nowKst.getUTCMinutes();

        const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const minutesOfDay = hours * 60 + minutes;

        const yesterday = new Date(nowKst.getTime() - 24 * 60 * 60 * 1000);
        const yYear = yesterday.getUTCFullYear();
        const yMonth = yesterday.getUTCMonth() + 1;
        const yDay = yesterday.getUTCDate();
        const yesterdayStr = `${yYear}-${String(yMonth).padStart(2, '0')}-${String(yDay).padStart(2, '0')}`;

        const usHolidaysForYear = getUSSelectionHolidays(yYear);
        const wasHolidayYesterday = usHolidaysForYear.includes(yesterdayStr);

        const kstDayOfWeek = nowKst.getUTCDay();

        const isAfterUpdateTime =
          minutesOfDay >= KST_UPDATE_HOUR * 60 + KST_UPDATE_MINUTE;

        const isPotentialNewCloseAvailable =
          kstDayOfWeek >= 2 &&
          kstDayOfWeek <= 6 &&
          isAfterUpdateTime &&
          !wasHolidayYesterday;

        let cachedPrices: Record<string, { current: number; previous: number }> | null = null;
        try {
          const raw = window.localStorage.getItem(STOCK_PRICE_CACHE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.date === todayStr && parsed.prices) {
              cachedPrices = parsed.prices;
            }
          }
        } catch (err) {
          console.warn('Failed to read stock price cache:', err);
        }

        let priceMap: Record<string, { current: number; previous: number }>;

        const shouldFetchFromServer =
          !cachedPrices || 
          (isPotentialNewCloseAvailable && !cachedPrices); 

        if (shouldFetchFromServer) {
          priceMap = await fetchStockPricesWithPrev(symbols);

          try {
            const payload = {
              date: todayStr,
              lastUpdatedKst: nowKst.toISOString(),
              prices: priceMap,
            };
            window.localStorage.setItem(
              STOCK_PRICE_CACHE_KEY,
              JSON.stringify(payload)
            );
          } catch (err) {
            console.warn('Failed to write stock price cache:', err);
          }
        } else {
          priceMap = cachedPrices || {};
        }

        let currentTotal = 0;
        let prevTotal = 0;

        symbols.forEach(symbol => {
          const qty = aggregateHoldings[symbol];
          const prices = priceMap[symbol];
          if (!prices) return;
          const current = prices.current;
          const previous = prices.previous || current;
          currentTotal += qty * current;
          prevTotal += qty * previous;
        });

        const change = currentTotal - prevTotal;
        const changePct = prevTotal > 0 ? (change / prevTotal) * 100 : 0;

        setTotalValuation(currentTotal);
        setTotalValuationPrev(prevTotal);
        setTotalValuationChange(change);
        setTotalValuationChangePct(changePct);
      } catch (err) {
        console.error('Failed to calculate total valuation:', err);
      }
    };

    calcValuation();
  }, [aggregateHoldings]);

  const settlementDetailsCloseUiDedupeOpenIdRef = useRef<string | null>(null);
  const settlementDetailsCloseUiDedupeTimerRef = useRef<number | null>(null);
  const navigationExitDialog = useAsyncTdsConfirm(lang);
  const [portfolioMutationNotice, setPortfolioMutationNotice] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const portfoliosRef = useRef(portfolios);

  useEffect(() => {
    portfoliosRef.current = portfolios;
  }, [portfolios]);

  const handlePortfolioMutationNoticeClose = useCallback(() => {
    setPortfolioMutationNotice(null);
  }, []);

  const handleShowInstantAdChange = useCallback(
    (
      nextShowInstantAd:
        | ((key: InterstitialPlacementKey) => Promise<boolean>)
        | null,
    ) => {
      showInstantAdRef.current = nextShowInstantAd;
    },
    [],
  );

  const scheduleInterstitialAd = useCallback(
    (key: InterstitialPlacementKey) => {
      if (typeof window === 'undefined') {
        return;
      }

      window.setTimeout(() => {
        const showInstantAd = showInstantAdRef.current;
        if (showInstantAd == null) {
          return;
        }

        void showInstantAd(key).catch((error: unknown) => {
          console.error('[App] Fire-and-forget interstitial failed:', error);
        });
      }, NON_BLOCKING_AD_TRIGGER_DELAY_MS);
    },
    [],
  );

  const openPortfolioMutationNotice = useCallback((error: unknown) => {
    setPortfolioMutationNotice(getPortfolioMutationNotice(lang, error));
  }, [lang]);

  const runPortfolioMutation = useCallback(
    async <Result,>(operation: () => Promise<Result>): Promise<Result> => {
      try {
        return await operation();
      } catch (error: unknown) {
        openPortfolioMutationNotice(error);
        throw error;
      }
    },
    [openPortfolioMutationNotice],
  );

  const handleSaveTrade = useCallback(
    async (portfolioId: string, trade: Trade): Promise<void> => {
      await runPortfolioMutation(() => handleAddTrade(portfolioId, trade));
      scheduleInterstitialAd(INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE);
    },
    [handleAddTrade, runPortfolioMutation, scheduleInterstitialAd],
  );

  useEffect(() => {
    return () => {
      if (settlementDetailsCloseUiDedupeTimerRef.current !== null) {
        window.clearTimeout(settlementDetailsCloseUiDedupeTimerRef.current);
        settlementDetailsCloseUiDedupeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (detailsTargetId === null) {
      return;
    }
    settlementDetailsCloseUiDedupeOpenIdRef.current = null;
    if (settlementDetailsCloseUiDedupeTimerRef.current !== null) {
      window.clearTimeout(settlementDetailsCloseUiDedupeTimerRef.current);
      settlementDetailsCloseUiDedupeTimerRef.current = null;
    }
  }, [detailsTargetId]);

  const closedPortfolios = useMemo(
    () => portfolios.filter((p) => p.isClosed),
    [portfolios],
  );

  const handleDeleteCurrentPortfolioTrade = useCallback(
    (tradeId: string) => {
      if (detailsTargetId === null) {
        return;
      }
      void handleDeleteTrade(detailsTargetId, tradeId).catch(
        (error: unknown) => {
          openPortfolioMutationNotice(error);
        },
      );
    },
    [detailsTargetId, handleDeleteTrade, openPortfolioMutationNotice],
  );

  const handlePortfolioDetailsModalClose = useCallback(() => {
    const openId = detailsTargetId;
    if (openId === null) {
      return;
    }
    const portfolio = portfoliosRef.current.find((item) => item.id === openId);

    if (settlementDetailsCloseUiDedupeOpenIdRef.current === openId) {
      return;
    }
    settlementDetailsCloseUiDedupeOpenIdRef.current = openId;
    if (settlementDetailsCloseUiDedupeTimerRef.current !== null) {
      window.clearTimeout(settlementDetailsCloseUiDedupeTimerRef.current);
    }
    settlementDetailsCloseUiDedupeTimerRef.current = window.setTimeout(() => {
      settlementDetailsCloseUiDedupeTimerRef.current = null;
      settlementDetailsCloseUiDedupeOpenIdRef.current = null;
    }, UI_DOUBLE_CLICK_PREVENTION_MS);
    setDetailsTargetId(null);
    if (portfolio?.isClosed) {
      scheduleInterstitialAd(INTERSTITIAL_PLACEMENT_KEYS.SETTLEMENT_DETAIL);
    }
  }, [detailsTargetId, scheduleInterstitialAd]);

  const handleCloseAuthModal = useCallback(() => {
    setShouldShowSignedInWelcome(false);
    setAuthModal(null);
  }, []);

  const handleRequestMiniAppExit = useCallback(async (): Promise<void> => {
    try {
      await Promise.resolve(closeView());
    } catch (error: unknown) {
      console.error('Failed to execute Toss closeView:', error);
      throw error;
    }
  }, []);

  const handleCommitSignedIn = useCallback(
    (signedInUser: { id: string; email: string }) => {
      setUser(signedInUser);
      justLoggedInRef.current = true;

      // 로그인 성공 직후 모달 전환이 fetch 완료에 막히지 않도록 백그라운드 프리로드로 분리합니다.
      fetchUserProfile(signedInUser.id).catch((error: unknown) => {
        console.warn('[Auth] signed-in profile preload failed:', error);
      });
      fetchPortfolios(signedInUser.id);
    },
    [fetchPortfolios, fetchUserProfile, justLoggedInRef, setUser],
  );

  const handleFinishSignedInFlow = useCallback(
    async (
      _signedInUser: { id: string; email: string },
      options: FinishSignedInFlowOptions,
    ) => {
      setShouldShowSignedInWelcome(options.shouldShowWelcome);
      setAuthModal('profile');
    },
    [setAuthModal],
  );

  const handleSwitchAuthModalType = useCallback(
    (
      nextType:
        | 'login'
        | 'signup'
        | 'profile'
        | 'reset-password'
        | 'change-password',
    ) => {
      setShouldShowSignedInWelcome(false);
      setAuthModal(nextType);
    },
    [],
  );

  const handleSignedInWelcomeComplete = useCallback(() => {
    setShouldShowSignedInWelcome(false);
  }, []);

  const handleRequestBackNavigation = useCallback(
    (onLeave: () => void) => {
      if (!isInTossApp) {
        onLeave();
        return;
      }

      const exitMessage = TDS_DIALOG_MESSAGES[lang]?.exit?.back_navigation;
      if (exitMessage == null) {
        onLeave();
        return;
      }

      navigationExitDialog.open({
        title: exitMessage.title ?? '',
        body: exitMessage.body ?? '',
        confirmLabel: exitMessage.confirm ?? '',
        tone: 'primary',
        action: onLeave,
      });
    },
    [isInTossApp, lang, navigationExitDialog.open],
  );

  const currentAlarmPortfolio = portfolios.find(p => p.id === alarmTargetId);
  const currentDetailsPortfolio = portfolios.find(p => p.id === detailsTargetId);
  const currentQuickInputPortfolio = portfolios.find(p => p.id === quickInputTargetId);
  const currentExecutionPortfolio = portfolios.find(p => p.id === executionTargetId);
  const currentAIImagePortfolio = portfolios.find(p => p.id === aiImageTargetId);
  const currentTerminatePortfolio = portfolios.find(p => p.id === terminateTargetId);

  const [portfolioLimitNoticeMax, setPortfolioLimitNoticeMax] = useState<number | null>(null);

  const handleRequestOpenCreator = useCallback(() => {
    const maxAllowed = getMaxPortfolios(userProfile);
    if (activePortfolios.length >= maxAllowed) {
      setPortfolioLimitNoticeMax(maxAllowed);
      return;
    }
    setIsCreatorOpen(true);
  }, [activePortfolios.length, userProfile]);

  const handlePortfolioLimitNoticeClose = useCallback(() => {
    setPortfolioLimitNoticeMax(null);
  }, []);

  const handleNavigateDashboard = useCallback(() => {
    setActiveTab('dashboard');
  }, [setActiveTab]);

  const handleOpenLogin = useCallback(() => {
    setAuthModal('login');
  }, [setAuthModal]);

  const handleOpenSignup = useCallback(() => {
    setAuthModal('signup');
  }, [setAuthModal]);

  const handleOpenQuickInput = useCallback(
    (id: string, activeSection: 1 | 2 | 3 | undefined) => {
      setQuickInputTargetId(id);
      setQuickInputActiveSection(activeSection);
    },
    [setQuickInputTargetId, setQuickInputActiveSection],
  );

  const { run: handleUpdatePortfolioForDashboard } = useMutexAction(
    useCallback(
      async (portfolio: Portfolio) => {
        try {
          await Promise.resolve(handleUpdatePortfolio(portfolio));
        } catch (error: unknown) {
          openPortfolioMutationNotice(error);
        }
      },
      [handleUpdatePortfolio, openPortfolioMutationNotice],
    ),
  );

  const { run: handleDeletePortfolio } = useMutexAction(
    useCallback(
      async (id: string) => {
        const shellCopy = APP_SHELL_MESSAGES[lang];

        try {
          await deletePortfolioById(id);
        } catch (error: unknown) {
          showErrorToast(shellCopy.portfolioDeleteFailed);
          console.error('[Portfolio] delete failed:', error);
        }
      },
      [deletePortfolioById, lang],
    ),
  );

  const { run: handleSafeDeleteHistory } = useMutexAction(
    useCallback(
      async (portfolioId: string) => {
        const shellCopy = APP_SHELL_MESSAGES[lang];

        try {
          await handleDeleteHistory(portfolioId);
        } catch (error: unknown) {
          showErrorToast(shellCopy.historyEntryDeleteFailed);
          console.error('[History] delete failed:', error);
        }
      },
      [handleDeleteHistory, lang],
    ),
  );

  const { run: handleSafeClearHistory } = useMutexAction(
    useCallback(
      async () => {
        const shellCopy = APP_SHELL_MESSAGES[lang];

        try {
          await handleClearHistory();
        } catch (error: unknown) {
          showErrorToast(shellCopy.historyClearFailed);
          console.error('[History] clear failed:', error);
        }
      },
      [handleClearHistory, lang],
    ),
  );

  const handleBackToDashboard = useCallback(
    (hash: string) => {
      handleRequestBackNavigation(() => {
        setActiveTab('dashboard');
        replaceHashIfMatched(hash);
      });
    },
    [handleRequestBackNavigation, setActiveTab, replaceHashIfMatched],
  );

  const MainContent = () => (
    <div className="min-h-screen transition-colors duration-500 bg-slate-50 dark:bg-slate-950 dark:text-slate-200">
      <div className="pb-32">
        <header className="sticky top-0 z-40 w-full glass glass-header px-6 md:px-12 py-5 flex items-center justify-between border-b border-slate-200/50 dark:border-white/10">
          <HeaderBrandButton
            currentTier={paidTier}
            lang={lang}
            tierClassName={tierClassName}
            tierIconClassName={tierIconClassName}
            tierLabel={tierLabel}
            TierIcon={TierIcon}
            onNavigateDashboard={handleNavigateDashboard}
          />
          
          <div className="flex items-center gap-2 md:gap-8">
            <button 
              onClick={async () => {
                const nextLang: 'ko' | 'en' = lang === 'ko' ? 'en' : 'ko';
                setLang(nextLang);

                if (user?.id) {
                  try {
                    const { error } = await supabase
                      .from('user_profiles')
                      .update({ preferred_language: nextLang })
                      .eq('id', user.id);
                    if (error) {
                      console.warn('[LangToggle] failed to update preferred_language:', error.message);
                    } else {
                      setUserProfile((prev) => prev ? { ...prev, preferred_language: nextLang } : prev);
                    }
                  } catch (err) {
                    console.warn('[LangToggle] unexpected error updating preferred_language:', err);
                  }
                }
              }}
              className="px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-black uppercase transition-all hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <Languages size={14} />
              {lang}
            </button>
            
            {!isInTossApp && (
              <button
                type="button"
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="w-10 h-10 rounded-full flex items-center justify-center glass hover:scale-110 transition-all text-lg"
              >
                {isDarkMode ? '☀️' : '🌙'}
              </button>
            )}

            <div className="flex items-center gap-4 pl-4 border-l border-slate-200 dark:border-slate-800">
              <button 
                onClick={() => user ? setAuthModal('profile') : setAuthModal('login')}
                className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg border-2 border-white/20 active:scale-90 transition-transform"
              >
                 <UserCircle className="text-white" size={24} />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 md:px-16 py-10">
          <TabContent
            activeTab={activeTab}
            lang={lang}
            user={user}
            activePortfolios={activePortfolios}
            portfolios={portfolios}
            closedPortfolios={closedPortfolios}
            canAccessPaidStocks={canAccessPaidStocks}
            currentTier={currentTier}
            totalValuation={totalValuation}
            totalValuationChange={totalValuationChange}
            totalValuationChangePct={totalValuationChangePct}
            onDailyExecutionSummaryChange={onDailyExecutionSummaryChange}
            onOpenLogin={handleOpenLogin}
            onOpenSignup={handleOpenSignup}
            onRequestOpenCreator={handleRequestOpenCreator}
            onOpenAlarm={setAlarmTargetId}
            onOpenDetails={setDetailsTargetId}
            onOpenQuickInput={handleOpenQuickInput}
            onOpenExecution={setExecutionTargetId}
            onOpenAIImage={setAiImageTargetId}
            onClosePortfolio={setTerminateTargetId}
            onDeletePortfolio={handleDeletePortfolio}
            onUpdatePortfolio={handleUpdatePortfolioForDashboard}
            onDeleteHistory={handleSafeDeleteHistory}
            onClearHistory={handleSafeClearHistory}
            onSelectCheckoutPlan={setCheckoutPlan}
            onBackToDashboard={handleBackToDashboard}
          />
        </main>

        <div className="floating-nav w-[calc(100%-3rem)] md:w-auto">
          <nav className="glass rounded-full px-4 py-3 flex items-center gap-2 md:gap-6 shadow-2xl border border-white/10 premium-shadow min-w-[320px] justify-center">
            <NavIcon active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={22} />} label={t.dashboard} />
            <NavIcon active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<HistoryIcon size={22} />} label={t.history} />
            <NavIcon active={activeTab === 'markets'} onClick={() => setActiveTab('markets')} icon={<BarChart3 size={22} />} label={t.markets} />
            <NavIcon active={activeTab === 'pricing'} onClick={() => setActiveTab('pricing')} icon={<Crown size={22} />} label={t.membership} />
            <NavIcon
              active={false}
              onClick={() => {}}
              icon={<LineChart size={22} />}
              label={t.backtest}
              disabled
              tooltip={shellCopy.backtestPreparingTooltip}
              tooltipIcon={<Hammer size={16} className="text-indigo-400" />}
            />
            {!isInTossApp && (
              <a
                href="/posts"
                className="flex flex-col items-center gap-1 transition-all px-2 md:px-4 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-xl"
                aria-label={shellCopy.communityBoardAria}
              >
                <div className="p-2.5 rounded-xl transition-all duration-300 text-slate-500 hover:text-slate-300 hover:bg-white/5">
                  <FileText size={22} aria-hidden />
                </div>
                <span className="text-[9px] font-black uppercase tracking-tighter hidden md:block text-slate-500">
                  {shellCopy.communityBoardLabel}
                </span>
              </a>
            )}
          </nav>
        </div>

        {isCreatorOpen && (
          <React.Suspense fallback={LAZY_MODAL_FALLBACK}>
            <StrategyCreator
              lang={lang}
              onClose={() => setIsCreatorOpen(false)}
              onSave={async (newP) => {
                try {
                  await runPortfolioMutation(() => handleAddPortfolio(newP));
                  setIsCreatorOpen(false);
                  scheduleInterstitialAd(
                    INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE,
                  );
                } catch (_error: unknown) {}
              }}
              canAccessPaidStocks={canAccessPaidStocks}
              maxPortfolios={getMaxPortfolios(userProfile)}
              currentPortfolioCount={activePortfolios.length}
            />
          </React.Suspense>
        )}
        {currentAlarmPortfolio && (
          <React.Suspense fallback={LAZY_MODAL_FALLBACK}>
            <AlarmModal
              lang={lang}
              portfolio={currentAlarmPortfolio}
              onClose={() => setAlarmTargetId(null)}
              onSave={async (config) => {
                const tz = userProfile?.timezone || getDeviceTimeZone();
                const nextConfig = { ...config, timezone: config.timezone || tz };
                try {
                  await runPortfolioMutation(() =>
                    handleUpdatePortfolio({
                      ...currentAlarmPortfolio,
                      alarmconfig: nextConfig,
                    }),
                  );
                  setAlarmTargetId(null);
                  scheduleInterstitialAd(
                    INTERSTITIAL_PLACEMENT_KEYS.ALARM_SAVE,
                  );
                } catch (_error: unknown) {}
              }}
              maxAlarms={getMaxAlarms(userProfile)}
            />
          </React.Suspense>
        )}
        {currentDetailsPortfolio && (
          <React.Suspense fallback={LAZY_MODAL_FALLBACK}>
            <PortfolioDetailsModal
              lang={lang}
              portfolio={currentDetailsPortfolio}
              onClose={handlePortfolioDetailsModalClose}
              onDeleteTrade={handleDeleteCurrentPortfolioTrade}
              isHistory={currentDetailsPortfolio.isClosed}
            />
          </React.Suspense>
        )}
        {currentQuickInputPortfolio && (
          <React.Suspense fallback={LAZY_MODAL_FALLBACK}>
            <QuickInputModal
              lang={lang}
              portfolio={currentQuickInputPortfolio}
              activeSection={quickInputActiveSection}
              onClose={() => {
                setQuickInputTargetId(null);
                setQuickInputActiveSection(undefined);
              }}
              onSave={async (trade) => {
                try {
                  await handleSaveTrade(currentQuickInputPortfolio.id, trade);
                  setQuickInputTargetId(null);
                  setQuickInputActiveSection(undefined);
                } catch (_error: unknown) {}
              }}
            />
          </React.Suspense>
        )}
        {currentExecutionPortfolio && (
          <TradeExecutionModal
            lang={lang}
            portfolio={currentExecutionPortfolio}
            onClose={() => setExecutionTargetId(null)}
            onSave={async (trade) => {
              try {
                await handleSaveTrade(currentExecutionPortfolio.id, trade);
                setExecutionTargetId(null);
              } catch (_error: unknown) {}
            }}
          />
        )}
        {currentAIImagePortfolio && (
          <React.Suspense fallback={LAZY_MODAL_FALLBACK}>
            <AIImageInputModal
              lang={lang}
              portfolio={currentAIImagePortfolio}
              geminiApiKey={geminiApiKey}
              isPaidUser={currentTier !== 'free'}
              currentTier={paidTier}
              onClose={() => setAiImageTargetId(null)}
              onSave={async (trades, _skipAd) => {
                try {
                  for (const trade of trades) {
                    await runPortfolioMutation(() =>
                      handleAddTrade(currentAIImagePortfolio.id, trade),
                    );
                  }
                  setAiImageTargetId(null);
                  scheduleInterstitialAd(INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE);
                } catch (_error: unknown) {}
              }}
            />
          </React.Suspense>
        )}

        {currentTerminatePortfolio && (
          <TerminationInput
            lang={lang}
            portfolio={currentTerminatePortfolio}
            onClose={() => setTerminateTargetId(null)}
            onSave={async (finalSells, additionalFee) => {
              try {
                const result = await runPortfolioMutation(() =>
                  handleClosePortfolio(
                    currentTerminatePortfolio.id,
                    finalSells,
                    additionalFee,
                  ),
                );
                if (result) {
                  setSettlementResult(result);
                  setTerminateTargetId(null);
                  scheduleInterstitialAd(
                    INTERSTITIAL_PLACEMENT_KEYS.SETTLEMENT_DETAIL,
                  );
                }
              } catch (_error: unknown) {}
            }}
          />
        )}
        {settlementResult && (
          <SettlementResult 
            lang={lang} 
            result={settlementResult} 
            onClose={() => setSettlementResult(null)} 
          />
        )}
        
        {authModal && (
          <AuthModalCoordinator
            isOpen={authModal != null}
            lang={lang} 
            type={authModal} 
            onCloseAuthModal={handleCloseAuthModal}
            onRequestMiniAppExit={handleRequestMiniAppExit}
            onCommitSignedIn={handleCommitSignedIn}
            onFinishSignedInFlow={handleFinishSignedInFlow}
            onSwitchType={handleSwitchAuthModalType}
            shouldShowSignedInWelcome={shouldShowSignedInWelcome}
            onCompleteSignedInWelcome={handleSignedInWelcomeComplete}
            onLogout={async () => { 
              try {
                const { error } = await supabase.auth.signOut();
                if (error) {
                  console.error('Logout error:', error);
                }
                clearAuthStorage();
                setUser(null); 
                setUserProfile(null);
                setPortfolios([]); 
                setShouldShowSignedInWelcome(false);
                setAuthModal(null);
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              } catch (err) {
                console.error('Unexpected logout error:', err);
                clearAuthStorage();
                setUser(null); 
                setUserProfile(null);
                setPortfolios([]); 
                setShouldShowSignedInWelcome(false);
                setAuthModal(null);
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }
            }}
            currentUserEmail={user?.email}
            currentTier={paidTier}
            currentUserId={user?.id ?? undefined}
            onUpgradePlan={(planId) => {
              if (!user) {
                setAuthModal('login');
                return;
              }
              setCheckoutPlan(planId);
            }}
            telegramConnectedAt={userProfile?.telegram_connected_at ?? null}
            telegramAlertsEnabled={userProfile?.telegram_enabled ?? false}
            onTelegramAlertsEnabledChange={async (enabled) => {
              if (!user?.id) return;
              try {
                const { error } = await supabase
                  .from('user_profiles')
                  .update({ telegram_enabled: enabled })
                  .eq('id', user.id);
                if (error) throw error;
                setUserProfile((prev) => (prev ? { ...prev, telegram_enabled: enabled } : null));
              } catch (e) {
                console.warn('[Profile] telegram_enabled update failed:', e);
              }
            }}
          />
        )}

        {(() => {
          const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
          if (labels == null) {
            return null;
          }
          return (
            <TdsConfirmDialog
              {...navigationExitDialog.dialogProps}
              labels={labels}
            />
          );
        })()}

        <SessionExpiredAlertGate
          lang={lang}
          isOpen={hasSessionExpired}
          onClose={handleDismissSessionExpired}
        />

        {portfolioLimitNoticeMax != null ? (() => {
          const limitLabels = TDS_DIALOG_MESSAGES[lang]?.actions;
          const appMessages = TDS_DIALOG_MESSAGES[lang]?.app;
          const acknowledge = TDS_DIALOG_MESSAGES[lang]?.common?.acknowledge;
          if (limitLabels == null || appMessages == null || acknowledge == null) {
            return null;
          }
          return (
            <TdsAlertDialog
              isOpen
              title={appMessages.portfolioLimitTitle}
              body={appMessages.portfolioLimitBody(portfolioLimitNoticeMax)}
              confirmLabel={acknowledge}
              labels={limitLabels}
              onClose={handlePortfolioLimitNoticeClose}
            />
          );
        })() : null}

        {portfolioMutationNotice != null ? (() => {
          const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
          const acknowledge = TDS_DIALOG_MESSAGES[lang]?.common?.acknowledge;
          if (labels == null || acknowledge == null) {
            return null;
          }

          return (
            <TdsAlertDialog
              isOpen
              title={portfolioMutationNotice.title}
              body={portfolioMutationNotice.body}
              confirmLabel={acknowledge}
              labels={labels}
              onClose={handlePortfolioMutationNoticeClose}
            />
          );
        })() : null}
      </div>

      {checkoutPlan && (
        <React.Suspense fallback={null}>
          <CheckoutModal
            isOpen={!!checkoutPlan}
            onClose={() => setCheckoutPlan(null)}
            lang={lang}
            customerEmail={user?.email}
            customerId={user?.id}
            onPaymentSuccess={() => {
              setCheckoutPlan(null);
              if (user?.id) fetchUserProfile(user.id);
            }}
          />
        </React.Suspense>
      )}

      <Footer
        onNavigateTerms={() => {
          setActiveTab('terms');
          const u = window.location;
          window.history.replaceState(null, '', u.pathname + u.search + '#terms');
        }}
        onNavigatePrivacy={() => {
          setActiveTab('privacy');
          const u = window.location;
          window.history.replaceState(null, '', u.pathname + u.search + '#privacy');
        }}
        onNavigateRefundPolicy={() => {
          setActiveTab('terms');
          const u = window.location;
          window.history.replaceState(null, '', u.pathname + u.search + '#terms');
        }}
      />
      </div>
  );

  return (
    <TossAppProvider>
      <AdPreloadProvider
        manager={GLOBAL_INTERSTITIAL_AD_MANAGER}
        userTier={adsUserTier}
      >
        <AdPreloadBridge onShowInstantAdChange={handleShowInstantAdChange} />
        <TDSWrapper isInTossApp={isInTossApp}>
          <MainContent />
        </TDSWrapper>
      </AdPreloadProvider>
    </TossAppProvider>
  );
};

const TDSWrapper: React.FC<{ isInTossApp: boolean; children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

interface NavIconProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  tooltip?: string;
  tooltipIcon?: React.ReactNode;
}

const NAV_ICON_TOOLTIP_HIDE_MS = 3000;
const NAV_ICON_TOOLTIP_MIN_WIDTH_PX = 220;

function getNavIconButtonClassName(): string {
  return 'flex flex-col items-center gap-1 transition-all px-2 md:px-4';
}

function getNavIconSurfaceClassName(
  isActive: boolean,
  isDisabled: boolean,
): string {
  if (isActive) {
    return 'p-2.5 rounded-xl transition-all duration-300 bg-blue-600 text-white shadow-lg';
  }

  if (isDisabled) {
    return 'p-2.5 rounded-xl transition-all duration-300 text-slate-500/60 bg-white/0 cursor-not-allowed';
  }

  return 'p-2.5 rounded-xl transition-all duration-300 text-slate-500 hover:text-slate-300 hover:bg-white/5';
}

function getNavIconLabelClassName(
  isActive: boolean,
  isDisabled: boolean,
): string {
  if (isActive) {
    return 'text-[9px] font-black uppercase tracking-tighter hidden md:block transition-colors text-blue-500';
  }

  if (isDisabled) {
    return 'text-[9px] font-black uppercase tracking-tighter hidden md:block transition-colors text-slate-500/60';
  }

  return 'text-[9px] font-black uppercase tracking-tighter hidden md:block transition-colors text-slate-500';
}

const NavIcon: React.FC<NavIconProps> = ({ active, onClick, icon, label, disabled, tooltip, tooltipIcon }) => {
  const [isTooltipVisible, setIsTooltipVisible] = React.useState(false);
  const hideTimeoutRef = React.useRef<number | null>(null);
  const tooltipId = React.useId();
  const isActive = !disabled && active;

  const clearTooltipTimer = React.useCallback(() => {
    if (hideTimeoutRef.current == null) {
      return;
    }

    window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = null;
  }, []);

  const showDisabledTooltip = React.useCallback(() => {
    if (!tooltip) {
      return;
    }

    clearTooltipTimer();
    setIsTooltipVisible(true);
    hideTimeoutRef.current = window.setTimeout(() => {
      setIsTooltipVisible(false);
      hideTimeoutRef.current = null;
    }, NAV_ICON_TOOLTIP_HIDE_MS);
  }, [clearTooltipTimer, tooltip, setIsTooltipVisible]);

  const handleClick = React.useCallback(() => {
    if (disabled) {
      showDisabledTooltip();
      return;
    }

    onClick();
  }, [disabled, onClick, showDisabledTooltip]);

  React.useEffect(() => {
    return () => {
      clearTooltipTimer();
    };
  }, [clearTooltipTimer]);

  return (
    <div className="relative flex flex-col items-center group">
      {tooltip && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute -top-16 z-50 flex items-center gap-3 rounded-2xl bg-[#0F172A] px-4 py-3 shadow-2xl border border-white/10 transition-all duration-300 ${
            isTooltipVisible
              ? 'opacity-100 translate-y-0 scale-100' 
              : 'opacity-0 translate-y-2 scale-95 group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100'
          }`}
          style={{ width: 'max-content', minWidth: `${NAV_ICON_TOOLTIP_MIN_WIDTH_PX}px` }}
        >
          {tooltipIcon && (
            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <div className="animate-pulse">{tooltipIcon}</div>
            </div>
          )}
          <div className="text-[11px] font-bold leading-tight text-slate-100 whitespace-pre-line">
            {tooltip}
          </div>
          <div className="absolute left-1/2 -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-[#0F172A] border-r border-b border-white/10" />
        </div>
      )}
      <button
        type="button"
        onClick={handleClick}
        className={getNavIconButtonClassName()}
        aria-disabled={disabled ? 'true' : 'false'}
        aria-current={isActive ? 'page' : undefined}
        aria-label={label}
        aria-describedby={tooltip ? tooltipId : undefined}
      >
        <div className={getNavIconSurfaceClassName(isActive, disabled ?? false)}>
          {icon}
        </div>
        <span className={getNavIconLabelClassName(isActive, disabled ?? false)}>
          {label}
        </span>
      </button>
    </div>
  );
};

export default App;