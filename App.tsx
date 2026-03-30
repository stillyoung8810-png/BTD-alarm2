import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Portfolio, Trade } from './types';
import { I18N } from './constants';
import Footer from './components/Footer';
import Privacy from './components/Privacy';
import Terms from './components/Terms';
import TradeExecutionModal from './components/TradeExecutionModal';
import { TerminationInput, Result as SettlementResult } from './components/SettlementModals';
import Landing from './components/Landing';
import Pricing from './components/Pricing';
import { supabase, clearAuthStorage } from './services/supabase';
import { calculateTotalInvested, calculateHoldings } from './utils/portfolioCalculations';
import { fetchStockPricesWithPrev, loadInitialStockData, loadPaidStockData } from './services/stockService';
import { getUSSelectionHolidays } from './utils/marketUtils';
import { getCurrentKSTDateString, getDeviceTimeZone } from './utils/dateUtils';
import { useFCMToken } from './hooks/useFCMToken';
import { useAuth } from './hooks/useAuth';
import { usePortfolios } from './hooks/usePortfolios';
import { isTossApp } from './services/tossAppBridge';
import { showInterstitialOnTransition, AdPlacement, type UserTier } from './services/ads/adService';
import { restorePendingIapOrders } from './services/payment/tossIapService';
import { TossAppProvider } from './contexts/TossAppContext';
import { buildDailyExecutionSummary } from './utils/dailyExecutionSummary';
import { MembershipConfig } from './constants/membership';
import { formatPriceKRW } from './utils/currency';
import { TdsAlertDialog } from './components/tds-adapter/TdsAlertDialog';
import { TdsConfirmDialog } from './components/tds-adapter/TdsConfirmDialog';
import { useAsyncTdsConfirm } from './components/tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from './constants/tdsDialogMessages';
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
import { useTierDisplay } from './hooks/useTierDisplay';
import AuthModalCoordinator from './components/auth/AuthModalCoordinator';

const Backtest = React.lazy(() => import('./components/Backtest'));
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const Markets = React.lazy(() => import('./components/Markets'));
const History = React.lazy(() => import('./components/History'));
const QuickInputModal = React.lazy(() => import('./components/QuickInputModal'));
const CheckoutModal = React.lazy(() => import('./components/CheckoutModal'));
const StrategyCreator = React.lazy(() => import('./components/StrategyCreator'));
const AlarmModal = React.lazy(() => import('./components/AlarmModal'));
const PortfolioDetailsModal = React.lazy(() => import('./components/PortfolioDetailsModal'));
const AIImageInputModal = React.lazy(() => import('./components/AIImageInputModal'));

/** Lazy-loaded 모달 공통 Suspense fallback — DRY */
const LAZY_MODAL_FALLBACK = (
  <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/80 text-slate-400 font-bold">…</div>
);

/** 정산 상세 닫기 전면: 실제 노출 후 재호출 쿨타임 */
const SETTLEMENT_DETAIL_EXIT_INTERSTITIAL_COOLDOWN_MS = 5_000;
/** 동일 openId 닫기: setTimeout 기반 물리적 더블 입력 디듀프 */
const UI_DOUBLE_CLICK_PREVENTION_MS = 300;

type ActiveTab = 'dashboard' | 'markets' | 'history' | 'backtest' | 'pricing' | 'privacy' | 'terms';

const App: React.FC = () => {
  const [lang, setLang] = useState<'ko' | 'en'>('ko');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  /** 웹: 기존과 동일 기본 다크. 토스 미니앱: 출시 가이드(라이트 테마)에 맞춰 라이트 고정. */
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof window !== 'undefined' && isTossApp() ? false : true,
  );
  const [checkoutPlan, setCheckoutPlan] = useState<'pro' | 'premium' | null>(null);
  const fetchPortfoliosRef = useRef<(userId: string) => void>(() => {});

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

  const dailyExecutionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  } = useAuth({
    lang,
    setPortfolios,
    saveFCMToken,
    fetchPortfoliosRef,
  });

  const {
    fetchPortfolios,
    handleAddPortfolio,
    handleClosePortfolio,
    handleUpdatePortfolio,
    handleAddTrade,
    handleDeleteTrade,
    handleDeletePortfolio,
    handleDeleteHistory,
    handleClearHistory,
  } = usePortfolios({
    lang,
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
  const currentTier = effectiveSubscription.tier.toLowerCase();

  const adsUserTier = useMemo((): UserTier => {
    if (currentTier === 'pro' || currentTier === 'premium') {
      return currentTier;
    }
    return 'free';
  }, [currentTier]);

  const canAccessPaidStocks = useMemo(() => {
    const tierOk = currentTier === 'pro' || currentTier === 'premium';
    return tierOk && effectiveSubscription.isActive && !effectiveSubscription.isExpired;
  }, [currentTier, effectiveSubscription.isActive, effectiveSubscription.isExpired]);

  const { tierLabel, tierClassName, TierIcon, tierIconClassName } = useTierDisplay(currentTier);

  const geminiApiKey = useMemo(() => {
    const isPaid = currentTier === 'pro' || currentTier === 'premium';
    const paid = import.meta.env.VITE_GEMINI_API_KEY_PAID;
    const free = import.meta.env.VITE_GEMINI_API_KEY_FREE;
    const fallback =
      import.meta.env.VITE_GEMINI_API_KEY ||
      (process as { env?: { API_KEY?: string } }).env?.API_KEY;
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
  const isInTossApp = isTossApp();

  useEffect(() => {
    if (!isInTossApp) return;
    setIsDarkMode(false);
  }, [isInTossApp]);

  useEffect(() => {
    if (!user?.id) return;
    if (!summaryToSave || summaryToSave.trim().length === 0) return;

    if (dailyExecutionDebounceRef.current) {
      clearTimeout(dailyExecutionDebounceRef.current);
    }

    dailyExecutionDebounceRef.current = setTimeout(async () => {
      try {
        if (lastSavedSummaryRef.current === summaryToSave) {
          return;
        }

        const summaryDate = getCurrentKSTDateString();

        const { error } = await supabase
          .from('daily_execution_summaries')
          .upsert(
            {
              user_id: user.id,
              summary_date: summaryDate,
              summary_text: summaryToSave,
              lang,
            },
            {
              onConflict: 'user_id,summary_date',
            } as any,
          );

        if (error) {
          console.warn('[DailyExecution] upsert error:', error.message);
        } else {
          lastSavedSummaryRef.current = summaryToSave;
          console.log('[DailyExecution] summary upserted for', summaryDate);
        }
      } catch (err) {
        console.warn('[DailyExecution] upsert failed:', err);
      }
    }, 3000);

    return () => {
      if (dailyExecutionDebounceRef.current) {
        clearTimeout(dailyExecutionDebounceRef.current);
        dailyExecutionDebounceRef.current = null;
      }
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

  // 🚀 패치 1: 퀵입력/실행 모달 저장 (currentTier 주입)
  const handleAddTradeWithAd = async (portfolioId: string, trade: Trade) => {
    await handleAddTrade(portfolioId, trade);
    await showInterstitialOnTransition(AdPlacement.INTERSTITIAL_TRADE_SAVE, adsUserTier);
  };

  const portfoliosRef = useRef<Portfolio[]>(portfolios);
  useEffect(() => {
    portfoliosRef.current = portfolios;
  }, [portfolios]);

  const isSettlementExitAdPipelineActiveRef = useRef(false);
  const lastSettlementExitInterstitialShownAtMsRef = useRef(0);
  const settlementDetailsCloseUiDedupeOpenIdRef = useRef<string | null>(null);
  const settlementDetailsCloseUiDedupeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationExitDialog = useAsyncTdsConfirm(lang);

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
      handleDeleteTrade(detailsTargetId, tradeId);
    },
    [detailsTargetId, handleDeleteTrade],
  );

  const handlePortfolioDetailsModalClose = useCallback(() => {
    const openId = detailsTargetId;
    if (openId === null) {
      return;
    }

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

    const portfolio = portfoliosRef.current.find((p) => p.id === openId);

    setDetailsTargetId(null);

    if (!portfolio?.isClosed) {
      return;
    }

    if (
      Date.now() - lastSettlementExitInterstitialShownAtMsRef.current <
      SETTLEMENT_DETAIL_EXIT_INTERSTITIAL_COOLDOWN_MS
    ) {
      return;
    }

    if (isSettlementExitAdPipelineActiveRef.current) {
      return;
    }

    const tierForAd: UserTier = adsUserTier;

    isSettlementExitAdPipelineActiveRef.current = true;

    void (async () => {
      try {
        const result = await showInterstitialOnTransition(
          AdPlacement.INTERSTITIAL_SETTLEMENT_DETAIL,
          tierForAd,
        );
        if (result.shown) {
          lastSettlementExitInterstitialShownAtMsRef.current = Date.now();
        }
      } catch (error: unknown) {
        console.error('[Ad] Settlement detail exit interstitial failed:', error);
      } finally {
        isSettlementExitAdPipelineActiveRef.current = false;
      }
    })();
  }, [detailsTargetId, adsUserTier]);

  const handleCloseAuthModal = useCallback(() => {
    setAuthModal(null);
  }, []);

  const handleRequestMiniAppExit = useCallback((): void => {
    // 공식 미니앱 종료 API는 아직 앱 경계에 연결하지 않았다.
  }, []);

  const handleRequestBackNavigation = useCallback(
    (onLeave: () => void) => {
      if (!isInTossApp) {
        onLeave();
        return;
      }

      const exitMessage = TDS_DIALOG_MESSAGES[lang]?.exit?.back_navigation;
      if (exitMessage == null) {
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

  const tabContentNode = useMemo((): React.ReactNode => {
    const dashboardFallback = <div className="flex items-center justify-center min-h-[50vh] text-slate-500 dark:text-slate-400 font-bold">{lang === 'ko' ? '대시보드 로딩 중…' : 'Loading dashboard…'}</div>;
    const genericFallback = <div className="flex items-center justify-center min-h-[50vh] text-slate-500 dark:text-slate-400 font-bold">{lang === 'ko' ? '로딩 중…' : 'Loading…'}</div>;
    switch (activeTab) {
      case 'dashboard':
        return user ? (
          <React.Suspense fallback={dashboardFallback}>
            <Dashboard
              lang={lang}
              portfolios={activePortfolios}
              onClosePortfolio={(id) => setTerminateTargetId(id)}
              onDeletePortfolio={handleDeletePortfolio}
              onUpdatePortfolio={handleUpdatePortfolio}
              onOpenCreator={handleRequestOpenCreator}
              onOpenAlarm={(id) => setAlarmTargetId(id)}
              onOpenDetails={(id) => setDetailsTargetId(id)}
              onOpenQuickInput={(id, activeSection) => {
                setQuickInputTargetId(id);
                setQuickInputActiveSection(activeSection);
              }}
              onOpenExecution={(id) => setExecutionTargetId(id)}
              onOpenAIImage={(id) => setAiImageTargetId(id)}
              totalValuation={totalValuation}
              totalValuationChange={totalValuationChange}
              totalValuationChangePct={totalValuationChangePct}
              onDailyExecutionSummaryChange={onDailyExecutionSummaryChange}
            />
          </React.Suspense>
        ) : (
          <Landing
            lang={lang}
            onOpenSignup={() => setAuthModal('signup')}
            onOpenLogin={() => setAuthModal('login')}
          />
        );
      case 'markets':
        return (
          <React.Suspense fallback={genericFallback}>
            <Markets
              lang={lang}
              portfolios={portfolios}
              canAccessPaidStocks={canAccessPaidStocks}
              currentTier={currentTier === 'premium' || currentTier === 'pro' ? (currentTier as 'pro' | 'premium') : 'free'}
            />
          </React.Suspense>
        );
      case 'backtest':
        return (
          <React.Suspense fallback={<div className="flex items-center justify-center min-h-[50vh] text-slate-500 dark:text-slate-400 font-bold">백테스트 로딩 중…</div>}>
            <Backtest lang={lang} currentTier={currentTier === 'premium' || currentTier === 'pro' ? currentTier : 'free'} />
          </React.Suspense>
        );
      case 'pricing':
        return (
          <Pricing
            lang={lang}
            currentTier={currentTier === 'premium' || currentTier === 'pro' ? currentTier : 'free'}
            onUpgrade={(planId) => {
              if (!user) {
                setAuthModal('login');
                return;
              }
              setCheckoutPlan(planId);
            }}
          />
        );
      case 'history':
        return (
          <React.Suspense fallback={genericFallback}>
            <History
              lang={lang}
              portfolios={closedPortfolios}
              onOpenDetails={setDetailsTargetId}
              onDeleteHistory={handleDeleteHistory}
              onClearHistory={handleClearHistory}
            />
          </React.Suspense>
        );
      case 'privacy':
        return (
          <Privacy
            lang={lang}
            onBack={() => {
              handleRequestBackNavigation(() => {
                setActiveTab('dashboard');
                const u = window.location;
                if (u.hash === '#privacy') window.history.replaceState(null, '', u.pathname + u.search);
              });
            }}
          />
        );
      case 'terms':
        return (
          <Terms
            lang={lang}
            onBack={() => {
              handleRequestBackNavigation(() => {
                setActiveTab('dashboard');
                const u = window.location;
                if (u.hash === '#terms') window.history.replaceState(null, '', u.pathname + u.search);
              });
            }}
          />
        );
      default:
        return null;
    }
  }, [
    activeTab,
    lang,
    user,
    activePortfolios,
    portfolios,
    closedPortfolios,
    userProfile,
    currentTier,
    totalValuation,
    totalValuationChange,
    totalValuationChangePct,
    onDailyExecutionSummaryChange,
    canAccessPaidStocks,
    handleRequestBackNavigation,
    handleRequestOpenCreator,
  ]);

  const MainContent = () => (
    <div className={`min-h-screen transition-colors duration-500 bg-slate-50 dark:bg-slate-950 dark:text-slate-200`}>
      <div className="pb-32">
        <header className="sticky top-0 z-40 w-full glass glass-header px-6 md:px-12 py-5 flex items-center justify-between border-b border-slate-200/50 dark:border-white/10">
          <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setActiveTab('dashboard')}>
            <div className="w-11 h-11 relative flex items-center justify-center group-hover:scale-110 transition-all duration-300">
               <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-indigo-600 to-purple-500 rounded-xl shadow-lg shadow-blue-500/20 transform -rotate-3 group-hover:rotate-0 transition-transform"></div>
               <div className="relative z-10 text-white font-black text-xl flex items-baseline select-none">
                 <span className="tracking-tighter">B</span>
                 <span className="text-blue-300 -ml-1.5 opacity-90 transform translate-y-0.5">D</span>
               </div>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-black tracking-tight dark:text-white uppercase leading-none mb-1">
                BUY THE DIP
              </h1>
              <div style={{ marginTop: 2 }}>
                <span className={tierClassName}>
                  <TierIcon
                    size={11}
                    className={tierIconClassName}
                    {...(currentTier === 'pro'
                      ? { fill: 'currentColor', stroke: 'currentColor' }
                      : {})}
                  />
                  {tierLabel}
                </span>
              </div>
            </div>
          </div>
          
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
          {tabContentNode}
        </main>

        <div className="floating-nav w-[calc(100%-3rem)] md:w-auto">
          <nav className="glass rounded-full px-4 py-3 flex items-center gap-2 md:gap-6 shadow-2xl border border-white/10 premium-shadow min-w-[320px] justify-center">
            <NavIcon active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={22} />} label={t.dashboard} />
            <NavIcon active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<HistoryIcon size={22} />} label={t.history} />
            <NavIcon active={activeTab === 'markets'} onClick={() => setActiveTab('markets')} icon={<BarChart3 size={22} />} label={t.markets} />
            <NavIcon active={activeTab === 'pricing'} onClick={() => setActiveTab('pricing')} icon={<Crown size={22} />} label={t.membership ?? (lang === 'ko' ? '멤버십' : 'Membership')} />
            <NavIcon
              active={false}
              onClick={() => {}}
              icon={<LineChart size={22} />}
              label={t.backtest}
              disabled
              tooltip={
                lang === 'ko'
                  ? '더 나은 백테스트 경험을 위해\n다듬는 중이니 조금만 기다려 주세요.'
                  : 'Polishing for a better backtest experience.\nPlease wait a bit.'
              }
              tooltipIcon={<Hammer size={16} className="text-indigo-400" />}
            />
            {!isInTossApp && (
              <a
                href="/posts"
                className="flex flex-col items-center gap-1 transition-all px-2 md:px-4 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-xl"
                aria-label="게시판"
              >
                <div className="p-2.5 rounded-xl transition-all duration-300 text-slate-500 hover:text-slate-300 hover:bg-white/5">
                  <FileText size={22} aria-hidden />
                </div>
                <span className="text-[9px] font-black uppercase tracking-tighter hidden md:block text-slate-500">
                  게시판
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
              // 🚀 패치 3: 전략 생성기 완료 후 (currentTier 주입)
              onSave={async (newP) => {
                await handleAddPortfolio(newP, async () => {
                  await showInterstitialOnTransition(AdPlacement.INTERSTITIAL_STRATEGY_SAVE, adsUserTier);
                  setIsCreatorOpen(false);
                });
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
              // 🚀 패치 4: 알람 설정 저장 완료 후 (currentTier 주입)
              onSave={async (config) => {
                const tz = userProfile?.timezone || getDeviceTimeZone();
                const nextConfig = { ...config, timezone: config.timezone || tz };
                handleUpdatePortfolio({ ...currentAlarmPortfolio, alarmconfig: nextConfig });
                await showInterstitialOnTransition(AdPlacement.INTERSTITIAL_ALARM_SAVE, adsUserTier);
                setAlarmTargetId(null);
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
            <QuickInputModal lang={lang} portfolio={currentQuickInputPortfolio} activeSection={quickInputActiveSection} onClose={() => { setQuickInputTargetId(null); setQuickInputActiveSection(undefined); }} onSave={async (trade) => { await handleAddTradeWithAd(currentQuickInputPortfolio.id, trade); setQuickInputTargetId(null); setQuickInputActiveSection(undefined); }} />
          </React.Suspense>
        )}
        {currentExecutionPortfolio && <TradeExecutionModal lang={lang} portfolio={currentExecutionPortfolio} onClose={() => setExecutionTargetId(null)} onSave={async (trade) => { await handleAddTradeWithAd(currentExecutionPortfolio.id, trade); setExecutionTargetId(null); }} />}
        {currentAIImagePortfolio && (
          <React.Suspense fallback={LAZY_MODAL_FALLBACK}>
            <AIImageInputModal
              lang={lang}
              portfolio={currentAIImagePortfolio}
              geminiApiKey={geminiApiKey}
              isPaidUser={currentTier === 'pro' || currentTier === 'premium'}
              currentTier={currentTier === 'premium' || currentTier === 'pro' ? currentTier : 'free'}
              onClose={() => setAiImageTargetId(null)}
              // 🚀 패치 5: AI 이미지 인식 매매 저장 시 (currentTier 주입)
              onSave={async (trades, skipAd) => {
                for (const trade of trades) {
                  await handleAddTrade(currentAIImagePortfolio.id, trade);
                }
                if (!skipAd) {
                  await showInterstitialOnTransition(AdPlacement.INTERSTITIAL_TRADE_SAVE, adsUserTier);
                }
                setAiImageTargetId(null);
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
              const result = await handleClosePortfolio(
                currentTerminatePortfolio.id,
                finalSells,
                additionalFee,
              );
              if (result) {
                setSettlementResult(result);
                setTerminateTargetId(null);
              }
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
            onSwitchType={(type) => setAuthModal(type)} 
            onLogin={async (u) => { 
              setUser(u); 
              setAuthModal('profile');
              justLoggedInRef.current = true;
              fetchUserProfile(u.id);
              fetchPortfolios(u.id);
            }}
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
                setAuthModal(null);
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }
            }}
            currentUserEmail={user?.email}
            currentTier={currentTier === 'premium' || currentTier === 'pro' ? currentTier : 'free'}
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
      </div>

      {checkoutPlan && (
        <React.Suspense fallback={null}>
          <CheckoutModal
            isOpen={!!checkoutPlan}
            onClose={() => setCheckoutPlan(null)}
            lang={lang}
            plan={(() => {
              const cfg = MembershipConfig.byType[checkoutPlan];
              const lk = lang === 'ko' ? 'ko' : 'en';
              return {
                id: cfg.type,
                label: cfg.displayName,
                subtitle: cfg.subtitle[lk],
                price: cfg.rawAmount,
                priceFormatted: formatPriceKRW(cfg.rawAmount),
                features: cfg.features[lk],
              };
            })()}
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
      <TDSWrapper isInTossApp={isInTossApp}>
        <MainContent />
      </TDSWrapper>
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

const NavIcon: React.FC<NavIconProps> = ({ active, onClick, icon, label, disabled, tooltip, tooltipIcon }) => {
  const [showTooltip, setShowTooltip] = React.useState(false);
  const hideTimeoutRef = React.useRef<number | null>(null);

  const handleClick = () => {
    if (disabled) {
      if (tooltip) {
        if (hideTimeoutRef.current) {
          window.clearTimeout(hideTimeoutRef.current);
        }
        setShowTooltip(true);
        hideTimeoutRef.current = window.setTimeout(() => {
          setShowTooltip(false);
        }, 3000);
      }
      return;
    }
    onClick();
  };

  const isActive = !disabled && active;

  return (
    <div className="relative flex flex-col items-center group">
      {tooltip && (
        <div
          className={`pointer-events-none absolute -top-16 z-50 flex items-center gap-3 rounded-2xl bg-[#0F172A] px-4 py-3 shadow-2xl border border-white/10 transition-all duration-300 ${
            showTooltip 
              ? 'opacity-100 translate-y-0 scale-100' 
              : 'opacity-0 translate-y-2 scale-95 group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100'
          }`}
          style={{ width: 'max-content', minWidth: '220px' }}
        >
          {tooltipIcon && (
            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <div className="animate-pulse">
                {tooltipIcon}
              </div>
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
        className="flex flex-col items-center gap-1 transition-all px-2 md:px-4"
        aria-disabled={disabled ? 'true' : 'false'}
      >
        <div
          className={`p-2.5 rounded-xl transition-all duration-300 ${
            isActive
              ? 'bg-blue-600 text-white shadow-lg'
              : disabled
              ? 'text-slate-500/60 bg-white/0 cursor-not-allowed'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          {icon}
        </div>
        <span
          className={`text-[9px] font-black uppercase tracking-tighter hidden md:block transition-colors ${
            isActive ? 'text-blue-500' : disabled ? 'text-slate-500/60' : 'text-slate-500'
          }`}
        >
          {label}
        </span>
      </button>
    </div>
  );
};

export default App;