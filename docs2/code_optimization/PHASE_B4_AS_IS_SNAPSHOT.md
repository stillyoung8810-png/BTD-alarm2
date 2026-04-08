# PHASE B4 As-Is Snapshot

> B4 시뮬레이션용 스냅샷: 본문에 포함된 `components/AuthModals.tsx`, `components/portfolioDetails/usePortfolioDetailsController.ts` 전문은 워크스페이스 소스와 동기화되었습니다. **Rule 11**(인증 제출·리셋·소셜·탈퇴 경로 `useRef` 동기 뮤텍스), **Rule 7**(`TDS_DIALOG_MESSAGES[lang] ?? TDS_DIALOG_MESSAGES.ko`), **Rule 1/§0.6**(시가 없을 때 단가 폴백·`roundMoneyScalar2`)를 반영합니다.

### `App.tsx`

```tsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AlarmConfig, AppLang, Portfolio, Trade } from './types';
import { I18N } from './constants';
import Footer from './components/Footer';
import TradeExecutionModal from './components/TradeExecutionModal';
import {
  FinalSellInput,
  TerminationInput,
  Result as SettlementResult,
} from './components/SettlementModals';
import { supabase, clearAuthStorage } from './services/supabase';
import { calculateHoldings } from './utils/portfolioCalculations';
import { fetchStockPricesWithPrev, loadInitialStockData, loadPaidStockData } from './services/stockService';
import { getUSSelectionHolidays } from './utils/marketUtils';
import { getCurrentKSTDateString, getDeviceTimeZone } from './utils/dateUtils';
import { useFCMToken } from './hooks/useFCMToken';
import { useAuth } from './hooks/useAuth';
import { usePortfolios } from './hooks/usePortfolios';
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
import {
  getPortfolioMutationNotice,
  isPortfolioMutationErrorCode,
  PORTFOLIO_MUTATION_ERROR_CODES,
} from './constants/portfolioMutationErrors';
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
import { getTierNameLabel } from './utils/tierNameLabel';
import AuthModalCoordinator from './components/auth/AuthModalCoordinator';
import { replaceHashIfMatched } from './utils/appEntryHelpers';
import { TabContent, type ActiveTab } from './components/TabContent';
import QuickInputModal from './components/QuickInputModal';
import CheckoutModal from './components/CheckoutModal';
import StrategyCreator from './components/StrategyCreator';
import AlarmModal from './components/AlarmModal';
import PortfolioDetailsModal from './components/PortfolioDetailsModal';
import AIImageInputModal from './components/AIImageInputModal';
import { usePortfolioUiCommands } from './src/hooks/usePortfolioUiCommands';

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

type QuickInputSection = 1 | 2 | 3;

type ModalState =
  | { kind: 'none' }
  | { kind: 'creator' }
  | { kind: 'alarm'; portfolioId: string }
  | { kind: 'details'; portfolioId: string }
  | { kind: 'quick_input'; portfolioId: string; activeSection?: QuickInputSection }
  | { kind: 'trade_execution'; portfolioId: string }
  | { kind: 'ai_image'; portfolioId: string }
  | { kind: 'terminate'; portfolioId: string };

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

function getModalPortfolioId(modalState: ModalState): string | null {
  switch (modalState.kind) {
    case 'none':
    case 'creator':
      return null;
    case 'alarm':
    case 'details':
    case 'quick_input':
    case 'trade_execution':
    case 'ai_image':
    case 'terminate':
      return modalState.portfolioId;
    default: {
      const exhaustiveCheck: never = modalState;
      return exhaustiveCheck;
    }
  }
}

interface ActiveModalRendererProps {
  lang: AppLang;
  modalState: ModalState;
  portfolio: Portfolio | null;
  activePortfolioCount: number;
  maxPortfolios: number;
  maxAlarms: number;
  alarmTimezone: string;
  canAccessPaidStocks: boolean;
  currentTier: string;
  geminiApiKey?: string;
  onClose: () => void;
  onCloseDetails: () => void;
  onDeleteCurrentPortfolioTrade: (tradeId: string) => void;
  onSaveCreator: (portfolio: Omit<Portfolio, 'id'>) => Promise<void>;
  onSaveAlarm: (
    portfolio: Portfolio,
    timezone: string,
    config: AlarmConfig,
  ) => Promise<void>;
  onSaveTrade: (portfolioId: string, trade: Trade) => Promise<void>;
  onSaveAiTrades: (portfolioId: string, trades: Trade[]) => Promise<void>;
  onClosePortfolio: (
    portfolioId: string,
    finalSells: FinalSellInput[],
    additionalFee: number,
  ) => Promise<void>;
}

const App: React.FC = () => {
  const [lang, setLang] = useState<AppLang>('ko');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [modalState, setModalState] = useState<ModalState>({ kind: 'none' });
  /** 웹: 기존과 동일 기본 다크. 토스 미니앱: 출시 가이드(라이트 테마)에 맞춰 라이트 고정. */
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof window !== 'undefined' && isTossApp() ? false : true,
  );
  const [checkoutPlan, setCheckoutPlan] = useState<'pro' | 'premium' | null>(null);
  const fetchPortfoliosRef = useRef<(userId: string) => void>(() => {});
  const showInstantAdRef = useRef<
    ((key: InterstitialPlacementKey) => Promise<boolean>) | null
  >(null);

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

  const { saveFCMToken, fcmSaveFailureTick } = useFCMToken();

  useEffect(() => {
    if (fcmSaveFailureTick === 0) {
      return;
    }
    showErrorToast(APP_SHELL_MESSAGES[lang].dailySummaryNetworkError);
  }, [fcmSaveFailureTick, lang]);

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
    lang,
    setPortfolios,
    saveFCMToken,
    fetchPortfoliosRef,
  });
  const [shouldShowSignedInWelcome, setShouldShowSignedInWelcome] = useState(false);

  const portfolioBundle = usePortfolios({
    userId: user?.id ?? null,
    userProfile,
    portfolios,
    setPortfolios,
    lang,
  });
  const {
    fetchPortfolios,
    handleDeleteTrade,
    handleDeleteHistory,
    handleClearHistory,
  } = portfolioBundle;
  const portfolioCommands = usePortfolioUiCommands(portfolioBundle);
  const executeCreatePortfolio = portfolioCommands.createPortfolio.run;
  const executeSaveTrade = portfolioCommands.saveTrade.run;
  const executeUpdatePortfolio = portfolioCommands.updatePortfolio.run;
  const executeDeletePortfolio = portfolioCommands.deletePortfolio.run;
  const executeClosePortfolio = portfolioCommands.closePortfolio.run;

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

  const { translationKey, tierClassName, TierIcon, tierIconClassName } =
    useTierDisplay(paidTier);
  const tierLabel = getTierNameLabel(lang, translationKey);

  const geminiApiKey = useMemo(() => {
    const isPaid = currentTier !== 'free';
    const paid = import.meta.env.VITE_GEMINI_API_KEY_PAID;
    const free = import.meta.env.VITE_GEMINI_API_KEY_FREE;
    const fallback = import.meta.env.VITE_GEMINI_API_KEY;
    return (isPaid ? paid : free) || fallback || undefined;
  }, [currentTier]);

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
  const currentModalPortfolioId = getModalPortfolioId(modalState);
  const detailsTargetId =
    modalState.kind === 'details' ? modalState.portfolioId : null;
  const currentModalPortfolio = useMemo(
    () =>
      currentModalPortfolioId == null
        ? null
        : portfolios.find((portfolio) => portfolio.id === currentModalPortfolioId) ??
          null,
    [currentModalPortfolioId, portfolios],
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

  const shouldOpenPortfolioMutationNotice = useCallback((error: unknown): boolean => {
    if (!(error instanceof Error)) {
      return false;
    }

    if (!isPortfolioMutationErrorCode(error.message)) {
      return false;
    }

    return error.message === PORTFOLIO_MUTATION_ERROR_CODES.portfolioLimitReached;
  }, []);

  const runPortfolioMutation = useCallback(
    async <Result,>(operation: () => Promise<Result>): Promise<Result> => {
      try {
        return await operation();
      } catch (error: unknown) {
        if (shouldOpenPortfolioMutationNotice(error)) {
          openPortfolioMutationNotice(error);
        }
        throw error;
      }
    },
    [openPortfolioMutationNotice, shouldOpenPortfolioMutationNotice],
  );

  const handleCloseModal = useCallback(() => {
    setModalState({ kind: 'none' });
  }, []);

  const handleSaveTrade = useCallback(
    async (portfolioId: string, trade: Trade): Promise<void> => {
      await executeSaveTrade(portfolioId, trade);
      scheduleInterstitialAd(INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE);
    },
    [executeSaveTrade, scheduleInterstitialAd],
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
          console.error('[Portfolio] delete trade failed:', error);
        },
      );
    },
    [detailsTargetId, handleDeleteTrade],
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
    setModalState({ kind: 'none' });
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

  const [portfolioLimitNoticeMax, setPortfolioLimitNoticeMax] = useState<number | null>(null);
  const maxPortfolios = getMaxPortfolios(userProfile);
  const maxAlarms = getMaxAlarms(userProfile);

  const handleRequestOpenCreator = useCallback(() => {
    if (activePortfolios.length >= maxPortfolios) {
      setPortfolioLimitNoticeMax(maxPortfolios);
      return;
    }
    setModalState({ kind: 'creator' });
  }, [activePortfolios.length, maxPortfolios]);

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

  const handleOpenAlarm = useCallback((portfolioId: string) => {
    setModalState({ kind: 'alarm', portfolioId });
  }, []);

  const handleOpenDetails = useCallback((portfolioId: string) => {
    setModalState({ kind: 'details', portfolioId });
  }, []);

  const handleOpenQuickInput = useCallback(
    (portfolioId: string, activeSection: QuickInputSection | undefined) => {
      setModalState({
        kind: 'quick_input',
        portfolioId,
        activeSection,
      });
    },
    [],
  );

  const handleOpenExecution = useCallback((portfolioId: string) => {
    setModalState({ kind: 'trade_execution', portfolioId });
  }, []);

  const handleOpenAiImage = useCallback((portfolioId: string) => {
    setModalState({ kind: 'ai_image', portfolioId });
  }, []);

  const handleOpenTerminate = useCallback((portfolioId: string) => {
    setModalState({ kind: 'terminate', portfolioId });
  }, []);

  const handleSaveCreator = useCallback(
    async (newPortfolio: Omit<Portfolio, 'id'>): Promise<void> => {
      try {
        await runPortfolioMutation(() => executeCreatePortfolio(newPortfolio));
        handleCloseModal();
        scheduleInterstitialAd(INTERSTITIAL_PLACEMENT_KEYS.STRATEGY_SAVE);
      } catch (_error: unknown) {
        // B3 toast / notice contract가 이미 있으므로 여기서는 닫지 않습니다.
      }
    },
    [
      executeCreatePortfolio,
      handleCloseModal,
      runPortfolioMutation,
      scheduleInterstitialAd,
    ],
  );

  const handleSaveAlarm = useCallback(
    async (
      portfolio: Portfolio,
      timezone: string,
      config: AlarmConfig,
    ): Promise<void> => {
      const nextConfig: AlarmConfig = {
        ...config,
        timezone: config.timezone ?? timezone,
      };

      try {
        await executeUpdatePortfolio({
          ...portfolio,
          alarmconfig: nextConfig,
        });
        handleCloseModal();
        scheduleInterstitialAd(INTERSTITIAL_PLACEMENT_KEYS.ALARM_SAVE);
      } catch (error: unknown) {
        console.error('[Alarm] save failed:', error);
      }
    },
    [executeUpdatePortfolio, handleCloseModal, scheduleInterstitialAd],
  );

  const handleSaveAiTrades = useCallback(
    async (portfolioId: string, trades: Trade[]): Promise<void> => {
      try {
        for (const trade of trades) {
          await executeSaveTrade(portfolioId, trade);
        }
        handleCloseModal();
        scheduleInterstitialAd(INTERSTITIAL_PLACEMENT_KEYS.TRADE_SAVE);
      } catch (error: unknown) {
        console.error('[AIImageTrade] save failed:', error);
      }
    },
    [executeSaveTrade, handleCloseModal, scheduleInterstitialAd],
  );

  const handleClosePortfolioFromModal = useCallback(
    async (
      portfolioId: string,
      finalSells: FinalSellInput[],
      additionalFee: number,
    ): Promise<void> => {
      try {
        const result = await executeClosePortfolio(
          portfolioId,
          finalSells,
          additionalFee,
        );
        if (result != null) {
          setSettlementResult(result);
          handleCloseModal();
          scheduleInterstitialAd(
            INTERSTITIAL_PLACEMENT_KEYS.SETTLEMENT_DETAIL,
          );
        }
      } catch (error: unknown) {
        console.error('[Portfolio] close failed:', error);
      }
    },
    [executeClosePortfolio, handleCloseModal, scheduleInterstitialAd],
  );

  const handleUpdatePortfolioForDashboard = useCallback(
    async (portfolio: Portfolio) => {
      try {
        await executeUpdatePortfolio(portfolio);
      } catch (error: unknown) {
        console.error('[Portfolio] update failed:', error);
      }
    },
    [executeUpdatePortfolio],
  );

  const handleDeletePortfolio = useCallback(
    async (id: string) => {
      try {
        await executeDeletePortfolio(id);
      } catch (error: unknown) {
        console.error('[Portfolio] delete failed:', error);
      }
    },
    [executeDeletePortfolio],
  );

  const handleSafeDeleteHistory = useCallback(
    async (portfolioId: string) => {
      try {
        await handleDeleteHistory(portfolioId);
      } catch (error: unknown) {
        console.error('[History] delete failed:', error);
      }
    },
    [handleDeleteHistory],
  );

  const handleSafeClearHistory = useCallback(
    async () => {
      try {
        await handleClearHistory();
      } catch (error: unknown) {
        console.error('[History] clear failed:', error);
      }
    },
    [handleClearHistory],
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

  const noop = useCallback(() => {}, []);

  const mainContent = (
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
            onOpenAlarm={handleOpenAlarm}
            onOpenDetails={handleOpenDetails}
            onOpenQuickInput={handleOpenQuickInput}
            onOpenExecution={handleOpenExecution}
            onOpenAIImage={handleOpenAiImage}
            onClosePortfolio={handleOpenTerminate}
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
              onClick={noop}
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

        <ActiveModalRenderer
          lang={lang}
          modalState={modalState}
          portfolio={currentModalPortfolio}
          activePortfolioCount={activePortfolios.length}
          maxPortfolios={maxPortfolios}
          maxAlarms={maxAlarms}
          alarmTimezone={userProfile?.timezone ?? getDeviceTimeZone()}
          canAccessPaidStocks={canAccessPaidStocks}
          currentTier={paidTier}
          geminiApiKey={geminiApiKey}
          onClose={handleCloseModal}
          onCloseDetails={handlePortfolioDetailsModalClose}
          onDeleteCurrentPortfolioTrade={handleDeleteCurrentPortfolioTrade}
          onSaveCreator={handleSaveCreator}
          onSaveAlarm={handleSaveAlarm}
          onSaveTrade={handleSaveTrade}
          onSaveAiTrades={handleSaveAiTrades}
          onClosePortfolio={handleClosePortfolioFromModal}
        />
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
        <CheckoutModal
          isOpen={checkoutPlan != null}
          onClose={() => setCheckoutPlan(null)}
          lang={lang}
          customerEmail={user?.email}
          customerId={user?.id}
          onPaymentSuccess={() => {
            setCheckoutPlan(null);
            if (user?.id) fetchUserProfile(user.id);
          }}
        />
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
          {mainContent}
        </TDSWrapper>
      </AdPreloadProvider>
    </TossAppProvider>
  );
};

function ActiveModalRenderer({
  lang,
  modalState,
  portfolio,
  activePortfolioCount,
  maxPortfolios,
  maxAlarms,
  alarmTimezone,
  canAccessPaidStocks,
  currentTier,
  geminiApiKey,
  onClose,
  onCloseDetails,
  onDeleteCurrentPortfolioTrade,
  onSaveCreator,
  onSaveAlarm,
  onSaveTrade,
  onSaveAiTrades,
  onClosePortfolio,
}: ActiveModalRendererProps): React.ReactElement | null {
  switch (modalState.kind) {
    case 'none':
      return null;
    case 'creator':
      return (
        <StrategyCreator
          lang={lang}
          onClose={onClose}
          onSave={onSaveCreator}
          canAccessPaidStocks={canAccessPaidStocks}
          maxPortfolios={maxPortfolios}
          currentPortfolioCount={activePortfolioCount}
        />
      );
    case 'alarm':
      if (portfolio == null) {
        return null;
      }
      return (
        <AlarmModal
          lang={lang}
          portfolio={portfolio}
          onClose={onClose}
          onSave={(config) => {
            void onSaveAlarm(portfolio, alarmTimezone, config);
          }}
          maxAlarms={maxAlarms}
        />
      );
    case 'details':
      if (portfolio == null) {
        return null;
      }
      return (
        <PortfolioDetailsModal
          lang={lang}
          portfolio={portfolio}
          onClose={onCloseDetails}
          onDeleteTrade={onDeleteCurrentPortfolioTrade}
          isHistory={portfolio.isClosed}
        />
      );
    case 'quick_input':
      if (portfolio == null) {
        return null;
      }
      return (
        <QuickInputModal
          lang={lang}
          portfolio={portfolio}
          activeSection={modalState.activeSection}
          onClose={onClose}
          onSave={(trade) => {
            void onSaveTrade(portfolio.id, trade);
          }}
        />
      );
    case 'trade_execution':
      if (portfolio == null) {
        return null;
      }
      return (
        <TradeExecutionModal
          lang={lang}
          portfolio={portfolio}
          onClose={onClose}
          onSave={(trade) => {
            void onSaveTrade(portfolio.id, trade);
          }}
        />
      );
    case 'ai_image':
      if (portfolio == null) {
        return null;
      }
      return (
        <AIImageInputModal
          lang={lang}
          portfolio={portfolio}
          geminiApiKey={geminiApiKey}
          isPaidUser={currentTier !== 'free'}
          currentTier={currentTier}
          onClose={onClose}
          onSave={(trades) => {
            void onSaveAiTrades(portfolio.id, trades);
          }}
        />
      );
    case 'terminate':
      if (portfolio == null) {
        return null;
      }
      return (
        <TerminationInput
          lang={lang}
          portfolio={portfolio}
          onClose={onClose}
          onSave={(finalSells, additionalFee) => {
            void onClosePortfolio(portfolio.id, finalSells, additionalFee);
          }}
        />
      );
    default: {
      const exhaustiveCheck: never = modalState;
      return exhaustiveCheck;
    }
  }
}

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
```

### `components/Dashboard.tsx`

```tsx
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import {
  Plus,
  Zap,
  Info,
  TrendingUp,
  Layers,
  Camera,
  Target,
} from 'lucide-react';
import type { AppLang, Portfolio, Strategy } from '../types';
import { I18N, PAID_STOCKS } from '../constants';
import { VR_SUMMARY } from '../constants/vrMessages';
import type {
  DashboardMessageSet,
  DashboardStrategyKind,
} from '../constants/messages/dashboardMessages';
import { getDashboardMessages } from '../constants/messages/dashboardMessages';
import StockLogo from './StockLogo';
import VrBadge from './VrBadge';
import VrOrderModal from './VrOrderModal';
import VrPortfolioSummary from './VrPortfolioSummary';
import PortfolioCardActions from './portfolio/PortfolioCardActions';
import { TDSButton, TDSList, TDSListRow } from './tds';
import { useTossApp } from '../contexts/TossAppContext';
import {
  calculateYield,
  calculateCurrentValuation,
  determineActiveSection,
  calculateHoldings,
  getMAValuesForAlignment,
} from '../utils/portfolioCalculations';
import { fetchStockPrices } from '../services/stockService';
import {
  formatPortfolioDailyExecutionBlock,
  getVrDailyExecutionCycleHeaderLabel,
  joinDailyExecutionBlocks,
} from '../utils/dailyExecutionSummary';
import { useMultiSplitExecution } from '../hooks/useMultiSplitExecution';
import { useNoStopMultiSplitExecution } from '../hooks/useNoStopMultiSplitExecution';
import { useVrOrders } from '../hooks/useVrOrders';
import { handlePressEnterOrSpace } from '../src/utils/a11yHelpers';
import {
  getConditionalTypographyStyle,
  getConditionalColor,
} from '../utils/tossStyleHelpers';

interface DashboardProps {
  lang: AppLang;
  portfolios: Portfolio[];
  onClosePortfolio: (id: string) => void;
  onDeletePortfolio: (id: string) => Promise<void> | void;
  onUpdatePortfolio: (updated: Portfolio) => Promise<void> | void;
  onOpenCreator: () => void;
  onOpenAlarm: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onOpenQuickInput: (id: string, activeSection?: 1 | 2 | 3) => void;
  onOpenExecution: (id: string) => void;
  onOpenAIImage: (id: string) => void;
  totalValuation: number;
  totalValuationChange: number;
  totalValuationChangePct: number;
  onDailyExecutionSummaryChange?: (summaryText: string | null) => void;
}

interface MaPartialProfitLine {
  section: 1 | 2 | 3;
  stock: string;
  quantity: number;
}

interface PortfolioCardContainerProps {
  lang: AppLang;
  portfolio: Portfolio;
  onClosePortfolio: (portfolioId: string) => void;
  onDeletePortfolio: (portfolioId: string) => Promise<void> | void;
  onUpdatePortfolio: (updated: Portfolio) => Promise<void> | void;
  onOpenAlarm: (portfolioId: string) => void;
  onOpenDetails: (portfolioId: string) => void;
  onOpenQuickInput: (
    portfolioId: string,
    activeSection?: 1 | 2 | 3,
  ) => void | Promise<void>;
  onOpenExecution: (portfolioId: string) => void;
  onOpenAIImage: (portfolioId: string) => void;
  onDailyExecutionBlock?: (id: string, block: string | null) => void;
}

interface PortfolioCardViewProps {
  lang: AppLang;
  portfolioName: string;
  ma0Ticker: string;
  strategyKind: DashboardStrategyKind;
  strategyName: string;
  isAlarmEnabled: boolean;
  isInTossApp: boolean;
  valuationLabel: string;
  realizedProfitLabel: string;
  realizedProfitAfterFees: string;
  valuationText: string;
  realizedProfitText: string;
  roiText: string;
  isYieldPositive: boolean;
  isMetricsLoading: boolean;
  executionSummary: React.ReactNode;
  detailsAriaLabel: string;
  executionAriaLabel: string;
  aiTradeRecognitionAria: string;
  quickInputAria: string;
  terminateLabel: string;
  isVrStrategy: boolean;
  canOpenVrOrders: boolean;
  vrOrderButtonLabel: string;
  onOpenDetails: () => void;
  onOpenExecution: () => void;
  onOpenQuickInput: () => void;
  onOpenAIImage: () => void;
  onOpenVrOrders: () => void;
  onOpenAlarm: () => void;
  onClosePortfolio: () => void;
  onDeletePortfolio: () => Promise<void> | void;
}

interface PortfolioExecutionSummaryInput {
  lang: AppLang;
  copy: DashboardMessageSet;
  strategyKind: DashboardStrategyKind;
  strategy: Strategy;
  trades: Portfolio['trades'];
  vrSnapshot: Portfolio['vrSnapshot'];
  vrSettings: Portfolio['strategy']['vrBand'] | null;
  multiSplitCurrentRound: number;
  multiSplitPhase: 'first' | 'second' | 'quarter' | null;
  multiSplitIsInQuarterMode: boolean;
  multiSplitIsInQuarterModeByT: boolean;
  multiSplitInsufficientAmount: boolean;
  multiSplitQuarterStopLossData:
    ReturnType<typeof useMultiSplitExecution>['quarterStopLossData'];
  multiSplitExecutionData:
    ReturnType<typeof useMultiSplitExecution>['multiSplitExecutionData'];
  noStopCurrentRound: number;
  noStopExecutionData:
    ReturnType<typeof useNoStopMultiSplitExecution>['executionData'];
  maActiveSection: 1 | 2 | 3 | null;
  maPartialProfitLines: MaPartialProfitLine[];
  maRsiNotMet: boolean;
  maAlignmentNotMet: boolean;
  vrCycleHeaderLabel: string | null;
}

type PartialProfitSectionConfig =
  | Strategy['ma1']
  | Strategy['ma2']
  | Strategy['ma3'];

function getPortfolioStrategyKind(
  portfolio: Portfolio,
): DashboardStrategyKind {
  if (portfolio.strategy.vrBand != null) {
    return 'vr_band';
  }
  if (portfolio.strategy.multiSplit != null) {
    return 'multi_split';
  }
  if (portfolio.strategy.noStopMultiSplit != null) {
    return 'no_stop_multi_split';
  }
  return 'ma_interval';
}

function formatUsd(value: number, digits: number = 2): string {
  const factor = 10 ** digits;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return `$${rounded.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatShareQuantity(value: number, digits: number = 2): string {
  const factor = 10 ** digits;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return rounded.toFixed(digits);
}

function formatSignedUsd(value: number, digits: number = 2): string {
  const factor = 10 ** digits;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;

  if (rounded === 0) {
    return formatUsd(0, digits);
  }

  const sign = rounded > 0 ? '+' : '-';
  return `${sign}${formatUsd(Math.abs(rounded), digits)}`;
}

function getDefaultDashboardCopy(lang: AppLang): DashboardMessageSet {
  return getDashboardMessages(lang);
}

function renderStrategyIcon(
  strategyKind: DashboardStrategyKind,
): React.ReactElement {
  switch (strategyKind) {
    case 'vr_band':
      return <Target size={14} className="text-indigo-500" />;
    case 'multi_split':
    case 'no_stop_multi_split':
      return <Layers size={14} className="text-emerald-500" />;
    case 'ma_interval':
      return <TrendingUp size={14} className="text-blue-500" />;
    default: {
      const exhaustiveCheck: never = strategyKind;
      return exhaustiveCheck;
    }
  }
}

function collectPartialProfitLine(input: {
  section: 1 | 2 | 3;
  config: PartialProfitSectionConfig | undefined;
  holdings: ReturnType<typeof calculateHoldings>;
  prices: Awaited<ReturnType<typeof fetchStockPrices>>;
}): MaPartialProfitLine | null {
  const { section, config, holdings, prices } = input;

  if (
    config?.takePartialProfit !== true ||
    config.partialProfitTargetPct == null ||
    config.partialProfitTargetPct <= 0
  ) {
    return null;
  }

  const holding = holdings.find((item) => item.stock === config.stock);
  if (holding == null || holding.quantity <= 0 || holding.avgPrice <= 0) {
    return null;
  }

  const currentPrice = prices[config.stock]?.price ?? 0;
  if (currentPrice <= 0) {
    return null;
  }

  const yieldPct = ((currentPrice - holding.avgPrice) / holding.avgPrice) * 100;
  if (yieldPct < config.partialProfitTargetPct) {
    return null;
  }

  return {
    section,
    stock: config.stock,
    quantity: holding.quantity,
  };
}

function renderMaExecutionSummary(
  input: Pick<
    PortfolioExecutionSummaryInput,
    | 'copy'
    | 'strategy'
    | 'maActiveSection'
    | 'maPartialProfitLines'
    | 'maRsiNotMet'
    | 'maAlignmentNotMet'
  >,
): React.ReactNode {
  const {
    copy,
    strategy,
    maActiveSection,
    maPartialProfitLines,
    maRsiNotMet,
    maAlignmentNotMet,
  } = input;
  const ex = copy.execution;

  if (maActiveSection == null) {
    return (
      <div className="text-[10px] text-blue-600/70 dark:text-blue-400/70 font-medium">
        {ex.checkingSection}
      </div>
    );
  }

  let targetConfig: Strategy['ma1'] | Strategy['ma2'] | Strategy['ma3'] | undefined;
  if (maActiveSection === 1) {
    targetConfig = strategy.ma1;
  } else if (maActiveSection === 2) {
    targetConfig = strategy.ma2;
  } else {
    targetConfig = strategy.ma3;
  }

  if (targetConfig == null) {
    return null;
  }

  let actionText = `${ex.section} ${maActiveSection}: ${targetConfig.stock} ${ex.buy}`;
  if (maAlignmentNotMet && maRsiNotMet) {
    actionText = `${ex.section} ${maActiveSection}: ${ex.sectionWatchBothNotMet}`;
  } else if (maAlignmentNotMet) {
    actionText = `${ex.section} ${maActiveSection}: ${ex.sectionWatchAlignmentNotMet}`;
  } else if (maRsiNotMet) {
    actionText = `${ex.section} ${maActiveSection}: ${ex.sectionWatchRsiNotMet}`;
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-black text-blue-900 dark:text-white">
        {actionText}
      </div>
      {maPartialProfitLines.map((line) => (
        <div
          key={`${line.section}-${line.stock}`}
          className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium"
        >
          {ex.section}
          {line.section} {ex.sectionPartialProfit}: {line.stock}{' '}
          {Math.round(line.quantity)}
          {ex.sharesUnit}
        </div>
      ))}
    </div>
  );
}

function renderVrExecutionSummary(
  input: Pick<
    PortfolioExecutionSummaryInput,
    'lang' | 'copy' | 'vrSettings' | 'vrSnapshot' | 'trades' | 'vrCycleHeaderLabel'
  >,
): React.ReactNode {
  const { lang, copy, vrSettings, vrSnapshot, trades, vrCycleHeaderLabel } =
    input;

  if (vrSettings == null) {
    return <span>{copy.execution.calculating}</span>;
  }

  const hasEverBought = trades.some((trade) => trade.type === 'buy');

  return (
    <div className="space-y-2">
      {vrCycleHeaderLabel != null && vrCycleHeaderLabel !== '' ? (
        <div className="flex items-center gap-2">
          <VrBadge mode={vrSettings.vrMode} lang={lang} />
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-md text-blue-800 dark:text-blue-200 bg-blue-100/60 dark:bg-blue-500/20"
            title={copy.cycleHeaderTitle}
          >
            {vrCycleHeaderLabel}
          </span>
        </div>
      ) : (
        <VrBadge mode={vrSettings.vrMode} lang={lang} />
      )}

      <VrPortfolioSummary
        vrSettings={vrSettings}
        vrSnapshot={vrSnapshot}
        lang={lang}
        hasEverBought={hasEverBought}
      />
    </div>
  );
}

function renderMultiSplitExecutionSummary(
  input: Pick<
    PortfolioExecutionSummaryInput,
    | 'copy'
    | 'multiSplitCurrentRound'
    | 'multiSplitPhase'
    | 'multiSplitIsInQuarterMode'
    | 'multiSplitQuarterStopLossData'
    | 'multiSplitExecutionData'
    | 'multiSplitInsufficientAmount'
  >,
): React.ReactNode {
  const {
    copy,
    multiSplitCurrentRound,
    multiSplitPhase,
    multiSplitIsInQuarterMode,
    multiSplitQuarterStopLossData,
    multiSplitExecutionData,
    multiSplitInsufficientAmount,
  } = input;
  const ex = copy.execution;

  if (multiSplitInsufficientAmount) {
    return (
      <div className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 border border-red-200 dark:border-red-500/30">
        {ex.insufficientAmount}
      </div>
    );
  }

  if (multiSplitIsInQuarterMode) {
    if (multiSplitQuarterStopLossData == null) {
      return <span>{ex.calculating}</span>;
    }

    if (!multiSplitQuarterStopLossData.hasMOC) {
      return (
        <div className="space-y-1">
          <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
            <span className="font-black">{ex.mocSellLabel}:</span>{' '}
            {formatShareQuantity(multiSplitQuarterStopLossData.mocQuantity ?? 0)}{' '}
            {ex.sharesUnit}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
            {ex.startQuarterStopLoss}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2 text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
        <div>
          <span className="font-black">{ex.firstBuyAmountLabel}:</span>{' '}
          {multiSplitQuarterStopLossData.newOneTimeAmount != null
            ? formatUsd(multiSplitQuarterStopLossData.newOneTimeAmount)
            : formatUsd(0)}
        </div>
        {multiSplitQuarterStopLossData.locBuy != null ? (
          <div>
            <span className="font-black">{ex.locBuy1}:</span>{' '}
            {formatUsd(multiSplitQuarterStopLossData.locBuy.price)} /{' '}
            {multiSplitQuarterStopLossData.locBuy.quantity}
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              ({ex.avgPriceTimesPointNineMinusOffset})
            </div>
          </div>
        ) : null}
        {multiSplitQuarterStopLossData.locSell != null ? (
          <div>
            <span className="font-black">{ex.locSell}:</span>{' '}
            {formatUsd(multiSplitQuarterStopLossData.locSell.price)} /{' '}
            {multiSplitQuarterStopLossData.locSell.quantity}
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              ({ex.avgPriceTimesPointNine})
            </div>
          </div>
        ) : null}
        {multiSplitQuarterStopLossData.limitSell != null ? (
          <div>
            <span className="font-black">{ex.limitSell}:</span>{' '}
            {formatUsd(multiSplitQuarterStopLossData.limitSell.price)} /{' '}
            {multiSplitQuarterStopLossData.limitSell.quantity}
          </div>
        ) : null}
      </div>
    );
  }

  if (multiSplitExecutionData == null) {
    return (
      <div className="text-[10px] text-blue-600/70 dark:text-blue-400/70 font-medium">
        {multiSplitPhase == null ? ex.strategyPreparing : ex.calculating}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
      <div className="font-black">T = {multiSplitCurrentRound.toFixed(2)}</div>
      {multiSplitExecutionData.locBuy1 != null ? (
        <div>
          <span className="font-black">{ex.locBuy1}:</span>{' '}
          {formatUsd(multiSplitExecutionData.locBuy1.price)} /{' '}
          {multiSplitExecutionData.locBuy1.quantity}
        </div>
      ) : null}
      {multiSplitExecutionData.locBuy2 != null ? (
        <div>
          <span className="font-black">{ex.locBuy2}:</span>{' '}
          {formatUsd(multiSplitExecutionData.locBuy2.price)} /{' '}
          {multiSplitExecutionData.locBuy2.quantity}
        </div>
      ) : null}
      {multiSplitExecutionData.locSell != null ? (
        <div>
          <span className="font-black">{ex.locSell}:</span>{' '}
          {formatUsd(multiSplitExecutionData.locSell.price)} /{' '}
          {multiSplitExecutionData.locSell.quantity}
        </div>
      ) : (
        <div>
          {ex.locSell}: {ex.noHoldings}
        </div>
      )}
      {multiSplitExecutionData.limitSell != null ? (
        <div>
          <span className="font-black">{ex.limitSell}:</span>{' '}
          {formatUsd(multiSplitExecutionData.limitSell.price)} /{' '}
          {multiSplitExecutionData.limitSell.quantity}
        </div>
      ) : (
        <div>
          {ex.limitSell}: {ex.noHoldings}
        </div>
      )}
    </div>
  );
}

function renderNoStopExecutionSummary(
  input: Pick<
    PortfolioExecutionSummaryInput,
    'copy' | 'noStopCurrentRound' | 'noStopExecutionData'
  >,
): React.ReactNode {
  const { copy, noStopCurrentRound, noStopExecutionData } = input;
  const ex = copy.execution;

  if (noStopExecutionData == null) {
    return <span>{ex.calculating}</span>;
  }

  if (noStopExecutionData.isSplitComplete) {
    return (
      <div className="space-y-2">
        <div className="font-black text-blue-900 dark:text-white">
          {ex.noStopSplitComplete}
        </div>
        {noStopExecutionData.takeProfit != null ? (
          <div className="text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
            <span className="font-black">{ex.noStopTakeProfitTarget}:</span>{' '}
            {formatUsd(noStopExecutionData.takeProfit.price)} /{' '}
            {noStopExecutionData.takeProfit.quantity}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-[12px] text-blue-600/90 dark:text-blue-400/90 font-medium">
      <div className="font-black">T = {noStopCurrentRound.toFixed(2)}</div>
      {noStopExecutionData.lowLoc != null ? (
        <div>
          <span className="font-black">{ex.lowLoc}:</span>{' '}
          {formatUsd(noStopExecutionData.lowLoc.price)} /{' '}
          {noStopExecutionData.lowLoc.quantity}
        </div>
      ) : null}
      {noStopExecutionData.highLoc != null ? (
        <div>
          <span className="font-black">{ex.highLoc}:</span>{' '}
          {formatUsd(noStopExecutionData.highLoc.price)} /{' '}
          {noStopExecutionData.highLoc.quantity}
        </div>
      ) : null}
      {noStopExecutionData.takeProfit != null ? (
        <div>
          <span className="font-black">{ex.noStopTakeProfitTarget}:</span>{' '}
          {formatUsd(noStopExecutionData.takeProfit.price)} /{' '}
          {noStopExecutionData.takeProfit.quantity}
        </div>
      ) : null}
    </div>
  );
}

function buildPortfolioExecutionSummary(
  input: PortfolioExecutionSummaryInput,
): React.ReactNode {
  switch (input.strategyKind) {
    case 'vr_band':
      return renderVrExecutionSummary(input);
    case 'multi_split':
      return renderMultiSplitExecutionSummary(input);
    case 'no_stop_multi_split':
      return renderNoStopExecutionSummary(input);
    case 'ma_interval':
      return renderMaExecutionSummary(input);
    default: {
      const exhaustiveCheck: never = input.strategyKind;
      return exhaustiveCheck;
    }
  }
}

function PortfolioCardContainer({
  lang,
  portfolio,
  onClosePortfolio,
  onDeletePortfolio,
  onUpdatePortfolio,
  onOpenAlarm,
  onOpenDetails,
  onOpenQuickInput,
  onOpenExecution,
  onOpenAIImage,
  onDailyExecutionBlock,
}: PortfolioCardContainerProps): React.ReactElement {
  const { isInTossApp } = useTossApp();
  const copy = getDefaultDashboardCopy(lang);
  const portfolioId = portfolio.id;
  const portfolioName = portfolio.name;
  const isAlarmEnabled = portfolio.alarmconfig?.enabled === true;
  const strategyKind = getPortfolioStrategyKind(portfolio);
  const vrSettings = portfolio.strategy.vrBand ?? null;
  const vrCycleHeaderLabel = getVrDailyExecutionCycleHeaderLabel(portfolio, lang);

  const multiSplitVm = useMultiSplitExecution(portfolio, lang);
  const noStopVm = useNoStopMultiSplitExecution(portfolio, lang);

  const multiSplitCurrentRound = multiSplitVm.currentRound;
  const multiSplitPhase = multiSplitVm.multiSplitPhase;
  const multiSplitIsInQuarterMode = multiSplitVm.isInQuarterMode;
  const multiSplitIsInQuarterModeByT = multiSplitVm.isInQuarterModeByT;
  const multiSplitInsufficientAmount = multiSplitVm.multiSplitInsufficientAmount;
  const multiSplitQuarterStopLossData = multiSplitVm.quarterStopLossData;
  const multiSplitExecutionData = multiSplitVm.multiSplitExecutionData;

  const noStopCurrentRound = noStopVm.currentRound;
  const noStopExecutionData = noStopVm.executionData;

  const [investedAmount, setInvestedAmount] = useState(0);
  const [yieldRate, setYieldRate] = useState(0);
  const [realizedProfit, setRealizedProfit] = useState(0);
  const [isMetricsLoading, setIsMetricsLoading] = useState(true);
  const [maActiveSection, setMaActiveSection] = useState<1 | 2 | 3 | null>(
    null,
  );
  const [maBlockVersion, setMaBlockVersion] = useState(0);
  const [maPartialProfitLines, setMaPartialProfitLines] = useState<
    MaPartialProfitLine[]
  >([]);
  const [maRsiNotMet, setMaRsiNotMet] = useState(false);
  const [maAlignmentNotMet, setMaAlignmentNotMet] = useState(false);
  const [isVrOrderModalOpen, setIsVrOrderModalOpen] = useState(false);
  const quarterModeUpdateSentRef = useRef(false);

  const { safeBuyOrders, safeSellOrders } = useVrOrders(portfolio.vrSnapshot);

  const isMultiSplitStrategy = portfolio.strategy.multiSplit != null;
  const isNoStopMultiSplitStrategy =
    portfolio.strategy.noStopMultiSplit != null;
  const isVrStrategy = vrSettings != null;

  const ma0Ticker =
    portfolio.strategy.multiSplit?.targetStock ||
    portfolio.strategy.noStopMultiSplit?.targetStock ||
    (isVrStrategy ? 'TQQQ' : portfolio.strategy.ma0?.stock) ||
    'TQQQ';

  useEffect(() => {
    if (portfolio.isQuarterMode === false) {
      quarterModeUpdateSentRef.current = false;
    }
  }, [portfolio.isQuarterMode]);

  useEffect(() => {
    if (
      portfolio.strategy.multiSplit == null ||
      !multiSplitIsInQuarterModeByT ||
      portfolio.isQuarterMode === true ||
      quarterModeUpdateSentRef.current
    ) {
      return;
    }

    quarterModeUpdateSentRef.current = true;
    void Promise.resolve(
      onUpdatePortfolio({
        ...portfolio,
        isQuarterMode: true,
      }),
    );
  }, [
    portfolio,
    portfolio.isQuarterMode,
    portfolio.strategy.multiSplit,
    multiSplitIsInQuarterModeByT,
    onUpdatePortfolio,
  ]);

  useEffect(() => {
    if (isMultiSplitStrategy || isNoStopMultiSplitStrategy || isVrStrategy) {
      setMaActiveSection(null);
      setMaRsiNotMet(false);
      setMaAlignmentNotMet(false);
      setMaPartialProfitLines([]);
      return;
    }

    let isCancelled = false;

    const runAnalysis = async () => {
      try {
        const nextSection = await determineActiveSection(portfolio);
        if (isCancelled) {
          return;
        }

        setMaActiveSection((previous) =>
          previous === nextSection ? previous : nextSection,
        );

        if (nextSection != null) {
          setMaBlockVersion((previous) => previous + 1);
        }

        if (nextSection !== 1 && nextSection !== 2 && nextSection !== 3) {
          setMaRsiNotMet(false);
          setMaAlignmentNotMet(false);
          setMaPartialProfitLines([]);
          return;
        }

        const ma0 = portfolio.strategy.ma0;
        const ma1 = portfolio.strategy.ma1;
        const ma2 = portfolio.strategy.ma2;
        const ma3 = portfolio.strategy.ma3;
        const baseStock = ma0.stock;
        const symbolsToFetch = Array.from(
          new Set([baseStock, ma1.stock, ma2.stock, ma3.stock].filter(Boolean)),
        );

        const prices = await fetchStockPrices(symbolsToFetch);
        if (isCancelled) {
          return;
        }

        if (ma0.rsiEnabled) {
          const threshold =
            nextSection === 1
              ? ma1.rsiThreshold
              : nextSection === 2
              ? ma2.rsiThreshold
              : ma3.rsiThreshold;
          const currentRsi = prices[baseStock]?.rsi ?? 50;
          setMaRsiNotMet(threshold != null && currentRsi > threshold);
        } else {
          setMaRsiNotMet(false);
        }

        if (ma0.alignmentEnabled) {
          const { maA, maB } = await getMAValuesForAlignment(portfolio);
          if (!isCancelled) {
            setMaAlignmentNotMet(maA <= maB);
          }
        } else {
          setMaAlignmentNotMet(false);
        }

        const holdings = calculateHoldings(portfolio);
        const nextLines = [
          collectPartialProfitLine({
            section: 1,
            config: ma1,
            holdings,
            prices,
          }),
          collectPartialProfitLine({
            section: 2,
            config: ma2,
            holdings,
            prices,
          }),
          collectPartialProfitLine({
            section: 3,
            config: ma3,
            holdings,
            prices,
          }),
        ].filter((line): line is MaPartialProfitLine => line != null);

        setMaPartialProfitLines((previous) => {
          if (
            previous.length === nextLines.length &&
            previous.every(
              (item, index) =>
                item.section === nextLines[index].section &&
                item.stock === nextLines[index].stock &&
                item.quantity === nextLines[index].quantity,
            )
          ) {
            return previous;
          }

          return nextLines;
        });
      } catch (error: unknown) {
        console.warn('[PortfolioCardContainer:runAnalysis] failed', error);
      }
    };

    void runAnalysis();
    return () => {
      isCancelled = true;
    };
  }, [portfolio, isMultiSplitStrategy, isNoStopMultiSplitStrategy, isVrStrategy]);

  useEffect(() => {
    let isCancelled = false;

    const updateMetrics = async () => {
      setIsMetricsLoading(true);

      try {
        const holdings = calculateHoldings(portfolio);
        const [valuation, nextYield] = await Promise.all([
          calculateCurrentValuation(portfolio),
          calculateYield(portfolio),
        ]);
        const totalRealizedPnL = holdings.reduce(
          (sum, holding) => sum + (holding.realizedPnL ?? 0),
          0,
        );

        if (isCancelled) {
          return;
        }

        setInvestedAmount(valuation);
        setYieldRate(nextYield);
        setRealizedProfit(totalRealizedPnL);
      } catch (error: unknown) {
        console.error('[PortfolioCardContainer:updateMetrics] failed', error);
      } finally {
        if (!isCancelled) {
          setIsMetricsLoading(false);
        }
      }
    };

    void updateMetrics();
    return () => {
      isCancelled = true;
    };
  }, [portfolio]);

  useEffect(() => {
    if (onDailyExecutionBlock == null) {
      return;
    }

    if (!isAlarmEnabled) {
      onDailyExecutionBlock(portfolioId, null);
      return;
    }

    const multiSplitOverLimit =
      portfolio.strategy.multiSplit != null &&
      portfolio.strategy.multiSplit.totalSplitCount > 0 &&
      multiSplitCurrentRound > portfolio.strategy.multiSplit.totalSplitCount;

    if (
      portfolio.strategy.multiSplit != null &&
      !multiSplitOverLimit &&
      multiSplitExecutionData == null &&
      !multiSplitInsufficientAmount
    ) {
      return;
    }

    if (
      portfolio.strategy.noStopMultiSplit != null &&
      noStopExecutionData == null
    ) {
      return;
    }

    if (
      !isMultiSplitStrategy &&
      !isNoStopMultiSplitStrategy &&
      !isVrStrategy &&
      maBlockVersion === 0
    ) {
      return;
    }

    const block = formatPortfolioDailyExecutionBlock(portfolio, lang, {
      multiSplitExecutionData: multiSplitExecutionData ?? undefined,
      quarterStopLossData: multiSplitQuarterStopLossData ?? undefined,
      noStopMultiSplitExecutionData: noStopExecutionData ?? undefined,
      multiSplitPhase: multiSplitPhase ?? null,
      isQuarterStopLossActive: multiSplitIsInQuarterMode,
      multiSplitOverLimit,
      multiSplitFirstRoundHint:
        portfolio.strategy.multiSplit != null &&
        multiSplitCurrentRound >= 0 &&
        multiSplitCurrentRound < 0.5,
      multiSplitInsufficientAmount:
        portfolio.strategy.multiSplit != null
          ? multiSplitInsufficientAmount
          : undefined,
      maActiveSection:
        isMultiSplitStrategy || isNoStopMultiSplitStrategy
          ? undefined
          : maActiveSection ?? undefined,
      maPartialProfitLines:
        isMultiSplitStrategy || isNoStopMultiSplitStrategy
          ? undefined
          : maPartialProfitLines.length > 0
          ? maPartialProfitLines
          : undefined,
      maRsiNotMet:
        isMultiSplitStrategy || isNoStopMultiSplitStrategy
          ? undefined
          : maRsiNotMet,
      maAlignmentNotMet:
        isMultiSplitStrategy || isNoStopMultiSplitStrategy
          ? undefined
          : maAlignmentNotMet,
    });

    onDailyExecutionBlock(portfolioId, block);
  }, [
    onDailyExecutionBlock,
    isAlarmEnabled,
    portfolio,
    portfolioId,
    lang,
    multiSplitCurrentRound,
    multiSplitPhase,
    multiSplitIsInQuarterMode,
    multiSplitExecutionData,
    multiSplitInsufficientAmount,
    multiSplitQuarterStopLossData,
    noStopExecutionData,
    maActiveSection,
    maPartialProfitLines,
    maRsiNotMet,
    maAlignmentNotMet,
    maBlockVersion,
    isMultiSplitStrategy,
    isNoStopMultiSplitStrategy,
    isVrStrategy,
  ]);

  const executionSummary = useMemo(
    () =>
      buildPortfolioExecutionSummary({
        lang,
        copy,
        strategyKind,
        strategy: portfolio.strategy,
        trades: portfolio.trades,
        vrSnapshot: portfolio.vrSnapshot,
        vrSettings,
        multiSplitCurrentRound,
        multiSplitPhase,
        multiSplitIsInQuarterMode,
        multiSplitIsInQuarterModeByT,
        multiSplitInsufficientAmount,
        multiSplitQuarterStopLossData,
        multiSplitExecutionData,
        noStopCurrentRound,
        noStopExecutionData,
        maActiveSection,
        maPartialProfitLines,
        maRsiNotMet,
        maAlignmentNotMet,
        vrCycleHeaderLabel,
      }),
    [
      lang,
      copy,
      strategyKind,
      portfolio.strategy,
      portfolio.trades,
      portfolio.vrSnapshot,
      vrSettings,
      multiSplitCurrentRound,
      multiSplitPhase,
      multiSplitIsInQuarterMode,
      multiSplitIsInQuarterModeByT,
      multiSplitInsufficientAmount,
      multiSplitQuarterStopLossData,
      multiSplitExecutionData,
      noStopCurrentRound,
      noStopExecutionData,
      maActiveSection,
      maPartialProfitLines,
      maRsiNotMet,
      maAlignmentNotMet,
      vrCycleHeaderLabel,
    ],
  );

  const handleOpenDetails = useCallback(() => {
    onOpenDetails(portfolioId);
  }, [onOpenDetails, portfolioId]);

  const handleOpenExecution = useCallback(() => {
    onOpenExecution(portfolioId);
  }, [onOpenExecution, portfolioId]);

  const isOpeningQuickInputRef = useRef(false);

  const handleOpenQuickInput = useCallback(async () => {
    if (isOpeningQuickInputRef.current) {
      return;
    }
    isOpeningQuickInputRef.current = true;

    try {
      const activeSection = await determineActiveSection(portfolio);
      await Promise.resolve(
        onOpenQuickInput(portfolioId, activeSection ?? undefined),
      );
    } catch (error: unknown) {
      console.error(
        '[PortfolioCardContainer:handleOpenQuickInput] failed',
        error,
      );
    } finally {
      isOpeningQuickInputRef.current = false;
    }
  }, [onOpenQuickInput, portfolio, portfolioId]);

  const handleCloseVrOrders = useCallback(() => {
    setIsVrOrderModalOpen(false);
  }, []);

  const handleOpenAIImage = useCallback(() => {
    onOpenAIImage(portfolioId);
  }, [onOpenAIImage, portfolioId]);

  const handleOpenAlarm = useCallback(() => {
    onOpenAlarm(portfolioId);
  }, [onOpenAlarm, portfolioId]);

  const handleOpenVrOrders = useCallback(() => {
    setIsVrOrderModalOpen(true);
  }, []);

  const handleClosePortfolio = useCallback(() => {
    onClosePortfolio(portfolioId);
  }, [onClosePortfolio, portfolioId]);

  const handleDeletePortfolio = useCallback(() => {
    return onDeletePortfolio(portfolioId);
  }, [onDeletePortfolio, portfolioId]);

  const detailsAriaLabel = copy.openDetailsAria(portfolioName);
  const executionAriaLabel = copy.openExecutionAria(portfolioName);
  const valuationText = isMetricsLoading ? '...' : formatUsd(investedAmount, 2);
  const realizedProfitText = isMetricsLoading
    ? '...'
    : formatSignedUsd(realizedProfit, 2);
  const roiText = isMetricsLoading
    ? '...'
    : `${yieldRate >= 0 ? '+' : ''}${yieldRate.toFixed(1)}%`;

  return (
    <>
      <PortfolioCardView
        lang={lang}
        portfolioName={portfolioName}
        ma0Ticker={ma0Ticker}
        strategyKind={strategyKind}
        strategyName={copy.strategyName[strategyKind]}
        isAlarmEnabled={isAlarmEnabled}
        isInTossApp={isInTossApp}
        valuationLabel={copy.valuationLabel}
        realizedProfitLabel={copy.realizedProfitLabel}
        realizedProfitAfterFees={copy.realizedProfitAfterFees}
        valuationText={valuationText}
        realizedProfitText={realizedProfitText}
        roiText={roiText}
        isYieldPositive={yieldRate >= 0}
        isMetricsLoading={isMetricsLoading}
        executionSummary={executionSummary}
        detailsAriaLabel={detailsAriaLabel}
        executionAriaLabel={executionAriaLabel}
        aiTradeRecognitionAria={copy.aiTradeRecognitionAria}
        quickInputAria={copy.quickInputAria}
        terminateLabel={copy.terminate}
        isVrStrategy={isVrStrategy}
        canOpenVrOrders={portfolio.vrSnapshot != null}
        vrOrderButtonLabel={VR_SUMMARY[lang].viewOrderTable}
        onOpenDetails={handleOpenDetails}
        onOpenExecution={handleOpenExecution}
        onOpenQuickInput={handleOpenQuickInput}
        onOpenAIImage={handleOpenAIImage}
        onOpenVrOrders={handleOpenVrOrders}
        onOpenAlarm={handleOpenAlarm}
        onClosePortfolio={handleClosePortfolio}
        onDeletePortfolio={handleDeletePortfolio}
      />

      {isVrStrategy ? (
        <VrOrderModal
          isOpen={isVrOrderModalOpen}
          onClose={handleCloseVrOrders}
          buyOrders={safeBuyOrders}
          sellOrders={safeSellOrders}
          lang={lang}
        />
      ) : null}
    </>
  );
}

const PortfolioCardView = React.memo(function PortfolioCardView({
  lang,
  portfolioName,
  ma0Ticker,
  strategyKind,
  strategyName,
  isAlarmEnabled,
  isInTossApp,
  valuationLabel,
  realizedProfitLabel,
  realizedProfitAfterFees,
  valuationText,
  realizedProfitText,
  roiText,
  isYieldPositive,
  isMetricsLoading,
  executionSummary,
  detailsAriaLabel,
  executionAriaLabel,
  aiTradeRecognitionAria,
  quickInputAria,
  terminateLabel,
  isVrStrategy,
  canOpenVrOrders,
  vrOrderButtonLabel,
  onOpenDetails,
  onOpenExecution,
  onOpenQuickInput,
  onOpenAIImage,
  onOpenVrOrders,
  onOpenAlarm,
  onClosePortfolio,
  onDeletePortfolio,
}: PortfolioCardViewProps): React.ReactElement {
  const t = I18N[lang];
  const roiBadgeClassName = isYieldPositive
    ? 'bg-emerald-500 text-white'
    : 'bg-rose-500 text-white';

  return (
    <div className="glass light-card-depth p-7 rounded-[2.5rem] space-y-5 group hover:-translate-y-1 transition-all duration-500 relative overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-2xl">
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        <PortfolioCardActions
          lang={lang}
          isAlarmEnabled={isAlarmEnabled}
          onOpenAlarm={onOpenAlarm}
          onDeletePortfolio={onDeletePortfolio}
        />
      </div>

      <div className="flex justify-between items-start relative z-10">
        <div className="flex items-center gap-4">
          <div
            role="button"
            tabIndex={0}
            aria-label={detailsAriaLabel}
            onClick={onOpenDetails}
            onKeyDown={(event) => handlePressEnterOrSpace(event, onOpenDetails)}
            className="w-16 h-16 rounded-full overflow-visible relative cursor-pointer active:scale-95 transition-transform"
          >
            <div
              className={`absolute -top-2 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg ${roiBadgeClassName}`}
            >
              <TrendingUp
                size={10}
                className={isYieldPositive ? '' : 'rotate-180'}
              />
              <span className="text-[10px] font-black">
                {isMetricsLoading ? '...' : roiText}
              </span>
            </div>

            <StockLogo
              ticker={ma0Ticker}
              size="xl"
              shape="circle"
              paidAccent={PAID_STOCKS.includes(ma0Ticker)}
              showFallbackText
              dashboardCardText
              className="w-16 h-16 border-2 border-white/30 shadow-xl"
            />
          </div>

          <div>
            <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight mb-1">
              {portfolioName}
            </h3>
            <div className="flex items-center gap-2">
              <span className="inline-flex">{renderStrategyIcon(strategyKind)}</span>
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                {strategyName}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_50px] gap-x-4 gap-y-6 items-start relative z-10 min-h-[140px] mr-[3px]">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {valuationLabel}
            </span>
          </div>
          <p className="text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-tight">
            {valuationText}
          </p>
        </div>

        <div className="flex justify-center">
          {isInTossApp ? (
            <TDSButton
              variant="tertiary"
              size="medium"
              onClick={onOpenAIImage}
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] min-w-0 p-0 flex items-center justify-center"
              aria-label={aiTradeRecognitionAria}
            >
              <div className="w-[50px] h-[50px] rounded-[1.25rem] bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shadow-md dark:shadow-[0_0_17px_rgba(255,255,255,0.25)]">
                <Camera size={28} className="text-white" strokeWidth={2} />
              </div>
            </TDSButton>
          ) : (
            <button
              type="button"
              onClick={onOpenAIImage}
              aria-label={aiTradeRecognitionAria}
              title={aiTradeRecognitionAria}
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] bg-transparent flex items-center justify-center hover:scale-[1.02] active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <div className="w-[50px] h-[50px] rounded-[1.25rem] bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shadow-md dark:shadow-[0_0_17px_rgba(255,255,255,0.25)]">
                <Camera size={28} className="text-white" strokeWidth={2} />
              </div>
            </button>
          )}
        </div>

        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {realizedProfitLabel}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500">
              {realizedProfitAfterFees}
            </span>
          </div>
          <p
            className={`text-2xl font-black tracking-tight leading-tight flex items-center gap-1 ${
              isYieldPositive ? 'text-emerald-500' : 'text-rose-500'
            }`}
          >
            <span className="text-[11px]">{isYieldPositive ? '↑' : '↓'}</span>
            {realizedProfitText}
          </p>
        </div>

        <div className="flex justify-center">
          {isInTossApp ? (
            <TDSButton
              variant="tertiary"
              size="medium"
              onClick={onOpenQuickInput}
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] min-w-0 p-0 flex items-center justify-center"
              aria-label={quickInputAria}
            >
              <Zap size={20} className="fill-current" />
            </TDSButton>
          ) : (
            <button
              type="button"
              onClick={onOpenQuickInput}
              aria-label={quickInputAria}
              className="shrink-0 w-[50px] h-[50px] rounded-[1.25rem] bg-blue-600/20 dark:bg-white/20 flex items-center justify-center text-blue-700 dark:text-white backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] transition-all shadow-sm dark:shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            >
              <Zap size={20} className="fill-current" />
            </button>
          )}
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={executionAriaLabel}
        onClick={onOpenExecution}
        onKeyDown={(event) => handlePressEnterOrSpace(event, onOpenExecution)}
        className="bg-blue-50/50 dark:bg-blue-600/15 rounded-[1.5rem] flex items-center justify-between shadow-md dark:shadow-lg dark:shadow-blue-500/20 relative overflow-visible group/action cursor-pointer border border-blue-100 dark:border-blue-500/20 min-h-[80px] p-5"
      >
        <div className="absolute inset-0 bg-blue-100/50 dark:bg-white/10 opacity-0 group-hover/action:opacity-100 transition-opacity rounded-[1.5rem]" />
        <div className="relative z-10 flex-1 overflow-visible">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5 opacity-80">
            <span className="text-[9px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest">
              {t.dailyExecution}
            </span>
            <Info size={10} className="text-blue-700 dark:text-blue-300 shrink-0" />
          </div>
          {executionSummary}
        </div>
      </div>

      {isVrStrategy ? (
        <button
          type="button"
          onClick={onOpenVrOrders}
          disabled={!canOpenVrOrders}
          className={`mt-3 w-full py-2.5 text-[11px] font-black rounded-2xl transition-colors ${
            canOpenVrOrders
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
              : 'bg-slate-100/60 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          {vrOrderButtonLabel}
        </button>
      ) : null}

      {isInTossApp ? (
        <TDSButton
          variant="tertiary"
          onClick={onClosePortfolio}
          className="w-full relative z-10"
        >
          {terminateLabel}
        </TDSButton>
      ) : (
        <button
          type="button"
          onClick={onClosePortfolio}
          className="w-full py-4 text-[10px] font-black bg-slate-50 dark:bg-transparent text-slate-500 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/5 uppercase tracking-[0.2em] border border-slate-200 dark:border-white/10 rounded-2xl transition-all relative z-10"
        >
          {terminateLabel}
        </button>
      )}
    </div>
  );
});

PortfolioCardView.displayName = 'PortfolioCardView';

const Dashboard: React.FC<DashboardProps> = ({
  lang,
  portfolios,
  onClosePortfolio,
  onDeletePortfolio,
  onUpdatePortfolio,
  onOpenCreator,
  onOpenAlarm,
  onOpenDetails,
  onOpenQuickInput,
  onOpenExecution,
  onOpenAIImage,
  totalValuation,
  totalValuationChange,
  totalValuationChangePct,
  onDailyExecutionSummaryChange,
}) => {
  const { isInTossApp } = useTossApp();
  const t = I18N[lang];
  const copy = getDefaultDashboardCopy(lang);
  const [dailyExecutionBlocks, setDailyExecutionBlocks] = useState<
    Record<string, string>
  >({});
  const lastDailyExecutionSummaryRef = useRef<string | null>(null);

  const setDailyExecutionBlockForId = useCallback(
    (id: string, block: string | null) => {
      setDailyExecutionBlocks((previous) => {
        const nextValue = block ?? '';
        if (previous[id] === nextValue) {
          return previous;
        }

        return {
          ...previous,
          [id]: nextValue,
        };
      });
    },
    [],
  );

  const handleOpenAlarm = useCallback(
    (portfolioId: string) => {
      onOpenAlarm(portfolioId);
    },
    [onOpenAlarm],
  );

  const handleOpenDetails = useCallback(
    (portfolioId: string) => {
      onOpenDetails(portfolioId);
    },
    [onOpenDetails],
  );

  const handleOpenQuickInput = useCallback(
    (portfolioId: string, activeSection?: 1 | 2 | 3) => {
      onOpenQuickInput(portfolioId, activeSection);
    },
    [onOpenQuickInput],
  );

  const handleOpenExecution = useCallback(
    (portfolioId: string) => {
      onOpenExecution(portfolioId);
    },
    [onOpenExecution],
  );

  const handleOpenAIImage = useCallback(
    (portfolioId: string) => {
      onOpenAIImage(portfolioId);
    },
    [onOpenAIImage],
  );

  const handleClosePortfolio = useCallback(
    (portfolioId: string) => {
      onClosePortfolio(portfolioId);
    },
    [onClosePortfolio],
  );

  const handleDeletePortfolio = useCallback(
    (portfolioId: string) => {
      return onDeletePortfolio(portfolioId);
    },
    [onDeletePortfolio],
  );

  const alarmIds = useMemo(
    () =>
      portfolios
        .filter(
          (portfolio) =>
            portfolio.alarmconfig?.enabled === true &&
            (portfolio.alarmconfig.selectedHours?.length ?? 0) > 0,
        )
        .map((portfolio) => portfolio.id),
    [portfolios],
  );

  useEffect(() => {
    if (onDailyExecutionSummaryChange == null) {
      return;
    }

    if (alarmIds.length === 0) {
      if (lastDailyExecutionSummaryRef.current !== null) {
        lastDailyExecutionSummaryRef.current = null;
        onDailyExecutionSummaryChange(null);
      }
      return;
    }

    const blocks = alarmIds
      .map((portfolioId) => dailyExecutionBlocks[portfolioId])
      .filter(Boolean);

    if (blocks.length !== alarmIds.length) {
      return;
    }

    const summary = joinDailyExecutionBlocks(blocks);
    const nextSummary = summary || null;

    if (lastDailyExecutionSummaryRef.current === nextSummary) {
      return;
    }

    lastDailyExecutionSummaryRef.current = nextSummary;
    onDailyExecutionSummaryChange(nextSummary);
  }, [alarmIds, dailyExecutionBlocks, onDailyExecutionSummaryChange]);

  let changeColor = 'text-slate-400';
  let totalValuationChangeText = formatUsd(0);
  let totalValuationChangePctText = '-';
  const roundFactor = 100;
  const roundedChange =
    Math.round((totalValuationChange + Number.EPSILON) * roundFactor) /
    roundFactor;
  const roundedPct =
    Math.round((totalValuationChangePct + Number.EPSILON) * roundFactor) /
    roundFactor;
  const isPositiveChange = roundedChange > 0;

  if (roundedChange > 0) {
    changeColor = 'text-emerald-500';
  } else if (roundedChange < 0) {
    changeColor = 'text-rose-500';
  }

  const totalValuationText = formatUsd(totalValuation, 0);

  if (roundedChange !== 0) {
    totalValuationChangeText = formatSignedUsd(roundedChange, 2);
  }

  if (!Number.isNaN(roundedPct)) {
    if (roundedPct > 0) {
      totalValuationChangePctText = `+${roundedPct.toFixed(2)}%`;
    } else if (roundedPct < 0) {
      totalValuationChangePctText = `${roundedPct.toFixed(2)}%`;
    } else {
      totalValuationChangePctText = '0.00%';
    }
  }

  const tossTitleStyle = getConditionalTypographyStyle(
    isInTossApp,
    'Typography2',
    'Bold',
  );
  const tossCaptionStyle = getConditionalTypographyStyle(
    isInTossApp,
    'Typography7',
    'Regular',
  );
  const tossValueStyle = getConditionalTypographyStyle(
    isInTossApp,
    'Typography2',
    'Bold',
  );
  const tossChangePositiveColor = getConditionalColor(isInTossApp, 'success');
  const tossChangeNegativeColor = getConditionalColor(isInTossApp, 'error');
  const tossTextSecondaryColor = getConditionalColor(
    isInTossApp,
    'textSecondary',
  );

  const valuationLabelStyle = tossCaptionStyle
    ? { ...tossCaptionStyle, color: tossTextSecondaryColor ?? undefined }
    : undefined;
  const valuationValueStyle = tossValueStyle
    ? { ...tossValueStyle, color: undefined }
    : undefined;
  const changeValueStyle =
    tossValueStyle != null && totalValuationChange !== 0
      ? {
          ...tossValueStyle,
          color: isPositiveChange
            ? tossChangePositiveColor ?? undefined
            : tossChangeNegativeColor ?? undefined,
        }
      : tossValueStyle ?? undefined;

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <section className="flex flex-col md:flex-row md:items-start justify-between gap-8 pt-8">
        <div className="max-w-2xl">
          <h1
            className={
              !isInTossApp
                ? 'text-4xl md:text-5xl font-extrabold tracking-tight dark:text-white mb-4 leading-[1.1]'
                : 'mb-4'
            }
            style={tossTitleStyle ?? undefined}
          >
            {t.portfolioMgmt}
          </h1>
          <p
            className={
              !isInTossApp
                ? 'text-slate-500 dark:text-slate-400 text-lg font-medium leading-relaxed'
                : ''
            }
            style={
              isInTossApp && tossCaptionStyle
                ? {
                    ...tossCaptionStyle,
                    color: tossTextSecondaryColor ?? undefined,
                  }
                : undefined
            }
          >
            {t.systematicAccumulation}
          </p>
        </div>

        <div className="flex flex-col items-end gap-6 min-w-[280px]">
          <div className="flex items-center gap-8 px-2">
            <div className="flex flex-col items-end">
              <span
                className={
                  !isInTossApp
                    ? 'text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1'
                    : 'mb-1'
                }
                style={valuationLabelStyle}
              >
                {t.totalValuation}
              </span>
              <span
                className={
                  !isInTossApp
                    ? 'text-3xl font-black dark:text-white tracking-tighter'
                    : ''
                }
                style={valuationValueStyle}
              >
                {totalValuationText}
              </span>
            </div>
            <div className="w-[1px] h-10 bg-slate-200 dark:bg-slate-800" />
            <div className="flex flex-col items-end">
              <span
                className={
                  !isInTossApp
                    ? 'text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1'
                    : 'mb-1'
                }
                style={valuationLabelStyle}
              >
                {t.gain24h}
              </span>
              <span
                className={
                  !isInTossApp
                    ? `text-3xl font-black tracking-tighter ${changeColor}`
                    : ''
                }
                style={changeValueStyle}
              >
                {totalValuationChangeText}
              </span>
              <span
                className={
                  !isInTossApp
                    ? `text-xs font-bold mt-0.5 ${changeColor}`
                    : 'mt-0.5'
                }
                style={changeValueStyle}
              >
                {totalValuationChangePctText}
              </span>
            </div>
          </div>

          {isInTossApp ? (
            <TDSButton
              variant="primary"
              onClick={onOpenCreator}
              className="flex items-center justify-center gap-2 !px-10"
            >
              <Plus size={18} strokeWidth={3} /> {t.newPortfolio}
            </TDSButton>
          ) : (
            <button
              type="button"
              onClick={onOpenCreator}
              className="w-full md:w-auto px-10 py-5 bg-blue-600 text-white rounded-[2rem] font-black text-sm uppercase shadow-xl shadow-blue-500/30 hover:scale-105 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={18} strokeWidth={3} /> {t.newPortfolio}
            </button>
          )}
        </div>
      </section>

      {portfolios.length === 0 ? (
        <section
          className={
            isInTossApp ? 'block' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'
          }
        >
          <div className="col-span-full glass p-16 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-slate-200 dark:border-white/5">
            <p className="text-slate-500">{copy.emptyPortfolio}</p>
          </div>
        </section>
      ) : (
        <section
          className={
            isInTossApp ? '' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'
          }
        >
          {isInTossApp ? (
            <TDSList className="list-none p-0 m-0 space-y-4">
              {portfolios.map((portfolio) => (
                <TDSListRow
                  key={portfolio.id}
                  border="none"
                  verticalPadding="large"
                >
                  <PortfolioCardContainer
                    lang={lang}
                    portfolio={portfolio}
                    onClosePortfolio={handleClosePortfolio}
                    onDeletePortfolio={handleDeletePortfolio}
                    onUpdatePortfolio={onUpdatePortfolio}
                    onOpenAlarm={handleOpenAlarm}
                    onOpenDetails={handleOpenDetails}
                    onOpenQuickInput={handleOpenQuickInput}
                    onOpenExecution={handleOpenExecution}
                    onOpenAIImage={handleOpenAIImage}
                    onDailyExecutionBlock={
                      onDailyExecutionSummaryChange != null
                        ? setDailyExecutionBlockForId
                        : undefined
                    }
                  />
                </TDSListRow>
              ))}
            </TDSList>
          ) : (
            portfolios.map((portfolio) => (
              <PortfolioCardContainer
                key={portfolio.id}
                lang={lang}
                portfolio={portfolio}
                onClosePortfolio={handleClosePortfolio}
                onDeletePortfolio={handleDeletePortfolio}
                onUpdatePortfolio={onUpdatePortfolio}
                onOpenAlarm={handleOpenAlarm}
                onOpenDetails={handleOpenDetails}
                onOpenQuickInput={handleOpenQuickInput}
                onOpenExecution={handleOpenExecution}
                onOpenAIImage={handleOpenAIImage}
                onDailyExecutionBlock={
                  onDailyExecutionSummaryChange != null
                    ? setDailyExecutionBlockForId
                    : undefined
                }
              />
            ))
          )}
        </section>
      )}
    </div>
  );
};

export default Dashboard;
```

### `components/AuthModals.tsx`

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, UserCheck, ShieldCheck } from 'lucide-react';
import type { AppLang } from '../types';
import {
  getAuthModalMessages,
  type AuthModalMessageSet,
  type AuthModalType,
  type AuthProvider,
} from '../constants/messages/authMessages';
import { TDSButton, TDSModal, TDSModalHeader } from './tds';
import { TdsAlertDialog } from './tds-adapter/TdsAlertDialog';
import { TDS_DIALOG_MESSAGES } from '../constants/tdsDialogMessages';
import { useTossApp } from '../contexts/TossAppContext';
import LoginView from './auth/LoginView';
import SignupView from './auth/SignupView';
import ResetPasswordView from './auth/ResetPasswordView';
import ChangePasswordView from './auth/ChangePasswordView';
import ProfileView from './auth/ProfileView';
import type {
  SignedInUser,
  LoginViewProps,
  SignupViewProps,
  ResetPasswordViewProps,
  ChangePasswordViewProps,
  ProfileViewProps,
} from './auth/authViewTypes';
import { handlePressEnterOrSpace } from '../src/utils/a11yHelpers';

const EMAIL_VERIFICATION_REDIRECT_DELAY_MS = 3000;
const PASSWORD_MIN_LENGTH = 8;
const UPPERCASE_PASSWORD_RE = /[A-Z]/;
const LOWERCASE_PASSWORD_RE = /[a-z]/;
const NUMBER_PASSWORD_RE = /[0-9]/;
const SPECIAL_PASSWORD_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;
const AUTH_ERROR_CODE_MISSING_CURRENT_USER_EMAIL =
  'AUTH_MISSING_CURRENT_USER_EMAIL';
const AUTH_ERROR_CODE_CURRENT_PASSWORD_INCORRECT =
  'AUTH_CURRENT_PASSWORD_INCORRECT';

/**
 * Rule 10: `ProfileView` 등 메모이제이션된 자식에 안정된 `setLoading` 참조를 넘기기 위한 모듈 레벨 noop.
 */
const noopSetBoolean = (_value: boolean): void => {};

export interface SignupDraft {
  email: string;
  password: string;
  termsConsent: boolean;
  privacyConsent: boolean;
}

export interface ChangePasswordDraft {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

type AuthCompletionKind =
  | 'password_ok'
  | 'password_ok_relogin'
  | 'account_deleted';

export interface SignupCommandResultVerifyEmail {
  kind: 'verify_email';
}

export interface SignupCommandResultSignedIn {
  kind: 'signed_in';
  user: SignedInUser;
}

export type SignupCommandResult =
  | SignupCommandResultVerifyEmail
  | SignupCommandResultSignedIn;

export interface AuthCommands {
  signIn: {
    run: (email: string, password: string) => Promise<SignedInUser>;
    isExecuting: boolean;
  };
  signUp: {
    run: (draft: SignupDraft) => Promise<SignupCommandResult>;
    isExecuting: boolean;
  };
  signInWithOAuth: {
    run: (provider: AuthProvider, mode: 'login' | 'signup') => Promise<void>;
    isExecuting: boolean;
  };
  resetPassword: {
    run: (email: string) => Promise<void>;
    isExecuting: boolean;
  };
  changePassword: {
    run: (draft: ChangePasswordDraft) => Promise<void>;
    isExecuting: boolean;
  };
  connectTelegram: {
    run: () => Promise<string>;
    isExecuting: boolean;
  };
  deleteAccount: {
    run: () => Promise<void>;
    isExecuting: boolean;
  };
}

interface AuthModalsProps {
  lang: AppLang;
  type: AuthModalType;
  commands: AuthCommands;
  onClose: () => void;
  onRequestClose?: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  onSignedIn: (user: SignedInUser) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  currentUserEmail?: string | null;
  currentTier?: 'free' | 'pro' | 'premium' | null;
  currentUserId?: string;
  onUpgradePlan?: (planId: 'pro' | 'premium') => void;
  telegramConnectedAt?: string | null;
  telegramAlertsEnabled?: boolean;
  onTelegramAlertsEnabledChange?: (enabled: boolean) => void;
  shouldShowSignedInWelcome?: boolean;
  onCompleteSignedInWelcome?: () => void;
}

interface AuthModalController {
  isBusy: boolean;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  errorMessage: string | null;
  infoMessage: string | null;
  setErrorMessage: (message: string | null) => void;
  setInfoMessage: (message: string | null) => void;
  termsConsent: boolean;
  setTermsConsent: (value: boolean) => void;
  privacyConsent: boolean;
  setPrivacyConsent: (value: boolean) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  currentPassword: string;
  setCurrentPassword: (value: string) => void;
  authCompletionKind: AuthCompletionKind | null;
  closeAuthCompletion: () => void;
  handleSubmit: (event: React.FormEvent) => Promise<void>;
  handleResetPassword: (emailToUse?: string) => Promise<void>;
  handleSocialLogin: (provider: AuthProvider) => Promise<void>;
  handleConnectTelegram: () => Promise<string>;
  handleDeleteAccount: () => Promise<void>;
  telegramLinkToken: string | null;
  setTelegramLinkToken: (value: string | null) => void;
  telegramLinkLoading: boolean;
  setTelegramLinkLoading: (value: boolean) => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (value: boolean) => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (value: string) => void;
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message.trim() || null;
  }

  if (
    error != null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message.trim() || null;
  }

  return null;
}

function getErrorName(error: unknown): string | null {
  if (error instanceof Error) {
    return error.name || null;
  }

  if (
    error != null &&
    typeof error === 'object' &&
    'name' in error &&
    typeof error.name === 'string'
  ) {
    return error.name || null;
  }

  return null;
}

function isAbortError(error: unknown): boolean {
  return getErrorName(error) === 'AbortError';
}

function getFriendlyAuthErrorMessage(
  copy: AuthModalMessageSet,
  error: unknown,
  fallbackMessage: string,
): string {
  const rawMessage = getErrorMessage(error)?.toLowerCase();
  if (rawMessage == null) {
    return fallbackMessage;
  }

  if (rawMessage.includes('already registered')) {
    return copy.validation.alreadyRegistered;
  }
  if (rawMessage.includes('invalid email')) {
    return copy.validation.invalidEmail;
  }
  if (rawMessage.includes('email rate limit')) {
    return copy.validation.emailRateLimit;
  }
  if (rawMessage.includes('password')) {
    return copy.validation.weakPassword;
  }

  return fallbackMessage;
}

function getSocialProviderLabel(
  copy: AuthModalMessageSet,
  provider: AuthProvider,
): string {
  switch (provider) {
    case 'google':
      return copy.social.google;
    case 'github':
      return copy.social.github;
    case 'kakao':
      return copy.social.kakao;
    default: {
      const exhaustiveCheck: never = provider;
      return exhaustiveCheck;
    }
  }
}

function validatePasswordRules(
  copy: AuthModalMessageSet,
  password: string,
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return copy.passwordRule.minLength;
  }
  if (!UPPERCASE_PASSWORD_RE.test(password)) {
    return copy.passwordRule.uppercase;
  }
  if (!LOWERCASE_PASSWORD_RE.test(password)) {
    return copy.passwordRule.lowercase;
  }
  if (!NUMBER_PASSWORD_RE.test(password)) {
    return copy.passwordRule.number;
  }
  if (!SPECIAL_PASSWORD_RE.test(password)) {
    return copy.passwordRule.special;
  }

  return null;
}

function getAuthCompletionDialogTitle(
  copy: AuthModalMessageSet,
  kind: AuthCompletionKind,
): string {
  switch (kind) {
    case 'password_ok':
      return copy.helper.passwordChangedTitle;
    case 'password_ok_relogin':
      return copy.helper.passwordChangedReloginTitle;
    case 'account_deleted':
      return copy.helper.accountDeletedTitle;
    default: {
      const exhaustiveCheck: never = kind;
      return exhaustiveCheck;
    }
  }
}

function getAuthCompletionDialogBody(
  copy: AuthModalMessageSet,
  kind: AuthCompletionKind,
): string {
  switch (kind) {
    case 'password_ok':
      return copy.helper.passwordChangedBody;
    case 'password_ok_relogin':
      return copy.helper.passwordChangedReloginBody;
    case 'account_deleted':
      return copy.helper.accountDeletedBody;
    default: {
      const exhaustiveCheck: never = kind;
      return exhaustiveCheck;
    }
  }
}

function useAuthModalController(
  type: AuthModalType,
  copy: AuthModalMessageSet,
  commands: AuthCommands,
  isInTossApp: boolean,
  currentUserEmail: string | null,
  currentTier: 'free' | 'pro' | 'premium',
  currentUserId: string | undefined,
  telegramConnectedAt: string | null,
  telegramAlertsEnabled: boolean,
  onTelegramAlertsEnabledChange: ((enabled: boolean) => void) | undefined,
  onUpgradePlan: ((planId: 'pro' | 'premium') => void) | undefined,
  onLogout: () => Promise<void> | void,
  onSignedIn: (user: SignedInUser) => Promise<void> | void,
  onSwitchType: (nextType: AuthModalType) => void,
  onClose: () => void,
): AuthModalController {
  const [isBusy, setIsBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [termsConsent, setTermsConsent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [authCompletionKind, setAuthCompletionKind] =
    useState<AuthCompletionKind | null>(null);
  const [telegramLinkToken, setTelegramLinkToken] = useState<string | null>(
    null,
  );
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const authCompletionKindRef = useRef<AuthCompletionKind | null>(null);
  const verifyEmailRedirectTimerRef = useRef<number | null>(null);
  /** Rule 11: 연타·중복 submit 시 서버 요청 이중 발사 방지(동기 ref 락). */
  const isAuthMutationLockedRef = useRef(false);

  const clearVerifyEmailRedirectTimer = useCallback((): void => {
    if (verifyEmailRedirectTimerRef.current == null) {
      return;
    }

    window.clearTimeout(verifyEmailRedirectTimerRef.current);
    verifyEmailRedirectTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearVerifyEmailRedirectTimer();
    };
  }, [clearVerifyEmailRedirectTimer]);

  useEffect(() => {
    if (type !== 'profile') {
      setTelegramLinkToken(null);
    }
  }, [type]);

  const openAuthCompletion = useCallback((kind: AuthCompletionKind): void => {
    authCompletionKindRef.current = kind;
    setAuthCompletionKind(kind);
  }, []);

  const closeAuthCompletion = useCallback((): void => {
    const kind = authCompletionKindRef.current;
    authCompletionKindRef.current = null;
    setAuthCompletionKind(null);

    if (kind === 'password_ok') {
      onSwitchType('profile');
      return;
    }

    if (kind === 'password_ok_relogin') {
      onSwitchType('login');
      onClose();
      return;
    }

    if (kind === 'account_deleted') {
      void Promise.resolve(onLogout());
    }
  }, [onClose, onLogout, onSwitchType]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent): Promise<void> => {
      event.preventDefault();

      if (type === 'change-password') {
        if (
          currentPassword.trim() === '' ||
          newPassword.trim() === '' ||
          confirmPassword.trim() === ''
        ) {
          setErrorMessage(copy.validation.missingPasswordFields);
          return;
        }

        if (newPassword !== confirmPassword) {
          setErrorMessage(copy.validation.passwordMismatch);
          return;
        }

        const passwordValidationMessage = validatePasswordRules(
          copy,
          newPassword,
        );
        if (passwordValidationMessage != null) {
          setErrorMessage(passwordValidationMessage);
          return;
        }

        if (isAuthMutationLockedRef.current) {
          return;
        }
        isAuthMutationLockedRef.current = true;
        setIsBusy(true);
        setErrorMessage(null);
        setInfoMessage(null);

        try {
          await commands.changePassword.run({
            currentPassword,
            newPassword,
            confirmPassword,
          });
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          openAuthCompletion('password_ok');
        } catch (error: unknown) {
          const errorCode = getErrorMessage(error);
          if (errorCode === AUTH_ERROR_CODE_MISSING_CURRENT_USER_EMAIL) {
            setErrorMessage(copy.validation.missingCurrentUserEmail);
          } else if (
            errorCode === AUTH_ERROR_CODE_CURRENT_PASSWORD_INCORRECT
          ) {
            setErrorMessage(copy.validation.currentPasswordIncorrect);
          } else {
            setErrorMessage(
              getFriendlyAuthErrorMessage(
                copy,
                error,
                copy.validation.passwordUpdateFailed,
              ),
            );
          }
        } finally {
          isAuthMutationLockedRef.current = false;
          setIsBusy(false);
        }
        return;
      }

      if (type === 'reset-password') {
        if (
          newPassword.trim() === '' ||
          confirmPassword.trim() === ''
        ) {
          setErrorMessage(copy.validation.missingPasswordFields);
          return;
        }

        if (newPassword !== confirmPassword) {
          setErrorMessage(copy.validation.passwordMismatch);
          return;
        }

        const passwordValidationMessage = validatePasswordRules(
          copy,
          newPassword,
        );
        if (passwordValidationMessage != null) {
          setErrorMessage(passwordValidationMessage);
          return;
        }

        if (isAuthMutationLockedRef.current) {
          return;
        }
        isAuthMutationLockedRef.current = true;
        setIsBusy(true);
        setErrorMessage(null);
        setInfoMessage(null);

        try {
          await commands.changePassword.run({
            currentPassword: '',
            newPassword,
            confirmPassword,
          });
          setNewPassword('');
          setConfirmPassword('');
          openAuthCompletion('password_ok_relogin');
        } catch (error: unknown) {
          setErrorMessage(
            getFriendlyAuthErrorMessage(
              copy,
              error,
              copy.validation.passwordUpdateFailed,
            ),
          );
        } finally {
          isAuthMutationLockedRef.current = false;
          setIsBusy(false);
        }
        return;
      }

      if (email.trim() === '' || password.trim() === '') {
        setErrorMessage(copy.validation.missingEmailOrPassword);
        return;
      }

      if (isAuthMutationLockedRef.current) {
        return;
      }
      isAuthMutationLockedRef.current = true;
      setIsBusy(true);
      setErrorMessage(null);
      setInfoMessage(null);

      try {
        if (type === 'signup') {
          if (!termsConsent || !privacyConsent) {
            setErrorMessage(copy.validation.mustAgreeRequiredPolicies);
            return;
          }

          const result = await commands.signUp.run({
            email,
            password,
            termsConsent,
            privacyConsent,
          });

          if (result.kind === 'verify_email') {
            setInfoMessage(copy.validation.emailVerificationSent);
            clearVerifyEmailRedirectTimer();
            verifyEmailRedirectTimerRef.current = window.setTimeout(() => {
              setEmail('');
              setPassword('');
              onSwitchType('login');
            }, EMAIL_VERIFICATION_REDIRECT_DELAY_MS);
            return;
          }

          await Promise.resolve(onSignedIn(result.user));
          return;
        }

        if (type === 'login') {
          const signedInUser = await commands.signIn.run(email, password);
          await Promise.resolve(onSignedIn(signedInUser));
        }
      } catch (error: unknown) {
        if (isAbortError(error)) {
          return;
        }

        const fallbackMessage =
          type === 'signup'
            ? copy.validation.signupFailed
            : copy.validation.authenticationFailed;
        setErrorMessage(
          getFriendlyAuthErrorMessage(copy, error, fallbackMessage),
        );
      } finally {
        isAuthMutationLockedRef.current = false;
        setIsBusy(false);
      }
    },
    [
      clearVerifyEmailRedirectTimer,
      commands.changePassword,
      commands.signIn,
      commands.signUp,
      confirmPassword,
      copy,
      currentPassword,
      email,
      newPassword,
      onSignedIn,
      onSwitchType,
      openAuthCompletion,
      password,
      privacyConsent,
      termsConsent,
      type,
    ],
  );

  const handleResetPassword = useCallback(
    async (emailToUse?: string): Promise<void> => {
      const targetEmail = emailToUse ?? email ?? currentUserEmail ?? '';
      if (targetEmail.trim() === '') {
        setErrorMessage(copy.validation.resetPasswordNeedsEmail);
        return;
      }

      if (isAuthMutationLockedRef.current) {
        return;
      }
      isAuthMutationLockedRef.current = true;
      setIsBusy(true);
      setErrorMessage(null);
      setInfoMessage(null);

      try {
        await commands.resetPassword.run(targetEmail);
        setInfoMessage(copy.validation.resetPasswordSent);
      } catch (error: unknown) {
        setErrorMessage(
          getFriendlyAuthErrorMessage(
            copy,
            error,
            copy.validation.resetPasswordFailed,
          ),
        );
      } finally {
        isAuthMutationLockedRef.current = false;
        setIsBusy(false);
      }
    },
    [commands.resetPassword, copy, currentUserEmail, email],
  );

  const handleSocialLogin = useCallback(
    async (provider: AuthProvider): Promise<void> => {
      if (type === 'signup' && (!termsConsent || !privacyConsent)) {
        setErrorMessage(copy.validation.mustAgreeRequiredPolicies);
        return;
      }

      if (isAuthMutationLockedRef.current) {
        return;
      }
      isAuthMutationLockedRef.current = true;
      setIsBusy(true);
      setErrorMessage(null);
      setInfoMessage(null);

      let shouldReleaseBusy = true;

      try {
        await commands.signInWithOAuth.run(
          provider,
          type === 'signup' ? 'signup' : 'login',
        );
        shouldReleaseBusy = false;
      } catch (error: unknown) {
        if (isAbortError(error)) {
          return;
        }

        const providerLabel = getSocialProviderLabel(copy, provider);
        const reason =
          getErrorMessage(error) ?? copy.validation.authenticationFailed;
        setErrorMessage(copy.social.oauthFailed(providerLabel, reason));
      } finally {
        isAuthMutationLockedRef.current = false;
        if (shouldReleaseBusy) {
          setIsBusy(false);
        }
      }
    },
    [commands.signInWithOAuth, copy, privacyConsent, termsConsent, type],
  );

  const handleConnectTelegram = useCallback(async (): Promise<string> => {
    return commands.connectTelegram.run();
  }, [commands.connectTelegram]);

  const handleDeleteAccount = useCallback(async (): Promise<void> => {
    if (isAuthMutationLockedRef.current) {
      return;
    }
    isAuthMutationLockedRef.current = true;
    setIsBusy(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      await commands.deleteAccount.run();
      openAuthCompletion('account_deleted');
    } finally {
      isAuthMutationLockedRef.current = false;
      setIsBusy(false);
    }
  }, [commands.deleteAccount, openAuthCompletion]);

  void isInTossApp;
  void currentTier;
  void currentUserId;
  void telegramConnectedAt;
  void telegramAlertsEnabled;
  void onTelegramAlertsEnabledChange;
  void onUpgradePlan;

  return {
    isBusy,
    email,
    setEmail,
    password,
    setPassword,
    errorMessage,
    infoMessage,
    setErrorMessage,
    setInfoMessage,
    termsConsent,
    setTermsConsent,
    privacyConsent,
    setPrivacyConsent,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    currentPassword,
    setCurrentPassword,
    authCompletionKind,
    closeAuthCompletion,
    handleSubmit,
    handleResetPassword,
    handleSocialLogin,
    handleConnectTelegram,
    handleDeleteAccount,
    telegramLinkToken,
    setTelegramLinkToken,
    telegramLinkLoading,
    setTelegramLinkLoading,
    showDeleteConfirm,
    setShowDeleteConfirm,
    deleteConfirmText,
    setDeleteConfirmText,
  };
}

function AuthViewRenderer({
  type,
  lang,
  copy,
  onClose,
  onSwitchType,
  onSignedIn,
  onLogout,
  onUpgradePlan,
  currentUserEmail,
  currentTier,
  currentUserId,
  telegramConnectedAt,
  telegramAlertsEnabled,
  onTelegramAlertsEnabledChange,
  isInTossApp,
  controller,
}: {
  type: AuthModalType;
  lang: AppLang;
  copy: AuthModalMessageSet;
  onClose: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  onSignedIn: (user: SignedInUser) => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  onUpgradePlan?: (planId: 'pro' | 'premium') => void;
  currentUserEmail: string | null;
  currentTier: 'free' | 'pro' | 'premium';
  currentUserId: string | undefined;
  telegramConnectedAt: string | null;
  telegramAlertsEnabled: boolean;
  onTelegramAlertsEnabledChange?: (enabled: boolean) => void;
  isInTossApp: boolean;
  controller: AuthModalController;
}): React.ReactElement {
  switch (type) {
    case 'login':
      return (
        <LoginView
          lang={lang}
          copy={copy}
          onClose={onClose}
          onSwitchType={onSwitchType}
          onSignedIn={onSignedIn}
          email={controller.email}
          setEmail={controller.setEmail}
          password={controller.password}
          setPassword={controller.setPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          handleResetPassword={controller.handleResetPassword}
          handleSocialLogin={controller.handleSocialLogin}
          setError={controller.setErrorMessage}
          isInTossApp={isInTossApp}
        />
      );
    case 'signup':
      return (
        <SignupView
          lang={lang}
          copy={copy}
          onClose={onClose}
          onSwitchType={onSwitchType}
          onSignedIn={onSignedIn}
          email={controller.email}
          setEmail={controller.setEmail}
          password={controller.password}
          setPassword={controller.setPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          handleResetPassword={controller.handleResetPassword}
          handleSocialLogin={controller.handleSocialLogin}
          termsConsent={controller.termsConsent}
          setTermsConsent={controller.setTermsConsent}
          privacyConsent={controller.privacyConsent}
          setPrivacyConsent={controller.setPrivacyConsent}
          setError={controller.setErrorMessage}
          isInTossApp={isInTossApp}
        />
      );
    case 'reset-password':
      return (
        <ResetPasswordView
          lang={lang}
          copy={copy}
          onClose={onClose}
          onSwitchType={onSwitchType}
          newPassword={controller.newPassword}
          setNewPassword={controller.setNewPassword}
          confirmPassword={controller.confirmPassword}
          setConfirmPassword={controller.setConfirmPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          isInTossApp={isInTossApp}
        />
      );
    case 'change-password':
      return (
        <ChangePasswordView
          lang={lang}
          copy={copy}
          onSwitchType={onSwitchType}
          currentUserEmail={currentUserEmail}
          currentPassword={controller.currentPassword}
          setCurrentPassword={controller.setCurrentPassword}
          newPassword={controller.newPassword}
          setNewPassword={controller.setNewPassword}
          confirmPassword={controller.confirmPassword}
          setConfirmPassword={controller.setConfirmPassword}
          loading={controller.isBusy}
          error={controller.errorMessage}
          info={controller.infoMessage}
          handleSubmit={controller.handleSubmit}
          isInTossApp={isInTossApp}
        />
      );
    case 'profile':
      return (
        <ProfileView
          lang={lang}
          copy={copy}
          onClose={onClose}
          onSwitchType={onSwitchType}
          onLogout={onLogout}
          onUpgradePlan={onUpgradePlan}
          currentUserEmail={currentUserEmail}
          currentTier={currentTier}
          currentUserId={currentUserId}
          telegramConnectedAt={telegramConnectedAt}
          telegramAlertsEnabled={telegramAlertsEnabled}
          onTelegramAlertsEnabledChange={onTelegramAlertsEnabledChange}
          error={controller.errorMessage}
          info={controller.infoMessage}
          loading={controller.isBusy}
          setLoading={noopSetBoolean}
          setError={controller.setErrorMessage}
          setInfo={controller.setInfoMessage}
          telegramLinkToken={controller.telegramLinkToken}
          setTelegramLinkToken={controller.setTelegramLinkToken}
          telegramLinkLoading={controller.telegramLinkLoading}
          setTelegramLinkLoading={controller.setTelegramLinkLoading}
          showDeleteConfirm={controller.showDeleteConfirm}
          setShowDeleteConfirm={controller.setShowDeleteConfirm}
          deleteConfirmText={controller.deleteConfirmText}
          setDeleteConfirmText={controller.setDeleteConfirmText}
          onConnectTelegram={controller.handleConnectTelegram}
          onDeleteAccount={controller.handleDeleteAccount}
          isInTossApp={isInTossApp}
        />
      );
    default: {
      const exhaustiveCheck: never = type;
      return exhaustiveCheck;
    }
  }
}

function AuthModals({
  lang,
  type,
  commands,
  onClose,
  onRequestClose,
  onSwitchType,
  onSignedIn,
  onLogout,
  currentUserEmail = null,
  currentTier = 'free',
  currentUserId,
  onUpgradePlan,
  telegramConnectedAt = null,
  telegramAlertsEnabled = false,
  onTelegramAlertsEnabledChange,
  shouldShowSignedInWelcome = false,
  onCompleteSignedInWelcome,
}: AuthModalsProps): React.ReactElement {
  const { isInTossApp } = useTossApp();
  const copy = getAuthModalMessages(lang);
  const handleRequestClose = onRequestClose ?? onClose;
  const resolvedCurrentTier = currentTier ?? 'free';
  const controller = useAuthModalController(
    type,
    copy,
    commands,
    isInTossApp,
    currentUserEmail,
    resolvedCurrentTier,
    currentUserId,
    telegramConnectedAt,
    telegramAlertsEnabled,
    onTelegramAlertsEnabledChange,
    onUpgradePlan,
    onLogout,
    onSignedIn,
    onSwitchType,
    onClose,
  );

  const isSignedInWelcomeVisible =
    type === 'profile' && shouldShowSignedInWelcome === true;
  const title = isSignedInWelcomeVisible
    ? copy.helper.signedInSuccessTitle
    : copy.title[type];

  const authCompletionTitle =
    controller.authCompletionKind != null
      ? getAuthCompletionDialogTitle(copy, controller.authCompletionKind)
      : null;

  const authCompletionBody =
    controller.authCompletionKind != null
      ? getAuthCompletionDialogBody(copy, controller.authCompletionKind)
      : null;

  const modalContent = (
    <>
      {isInTossApp ? (
        <TDSModalHeader
          title={title}
          onClose={handleRequestClose}
          leftAccessory={
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              {type === 'profile' ? (
                <UserCheck className="text-white" size={20} />
              ) : (
                <ShieldCheck className="text-white" size={20} />
              )}
            </div>
          }
        />
      ) : (
        <div className="p-6 md:p-8 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              {type === 'profile' ? (
                <UserCheck className="text-white" size={20} />
              ) : (
                <ShieldCheck className="text-white" size={20} />
              )}
            </div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 dark:text-slate-400"
            aria-label={copy.a11y.closeModal}
          >
            <X size={24} />
          </button>
        </div>
      )}

      <div className="p-6 md:p-10 space-y-6 md:space-y-8 flex-1 overflow-y-auto overscroll-contain">
        {isSignedInWelcomeVisible ? (
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-blue-200 bg-blue-50 px-5 py-6 text-center dark:border-blue-500/30 dark:bg-blue-500/10">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-600 shadow-lg shadow-blue-500/20">
                <UserCheck className="text-white" size={28} />
              </div>
              <p className="text-base font-bold leading-7 text-slate-900 dark:text-white">
                {copy.helper.signedInSuccessBody}
              </p>
            </div>
            <TDSButton
              type="button"
              variant="primary"
              fullWidth
              onClick={onCompleteSignedInWelcome}
            >
              {copy.action.acknowledge}
            </TDSButton>
          </div>
        ) : (
          <AuthViewRenderer
            type={type}
            lang={lang}
            copy={copy}
            onClose={onClose}
            onSwitchType={onSwitchType}
            onSignedIn={onSignedIn}
            onLogout={onLogout}
            onUpgradePlan={onUpgradePlan}
            currentUserEmail={currentUserEmail}
            currentTier={resolvedCurrentTier}
            currentUserId={currentUserId}
            telegramConnectedAt={telegramConnectedAt}
            telegramAlertsEnabled={telegramAlertsEnabled}
            onTelegramAlertsEnabledChange={onTelegramAlertsEnabledChange}
            isInTossApp={isInTossApp}
            controller={controller}
          />
        )}
      </div>
    </>
  );

  const resolvedTdsMessages = TDS_DIALOG_MESSAGES[lang] ?? TDS_DIALOG_MESSAGES.ko;
  const actionLabels = resolvedTdsMessages.actions;

  return (
    <>
      {isInTossApp ? (
        <TDSModal open onClose={handleRequestClose}>
          {modalContent}
        </TDSModal>
      ) : (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-xl"
            onClick={handleRequestClose}
            role="button"
            tabIndex={0}
            aria-label={copy.a11y.closeModal}
            onKeyDown={(event) =>
              handlePressEnterOrSpace(event, handleRequestClose)
            }
          />
          <div className="relative w-full max-w-md bg-white dark:bg-[#161d2a] rounded-[2.5rem] md:rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)]">
            {modalContent}
          </div>
        </div>
      )}

      {controller.authCompletionKind != null &&
      authCompletionTitle != null &&
      authCompletionBody != null ? (
        <TdsAlertDialog
          isOpen
          title={authCompletionTitle}
          body={authCompletionBody}
          confirmLabel={copy.action.acknowledge}
          labels={actionLabels}
          onClose={controller.closeAuthCompletion}
        />
      ) : null}
    </>
  );
}

export default AuthModals;

```

### `components/auth/AuthModalCoordinator.tsx`

```tsx
import React, { useCallback, useMemo, useRef } from 'react';
import type { AppLang } from '../../types';
import { useTossApp } from '../../contexts/TossAppContext';
import AuthModals, {
  type AuthCommands,
  type ChangePasswordDraft,
  type SignupDraft,
  type SignupCommandResult,
} from '../AuthModals';
import {
  TdsConfirmDialog,
  type TdsConfirmDialogProps,
} from '../tds-adapter/TdsConfirmDialog';
import {
  useAsyncTdsConfirm,
  type AsyncTdsConfirmDialogProps,
  type UseAsyncTdsConfirmResult,
} from '../tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { getAuthModalMessages } from '../../constants/messages/authMessages';
import type { AuthModalType, SignedInUser } from './authViewTypes';
import { supabase } from '../../services/supabase';
import { buildRedirectUrl } from '../../utils/authHelpers';

const AUTH_PENDING_CONSENT_STORAGE_KEY = 'btd_pending_consent';
const AUTH_ERROR_CODE_MISSING_CURRENT_USER_EMAIL =
  'AUTH_MISSING_CURRENT_USER_EMAIL';
const AUTH_ERROR_CODE_CURRENT_PASSWORD_INCORRECT =
  'AUTH_CURRENT_PASSWORD_INCORRECT';

type BaseAuthModalsProps = Omit<
  React.ComponentProps<typeof AuthModals>,
  'lang' | 'onClose' | 'onRequestClose' | 'onSignedIn' | 'commands'
>;

interface FinishSignedInFlowOptions {
  shouldShowWelcome: boolean;
}

interface AuthModalCoordinatorProps extends BaseAuthModalsProps {
  lang: AppLang;
  isOpen: boolean;
  type: AuthModalType;
  onCloseAuthModal: () => void;
  onRequestMiniAppExit: () => Promise<void> | void;
  onCommitSignedIn: (user: SignedInUser) => Promise<void> | void;
  onFinishSignedInFlow: (
    user: SignedInUser,
    options: FinishSignedInFlowOptions,
  ) => Promise<void> | void;
  shouldShowSignedInWelcome: boolean;
  onCompleteSignedInWelcome: () => void;
}

function AuthModalCoordinator({
  lang,
  isOpen,
  type,
  onCloseAuthModal,
  onRequestMiniAppExit,
  onCommitSignedIn,
  onFinishSignedInFlow,
  shouldShowSignedInWelcome,
  onCompleteSignedInWelcome,
  currentUserEmail = null,
  currentUserId,
  ...authModalProps
}: AuthModalCoordinatorProps): React.ReactElement | null {
  const { isInTossApp } = useTossApp();
  const exitDialog: UseAsyncTdsConfirmResult = useAsyncTdsConfirm(lang);
  const exitDialogProps: AsyncTdsConfirmDialogProps = exitDialog.dialogProps;
  const actionLabels =
    TDS_DIALOG_MESSAGES[lang]?.actions ?? TDS_DIALOG_MESSAGES.ko.actions;
  const confirmDialogProps: TdsConfirmDialogProps = {
    ...exitDialogProps,
    labels: actionLabels,
  };
  const copy = getAuthModalMessages(lang);

  const commands: AuthCommands = useMemo(() => {
    const normalizedCurrentUserEmail = currentUserEmail?.trim() ?? '';
    const normalizedCurrentUserId = currentUserId?.trim() ?? '';

    return {
      signIn: {
        isExecuting: false,
        run: async (email: string, password: string): Promise<SignedInUser> => {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error != null) {
            throw error;
          }
          if (data.user == null) {
            throw new Error(copy.validation.authenticationFailed);
          }

          return {
            id: data.user.id,
            email: data.user.email ?? email,
          };
        },
      },
      signUp: {
        isExecuting: false,
        run: async (draft: SignupDraft): Promise<SignupCommandResult> => {
          const consentTimestamp = new Date().toISOString();
          const emailRedirectTo = buildRedirectUrl('/auth/callback');
          const { data, error } = await supabase.auth.signUp({
            email: draft.email,
            password: draft.password,
            options: {
              emailRedirectTo,
              data: {
                terms_consent_at: consentTimestamp,
                privacy_consent_at: consentTimestamp,
              },
            },
          });
          if (error != null) {
            throw error;
          }
          if (data.user == null) {
            throw new Error(copy.validation.signupFailed);
          }
          if (data.session == null) {
            return {
              kind: 'verify_email',
            };
          }

          return {
            kind: 'signed_in',
            user: {
              id: data.user.id,
              email: data.user.email ?? draft.email,
            },
          };
        },
      },
      signInWithOAuth: {
        isExecuting: false,
        run: async (
          provider: 'google' | 'github' | 'kakao',
          mode: 'login' | 'signup',
        ): Promise<void> => {
          if (mode === 'signup' && typeof window !== 'undefined') {
            const consentTimestamp = new Date().toISOString();
            localStorage.setItem(
              AUTH_PENDING_CONSENT_STORAGE_KEY,
              JSON.stringify({
                terms_consent_at: consentTimestamp,
                privacy_consent_at: consentTimestamp,
              }),
            );
          }

          const redirectTo = buildRedirectUrl('/auth/callback');
          const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
              redirectTo,
              queryParams:
                provider === 'kakao'
                  ? {
                      access_type: 'offline',
                      prompt: 'consent',
                    }
                  : undefined,
            },
          });
          if (error != null) {
            throw error;
          }
        },
      },
      resetPassword: {
        isExecuting: false,
        run: async (email: string): Promise<void> => {
          const redirectTo = buildRedirectUrl('/auth/reset-password');
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo,
          });
          if (error != null) {
            throw error;
          }
        },
      },
      changePassword: {
        isExecuting: false,
        run: async (draft: ChangePasswordDraft): Promise<void> => {
          if (draft.currentPassword.trim() !== '') {
            if (normalizedCurrentUserEmail.length === 0) {
              throw new Error(AUTH_ERROR_CODE_MISSING_CURRENT_USER_EMAIL);
            }

            const { error: signInError } = await supabase.auth.signInWithPassword(
              {
                email: normalizedCurrentUserEmail,
                password: draft.currentPassword,
              },
            );
            if (signInError != null) {
              throw new Error(AUTH_ERROR_CODE_CURRENT_PASSWORD_INCORRECT);
            }
          }

          const { error } = await supabase.auth.updateUser({
            password: draft.newPassword,
          });
          if (error != null) {
            throw error;
          }
        },
      },
      connectTelegram: {
        isExecuting: false,
        run: async (): Promise<string> => {
          if (normalizedCurrentUserId.length === 0) {
            throw new Error('User ID required');
          }

          const token = crypto.randomUUID().replace(/-/g, '');
          const { error } = await supabase
            .from('telegram_link_tokens')
            .insert({ user_id: normalizedCurrentUserId, token });
          if (error != null) {
            throw error;
          }

          return token;
        },
      },
      deleteAccount: {
        isExecuting: false,
        run: async (): Promise<void> => {
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession();
          if (sessionError != null) {
            throw sessionError;
          }
          const sessionAccessToken = session?.access_token ?? '';
          if (sessionAccessToken.trim() === '') {
            const sessionExpiredMessage =
              TDS_DIALOG_MESSAGES[lang]?.auth?.sessionExpiredBody ??
              TDS_DIALOG_MESSAGES.ko.auth.sessionExpiredBody;
            throw new Error(sessionExpiredMessage);
          }

          const result = await supabase.functions.invoke('delete-account', {
            headers: {
              Authorization: `Bearer ${sessionAccessToken}`,
            },
          });
          if (result.error != null) {
            throw new Error(
              result.error.message || copy.profile.deleteAccountFailed,
            );
          }
        },
      },
    };
  }, [copy, currentUserEmail, currentUserId, lang]);

  const isCommittingSignInRef = useRef(false);

  const handleSignedIn = useCallback(
    async (user: SignedInUser) => {
      if (isCommittingSignInRef.current) {
        return;
      }
      isCommittingSignInRef.current = true;

      try {
        await Promise.resolve(onCommitSignedIn(user));

        const shouldShowWelcome =
          isInTossApp && (type === 'login' || type === 'signup');

        await Promise.resolve(
          onFinishSignedInFlow(user, {
            shouldShowWelcome,
          }),
        );
      } catch (error: unknown) {
        console.error(
          '[AuthModalCoordinator] Sign-in flow execution failed',
          error,
        );
      } finally {
        isCommittingSignInRef.current = false;
      }
    },
    [isInTossApp, onCommitSignedIn, onFinishSignedInFlow, type],
  );

  const handleRequestMiniAppExit = useCallback(async () => {
    try {
      await Promise.resolve(onRequestMiniAppExit());
    } catch (error: unknown) {
      console.error(
        '[AuthModalCoordinator] Mini-app exit request failed',
        error,
      );
      throw error;
    }
  }, [onRequestMiniAppExit]);

  const handleRequestClose = useCallback(() => {
    if (!isInTossApp || type !== 'login') {
      onCloseAuthModal();
      return;
    }

    exitDialog.open({
      title: copy.exitDialog.authCloseTitle,
      body: copy.exitDialog.authCloseBody,
      confirmLabel: copy.exitDialog.authCloseConfirm,
      tone: 'primary',
      action: async () => {
        try {
          await handleRequestMiniAppExit();
        } catch (error: unknown) {
          console.error(
            '[AuthModalCoordinator] Auth close confirm action failed',
            error,
          );
        } finally {
          onCloseAuthModal();
        }
      },
    });
  }, [
    copy.exitDialog.authCloseBody,
    copy.exitDialog.authCloseConfirm,
    copy.exitDialog.authCloseTitle,
    exitDialog,
    handleRequestMiniAppExit,
    isInTossApp,
    onCloseAuthModal,
    type,
  ]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <AuthModals
        {...authModalProps}
        lang={lang}
        type={type}
        commands={commands}
        onClose={onCloseAuthModal}
        onRequestClose={handleRequestClose}
        onSignedIn={handleSignedIn}
        currentUserEmail={currentUserEmail}
        currentUserId={currentUserId}
        shouldShowSignedInWelcome={shouldShowSignedInWelcome}
        onCompleteSignedInWelcome={onCompleteSignedInWelcome}
      />

      <TdsConfirmDialog {...confirmDialogProps} />
    </>
  );
}

export default AuthModalCoordinator;

```

### `components/auth/ChangePasswordView.tsx`

```tsx
import React from 'react';
import { Lock, Key } from 'lucide-react';
import { TDSTextField, TDSButton } from '../tds';
import type { ChangePasswordViewProps } from './authViewTypes';

function ChangePasswordView({
  copy,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  loading,
  error,
  info,
  handleSubmit,
  isInTossApp,
}: ChangePasswordViewProps): React.ReactElement {
  const submitLabel = loading
    ? copy.action.processing
    : copy.action.changePassword;

  if (isInTossApp) {
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        <TDSTextField label={copy.field.currentPasswordLabel} type="password" value={currentPassword} onChange={setCurrentPassword} placeholder={copy.field.passwordPlaceholder} required hasError={!!error} />
        <TDSTextField label={copy.field.newPasswordLabel} type="password" value={newPassword} onChange={setNewPassword} placeholder={copy.field.passwordPlaceholder} required hasError={!!error} />
        <TDSTextField label={copy.field.confirmPasswordLabel} type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder={copy.field.passwordPlaceholder} required hasError={!!error} />
        {error && <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">{error}</p>}
        {info && <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">{info}</p>}
        <TDSButton type="submit" fullWidth loading={loading} disabled={loading}>{submitLabel}</TDSButton>
      </form>
    );
  }

  return (
  <form onSubmit={handleSubmit} className="space-y-6">
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{copy.field.currentPasswordLabel}</label>
      <div className="relative">
        <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="password"
          required
          placeholder={copy.field.passwordPlaceholder}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>
    </div>
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{copy.field.newPasswordLabel}</label>
      <div className="relative">
        <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="password"
          required
          placeholder={copy.field.passwordPlaceholder}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>
    </div>
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{copy.field.confirmPasswordLabel}</label>
      <div className="relative">
        <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="password"
          required
          placeholder={copy.field.passwordPlaceholder}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      </div>
    </div>
    {error && (
      <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">{error}</p>
    )}
    {info && (
      <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">{info}</p>
    )}
    <button
      type="submit"
      className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-60 disabled:hover:scale-100"
      disabled={loading}
    >
      {submitLabel}
    </button>
  </form>
  );
}

export default ChangePasswordView;
```

### `components/auth/LoginView.tsx`

```tsx
import React from 'react';
import { Mail, Lock } from 'lucide-react';
import TossLoginView from '../TossLoginView';
import type { LoginViewProps } from './authViewTypes';

function LoginView({
  lang,
  copy,
  onSwitchType,
  onSignedIn,
  email,
  setEmail,
  password,
  setPassword,
  loading,
  error,
  info,
  handleSubmit,
  handleResetPassword,
  handleSocialLogin,
  setError,
  isInTossApp,
}: LoginViewProps): React.ReactElement {
  if (isInTossApp) {
    return (
      <>
        {error && (
          <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
            {error}
          </p>
        )}
        <TossLoginView lang={lang} onSignedIn={onSignedIn} onError={setError} />
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
          {copy.field.emailLabel}
        </label>
        <div className="relative">
          <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="email"
            required
            placeholder={copy.field.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
          {copy.field.passwordLabel}
        </label>
        <div className="relative">
          <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="password"
            required
            placeholder={copy.field.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>
      {error && (
        <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
          {error}
        </p>
      )}
      {info && (
        <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">
          {info}
        </p>
      )}
      <button
        type="submit"
        className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-60 disabled:hover:scale-100"
        disabled={loading}
      >
        {loading ? copy.action.processing : copy.action.login}
      </button>
      <button
        type="button"
        onClick={() => handleResetPassword()}
        className="w-full mt-3 py-2 text-[11px] font-bold text-slate-400 hover:text-blue-400 transition-colors uppercase tracking-widest underline-offset-4 active:scale-95 transition-transform"
      >
        {copy.helper.forgotPassword}
      </button>
      <div className="pt-4 border-t border-slate-200 dark:border-white/5 space-y-3">
        <p className="text-[10px] text-slate-600 dark:text-slate-500 font-bold uppercase tracking-[0.2em] text-center">
          {copy.helper.continueWithSocial}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <button type="button" onClick={() => handleSocialLogin('google')} className="py-3 bg-white text-slate-900 rounded-2xl font-black text-[11px] uppercase tracking-widest border border-white/10 hover:bg-slate-100 transition-all disabled:opacity-60" disabled={loading}>
            {copy.social.google}
          </button>
          <button type="button" onClick={() => handleSocialLogin('kakao')} className="py-3 bg-[#FEE500] text-[#000000] rounded-2xl font-black text-[11px] uppercase tracking-widest border border-[#FEE500]/20 hover:bg-[#FEE500]/90 transition-all disabled:opacity-60 shadow-sm" disabled={loading}>
            {copy.social.kakao}
          </button>
          <button type="button" onClick={() => handleSocialLogin('github')} className="py-3 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-white rounded-2xl font-black text-[11px] uppercase tracking-widest border border-slate-200 dark:border-white/20 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all disabled:opacity-60" disabled={loading}>
            {copy.social.github}
          </button>
        </div>
      </div>
      <div className="text-center pt-4">
        <button type="button" onClick={() => onSwitchType('signup')} className="text-[11px] font-bold text-slate-500 hover:text-blue-500 transition-colors uppercase tracking-widest">
          {copy.helper.signupInstead}
        </button>
      </div>
    </form>
  );
}

export default LoginView;
```

### `components/auth/ProfileView.tsx`

```tsx
import React from 'react';
import { UserCheck, Key, LogOut, Send, Sparkles } from 'lucide-react';
import type { AppLang } from '../../types';
import {
  getMembershipMemberBadge,
  getTelegramBotSearchMessage,
} from '../../constants/messages/profileMessages';
import Toggle from '../Toggle';
import HoverTip from '../HoverTip';
import { TDSButton } from '../tds';
import { resolvePaidTier, type PaidTier } from '../../utils/appEntryHelpers';
import type { ProfileViewProps } from './authViewTypes';
import RefundGuideController from './RefundGuideController';

function getTierChipClassName(paidTier: PaidTier): string {
  switch (paidTier) {
    case 'premium':
      return 'bg-amber-400 text-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.55)]';
    case 'pro':
      return 'bg-sky-400 text-slate-900 shadow-[0_0_16px_rgba(56,189,248,0.45)]';
    case 'free':
      return 'bg-slate-900/80 text-slate-100';
    default: {
      const exhaustiveCheck: never = paidTier;
      return exhaustiveCheck;
    }
  }
}

const PROFILE_DATE_LOCALE: Record<AppLang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
};

function getProfileErrorMessage(
  prefix: string,
  error: unknown,
): string {
  if (
    error != null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim() !== ''
  ) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
}

function ProfileView({
  lang,
  copy,
  onSwitchType,
  onLogout,
  onUpgradePlan,
  currentUserEmail,
  currentTier,
  currentUserId,
  telegramConnectedAt,
  telegramAlertsEnabled,
  onTelegramAlertsEnabledChange,
  error,
  info,
  loading,
  setLoading,
  setError,
  telegramLinkToken,
  setTelegramLinkToken,
  telegramLinkLoading,
  setTelegramLinkLoading,
  showDeleteConfirm,
  setShowDeleteConfirm,
  deleteConfirmText,
  setDeleteConfirmText,
  onConnectTelegram,
  onDeleteAccount,
  isInTossApp,
}: ProfileViewProps): React.ReactElement {
  const paidTier = resolvePaidTier(currentTier);
  const membershipBadge = getMembershipMemberBadge(paidTier, lang);
  const deleteConfirmValue = copy.field.deleteConfirmPlaceholder;
  const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim();
  const telegramBotSearchMessage = getTelegramBotSearchMessage(
    lang,
    telegramBotUsername,
  );

  const handleConnectTelegramClick = async () => {
    if (!currentUserId) return;
    setTelegramLinkLoading(true);
    setError(null);
    try {
      const token = await onConnectTelegram();
      setTelegramLinkToken(token);
      if (telegramBotUsername) {
        window.open(
          `https://t.me/${telegramBotUsername}?start=${token}`,
          '_blank',
          'noopener,noreferrer',
        );
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: unknown }).message)
          : copy.profile.telegramTokenCreateFailed;
      setError(msg);
    } finally {
      setTelegramLinkLoading(false);
    }
  };

  const handleDeleteAccountClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await onDeleteAccount();
    } catch (err: unknown) {
      setError(getProfileErrorMessage(copy.profile.deleteAccountFailed, err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutClick = async () => {
    setLoading(true);
    try {
      await onLogout();
    } catch (err: unknown) {
      console.error('[ProfileView] Logout failed:', err);
      setError(copy.profile.logoutFailed);
    } finally {
      setLoading(false);
    }
  };

  const canUpgrade = !!onUpgradePlan && paidTier !== 'premium';
  const handleUpgradeClick = () => {
    if (!canUpgrade || !onUpgradePlan) return;
    const nextPlan: 'pro' | 'premium' = paidTier === 'free' ? 'pro' : 'premium';
    onUpgradePlan(nextPlan);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 dark:bg-slate-900/60 p-6 rounded-2xl border border-slate-200 dark:border-white/5 text-center">
        <div className="relative w-24 h-24 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 flex items-center justify-center shadow-xl border border-white/10">
          <UserCheck size={40} className="text-slate-100" />
          {paidTier !== 'free' && (
            <div
              className={`absolute -bottom-2 right-3 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${getTierChipClassName(
                paidTier,
              )}`}
            >
              <Sparkles size={10} className="hidden" />
              {membershipBadge}
            </div>
          )}
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-1">
          {copy.profile.accountConnected}
        </p>
        <p className="text-slate-900 dark:text-white font-black text-lg mb-1">
          {currentUserEmail ?? copy.profile.unknownEmail}
        </p>
        <p className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-900/80 text-slate-100 border border-white/10">
          {membershipBadge}
        </p>
      </div>

      {error && <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">{error}</p>}
      {info && <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">{info}</p>}

      <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-white/5 space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {copy.profile.telegramSectionTitle}
        </p>
        {paidTier !== 'free' ? (
          <>
            {telegramConnectedAt ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-emerald-500 dark:text-emerald-400">
                  {copy.profile.telegramConnected}
                  <span className="text-slate-500 dark:text-slate-400 font-normal ml-1">
                    (
                    {new Date(telegramConnectedAt).toLocaleDateString(
                      PROFILE_DATE_LOCALE[lang],
                    )}
                    )
                  </span>
                </p>
                <Toggle
                  checked={telegramAlertsEnabled}
                  onChange={(v) => onTelegramAlertsEnabledChange?.(v)}
                  aria-label={copy.profile.telegramAlertsAriaLabel}
                />
              </div>
            ) : telegramLinkToken ? (
              <div className="space-y-2 text-left">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {copy.profile.telegramLinkInstruction}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  {telegramBotSearchMessage}
                </p>
                <p className="font-mono text-sm font-black bg-slate-800 text-emerald-400 px-3 py-2 rounded-xl break-all">/start {telegramLinkToken}</p>
                {telegramBotUsername ? (
                  <a href={`https://t.me/${telegramBotUsername}?start=${telegramLinkToken}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] text-white rounded-xl text-sm font-bold hover:opacity-90">
                    <Send size={16} /> {copy.action.openInTelegram}
                  </a>
                ) : null}
                <p className="text-[10px] text-slate-500">
                  {copy.profile.reopenProfileHint}
                </p>
              </div>
            ) : isInTossApp ? (
              <TDSButton variant="tertiary" fullWidth disabled={!currentUserId || telegramLinkLoading} loading={telegramLinkLoading} onClick={handleConnectTelegramClick} className="flex items-center justify-center gap-2 text-[#0088cc] border-[#0088cc]/30">
                <Send size={18} />
                {telegramLinkLoading
                  ? copy.action.processing
                  : copy.action.connectTelegram}
              </TDSButton>
            ) : (
              <button type="button" disabled={!currentUserId || telegramLinkLoading} onClick={handleConnectTelegramClick} className="w-full py-4 bg-[#0088cc]/10 text-[#0088cc] dark:text-[#54a9eb] rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 border border-[#0088cc]/30 hover:bg-[#0088cc]/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                <Send size={18} />
                {telegramLinkLoading
                  ? copy.action.processing
                  : copy.action.connectTelegram}
              </button>
            )}
          </>
        ) : (
          <HoverTip text={copy.profile.paidOnly}>
            <span className="inline-block w-full">
              <button type="button" disabled className="w-full py-4 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-600 cursor-not-allowed opacity-80">
                <Send size={18} /> {copy.action.connectTelegram}
              </button>
            </span>
          </HoverTip>
        )}
      </div>

      {canUpgrade && (
        <div className="space-y-3">
          {isInTossApp ? (
            <TDSButton
              variant="primary"
              fullWidth
              onClick={handleUpgradeClick}
              disabled={loading}
              className="flex items-center justify-center gap-3"
            >
              {copy.action.upgradeMembership}
            </TDSButton>
          ) : (
            <button
              type="button"
              onClick={handleUpgradeClick}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-md hover:shadow-lg hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {copy.action.upgradeMembership}
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {/* 토스 미니앱 환경에서는 비밀번호 변경 버튼 숨김 */}
        {!isInTossApp && (
          <button
            type="button"
            onClick={() => onSwitchType('change-password')}
            disabled={loading}
            className="w-full py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 border border-slate-200 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Key size={18} /> {copy.action.changePassword}
          </button>
        )}

        {/* 로그아웃 버튼은 환경별 스타일만 다르게 노출 */}
        {isInTossApp ? (
          <TDSButton
            variant="tertiary"
            fullWidth
            onClick={handleLogoutClick}
            disabled={loading}
            className="flex items-center justify-center gap-3 text-rose-500 border border-rose-500/20"
          >
            <LogOut size={18} /> {copy.action.logout}
          </TDSButton>
        ) : (
          <button
            type="button"
            onClick={handleLogoutClick}
            disabled={loading}
            className="w-full py-5 bg-rose-600/10 text-rose-500 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <LogOut size={18} /> {copy.action.logout}
          </button>
        )}

        {currentTier !== 'free' && (
          <div className="pt-4 border-t border-slate-200 dark:border-white/5">
            <RefundGuideController
              lang={lang}
              isDisabled={loading}
            />
          </div>
        )}

        {/* 토스 미니앱 환경에서는 회원 탈퇴 UI 전체 숨김 */}
        {!isInTossApp && (
          <div className="pt-4 border-t border-slate-200 dark:border-white/5">
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
                className="w-full py-3 text-[11px] font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-widest underline-offset-4 disabled:opacity-60"
              >
                {copy.action.deleteAccount}
              </button>
            ) : (
              <div className="space-y-3 p-4 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-800/50">
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  {copy.profile.deleteWarning}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {copy.profile.deleteInstruction}
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteConfirmValue}
                  className="w-full p-3 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500/50"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText('');
                    }}
                    className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs uppercase tracking-widest"
                  >
                    {copy.action.cancelDelete}
                  </button>
                  <button
                    type="button"
                    disabled={loading || deleteConfirmText !== deleteConfirmValue}
                    onClick={handleDeleteAccountClick}
                    className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed hover:bg-rose-700 transition-colors"
                  >
                    {loading ? copy.action.processing : copy.action.deleteForever}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfileView;
```

### `components/auth/ResetPasswordView.tsx`

```tsx
import React from 'react';
import { Lock } from 'lucide-react';
import { TDSTextField, TDSButton } from '../tds';
import type { ResetPasswordViewProps } from './authViewTypes';

function ResetPasswordView({
  copy,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  loading,
  error,
  info,
  handleSubmit,
  isInTossApp,
}: ResetPasswordViewProps): React.ReactElement {
  const submitLabel = loading
    ? copy.action.processing
    : copy.action.resetPassword;

  if (isInTossApp) {
    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        <TDSTextField
          label={copy.field.newPasswordLabel}
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          placeholder={copy.field.passwordPlaceholder}
          required
          hasError={!!error}
        />
        <TDSTextField
          label={copy.field.confirmPasswordLabel}
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder={copy.field.passwordPlaceholder}
          required
          hasError={!!error}
        />
        {error && (
          <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">{error}</p>
        )}
        {info && (
          <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">{info}</p>
        )}
        <TDSButton type="submit" fullWidth loading={loading} disabled={loading}>
          {submitLabel}
        </TDSButton>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
          {copy.field.newPasswordLabel}
        </label>
        <div className="relative">
          <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="password"
            required
            placeholder={copy.field.passwordPlaceholder}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
          {copy.field.confirmPasswordLabel}
        </label>
        <div className="relative">
          <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="password"
            required
            placeholder={copy.field.passwordPlaceholder}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>
      {error && (
        <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">{error}</p>
      )}
      {info && (
        <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">{info}</p>
      )}
      <button
        type="submit"
        className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-60 disabled:hover:scale-100"
        disabled={loading}
      >
        {submitLabel}
      </button>
    </form>
  );
}

export default ResetPasswordView;
```

### `components/auth/SignupView.tsx`

```tsx
import React from 'react';
import { Mail, Lock } from 'lucide-react';
import TossLoginView from '../TossLoginView';
import type { SignupViewProps } from './authViewTypes';

function SignupView({
  lang,
  copy,
  onSwitchType,
  onSignedIn,
  email,
  setEmail,
  password,
  setPassword,
  loading,
  error,
  info,
  handleSubmit,
  handleResetPassword,
  handleSocialLogin,
  termsConsent,
  setTermsConsent,
  privacyConsent,
  setPrivacyConsent,
  setError,
  isInTossApp,
}: SignupViewProps): React.ReactElement {
  if (isInTossApp) {
    return (
      <>
        {error && (
          <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">
            {error}
          </p>
        )}
        <TossLoginView lang={lang} onSignedIn={onSignedIn} onError={setError} />
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
          {copy.field.emailLabel}
        </label>
        <div className="relative">
          <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="email"
            required
            placeholder={copy.field.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
          {copy.field.passwordLabel}
        </label>
        <div className="relative">
          <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="password"
            required
            placeholder={copy.field.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white font-bold outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>
      <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-white/5">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
          {copy.helper.requiredAgreementTitle}
        </p>
        <label className="flex items-start gap-3 cursor-pointer group">
          <input type="checkbox" checked={termsConsent} onChange={(e) => setTermsConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-blue-600 rounded" />
          <span className="text-xs text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
            <span className="text-blue-500 font-bold">
              [{copy.helper.requiredBadge}]
            </span>{' '}
            <button type="button" onClick={(e) => { e.stopPropagation(); window.open('#terms', '_blank'); }} className="underline underline-offset-2 hover:text-blue-500">
              {copy.helper.termsLabel}
            </button>
            {copy.helper.agreeSuffix}
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer group">
          <input type="checkbox" checked={privacyConsent} onChange={(e) => setPrivacyConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-blue-600 rounded" />
          <span className="text-xs text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
            <span className="text-blue-500 font-bold">
              [{copy.helper.requiredBadge}]
            </span>{' '}
            <button type="button" onClick={(e) => { e.stopPropagation(); window.open('#privacy', '_blank'); }} className="underline underline-offset-2 hover:text-blue-500">
              {copy.helper.privacyLabel}
            </button>
            {copy.helper.agreeSuffix}
          </span>
        </label>
      </div>
      {error && (
        <p className="text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3">{error}</p>
      )}
      {info && (
        <p className="text-xs font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded-2xl px-4 py-3">{info}</p>
      )}
      <button
        type="submit"
        className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-60 disabled:hover:scale-100"
        disabled={loading}
      >
        {loading ? copy.action.processing : copy.action.signup}
      </button>
      <button
        type="button"
        onClick={() => handleResetPassword()}
        className="w-full mt-3 py-2 text-[11px] font-bold text-slate-400 hover:text-blue-400 transition-colors uppercase tracking-widest underline-offset-4 active:scale-95 transition-transform"
      >
        {copy.helper.forgotPassword}
      </button>
      <div className="pt-4 border-t border-slate-200 dark:border-white/5 space-y-3">
        <p className="text-[10px] text-slate-600 dark:text-slate-500 font-bold uppercase tracking-[0.2em] text-center">
          {copy.helper.continueWithSocial}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <button type="button" onClick={() => handleSocialLogin('google')} className="py-3 bg-white text-slate-900 rounded-2xl font-black text-[11px] uppercase tracking-widest border border-white/10 hover:bg-slate-100 transition-all disabled:opacity-60" disabled={loading}>{copy.social.google}</button>
          <button type="button" onClick={() => handleSocialLogin('kakao')} className="py-3 bg-[#FEE500] text-[#000000] rounded-2xl font-black text-[11px] uppercase tracking-widest border border-[#FEE500]/20 hover:bg-[#FEE500]/90 transition-all disabled:opacity-60 shadow-sm" disabled={loading}>{copy.social.kakao}</button>
          <button type="button" onClick={() => handleSocialLogin('github')} className="py-3 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-white rounded-2xl font-black text-[11px] uppercase tracking-widest border border-slate-200 dark:border-white/20 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all disabled:opacity-60" disabled={loading}>{copy.social.github}</button>
        </div>
      </div>
      <div className="text-center pt-4">
        <button type="button" onClick={() => onSwitchType('login')} className="text-[11px] font-bold text-slate-500 hover:text-blue-500 transition-colors uppercase tracking-widest">
          {copy.helper.loginInstead}
        </button>
      </div>
    </form>
  );
}

export default SignupView;
```

### `components/auth/authViewTypes.ts`

```ts
import type { FormEvent } from 'react';
import type { AppLang } from '../../types';
import type {
  AuthModalMessageSet,
  AuthProvider,
} from '../../constants/messages/authMessages';

export type AuthModalType =
  | 'login'
  | 'signup'
  | 'profile'
  | 'reset-password'
  | 'change-password';

export interface SignedInUser {
  id: string;
  email: string;
}

export interface LoginViewProps {
  lang: AppLang;
  copy: AuthModalMessageSet;
  onClose: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  onSignedIn: (user: SignedInUser) => Promise<void> | void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  handleSubmit: (event: FormEvent) => Promise<void>;
  handleResetPassword: (emailToUse?: string) => Promise<void>;
  handleSocialLogin: (provider: AuthProvider) => Promise<void>;
  setError: (message: string | null) => void;
  isInTossApp: boolean;
}

export interface SignupViewProps {
  lang: AppLang;
  copy: AuthModalMessageSet;
  onClose: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  onSignedIn: (user: SignedInUser) => Promise<void> | void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  handleSubmit: (event: FormEvent) => Promise<void>;
  handleResetPassword: (emailToUse?: string) => Promise<void>;
  handleSocialLogin: (provider: AuthProvider) => Promise<void>;
  termsConsent: boolean;
  setTermsConsent: (value: boolean) => void;
  privacyConsent: boolean;
  setPrivacyConsent: (value: boolean) => void;
  setError: (message: string | null) => void;
  isInTossApp: boolean;
}

export interface ResetPasswordViewProps {
  lang: AppLang;
  copy: AuthModalMessageSet;
  onClose: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  handleSubmit: (event: FormEvent) => Promise<void>;
  isInTossApp: boolean;
}

export interface ChangePasswordViewProps {
  lang: AppLang;
  copy: AuthModalMessageSet;
  onSwitchType: (nextType: AuthModalType) => void;
  currentUserEmail: string | null;
  currentPassword: string;
  setCurrentPassword: (value: string) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  loading: boolean;
  error: string | null;
  info: string | null;
  handleSubmit: (event: FormEvent) => Promise<void>;
  isInTossApp: boolean;
}

export interface ProfileViewProps {
  lang: AppLang;
  copy: AuthModalMessageSet;
  onClose: () => void;
  onSwitchType: (nextType: AuthModalType) => void;
  onLogout: () => Promise<void> | void;
  onUpgradePlan?: (planId: 'pro' | 'premium') => void;
  currentUserEmail: string | null;
  currentTier: 'free' | 'pro' | 'premium';
  currentUserId: string | undefined;
  telegramConnectedAt: string | null;
  telegramAlertsEnabled: boolean;
  onTelegramAlertsEnabledChange?: (enabled: boolean) => void;
  error: string | null;
  info: string | null;
  loading: boolean;
  setLoading: (value: boolean) => void;
  setError: (message: string | null) => void;
  setInfo: (message: string | null) => void;
  telegramLinkToken: string | null;
  setTelegramLinkToken: (value: string | null) => void;
  telegramLinkLoading: boolean;
  setTelegramLinkLoading: (value: boolean) => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (value: boolean) => void;
  deleteConfirmText: string;
  setDeleteConfirmText: (value: string) => void;
  onConnectTelegram: () => Promise<string>;
  onDeleteAccount: () => Promise<void>;
  isInTossApp: boolean;
}
```

### `components/auth/index.ts`

```ts
export type {
  AuthModalType,
  SignedInUser,
  LoginViewProps,
  SignupViewProps,
  ResetPasswordViewProps,
  ChangePasswordViewProps,
  ProfileViewProps,
} from './authViewTypes';

export { default as LoginView } from './LoginView';
export { default as SignupView } from './SignupView';
export { default as ResetPasswordView } from './ResetPasswordView';
export { default as ChangePasswordView } from './ChangePasswordView';
export { default as ProfileView } from './ProfileView';
```

### `components/auth/SessionExpiredAlertGate.tsx`

```tsx
import React, { useEffect, useRef } from 'react';
import type { AppLang } from '../../types';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { TdsAlertDialog } from '../tds-adapter/TdsAlertDialog';
import { showErrorToast } from '../tds-adapter/showErrorToast';

interface SessionExpiredAlertGateProps {
  lang: AppLang;
  isOpen: boolean;
  onClose: () => void;
}

export const SessionExpiredAlertGate: React.FC<SessionExpiredAlertGateProps> = ({
  lang,
  isOpen,
  onClose,
}) => {
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const authMessages = TDS_DIALOG_MESSAGES[lang]?.auth;
  const fallbackToastMessage = TDS_DIALOG_MESSAGES[lang]?.auth?.authCopyMissingFallback;
  const hasRecoveryToastFiredRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasRecoveryToastFiredRef.current = false;
      return;
    }
    if (labels != null && authMessages != null) {
      return;
    }
    if (
      !hasRecoveryToastFiredRef.current &&
      fallbackToastMessage != null &&
      fallbackToastMessage !== ''
    ) {
      hasRecoveryToastFiredRef.current = true;
      showErrorToast(fallbackToastMessage);
    }
    onClose();
  }, [authMessages, fallbackToastMessage, isOpen, labels, onClose]);

  if (!isOpen || labels == null || authMessages == null) {
    return null;
  }

  return (
    <TdsAlertDialog
      isOpen={isOpen}
      title={authMessages.sessionExpiredTitle}
      body={authMessages.sessionExpiredBody}
      confirmLabel={authMessages.sessionExpiredAcknowledge}
      labels={labels}
      onClose={onClose}
    />
  );
};

export default SessionExpiredAlertGate;
```

### `components/TradeExecutionModal.tsx`

```tsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { CUSTOM_GRADIENT_LOGOS, PAID_STOCKS } from '../constants';
import {
  getTradeMessages,
  type TradeMessageSet,
} from '../constants/messages/tradeMessages';
import { useNoStopMultiSplitExecution } from '../hooks/useNoStopMultiSplitExecution';
import type { AppLang, Portfolio, Trade } from '../types';
import { calculateHoldings } from '../utils/portfolioCalculations';
import { areStrictPositiveFiniteScalars } from '../utils/financialScalarGuards';
import StockLogo from './StockLogo';
import {
  buildTradeFeePreview,
  buildTradeSettlementPreview,
  createTradeId,
  dateKeyToLocalDate,
  formatCalendarMonthLabel,
  formatShareQuantity,
  formatTradeDateLabel,
  formatUsd,
  getMonthStartDateKey,
  getTodayDateKey,
  parseTradeNumericInput,
  shiftMonthDateKey,
  shouldWarnTradeBudgetExceeded,
} from '../src/utils/tradeModalCalculations';

const EMPTY_STOCK_BADGE = {
  gradient: 'linear-gradient(135deg, #2563eb, #1e40af)',
  label: 'STOCK',
};

interface TradeExecutionModalProps {
  lang: AppLang;
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (trade: Trade) => Promise<void> | void;
}

interface TradeExecutionModalViewProps {
  lang: AppLang;
  title: string;
  tradeType: Trade['type'];
  buyLabel: string;
  sellLabel: string;
  stockLabel: string;
  buyDateLabel: string;
  sellDateLabel: string;
  executionPriceLabel: string;
  quantityLabel: string;
  estimatedFeeLabel: string;
  finalFeeLabel: string;
  totalSettlementLabel: string;
  closeAriaLabel: string;
  backdropAriaLabel: string;
  openCalendarAriaLabel: string;
  previousMonthAriaLabel: string;
  nextMonthAriaLabel: string;
  calendarWeekdays: string[];
  selectableStocks: string[];
  selectedStock: string;
  date: string;
  formattedDateLabel: string;
  calendarMonthKey: string;
  formattedCalendarMonthLabel: string;
  isCalendarOpen: boolean;
  priceRaw: string;
  quantityRaw: string;
  feeOverrideRaw: string;
  isMoc: boolean;
  isNoStopMultiSplit: boolean;
  noStopGuideTitle: string;
  noStopGuideLines: string[];
  mocSellTitle: string;
  mocSellDescription: string;
  feePreviewText: string;
  resolvedFeeText: string;
  totalSettlementText: string;
  validationMessage: string | null;
  budgetWarningTitle: string | null;
  budgetWarningMessage: string | null;
  confirmMessage: string;
  manualFeeOverrideHint: string;
  isSaveDisabled: boolean;
  isSaving: boolean;
  saveLabel: string;
  cancelLabel: string;
  onClose: () => void;
  onChangeTradeType: (nextType: Trade['type']) => void;
  onSelectStock: (stock: string) => void;
  onToggleCalendar: () => void;
  onCloseCalendar: () => void;
  onSelectDate: (dateKey: string) => void;
  onMoveCalendarMonth: (delta: number) => void;
  onChangePrice: (value: string) => void;
  onChangeQuantity: (value: string) => void;
  onChangeFeeOverride: (value: string) => void;
  onToggleMoc: () => void;
  onSave: () => Promise<void>;
}

function getUniqueStocks(stocks: string[]): string[] {
  return Array.from(
    new Set(stocks.map((stock) => stock.trim()).filter((stock) => stock !== '')),
  );
}

function getTradeExecutionBuyStocks(portfolio: Portfolio): string[] {
  if (portfolio.strategy.noStopMultiSplit != null) {
    return getUniqueStocks([portfolio.strategy.noStopMultiSplit.targetStock]);
  }

  return getUniqueStocks([
    portfolio.strategy.ma1.stock,
    portfolio.strategy.ma2.stock,
    portfolio.strategy.ma3.stock,
  ]);
}

function getSellableStocks(portfolio: Portfolio): string[] {
  return calculateHoldings(portfolio)
    .filter((holding) => holding.quantity > 0)
    .map((holding) => holding.stock);
}

function buildCalendarDayKeys(monthKey: string): Array<string | null> {
  const monthDate = dateKeyToLocalDate(monthKey);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Array<string | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const dayDate = new Date(year, month, day);
    const dayYear = dayDate.getFullYear();
    const dayMonth = String(dayDate.getMonth() + 1).padStart(2, '0');
    const dayNumber = String(dayDate.getDate()).padStart(2, '0');
    days.push(`${dayYear}-${dayMonth}-${dayNumber}`);
  }

  return days;
}

function buildNoStopGuideLines(
  copy: TradeMessageSet,
  executionData: ReturnType<typeof useNoStopMultiSplitExecution>['executionData'],
  takeProfitPct: number,
): string[] {
  if (executionData == null) {
    return [];
  }

  if (executionData.isFirstBuy) {
    return [copy.helper.noStopFirstBuyHint];
  }

  const lines: string[] = [];

  if (executionData.lowLoc != null) {
    lines.push(
      `${copy.helper.lowLoc}: ${formatUsd(executionData.lowLoc.price)} / ${formatShareQuantity(executionData.lowLoc.quantity)}${copy.helper.sharesUnit}`,
    );
  }

  if (executionData.highLoc != null) {
    lines.push(
      `${copy.helper.highLoc}: ${formatUsd(executionData.highLoc.price)} / ${formatShareQuantity(executionData.highLoc.quantity)}${copy.helper.sharesUnit}`,
    );
    lines.push(copy.helper.noStopGuaranteedDailyFill);
  }

  if (executionData.isSplitComplete) {
    lines.push(copy.helper.noStopSplitComplete);
  }

  if (executionData.takeProfit != null) {
    lines.push(copy.helper.noStopTakeProfitTarget(takeProfitPct));
  }

  return lines;
}

export default function TradeExecutionModal({
  lang,
  portfolio,
  onClose,
  onSave,
}: TradeExecutionModalProps): React.ReactElement {
  const copy = getTradeMessages(lang);
  const noStopExecution = useNoStopMultiSplitExecution(portfolio, lang);

  const buyStocks = useMemo(() => getTradeExecutionBuyStocks(portfolio), [portfolio]);
  const sellableStocks = useMemo(() => getSellableStocks(portfolio), [portfolio]);
  const isNoStopMultiSplit = portfolio.strategy.noStopMultiSplit != null;
  const takeProfitPct = portfolio.strategy.noStopMultiSplit?.takeProfitPct ?? 0;

  const [tradeType, setTradeType] = useState<Trade['type']>('buy');
  const [selectedStockRaw, setSelectedStockRaw] = useState('');
  const [date, setDate] = useState<string>(getTodayDateKey());
  const [calendarMonthKey, setCalendarMonthKey] = useState<string>(
    getMonthStartDateKey(getTodayDateKey()),
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [priceRaw, setPriceRaw] = useState('');
  const [quantityRaw, setQuantityRaw] = useState('');
  const [feeOverrideRaw, setFeeOverrideRaw] = useState('');
  const [isMoc, setIsMoc] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isExecutingTradeRef = useRef(false);

  const selectableStocks = tradeType === 'buy' ? buyStocks : sellableStocks;
  const selectedStock = selectableStocks.includes(selectedStockRaw)
    ? selectedStockRaw
    : (selectableStocks[0] ?? '');

  const price = parseTradeNumericInput(priceRaw);
  const quantity = parseTradeNumericInput(quantityRaw);
  const feePreview = buildTradeFeePreview({
    tradeType,
    price,
    quantity,
    feeRatePercent: portfolio.feeRate,
  });
  const hasManualFeeOverride = feeOverrideRaw.trim() !== '';
  const resolvedFee = hasManualFeeOverride
    ? parseTradeNumericInput(feeOverrideRaw)
    : feePreview.totalFee;
  const totalSettlement = buildTradeSettlementPreview({
    tradeType,
    price,
    quantity,
    fee: resolvedFee,
  });

  const noStopGuideLines = useMemo(
    () => buildNoStopGuideLines(copy, noStopExecution.executionData, takeProfitPct),
    [copy, noStopExecution.executionData, takeProfitPct],
  );

  let validationMessage: string | null = null;
  if (selectedStock === '') {
    if (tradeType === 'sell') {
      validationMessage = copy.helper.noHoldings;
    } else {
      validationMessage = copy.helper.chooseStockFirst;
    }
  } else if (!areStrictPositiveFiniteScalars(price)) {
    validationMessage = copy.helper.invalidPrice;
  } else if (!areStrictPositiveFiniteScalars(quantity)) {
    validationMessage = copy.helper.invalidQuantity;
  }

  const shouldWarnBudget = shouldWarnTradeBudgetExceeded({
    tradeType,
    totalSettlement,
    dailyBuyAmount: portfolio.dailyBuyAmount,
  });
  const budgetWarningMessage = shouldWarnBudget
    ? copy.helper.budgetExceededDetail(
        formatUsd(portfolio.dailyBuyAmount),
        formatUsd(totalSettlement),
      )
    : null;
  const isSaveDisabled = validationMessage != null || isSaving;

  const handleChangeTradeType = useCallback((nextType: Trade['type']): void => {
    setTradeType(nextType);
    setSelectedStockRaw('');
    if (nextType === 'buy') {
      setIsMoc(false);
    }
  }, []);

  const handleToggleCalendar = useCallback((): void => {
    setCalendarMonthKey(getMonthStartDateKey(date));
    setIsCalendarOpen((previous) => !previous);
  }, [date]);

  const handleCloseCalendar = useCallback((): void => {
    setIsCalendarOpen(false);
  }, []);

  const handleSelectDate = useCallback((nextDate: string): void => {
    setDate(nextDate);
    setCalendarMonthKey(getMonthStartDateKey(nextDate));
    setIsCalendarOpen(false);
  }, []);

  const handleMoveCalendarMonth = useCallback((delta: number): void => {
    setCalendarMonthKey((previous) => shiftMonthDateKey(previous, delta));
  }, []);

  const handleToggleMoc = useCallback((): void => {
    setIsMoc((previous) => !previous);
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (isExecutingTradeRef.current || isSaveDisabled) {
      return;
    }

    const nextTrade: Trade = {
      id: createTradeId(),
      type: tradeType,
      stock: selectedStock,
      date,
      price,
      quantity,
      fee: resolvedFee,
      isMOC: tradeType === 'sell' && isMoc ? true : undefined,
    };

    try {
      isExecutingTradeRef.current = true;
      setIsSaving(true);
      await Promise.resolve(onSave(nextTrade));
      onClose();
    } catch (error: unknown) {
      console.error('[TradeExecutionModal] save failed', error);
    } finally {
      isExecutingTradeRef.current = false;
      setIsSaving(false);
    }
  }, [
    date,
    isMoc,
    isSaveDisabled,
    onClose,
    onSave,
    price,
    quantity,
    resolvedFee,
    selectedStock,
    tradeType,
  ]);

  return (
    <TradeExecutionModalView
      lang={lang}
      title={copy.title.tradeExecution}
      tradeType={tradeType}
      buyLabel={copy.action.buy}
      sellLabel={copy.action.sell}
      stockLabel={copy.field.stock}
      buyDateLabel={copy.field.buyDate}
      sellDateLabel={copy.field.sellDate}
      executionPriceLabel={copy.field.executionPrice}
      quantityLabel={copy.field.quantity}
      estimatedFeeLabel={copy.field.estimatedFee}
      finalFeeLabel={copy.field.finalFee}
      totalSettlementLabel={copy.field.totalSettlement}
      closeAriaLabel={copy.aria.closeModal}
      backdropAriaLabel={copy.aria.closeBackdrop}
      openCalendarAriaLabel={copy.aria.openCalendar}
      previousMonthAriaLabel={copy.aria.previousMonth}
      nextMonthAriaLabel={copy.aria.nextMonth}
      calendarWeekdays={copy.calendar.weekdays}
      selectableStocks={selectableStocks}
      selectedStock={selectedStock}
      date={date}
      formattedDateLabel={formatTradeDateLabel(date, lang)}
      calendarMonthKey={calendarMonthKey}
      formattedCalendarMonthLabel={formatCalendarMonthLabel(calendarMonthKey, lang)}
      isCalendarOpen={isCalendarOpen}
      priceRaw={priceRaw}
      quantityRaw={quantityRaw}
      feeOverrideRaw={feeOverrideRaw}
      isMoc={isMoc}
      isNoStopMultiSplit={isNoStopMultiSplit}
      noStopGuideTitle={copy.helper.noStopGuideTitle}
      noStopGuideLines={noStopGuideLines}
      mocSellTitle={copy.helper.mocSellTitle}
      mocSellDescription={copy.helper.mocSellDescription}
      feePreviewText={formatUsd(feePreview.totalFee, 4)}
      resolvedFeeText={formatUsd(resolvedFee, 4)}
      totalSettlementText={formatUsd(totalSettlement)}
      validationMessage={validationMessage}
      budgetWarningTitle={shouldWarnBudget ? copy.helper.budgetExceededTitle : null}
      budgetWarningMessage={budgetWarningMessage}
      confirmMessage={copy.helper.confirmBeforeSave}
      manualFeeOverrideHint={copy.helper.manualFeeOverrideHint}
      isSaveDisabled={isSaveDisabled}
      isSaving={isSaving}
      saveLabel={isSaving ? copy.helper.executingTrade : copy.action.save}
      cancelLabel={copy.action.cancel}
      onClose={onClose}
      onChangeTradeType={handleChangeTradeType}
      onSelectStock={setSelectedStockRaw}
      onToggleCalendar={handleToggleCalendar}
      onCloseCalendar={handleCloseCalendar}
      onSelectDate={handleSelectDate}
      onMoveCalendarMonth={handleMoveCalendarMonth}
      onChangePrice={setPriceRaw}
      onChangeQuantity={setQuantityRaw}
      onChangeFeeOverride={setFeeOverrideRaw}
      onToggleMoc={handleToggleMoc}
      onSave={handleSave}
    />
  );
}

const TradeExecutionModalView = React.memo(function TradeExecutionModalView({
  title,
  tradeType,
  buyLabel,
  sellLabel,
  stockLabel,
  buyDateLabel,
  sellDateLabel,
  executionPriceLabel,
  quantityLabel,
  estimatedFeeLabel,
  finalFeeLabel,
  totalSettlementLabel,
  closeAriaLabel,
  backdropAriaLabel,
  openCalendarAriaLabel,
  previousMonthAriaLabel,
  nextMonthAriaLabel,
  calendarWeekdays,
  selectableStocks,
  selectedStock,
  date,
  formattedDateLabel,
  calendarMonthKey,
  formattedCalendarMonthLabel,
  isCalendarOpen,
  priceRaw,
  quantityRaw,
  feeOverrideRaw,
  isMoc,
  isNoStopMultiSplit,
  noStopGuideTitle,
  noStopGuideLines,
  mocSellTitle,
  mocSellDescription,
  feePreviewText,
  resolvedFeeText,
  totalSettlementText,
  validationMessage,
  budgetWarningTitle,
  budgetWarningMessage,
  confirmMessage,
  manualFeeOverrideHint,
  isSaveDisabled,
  isSaving,
  saveLabel,
  cancelLabel,
  onClose,
  onChangeTradeType,
  onSelectStock,
  onToggleCalendar,
  onCloseCalendar,
  onSelectDate,
  onMoveCalendarMonth,
  onChangePrice,
  onChangeQuantity,
  onChangeFeeOverride,
  onToggleMoc,
  onSave,
}: TradeExecutionModalViewProps): React.ReactElement {
  const calendarDayKeys = useMemo(
    () => buildCalendarDayKeys(calendarMonthKey),
    [calendarMonthKey],
  );

  const handlePriceChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangePrice(event.target.value);
    },
    [onChangePrice],
  );

  const handleQuantityChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeQuantity(event.target.value);
    },
    [onChangeQuantity],
  );

  const handleFeeOverrideChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeFeeOverride(event.target.value);
    },
    [onChangeFeeOverride],
  );

  const dateLabel = tradeType === 'buy' ? buyDateLabel : sellDateLabel;
  const shouldShowMocToggle = tradeType === 'sell' && !isNoStopMultiSplit;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={backdropAriaLabel}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
      />
      <div className="relative z-[121] flex w-full max-w-2xl flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-6">
          <h2 className="text-xl font-black text-slate-900">{title}</h2>
          <button
            type="button"
            aria-label={closeAriaLabel}
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="flex rounded-[1.5rem] border border-slate-200 bg-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => onChangeTradeType('buy')}
              className={`flex-1 rounded-2xl py-4 text-xs font-black ${
                tradeType === 'buy' ? 'bg-blue-600 text-white' : 'text-slate-600'
              }`}
            >
              {buyLabel}
            </button>
            <button
              type="button"
              onClick={() => onChangeTradeType('sell')}
              className={`flex-1 rounded-2xl py-4 text-xs font-black ${
                tradeType === 'sell' ? 'bg-blue-600 text-white' : 'text-slate-600'
              }`}
            >
              {sellLabel}
            </button>
          </div>

          {shouldShowMocToggle ? (
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex-1">
                <div className="mb-1 text-[11px] font-black uppercase tracking-widest text-slate-600">
                  {mocSellTitle}
                </div>
                <div className="text-[11px] leading-relaxed text-slate-500">
                  {mocSellDescription}
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleMoc}
                aria-pressed={isMoc}
                className={`relative h-6 w-12 rounded-full ${
                  isMoc ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                    isMoc ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ) : null}

          {isNoStopMultiSplit && noStopGuideLines.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-[11px] font-black uppercase tracking-widest text-slate-600">
                {noStopGuideTitle}
              </div>
              <div className="space-y-2 text-sm font-bold text-slate-800">
                {noStopGuideLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {stockLabel}
            </div>
            <div className="flex flex-wrap gap-4">
              {selectableStocks.map((ticker) => {
                const info = CUSTOM_GRADIENT_LOGOS[ticker] ?? EMPTY_STOCK_BADGE;
                const isSelected = selectedStock === ticker;
                return (
                  <button
                    key={ticker}
                    type="button"
                    onClick={() => onSelectStock(ticker)}
                    className={`relative flex h-16 w-16 flex-col items-center justify-center overflow-hidden rounded-2xl p-2 text-white ${
                      isSelected
                        ? 'scale-105 ring-2 ring-blue-500 ring-offset-2'
                        : 'opacity-50 grayscale'
                    }`}
                    style={{ background: info.gradient }}
                  >
                    <StockLogo
                      ticker={ticker}
                      size="full"
                      shape="squircle2"
                      paidAccent={PAID_STOCKS.includes(ticker)}
                      className="absolute inset-0"
                    />
                    <span className="z-10 text-[10px] font-black">{ticker}</span>
                    <span className="z-10 text-[5px] font-bold uppercase tracking-tight opacity-80">
                      {info.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {dateLabel}
            </div>
            <div className="relative">
              <Calendar
                className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-slate-500"
                size={20}
              />
              <button
                type="button"
                aria-label={openCalendarAriaLabel}
                onClick={onToggleCalendar}
                className="w-full rounded-3xl border border-slate-200 bg-slate-100/50 p-6 pl-16 text-left font-bold text-slate-900"
              >
                {formattedDateLabel}
              </button>
              {isCalendarOpen ? (
                <>
                  <button
                    type="button"
                    aria-label={backdropAriaLabel}
                    onClick={onCloseCalendar}
                    className="fixed inset-0 z-[121]"
                  />
                  <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-[122] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                      <button
                        type="button"
                        aria-label={previousMonthAriaLabel}
                        onClick={() => onMoveCalendarMonth(-1)}
                        className="rounded-full p-2 text-blue-500"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <div className="text-lg font-black text-slate-900">
                        {formattedCalendarMonthLabel}
                      </div>
                      <button
                        type="button"
                        aria-label={nextMonthAriaLabel}
                        onClick={() => onMoveCalendarMonth(1)}
                        className="rounded-full p-2 text-blue-500"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 px-4 pt-4 pb-2">
                      {calendarWeekdays.map((weekday) => (
                        <div
                          key={weekday}
                          className="flex h-8 items-center justify-center text-xs font-bold text-slate-400"
                        >
                          {weekday}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1 px-4 pb-4">
                      {calendarDayKeys.map((dayKey, index) => {
                        if (dayKey == null) {
                          return <div key={`empty-${index}`} className="h-12" />;
                        }

                        const dayDate = dateKeyToLocalDate(dayKey);
                        const isWeekend =
                          dayDate.getDay() === 0 || dayDate.getDay() === 6;
                        const isSelected = dayKey === date;

                        if (isWeekend) {
                          return (
                            <div
                              key={dayKey}
                              aria-disabled="true"
                              className="flex h-12 items-center justify-center text-gray-300 opacity-30"
                            >
                              {dayDate.getDate()}
                            </div>
                          );
                        }

                        return (
                          <button
                            key={dayKey}
                            type="button"
                            onClick={() => onSelectDate(dayKey)}
                            className={`flex h-12 items-center justify-center rounded-full text-lg font-medium ${
                              isSelected ? 'bg-blue-500 text-white' : 'text-slate-900'
                            }`}
                          >
                            {dayDate.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {executionPriceLabel}
              </div>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-lg font-black text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={priceRaw}
                  onChange={handlePriceChange}
                  placeholder="0.00"
                  className="w-full rounded-3xl border border-slate-200 bg-slate-100/50 p-6 pl-12 text-xl font-black text-slate-900 outline-none"
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {quantityLabel}
              </div>
              <input
                type="number"
                inputMode="decimal"
                value={quantityRaw}
                onChange={handleQuantityChange}
                placeholder="0"
                className="w-full rounded-3xl border border-slate-200 bg-slate-100/50 p-6 text-xl font-black text-slate-900 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 border-t border-slate-200 pt-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {estimatedFeeLabel}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-xl font-black text-slate-900">
                {feePreviewText}
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {finalFeeLabel}
              </div>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-lg font-black text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={feeOverrideRaw}
                  onChange={handleFeeOverrideChange}
                  placeholder={resolvedFeeText.replace('$', '')}
                  className="w-full rounded-3xl border border-slate-200 bg-slate-100/50 p-6 pl-12 text-xl font-black text-slate-900 outline-none"
                />
              </div>
              <p className="text-[11px] font-medium text-slate-500">
                {manualFeeOverrideHint}
              </p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                {totalSettlementLabel}
              </span>
              <span className="text-2xl font-black text-blue-600">
                {totalSettlementText}
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500">{confirmMessage}</p>
          </div>

          {validationMessage != null ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-600">
              {validationMessage}
            </div>
          ) : null}

          {budgetWarningTitle != null && budgetWarningMessage != null ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-1 text-sm font-black text-amber-700">
                {budgetWarningTitle}
              </div>
              <div className="text-sm font-medium text-amber-700">
                {budgetWarningMessage}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex gap-4 border-t border-slate-200 bg-slate-50 p-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-6 py-4 font-black text-slate-600"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              void onSave();
            }}
            disabled={isSaveDisabled}
            aria-busy={isSaving}
            className="flex-1 rounded-2xl bg-blue-600 px-6 py-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
});

TradeExecutionModalView.displayName = 'TradeExecutionModalView';
```

### `components/QuickInputModal.tsx`

```tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronRight, X, Zap } from 'lucide-react';
import { CUSTOM_GRADIENT_LOGOS, PAID_STOCKS } from '../constants';
import { getTradeMessages } from '../constants/messages/tradeMessages';
import { getLatestLocalTradeDateFromDb } from '../services/stockService';
import type { AppLang, Portfolio, Trade } from '../types';
import { calculateHoldings } from '../utils/portfolioCalculations';
import { areStrictPositiveFiniteScalars } from '../utils/financialScalarGuards';
import StockLogo from './StockLogo';
import {
  buildTradeFeePreview,
  calculateBudgetBuyQuantity,
  calculateMocSellQuantity,
  createTradeId,
  formatShareQuantity,
  formatTradeDateLabel,
  formatUsd,
  getTodayDateKey,
  parseTradeNumericInput,
  shouldWarnTradeBudgetExceeded,
} from '../src/utils/tradeModalCalculations';

const EMPTY_STOCK_BADGE = {
  gradient: 'linear-gradient(135deg, #2563eb, #1e40af)',
  label: 'STOCK',
};

interface QuickInputModalProps {
  lang: AppLang;
  portfolio: Portfolio;
  activeSection?: 1 | 2 | 3;
  onClose: () => void;
  onSave: (trade: Trade) => Promise<void> | void;
}

interface QuickInputModalViewProps {
  title: string;
  tradeType: Trade['type'];
  buyLabel: string;
  sellLabel: string;
  stockLabel: string;
  executionPriceLabel: string;
  quantityLabel: string;
  autoQuantityLabel: string;
  estimatedFeeLabel: string;
  totalSettlementLabel: string;
  latestTradeSummary: string | null;
  noticePrimary: string;
  noticeSecondary: string;
  closeAriaLabel: string;
  backdropAriaLabel: string;
  selectableStocks: string[];
  selectedStock: string;
  isSellMode: boolean;
  isMoc: boolean;
  priceRaw: string;
  quantityRaw: string;
  resolvedQuantityText: string;
  feeText: string;
  totalSettlementText: string;
  shouldShowQuantityInput: boolean;
  mocSellTitle: string;
  mocSellDescription: string;
  validationMessage: string | null;
  budgetWarningTitle: string | null;
  budgetWarningMessage: string | null;
  isSaveDisabled: boolean;
  isSaving: boolean;
  saveLabel: string;
  cancelLabel: string;
  onClose: () => void;
  onChangeTradeType: (nextType: Trade['type']) => void;
  onSelectStock: (stock: string) => void;
  onChangePrice: (value: string) => void;
  onChangeQuantity: (value: string) => void;
  onToggleMoc: () => void;
  onSave: () => Promise<void>;
}

function getUniqueStocks(stocks: string[]): string[] {
  return Array.from(
    new Set(stocks.map((stock) => stock.trim()).filter((stock) => stock !== '')),
  );
}

function getActiveSectionStock(
  portfolio: Portfolio,
  activeSection: 1 | 2 | 3,
): string {
  switch (activeSection) {
    case 1:
      return portfolio.strategy.ma1.stock;
    case 2:
      return portfolio.strategy.ma2.stock;
    case 3:
      return portfolio.strategy.ma3.stock;
    default: {
      const exhaustiveCheck: never = activeSection;
      return exhaustiveCheck;
    }
  }
}

function getSellableStocks(portfolio: Portfolio): string[] {
  return calculateHoldings(portfolio)
    .filter((holding) => holding.quantity > 0)
    .map((holding) => holding.stock);
}

function getHoldingQuantity(portfolio: Portfolio, targetStock: string): number {
  const holdings = calculateHoldings(portfolio);
  const holding = holdings.find((entry) => entry.stock === targetStock);
  return holding?.quantity ?? 0;
}

export default function QuickInputModal({
  lang,
  portfolio,
  activeSection = 1,
  onClose,
  onSave,
}: QuickInputModalProps): React.ReactElement {
  const copy = getTradeMessages(lang);
  const isVrStrategy = portfolio.strategy.vrBand != null;
  const targetStockForDate =
    portfolio.strategy.multiSplit?.targetStock ??
    portfolio.strategy.noStopMultiSplit?.targetStock ??
    portfolio.strategy.ma0.stock;

  const sellableStocks = useMemo(() => getSellableStocks(portfolio), [portfolio]);
  const activeSectionStock = getActiveSectionStock(portfolio, activeSection);

  const [tradeType, setTradeType] = useState<Trade['type']>('buy');
  const [selectedStockRaw, setSelectedStockRaw] = useState('');
  const [priceRaw, setPriceRaw] = useState('');
  const [quantityRaw, setQuantityRaw] = useState('');
  const [isMoc, setIsMoc] = useState(false);
  const [latestTradeDate, setLatestTradeDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isExecutingTradeRef = useRef(false);

  let selectedStock = '';
  if (tradeType === 'buy') {
    selectedStock = activeSectionStock;
  } else if (sellableStocks.includes(selectedStockRaw)) {
    selectedStock = selectedStockRaw;
  } else {
    selectedStock = sellableStocks[0] ?? '';
  }

  const price = parseTradeNumericInput(priceRaw);
  const manualQuantity = parseTradeNumericInput(quantityRaw);
  const mocQuantity = calculateMocSellQuantity(
    getHoldingQuantity(portfolio, selectedStock),
  );
  const autoBuyQuantity =
    tradeType === 'buy' && !isVrStrategy
      ? calculateBudgetBuyQuantity({
          price,
          dailyBuyAmount: portfolio.dailyBuyAmount,
          feeRatePercent: portfolio.feeRate,
        })
      : 0;

  let resolvedQuantity = manualQuantity;
  if (tradeType === 'sell' && isMoc) {
    resolvedQuantity = mocQuantity;
  } else if (tradeType === 'buy' && !isVrStrategy) {
    resolvedQuantity = autoBuyQuantity;
  }

  const preview = buildTradeFeePreview({
    tradeType,
    price,
    quantity: resolvedQuantity,
    feeRatePercent: portfolio.feeRate,
  });
  const latestTradeDateResolved = latestTradeDate || getTodayDateKey();
  const shouldShowQuantityInput =
    tradeType === 'sell' || (tradeType === 'buy' && isVrStrategy);

  useEffect(() => {
    let isMounted = true;

    const loadLatestTradeDate = async (): Promise<void> => {
      try {
        const latest = await getLatestLocalTradeDateFromDb(targetStockForDate);
        if (!isMounted) {
          return;
        }
        if (latest != null && latest.trim() !== '') {
          setLatestTradeDate(latest);
          return;
        }
      } catch (error: unknown) {
        console.error('[QuickInputModal] latest trade date fetch failed', error);
      }

      if (isMounted) {
        setLatestTradeDate(getTodayDateKey());
      }
    };

    void loadLatestTradeDate();

    return () => {
      isMounted = false;
    };
  }, [targetStockForDate]);

  let validationMessage: string | null = null;
  if (tradeType === 'sell' && selectedStock === '') {
    validationMessage = copy.helper.noHoldings;
  } else if (!areStrictPositiveFiniteScalars(price)) {
    validationMessage = copy.helper.invalidPrice;
  } else if (tradeType === 'buy' && !isVrStrategy && resolvedQuantity === 0) {
    validationMessage = copy.helper.zeroQuantityBudgetLocked;
  } else if (!areStrictPositiveFiniteScalars(resolvedQuantity)) {
    validationMessage = copy.helper.invalidQuantity;
  }

  const shouldWarnBudget = shouldWarnTradeBudgetExceeded({
    tradeType,
    totalSettlement: preview.totalSettlement,
    dailyBuyAmount: portfolio.dailyBuyAmount,
  });
  const budgetWarningMessage = shouldWarnBudget
    ? copy.helper.budgetExceededDetail(
        formatUsd(portfolio.dailyBuyAmount),
        formatUsd(preview.totalSettlement),
      )
    : null;
  const isSaveDisabled = validationMessage != null || isSaving;

  const handleChangeTradeType = useCallback((nextType: Trade['type']): void => {
    setTradeType(nextType);
    setSelectedStockRaw('');
    if (nextType === 'buy') {
      setIsMoc(false);
    }
  }, []);

  const handleToggleMoc = useCallback((): void => {
    setIsMoc((previous) => !previous);
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (isExecutingTradeRef.current || isSaveDisabled) {
      return;
    }

    const nextTrade: Trade = {
      id: createTradeId(),
      type: tradeType,
      stock: selectedStock,
      date: latestTradeDateResolved,
      price,
      quantity: resolvedQuantity,
      fee: preview.totalFee,
      isMOC: tradeType === 'sell' && isMoc ? true : undefined,
    };

    try {
      isExecutingTradeRef.current = true;
      setIsSaving(true);
      await Promise.resolve(onSave(nextTrade));
      onClose();
    } catch (error: unknown) {
      console.error('[QuickInputModal] save failed', error);
    } finally {
      isExecutingTradeRef.current = false;
      setIsSaving(false);
    }
  }, [
    isMoc,
    isSaveDisabled,
    latestTradeDateResolved,
    onClose,
    onSave,
    preview.totalFee,
    price,
    resolvedQuantity,
    selectedStock,
    tradeType,
  ]);

  return (
    <QuickInputModalView
      title={copy.title.quickInput}
      tradeType={tradeType}
      buyLabel={copy.action.buy}
      sellLabel={copy.action.sell}
      stockLabel={copy.field.stock}
      executionPriceLabel={copy.field.executionPrice}
      quantityLabel={copy.field.quantity}
      autoQuantityLabel={copy.field.autoQuantity}
      estimatedFeeLabel={copy.field.estimatedFee}
      totalSettlementLabel={copy.field.totalSettlement}
      latestTradeSummary={
        latestTradeDateResolved
          ? copy.helper.latestTradeDateSummary(
              formatTradeDateLabel(latestTradeDateResolved, lang),
            )
          : null
      }
      noticePrimary={
        tradeType === 'buy'
          ? copy.helper.activeSectionAutoSelect
          : copy.helper.holdingsSellOnly
      }
      noticeSecondary={copy.helper.feeRateApplied(portfolio.feeRate)}
      closeAriaLabel={copy.aria.closeModal}
      backdropAriaLabel={copy.aria.closeBackdrop}
      selectableStocks={
        tradeType === 'buy'
          ? getUniqueStocks([activeSectionStock])
          : sellableStocks
      }
      selectedStock={selectedStock}
      isSellMode={tradeType === 'sell'}
      isMoc={isMoc}
      priceRaw={priceRaw}
      quantityRaw={quantityRaw}
      resolvedQuantityText={formatShareQuantity(
        resolvedQuantity,
        Number.isInteger(resolvedQuantity) ? 0 : 1,
      )}
      feeText={formatUsd(preview.totalFee, 4)}
      totalSettlementText={formatUsd(preview.totalSettlement)}
      shouldShowQuantityInput={shouldShowQuantityInput}
      mocSellTitle={copy.helper.mocSellTitle}
      mocSellDescription={copy.helper.mocSellDescription}
      validationMessage={validationMessage}
      budgetWarningTitle={shouldWarnBudget ? copy.helper.budgetExceededTitle : null}
      budgetWarningMessage={budgetWarningMessage}
      isSaveDisabled={isSaveDisabled}
      isSaving={isSaving}
      saveLabel={isSaving ? copy.helper.executingTrade : copy.action.save}
      cancelLabel={copy.action.cancel}
      onClose={onClose}
      onChangeTradeType={handleChangeTradeType}
      onSelectStock={setSelectedStockRaw}
      onChangePrice={setPriceRaw}
      onChangeQuantity={setQuantityRaw}
      onToggleMoc={handleToggleMoc}
      onSave={handleSave}
    />
  );
}

const QuickInputModalView = React.memo(function QuickInputModalView({
  title,
  tradeType,
  buyLabel,
  sellLabel,
  stockLabel,
  executionPriceLabel,
  quantityLabel,
  autoQuantityLabel,
  estimatedFeeLabel,
  totalSettlementLabel,
  latestTradeSummary,
  noticePrimary,
  noticeSecondary,
  closeAriaLabel,
  backdropAriaLabel,
  selectableStocks,
  selectedStock,
  isSellMode,
  isMoc,
  priceRaw,
  quantityRaw,
  resolvedQuantityText,
  feeText,
  totalSettlementText,
  shouldShowQuantityInput,
  mocSellTitle,
  mocSellDescription,
  validationMessage,
  budgetWarningTitle,
  budgetWarningMessage,
  isSaveDisabled,
  isSaving,
  saveLabel,
  cancelLabel,
  onClose,
  onChangeTradeType,
  onSelectStock,
  onChangePrice,
  onChangeQuantity,
  onToggleMoc,
  onSave,
}: QuickInputModalViewProps): React.ReactElement {
  const handlePriceChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangePrice(event.target.value);
    },
    [onChangePrice],
  );

  const handleQuantityChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeQuantity(event.target.value);
    },
    [onChangeQuantity],
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={backdropAriaLabel}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
      />
      <div className="relative z-[121] flex w-full max-w-md flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-6">
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg">
                <Zap size={20} className="fill-white text-white" />
              </div>
              <h2 className="text-xl font-black text-slate-900">{title}</h2>
            </div>
            {latestTradeSummary != null ? (
              <p className="text-[10px] font-bold text-slate-500">
                {latestTradeSummary}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={closeAriaLabel}
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <AlertCircle className="shrink-0 text-amber-500" size={18} />
            <div className="text-[11px] font-bold leading-snug text-amber-700">
              <div>{noticePrimary}</div>
              <div className="opacity-80">{noticeSecondary}</div>
            </div>
          </div>

          <div className="flex rounded-2xl border border-slate-200 bg-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => onChangeTradeType('buy')}
              className={`flex-1 rounded-xl py-4 text-xs font-black ${
                tradeType === 'buy' ? 'bg-blue-600 text-white' : 'text-slate-600'
              }`}
            >
              {buyLabel}
            </button>
            <button
              type="button"
              onClick={() => onChangeTradeType('sell')}
              className={`flex-1 rounded-xl py-4 text-xs font-black ${
                tradeType === 'sell' ? 'bg-blue-600 text-white' : 'text-slate-600'
              }`}
            >
              {sellLabel}
            </button>
          </div>

          {isSellMode ? (
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex-1">
                <div className="mb-1 text-[11px] font-black uppercase tracking-widest text-slate-600">
                  {mocSellTitle}
                </div>
                <div className="text-[11px] leading-relaxed text-slate-500">
                  {mocSellDescription}
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleMoc}
                aria-pressed={isMoc}
                className={`relative h-6 w-12 rounded-full ${
                  isMoc ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                    isMoc ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {stockLabel}
            </div>
            <div className="flex flex-wrap gap-4">
              {selectableStocks.map((ticker) => {
                const info = CUSTOM_GRADIENT_LOGOS[ticker] ?? EMPTY_STOCK_BADGE;
                const isSelected = selectedStock === ticker;
                return (
                  <button
                    key={ticker}
                    type="button"
                    onClick={() => onSelectStock(ticker)}
                    className={`relative flex h-14 w-14 flex-col items-center justify-center overflow-hidden rounded-2xl p-2 text-white ${
                      isSelected
                        ? 'scale-105 ring-2 ring-blue-500 ring-offset-2'
                        : 'opacity-60 grayscale'
                    }`}
                    style={{ background: info.gradient }}
                  >
                    <StockLogo
                      ticker={ticker}
                      size="full"
                      shape="squircle2"
                      paidAccent={PAID_STOCKS.includes(ticker)}
                      className="absolute inset-0"
                    />
                    <span className="z-10 text-[10px] font-black">{ticker}</span>
                    <span className="z-10 text-[5px] font-bold uppercase tracking-tight opacity-80">
                      {info.label.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                {executionPriceLabel}
              </div>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={priceRaw}
                  onChange={handlePriceChange}
                  placeholder="0.00"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-100/50 p-5 pl-10 text-lg font-black text-slate-900 outline-none"
                />
              </div>
            </div>

            {shouldShowQuantityInput ? (
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {quantityLabel}
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={quantityRaw}
                  onChange={handleQuantityChange}
                  placeholder="0"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-100/50 p-5 text-lg font-black text-slate-900 outline-none"
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-[11px] font-bold uppercase tracking-widest">
                {autoQuantityLabel}
              </span>
              <span className="text-lg font-black text-slate-900">
                {resolvedQuantityText}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span className="text-[11px] font-bold uppercase tracking-widest">
                {estimatedFeeLabel}
              </span>
              <span className="text-sm font-black text-slate-900">{feeText}</span>
            </div>
            <div className="h-px bg-slate-200" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-900">
                {totalSettlementLabel}
              </span>
              <span className="text-xl font-black text-blue-600">
                {totalSettlementText}
              </span>
            </div>
          </div>

          {validationMessage != null ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-600">
              {validationMessage}
            </div>
          ) : null}

          {budgetWarningTitle != null && budgetWarningMessage != null ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-1 text-sm font-black text-amber-700">
                {budgetWarningTitle}
              </div>
              <div className="text-sm font-medium text-amber-700">
                {budgetWarningMessage}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex gap-4 border-t border-slate-200 bg-slate-50 p-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-slate-100 py-4 font-black text-slate-600"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              void onSave();
            }}
            disabled={isSaveDisabled}
            aria-busy={isSaving}
            className="flex-[2] rounded-2xl bg-blue-600 py-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2">
              {saveLabel}
              <ChevronRight size={16} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
});

QuickInputModalView.displayName = 'QuickInputModalView';
```

### `components/CustomDropdown.tsx`

```tsx
/**
 * 커스텀 드롭다운 컴포넌트
 * 토스 TDS Menu와 유사한 디자인을 일반 웹 환경에서 제공합니다.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import HoverTip from './HoverTip';
import InfoModal from './InfoModal';

interface CustomDropdownProps {
  value: string;
  options: ReadonlyArray<{
    value: string;
    label: string;
    disabled?: boolean;
    badge?: string;
    tooltip?: string;
  }>;
  onChange: (value: string) => void;
  placeholder?: string;
  header?: string;
  className?: string;
  infoModalBadgeLabel: string;
  infoModalCloseAriaLabel: string;
  infoModalConfirmLabel: string;
  infoModalTitle?: string;
  infoModalDefaultMessage?: string;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({
  value,
  options,
  onChange,
  placeholder,
  header,
  className = '',
  infoModalBadgeLabel,
  infoModalCloseAriaLabel,
  infoModalConfirmLabel,
  infoModalTitle,
  infoModalDefaultMessage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoText, setInfoText] = useState<string>('');

  const isTouch = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      (window.matchMedia && window.matchMedia('(hover: none)').matches) ||
      (navigator && (navigator.maxTouchPoints || 0) > 0)
    );
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayText = selectedOption?.label ?? placeholder ?? header ?? '';

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const handleInfoModalClose = () => {
    setInfoOpen(false);
  };

  const handleDisabledOptionPress = (option: CustomDropdownProps['options'][number]) => {
    if (!isTouch) {
      return;
    }

    const nextInfoText = option.tooltip ?? infoModalDefaultMessage ?? '';
    if (!nextInfoText && !(infoModalTitle ?? header)) {
      return;
    }

    setInfoText(nextInfoText);
    setInfoOpen(true);
  };

  const getOptionButtonClassName = (
    isSelected: boolean,
    isDisabled: boolean,
  ): string => {
    if (isSelected) {
      return 'w-full px-4 py-3 text-left text-sm font-bold transition-colors flex items-center justify-between bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400';
    }

    if (isDisabled) {
      return 'w-full px-4 py-3 text-left text-sm font-bold transition-colors flex items-center justify-between text-slate-400 dark:text-slate-600 bg-transparent cursor-not-allowed opacity-60';
    }

    return 'w-full px-4 py-3 text-left text-sm font-bold transition-colors flex items-center justify-between text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-white/5';
  };

  const renderLockIcon = (
    option: CustomDropdownProps['options'][number],
    isDisabled: boolean,
  ): React.ReactNode => {
    if (option.disabled && option.tooltip) {
      return (
        <HoverTip text={option.tooltip}>
          <span className="inline-flex items-center gap-1">
            <Lock size={14} className="text-slate-400 dark:text-slate-600" />
          </span>
        </HoverTip>
      );
    }

    if (isDisabled) {
      return <Lock size={14} className="text-slate-400 dark:text-slate-600" />;
    }

    return null;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <span>{displayText}</span>
        <ChevronDown
          size={16}
          className={`text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-[#080B15] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {header && (
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50">
              <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                {header}
              </span>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            {options.map((option) => {
              const isSelected = value === option.value;
              const isDisabled = !!option.disabled;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (isDisabled) {
                      handleDisabledOptionPress(option);
                      return;
                    }
                    handleSelect(option.value);
                  }}
                  disabled={isDisabled && !isTouch}
                  aria-disabled={isDisabled}
                  className={getOptionButtonClassName(isSelected, isDisabled)}
                >
                  <span className="flex items-center gap-2">
                    <span>{option.label}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {renderLockIcon(option, isDisabled)}
                    {option.badge && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-200/60 dark:bg-white/10 text-slate-600 dark:text-slate-400 border border-slate-300/40 dark:border-white/10">
                        {option.badge}
                      </span>
                    )}
                    {isSelected && (
                      <svg
                        className="w-5 h-5 text-blue-600 dark:text-blue-400"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M5 13l4 4L19 7"></path>
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <InfoModal
        open={infoOpen}
        badgeLabel={infoModalBadgeLabel}
        title={infoModalTitle ?? header ?? ''}
        message={infoText || infoModalDefaultMessage || ''}
        closeAriaLabel={infoModalCloseAriaLabel}
        confirmLabel={infoModalConfirmLabel}
        onClose={handleInfoModalClose}
      />
    </div>
  );
};

export default CustomDropdown;
```

### `components/InfoModal.tsx`

```tsx
import React from 'react';
import { X } from 'lucide-react';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';

interface InfoModalProps {
  open: boolean;
  badgeLabel: string;
  title: string;
  message: string;
  closeAriaLabel: string;
  confirmLabel: string;
  onClose: () => void;
}

export default function InfoModal({
  open,
  badgeLabel,
  title,
  message,
  closeAriaLabel,
  confirmLabel,
  onClose,
}: InfoModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
      <div
        role="button"
        tabIndex={0}
        aria-label={closeAriaLabel}
        onClick={onClose}
        onKeyDown={(event) => {
          handlePressEnterOrSpace(event, onClose);
        }}
        className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md"
      />
      <div className="relative w-full max-w-sm bg-white dark:bg-[#161d2a] rounded-[2rem] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="p-6 flex items-start justify-between gap-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40">
          <div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
              {badgeLabel}
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500"
            aria-label={closeAriaLabel}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="p-6 pt-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black text-xs uppercase tracking-[0.2em] hover:bg-blue-500 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### `components/StrategyCreator.tsx`

```tsx
export { default } from './strategyCreator/StrategyCreator';
```

### `components/strategyCreator/steps/MaWizardStepViews.tsx`

```tsx
import React from 'react';
import CustomDropdown from '@/components/CustomDropdown';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  MaBaseStepViewProps,
  MaSectionsStepViewProps,
} from '../types/ui';

function ToggleField({
  label,
  isChecked,
  onChange,
}: {
  label: string;
  isChecked: boolean;
  onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
      <span className="text-sm font-black text-slate-900 dark:text-white">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!isChecked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${
          isChecked ? 'bg-blue-500' : 'bg-slate-500'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            isChecked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function PartialProfitField(props: {
  label: string;
  targetLabel: string;
  isEnabled: boolean;
  targetValue: number;
  onEnabledChange: (value: boolean) => void;
  onTargetValueChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/60">
      <ToggleField
        label={props.label}
        isChecked={props.isEnabled}
        onChange={props.onEnabledChange}
      />
      {props.isEnabled && (
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {props.targetLabel}
          </label>
          <input
            type="number"
            value={props.targetValue}
            onChange={(event) => props.onTargetValueChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>
      )}
    </div>
  );
}

function SectionCard(props: {
  title: string;
  stockPickerHeader: string;
  dropdownInfoModalLabels: MaSectionsStepViewProps['dropdownInfoModalLabels'];
  stockLabel: string;
  rsiThresholdLabel: string;
  takePartialProfitLabel: string;
  partialProfitTargetLabel: string;
  stockOptions: MaSectionsStepViewProps['stockOptionsForMa1'];
  stock: string;
  rsiThreshold: number;
  isRsiEnabled: boolean;
  isTakePartialProfit: boolean;
  partialProfitTargetPct: number;
  onStockChange: (value: string) => void;
  onRsiThresholdChange: (value: string) => void;
  onTakePartialProfitChange: (value: boolean) => void;
  onPartialProfitTargetPctChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="space-y-4">
        <h3 className="text-base font-black text-slate-900 dark:text-white">
          {props.title}
        </h3>
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {props.stockLabel}
          </label>
          <CustomDropdown
            value={props.stock}
            options={props.stockOptions}
            onChange={props.onStockChange}
            header={props.stockPickerHeader}
            infoModalBadgeLabel={props.dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={props.dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={props.dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={props.dropdownInfoModalLabels.title}
            infoModalDefaultMessage={props.dropdownInfoModalLabels.defaultMessage}
          />
        </div>

        {props.isRsiEnabled && (
          <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
            <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
              {props.rsiThresholdLabel}
            </label>
            <input
              type="number"
              value={props.rsiThreshold}
              onChange={(event) => props.onRsiThresholdChange(event.target.value)}
              className={STRATEGY_CREATOR_STYLES.textInput}
            />
          </div>
        )}

        <PartialProfitField
          label={props.takePartialProfitLabel}
          targetLabel={props.partialProfitTargetLabel}
          isEnabled={props.isTakePartialProfit}
          targetValue={props.partialProfitTargetPct}
          onEnabledChange={props.onTakePartialProfitChange}
          onTargetValueChange={props.onPartialProfitTargetPctChange}
        />
      </div>
    </div>
  );
}

export function MaBaseStepView({
  stockOptions,
  stockPickerHeader,
  dropdownInfoModalLabels,
  referenceStockLabel,
  shortPeriodLabel,
  longPeriodLabel,
  rsiEnabledLabel,
  alignmentEnabledLabel,
  ma0Stock,
  maShortPeriod,
  maLongPeriod,
  isRsiEnabled,
  isAlignmentEnabled,
  onMa0StockChange,
  onMaShortPeriodChange,
  onMaLongPeriodChange,
  onRsiEnabledChange,
  onAlignmentEnabledChange,
}: MaBaseStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {referenceStockLabel}
          </label>
          <CustomDropdown
            value={ma0Stock}
            options={stockOptions}
            onChange={onMa0StockChange}
            header={stockPickerHeader}
            infoModalBadgeLabel={dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={dropdownInfoModalLabels.title}
            infoModalDefaultMessage={dropdownInfoModalLabels.defaultMessage}
          />
        </div>

        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {shortPeriodLabel}
          </label>
          <input
            type="number"
            value={maShortPeriod}
            onChange={(event) => onMaShortPeriodChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>

        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {longPeriodLabel}
          </label>
          <input
            type="number"
            value={maLongPeriod}
            onChange={(event) => onMaLongPeriodChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ToggleField
          label={rsiEnabledLabel}
          isChecked={isRsiEnabled}
          onChange={onRsiEnabledChange}
        />
        <ToggleField
          label={alignmentEnabledLabel}
          isChecked={isAlignmentEnabled}
          onChange={onAlignmentEnabledChange}
        />
      </div>
    </div>
  );
}

export function MaSectionsStepView(
  props: MaSectionsStepViewProps,
): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <SectionCard
        title={props.section1Title}
        stockPickerHeader={props.stockPickerHeader}
        dropdownInfoModalLabels={props.dropdownInfoModalLabels}
        stockLabel={props.sectionStockLabel}
        rsiThresholdLabel={props.rsiThresholdLabel}
        takePartialProfitLabel={props.takePartialProfitLabel}
        partialProfitTargetLabel={props.partialProfitTargetLabel}
        stockOptions={props.stockOptionsForMa1}
        stock={props.ma1Stock}
        rsiThreshold={props.ma1RsiThreshold}
        isRsiEnabled={props.isRsiEnabled}
        isTakePartialProfit={props.isMa1TakePartialProfit}
        partialProfitTargetPct={props.ma1PartialProfitTargetPct}
        onStockChange={props.onMa1StockChange}
        onRsiThresholdChange={props.onMa1RsiThresholdChange}
        onTakePartialProfitChange={props.onMa1TakePartialProfitChange}
        onPartialProfitTargetPctChange={props.onMa1PartialProfitTargetPctChange}
      />
      <SectionCard
        title={props.section2Title}
        stockPickerHeader={props.stockPickerHeader}
        dropdownInfoModalLabels={props.dropdownInfoModalLabels}
        stockLabel={props.sectionStockLabel}
        rsiThresholdLabel={props.rsiThresholdLabel}
        takePartialProfitLabel={props.takePartialProfitLabel}
        partialProfitTargetLabel={props.partialProfitTargetLabel}
        stockOptions={props.stockOptionsForMa2}
        stock={props.ma2Stock}
        rsiThreshold={props.ma2RsiThreshold}
        isRsiEnabled={props.isRsiEnabled}
        isTakePartialProfit={props.isMa2TakePartialProfit}
        partialProfitTargetPct={props.ma2PartialProfitTargetPct}
        onStockChange={props.onMa2StockChange}
        onRsiThresholdChange={props.onMa2RsiThresholdChange}
        onTakePartialProfitChange={props.onMa2TakePartialProfitChange}
        onPartialProfitTargetPctChange={props.onMa2PartialProfitTargetPctChange}
      />
      <SectionCard
        title={props.section3Title}
        stockPickerHeader={props.stockPickerHeader}
        dropdownInfoModalLabels={props.dropdownInfoModalLabels}
        stockLabel={props.sectionStockLabel}
        rsiThresholdLabel={props.rsiThresholdLabel}
        takePartialProfitLabel={props.takePartialProfitLabel}
        partialProfitTargetLabel={props.partialProfitTargetLabel}
        stockOptions={props.stockOptionsForMa3}
        stock={props.ma3Stock}
        rsiThreshold={props.ma3RsiThreshold}
        isRsiEnabled={props.isRsiEnabled}
        isTakePartialProfit={props.isMa3TakePartialProfit}
        partialProfitTargetPct={props.ma3PartialProfitTargetPct}
        onStockChange={props.onMa3StockChange}
        onRsiThresholdChange={props.onMa3RsiThresholdChange}
        onTakePartialProfitChange={props.onMa3TakePartialProfitChange}
        onPartialProfitTargetPctChange={props.onMa3PartialProfitTargetPctChange}
      />
    </div>
  );
}
```

### `components/strategyCreator/steps/SingleStockStrategyStepViews.tsx`

```tsx
import React from 'react';
import CustomDropdown from '@/components/CustomDropdown';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  MultiSplitConfigStepViewProps,
  NoStopMultiSplitConfigStepViewProps,
  StrategyMetaStepViewProps,
} from '../types/ui';

function LabeledNumberField(props: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
      <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
        {props.label}
      </label>
      <input
        type="number"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className={STRATEGY_CREATOR_STYLES.textInput}
      />
    </div>
  );
}

export function MultiSplitConfigStepView({
  stockPickerHeader,
  dropdownInfoModalLabels,
  targetStockLabel,
  targetReturnRateLabel,
  totalSplitCountLabel,
  highlightedHint,
  stockOptions,
  targetStock,
  targetReturnRate,
  totalSplitCount,
  onTargetStockChange,
  onTargetReturnRateChange,
  onTotalSplitCountChange,
}: MultiSplitConfigStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="space-y-6">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {targetStockLabel}
          </label>
          <CustomDropdown
            value={targetStock}
            options={stockOptions}
            onChange={onTargetStockChange}
            header={stockPickerHeader}
            infoModalBadgeLabel={dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={dropdownInfoModalLabels.title}
            infoModalDefaultMessage={dropdownInfoModalLabels.defaultMessage}
          />
          <p className={STRATEGY_CREATOR_STYLES.helperText}>{highlightedHint}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <LabeledNumberField
            label={targetReturnRateLabel}
            value={targetReturnRate}
            onChange={onTargetReturnRateChange}
          />
          <LabeledNumberField
            label={totalSplitCountLabel}
            value={totalSplitCount}
            onChange={onTotalSplitCountChange}
          />
        </div>
      </div>
    </div>
  );
}

export function NoStopMultiSplitConfigStepView({
  stockPickerHeader,
  dropdownInfoModalLabels,
  targetStockLabel,
  lowLocBudgetRatioLabel,
  highLocPremiumPctLabel,
  takeProfitPctLabel,
  totalSplitCountLabel,
  stockOptions,
  targetStock,
  lowLocBudgetRatio,
  highLocPremiumPct,
  takeProfitPct,
  totalSplitCount,
  onTargetStockChange,
  onLowLocBudgetRatioChange,
  onHighLocPremiumPctChange,
  onTakeProfitPctChange,
  onTotalSplitCountChange,
}: NoStopMultiSplitConfigStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="space-y-6">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {targetStockLabel}
          </label>
          <CustomDropdown
            value={targetStock}
            options={stockOptions}
            onChange={onTargetStockChange}
            header={stockPickerHeader}
            infoModalBadgeLabel={dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={dropdownInfoModalLabels.title}
            infoModalDefaultMessage={dropdownInfoModalLabels.defaultMessage}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <LabeledNumberField
            label={lowLocBudgetRatioLabel}
            value={lowLocBudgetRatio}
            onChange={onLowLocBudgetRatioChange}
          />
          <LabeledNumberField
            label={highLocPremiumPctLabel}
            value={highLocPremiumPct}
            onChange={onHighLocPremiumPctChange}
          />
          <LabeledNumberField
            label={takeProfitPctLabel}
            value={takeProfitPct}
            onChange={onTakeProfitPctChange}
          />
          <LabeledNumberField
            label={totalSplitCountLabel}
            value={totalSplitCount}
            onChange={onTotalSplitCountChange}
          />
        </div>
      </div>
    </div>
  );
}

export function StrategyMetaStepView({
  metaLabels,
  meta,
  isVrStrategy,
  onNameChange,
  onDailyBuyAmountChange,
  onStartDateChange,
  onFeeRatePercentChange,
}: StrategyMetaStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {metaLabels.portfolioName}
          </label>
          <input
            type="text"
            value={meta.name ?? ''}
            onChange={(event) => onNameChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>

        {!isVrStrategy && (
          <LabeledNumberField
            label={metaLabels.dailyBuyAmount}
            value={
              typeof meta.dailyBuyAmount === 'number' ? meta.dailyBuyAmount : 0
            }
            onChange={onDailyBuyAmountChange}
          />
        )}

        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {metaLabels.startDate}
          </label>
          <input
            type="date"
            value={meta.startDate ?? ''}
            onChange={(event) => onStartDateChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>

        <LabeledNumberField
          label={metaLabels.feeRatePercent}
          value={typeof meta.feeRatePercent === 'number' ? meta.feeRatePercent : 0}
          onChange={onFeeRatePercentChange}
        />
      </div>
    </div>
  );
}
```

### `components/strategyCreator/steps/StrategySelectionStepView.tsx`

```tsx
import React from 'react';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type { StrategySelectionStepViewProps } from '../types/ui';

export function StrategySelectionStepView({
  heading,
  description,
  definitions,
  selectedStrategy,
  onSelectStrategy,
}: StrategySelectionStepViewProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-black text-slate-900 dark:text-white">
          {heading}
        </h3>
        <p className={STRATEGY_CREATOR_STYLES.helperText}>{description}</p>
      </div>

      <div className="space-y-4">
        {definitions.map((definition) => {
          const isSelected = selectedStrategy === definition.id;

          return (
            <button
              key={definition.id}
              type="button"
              onClick={() => onSelectStrategy(definition.id)}
              className={`w-full rounded-[2rem] border p-6 text-left transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/10'
                  : 'border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900/70'
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white ${definition.gradientClassName}`}
                >
                  {definition.icon}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-black text-slate-900 dark:text-white">
                      {definition.title}
                    </h4>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      {definition.tierLabel}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {definition.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

### `components/strategyCreator/StrategyCreator.tsx`

```tsx
import React from 'react';
import LaoerCreditBanner from '@/components/strategies/LaoerCreditBanner';
import VrBandStrategyForm from '@/components/strategies/VrBandStrategyForm';
import type { AppLang, Portfolio } from '@/types';
import { StrategyCreatorLayout } from './StrategyCreatorLayout';
import { MaBaseStepView, MaSectionsStepView } from './steps/MaWizardStepViews';
import {
  MultiSplitConfigStepView,
  NoStopMultiSplitConfigStepView,
  StrategyMetaStepView,
} from './steps/SingleStockStrategyStepViews';
import { StrategySelectionStepView } from './steps/StrategySelectionStepView';
import { useStrategyCreatorController } from './useStrategyCreatorController';

interface StrategyCreatorProps {
  lang: AppLang;
  onClose: () => void;
  onSave: (portfolio: Omit<Portfolio, 'id'>) => Promise<void> | void;
  canAccessPaidStocks?: boolean;
  maxPortfolios: number;
  currentPortfolioCount: number;
}

export default function StrategyCreator({
  lang,
  onClose,
  onSave,
  canAccessPaidStocks = false,
  maxPortfolios,
  currentPortfolioCount,
}: StrategyCreatorProps): React.ReactElement {
  const controller = useStrategyCreatorController({
    lang,
    onClose,
    onSave,
    canAccessPaidStocks,
    maxPortfolios,
    currentPortfolioCount,
  });

  const renderCurrentStep = (): React.ReactElement => {
    switch (controller.screen) {
      case 'strategy_select':
        return (
          <StrategySelectionStepView
            heading={controller.copy.strategySelection.heading}
            description={controller.copy.strategySelection.description}
            definitions={controller.strategyDefinitions}
            selectedStrategy={controller.selectedStrategy}
            onSelectStrategy={controller.handleSelectStrategy}
          />
        );
      case 'ma_base':
        return (
          <MaBaseStepView
            stockOptions={controller.stockOptions}
            stockPickerHeader={controller.copy.stockPickerHeader}
            dropdownInfoModalLabels={{
              badgeLabel: controller.noticeLabel,
              closeAriaLabel: controller.closeLabel,
              confirmLabel: controller.acknowledgeLabel,
              title: controller.noticeLabel,
              defaultMessage: controller.copy.lockedTickerTooltip,
            }}
            referenceStockLabel={controller.copy.ma.referenceStock}
            shortPeriodLabel={controller.copy.ma.shortPeriod}
            longPeriodLabel={controller.copy.ma.longPeriod}
            rsiEnabledLabel={controller.copy.ma.rsiEnabled}
            alignmentEnabledLabel={controller.copy.ma.alignmentEnabled}
            ma0Stock={controller.ma0Stock}
            maShortPeriod={controller.maShortPeriod}
            maLongPeriod={controller.maLongPeriod}
            isRsiEnabled={controller.isRsiEnabled}
            isAlignmentEnabled={controller.isAlignmentEnabled}
            onMa0StockChange={controller.handleMa0StockChange}
            onMaShortPeriodChange={controller.handleMaShortPeriodChange}
            onMaLongPeriodChange={controller.handleMaLongPeriodChange}
            onRsiEnabledChange={controller.handleRsiEnabledChange}
            onAlignmentEnabledChange={controller.handleAlignmentEnabledChange}
          />
        );
      case 'ma_sections':
        return (
          <MaSectionsStepView
            stockPickerHeader={controller.copy.stockPickerHeader}
            dropdownInfoModalLabels={{
              badgeLabel: controller.noticeLabel,
              closeAriaLabel: controller.closeLabel,
              confirmLabel: controller.acknowledgeLabel,
              title: controller.noticeLabel,
              defaultMessage: controller.copy.lockedTickerTooltip,
            }}
            section1Title={controller.copy.ma.section1Title}
            section2Title={controller.copy.ma.section2Title}
            section3Title={controller.copy.ma.section3Title}
            sectionStockLabel={controller.copy.ma.sectionStock}
            rsiThresholdLabel={controller.copy.ma.rsiThreshold}
            takePartialProfitLabel={controller.copy.ma.takePartialProfit}
            partialProfitTargetLabel={controller.copy.ma.partialProfitTargetPct}
            stockOptionsForMa1={controller.stockOptionsForMa1}
            stockOptionsForMa2={controller.stockOptionsForMa2}
            stockOptionsForMa3={controller.stockOptionsForMa3}
            ma1Stock={controller.ma1Stock}
            ma2Stock={controller.ma2Stock}
            ma3Stock={controller.ma3Stock}
            ma1RsiThreshold={controller.ma1RsiThreshold}
            ma2RsiThreshold={controller.ma2RsiThreshold}
            ma3RsiThreshold={controller.ma3RsiThreshold}
            isRsiEnabled={controller.isRsiEnabled}
            isMa1TakePartialProfit={controller.isMa1TakePartialProfit}
            isMa2TakePartialProfit={controller.isMa2TakePartialProfit}
            isMa3TakePartialProfit={controller.isMa3TakePartialProfit}
            ma1PartialProfitTargetPct={controller.ma1PartialProfitTargetPct}
            ma2PartialProfitTargetPct={controller.ma2PartialProfitTargetPct}
            ma3PartialProfitTargetPct={controller.ma3PartialProfitTargetPct}
            onMa1StockChange={controller.handleMa1StockChange}
            onMa2StockChange={controller.handleMa2StockChange}
            onMa3StockChange={controller.handleMa3StockChange}
            onMa1RsiThresholdChange={controller.handleMa1RsiThresholdChange}
            onMa2RsiThresholdChange={controller.handleMa2RsiThresholdChange}
            onMa3RsiThresholdChange={controller.handleMa3RsiThresholdChange}
            onMa1TakePartialProfitChange={
              controller.handleMa1TakePartialProfitChange
            }
            onMa2TakePartialProfitChange={
              controller.handleMa2TakePartialProfitChange
            }
            onMa3TakePartialProfitChange={
              controller.handleMa3TakePartialProfitChange
            }
            onMa1PartialProfitTargetPctChange={
              controller.handleMa1PartialProfitTargetPctChange
            }
            onMa2PartialProfitTargetPctChange={
              controller.handleMa2PartialProfitTargetPctChange
            }
            onMa3PartialProfitTargetPctChange={
              controller.handleMa3PartialProfitTargetPctChange
            }
          />
        );
      case 'multi_split_config':
        return (
          <MultiSplitConfigStepView
            stockPickerHeader={controller.copy.stockPickerHeader}
            dropdownInfoModalLabels={{
              badgeLabel: controller.noticeLabel,
              closeAriaLabel: controller.closeLabel,
              confirmLabel: controller.acknowledgeLabel,
              title: controller.noticeLabel,
              defaultMessage: controller.copy.lockedTickerTooltip,
            }}
            targetStockLabel={controller.copy.multiSplit.targetStock}
            targetReturnRateLabel={controller.copy.multiSplit.targetReturnRate}
            totalSplitCountLabel={controller.copy.multiSplit.totalSplitCount}
            highlightedHint={controller.copy.multiSplit.leveragedRecommended}
            stockOptions={controller.stockOptions}
            targetStock={controller.multiSplitTargetStock}
            targetReturnRate={controller.multiSplitTargetReturnRate}
            totalSplitCount={controller.multiSplitTotalSplitCount}
            onTargetStockChange={controller.handleMultiSplitTargetStockChange}
            onTargetReturnRateChange={controller.handleTargetReturnRateChange}
            onTotalSplitCountChange={controller.handleMultiSplitTotalCountChange}
          />
        );
      case 'no_stop_multi_split_config':
        return (
          <NoStopMultiSplitConfigStepView
            stockPickerHeader={controller.copy.stockPickerHeader}
            dropdownInfoModalLabels={{
              badgeLabel: controller.noticeLabel,
              closeAriaLabel: controller.closeLabel,
              confirmLabel: controller.acknowledgeLabel,
              title: controller.noticeLabel,
              defaultMessage: controller.copy.lockedTickerTooltip,
            }}
            targetStockLabel={controller.copy.noStopMultiSplit.targetStock}
            lowLocBudgetRatioLabel={
              controller.copy.noStopMultiSplit.lowLocBudgetRatio
            }
            highLocPremiumPctLabel={
              controller.copy.noStopMultiSplit.highLocPremiumPct
            }
            takeProfitPctLabel={controller.copy.noStopMultiSplit.takeProfitPct}
            totalSplitCountLabel={
              controller.copy.noStopMultiSplit.totalSplitCount
            }
            stockOptions={controller.stockOptions}
            targetStock={controller.noStopTargetStock}
            lowLocBudgetRatio={controller.noStopLowLocBudgetRatio}
            highLocPremiumPct={controller.noStopHighLocPremiumPct}
            takeProfitPct={controller.noStopTakeProfitPct}
            totalSplitCount={controller.noStopTotalSplitCount}
            onTargetStockChange={controller.handleNoStopTargetStockChange}
            onLowLocBudgetRatioChange={
              controller.handleNoStopLowLocBudgetRatioChange
            }
            onHighLocPremiumPctChange={
              controller.handleNoStopHighLocPremiumPctChange
            }
            onTakeProfitPctChange={controller.handleNoStopTakeProfitPctChange}
            onTotalSplitCountChange={
              controller.handleNoStopTotalSplitCountChange
            }
          />
        );
      case 'vr_band_config':
        return (
          <VrBandStrategyForm
            lang={lang}
            showErrors={controller.vrShowErrors}
            vrMode={controller.vrMode}
            onVrModeChange={controller.handleVrModeChange}
            vrInitialCapital={controller.vrInitialCapital}
            onVrInitialCapitalChange={controller.handleVrInitialCapitalChange}
            vrInitialV={controller.vrInitialV}
            onVrInitialVChange={controller.handleVrInitialVChange}
            vrMinOrderQty={controller.vrMinOrderQty}
            onVrMinOrderQtyChange={controller.handleVrMinOrderQtyChange}
            vrBandUpperPct={controller.vrBandUpperPct}
            onVrBandUpperPctChange={controller.handleVrBandUpperPctChange}
            vrBandLowerPct={controller.vrBandLowerPct}
            onVrBandLowerPctChange={controller.handleVrBandLowerPctChange}
            vrG={controller.vrG}
            onVrGChange={controller.handleVrGChange}
            vrPoolUsagePct={controller.vrPoolUsagePct}
            onVrPoolUsagePctChange={controller.handleVrPoolUsagePctChange}
            vrDeltaCash={controller.vrDeltaCash}
            onVrDeltaCashChange={controller.handleVrDeltaCashChange}
            vrCycleWeeks={controller.vrCycleWeeks}
            onVrCycleWeeksChange={controller.handleVrCycleWeeksChange}
          />
        );
      case 'strategy_meta':
        return (
          <StrategyMetaStepView
            metaLabels={controller.copy.meta}
            meta={controller.meta}
            isVrStrategy={controller.selectedStrategy === 'vr_band'}
            onNameChange={controller.handleNameChange}
            onDailyBuyAmountChange={controller.handleDailyBuyAmountChange}
            onStartDateChange={controller.handleStartDateChange}
            onFeeRatePercentChange={controller.handleFeeRatePercentChange}
          />
        );
      default: {
        const exhaustiveCheck: never = controller.screen;
        return exhaustiveCheck;
      }
    }
  };

  return (
    <>
      <StrategyCreatorLayout
        title={controller.title}
        closeAriaLabel={controller.closeLabel}
        cancelLabel={controller.copy.actions.cancel}
        backLabel={controller.copy.actions.back}
        primaryActionLabel={controller.primaryActionLabel}
        processingLabel={controller.processingLabel}
        errorMessage={controller.errorMessage}
        isSaving={controller.isSaving}
        isPrimaryDisabled={controller.isPrimaryDisabled}
        canGoBack={controller.canGoBack}
        onClose={controller.handleClose}
        onBack={controller.handleBack}
        onPrimaryAction={controller.handlePrimaryButtonClick}
      >
        {renderCurrentStep()}
        {controller.shouldShowLaoerCreditBanner && (
          <LaoerCreditBanner lang={lang} />
        )}
      </StrategyCreatorLayout>
    </>
  );
}
```

### `components/strategyCreator/StrategyCreatorLayout.tsx`

```tsx
import React from 'react';
import { X } from 'lucide-react';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';
import { STRATEGY_CREATOR_STYLES } from './styles';
import type { StrategyCreatorLayoutProps } from './types/ui';

export function StrategyCreatorLayout({
  title,
  closeAriaLabel,
  cancelLabel,
  backLabel,
  primaryActionLabel,
  processingLabel,
  errorMessage,
  isSaving,
  isPrimaryDisabled,
  canGoBack,
  onClose,
  onBack,
  onPrimaryAction,
  children,
}: StrategyCreatorLayoutProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.overlay}>
      <div
        role="button"
        tabIndex={0}
        aria-label={closeAriaLabel}
        onClick={onClose}
        onKeyDown={(event) => {
          handlePressEnterOrSpace(event, onClose);
        }}
        className={STRATEGY_CREATOR_STYLES.backdrop}
      />
      <div className={STRATEGY_CREATOR_STYLES.panel}>
        <div className={STRATEGY_CREATOR_STYLES.header}>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeAriaLabel}
            className="rounded-full p-3 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <X size={24} />
          </button>
        </div>

        <div className={STRATEGY_CREATOR_STYLES.content}>{children}</div>

        {errorMessage != null && (
          <div className="px-6 pt-5 md:px-8">
            <p className={STRATEGY_CREATOR_STYLES.errorBanner}>
              {errorMessage}
            </p>
          </div>
        )}

        <div className={STRATEGY_CREATOR_STYLES.footer}>
          {canGoBack ? (
            <button
              type="button"
              onClick={onBack}
              className={STRATEGY_CREATOR_STYLES.secondaryButton}
            >
              {backLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className={STRATEGY_CREATOR_STYLES.secondaryButton}
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            onClick={onPrimaryAction}
            disabled={isPrimaryDisabled}
            className={STRATEGY_CREATOR_STYLES.primaryButton}
          >
            {isSaving ? processingLabel : primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### `components/strategyCreator/styles.ts`

```ts
export const STRATEGY_CREATOR_STYLES = {
  overlay:
    'fixed inset-0 z-[210] flex items-center justify-center p-4',
  backdrop:
    'absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md',
  panel:
    'relative flex h-[min(92vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161d2a]',
  header:
    'flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-white/10',
  content:
    'flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/50 p-6 dark:bg-slate-950/70 md:p-8',
  footer:
    'flex gap-4 border-t border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-900/80 md:p-8',
  sectionCard:
    'rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/70',
  fieldStack: 'space-y-3',
  fieldLabel:
    'text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400',
  textInput:
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-black text-slate-900 outline-none transition-all focus:ring-2 focus:ring-blue-500/50 dark:border-white/10 dark:bg-slate-900/80 dark:text-white',
  primaryButton:
    'flex-1 rounded-2xl bg-blue-600 px-6 py-5 text-xs font-black uppercase text-white shadow-[0_12px_40px_rgba(37,99,235,0.35)] transition-all hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50',
  secondaryButton:
    'rounded-2xl border border-slate-600/60 bg-slate-800 px-6 py-5 text-xs font-black uppercase text-slate-200 transition-colors hover:bg-slate-700',
  errorBanner:
    'rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600',
  helperText: 'text-[11px] font-medium text-slate-500 dark:text-slate-400',
} as const;
```

### `components/strategyCreator/types/ui.ts`

```ts
import type { ReactNode } from 'react';
import type {
  StrategyCreatorMetaDraftInput,
  StrategyType,
} from '@/src/components/StrategyCreator/utils';

export type StrategyWizardScreen =
  | 'strategy_select'
  | 'ma_base'
  | 'ma_sections'
  | 'multi_split_config'
  | 'no_stop_multi_split_config'
  | 'vr_band_config'
  | 'strategy_meta';

export type StrategyTier = 'FREE' | 'PRO' | 'PREMIUM';

export interface StrategyStockOption {
  value: string;
  label: string;
  disabled?: boolean;
  badge?: string;
  tooltip?: string;
}

export interface StrategyDefinitionViewModel {
  id: StrategyType;
  title: string;
  description: string;
  tier: StrategyTier;
  tierLabel: string;
  icon: ReactNode;
  gradientClassName: string;
  isLaoerOriginal?: boolean;
}

export interface StrategyCreatorLayoutProps {
  title: string;
  closeAriaLabel: string;
  cancelLabel: string;
  backLabel: string;
  primaryActionLabel: string;
  processingLabel: string;
  errorMessage: string | null;
  isSaving: boolean;
  isPrimaryDisabled: boolean;
  canGoBack: boolean;
  onClose: () => void;
  onBack: () => void;
  onPrimaryAction: () => void;
  children: ReactNode;
}

export interface DropdownInfoModalLabels {
  badgeLabel: string;
  closeAriaLabel: string;
  confirmLabel: string;
  title: string;
  defaultMessage: string;
}

export interface StrategySelectionStepViewProps {
  heading: string;
  description: string;
  definitions: readonly StrategyDefinitionViewModel[];
  selectedStrategy: StrategyType | null;
  onSelectStrategy: (strategy: StrategyType) => void;
}

export interface MaBaseStepViewProps {
  stockOptions: readonly StrategyStockOption[];
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  referenceStockLabel: string;
  shortPeriodLabel: string;
  longPeriodLabel: string;
  rsiEnabledLabel: string;
  alignmentEnabledLabel: string;
  ma0Stock: string;
  maShortPeriod: number;
  maLongPeriod: number;
  isRsiEnabled: boolean;
  isAlignmentEnabled: boolean;
  onMa0StockChange: (value: string) => void;
  onMaShortPeriodChange: (value: string) => void;
  onMaLongPeriodChange: (value: string) => void;
  onRsiEnabledChange: (value: boolean) => void;
  onAlignmentEnabledChange: (value: boolean) => void;
}

export interface MaSectionsStepViewProps {
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  section1Title: string;
  section2Title: string;
  section3Title: string;
  sectionStockLabel: string;
  rsiThresholdLabel: string;
  takePartialProfitLabel: string;
  partialProfitTargetLabel: string;
  stockOptionsForMa1: readonly StrategyStockOption[];
  stockOptionsForMa2: readonly StrategyStockOption[];
  stockOptionsForMa3: readonly StrategyStockOption[];
  ma1Stock: string;
  ma2Stock: string;
  ma3Stock: string;
  ma1RsiThreshold: number;
  ma2RsiThreshold: number;
  ma3RsiThreshold: number;
  isRsiEnabled: boolean;
  isMa1TakePartialProfit: boolean;
  isMa2TakePartialProfit: boolean;
  isMa3TakePartialProfit: boolean;
  ma1PartialProfitTargetPct: number;
  ma2PartialProfitTargetPct: number;
  ma3PartialProfitTargetPct: number;
  onMa1StockChange: (value: string) => void;
  onMa2StockChange: (value: string) => void;
  onMa3StockChange: (value: string) => void;
  onMa1RsiThresholdChange: (value: string) => void;
  onMa2RsiThresholdChange: (value: string) => void;
  onMa3RsiThresholdChange: (value: string) => void;
  onMa1TakePartialProfitChange: (value: boolean) => void;
  onMa2TakePartialProfitChange: (value: boolean) => void;
  onMa3TakePartialProfitChange: (value: boolean) => void;
  onMa1PartialProfitTargetPctChange: (value: string) => void;
  onMa2PartialProfitTargetPctChange: (value: string) => void;
  onMa3PartialProfitTargetPctChange: (value: string) => void;
}

export interface MultiSplitConfigStepViewProps {
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  targetStockLabel: string;
  targetReturnRateLabel: string;
  totalSplitCountLabel: string;
  highlightedHint: string;
  stockOptions: readonly StrategyStockOption[];
  targetStock: string;
  targetReturnRate: number;
  totalSplitCount: number;
  onTargetStockChange: (value: string) => void;
  onTargetReturnRateChange: (value: string) => void;
  onTotalSplitCountChange: (value: string) => void;
}

export interface NoStopMultiSplitConfigStepViewProps {
  stockPickerHeader: string;
  dropdownInfoModalLabels: DropdownInfoModalLabels;
  targetStockLabel: string;
  lowLocBudgetRatioLabel: string;
  highLocPremiumPctLabel: string;
  takeProfitPctLabel: string;
  totalSplitCountLabel: string;
  stockOptions: readonly StrategyStockOption[];
  targetStock: string;
  lowLocBudgetRatio: number;
  highLocPremiumPct: number;
  takeProfitPct: number;
  totalSplitCount: number;
  onTargetStockChange: (value: string) => void;
  onLowLocBudgetRatioChange: (value: string) => void;
  onHighLocPremiumPctChange: (value: string) => void;
  onTakeProfitPctChange: (value: string) => void;
  onTotalSplitCountChange: (value: string) => void;
}

export interface StrategyMetaStepViewProps {
  metaLabels: {
    portfolioName: string;
    dailyBuyAmount: string;
    startDate: string;
    feeRatePercent: string;
  };
  meta: StrategyCreatorMetaDraftInput;
  isVrStrategy: boolean;
  onNameChange: (value: string) => void;
  onDailyBuyAmountChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onFeeRatePercentChange: (value: string) => void;
}
```

### `components/strategyCreator/useStrategyCreatorController.tsx`

```tsx
import { useCallback, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Layers, Orbit, TrendingUp } from 'lucide-react';
import { ALL_STOCKS, PAID_STOCKS } from '@/constants';
import {
  STRATEGY_DEFAULTS,
  roundMoney,
  validatePortfolioSetupInput,
} from '@/constants/domain/financeRules';
import { getCommonMessages } from '@/constants/messages/commonMessages';
import { getStrategyCreatorMessages } from '@/constants/messages/strategyCreatorMessages';
import {
  VR_CYCLE,
  getVrDeltaCashInputValidationReason,
} from '@/constants/vrConstants';
import type { AppLang, Portfolio, VrBandStrategyParams } from '@/types';
import {
  buildPortfolioDraftFromWizardState,
  hasDuplicatedSectionStocks,
  safeNumber,
  safeTrim,
  type StrategyCreatorMetaDraftInput,
  type StrategyType,
  type StrategyWizardDraftInput,
} from '@/src/components/StrategyCreator/utils';
import type {
  StrategyDefinitionViewModel,
  StrategyStockOption,
  StrategyTier,
  StrategyWizardScreen,
} from './types/ui';

const DEFAULT_SECTION_ONE_STOCK = 'TQQQ';
const DEFAULT_SECTION_TWO_STOCK = 'QLD';
const DEFAULT_SECTION_THREE_STOCK = 'QQQ';
const DEFAULT_MULTI_SPLIT_STOCK = 'TQQQ';
const DEFAULT_REFERENCE_STOCK = 'QQQ';
const MAX_MA_PERIOD = 250;
const MIN_MA_PERIOD = 1;
const MIN_TARGET_RETURN_RATE = 5;
const MAX_TARGET_RETURN_RATE = 30;
const MIN_TOTAL_SPLIT_COUNT = 20;
const MAX_TOTAL_SPLIT_COUNT = 80;
const MIN_PERCENT_INPUT = 0;

interface UseStrategyCreatorControllerParams {
  lang: AppLang;
  onClose: () => void;
  onSave: (portfolio: Omit<Portfolio, 'id'>) => Promise<void> | void;
  canAccessPaidStocks: boolean;
  maxPortfolios: number;
  currentPortfolioCount: number;
}

function buildInitialWizardState(): StrategyWizardDraftInput {
  return {
    meta: {
      name: '',
      dailyBuyAmount: STRATEGY_DEFAULTS.DAILY_BUY_AMOUNT_USD,
      startDate: new Date().toISOString().split('T')[0] ?? '',
      feeRatePercent: STRATEGY_DEFAULTS.FEE_RATE_PERCENT,
    },
    maInterval: {
      ma0Stock: DEFAULT_REFERENCE_STOCK,
      maAPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
      maBPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
      rsiEnabled: false,
      alignmentEnabled: false,
      ma1: {
        stock: DEFAULT_SECTION_ONE_STOCK,
        rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
        takePartialProfit: false,
        partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
      },
      ma2: {
        stock: DEFAULT_SECTION_TWO_STOCK,
        rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
        takePartialProfit: false,
        partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
      },
      ma3: {
        stock: DEFAULT_SECTION_THREE_STOCK,
        rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
        takePartialProfit: false,
        partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
      },
    },
    multiSplit: {
      targetStock: DEFAULT_MULTI_SPLIT_STOCK,
      targetReturnRate: STRATEGY_DEFAULTS.TARGET_RETURN_PERCENT,
      totalSplitCount: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    },
    noStopMultiSplit: {
      targetStock: DEFAULT_MULTI_SPLIT_STOCK,
      lowLocBudgetRatio: 50,
      highLocPremiumPct: 15,
      takeProfitPct: 10,
      totalSplitCount: STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    },
    vrBand: {
      vrMode: 'lump_sum',
      initialCapital: STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
      initialV: STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
      minOrderQty: 1,
      bandUpperPct: 5,
      bandLowerPct: 5,
      g: 10,
      poolUsagePct: 50,
      deltaCash: 0,
      cycleWeeks: VR_CYCLE.DEFAULT_WEEKS,
    },
  };
}

const EMPTY_MA_INTERVAL_DRAFT: NonNullable<
  StrategyWizardDraftInput['maInterval']
> = {
  ma0Stock: DEFAULT_REFERENCE_STOCK,
  maAPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
  maBPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
  rsiEnabled: false,
  alignmentEnabled: false,
  ma1: {
    stock: DEFAULT_SECTION_ONE_STOCK,
    rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
    takePartialProfit: false,
    partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
  },
  ma2: {
    stock: DEFAULT_SECTION_TWO_STOCK,
    rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
    takePartialProfit: false,
    partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
  },
  ma3: {
    stock: DEFAULT_SECTION_THREE_STOCK,
    rsiThreshold: STRATEGY_DEFAULTS.RSI_THRESHOLD,
    takePartialProfit: false,
    partialProfitTargetPct: STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
  },
};

const EMPTY_VR_BAND_DRAFT: NonNullable<StrategyWizardDraftInput['vrBand']> = {
  vrMode: 'lump_sum',
  initialCapital: STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
  initialV: STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
  minOrderQty: 1,
  bandUpperPct: 5,
  bandLowerPct: 5,
  g: 10,
  poolUsagePct: 50,
  deltaCash: 0,
  cycleWeeks: VR_CYCLE.DEFAULT_WEEKS,
};

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function buildStockOptions(params: {
  baseStocks: readonly string[];
  disabledStocks?: readonly string[];
  canAccessPaidStocks: boolean;
  lockedTickerTooltip: string;
  duplicateSectionStockTooltip: string;
}): StrategyStockOption[] {
  const disabledSet = new Set(params.disabledStocks ?? []);

  return params.baseStocks.map((stock) => {
    const isPaidLocked =
      PAID_STOCKS.includes(stock) && !params.canAccessPaidStocks;
    const isDisabledByDuplicate = disabledSet.has(stock);

    let tooltip: string | undefined;
    if (isPaidLocked) {
      tooltip = params.lockedTickerTooltip;
    } else if (isDisabledByDuplicate) {
      tooltip = params.duplicateSectionStockTooltip;
    }

    return {
      value: stock,
      label: stock,
      disabled: isPaidLocked || isDisabledByDuplicate,
      badge: PAID_STOCKS.includes(stock) ? 'PRO+' : undefined,
      tooltip,
    };
  });
}

function getWizardScreen(
  selectedStrategy: StrategyType | null,
  step: number,
): StrategyWizardScreen {
  if (selectedStrategy == null || step === 0) {
    return 'strategy_select';
  }

  switch (selectedStrategy) {
    case 'rsi_ma_interval':
      if (step === 1) {
        return 'ma_base';
      }
      if (step === 2) {
        return 'ma_sections';
      }
      return 'strategy_meta';
    case 'multi_split':
      return step === 1 ? 'multi_split_config' : 'strategy_meta';
    case 'no_stop_multi_split':
      return step === 1 ? 'no_stop_multi_split_config' : 'strategy_meta';
    case 'vr_band':
      return step === 1 ? 'vr_band_config' : 'strategy_meta';
    default: {
      const exhaustiveCheck: never = selectedStrategy;
      return exhaustiveCheck;
    }
  }
}

function getTitleForScreen(
  screen: StrategyWizardScreen,
  copy: ReturnType<typeof getStrategyCreatorMessages>,
): string {
  switch (screen) {
    case 'strategy_select':
      return copy.titles.strategySelect;
    case 'ma_base':
      return copy.titles.maBase;
    case 'ma_sections':
      return copy.titles.maSections;
    case 'multi_split_config':
      return copy.titles.multiSplitConfig;
    case 'no_stop_multi_split_config':
      return copy.titles.noStopMultiSplitConfig;
    case 'vr_band_config':
      return copy.titles.vrBandConfig;
    case 'strategy_meta':
      return copy.titles.strategyMeta;
    default: {
      const exhaustiveCheck: never = screen;
      return exhaustiveCheck;
    }
  }
}

function getPrimaryActionLabel(params: {
  screen: StrategyWizardScreen;
  selectedStrategy: StrategyType | null;
  copy: ReturnType<typeof getStrategyCreatorMessages>;
}): string {
  if (params.screen !== 'strategy_meta') {
    return params.copy.actions.next;
  }

  if (
    params.selectedStrategy === 'multi_split' ||
    params.selectedStrategy === 'no_stop_multi_split' ||
    params.selectedStrategy === 'vr_band'
  ) {
    return params.copy.actions.startStrategy;
  }

  return params.copy.actions.save;
}

function buildStrategyDefinitions(
  copy: ReturnType<typeof getStrategyCreatorMessages>,
): StrategyDefinitionViewModel[] {
  const createDefinition = (
    id: StrategyType,
    tier: StrategyTier,
    icon: JSX.Element,
    gradientClassName: string,
    isLaoerOriginal?: boolean,
  ): StrategyDefinitionViewModel => ({
    id,
    title: copy.strategyDefinitions[id].title,
    description: copy.strategyDefinitions[id].description,
    tier,
    tierLabel: copy.tierLabels[tier],
    icon,
    gradientClassName,
    isLaoerOriginal,
  });

  return [
    createDefinition(
      'rsi_ma_interval',
      'FREE',
      <TrendingUp size={24} />,
      'from-blue-500 to-violet-500',
    ),
    createDefinition(
      'multi_split',
      'FREE',
      <Layers size={24} />,
      'from-emerald-500 to-teal-500',
      true,
    ),
    createDefinition(
      'no_stop_multi_split',
      'FREE',
      <Layers size={24} />,
      'from-emerald-500 to-green-500',
      true,
    ),
    createDefinition(
      'vr_band',
      'FREE',
      <Orbit size={24} />,
      'from-indigo-500 to-sky-500',
      true,
    ),
  ];
}

export function useStrategyCreatorController({
  lang,
  onClose,
  onSave,
  canAccessPaidStocks,
  currentPortfolioCount,
  maxPortfolios,
}: UseStrategyCreatorControllerParams) {
  const copy = getStrategyCreatorMessages(lang);
  const commonCopy = getCommonMessages(lang);
  const [step, setStep] = useState(0);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType | null>(
    null,
  );
  const [wizardState, setWizardState] = useState<StrategyWizardDraftInput>(
    buildInitialWizardState,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVrShowErrors, setIsVrShowErrors] = useState(false);
  const isSavingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  const screen = getWizardScreen(selectedStrategy, step);
  const title = getTitleForScreen(screen, copy);
  const primaryActionLabel = getPrimaryActionLabel({
    screen,
    selectedStrategy,
    copy,
  });

  const strategyDefinitions = useMemo(
    () => buildStrategyDefinitions(copy),
    [copy],
  );

  const shouldShowLaoerCreditBanner =
    selectedStrategy != null &&
    strategyDefinitions.some(
      (definition) =>
        definition.id === selectedStrategy &&
        definition.isLaoerOriginal === true,
    );

  const updateMeta = useCallback(
    (patch: Partial<StrategyCreatorMetaDraftInput>) => {
      setWizardState((previous) => ({
        ...previous,
        meta: {
          ...previous.meta,
          ...patch,
        },
      }));
    },
    [],
  );

  const updateVrBand = useCallback(
    (patch: Partial<NonNullable<StrategyWizardDraftInput['vrBand']>>) => {
      setWizardState((previous) => ({
        ...previous,
        vrBand: {
          ...(previous.vrBand ?? EMPTY_VR_BAND_DRAFT),
          ...patch,
        },
      }));
    },
    [],
  );

  const updateMaSection = useCallback(
    (
      key: 'ma1' | 'ma2' | 'ma3',
      patch: Partial<
        NonNullable<NonNullable<StrategyWizardDraftInput['maInterval']>[typeof key]>
      >,
    ) => {
      setWizardState((previous) => {
        const currentMaInterval =
          previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
        return {
          ...previous,
          maInterval: {
            ...currentMaInterval,
            [key]: {
              ...currentMaInterval[key],
              ...patch,
            },
          },
        };
      });
    },
    [],
  );

  const handleSelectStrategy = useCallback((strategy: StrategyType) => {
    setSelectedStrategy(strategy);
    setStep(1);
    setErrorMessage(null);
  }, []);

  const handleNameChange = useCallback(
    (value: string) => {
      updateMeta({ name: value });
    },
    [updateMeta],
  );

  const handleDailyBuyAmountChange = useCallback(
    (value: string) => {
      updateMeta({
        dailyBuyAmount: roundMoney(
          safeNumber(value, STRATEGY_DEFAULTS.DAILY_BUY_AMOUNT_USD),
        ),
      });
    },
    [updateMeta],
  );

  const handleFeeRatePercentChange = useCallback(
    (value: string) => {
      updateMeta({
        feeRatePercent: roundMoney(
          safeNumber(value, STRATEGY_DEFAULTS.FEE_RATE_PERCENT),
        ),
      });
    },
    [updateMeta],
  );

  const handleStartDateChange = useCallback(
    (value: string) => {
      updateMeta({ startDate: safeTrim(value) });
    },
    [updateMeta],
  );

  const maInterval = wizardState.maInterval;
  const ma1 = maInterval?.ma1;
  const ma2 = maInterval?.ma2;
  const ma3 = maInterval?.ma3;

  const handleMa0StockChange = useCallback((value: string) => {
    setWizardState((previous) => {
      const currentMaInterval =
        previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
      return {
        ...previous,
        maInterval: {
          ...currentMaInterval,
          ma0Stock: value,
        },
      };
    });
  }, []);

  const handleMaShortPeriodChange = useCallback((value: string) => {
    setWizardState((previous) => {
      const currentMaInterval =
        previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
      return {
        ...previous,
        maInterval: {
          ...currentMaInterval,
          maAPeriod: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.MA_SHORT_PERIOD),
            MIN_MA_PERIOD,
            MAX_MA_PERIOD,
          ),
        },
      };
    });
  }, []);

  const handleMaLongPeriodChange = useCallback((value: string) => {
    setWizardState((previous) => {
      const currentMaInterval =
        previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
      return {
        ...previous,
        maInterval: {
          ...currentMaInterval,
          maBPeriod: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.MA_LONG_PERIOD),
            MIN_MA_PERIOD,
            MAX_MA_PERIOD,
          ),
        },
      };
    });
  }, []);

  const handleRsiEnabledChange = useCallback((value: boolean) => {
    setWizardState((previous) => {
      const currentMaInterval =
        previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
      return {
        ...previous,
        maInterval: {
          ...currentMaInterval,
          rsiEnabled: value,
        },
      };
    });
  }, []);

  const handleAlignmentEnabledChange = useCallback((value: boolean) => {
    setWizardState((previous) => {
      const currentMaInterval =
        previous.maInterval ?? EMPTY_MA_INTERVAL_DRAFT;
      return {
        ...previous,
        maInterval: {
          ...currentMaInterval,
          alignmentEnabled: value,
        },
      };
    });
  }, []);

  const handleTargetReturnRateChange = useCallback(
    (value: string) => {
      setWizardState((previous) => ({
        ...previous,
        multiSplit: {
          ...previous.multiSplit,
          targetReturnRate: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.TARGET_RETURN_PERCENT),
            MIN_TARGET_RETURN_RATE,
            MAX_TARGET_RETURN_RATE,
          ),
        },
      }));
    },
    [],
  );

  const handleMultiSplitTotalCountChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      multiSplit: {
        ...previous.multiSplit,
        totalSplitCount: clampNumber(
          safeNumber(value, STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT),
          MIN_TOTAL_SPLIT_COUNT,
          MAX_TOTAL_SPLIT_COUNT,
        ),
      },
    }));
  }, []);

  const handleMultiSplitTargetStockChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      multiSplit: {
        ...previous.multiSplit,
        targetStock: value,
      },
    }));
  }, []);

  const handleNoStopTargetStockChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      noStopMultiSplit: {
        ...previous.noStopMultiSplit,
        targetStock: value,
      },
    }));
  }, []);

  const handleNoStopLowLocBudgetRatioChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      noStopMultiSplit: {
        ...previous.noStopMultiSplit,
        lowLocBudgetRatio: clampNumber(
          safeNumber(value, 50),
          MIN_PERCENT_INPUT,
          100,
        ),
      },
    }));
  }, []);

  const handleNoStopHighLocPremiumPctChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      noStopMultiSplit: {
        ...previous.noStopMultiSplit,
        highLocPremiumPct: clampNumber(
          safeNumber(value, 15),
          MIN_PERCENT_INPUT,
          100,
        ),
      },
    }));
  }, []);

  const handleNoStopTakeProfitPctChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      noStopMultiSplit: {
        ...previous.noStopMultiSplit,
        takeProfitPct: clampNumber(
          safeNumber(value, 10),
          MIN_PERCENT_INPUT,
          100,
        ),
      },
    }));
  }, []);

  const handleNoStopTotalSplitCountChange = useCallback((value: string) => {
    setWizardState((previous) => ({
      ...previous,
      noStopMultiSplit: {
        ...previous.noStopMultiSplit,
        totalSplitCount: clampNumber(
          safeNumber(value, STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT),
          MIN_TOTAL_SPLIT_COUNT,
          MAX_TOTAL_SPLIT_COUNT,
        ),
      },
    }));
  }, []);

  const handleVrModeChange = useCallback(
    (value: VrBandStrategyParams['vrMode']) => {
      updateVrBand({ vrMode: value });
    },
    [updateVrBand],
  );

  const screenIsFinalSubmit = screen === 'strategy_meta';

  const handlePrimaryAction = useCallback(() => {
    if (!screenIsFinalSubmit) {
      setStep((previous) => previous + 1);
      return;
    }
  }, [screenIsFinalSubmit]);

  const handleBack = useCallback(() => {
    if (step <= 1) {
      setSelectedStrategy(null);
      setStep(0);
      setErrorMessage(null);
      return;
    }

    setStep((previous) => previous - 1);
  }, [step]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (selectedStrategy == null) {
      return;
    }

    if (isSavingRef.current) {
      return;
    }

    if (currentPortfolioCount >= maxPortfolios) {
      setErrorMessage(copy.portfolioLimitReached(maxPortfolios));
      return;
    }

    if (selectedStrategy === 'vr_band') {
      const vrBand = wizardState.vrBand;
      const initialCapital = safeNumber(
        vrBand?.initialCapital,
        STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
      );
      const initialV = safeNumber(
        vrBand?.initialV,
        STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
      );
      const minOrderQty = safeNumber(vrBand?.minOrderQty, 1);
      const deltaCashFailure = getVrDeltaCashInputValidationReason(
        safeNumber(vrBand?.deltaCash, 0),
      );
      const vrMode = vrBand?.vrMode ?? 'lump_sum';

      if (initialCapital <= 0 || initialV <= 0 || minOrderQty <= 0) {
        setIsVrShowErrors(true);
        return;
      }

      if (vrMode !== 'lump_sum' && deltaCashFailure != null) {
        setIsVrShowErrors(true);
        return;
      }
    }

    const draft = buildPortfolioDraftFromWizardState({
      selectedStrategy,
      wizardState,
    });

    const validationMessage = validatePortfolioSetupInput(
      draft.validationInput,
      commonCopy,
    );

    if (validationMessage != null) {
      setErrorMessage(validationMessage);
      return;
    }

    if (
      selectedStrategy === 'rsi_ma_interval' &&
      hasDuplicatedSectionStocks(draft.portfolio.strategy)
    ) {
      setErrorMessage(copy.duplicateSectionStocks);
      return;
    }

    setErrorMessage(null);

    try {
      isSavingRef.current = true;
      setIsSaving(true);
      await Promise.resolve(onSave(draft.portfolio));
      onClose();
    } catch (error: unknown) {
      setErrorMessage(commonCopy.saveFailed);
      console.error('[StrategyCreator] save failed:', error);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [
    commonCopy,
    copy,
    currentPortfolioCount,
    maxPortfolios,
    onClose,
    onSave,
    selectedStrategy,
    wizardState,
  ]);

  const handlePrimaryButtonClick = useCallback(() => {
    if (!screenIsFinalSubmit) {
      handlePrimaryAction();
      return;
    }

    void handleSubmit();
  }, [handlePrimaryAction, handleSubmit, screenIsFinalSubmit]);

  const fullStockOptions = useMemo(
    () =>
      buildStockOptions({
        baseStocks: ALL_STOCKS,
        canAccessPaidStocks,
        lockedTickerTooltip: copy.lockedTickerTooltip,
        duplicateSectionStockTooltip: copy.duplicateSectionStockTooltip,
      }),
    [
      canAccessPaidStocks,
      copy.duplicateSectionStockTooltip,
      copy.lockedTickerTooltip,
    ],
  );

  const stockOptionsForMa1 = useMemo(
    () =>
      buildStockOptions({
        baseStocks: ALL_STOCKS,
        disabledStocks: [safeTrim(ma2?.stock), safeTrim(ma3?.stock)],
        canAccessPaidStocks,
        lockedTickerTooltip: copy.lockedTickerTooltip,
        duplicateSectionStockTooltip: copy.duplicateSectionStockTooltip,
      }),
    [
      canAccessPaidStocks,
      copy.duplicateSectionStockTooltip,
      copy.lockedTickerTooltip,
      ma2?.stock,
      ma3?.stock,
    ],
  );

  const stockOptionsForMa2 = useMemo(
    () =>
      buildStockOptions({
        baseStocks: ALL_STOCKS,
        disabledStocks: [safeTrim(ma1?.stock), safeTrim(ma3?.stock)],
        canAccessPaidStocks,
        lockedTickerTooltip: copy.lockedTickerTooltip,
        duplicateSectionStockTooltip: copy.duplicateSectionStockTooltip,
      }),
    [
      canAccessPaidStocks,
      copy.duplicateSectionStockTooltip,
      copy.lockedTickerTooltip,
      ma1?.stock,
      ma3?.stock,
    ],
  );

  const stockOptionsForMa3 = useMemo(
    () =>
      buildStockOptions({
        baseStocks: ALL_STOCKS,
        disabledStocks: [safeTrim(ma1?.stock), safeTrim(ma2?.stock)],
        canAccessPaidStocks,
        lockedTickerTooltip: copy.lockedTickerTooltip,
        duplicateSectionStockTooltip: copy.duplicateSectionStockTooltip,
      }),
    [
      canAccessPaidStocks,
      copy.duplicateSectionStockTooltip,
      copy.lockedTickerTooltip,
      ma1?.stock,
      ma2?.stock,
    ],
  );

  const stepHandlers = useMemo(
    () => ({
      handleMa1StockChange: (value: string) => {
        updateMaSection('ma1', { stock: value });
      },
      handleMa2StockChange: (value: string) => {
        updateMaSection('ma2', { stock: value });
      },
      handleMa3StockChange: (value: string) => {
        updateMaSection('ma3', { stock: value });
      },
      handleMa1RsiThresholdChange: (value: string) => {
        updateMaSection('ma1', {
          rsiThreshold: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.RSI_THRESHOLD),
            0,
            100,
          ),
        });
      },
      handleMa2RsiThresholdChange: (value: string) => {
        updateMaSection('ma2', {
          rsiThreshold: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.RSI_THRESHOLD),
            0,
            100,
          ),
        });
      },
      handleMa3RsiThresholdChange: (value: string) => {
        updateMaSection('ma3', {
          rsiThreshold: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.RSI_THRESHOLD),
            0,
            100,
          ),
        });
      },
      handleMa1TakePartialProfitChange: (value: boolean) => {
        updateMaSection('ma1', { takePartialProfit: value });
      },
      handleMa2TakePartialProfitChange: (value: boolean) => {
        updateMaSection('ma2', { takePartialProfit: value });
      },
      handleMa3TakePartialProfitChange: (value: boolean) => {
        updateMaSection('ma3', { takePartialProfit: value });
      },
      handleMa1PartialProfitTargetPctChange: (value: string) => {
        updateMaSection('ma1', {
          partialProfitTargetPct: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT),
            1,
            100,
          ),
        });
      },
      handleMa2PartialProfitTargetPctChange: (value: string) => {
        updateMaSection('ma2', {
          partialProfitTargetPct: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT),
            1,
            100,
          ),
        });
      },
      handleMa3PartialProfitTargetPctChange: (value: string) => {
        updateMaSection('ma3', {
          partialProfitTargetPct: clampNumber(
            safeNumber(value, STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT),
            1,
            100,
          ),
        });
      },
      handleVrInitialCapitalChange: (value: number) => {
        updateVrBand({ initialCapital: Math.max(0, value) });
      },
      handleVrInitialVChange: (value: number) => {
        updateVrBand({ initialV: Math.max(0, value) });
      },
      handleVrMinOrderQtyChange: (value: number) => {
        updateVrBand({ minOrderQty: Math.max(0, value) });
      },
      handleVrBandUpperPctChange: (value: number) => {
        updateVrBand({ bandUpperPct: Math.max(0, value) });
      },
      handleVrBandLowerPctChange: (value: number) => {
        updateVrBand({ bandLowerPct: Math.max(0, value) });
      },
      handleVrGChange: (value: number) => {
        updateVrBand({ g: Math.max(0, value) });
      },
      handleVrPoolUsagePctChange: (value: number) => {
        updateVrBand({ poolUsagePct: Math.max(0, value) });
      },
      handleVrDeltaCashChange: (value: number) => {
        updateVrBand({ deltaCash: Math.max(0, value) });
      },
      handleVrCycleWeeksChange: (value: number) => {
        updateVrBand({ cycleWeeks: value });
      },
    }),
    [updateMaSection, updateVrBand],
  );

  return {
    copy,
    noticeLabel: commonCopy.notice,
    acknowledgeLabel: commonCopy.acknowledge,
    closeLabel: commonCopy.close,
    processingLabel: commonCopy.processing,
    screen,
    title,
    primaryActionLabel,
    isSaving,
    errorMessage,
    selectedStrategy,
    shouldShowLaoerCreditBanner,
    handleBack,
    handleClose: onClose,
    handlePrimaryButtonClick,
    canGoBack: step > 0,
    isPrimaryDisabled: selectedStrategy == null || isSaving,
    strategyDefinitions,
    handleSelectStrategy,
    stockOptions: fullStockOptions,
    stockOptionsForMa1,
    stockOptionsForMa2,
    stockOptionsForMa3,
    meta: wizardState.meta ?? {},
    ma0Stock: safeTrim(maInterval?.ma0Stock),
    maShortPeriod: safeNumber(
      maInterval?.maAPeriod,
      STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
    ),
    maLongPeriod: safeNumber(
      maInterval?.maBPeriod,
      STRATEGY_DEFAULTS.MA_LONG_PERIOD,
    ),
    isRsiEnabled: Boolean(maInterval?.rsiEnabled),
    isAlignmentEnabled: Boolean(maInterval?.alignmentEnabled),
    handleMa0StockChange,
    handleMaShortPeriodChange,
    handleMaLongPeriodChange,
    handleRsiEnabledChange,
    handleAlignmentEnabledChange,
    ma1Stock: safeTrim(ma1?.stock),
    ma2Stock: safeTrim(ma2?.stock),
    ma3Stock: safeTrim(ma3?.stock),
    ma1RsiThreshold: safeNumber(
      ma1?.rsiThreshold,
      STRATEGY_DEFAULTS.RSI_THRESHOLD,
    ),
    ma2RsiThreshold: safeNumber(
      ma2?.rsiThreshold,
      STRATEGY_DEFAULTS.RSI_THRESHOLD,
    ),
    ma3RsiThreshold: safeNumber(
      ma3?.rsiThreshold,
      STRATEGY_DEFAULTS.RSI_THRESHOLD,
    ),
    isMa1TakePartialProfit: Boolean(ma1?.takePartialProfit),
    isMa2TakePartialProfit: Boolean(ma2?.takePartialProfit),
    isMa3TakePartialProfit: Boolean(ma3?.takePartialProfit),
    ma1PartialProfitTargetPct: safeNumber(
      ma1?.partialProfitTargetPct,
      STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
    ),
    ma2PartialProfitTargetPct: safeNumber(
      ma2?.partialProfitTargetPct,
      STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
    ),
    ma3PartialProfitTargetPct: safeNumber(
      ma3?.partialProfitTargetPct,
      STRATEGY_DEFAULTS.PARTIAL_PROFIT_PERCENT,
    ),
    ...stepHandlers,
    multiSplitTargetStock: safeTrim(wizardState.multiSplit?.targetStock),
    multiSplitTargetReturnRate: safeNumber(
      wizardState.multiSplit?.targetReturnRate,
      STRATEGY_DEFAULTS.TARGET_RETURN_PERCENT,
    ),
    multiSplitTotalSplitCount: safeNumber(
      wizardState.multiSplit?.totalSplitCount,
      STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    ),
    handleMultiSplitTargetStockChange,
    handleTargetReturnRateChange,
    handleMultiSplitTotalCountChange,
    noStopTargetStock: safeTrim(wizardState.noStopMultiSplit?.targetStock),
    noStopLowLocBudgetRatio: safeNumber(
      wizardState.noStopMultiSplit?.lowLocBudgetRatio,
      50,
    ),
    noStopHighLocPremiumPct: safeNumber(
      wizardState.noStopMultiSplit?.highLocPremiumPct,
      15,
    ),
    noStopTakeProfitPct: safeNumber(
      wizardState.noStopMultiSplit?.takeProfitPct,
      10,
    ),
    noStopTotalSplitCount: safeNumber(
      wizardState.noStopMultiSplit?.totalSplitCount,
      STRATEGY_DEFAULTS.TOTAL_SPLIT_COUNT,
    ),
    handleNoStopTargetStockChange,
    handleNoStopLowLocBudgetRatioChange,
    handleNoStopHighLocPremiumPctChange,
    handleNoStopTakeProfitPctChange,
    handleNoStopTotalSplitCountChange,
    vrShowErrors: isVrShowErrors,
    vrMode: wizardState.vrBand?.vrMode ?? 'lump_sum',
    vrInitialCapital: safeNumber(
      wizardState.vrBand?.initialCapital,
      STRATEGY_DEFAULTS.VR_INITIAL_CAPITAL,
    ),
    vrInitialV: safeNumber(
      wizardState.vrBand?.initialV,
      STRATEGY_DEFAULTS.VR_INITIAL_VALUE,
    ),
    vrMinOrderQty: safeNumber(wizardState.vrBand?.minOrderQty, 1),
    vrBandUpperPct: safeNumber(wizardState.vrBand?.bandUpperPct, 5),
    vrBandLowerPct: safeNumber(wizardState.vrBand?.bandLowerPct, 5),
    vrG: safeNumber(wizardState.vrBand?.g, 10),
    vrPoolUsagePct: safeNumber(wizardState.vrBand?.poolUsagePct, 50),
    vrDeltaCash: safeNumber(wizardState.vrBand?.deltaCash, 0),
    vrCycleWeeks: safeNumber(
      wizardState.vrBand?.cycleWeeks,
      VR_CYCLE.DEFAULT_WEEKS,
    ),
    handleVrModeChange,
    handleNameChange,
    handleDailyBuyAmountChange,
    handleFeeRatePercentChange,
    handleStartDateChange,
  };
}
```

### `components/AlarmModal.tsx`

```tsx

import React from 'react';
import type { AlarmConfig, Portfolio } from '../types';
import { AlarmModalView } from './alarm/AlarmModalView';
import { useAlarmModalController } from './alarm/useAlarmModalController';

interface AlarmModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (config: AlarmConfig) => Promise<void> | void;
  maxAlarms: number;
}

const AlarmModal: React.FC<AlarmModalProps> = ({
  lang,
  portfolio,
  onClose,
  onSave,
  maxAlarms,
}) => {
  const controller = useAlarmModalController({
    lang,
    portfolio,
    maxAlarms,
    onSave,
  });

  return (
    <AlarmModalView
      lang={lang}
      maxAlarms={maxAlarms}
      onClose={onClose}
      controller={controller}
    />
  );
};

export default AlarmModal;
```

### `components/alarm/AlarmModalView.tsx`

```tsx
import React, { useState } from 'react';
import { ChevronDown, Clock, Info, Plus, Trash2, X } from 'lucide-react';
import type { AppLang } from '@/types';
import { useTossApp } from '@/contexts/TossAppContext';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';
import { useTDSMenu } from '@/components/tds';
import Toggle from '@/components/Toggle';
import CustomDropdown from '@/components/CustomDropdown';
import InfoModal from '@/components/InfoModal';
import { getCommonMessages } from '@/constants/messages/commonMessages';
import type { UseAlarmModalControllerResult } from './useAlarmModalController';

interface AlarmModalViewProps {
  lang: AppLang;
  maxAlarms: number;
  onClose: () => void;
  controller: UseAlarmModalControllerResult;
}

function getSelectableButtonClassName(isActive: boolean): string {
  const baseClassName =
    'py-3 rounded-xl text-xs font-black transition-all border';
  if (isActive) {
    return `${baseClassName} bg-gradient-to-r from-blue-600 to-blue-500 text-white border-transparent shadow-lg shadow-blue-500/30`;
  }

  return `${baseClassName} bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-white/5`;
}

function formatAlarmTime(
  time24: string,
  lang: AppLang,
  copy: UseAlarmModalControllerResult['copy'],
): string {
  const [hourString, minuteString = '00'] = time24.split(':');
  const hour24 = Number.parseInt(hourString, 10);
  if (!Number.isFinite(hour24)) {
    return time24;
  }

  const isPostMeridiem = hour24 >= 12;
  const hour12 = hour24 % 12;
  const displayHour = hour12 === 0 ? 12 : hour12;
  if (lang === 'ko') {
    const periodLabel = isPostMeridiem ? copy.period.pm : copy.period.am;
    const normalizedHour =
      hour24 === 0 ? '00' : displayHour.toString().padStart(2, '0');
    return `${periodLabel} ${normalizedHour}:${minuteString}`;
  }

  const periodLabel = isPostMeridiem ? copy.period.pm : copy.period.am;
  return `${displayHour}:${minuteString} ${periodLabel}`;
}

export function AlarmModalView({
  lang,
  maxAlarms,
  onClose,
  controller,
}: AlarmModalViewProps): React.ReactElement {
  const { isInTossApp } = useTossApp();
  const { Menu: TDSMenu } = useTDSMenu();
  const commonCopy = getCommonMessages(lang);
  const [isMinuteMenuOpen, setIsMinuteMenuOpen] = useState(false);

  const selectedMinuteLabel = `${controller.selectedMinute}${controller.copy.minuteUnit}`;

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div
          role="button"
          tabIndex={0}
          aria-label={controller.copy.aria.closeBackdrop}
          onClick={onClose}
          onKeyDown={(event) => {
            handlePressEnterOrSpace(event, onClose);
          }}
          className="absolute inset-0 bg-slate-900/50 dark:bg-[#0B0F19]/90 backdrop-blur-sm"
        />
        <div
          className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl dark:border-white/5 dark:bg-[#080B15] dark:shadow-2xl"
          style={{ touchAction: 'pan-y' }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-6 dark:border-white/5 dark:bg-[#080B15]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-500/20">
                <Clock className="text-white" size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  {controller.copy.title}
                </h2>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
                  {controller.copy.slotSystem(maxAlarms)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label={controller.copy.aria.closeModal}
            >
              <X size={20} />
            </button>
          </div>

          <div className="scrollbar-hide flex-1 space-y-6 overflow-y-auto overscroll-contain p-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 backdrop-blur-sm dark:border-white/5 dark:bg-white/5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-200">
                  {controller.copy.statusLabel}
                </span>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-black ${
                      controller.isEnabled
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {controller.isEnabled
                      ? controller.copy.onState
                      : controller.copy.offState}
                  </span>
                  <Toggle
                    checked={controller.isEnabled}
                    onChange={controller.handleSetEnabled}
                    aria-label={controller.copy.aria.toggleAlarm}
                  />
                </div>
              </div>
              {controller.isEnabled ? (
                <p className="mt-2 text-[10px] font-medium text-slate-500 dark:text-slate-300">
                  {controller.copy.enabledDescription}
                </p>
              ) : null}
            </div>

            {controller.isEnabled ? (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                      {controller.copy.configuredTimes}
                    </span>
                    <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                      ({controller.selectedTimes.length}/{maxAlarms})
                    </span>
                  </div>

                  {controller.selectedTimes.length > 0 ? (
                    <div className="space-y-2">
                      {controller.selectedTimes.map((time) => {
                        const timeLabel = formatAlarmTime(
                          time,
                          lang,
                          controller.copy,
                        );
                        return (
                          <div
                            key={time}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5"
                          >
                            <span className="text-sm font-black text-slate-900 dark:text-white">
                              {timeLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => controller.handleRemoveTime(time)}
                              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                              aria-label={controller.copy.aria.removeTime(
                                timeLabel,
                              )}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {!controller.isAllSlotsFilled ? (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-6 backdrop-blur-sm dark:border-white/5 dark:bg-white/5">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                      {controller.copy.addTime}
                    </span>

                    <div className="space-y-2">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">
                        {controller.copy.periodLabel}
                      </label>
                      <div className="flex gap-2">
                        {(['AM', 'PM'] as const).map((periodValue) => (
                          <button
                            key={periodValue}
                            type="button"
                            onClick={() =>
                              controller.handleSetPeriod(periodValue)
                            }
                            className={`flex-1 ${getSelectableButtonClassName(
                              controller.period === periodValue,
                            )}`}
                            aria-label={controller.copy.aria.selectPeriod(
                              periodValue,
                            )}
                          >
                            {periodValue === 'AM'
                              ? controller.copy.period.am
                              : controller.copy.period.pm}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">
                        {controller.copy.hourLabel}
                      </label>
                      <div className="grid grid-cols-6 gap-2">
                        {controller.hourOptions.map((hour) => (
                          <button
                            key={hour}
                            type="button"
                            onClick={() =>
                              controller.handleSetSelectedHour(hour)
                            }
                            className={`text-[11px] ${getSelectableButtonClassName(
                              controller.selectedHour === hour,
                            )}`}
                          >
                            {hour}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300">
                        {controller.copy.minuteLabel}
                      </label>
                      {isInTossApp && TDSMenu != null ? (
                        <TDSMenu
                          open={isMinuteMenuOpen}
                          onOpen={() => setIsMinuteMenuOpen(true)}
                          onClose={() => setIsMinuteMenuOpen(false)}
                          placement="bottom"
                        >
                          <TDSMenu.Trigger>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-900 transition-colors hover:bg-slate-50 focus:ring-2 focus:ring-blue-500/50 dark:border-white/5 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                              aria-label={controller.copy.aria.minuteMenuTrigger}
                            >
                              <span>{selectedMinuteLabel}</span>
                              <ChevronDown
                                size={16}
                                className="text-slate-400"
                              />
                            </button>
                          </TDSMenu.Trigger>
                          <TDSMenu.Dropdown>
                            <TDSMenu.Header>
                              {controller.copy.minuteIntervalHeader}
                            </TDSMenu.Header>
                            {controller.minuteOptions.map((option) => (
                              <TDSMenu.DropdownCheckItem
                                key={option.value}
                                checked={
                                  controller.selectedMinute === option.value
                                }
                                onCheckedChange={(checked) => {
                                  if (!checked) {
                                    return;
                                  }
                                  controller.handleSetSelectedMinute(
                                    option.value,
                                  );
                                  setIsMinuteMenuOpen(false);
                                }}
                              >
                                {option.label}
                              </TDSMenu.DropdownCheckItem>
                            ))}
                          </TDSMenu.Dropdown>
                        </TDSMenu>
                      ) : (
                        <CustomDropdown
                          value={controller.selectedMinute}
                          options={controller.minuteOptions}
                          onChange={controller.handleSetSelectedMinute}
                          header={controller.copy.minuteIntervalHeader}
                          className="w-full"
                          infoModalBadgeLabel={commonCopy.notice}
                          infoModalCloseAriaLabel={commonCopy.closeDialog}
                          infoModalConfirmLabel={commonCopy.acknowledge}
                        />
                      )}
                    </div>

                    <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/20 dark:bg-blue-600/10">
                      <Info
                        size={14}
                        className="mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400"
                      />
                      <p className="text-[10px] font-medium text-slate-700 dark:text-slate-200">
                        {controller.copy.minuteIntervalNotice}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={controller.handleAddTime}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] hover:bg-blue-500 active:scale-95"
                    >
                      <Plus size={14} />
                      {controller.copy.addAction}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50 p-4 dark:border-blue-500/30 dark:from-blue-600/20 dark:to-purple-600/20">
                    <Info
                      className="flex-shrink-0 text-blue-600 dark:text-blue-400"
                      size={18}
                    />
                    <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                      {controller.copy.allSlotsFilledNotice}
                    </p>
                  </div>
                )}
              </>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 p-6 dark:border-white/5 dark:bg-[#080B15]">
            <button
              type="button"
              onClick={() => {
                void controller.handleSave();
              }}
              disabled={controller.isSaving}
              aria-busy={controller.isSaving}
              aria-label={controller.copy.aria.saveAlarmSettings}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-blue-500/30 transition-all hover:scale-[1.02] hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Clock size={16} />
              {controller.isSaving
                ? commonCopy.processing
                : controller.copy.saveAction}
            </button>
          </div>
        </div>
      </div>

      <InfoModal
        open={controller.isInfoOpen}
        badgeLabel={commonCopy.notice}
        title={controller.copy.premiumFeatureNoticeTitle}
        message={controller.copy.premiumFeatureNoticeBody}
        closeAriaLabel={commonCopy.closeDialog}
        confirmLabel={commonCopy.acknowledge}
        onClose={controller.handleCloseInfo}
      />
    </>
  );
}

export default AlarmModalView;
```

### `components/alarm/useAlarmModalController.ts`

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlarmConfig, Portfolio } from '@/types';
import { getAlarmMessages } from '@/constants/messages/alarmMessages';

const MINUTE_STEP = 10;
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, index) =>
  (index * MINUTE_STEP).toString().padStart(2, '0'),
);
const HOURS = Array.from({ length: 12 }, (_, index) =>
  index.toString().padStart(2, '0'),
);

interface UseAlarmModalControllerParams {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  maxAlarms: number;
  /** Rule 11: 저장이 네트워크를 탈 수 있으므로 Promise 허용 + 아래 Mutex로 연타 차단 */
  onSave: (config: AlarmConfig) => Promise<void> | void;
}

export interface UseAlarmModalControllerResult {
  copy: ReturnType<typeof getAlarmMessages>;
  isEnabled: boolean;
  selectedTimes: string[];
  period: 'AM' | 'PM';
  selectedHour: string;
  selectedMinute: string;
  isAllSlotsFilled: boolean;
  isInfoOpen: boolean;
  isSaving: boolean;
  hourOptions: string[];
  minuteOptions: Array<{ value: string; label: string }>;
  handleSetEnabled: (checked: boolean) => void;
  handleSetPeriod: (period: 'AM' | 'PM') => void;
  handleSetSelectedHour: (hour: string) => void;
  handleSetSelectedMinute: (minute: string) => void;
  handleAddTime: () => void;
  handleRemoveTime: (time: string) => void;
  handleCloseInfo: () => void;
  handleSave: () => Promise<void>;
}

export function useAlarmModalController({
  lang,
  portfolio,
  maxAlarms,
  onSave,
}: UseAlarmModalControllerParams): UseAlarmModalControllerResult {
  const copy = getAlarmMessages(lang);
  const initialConfig = portfolio.alarmconfig ?? {
    enabled: false,
    selectedHours: [],
  };
  const [isEnabled, setIsEnabled] = useState(initialConfig.enabled);
  const [selectedTimes, setSelectedTimes] = useState<string[]>(
    initialConfig.selectedHours?.slice(0, maxAlarms) ?? [],
  );
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const previousSelectedTimesKeyRef = useRef<string | null>(null);

  const isAllSlotsFilled = selectedTimes.length >= maxAlarms;

  const minuteOptions = useMemo(
    () =>
      MINUTES.map((minute) => ({
        value: minute,
        label: `${minute}${copy.minuteUnit}`,
      })),
    [copy.minuteUnit],
  );

  // Rule 6: 모듈 최상단에 두고 단 한 곳에서도 안 쓰는 헬퍼(예: getSelectionFromTime) 금지.
  // 첫 선택 시각 → AM/PM·시·분 동기화는 이 effect 안에서만 인라인 파생한다.
  useEffect(() => {
    if (selectedTimes.length === 0) {
      previousSelectedTimesKeyRef.current = null;
      return;
    }

    const nextKey = selectedTimes.join(',');
    if (previousSelectedTimesKeyRef.current === nextKey) {
      return;
    }

    previousSelectedTimesKeyRef.current = nextKey;

    const firstTime = selectedTimes[0];
    const [hourString, minuteString = '00'] = firstTime.split(':');
    const hour24 = Number.parseInt(hourString, 10);

    if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) {
      setPeriod('AM');
      setSelectedHour('09');
      setSelectedMinute(minuteString);
      return;
    }

    if (hour24 >= 12) {
      setPeriod('PM');
      setSelectedHour((hour24 === 12 ? 0 : hour24 - 12).toString().padStart(2, '0'));
    } else {
      setPeriod('AM');
      setSelectedHour(hourString.padStart(2, '0'));
    }
    setSelectedMinute(minuteString);
  }, [selectedTimes]);

  const handleAddTime = useCallback(() => {
    let hour24Num = Number.parseInt(selectedHour, 10);
    if (Number.isNaN(hour24Num)) {
      return;
    }

    // Rule 2 & 6: 12h → 24h는 삼항 중첩 없이 if-return으로 고정 (12 AM → 00, 12 PM → 12, 그 외 PM +12)
    if (period === 'AM') {
      if (hour24Num === 12) {
        hour24Num = 0;
      }
    } else if (hour24Num !== 12) {
      hour24Num += 12;
    }

    const hour24 = hour24Num.toString().padStart(2, '0');
    const nextTime = `${hour24}:${selectedMinute}`;
    if (selectedTimes.includes(nextTime)) {
      setSelectedTimes((previous) => previous.filter((time) => time !== nextTime));
      return;
    }

    if (selectedTimes.length >= maxAlarms) {
      setIsInfoOpen(true);
      return;
    }

    setSelectedTimes((previous) => [...previous, nextTime].sort());
  }, [maxAlarms, period, selectedHour, selectedMinute, selectedTimes]);

  const handleRemoveTime = useCallback((time: string) => {
    setSelectedTimes((previous) => {
      const next = previous.filter((value) => value !== time);
      if (next.length === 0) {
        setIsEnabled(false);
      }
      return next;
    });
  }, []);

  const handleCloseInfo = useCallback(() => {
    setIsInfoOpen(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) {
      return;
    }

    const shouldEnable = isEnabled && selectedTimes.length > 0;
    const nextConfig: AlarmConfig = {
      enabled: shouldEnable,
      selectedHours: shouldEnable ? selectedTimes : [],
    };

    try {
      isSavingRef.current = true;
      setIsSaving(true);
      await Promise.resolve(onSave(nextConfig));
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [isEnabled, onSave, selectedTimes]);

  return {
    copy,
    isEnabled,
    selectedTimes,
    period,
    selectedHour,
    selectedMinute,
    isAllSlotsFilled,
    isInfoOpen,
    isSaving,
    hourOptions: HOURS,
    minuteOptions,
    handleSetEnabled: setIsEnabled,
    handleSetPeriod: setPeriod,
    handleSetSelectedHour: setSelectedHour,
    handleSetSelectedMinute: setSelectedMinute,
    handleAddTime,
    handleRemoveTime,
    handleCloseInfo,
    handleSave,
  };
}
```

### `components/PortfolioDetailsModal.tsx`

```tsx

import React from 'react';
import type { Portfolio } from '../types';
import { PortfolioDetailsView } from './portfolioDetails/PortfolioDetailsView';
import { usePortfolioDetailsController } from './portfolioDetails/usePortfolioDetailsController';

interface PortfolioDetailsModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onDeleteTrade: (tradeId: string) => Promise<void> | void;
  isHistory?: boolean;
}

const PortfolioDetailsModal: React.FC<PortfolioDetailsModalProps> = ({
  lang,
  portfolio,
  onClose,
  onDeleteTrade,
  isHistory,
}) => {
  const controller = usePortfolioDetailsController({
    lang,
    portfolio,
    isHistory,
    onDeleteTrade,
  });

  return (
    <PortfolioDetailsView
      portfolioName={portfolio.name}
      controller={controller}
      onClose={onClose}
    />
  );
};

export default PortfolioDetailsModal;
```

### `components/portfolioDetails/PortfolioDetailsView.tsx`

```tsx
import React from 'react';
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { PAID_STOCKS } from '@/constants';
import type { Trade } from '@/types';
import { handlePressEnterOrSpace } from '@/src/utils/a11yHelpers';
import StockLogo from '@/components/StockLogo';
import { TdsConfirmDialog } from '@/components/tds-adapter/TdsConfirmDialog';
import type { UsePortfolioDetailsControllerResult } from './usePortfolioDetailsController';

interface PortfolioDetailsViewProps {
  portfolioName: string;
  controller: UsePortfolioDetailsControllerResult;
  onClose: () => void;
}

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatInteger(value: number): string {
  return value.toLocaleString();
}

function getTradeTypeLabel(
  trade: Trade,
  copy: UsePortfolioDetailsControllerResult['copy'],
): string {
  return trade.type === 'buy' ? copy.buyLabel : copy.sellLabel;
}

function getSettlementAmount(trade: Trade): number {
  const gross = trade.price * trade.quantity;
  if (trade.type === 'buy') {
    return gross + Math.abs(trade.fee);
  }

  return gross - Math.abs(trade.fee);
}

function renderStockIcon(
  ticker: string,
  size: 'sm' | 'md' = 'sm',
  index = 0,
): React.ReactElement {
  const sizeClassName = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const stackStyle =
    size === 'sm' && index > 0
      ? {
          marginLeft: '-1.2rem',
          zIndex: 10 + index,
          transform: `rotate(${index * 3}deg) translateY(${index}px)`,
        }
      : undefined;

  return (
    <div
      key={`${ticker}-${index}`}
      className={`relative ${sizeClassName} flex-shrink-0`}
      style={stackStyle}
    >
      <StockLogo
        ticker={ticker}
        size={size}
        shape="circle"
        paidAccent={PAID_STOCKS.includes(ticker)}
        showFallbackText
        className={`${sizeClassName} border border-white/20 shadow-lg`}
      />
    </div>
  );
}

export function PortfolioDetailsView({
  portfolioName,
  controller,
  onClose,
}: PortfolioDetailsViewProps): React.ReactElement {
  const year = controller.currentMonth.getFullYear();
  const month = controller.currentMonth.getMonth() + 1;

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div
          role="button"
          tabIndex={0}
          aria-label={controller.copy.aria.closeBackdrop}
          onClick={onClose}
          onKeyDown={(event) => {
            handlePressEnterOrSpace(event, onClose);
          }}
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-md dark:bg-slate-950/80"
        />
        <div
          className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161d2a]"
          style={{ touchAction: 'pan-y' }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-6 md:p-8 dark:border-white/5 dark:bg-slate-900/30">
            <h2 className="flex items-center gap-2 text-2xl font-black text-slate-900 dark:text-white">
              <span>{portfolioName}</span>
              {controller.isReadOnly ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-300">
                  {controller.copy.settledBadge}
                </span>
              ) : null}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-3 text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
              aria-label={controller.copy.aria.closeModal}
            >
              <X size={24} />
            </button>
          </div>

          <div className="scrollbar-hide flex-1 space-y-8 overflow-y-auto overscroll-contain bg-slate-50 p-6 md:space-y-10 md:p-8 dark:bg-transparent">
            {!controller.isReadOnly ? (
              <section className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  {controller.copy.holdingsSummaryTitle}
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {controller.holdingsSummary.length === 0 ? (
                    <div className="col-span-full rounded-[2rem] border border-slate-200 bg-slate-100 p-8 text-center dark:border-white/5 dark:bg-white/5">
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">
                        {controller.copy.noHoldings}
                      </p>
                    </div>
                  ) : (
                    controller.holdingsSummary.map((holding) => (
                      <div
                        key={holding.ticker}
                        className="group relative flex items-center gap-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-md backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/40 dark:shadow-lg"
                      >
                        <div className="absolute left-0 top-0 h-full w-1.5 bg-blue-600" />
                        {renderStockIcon(holding.ticker, 'md')}
                        <div className="grid flex-1 grid-cols-2 gap-4">
                          <div>
                            <span className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.quantity}
                            </span>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {formatInteger(holding.quantity)}
                            </p>
                          </div>
                          <div>
                            <span className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.avgPrice}
                            </span>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {formatCurrency(holding.avgPrice)}
                            </p>
                          </div>
                          <div className="col-span-2 border-t border-slate-200 pt-2 dark:border-white/5">
                            <span className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.totalValuation}
                            </span>
                            <p className="text-base font-black text-emerald-500">
                              {formatCurrency(holding.valuation)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}

            <section className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                {controller.copy.weekdayCalendarTitle}
              </h3>
              <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-8 shadow-md backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/40 dark:shadow-inner">
                <div className="mb-8 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={controller.handlePrevMonth}
                    className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                    aria-label={controller.copy.aria.previousMonth}
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <h4 className="text-xl font-black uppercase tracking-widest text-slate-900 dark:text-white">
                    {controller.copy.monthTitle(year, month)}
                  </h4>
                  <button
                    type="button"
                    onClick={controller.handleNextMonth}
                    className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                    aria-label={controller.copy.aria.nextMonth}
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>

                <div className="mb-4 grid grid-cols-5">
                  {controller.copy.weekdayHeaders.map((weekday) => (
                    <div
                      key={weekday}
                      className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-500"
                    >
                      {weekday}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-5 gap-3">
                  {controller.calendarGrid.map((cell) => {
                    if (cell.kind === 'empty') {
                      return (
                        <div
                          key={cell.key}
                          className="min-h-[120px] rounded-3xl bg-slate-100 opacity-20 dark:bg-white/5"
                        />
                      );
                    }

                    const dateKey = getDateKey(cell.date);
                    const allTradesForDate =
                      controller.getTradesForDate(dateKey);
                    const isSelected = controller.selectedDate === dateKey;

                    const buys = allTradesForDate.filter(
                      (trade) => trade.type === 'buy',
                    );
                    const sells = allTradesForDate.filter(
                      (trade) => trade.type === 'sell',
                    );

                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => controller.handleSetSelectedDate(dateKey)}
                        aria-label={controller.copy.aria.selectDate(dateKey)}
                        className={`relative flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-3xl border p-3 transition-all ${
                          isSelected
                            ? 'z-10 scale-105 border-blue-500 bg-blue-50 shadow-xl dark:bg-blue-600/20'
                            : 'border-slate-200 bg-slate-50 shadow-sm hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
                        }`}
                      >
                        <span
                          className={`text-[11px] font-black ${
                            isSelected ? 'text-blue-500' : 'text-slate-500'
                          }`}
                        >
                          {cell.date.getDate()}
                        </span>

                        <div className="flex w-full flex-col items-center gap-2">
                          {buys.length > 0 ? (
                            <div className="flex w-full items-center justify-center">
                              {buys.map((trade, index) =>
                                renderStockIcon(trade.stock, 'sm', index),
                              )}
                            </div>
                          ) : null}
                          {sells.length > 0 ? (
                            <div className="flex w-full items-center justify-center">
                              {sells.map((trade, index) =>
                                renderStockIcon(trade.stock, 'sm', index),
                              )}
                            </div>
                          ) : null}
                          {allTradesForDate.length > 0 ? (
                            <div className="mt-1.5 flex gap-1.5">
                              {buys.length > 0 ? (
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                              ) : null}
                              {sells.length > 0 ? (
                                <div className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                {controller.copy.selectedDateTradesTitle}
              </h3>
              <div className="space-y-4">
                {controller.selectedDayTrades.length === 0 ? (
                  <div className="rounded-[2rem] border border-slate-200 bg-slate-100 p-10 text-center backdrop-blur-sm dark:border-white/5 dark:bg-white/5">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-600">
                      {controller.copy.noTrades}
                    </p>
                  </div>
                ) : (
                  controller.selectedDayTrades.map((trade) => {
                    const isFinalSell =
                      trade.type === 'sell' &&
                      trade.id.startsWith('final-');
                    const tradeTypeLabel = getTradeTypeLabel(
                      trade,
                      controller.copy,
                    );

                    return (
                      <div
                        key={trade.id}
                        className="group relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-md transition-all backdrop-blur-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:shadow-lg dark:hover:bg-white/10"
                      >
                        <div
                          className={`absolute left-0 top-0 h-full w-1.5 ${
                            trade.type === 'buy'
                              ? 'bg-emerald-500'
                              : 'bg-rose-500'
                          }`}
                        />

                        <div className="mb-6 flex items-center justify-between pr-12">
                          <div className="flex items-center gap-4">
                            {renderStockIcon(trade.stock, 'md')}
                            <div>
                              <h4 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">
                                {isFinalSell ? (
                                  <span>
                                    [{controller.copy.finalSettlementSellPrefix}]{' '}
                                  </span>
                                ) : null}
                                {trade.stock}
                              </h4>
                              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                                {tradeTypeLabel}{' '}
                                {controller.copy.tradeExecutionSuffix}
                              </p>
                            </div>
                          </div>
                          <div
                            className={`rounded-full border px-4 py-1.5 text-[9px] font-black uppercase tracking-widest ${
                              trade.type === 'buy'
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                                : 'border-rose-500/20 bg-rose-500/10 text-rose-500'
                            }`}
                          >
                            {tradeTypeLabel}
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4">
                          <div>
                            <span className="mb-1 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.executionPrice}
                            </span>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {formatCurrency(trade.price)}
                            </p>
                          </div>
                          <div>
                            <span className="mb-1 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.quantity}
                            </span>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {formatInteger(trade.quantity)}
                            </p>
                          </div>
                          <div>
                            <span className="mb-1 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.fee}
                            </span>
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {formatCurrency(Math.abs(trade.fee))}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="mb-1 block text-[8px] font-bold uppercase tracking-widest text-slate-500">
                              {controller.copy.settlementAmount}
                            </span>
                            <p
                              className={`text-sm font-black ${
                                trade.type === 'buy'
                                  ? 'text-emerald-500'
                                  : 'text-rose-500'
                              }`}
                            >
                              {formatCurrency(getSettlementAmount(trade))}
                            </p>
                          </div>
                        </div>

                        {!controller.isReadOnly ? (
                          <button
                            type="button"
                            onClick={() =>
                              controller.handleRequestDeleteTrade(trade.id)
                            }
                            aria-label={controller.copy.aria.openTradeDeleteDialog(
                              trade.stock,
                              controller.selectedDate,
                            )}
                            className="absolute right-6 top-6 rounded-xl border border-rose-500/20 bg-rose-500/10 p-2.5 text-rose-500 shadow-sm transition-all hover:bg-rose-600 hover:text-white"
                          >
                            <Trash2 size={18} />
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <div className="flex gap-4 border-t border-slate-200 bg-slate-50 p-8 dark:border-white/5 dark:bg-slate-900/30">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl border border-slate-300 bg-slate-200 py-5 text-xs font-black uppercase tracking-widest text-slate-700 shadow-md transition-all hover:bg-slate-300 dark:border-white/10 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
            >
              {controller.copy.closeAction}
            </button>
          </div>
        </div>
      </div>

      <TdsConfirmDialog
        {...controller.deleteDialogProps}
        labels={controller.labels}
      />
    </>
  );
}

export default PortfolioDetailsView;
```

### `components/portfolioDetails/usePortfolioDetailsController.ts`

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Portfolio, Trade } from '@/types';
import { fetchStockPrices } from '@/services/stockService';
import { calculateHoldings } from '@/utils/portfolioCalculations';
import {
  getPortfolioDetailsMessages,
  type PortfolioDetailsMessageSet,
} from '@/constants/messages/portfolioDetailsMessages';
import { useAsyncTdsConfirm } from '@/components/tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from '@/constants/tdsDialogMessages';

/** USD 등 2소수 화폐 스칼라 — Rule 1: EPSILON 포함 센트 반올림 */
const MONEY_DECIMAL_SCALE = 100;

function roundMoneyScalar2(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_DECIMAL_SCALE) / MONEY_DECIMAL_SCALE;
}

type CalendarCell =
  | { key: string; kind: 'empty' }
  | { key: string; kind: 'date'; date: Date };

interface HoldingSummaryItem {
  ticker: string;
  quantity: number;
  avgPrice: number;
  valuation: number;
}

interface UsePortfolioDetailsControllerParams {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  isHistory?: boolean;
  onDeleteTrade: (tradeId: string) => void | Promise<void>;
}

export interface UsePortfolioDetailsControllerResult {
  copy: PortfolioDetailsMessageSet;
  labels: (typeof TDS_DIALOG_MESSAGES)['ko']['actions'];
  deleteDialogProps: ReturnType<typeof useAsyncTdsConfirm>['dialogProps'];
  isReadOnly: boolean;
  selectedDate: string;
  currentMonth: Date;
  calendarGrid: CalendarCell[];
  holdingsSummary: HoldingSummaryItem[];
  selectedDayTrades: Trade[];
  getTradesForDate: (date: string) => Trade[];
  handleSetSelectedDate: (date: string) => void;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  handleRequestDeleteTrade: (tradeId: string) => void;
}

function getDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildCalendarGrid(currentMonth: Date): CalendarCell[] {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekday = firstDay.getDay();
  const leadingEmptyCount =
    firstWeekday >= 1 && firstWeekday <= 5 ? firstWeekday - 1 : 0;

  const cells: CalendarCell[] = [];
  for (let index = 0; index < leadingEmptyCount; index += 1) {
    cells.push({
      key: `empty-${year}-${month}-${index}`,
      kind: 'empty',
    });
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(year, month, day);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    cells.push({
      key: getDateKey(date),
      kind: 'date',
      date,
    });
  }

  return cells;
}

export function usePortfolioDetailsController({
  lang,
  portfolio,
  isHistory,
  onDeleteTrade,
}: UsePortfolioDetailsControllerParams): UsePortfolioDetailsControllerResult {
  const copy = getPortfolioDetailsMessages(lang);
  const labels = (TDS_DIALOG_MESSAGES[lang] ?? TDS_DIALOG_MESSAGES.ko).actions;
  const deleteDialog = useAsyncTdsConfirm(lang);
  const [selectedDate, setSelectedDate] = useState(() => getDateKey(new Date()));
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [stockPrices, setStockPrices] = useState<Record<string, number>>({});

  const isReadOnly = isHistory ?? Boolean(portfolio.isClosed);

  const holdings = useMemo(() => {
    if (isReadOnly) {
      return [];
    }
    return calculateHoldings(portfolio);
  }, [isReadOnly, portfolio]);

  useEffect(() => {
    if (isReadOnly || holdings.length === 0) {
      setStockPrices({});
      return;
    }

    let isCancelled = false;

    fetchStockPrices(holdings.map((holding) => holding.stock))
      .then((prices) => {
        if (isCancelled) {
          return;
        }

        const nextPrices = Object.fromEntries(
          Object.entries(prices).map(([ticker, data]) => [ticker, data.price]),
        );
        setStockPrices(nextPrices);
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        console.error('Failed to fetch stock prices', error);
        setStockPrices({});
      });

    return () => {
      isCancelled = true;
    };
  }, [holdings, isReadOnly]);

  // Rule 1 & 6: calculateHoldings가 이미 종목별 가중 평균 단가를 반환하므로 reduce로 다시 합치지 않는다.
  // 잘못된 avgPrice 덮어쓰기는 금융 수학 파괴. O(N) map 한 번만 허용.
  // §0.6: valuation = 시가 우선 — unitPrice = stockPrices[ticker] ?? avgPrice (제품 정책).
  // Rule 1: avgPrice·valuation 등 화폐 스칼라는 EPSILON 포함 2소수 반올림. quantity는 정수 주만 가정 → 별도 반올림 생략.
  const holdingsSummary = useMemo(() => {
    if (isReadOnly || holdings.length === 0) {
      return [];
    }

    return holdings.map((holding) => {
      const unitPrice = stockPrices[holding.stock] ?? holding.avgPrice;
      const rawValuation = holding.quantity * unitPrice;

      return {
        ticker: holding.stock,
        quantity: holding.quantity,
        avgPrice: roundMoneyScalar2(holding.avgPrice),
        valuation: roundMoneyScalar2(rawValuation),
      };
    });
  }, [holdings, isReadOnly, stockPrices]);

  const tradesByDate = useMemo(() => {
    return portfolio.trades.reduce<Record<string, Trade[]>>((acc, trade) => {
      const currentTrades = acc[trade.date] ?? [];
      currentTrades.push(trade);
      acc[trade.date] = currentTrades;
      return acc;
    }, {});
  }, [portfolio.trades]);

  const selectedDayTrades = tradesByDate[selectedDate] ?? [];
  const calendarGrid = useMemo(() => buildCalendarGrid(currentMonth), [currentMonth]);
  const getTradesForDate = useCallback(
    (date: string) => tradesByDate[date] ?? [],
    [tradesByDate],
  );

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((previous) =>
      new Date(previous.getFullYear(), previous.getMonth() - 1, 1),
    );
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((previous) =>
      new Date(previous.getFullYear(), previous.getMonth() + 1, 1),
    );
  }, []);

  const handleRequestDeleteTrade = useCallback(
    (tradeId: string) => {
      deleteDialog.open({
        title: copy.deleteTradeDialog.title,
        body: copy.deleteTradeDialog.body,
        confirmLabel: copy.deleteTradeDialog.confirm,
        tone: 'danger',
        action: () => onDeleteTrade(tradeId),
      });
    },
    [copy.deleteTradeDialog, deleteDialog, onDeleteTrade],
  );

  return {
    copy,
    labels,
    deleteDialogProps: deleteDialog.dialogProps,
    isReadOnly,
    selectedDate,
    currentMonth,
    calendarGrid,
    holdingsSummary,
    selectedDayTrades,
    getTradesForDate,
    handleSetSelectedDate: setSelectedDate,
    handlePrevMonth,
    handleNextMonth,
    handleRequestDeleteTrade,
  };
}

```

### `components/portfolio/PortfolioCardActions.tsx`

```tsx
import React, { useCallback } from 'react';
import { Bell, BellOff, Trash2 } from 'lucide-react';
import { TDS_DIALOG_MESSAGES } from '../../constants/tdsDialogMessages';
import { getDashboardMessages } from '../../constants/messages/dashboardMessages';
import { useTossApp } from '../../contexts/TossAppContext';
import { TDSButton } from '../tds';
import { TdsConfirmDialog } from '../tds-adapter/TdsConfirmDialog';
import { showErrorToast } from '../tds-adapter/showErrorToast';
import { useAsyncTdsConfirm } from '../tds-adapter/useAsyncTdsConfirm';

interface PortfolioCardActionsProps {
  lang: 'ko' | 'en';
  isAlarmEnabled: boolean;
  onOpenAlarm: () => void;
  onDeletePortfolio: () => Promise<void> | void;
}

function getAlarmButtonClassName(
  isAlarmEnabled: boolean,
  isInTossApp: boolean,
): string {
  const base = 'w-9 h-9 rounded-lg flex items-center justify-center';
  if (isInTossApp) {
    return isAlarmEnabled
      ? `${base} min-w-0 p-0 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500`
      : `${base} min-w-0 p-0`;
  }

  if (isAlarmEnabled) {
    return `${base} transition-all duration-300 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500 border border-amber-200 dark:border-amber-500/30`;
  }

  return `${base} transition-all duration-300 bg-transparent text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800`;
}

export const PortfolioCardActions: React.FC<PortfolioCardActionsProps> = ({
  lang,
  isAlarmEnabled,
  onOpenAlarm,
  onDeletePortfolio,
}) => {
  const { isInTossApp } = useTossApp();
  const dashboardCopy = getDashboardMessages(lang);
  const labels = TDS_DIALOG_MESSAGES[lang].actions;
  const portfolioCopy = TDS_DIALOG_MESSAGES[lang]?.portfolio;
  const deleteDialog = useAsyncTdsConfirm(lang);
  // Rule 3: 트리거 A11y — openDeleteConfirm SSOT만. 누락 시 '' (§0.6).
  const triggerLabel = portfolioCopy?.openDeleteConfirm ?? '';

  const handleRequestDelete = useCallback(() => {
    const titleText = portfolioCopy?.deleteTitle?.trim() ?? '';
    const bodyText = portfolioCopy?.deleteBody?.trim() ?? '';
    const confirmText = portfolioCopy?.deleteConfirm?.trim() ?? '';

    // Rule 11 & 3: 필드 누락 시 모달 미오픈. 토스트는 auth.authCopyMissingFallback 만 재사용(신규 키·영문 리터럴 금지, §0.6).
    if (titleText === '' || bodyText === '' || confirmText === '') {
      const fallbackMsg =
        TDS_DIALOG_MESSAGES[lang]?.auth?.authCopyMissingFallback?.trim() ?? '';
      if (fallbackMsg !== '') {
        showErrorToast(fallbackMsg);
      }
      return;
    }

    deleteDialog.open({
      title: titleText,
      body: bodyText,
      confirmLabel: confirmText,
      tone: 'danger',
      action: onDeletePortfolio,
    });
  }, [
    deleteDialog,
    lang,
    onDeletePortfolio,
    portfolioCopy?.deleteBody,
    portfolioCopy?.deleteConfirm,
    portfolioCopy?.deleteTitle,
  ]);

  const alarmIcon = isAlarmEnabled ? (
    <Bell size={16} fill="currentColor" />
  ) : (
    <BellOff size={16} />
  );

  const alarmButtonClassName = getAlarmButtonClassName(isAlarmEnabled, isInTossApp);

  return (
    <>
      {isInTossApp ? (
        <>
          <TDSButton
            variant="tertiary"
            size="small"
            onClick={onOpenAlarm}
            className={alarmButtonClassName}
            aria-label={dashboardCopy.openAlarmSettingsAria}
          >
            {alarmIcon}
          </TDSButton>
          <TDSButton
            variant="tertiary"
            size="small"
            onClick={handleRequestDelete}
            className="flex h-9 w-9 min-w-0 items-center justify-center rounded-lg p-0 text-slate-500"
            aria-label={triggerLabel}
          >
            <Trash2 size={16} strokeWidth={2} />
          </TDSButton>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onOpenAlarm}
            className={alarmButtonClassName}
            aria-label={dashboardCopy.openAlarmSettingsAria}
          >
            {alarmIcon}
          </button>
          <button
            type="button"
            onClick={handleRequestDelete}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-transparent text-slate-500 transition-all duration-200 hover:border-red-600 hover:bg-red-600 hover:text-white dark:border-slate-700 active:scale-95"
            title={triggerLabel}
            aria-label={triggerLabel}
          >
            <Trash2 size={16} strokeWidth={2} />
          </button>
        </>
      )}

      <TdsConfirmDialog {...deleteDialog.dialogProps} labels={labels} />
    </>
  );
};

export default PortfolioCardActions;
```

### `components/Markets.tsx`

```tsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Area,
  Line,
  ComposedChart
} from 'recharts';
import { AVAILABLE_STOCKS, ALL_STOCKS, PAID_STOCKS, I18N } from '../constants';
import { TrendingUp, TrendingDown, Activity, BarChart2, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { fetchStockPrices, fetchStockPriceHistory } from '../services/stockService';
import { StockData, Portfolio } from '../types';
import { getMarketStatus } from '../utils/marketUtils';
import { calculateHoldings } from '../utils/portfolioCalculations';
import StockLogo from './StockLogo';
import HoverTip from './HoverTip';
import InfoModal from './InfoModal';
import { useTossApp } from '../contexts/TossAppContext';
import { getCommonMessages } from '../constants/messages/commonMessages';
import { getDashboardMessages } from '../constants/messages/dashboardMessages';

// 🚀 1. 스마트 배너 컴포넌트 임포트
import { TossInlineBanner } from './TossInlineBanner';

// ---------------------------------------------------------------------------
// 날짜 포맷 헬퍼 (CustomTooltip 용)
// ---------------------------------------------------------------------------
const formatDateKR = (raw: string | undefined): string => {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return raw;
  }
};

// ---------------------------------------------------------------------------
// 1배수 종목 상수 (모듈 레벨)
// ---------------------------------------------------------------------------
const ONE_X_STOCKS: readonly string[] = [
  'SPY', 'QQQ', 'SOXX', 'USD', 'STRC', 'BIL', 'ICSH', 'SGOV',
  'TSLA', 'NVDA', 'GOOGL', 'PLTR', 'COIN', 'MSTR', 'BMNR',
] as const;

// ---------------------------------------------------------------------------
// Recharts Tooltip Payload 타입
// ---------------------------------------------------------------------------
interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  payload?: { date?: string };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

// Custom Tooltip 컴포넌트
const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const priceData = payload.find((p) => p.dataKey === 'price');
  const formattedDate = formatDateKR(priceData?.payload?.date ?? label);
  const ma20Data = payload.find((p) => p.dataKey === 'ma20');
  const ma60Data = payload.find((p) => p.dataKey === 'ma60');

  const price = priceData?.value || 0;
  const ma20 = ma20Data?.value || 0;
  const ma60 = ma60Data?.value || 0;

  return (
    <div className="bg-[#080B15] backdrop-blur-md opacity-90 border border-white/10 rounded-2xl p-4 shadow-2xl">
      {formattedDate && (
        <div className="text-white font-black text-sm mb-3 tracking-tight">
          {formattedDate}
        </div>
      )}
      <div className="space-y-2">
        {/* PRICE */}
        {price > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PRICE</span>
            <span className="text-sm font-black text-white ml-auto">${price.toFixed(2)}</span>
          </div>
        )}
        {/* MA 20 */}
        {ma20 > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#f59e0b]"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MA 20</span>
            <span className="text-sm font-black text-white ml-auto">${ma20.toFixed(2)}</span>
          </div>
        )}
        {/* MA 60 */}
        {ma60 > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#8b5cf6]"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MA 60</span>
            <span className="text-sm font-black text-white ml-auto">${ma60.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 토글 스위치 (보유 종목만 보기, 1배수만 보기 공용)
// ---------------------------------------------------------------------------
interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: () => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ label, checked, onChange }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
      {label}
    </span>
    <button
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${
        checked
          ? 'bg-blue-500 shadow-lg shadow-blue-500/50'
          : 'bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// StockCard 하위 컴포넌트
// ---------------------------------------------------------------------------
const BOND_ETFS = ['STRC', 'SGOV', 'BIL', 'ICSH'] as const;

interface StockCardProps {
  ticker: string;
  data: StockData | undefined;
  isSelected: boolean;
  isLocked: boolean;
  isPaidOnly: boolean;
  lang: 'ko' | 'en';
  lockedTooltip: string;
  isTouch: boolean;
  onSelect: (ticker: string) => void;
  onLockedTouch: () => void;
}

const StockCard: React.FC<StockCardProps> = ({
  ticker, data, isSelected, isLocked, isPaidOnly, lang,
  lockedTooltip, isTouch, onSelect, onLockedTouch,
}) => {
  const rsiValue = data?.rsi || 50;
  const rsiBarValue = isLocked ? 0 : rsiValue;
  const price = data?.price || 0;
  const changePct = data?.changePercent || 0;
  const isPositive = changePct >= 0;
  const isBondEtf = (BOND_ETFS as readonly string[]).includes(ticker);
  const paidAccent = isPaidOnly && !isLocked;

  let baseRsiColor = 'text-blue-400';
  if (rsiValue > 70) {
    baseRsiColor = 'text-rose-500';
  } else if (rsiValue < 30) {
    baseRsiColor = 'text-emerald-500';
  }
  const rsiColor = isBondEtf ? 'text-slate-400' : baseRsiColor;
  let baseRsiBg = 'bg-blue-500';
  if (rsiValue > 70) {
    baseRsiBg = 'bg-rose-500';
  } else if (rsiValue < 30) {
    baseRsiBg = 'bg-emerald-500';
  }

  let rsiBg = baseRsiBg;
  if (isLocked) {
    rsiBg = 'bg-slate-500/30';
  } else if (isBondEtf) {
    rsiBg = 'bg-slate-500/50';
  }

  return (
    <button
      onClick={() => {
        if (isLocked) { if (isTouch) onLockedTouch(); return; }
        onSelect(ticker);
      }}
      className={`relative flex-shrink-0 w-48 bg-white light-card-depth dark:bg-[#080B15] p-6 rounded-[2rem] border transition-all duration-300 text-left group flex flex-col gap-5 snap-center ${
        isLocked
          ? 'border-slate-200 dark:border-white/5 opacity-55 grayscale cursor-not-allowed'
          : 'cursor-grab active:cursor-grabbing'
      } ${
        isSelected && !isLocked
          ? 'border-blue-500 ring-4 ring-blue-500/15 shadow-xl -translate-y-2'
          : 'border-slate-200 dark:border-white/5 shadow-md hover:border-slate-300 dark:hover:border-white/10'
      }`}
    >
      {/* Lock 배지 */}
      {isLocked && (
        <div className="absolute top-4 right-4">
          <HoverTip text={lockedTooltip}>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200/60 dark:bg-white/10 border border-slate-300/40 dark:border-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
              <Lock size={12} /><span>PRO+</span>
            </span>
          </HoverTip>
        </div>
      )}

      {/* 로고 + 티커 */}
      <div className="flex items-center gap-3">
        <div className={`transition-all ${isSelected ? 'scale-110' : 'opacity-80'}`}>
          <StockLogo ticker={ticker} size="md" shape="squircle" paidAccent={paidAccent} dimmed={isLocked} className="w-10 h-10 shadow-lg" />
        </div>
        <div className="flex flex-col">
          <span className={`font-black text-sm transition-colors ${isSelected && !isLocked ? 'text-blue-500' : 'text-slate-900 dark:text-white'}`}>
            {ticker}
          </span>
          {isLocked && (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">
              <Lock size={12} /> PRO/PREMIUM 전용
            </span>
          )}
        </div>
      </div>

      {/* 가격 */}
      <div className="space-y-4">
        <div>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-0.5">Price</span>
          {isLocked ? (
            <p className="text-lg font-black text-slate-400 dark:text-slate-600 tracking-tighter">—</p>
          ) : (
            <>
              <p className="text-lg font-black dark:text-white tracking-tighter">${price.toFixed(2)}</p>
              <p className={`text-[10px] font-black mt-1 flex items-center gap-1 uppercase ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {isPositive ? '+' : ''}{changePct.toFixed(2)}%
              </p>
            </>
          )}
        </div>

        {/* RSI */}
        <div className="pt-3 border-t border-slate-100 dark:border-white/5">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <span>RSI (14)</span>
              {isBondEtf && (
                <span
                  className="inline-flex items-center justify-center rounded-full bg-amber-500/10 border border-amber-400/40 px-1.5 py-0.5 text-[8px] font-bold text-amber-400"
                  title={lang === 'ko'
                    ? '해당 종목은 초단기/채권형 ETF로, 가격 변동폭이 작아 RSI 지표의 신뢰도가 낮을 수 있습니다.'
                    : 'This is a short-duration/bond ETF; very small price moves can make RSI less reliable.'
                  }
                >
                  ⚠︎ {lang === 'ko' ? '주의' : 'Info'}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {isLocked ? (
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-600">—</span>
              ) : (
                <span className={`text-[10px] font-black ${rsiColor}`}>{Math.round(rsiValue)}</span>
              )}
              {isBondEtf && (
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                  {lang === 'ko' ? '참고용' : 'Info Only'}
                </span>
              )}
            </div>
          </div>
          <div className="w-full h-1 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${rsiBg}`}
              style={{ width: `${Math.min(Math.max(rsiBarValue, 0), 100)}%` }}
            />
          </div>
        </div>
      </div>
    </button>
  );
};

interface MarketsProps {
  lang: 'ko' | 'en';
  portfolios?: Portfolio[];
  canAccessPaidStocks?: boolean;
  currentTier?: 'free' | 'pro' | 'premium'; // 티어 Prop 추가
}

const Markets: React.FC<MarketsProps> = ({
  lang,
  portfolios = [],
  canAccessPaidStocks = false,
  currentTier = 'free',
}) => {
  const [selectedStock, setSelectedStock] = useState('QQQ');
  const [stockData, setStockData] = useState<Record<string, StockData>>({});
  const [chartData, setChartData] = useState<Array<{ name: string; price: number; ma20: number; ma60: number; date: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showHoldingsOnly, setShowHoldingsOnly] = useState(false);
  const [show1xOnly, setShow1xOnly] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const t = I18N[lang];
  const commonCopy = getCommonMessages(lang);
  const dashboardCopy = getDashboardMessages(lang);
  const [proInfoOpen, setProInfoOpen] = useState(false);
  const { isInTossApp } = useTossApp();

  const lockedTooltip = dashboardCopy.paidTickerLockedTooltip;

  const isTouch = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      (window.matchMedia && window.matchMedia('(hover: none)').matches) ||
      (navigator && (navigator.maxTouchPoints || 0) > 0)
    );
  }, []);

  // 마켓 상태 계산
  const marketStatus = useMemo(() => getMarketStatus(lang), [lang]);

  // 보유 종목 계산 (활성 포트폴리오만)
  const holdingsSet = useMemo(() => {
    const activePortfolios = portfolios.filter(p => !p.isClosed);
    const holdings: Set<string> = new Set();
    
    activePortfolios.forEach(portfolio => {
      const portfolioHoldings = calculateHoldings(portfolio);
      portfolioHoldings.forEach(h => {
        if (h.quantity > 0) {
          holdings.add(h.stock);
        }
      });
    });
    
    return holdings;
  }, [portfolios]);

  // 필터링된 종목 리스트 (기본 리스트)
  const filteredStocks = useMemo(() => {
    let filtered = ALL_STOCKS;
    if (showHoldingsOnly) filtered = filtered.filter(ticker => holdingsSet.has(ticker));
    if (show1xOnly) filtered = filtered.filter(ticker => ONE_X_STOCKS.includes(ticker));
    return filtered;
  }, [showHoldingsOnly, show1xOnly, holdingsSet]);

  const loopEnabled = filteredStocks.length >= 2 && !showHoldingsOnly;
  const loopedStocks = useMemo(() => {
    if (!loopEnabled) return filteredStocks;
    return [...filteredStocks, ...filteredStocks, ...filteredStocks];
  }, [filteredStocks, loopEnabled]);

  const getCardStep = (): { step: number; startOffset: number } => {
    const el = scrollRef.current;
    if (!el) return { step: 200, startOffset: 0 };
    const children = el.children as unknown as HTMLElement[];
    const first = children?.[0];
    const second = children?.[1];
    if (!first) return { step: 200, startOffset: 0 };
    const startOffset = first.offsetLeft || 0;
    const step = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth || 200;
    return { step: step > 0 ? step : 200, startOffset };
  };

  // 무한 루프 초기 위치
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!loopEnabled) {
      el.scrollTo({ left: 0 });
      return;
    }
    const baseLen = filteredStocks.length;
    const raf = window.requestAnimationFrame(() => {
      const children = el.children as unknown as HTMLElement[];
      const target = children?.[baseLen];
      if (target) el.scrollLeft = target.offsetLeft;
    });
    return () => window.cancelAnimationFrame(raf);
  }, [loopEnabled, filteredStocks]);

  // 초기 주가 데이터 로드
  useEffect(() => {
    const loadStockData = async () => {
      setIsLoading(true);
      try {
        const symbolsToFetch = canAccessPaidStocks ? ALL_STOCKS : AVAILABLE_STOCKS;
        const data = await fetchStockPrices(symbolsToFetch);
        setStockData(data);
      } catch (error) {
        console.error('Error loading stock data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadStockData();
  }, [canAccessPaidStocks]);

  useEffect(() => {
    if (canAccessPaidStocks) return;
    if (PAID_STOCKS.includes(selectedStock)) {
      setSelectedStock('QQQ');
      setChartData([]);
    }
  }, [canAccessPaidStocks, selectedStock]);

  // 차트 데이터 로드
  useEffect(() => {
    const loadChartData = async () => {
      if (!selectedStock) return;
      if (!canAccessPaidStocks && PAID_STOCKS.includes(selectedStock)) return;
      try {
        const history = await fetchStockPriceHistory(selectedStock, 90);
        const formatted = history.map(item => {
          const date = new Date(item.date);
          return {
            name: date.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' }),
            date: item.date,
            price: item.price,
            ma20: item.ma20,
            ma60: item.ma60,
          };
        });
        setChartData(formatted);
      } catch (error) {
        console.error('Error loading chart data:', error);
        setChartData([]);
      }
    };
    loadChartData();
  }, [selectedStock, lang, canAccessPaidStocks]);

  const yAxisDomain = useMemo(() => {
    if (chartData.length === 0) return ['auto', 'auto'] as const;

    const allValues: number[] = [];
    for (const item of chartData) {
      if (item.price > 0) allValues.push(item.price);
      if (item.ma20 > 0) allValues.push(item.ma20);
      if (item.ma60 > 0) allValues.push(item.ma60);
    }
    if (allValues.length === 0) return ['auto', 'auto'] as const;

    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const padding = (dataMax - dataMin) * 0.1;
    return [dataMin - padding, dataMax + padding] as const;
  }, [chartData]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { step } = getCardStep();
      scrollRef.current.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' });
    }
  };

  const handleLoopScroll = () => {
    if (!loopEnabled) return;
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const baseLen = filteredStocks.length;
      if (baseLen < 2) return;

      const children = el.children as unknown as HTMLElement[];
      if (!children || children.length < baseLen * 3) return;

      const { step } = getCardStep();
      const middleStart = children?.[baseLen]?.offsetLeft ?? 0;
      const thirdStart = children?.[baseLen * 2]?.offsetLeft ?? 0;
      const thresholdLeft = step;
      const thresholdRight = step * 0.5;

      if (el.scrollLeft < middleStart - thresholdLeft) {
        el.scrollLeft += baseLen * step;
      } else if (el.scrollLeft >= thirdStart + thresholdRight) {
        el.scrollLeft -= baseLen * step;
      }
    });
  };

  const selectedStockData = stockData[selectedStock];
  const changePercent = selectedStockData?.changePercent || 0;
  const isPositiveChange = changePercent >= 0;
  const changeColor = isPositiveChange ? 'text-emerald-500' : 'text-rose-500';
  const changeBg = isPositiveChange ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20';

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/20">
              <Activity className="text-white" size={20} />
            </div>
            <h2 className="text-2xl font-black dark:text-white uppercase tracking-tight">{t.globalMarkets}</h2>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border flex items-center gap-1.5 ${
            marketStatus.isOpen 
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
              : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
          }`}>
            <Activity size={10} className={marketStatus.isOpen ? 'text-emerald-500' : 'text-slate-400'} />
            {marketStatus.message}
          </div>
        </div>

        <div className="bg-white light-card-depth dark:bg-[#080B15] p-8 rounded-[2.5rem] overflow-hidden h-96 border border-slate-200 dark:border-white/5 shadow-xl relative">
          <div className="flex justify-between items-start mb-8 relative z-10">
            <div>
              <h3 className="text-[10px] font-black text-slate-500 mb-1 uppercase tracking-[0.2em]">{selectedStock} Performance</h3>
              <p className="text-2xl font-black dark:text-white tracking-tighter">
                ${selectedStockData?.price?.toFixed(2) || '0.00'}
              </p>
            </div>
            {selectedStockData && (
              <div className={`${changeBg} px-4 py-1.5 rounded-full ${changeColor} text-[10px] font-black uppercase border flex items-center gap-1.5`}>
                {isPositiveChange ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}% Today
              </div>
            )}
          </div>
          
          <div className="absolute inset-x-0 bottom-0 h-64 opacity-50 pointer-events-none">
             <div className="absolute inset-0 bg-gradient-to-t from-blue-600/5 to-transparent"></div>
          </div>

          <ResponsiveContainer width="100%" height="70%" minHeight={200}>
            {chartData.length > 0 ? (
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" opacity={0.3} />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.floor(chartData.length / 6)}
                />
                <YAxis 
                  domain={yAxisDomain as [number | string, number | string]}
                  allowDataOverflow={true}
                  hide 
                />
                <Tooltip 
                  content={<CustomTooltip />}
                  cursor={{ stroke: '#2563eb', strokeWidth: 1, strokeDasharray: '5 5' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#2563eb" 
                  strokeWidth={4} 
                  fillOpacity={1} 
                  fill="url(#colorPrice)" 
                  animationDuration={1500}
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#2563eb' }}
                />
                {chartData[0]?.ma20 > 0 && (
                  <Line 
                    type="monotone" 
                    dataKey="ma20" 
                    stroke="#f59e0b" 
                    strokeWidth={2} 
                    dot={false}
                    strokeDasharray="5 5"
                  />
                )}
                {chartData[0]?.ma60 > 0 && (
                  <Line 
                    type="monotone" 
                    dataKey="ma60" 
                    stroke="#8b5cf6" 
                    strokeWidth={2} 
                    dot={false}
                    strokeDasharray="5 5"
                  />
                )}
              </ComposedChart>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm font-bold">
                {/* 🚀 번역 키 에러(I18N) 해결 부분 */}
                {isLoading 
                  ? (lang === 'ko' ? '차트 데이터 로딩 중...' : 'Loading chart data...') 
                  : (lang === 'ko' ? '차트 데이터 없음' : 'No chart data')}
              </div>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      {/* 🚀 2. 구형 광고 부착 로직(useEffect)은 삭제하고, 완벽한 스마트 배너 1줄로 교체! */}
      <TossInlineBanner currentTier={currentTier} isInTossApp={isInTossApp} variant="card" />

      <section className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="text-slate-500" size={16} />
              {/* 🚀 번역 키 에러(I18N) 해결 부분 */}
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                {lang === 'ko' ? '종목 정보' : 'Stock Info'}
              </h3>
            </div>
            <ToggleSwitch
              label={lang === 'ko' ? '보유 종목만 보기' : 'Holdings Only'}
              checked={showHoldingsOnly}
              onChange={() => setShowHoldingsOnly(!showHoldingsOnly)}
            />
            <ToggleSwitch
              label={lang === 'ko' ? '1배수만 보기' : '1x Only'}
              checked={show1xOnly}
              onChange={() => setShow1xOnly(!show1xOnly)}
            />
          </div>
          <div className="flex items-center gap-2.5">
            <button 
              onClick={() => scroll('left')}
              className="w-10 h-10 rounded-full glass border border-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
              aria-label={lang === 'ko' ? '왼쪽으로 스크롤' : 'Scroll left'}
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={() => scroll('right')}
              className="w-10 h-10 rounded-full glass border border-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
              aria-label={lang === 'ko' ? '오른쪽으로 스크롤' : 'Scroll right'}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        
        <div className="relative">
          <div 
            ref={scrollRef}
            onScroll={loopEnabled ? handleLoopScroll : undefined}
            className="flex gap-6 overflow-x-auto pb-8 pt-4 -mx-6 px-10 md:mx-0 md:px-4 scrollbar-hide snap-x snap-mandatory"
          >
            {filteredStocks.length === 0 ? (
              <div className="flex items-center justify-center w-full py-12 text-slate-400 text-sm font-bold">
                {/* 🚀 번역 키 에러(I18N) 해결 부분 */}
                {lang === 'ko' ? '보유 중인 종목이 없습니다.' : 'No holdings available.'}
              </div>
            ) : (
              loopedStocks.map((ticker, idx) => {
                const isPaidOnly = PAID_STOCKS.includes(ticker);
                return (
                  <StockCard
                    key={`${ticker}-${idx}`}
                    ticker={ticker}
                    data={stockData[ticker]}
                    isSelected={selectedStock === ticker}
                    isLocked={isPaidOnly && !canAccessPaidStocks}
                    isPaidOnly={isPaidOnly}
                    lang={lang}
                    lockedTooltip={lockedTooltip}
                    isTouch={isTouch}
                    onSelect={setSelectedStock}
                    onLockedTouch={() => setProInfoOpen(true)}
                  />
                );
              })
            )}
          </div>
        </div>
      </section>

      <InfoModal
        open={proInfoOpen}
        badgeLabel={commonCopy.notice}
        title={dashboardCopy.paidTickerNoticeTitle}
        message={lockedTooltip}
        closeAriaLabel={commonCopy.closeDialog}
        confirmLabel={commonCopy.acknowledge}
        onClose={() => setProInfoOpen(false)}
      />
    </div>
  );
};

export default Markets;
```

### `constants/messages/dashboardMessages.ts`

```ts
import type { AppLang } from '@/types';

export type DashboardStrategyKind =
  | 'vr_band'
  | 'multi_split'
  | 'no_stop_multi_split'
  | 'ma_interval';

export interface DashboardMessageSet {
  emptyPortfolio: string;
  valuationLabel: string;
  realizedProfitLabel: string;
  realizedProfitAfterFees: string;
  paidTickerNoticeTitle: string;
  paidTickerLockedTooltip: string;
  aiTradeRecognitionAria: string;
  quickInputAria: string;
  cycleHeaderTitle: string;
  openAlarmSettingsAria: string;
  openDetailsAria: (portfolioName: string) => string;
  openExecutionAria: (portfolioName: string) => string;
  terminate: string;
  strategyName: Record<DashboardStrategyKind, string>;
  execution: {
    calculating: string;
    noHoldings: string;
    insufficientAmount: string;
    checkingSection: string;
    mocSellLabel: string;
    sharesUnit: string;
    startQuarterStopLoss: string;
    firstBuyAmountLabel: string;
    avgPriceTimesPointNineMinusOffset: string;
    avgPriceTimesPointNine: string;
    locBuy1: string;
    locBuy2: string;
    locSell: string;
    limitSell: string;
    section: string;
    buy: string;
    sectionWatchBothNotMet: string;
    sectionWatchAlignmentNotMet: string;
    sectionWatchRsiNotMet: string;
    sectionPartialProfit: string;
    strategyPreparing: string;
    noStopSplitComplete: string;
    noStopTakeProfitTarget: string;
    lowLoc: string;
    highLoc: string;
  };
}

export const DASHBOARD_MESSAGES: Record<AppLang, DashboardMessageSet> = {
  ko: {
    emptyPortfolio: '포트폴리오가 없습니다. 포트폴리오를 추가해주세요.',
    valuationLabel: '평가금액',
    realizedProfitLabel: '실현손익',
    realizedProfitAfterFees: '(제비용 반영)',
    paidTickerNoticeTitle: 'PRO/PREMIUM 전용',
    paidTickerLockedTooltip: 'PRO/PREMIUM 전용 종목입니다.',
    aiTradeRecognitionAria: 'AI 매매 인식',
    quickInputAria: '퀵 입력',
    cycleHeaderTitle: '현재 리밸런싱 사이클 기간',
    openAlarmSettingsAria: '알람 설정 열기',
    openDetailsAria: (portfolioName: string) =>
      `${portfolioName} 상세 보기 열기`,
    openExecutionAria: (portfolioName: string) =>
      `${portfolioName} 일별 매매 실행 열기`,
    terminate: '전략 종료하기',
    strategyName: {
      vr_band: '타겟 밸류 채널',
      multi_split: '다분할 매매법',
      no_stop_multi_split: '다분할 매매법(무손절)',
      ma_interval: '이평선 구간매수',
    },
    execution: {
      calculating: '계산 중...',
      noHoldings: '보유 없음',
      insufficientAmount:
        '알림: 1회 매수금이 부족하여 주문을 생성할 수 없습니다. 설정을 확인해 주세요.',
      checkingSection: '구간 확인 중…',
      mocSellLabel: 'MOC 매도',
      sharesUnit: '주',
      startQuarterStopLoss: 'MOC 매도 하여 쿼터 손절 모드 시작하세요',
      firstBuyAmountLabel: '1회 매수금',
      avgPriceTimesPointNineMinusOffset: '현재 평균 단가 × 0.9 - 0.01',
      avgPriceTimesPointNine: '현재 평균 단가 × 0.9',
      locBuy1: 'LOC 매수1',
      locBuy2: 'LOC 매수2',
      locSell: 'LOC 매도',
      limitSell: '지정가 매도',
      section: '구간',
      buy: '매수',
      sectionWatchBothNotMet: '관망 (정배열 미충족, RSI 조건 미충족)',
      sectionWatchAlignmentNotMet: '관망 (정배열 미충족)',
      sectionWatchRsiNotMet: '관망 (RSI 조건 미충족)',
      sectionPartialProfit: '중간익절',
      strategyPreparing: '전략 준비 중',
      noStopSplitComplete:
        '분할 매수가 모두 완료되었습니다. 추가 매수 없이 보유(존버)와 익절만 수행합니다.',
      noStopTakeProfitTarget: '익절 목표',
      lowLoc: '저가 LOC',
      highLoc: '고가 LOC',
    },
  },
  en: {
    emptyPortfolio: 'No portfolios. Please add a portfolio.',
    valuationLabel: 'Valuation',
    realizedProfitLabel: 'Realized P/L',
    realizedProfitAfterFees: '(After fees)',
    paidTickerNoticeTitle: 'PRO/PREMIUM Only',
    paidTickerLockedTooltip: 'This ticker is PRO/PREMIUM only.',
    aiTradeRecognitionAria: 'AI Trade Recognition',
    quickInputAria: 'Quick input',
    cycleHeaderTitle: 'Current rebalancing cycle',
    openAlarmSettingsAria: 'Open alarm settings',
    openDetailsAria: (portfolioName: string) =>
      `Open details for ${portfolioName}`,
    openExecutionAria: (portfolioName: string) =>
      `Open daily execution for ${portfolioName}`,
    terminate: 'TERMINATE STRATEGY',
    strategyName: {
      vr_band: 'Target Value Channel',
      multi_split: 'Multi-Split Trading',
      no_stop_multi_split: 'No-Stop Multi-Split',
      ma_interval: 'MA Interval Buying',
    },
    execution: {
      calculating: 'Calculating...',
      noHoldings: 'No holdings',
      insufficientAmount:
        'Notice: 1st buy amount is too low to place orders. Please check your settings.',
      checkingSection: 'Checking section…',
      mocSellLabel: 'MOC Sell',
      sharesUnit: 'shares',
      startQuarterStopLoss:
        'Start quarter stop-loss mode by executing MOC sell',
      firstBuyAmountLabel: '1st Buy Amount',
      avgPriceTimesPointNineMinusOffset: 'Avg Price × 0.9 - 0.01',
      avgPriceTimesPointNine: 'Avg Price × 0.9',
      locBuy1: 'LOC Buy 1',
      locBuy2: 'LOC Buy 2',
      locSell: 'LOC Sell',
      limitSell: 'Limit Sell',
      section: 'Section',
      buy: 'Buy',
      sectionWatchBothNotMet: 'Watch (alignment not met, RSI not met)',
      sectionWatchAlignmentNotMet: 'Watch (alignment not met)',
      sectionWatchRsiNotMet: 'Watch (RSI not met)',
      sectionPartialProfit: 'Partial profit',
      strategyPreparing: 'Strategy preparing',
      noStopSplitComplete:
        'All split buys are complete. Hold and wait for take profit without additional buys.',
      noStopTakeProfitTarget: 'Take-profit target',
      lowLoc: 'Low LOC',
      highLoc: 'High LOC',
    },
  },
};

export function getDashboardMessages(lang: AppLang): DashboardMessageSet {
  return DASHBOARD_MESSAGES[lang];
}
```

### `constants/messages/authMessages.ts`

```ts
import type { AppLang } from '@/types';

export type AuthModalType =
  | 'login'
  | 'signup'
  | 'profile'
  | 'reset-password'
  | 'change-password';

export type AuthProvider = 'google' | 'github' | 'kakao';

export interface AuthModalMessageSet {
  title: Record<AuthModalType, string>;
  action: {
    processing: string;
    acknowledge: string;
    login: string;
    signup: string;
    changePassword: string;
    resetPassword: string;
    logout: string;
    connectTelegram: string;
    upgradeMembership: string;
    deleteAccount: string;
    cancelDelete: string;
    deleteForever: string;
    openInTelegram: string;
  };
  field: {
    emailLabel: string;
    passwordLabel: string;
    currentPasswordLabel: string;
    newPasswordLabel: string;
    confirmPasswordLabel: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    deleteConfirmPlaceholder: string;
  };
  helper: {
    forgotPassword: string;
    continueWithSocial: string;
    loginInstead: string;
    signupInstead: string;
    requiredAgreementTitle: string;
    requiredBadge: string;
    agreeSuffix: string;
    termsLabel: string;
    privacyLabel: string;
    signedInSuccessTitle: string;
    signedInSuccessBody: string;
    passwordChangedTitle: string;
    passwordChangedBody: string;
    passwordChangedReloginTitle: string;
    passwordChangedReloginBody: string;
    accountDeletedTitle: string;
    accountDeletedBody: string;
  };
  profile: {
    accountConnected: string;
    unknownEmail: string;
    telegramSectionTitle: string;
    telegramConnected: string;
    telegramLinkInstruction: string;
    telegramTokenCreateFailed: string;
    reopenProfileHint: string;
    paidOnly: string;
    deleteWarning: string;
    deleteInstruction: string;
    logoutFailed: string;
    deleteAccountFailed: string;
    telegramAlertsAriaLabel: string;
  };
  validation: {
    missingEmailOrPassword: string;
    missingPasswordFields: string;
    missingCurrentUserEmail: string;
    resetPasswordNeedsEmail: string;
    passwordMismatch: string;
    mustAgreeRequiredPolicies: string;
    currentPasswordIncorrect: string;
    alreadyRegistered: string;
    invalidEmail: string;
    weakPassword: string;
    emailRateLimit: string;
    authenticationFailed: string;
    signupFailed: string;
    passwordUpdateFailed: string;
    resetPasswordFailed: string;
    resetPasswordSent: string;
    emailVerificationSent: string;
  };
  passwordRule: {
    minLength: string;
    uppercase: string;
    lowercase: string;
    number: string;
    special: string;
  };
  social: {
    google: string;
    github: string;
    kakao: string;
    oauthFailed: (providerLabel: string, reason: string) => string;
  };
  exitDialog: {
    authCloseTitle: string;
    authCloseBody: string;
    authCloseConfirm: string;
  };
  a11y: {
    closeModal: string;
  };
}

export const AUTH_MODAL_MESSAGES: Record<AppLang, AuthModalMessageSet> = {
  ko: {
    title: {
      login: '로그인',
      signup: '회원가입',
      profile: '사용자 프로필',
      'reset-password': '비밀번호 재설정',
      'change-password': '비밀번호 변경',
    },
    action: {
      processing: '처리 중...',
      acknowledge: '확인',
      login: '로그인',
      signup: '회원가입',
      changePassword: '비밀번호 업데이트',
      resetPassword: '비밀번호 변경',
      logout: '로그아웃',
      connectTelegram: '텔레그램 연결',
      upgradeMembership: '멤버십 업그레이드',
      deleteAccount: '회원 탈퇴',
      cancelDelete: '취소',
      deleteForever: '영구 삭제',
      openInTelegram: '텔레그램에서 열기',
    },
    field: {
      emailLabel: '이메일',
      passwordLabel: '비밀번호',
      currentPasswordLabel: '현재 비밀번호',
      newPasswordLabel: '새 비밀번호',
      confirmPasswordLabel: '비밀번호 확인',
      emailPlaceholder: 'name@example.com',
      passwordPlaceholder: '••••••••',
      deleteConfirmPlaceholder: 'DELETE',
    },
    helper: {
      forgotPassword: '비밀번호를 잊으셨나요? 재설정 메일 보내기',
      continueWithSocial: '또는 소셜 계정으로 로그인',
      loginInstead: '이미 계정이 있으신가요? 로그인',
      signupInstead: '계정이 없으신가요? 회원가입',
      requiredAgreementTitle: '필수 동의',
      requiredBadge: '필수',
      agreeSuffix: '에 동의합니다',
      termsLabel: '이용약관',
      privacyLabel: '개인정보 처리방침',
      signedInSuccessTitle: '로그인 완료',
      signedInSuccessBody: '로그인이 완료되었습니다. 프로필 화면으로 이동합니다.',
      passwordChangedTitle: '비밀번호 변경 완료',
      passwordChangedBody: '비밀번호가 성공적으로 변경되었습니다.',
      passwordChangedReloginTitle: '비밀번호 재설정 완료',
      passwordChangedReloginBody: '새 비밀번호가 적용되었습니다. 다시 로그인해주세요.',
      accountDeletedTitle: '회원 탈퇴 완료',
      accountDeletedBody: '계정이 삭제되었습니다.',
    },
    profile: {
      accountConnected: '연결된 계정',
      unknownEmail: '알 수 없는 이메일',
      telegramSectionTitle: '텔레그램 연동',
      telegramConnected: '텔레그램 연결됨',
      telegramLinkInstruction:
        '아래 명령어를 텔레그램 봇에 전송해 연결을 완료하세요.',
      telegramTokenCreateFailed: '텔레그램 연결 토큰 생성에 실패했습니다.',
      reopenProfileHint: '연결 후 프로필을 다시 열어 상태를 확인하세요.',
      paidOnly: '유료 멤버십에서만 사용할 수 있습니다.',
      deleteWarning: '회원 탈퇴 후 데이터는 복구할 수 없습니다.',
      deleteInstruction: '확인을 위해 DELETE 를 입력해주세요.',
      logoutFailed: '로그아웃에 실패했습니다.',
      deleteAccountFailed: '회원 탈퇴에 실패했습니다.',
      telegramAlertsAriaLabel: '텔레그램 알림 토글',
    },
    validation: {
      missingEmailOrPassword: '이메일과 비밀번호를 모두 입력해주세요.',
      missingPasswordFields: '모든 비밀번호 입력란을 채워주세요.',
      missingCurrentUserEmail:
        '이메일 정보를 불러오지 못했습니다. 다시 로그인 후 시도해주세요.',
      resetPasswordNeedsEmail: '비밀번호 재설정을 위해 이메일을 입력해주세요.',
      passwordMismatch: '비밀번호가 일치하지 않습니다.',
      mustAgreeRequiredPolicies:
        '이용약관과 개인정보 처리방침에 동의해야 합니다.',
      currentPasswordIncorrect: '현재 비밀번호가 올바르지 않습니다.',
      alreadyRegistered: '이미 가입된 이메일입니다.',
      invalidEmail: '유효하지 않은 이메일 주소입니다.',
      weakPassword: '비밀번호가 너무 짧거나 약합니다.',
      emailRateLimit:
        '이메일 전송 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
      authenticationFailed: '인증 중 오류가 발생했습니다.',
      signupFailed: '회원가입에 실패했습니다.',
      passwordUpdateFailed: '비밀번호 변경에 실패했습니다.',
      resetPasswordFailed: '비밀번호 재설정 메일 전송에 실패했습니다.',
      resetPasswordSent:
        '비밀번호 재설정 메일을 전송했습니다. 이메일을 확인해주세요.',
      emailVerificationSent:
        '회원가입이 완료되었습니다. 이메일을 확인하여 계정을 인증해주세요.',
    },
    passwordRule: {
      minLength: '비밀번호는 최소 8자 이상이어야 합니다.',
      uppercase: '대문자를 1개 이상 포함해야 합니다.',
      lowercase: '소문자를 1개 이상 포함해야 합니다.',
      number: '숫자를 1개 이상 포함해야 합니다.',
      special: '특수문자를 1개 이상 포함해야 합니다.',
    },
    social: {
      google: 'Google',
      github: 'GitHub',
      kakao: '카카오',
      oauthFailed: (providerLabel, reason) =>
        `${providerLabel} 로그인에 실패했습니다: ${reason}`,
    },
    exitDialog: {
      authCloseTitle: '인증을 종료할까요?',
      authCloseBody: '로그인을 마치지 않고 인증 창을 닫습니다.',
      authCloseConfirm: '종료하기',
    },
    a11y: {
      closeModal: '닫기',
    },
  },
  en: {
    title: {
      login: 'Login',
      signup: 'Sign Up',
      profile: 'User Profile',
      'reset-password': 'Reset Password',
      'change-password': 'Change Password',
    },
    action: {
      processing: 'Working...',
      acknowledge: 'OK',
      login: 'Login',
      signup: 'Sign Up',
      changePassword: 'Update Password',
      resetPassword: 'Update Password',
      logout: 'Logout',
      connectTelegram: 'Connect Telegram',
      upgradeMembership: 'Upgrade Membership',
      deleteAccount: 'Delete Account',
      cancelDelete: 'Cancel',
      deleteForever: 'Delete Forever',
      openInTelegram: 'Open in Telegram',
    },
    field: {
      emailLabel: 'Email',
      passwordLabel: 'Password',
      currentPasswordLabel: 'Current Password',
      newPasswordLabel: 'New Password',
      confirmPasswordLabel: 'Confirm Password',
      emailPlaceholder: 'name@example.com',
      passwordPlaceholder: '••••••••',
      deleteConfirmPlaceholder: 'DELETE',
    },
    helper: {
      forgotPassword: 'Forgot password? Send reset email',
      continueWithSocial: 'Or continue with',
      loginInstead: 'Already have an account? Login',
      signupInstead: "Don't have an account? Sign up",
      requiredAgreementTitle: 'Required Agreements',
      requiredBadge: 'Required',
      agreeSuffix: ' - I agree',
      termsLabel: 'Terms of Service',
      privacyLabel: 'Privacy Policy',
      signedInSuccessTitle: 'Signed In',
      signedInSuccessBody:
        'You are signed in successfully. Moving to your profile.',
      passwordChangedTitle: 'Password Updated',
      passwordChangedBody: 'Your password has been changed successfully.',
      passwordChangedReloginTitle: 'Password Reset Complete',
      passwordChangedReloginBody:
        'Your new password is active now. Please sign in again.',
      accountDeletedTitle: 'Account Deleted',
      accountDeletedBody: 'Your account has been deleted.',
    },
    profile: {
      accountConnected: 'Connected Account',
      unknownEmail: 'Unknown email',
      telegramSectionTitle: 'Telegram',
      telegramConnected: 'Telegram connected',
      telegramLinkInstruction:
        'Send the command below to the Telegram bot to complete the connection.',
      telegramTokenCreateFailed: 'Failed to create Telegram link token.',
      reopenProfileHint:
        'Reopen the profile modal after linking to refresh state.',
      paidOnly: 'This feature is available for paid members only.',
      deleteWarning: 'Your data cannot be restored after account deletion.',
      deleteInstruction: 'Type DELETE to confirm.',
      logoutFailed: 'Failed to log out.',
      deleteAccountFailed: 'Failed to delete account.',
      telegramAlertsAriaLabel: 'Telegram alerts toggle',
    },
    validation: {
      missingEmailOrPassword: 'Please enter both email and password.',
      missingPasswordFields: 'Please fill in all password fields.',
      missingCurrentUserEmail:
        'Email is not available. Please log in again and retry.',
      resetPasswordNeedsEmail:
        'Please enter your email to reset password.',
      passwordMismatch: 'Passwords do not match.',
      mustAgreeRequiredPolicies:
        'You must agree to the Terms of Service and Privacy Policy.',
      currentPasswordIncorrect: 'Current password is incorrect.',
      alreadyRegistered: 'This email is already registered.',
      invalidEmail: 'Invalid email address.',
      weakPassword: 'Password is too short or weak.',
      emailRateLimit:
        'Email rate limit exceeded. Please try again later.',
      authenticationFailed: 'Authentication error occurred.',
      signupFailed: 'Sign up failed.',
      passwordUpdateFailed: 'Failed to update password.',
      resetPasswordFailed: 'Failed to send reset password email.',
      resetPasswordSent:
        'Password reset email sent. Please check your inbox.',
      emailVerificationSent:
        'Sign up successful. Please verify your email account.',
    },
    passwordRule: {
      minLength: 'Password must be at least 8 characters.',
      uppercase: 'Must include at least 1 uppercase letter.',
      lowercase: 'Must include at least 1 lowercase letter.',
      number: 'Must include at least 1 number.',
      special: 'Must include at least 1 special character.',
    },
    social: {
      google: 'Google',
      github: 'GitHub',
      kakao: 'Kakao',
      oauthFailed: (providerLabel, reason) =>
        `${providerLabel} login failed: ${reason}`,
    },
    exitDialog: {
      authCloseTitle: 'Close authentication?',
      authCloseBody:
        'You are leaving the authentication flow before completion.',
      authCloseConfirm: 'Close',
    },
    a11y: {
      closeModal: 'Close modal',
    },
  },
};

export function getAuthModalMessages(lang: AppLang): AuthModalMessageSet {
  return AUTH_MODAL_MESSAGES[lang];
}
```

### `constants/messages/tradeMessages.ts`

```ts
import type { AppLang } from '@/types';

export interface TradeMessageSet {
  title: {
    tradeExecution: string;
    quickInput: string;
  };
  action: {
    buy: string;
    sell: string;
    save: string;
    cancel: string;
    close: string;
  };
  field: {
    stock: string;
    buyDate: string;
    sellDate: string;
    executionPrice: string;
    quantity: string;
    autoQuantity: string;
    estimatedFee: string;
    finalFee: string;
    totalSettlement: string;
  };
  helper: {
    chooseStockFirst: string;
    invalidPrice: string;
    invalidQuantity: string;
    noHoldings: string;
    zeroQuantityBudgetLocked: string;
    confirmBeforeSave: string;
    activeSectionAutoSelect: string;
    holdingsSellOnly: string;
    feeRateApplied: (feeRatePercent: number) => string;
    latestTradeDateSummary: (formattedDate: string) => string;
    budgetExceededTitle: string;
    budgetExceededDetail: (budgetText: string, settlementText: string) => string;
    mocSellTitle: string;
    mocSellDescription: string;
    manualFeeOverrideHint: string;
    executingTrade: string;
    noStopGuideTitle: string;
    noStopFirstBuyHint: string;
    noStopGuaranteedDailyFill: string;
    noStopSplitComplete: string;
    noStopTakeProfitTarget: (takeProfitPct: number) => string;
    lowLoc: string;
    highLoc: string;
    sharesUnit: string;
  };
  aria: {
    closeModal: string;
    closeBackdrop: string;
    openCalendar: string;
    previousMonth: string;
    nextMonth: string;
  };
  calendar: {
    weekdays: string[];
  };
}

export const TRADE_MESSAGES: Record<AppLang, TradeMessageSet> = {
  ko: {
    title: {
      tradeExecution: '상세 매매 실행 기록',
      quickInput: '빠른 매매 입력',
    },
    action: {
      buy: '매수',
      sell: '매도',
      save: '저장하기',
      cancel: '취소',
      close: '닫기',
    },
    field: {
      stock: '종목',
      buyDate: '매수일',
      sellDate: '매도일',
      executionPrice: '체결 단가',
      quantity: '수량',
      autoQuantity: '자동 계산 수량',
      estimatedFee: '예상 수수료',
      finalFee: '최종 반영 수수료',
      totalSettlement: '최종 정산 금액',
    },
    helper: {
      chooseStockFirst: '먼저 종목을 선택해주세요.',
      invalidPrice: '체결 단가는 0보다 커야 합니다.',
      invalidQuantity: '수량은 0보다 커야 합니다.',
      noHoldings: '매도 가능한 보유 종목이 없습니다.',
      zeroQuantityBudgetLocked:
        '현재 예산과 수수료율 기준으로 계산된 매수 수량이 0주입니다. 체결 단가를 낮추거나 수량을 직접 입력할 수 있는 모드로 전환해주세요.',
      confirmBeforeSave: '체결 내용을 확인한 뒤 저장해주세요.',
      activeSectionAutoSelect: '현재 활성 구간 종목을 자동 선택합니다.',
      holdingsSellOnly: '매도는 실제 보유 수량 범위 안에서만 진행합니다.',
      feeRateApplied: (feeRatePercent) => `수수료율 ${feeRatePercent}% 적용`,
      latestTradeDateSummary: (formattedDate) =>
        `${formattedDate} 기준 매매 내역 입력입니다.`,
      budgetExceededTitle: '예산 초과 경고',
      budgetExceededDetail: (budgetText, settlementText) =>
        `예상 정산 금액 ${settlementText} 이(가) 일일 예산 ${budgetText} 을 초과합니다. 저장은 막지 않지만, 사용자가 확인하고 진행해야 합니다.`,
      mocSellTitle: 'MOC 매도',
      mocSellDescription:
        '쿼터 손절 모드를 시작하는 보유량 25% 종가 매도입니다.',
      manualFeeOverrideHint:
        '직접 수수료를 입력하면 자동 계산값 대신 그 값을 저장합니다.',
      executingTrade: '체결 저장 중...',
      noStopGuideTitle: '전략 실행 가이드',
      noStopFirstBuyHint:
        '무손절 전략의 첫 매수는 장중 언제든 입력할 수 있습니다.',
      noStopGuaranteedDailyFill:
        '고가 LOC는 해당 거래일 내 체결 보장이 전제됩니다.',
      noStopSplitComplete:
        '모든 분할 매수가 완료되었습니다. 추가 매수 없이 익절 가격만 기다립니다.',
      noStopTakeProfitTarget: (takeProfitPct) =>
        `평단 대비 +${takeProfitPct}% 전량 지정가 매도`,
      lowLoc: '저가 LOC',
      highLoc: '고가 LOC',
      sharesUnit: '주',
    },
    aria: {
      closeModal: '매매 입력 모달 닫기',
      closeBackdrop: '매매 입력 모달 배경 닫기',
      openCalendar: '달력 열기',
      previousMonth: '이전 달',
      nextMonth: '다음 달',
    },
    calendar: {
      weekdays: ['일', '월', '화', '수', '목', '금', '토'],
    },
  },
  en: {
    title: {
      tradeExecution: 'Trade Execution Record',
      quickInput: 'Quick Input',
    },
    action: {
      buy: 'Buy',
      sell: 'Sell',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
    },
    field: {
      stock: 'Ticker',
      buyDate: 'Buy Date',
      sellDate: 'Sell Date',
      executionPrice: 'Execution Price',
      quantity: 'Quantity',
      autoQuantity: 'Calculated Quantity',
      estimatedFee: 'Estimated Fee',
      finalFee: 'Final Fee',
      totalSettlement: 'Total Settlement',
    },
    helper: {
      chooseStockFirst: 'Select a ticker first.',
      invalidPrice: 'Execution price must be greater than zero.',
      invalidQuantity: 'Quantity must be greater than zero.',
      noHoldings: 'There are no holdings available to sell.',
      zeroQuantityBudgetLocked:
        'The calculated buy quantity is 0 shares for the current budget and fee rate. Lower the execution price or switch to a mode with manual quantity input.',
      confirmBeforeSave: 'Review the execution details before saving.',
      activeSectionAutoSelect:
        'The active section ticker is selected automatically.',
      holdingsSellOnly:
        'Sell orders are constrained to actual current holdings only.',
      feeRateApplied: (feeRatePercent) =>
        `${feeRatePercent}% fee rate applied`,
      latestTradeDateSummary: (formattedDate) =>
        `Entering trade data for ${formattedDate}.`,
      budgetExceededTitle: 'Budget Warning',
      budgetExceededDetail: (budgetText, settlementText) =>
        `Estimated settlement ${settlementText} exceeds the daily budget ${budgetText}. Saving remains non-blocking, but the user must acknowledge the risk.`,
      mocSellTitle: 'MOC Sell',
      mocSellDescription:
        'Closes 25% of current holdings at the market close to start quarter stop-loss mode.',
      manualFeeOverrideHint:
        'If you enter a manual fee, it overrides the calculated fee.',
      executingTrade: 'Saving trade...',
      noStopGuideTitle: 'Strategy Execution Guide',
      noStopFirstBuyHint:
        'For the first no-stop trade, users may buy anytime during market hours.',
      noStopGuaranteedDailyFill:
        'High LOC assumes same-day execution certainty.',
      noStopSplitComplete:
        'All split buys are complete. Hold the position and wait for take profit only.',
      noStopTakeProfitTarget: (takeProfitPct) =>
        `Full limit sell at avg price +${takeProfitPct}%`,
      lowLoc: 'Low LOC',
      highLoc: 'High LOC',
      sharesUnit: ' shares',
    },
    aria: {
      closeModal: 'Close trade modal',
      closeBackdrop: 'Close trade modal backdrop',
      openCalendar: 'Open calendar',
      previousMonth: 'Previous month',
      nextMonth: 'Next month',
    },
    calendar: {
      weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    },
  },
};

export function getTradeMessages(lang: AppLang): TradeMessageSet {
  return TRADE_MESSAGES[lang];
}
```

### `constants/messages/strategyCreatorMessages.ts`

```ts
import type { AppLang } from '@/types';

export interface StrategyCreatorMessageSet {
  titles: {
    strategySelect: string;
    maBase: string;
    maSections: string;
    multiSplitConfig: string;
    noStopMultiSplitConfig: string;
    vrBandConfig: string;
    strategyMeta: string;
  };
  actions: {
    cancel: string;
    back: string;
    next: string;
    save: string;
    startStrategy: string;
  };
  strategySelection: {
    heading: string;
    description: string;
  };
  strategyDefinitions: {
    rsi_ma_interval: { title: string; description: string };
    multi_split: { title: string; description: string };
    no_stop_multi_split: { title: string; description: string };
    vr_band: { title: string; description: string };
  };
  tierLabels: {
    FREE: string;
    PRO: string;
    PREMIUM: string;
  };
  stockPickerHeader: string;
  lockedTickerTooltip: string;
  duplicateSectionStockTooltip: string;
  portfolioLimitReached: (maxPortfolios: number) => string;
  duplicateSectionStocks: string;
  ma: {
    referenceStock: string;
    shortPeriod: string;
    longPeriod: string;
    rsiEnabled: string;
    alignmentEnabled: string;
    section1Title: string;
    section2Title: string;
    section3Title: string;
    sectionStock: string;
    rsiThreshold: string;
    takePartialProfit: string;
    partialProfitTargetPct: string;
  };
  multiSplit: {
    targetStock: string;
    targetReturnRate: string;
    totalSplitCount: string;
    leveragedRecommended: string;
  };
  noStopMultiSplit: {
    targetStock: string;
    lowLocBudgetRatio: string;
    highLocPremiumPct: string;
    takeProfitPct: string;
    totalSplitCount: string;
  };
  meta: {
    portfolioName: string;
    dailyBuyAmount: string;
    startDate: string;
    feeRatePercent: string;
  };
}

export const STRATEGY_CREATOR_MESSAGES: Record<AppLang, StrategyCreatorMessageSet> = {
  ko: {
    titles: {
      strategySelect: '전략 엔진 선택',
      maBase: '이평선 기본 설정',
      maSections: '구간별 진입 설정',
      multiSplitConfig: '다분할 매매법 설정',
      noStopMultiSplitConfig: '무손절 다분할 설정',
      vrBandConfig: 'VR 밴드 설정',
      strategyMeta: '포트폴리오 메타 정보',
    },
    actions: {
      cancel: '취소',
      back: '이전',
      next: '다음',
      save: '저장',
      startStrategy: '전략 시작',
    },
    strategySelection: {
      heading: '전략 엔진 선택',
      description: '사용할 전략을 선택하세요.',
    },
    strategyDefinitions: {
      rsi_ma_interval: {
        title: '이평선 구간 전략',
        description: '구간별 종목과 RSI/부분익절 규칙을 설정합니다.',
      },
      multi_split: {
        title: '다분할 매매법',
        description: '목표 수익률과 총 분할 횟수로 자동 주문 구조를 만듭니다.',
      },
      no_stop_multi_split: {
        title: '무손절 다분할',
        description: 'LOC 예산 배분과 프리미엄 규칙을 사용합니다.',
      },
      vr_band: {
        title: '타겟 밸류 채널',
        description: 'V 채널과 Pool 사용률을 기반으로 자동 비중 조절을 합니다.',
      },
    },
    tierLabels: {
      FREE: 'FREE',
      PRO: 'PRO',
      PREMIUM: 'PREMIUM',
    },
    stockPickerHeader: '종목 선택',
    lockedTickerTooltip: 'PRO/PREMIUM 전용 종목입니다.',
    duplicateSectionStockTooltip: '다른 구간에서 이미 선택된 종목입니다.',
    portfolioLimitReached: (maxPortfolios) =>
      `포트폴리오 생성 한도(${maxPortfolios}개)에 도달했습니다.`,
    duplicateSectionStocks: '구간 1, 2, 3에서 서로 다른 종목을 선택해 주세요.',
    ma: {
      referenceStock: '기준 종목',
      shortPeriod: '단기 이평 기간',
      longPeriod: '장기 이평 기간',
      rsiEnabled: 'RSI 조건 사용',
      alignmentEnabled: '정배열 매수 사용',
      section1Title: '구간 1',
      section2Title: '구간 2',
      section3Title: '구간 3',
      sectionStock: '매수 종목',
      rsiThreshold: 'RSI 기준값',
      takePartialProfit: '중간 이익 실현',
      partialProfitTargetPct: '목표 수익률 (%)',
    },
    multiSplit: {
      targetStock: '대상 종목',
      targetReturnRate: '목표 수익률 (A %)',
      totalSplitCount: '총 분할 횟수 (a회)',
      leveragedRecommended: '레버리지 ETF 권장',
    },
    noStopMultiSplit: {
      targetStock: '대상 종목',
      lowLocBudgetRatio: '저가 LOC 예산 비율 (%)',
      highLocPremiumPct: '고가 LOC 프리미엄 (%)',
      takeProfitPct: '익절 목표 수익률 (%)',
      totalSplitCount: '총 분할 횟수',
    },
    meta: {
      portfolioName: '포트폴리오 이름',
      dailyBuyAmount: '1회 매수 금액 ($)',
      startDate: '시작일',
      feeRatePercent: '수수료율 (%)',
    },
  },
  en: {
    titles: {
      strategySelect: 'Select Strategy Engine',
      maBase: 'Moving Average Base Settings',
      maSections: 'Section Entry Settings',
      multiSplitConfig: 'Multi-Split Settings',
      noStopMultiSplitConfig: 'No-Stop Multi-Split Settings',
      vrBandConfig: 'VR Band Settings',
      strategyMeta: 'Portfolio Meta Information',
    },
    actions: {
      cancel: 'Cancel',
      back: 'Back',
      next: 'Next',
      save: 'Save',
      startStrategy: 'Start Strategy',
    },
    strategySelection: {
      heading: 'Select Strategy Engine',
      description: 'Choose the strategy you want to use.',
    },
    strategyDefinitions: {
      rsi_ma_interval: {
        title: 'MA Interval Strategy',
        description: 'Configure section stocks, RSI, and partial profit rules.',
      },
      multi_split: {
        title: 'Multi-Split',
        description: 'Generate an order structure from target return and split count.',
      },
      no_stop_multi_split: {
        title: 'No-Stop Multi-Split',
        description: 'Use LOC budget ratio and premium rules.',
      },
      vr_band: {
        title: 'Target Value Channel',
        description: 'Automatically rebalance using channel and pool usage settings.',
      },
    },
    tierLabels: {
      FREE: 'FREE',
      PRO: 'PRO',
      PREMIUM: 'PREMIUM',
    },
    stockPickerHeader: 'Select Stock',
    lockedTickerTooltip: 'This ticker is PRO/PREMIUM only.',
    duplicateSectionStockTooltip: 'Already selected in another section.',
    portfolioLimitReached: (maxPortfolios) =>
      `Portfolio limit (${maxPortfolios}) reached.`,
    duplicateSectionStocks:
      'Please select different stocks for sections 1, 2, and 3.',
    ma: {
      referenceStock: 'Reference Stock',
      shortPeriod: 'Short MA Period',
      longPeriod: 'Long MA Period',
      rsiEnabled: 'Use RSI',
      alignmentEnabled: 'Require Alignment',
      section1Title: 'Section 1',
      section2Title: 'Section 2',
      section3Title: 'Section 3',
      sectionStock: 'Buy Stock',
      rsiThreshold: 'RSI Threshold',
      takePartialProfit: 'Take Partial Profit',
      partialProfitTargetPct: 'Target Profit (%)',
    },
    multiSplit: {
      targetStock: 'Target Stock',
      targetReturnRate: 'Target Return Rate (A %)',
      totalSplitCount: 'Total Split Count (a)',
      leveragedRecommended: 'Leveraged ETF Recommended',
    },
    noStopMultiSplit: {
      targetStock: 'Target Stock',
      lowLocBudgetRatio: 'Low LOC Budget Ratio (%)',
      highLocPremiumPct: 'High LOC Premium (%)',
      takeProfitPct: 'Take Profit (%)',
      totalSplitCount: 'Total Split Count',
    },
    meta: {
      portfolioName: 'Portfolio Name',
      dailyBuyAmount: 'Buy Amount Per Order ($)',
      startDate: 'Start Date',
      feeRatePercent: 'Fee Rate (%)',
    },
  },
};

export function getStrategyCreatorMessages(
  lang: AppLang,
): StrategyCreatorMessageSet {
  return STRATEGY_CREATOR_MESSAGES[lang];
}
```

### `constants/messages/alarmMessages.ts`

```ts
import type { AppLang } from '@/types';

export interface AlarmMessageSet {
  title: string;
  slotSystem: (maxAlarms: number) => string;
  statusLabel: string;
  enabledDescription: string;
  configuredTimes: string;
  addTime: string;
  periodLabel: string;
  hourLabel: string;
  minuteLabel: string;
  minuteIntervalHeader: string;
  minuteIntervalNotice: string;
  minuteUnit: string;
  addAction: string;
  saveAction: string;
  onState: string;
  offState: string;
  allSlotsFilledNotice: string;
  premiumFeatureNoticeTitle: string;
  premiumFeatureNoticeBody: string;
  aria: {
    closeModal: string;
    closeBackdrop: string;
    toggleAlarm: string;
    removeTime: (timeLabel: string) => string;
    selectPeriod: (period: 'AM' | 'PM') => string;
    saveAlarmSettings: string;
    minuteMenuTrigger: string;
  };
  period: {
    am: string;
    pm: string;
  };
}

export const ALARM_MESSAGES: Record<AppLang, AlarmMessageSet> = {
  ko: {
    title: '알람 설정',
    slotSystem: (maxAlarms: number) => `${maxAlarms} 슬롯 시스템`,
    statusLabel: '알람 상태',
    enabledDescription: '실시간 매매 알림 활성화됨',
    configuredTimes: '설정된 시간',
    addTime: '시간 추가',
    periodLabel: '오전/오후',
    hourLabel: '시',
    minuteLabel: '분',
    minuteIntervalHeader: '10분 단위 설정',
    minuteIntervalNotice: '현재 10분 단위로만 선택이 가능합니다.',
    minuteUnit: '분',
    addAction: '추가',
    saveAction: '설정 저장',
    onState: 'ON',
    offState: 'OFF',
    allSlotsFilledNotice: '더 많은 알람 설정은 추후 확장 예정입니다.',
    premiumFeatureNoticeTitle: '프리미엄 전용',
    premiumFeatureNoticeBody: '프리미엄 전용 기능입니다.',
    aria: {
      closeModal: '알람 설정 모달 닫기',
      closeBackdrop: '알람 설정 모달 배경 닫기',
      toggleAlarm: '알람 켜기 또는 끄기',
      removeTime: (timeLabel: string) => `${timeLabel} 알람 삭제`,
      selectPeriod: (period: 'AM' | 'PM') =>
        period === 'AM' ? '오전 선택' : '오후 선택',
      saveAlarmSettings: '알람 설정 저장',
      minuteMenuTrigger: '알람 분 단위 선택 열기',
    },
    period: {
      am: '오전',
      pm: '오후',
    },
  },
  en: {
    title: 'Alarm Settings',
    slotSystem: (maxAlarms: number) => `${maxAlarms} slot system`,
    statusLabel: 'Alarm status',
    enabledDescription: 'Real-time trading notifications enabled',
    configuredTimes: 'Configured times',
    addTime: 'Add time',
    periodLabel: 'Period',
    hourLabel: 'Hour',
    minuteLabel: 'Minute',
    minuteIntervalHeader: '10-minute interval',
    minuteIntervalNotice: 'Currently, only 10-minute intervals can be selected.',
    minuteUnit: ' min',
    addAction: 'Add',
    saveAction: 'Save settings',
    onState: 'ON',
    offState: 'OFF',
    allSlotsFilledNotice: 'More alarm settings will be available in future updates.',
    premiumFeatureNoticeTitle: 'Premium only',
    premiumFeatureNoticeBody: 'This is a premium feature.',
    aria: {
      closeModal: 'Close alarm settings modal',
      closeBackdrop: 'Close alarm settings modal backdrop',
      toggleAlarm: 'Toggle alarm on or off',
      removeTime: (timeLabel: string) => `Remove alarm for ${timeLabel}`,
      selectPeriod: (period: 'AM' | 'PM') =>
        period === 'AM' ? 'Select AM' : 'Select PM',
      saveAlarmSettings: 'Save alarm settings',
      minuteMenuTrigger: 'Open alarm minute selector',
    },
    period: {
      am: 'AM',
      pm: 'PM',
    },
  },
};

export function getAlarmMessages(lang: AppLang): AlarmMessageSet {
  return ALARM_MESSAGES[lang];
}
```

### `constants/messages/portfolioDetailsMessages.ts`

```ts
import type { AppLang } from '@/types';

export interface PortfolioDetailsMessageSet {
  settledBadge: string;
  holdingsSummaryTitle: string;
  noHoldings: string;
  avgPrice: string;
  totalValuation: string;
  weekdayCalendarTitle: string;
  weekdayHeaders: readonly string[];
  selectedDateTradesTitle: string;
  noTrades: string;
  finalSettlementSellPrefix: string;
  settlementAmount: string;
  buyLabel: string;
  sellLabel: string;
  tradeExecutionSuffix: string;
  executionPrice: string;
  quantity: string;
  fee: string;
  closeAction: string;
  monthTitle: (year: number, month: number) => string;
  deleteTradeDialog: {
    title: string;
    body: string;
    confirm: string;
  };
  aria: {
    closeModal: string;
    closeBackdrop: string;
    previousMonth: string;
    nextMonth: string;
    selectDate: (date: string) => string;
    openTradeDeleteDialog: (ticker: string, date: string) => string;
  };
}

export const PORTFOLIO_DETAILS_MESSAGES: Record<
  AppLang,
  PortfolioDetailsMessageSet
> = {
  ko: {
    settledBadge: '정산 완료',
    holdingsSummaryTitle: '보유 자산 요약',
    noHoldings: '보유 자산이 없습니다.',
    avgPrice: '평균 단가',
    totalValuation: '총 평가금액',
    weekdayCalendarTitle: '평일 거래 달력',
    weekdayHeaders: ['월', '화', '수', '목', '금'],
    selectedDateTradesTitle: '선택한 날짜 거래 내역',
    noTrades: '거래 내역이 없습니다.',
    finalSettlementSellPrefix: '최종 정산 매도',
    settlementAmount: '정산금',
    buyLabel: '매수',
    sellLabel: '매도',
    tradeExecutionSuffix: '매매',
    executionPrice: '체결 단가',
    quantity: '수량',
    fee: '수수료',
    closeAction: '닫기',
    monthTitle: (year: number, month: number) => `${year}년 ${month}월`,
    deleteTradeDialog: {
      title: '거래 기록 삭제',
      body: '이 거래 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      confirm: '삭제',
    },
    aria: {
      closeModal: '포트폴리오 상세 모달 닫기',
      closeBackdrop: '포트폴리오 상세 모달 배경 닫기',
      previousMonth: '이전 달 보기',
      nextMonth: '다음 달 보기',
      selectDate: (date: string) => `${date} 거래 내역 보기`,
      openTradeDeleteDialog: (ticker: string, date: string) =>
        `${date} ${ticker} 거래 기록 삭제 확인 열기`,
    },
  },
  en: {
    settledBadge: 'Settled',
    holdingsSummaryTitle: 'Holdings summary',
    noHoldings: 'No holdings available.',
    avgPrice: 'Avg price',
    totalValuation: 'Total valuation',
    weekdayCalendarTitle: 'Weekday calendar',
    weekdayHeaders: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    selectedDateTradesTitle: 'Selected date transactions',
    noTrades: 'No trade history.',
    finalSettlementSellPrefix: 'Final Settlement Sell',
    settlementAmount: 'Settlement',
    buyLabel: 'Buy',
    sellLabel: 'Sell',
    tradeExecutionSuffix: 'trade',
    executionPrice: 'Execution price',
    quantity: 'Quantity',
    fee: 'Fee',
    closeAction: 'Close',
    monthTitle: (year: number, month: number) => `${year}. ${month}`,
    deleteTradeDialog: {
      title: 'Delete trade record',
      body: 'Do you want to delete this trade record? This action cannot be undone.',
      confirm: 'Delete',
    },
    aria: {
      closeModal: 'Close portfolio details modal',
      closeBackdrop: 'Close portfolio details modal backdrop',
      previousMonth: 'Show previous month',
      nextMonth: 'Show next month',
      selectDate: (date: string) => `Show trades for ${date}`,
      openTradeDeleteDialog: (ticker: string, date: string) =>
        `Open delete confirmation for ${ticker} on ${date}`,
    },
  },
};

export function getPortfolioDetailsMessages(
  lang: AppLang,
): PortfolioDetailsMessageSet {
  return PORTFOLIO_DETAILS_MESSAGES[lang];
}
```

### `constants/messages/commonMessages.ts`

```ts
import type { AppLang } from '@/types';

export type CommonMessageKey =
  | 'save'
  | 'processing'
  | 'close'
  | 'closeDialog'
  | 'acknowledge'
  | 'notice'
  | 'portfolioName'
  | 'dailyBuyAmount'
  | 'feeRatePercent'
  | 'shortMaPeriod'
  | 'longMaPeriod'
  | 'periodicWithdrawal'
  | 'createStrategy'
  | 'setupDescription'
  | 'saveAriaLabel'
  | 'namePlaceholder'
  | 'saveFailed'
  | 'validationNameRequired'
  | 'validationNameLength'
  | 'validationDailyBuy'
  | 'validationFeeRate'
  | 'validationMaPeriod'
  | 'validationWithdrawalNonFinite'
  | 'validationWithdrawalNegative'
  | 'validationWithdrawalTooLarge';

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
}

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
  },
};

export function getCommonMessages(lang: AppLang): CommonMessageSet {
  return COMMON_MESSAGES[lang];
}
```

### `constants/tdsDialogMessages.ts`

```ts
import type { AppLang } from '../types';

export type ExitDialogReason = 'app_exit' | 'auth_close' | 'back_navigation';
export type DialogTone = 'primary' | 'danger';

export interface DialogActionLabels {
  confirm: string;
  cancel: string;
  closeAriaLabel: string;
  backdropAriaLabel: string;
}

export interface ExitDialogMessage {
  title: string;
  body: string;
  confirm: string;
}

export interface TdsDialogMessageSet {
  actions: DialogActionLabels;
  exit: Record<ExitDialogReason, ExitDialogMessage>;
  history: {
    clearTitle: string;
    clearBody: string;
    clearConfirm: string;
    openClearDialog: string;
    /** 헤더의 전체 내역 초기화 버튼 라벨 */
    clearHistoryButton: string;
    /** 단일 종료 전략 기록 삭제 확인 */
    deleteRecordTitle: string;
    deleteRecordBody: string;
    deleteRecordConfirm: string;
    deleteRecordButton: string;
  };
  portfolio: {
    deleteTitle: string;
    deleteBody: string;
    deleteConfirm: string;
    openDeleteConfirm: string;
  };
  auth: {
    signedInSuccessTitle: string;
    signedInSuccessBody: string;
    sessionExpiredTitle: string;
    sessionExpiredBody: string;
    sessionExpiredAcknowledge: string;
    /** Toast when auth dialog copy cannot be resolved (Rule 11 + i18n SSOT). */
    authCopyMissingFallback: string;
    passwordChangedTitle: string;
    passwordChangedBody: string;
    passwordChangedReloginTitle: string;
    passwordChangedReloginBody: string;
    accountDeletedTitle: string;
    accountDeletedBody: string;
  };
  checkout: {
    /** 결제 성공·실패·검증 안내 등 공통 알림 제목 */
    resultNoticeTitle: string;
  };
  app: {
    portfolioLimitTitle: string;
    portfolioLimitBody: (maxCount: number) => string;
  };
  refund: {
    guideTitle: string;
    guideBody: string;
    openRefundGuide: string;
    requestRefund: string;
    confirmPrompt: string;
    eligiblePolicy: string;
    ineligiblePolicy: string;
    confirmRefund: string;
  };
  samples: {
    openDangerConfirmSample: string;
  };
  common: {
    acknowledge: string;
    refundActionFailed: string;
    webAsyncProcessing: string;
  };
}

export const TDS_DIALOG_MESSAGES: Record<AppLang, TdsDialogMessageSet> = {
  ko: {
    actions: {
      confirm: '확인',
      cancel: '취소',
      closeAriaLabel: '모달 닫기',
      backdropAriaLabel: '배경 클릭으로 모달 닫기',
    },
    exit: {
      app_exit: {
        title: '미니앱 종료',
        body: '현재 화면을 종료하고 토스 앱으로 돌아갑니다.',
        confirm: '종료하기',
      },
      auth_close: {
        title: '로그인 종료',
        body: '로그인을 닫으면 미니앱이 종료됩니다.',
        confirm: '닫고 종료',
      },
      back_navigation: {
        title: '화면 이탈',
        body: '현재 화면을 나가면 진행 중인 내용이 저장되지 않을 수 있습니다.',
        confirm: '나가기',
      },
    },
    history: {
      clearTitle: '내역 초기화',
      clearBody: '삭제된 내역은 복구할 수 없습니다.',
      clearConfirm: '초기화',
      openClearDialog: '내역 초기화 확인',
      clearHistoryButton: '내역 초기화',
      deleteRecordTitle: '기록 삭제',
      deleteRecordBody:
        '이 종료 전략 기록을 삭제합니다. Supabase에서도 제거되며 되돌릴 수 없습니다.',
      deleteRecordConfirm: '삭제',
      deleteRecordButton: '기록 삭제',
    },
    portfolio: {
      deleteTitle: '포트폴리오 삭제',
      deleteBody:
        '정말로 이 포트폴리오를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      deleteConfirm: '삭제',
      openDeleteConfirm: '포트폴리오 삭제',
    },
    auth: {
      signedInSuccessTitle: '인증 완료',
      signedInSuccessBody: '환영합니다. 인증이 완료되었습니다.',
      sessionExpiredTitle: '세션 만료',
      sessionExpiredBody: '세션이 만료되었습니다. 다시 로그인해 주세요.',
      sessionExpiredAcknowledge: '확인',
      authCopyMissingFallback:
        '안내 문구를 불러오지 못했습니다. 다시 로그인해 주세요.',
      passwordChangedTitle: '비밀번호 변경',
      passwordChangedBody: '비밀번호가 성공적으로 변경되었습니다.',
      passwordChangedReloginTitle: '비밀번호 변경',
      passwordChangedReloginBody:
        '비밀번호가 변경되었습니다. 다시 로그인해 주세요.',
      accountDeletedTitle: '회원 탈퇴',
      accountDeletedBody: '회원 탈퇴가 완료되었습니다.',
    },
    checkout: {
      resultNoticeTitle: '결제 안내',
    },
    app: {
      portfolioLimitTitle: '포트폴리오 한도',
      portfolioLimitBody: (maxCount: number) =>
        `포트폴리오 생성 한도(${maxCount}개)에 도달했습니다. 더 많은 포트폴리오를 만들려면 업그레이드를 고려해 보세요.`,
    },
    refund: {
      guideTitle: '환불 안내',
      guideBody:
        '안드로이드는 토스 앱 결제내역의 환불 경로를 이용하고, iOS는 애플 고객센터 환불 경로를 이용합니다.',
      openRefundGuide: '환불 안내 보기',
      requestRefund: '환불 요청',
      confirmPrompt: '환불을 요청하시겠습니까?',
      eligiblePolicy:
        '결제 후 7일 이내이고 이용 기록이 없으면 전액 환불 후 서비스가 즉시 해제됩니다.',
      ineligiblePolicy:
        '그 외에는 환불이 불가하며, 이용 기간 만료 시 자동 종료됩니다.',
      confirmRefund: '환불 확인',
    },
    samples: {
      openDangerConfirmSample: '위험 확인 예시 열기',
    },
    common: {
      acknowledge: '확인',
      refundActionFailed:
        '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      webAsyncProcessing: '처리 중…',
    },
  },
  en: {
    actions: {
      confirm: 'Confirm',
      cancel: 'Cancel',
      closeAriaLabel: 'Close dialog',
      backdropAriaLabel: 'Close dialog from backdrop',
    },
    exit: {
      app_exit: {
        title: 'Exit mini app',
        body: 'This action closes the current screen and returns to Toss.',
        confirm: 'Exit',
      },
      auth_close: {
        title: 'Close login',
        body: 'Closing the login flow exits the mini app.',
        confirm: 'Close and exit',
      },
      back_navigation: {
        title: 'Leave screen',
        body: 'Unsaved progress may be lost if you leave this screen.',
        confirm: 'Leave',
      },
    },
    history: {
      clearTitle: 'Clear history',
      clearBody: 'Deleted history cannot be restored.',
      clearConfirm: 'Clear',
      openClearDialog: 'Open clear history confirmation',
      clearHistoryButton: 'Clear History',
      deleteRecordTitle: 'Delete record',
      deleteRecordBody:
        'This removes the closed strategy record from Supabase. This cannot be undone.',
      deleteRecordConfirm: 'Delete',
      deleteRecordButton: 'Delete',
    },
    portfolio: {
      deleteTitle: 'Delete portfolio',
      deleteBody:
        'Are you sure you want to delete this portfolio? This action cannot be undone.',
      deleteConfirm: 'Delete',
      openDeleteConfirm: 'Delete portfolio',
    },
    auth: {
      signedInSuccessTitle: 'Authentication complete',
      signedInSuccessBody: 'Welcome. Authentication is complete.',
      sessionExpiredTitle: 'Session expired',
      sessionExpiredBody: 'Your session expired. Please sign in again.',
      sessionExpiredAcknowledge: 'OK',
      authCopyMissingFallback:
        'We could not load the dialog text. Please sign in again.',
      passwordChangedTitle: 'Password updated',
      passwordChangedBody: 'Your password was updated successfully.',
      passwordChangedReloginTitle: 'Password updated',
      passwordChangedReloginBody:
        'Your password was updated. Please log in again.',
      accountDeletedTitle: 'Account deleted',
      accountDeletedBody: 'Your account has been deleted.',
    },
    checkout: {
      resultNoticeTitle: 'Payment notice',
    },
    app: {
      portfolioLimitTitle: 'Portfolio limit',
      portfolioLimitBody: (maxCount: number) =>
        `Portfolio limit (${maxCount}) reached. Please upgrade for more.`,
    },
    refund: {
      guideTitle: 'Refund guide',
      guideBody:
        'Use Toss payment history on Android, or Apple Support on iOS, to request a refund.',
      openRefundGuide: 'Open refund guide',
      requestRefund: 'Request refund',
      confirmPrompt: 'Do you want to request a refund?',
      eligiblePolicy:
        'Within 7 days and with no usage history, you receive a full refund and access is revoked immediately.',
      ineligiblePolicy:
        'Otherwise, a refund is not available and access ends automatically at expiration.',
      confirmRefund: 'Confirm refund',
    },
    samples: {
      openDangerConfirmSample: 'Open sample danger confirm',
    },
    common: {
      acknowledge: 'OK',
      refundActionFailed:
        'Something went wrong. Please try again in a moment.',
      webAsyncProcessing: 'Processing…',
    },
  },
};
```

### `constants/tierNameTranslationKeys.ts`

```ts
export const TIER_NAME_TRANSLATION_KEY = {
  FREE: 'TIER_NAME_FREE',
  PRO: 'TIER_NAME_PRO',
  PREMIUM: 'TIER_NAME_PREMIUM',
} as const;

export type TierNameTranslationKey =
  (typeof TIER_NAME_TRANSLATION_KEY)[keyof typeof TIER_NAME_TRANSLATION_KEY];
```

### `utils/tierNameLabel.ts`

```ts
import { I18N } from '../constants';
import type { TierNameTranslationKey } from '../constants/tierNameTranslationKeys';
import type { AppLang } from '../types';

export function getTierNameLabel(
  lang: AppLang,
  translationKey: TierNameTranslationKey,
): string {
  const row = I18N[lang] as Record<string, string | undefined>;
  const label = row[translationKey];
  return typeof label === 'string' && label.length > 0 ? label : translationKey;
}
```

### `constants.tsx`

```tsx

export const AVAILABLE_STOCKS = [
  'SPY', 'SSO', 'UPRO', 'QQQ', 'QLD', 'TQQQ', 'SOXX', 'USD', 'SOXL', 'STRC', 'BIL', 'ICSH', 'SGOV'
];

// PRO/PREMIUM 전용 추가 종목
export const PAID_STOCKS = [
  'TSLA', 'TSLL', 'NVDA', 'NVDL', 'GOOGL', 'GGLL', 'PLTR', 'PTIR', 'COIN', 'CONL', 'MSTR', 'MSTX', 'BMNR',
  'FNGU', 'TECL', 'BULZ', 'GDXU',
];

// UI 리스트/필터링용 전체 종목
// 시세탭 종목 정보 순서를 제어하기 위해, 채권/현금성 ETF(BIL, ICSH, SGOV)를 가장 마지막으로 배치
export const ALL_STOCKS = [
  // 기본 인덱스/레버리지/기타
  'SPY', 'SSO', 'UPRO', 'QQQ', 'QLD', 'TQQQ', 'SOXX', 'USD', 'SOXL', 'STRC',
  // 유료 PRO/PREMIUM 전용 종목
  ...PAID_STOCKS,
  // 채권/현금성 ETF - 시세탭 종목 정보의 맨 마지막에 오도록
  'BIL', 'ICSH', 'SGOV',
];

export const STOCK_COLORS: Record<string, string> = {
  'SPY': '#4285F4', 'SSO': '#EA4335', 'UPRO': '#FBBC04', 'QQQ': '#34A853',
  'QLD': '#FF6D01', 'TQQQ': '#9C27B0', 'SOXX': '#00BCD4', 'USD': '#607D8B',
  'SOXL': '#E91E63', 'STRC': '#795548', 'BIL': '#3F51B5', 'ICSH': '#009688', 'SGOV': '#FF9800',
  // paid tickers (fallback 컬러)
  'TSLA': '#e11d48', 'TSLL': '#fb7185',
  'NVDA': '#22c55e', 'NVDL': '#4ade80',
  'GOOGL': '#3b82f6', 'GGLL': '#60a5fa',
  'PLTR': '#a855f7', 'PTIR': '#c084fc',
  'COIN': '#f59e0b', 'CONL': '#fbbf24',
  'MSTR': '#06b6d4', 'MSTX': '#22d3ee',
  'BMNR': '#64748b',
  'FNGU': '#6366f1', 'TECL': '#0ea5e9', 'BULZ': '#f97316', 'GDXU': '#eab308',
};

export const CUSTOM_GRADIENT_LOGOS: Record<string, { gradient: string; label: string }> = {
    'QQQ': { gradient: 'linear-gradient(135deg, #4285F4 0%, #9C27B0 100%)', label: 'NQ 100' },
    'QLD': { gradient: 'linear-gradient(135deg, #4285F4 0%, #9C27B0 100%)', label: '2X' },
    'TQQQ': { gradient: 'linear-gradient(135deg, #4285F4 0%, #9C27B0 100%)', label: '3X' },
    'USD': { gradient: 'linear-gradient(180deg, #87CEEB 0%, #32CD32 50%, #FFD700 100%)', label: '2x' },
    'SOXL': { gradient: 'linear-gradient(180deg, #9C27B0 0%, #E91E63 100%)', label: '3X' },
    'SOXX': { gradient: 'linear-gradient(180deg, #32CD32 0%, #00CED1 100%)', label: 'PHLX-SEMI' },
    'SSO': { gradient: 'linear-gradient(180deg, #1976D2 0%, #E53935 100%)', label: '2X' },
    'UPRO': { gradient: 'linear-gradient(180deg, #1976D2 0%, #E53935 100%)', label: '3X' },
    'SPY': { gradient: 'linear-gradient(180deg, #1976D2 0%, #E53935 100%)', label: 'S&P 500' },
    'STRC': { gradient: 'linear-gradient(180deg, #FF6B35 0%, #FFB347 100%)', label: 'MSTR-pref' },
    'ICSH': { gradient: 'linear-gradient(180deg, #0057B7 0%, #FFD700 100%)', label: 'SHORT TERM CORP' },
    'SGOV': { gradient: 'linear-gradient(180deg, #2E7D32 0%, #9CCC65 100%)', label: 'SHORT-TERM GOVT' },
    'BIL': { gradient: 'linear-gradient(180deg, #008B8B 0%, #D4AF37 100%)', label: 'SHORT-TERM TREAS' },

    // Paid tickers (간단한 그라데이션 배지, 실제 로고 도입 전까지)
    'TSLA': { gradient: 'linear-gradient(135deg, #ef4444 0%, #7f1d1d 100%)', label: 'TESLA' },
    'TSLL': { gradient: 'linear-gradient(135deg, #fb7185 0%, #be123c 100%)', label: '2X TSLA' },
    'NVDA': { gradient: 'linear-gradient(135deg, #22c55e 0%, #14532d 100%)', label: 'NVIDIA' },
    'NVDL': { gradient: 'linear-gradient(135deg, #4ade80 0%, #166534 100%)', label: '2X NVDA' },
    'GOOGL': { gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', label: 'ALPHABET' },
    'GGLL': { gradient: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)', label: '2X GOOG' },
    'PLTR': { gradient: 'linear-gradient(135deg, #a855f7 0%, #581c87 100%)', label: 'PALANTIR' },
    'PTIR': { gradient: 'linear-gradient(135deg, #c084fc 0%, #6d28d9 100%)', label: '2X PLTR' },
    'COIN': { gradient: 'linear-gradient(135deg, #f59e0b 0%, #92400e 100%)', label: 'COINBASE' },
    'CONL': { gradient: 'linear-gradient(135deg, #fbbf24 0%, #b45309 100%)', label: '2X COIN' },
    'MSTR': { gradient: 'linear-gradient(135deg, #06b6d4 0%, #164e63 100%)', label: 'MICROSTRAT' },
    'MSTX': { gradient: 'linear-gradient(135deg, #22d3ee 0%, #0e7490 100%)', label: '2X MSTR' },
    'BMNR': { gradient: 'linear-gradient(135deg, #64748b 0%, #0f172a 100%)', label: 'BMNR' },
    'FNGU': { gradient: 'linear-gradient(135deg, #6366f1 0%, #312e81 100%)', label: 'BIG TECH 10' },
    'TECL': { gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)', label: 'S&P TECH 3X' },
    'BULZ': { gradient: 'linear-gradient(135deg, #f97316 0%, #9a3412 100%)', label: 'INNOV TECH' },
    'GDXU': { gradient: 'linear-gradient(135deg, #eab308 0%, #854d0e 100%)', label: 'GOLD MINERS 3X' },
};

export const MOCK_PRICES: Record<string, number> = {
  SGOV: 100.5, ICSH: 50.2, BIL: 95.8, STRC: 25.3, QQQ: 380.5,
  QLD: 45.2, TQQQ: 35.8, SOXX: 520.3, USD: 1.0, SOXL: 28.5,
  SPY: 450.2, SSO: 65.3, UPRO: 42.8
};

export const I18N = {
  ko: {
    dashboard: "대시보드",
    markets: "시세",
    history: "투자이력",
    membership: "멤버십",
    portfolioMgmt: "포트폴리오 관리",
    newPortfolio: "새 포트폴리오",
    totalValuation: "총 평가 금액",
    gain24h: "24H 변동",
    activeStrategy: "활성 전략",
    invested: "투자 금액",
    yield: "수익률",
    dailyExecution: "일별 매매 실행",
    terminate: "전략 종료하기",
    aiAdvisor: "AI 어드바이저",
    settlementHistory: "정산 히스토리",
    globalMarkets: "글로벌 마켓",
    searchTicker: "티커 검색...",
    launchStrategy: "전략 시작",
    systematicAccumulation: "일별 종가를 바탕으로 체계적인 중/장기 분할 매수 관리 시스템입니다.",
    pulseTitle: "시스템 상태",
    pulseStatus: "정상",
    quickInput: "빠른 매매 입력",
    tradeExecutionRecord: "상세 매매 실행 기록",
    buy: "매수",
    sell: "매도",
    save: "저장하기",
    cancel: "취소",
    executionPrice: "체결 단가",
    quantity: "수량",
    calculatedQty: "자동 계산 수량",
    calculatedFee: "매매 수수료",
    totalAmount: "최종 정산 금액",
    stock: "종목",
    date: "매수일",
    sellDate: "매도일",
    fee: "수수료",
    secFee: "유관 비용 (0.003%) (추정)",
    totalProfit: "누적 수익",
    successRate: "성공률",
    closedStrategies: "종료된 전략",
    noHistory: "기록된 내역이 없습니다.",
    viewSettlement: "정산 상세보기",
    closePortfolioDetailsBackdrop: "포트폴리오 상세 닫기",
    login: "로그인",
    signup: "회원가입",
    logout: "로그아웃",
    changePassword: "비밀번호 변경",
    email: "이메일 주소",
    password: "비밀번호",
    activeSection: "현재 활성 구간",
    section: "구간",
    aiScan: "AI 매매 인식",
    aiScanSub: "스크린샷 자동 분석",
    dropImageOrClick: "여기에 이미지를 드롭하거나 클릭",
    pasteShortcut: "PASTE (CTRL+V)",
    pasteImageButton: "복사 이미지 붙여넣기",
    pasteImageUnsupported: "이 브라우저는 클립보드 이미지 붙여넣기를 지원하지 않습니다.",
    pasteImageNotFound: "클립보드에 이미지가 없습니다.",
    pasteImageError: "클립보드 이미지 읽기에 실패했습니다. 브라우저 권한을 확인하거나 Ctrl+V로 붙여넣기 해주세요.",
    screenshotOnly: "SCREENSHOT ONLY",
    aiScanStart: "AI 스캔 시작",
    aiScanHint: "증권사 앱의 체결 내역 화면을 캡쳐해서 올려주시면 자동으로 정보를 입력합니다.",
    aiScanError: "이미지를 인식할 수 없습니다. 다시 시도하거나 직접 입력해주세요.",
    aiScanRateLimit: "현재 요청이 많아 AI 서비스 이용이 지연되고 있습니다. 잠시 후 다시 시도해주세요.",
    aiConfirmSave: "확인 후 저장",
    aiRecognizedTrades: "인식된 매매 내역",
    sectionPartialProfit: "중간익절",
    sectionWatchRsiNotMet: "관망 (RSI 조건 미충족)",
    sectionWatchAlignmentNotMet: "관망 (정배열 미충족)",
    sectionWatchBothNotMet: "관망 (정배열 미충족, RSI 조건 미충족)",
    backtest: "백테스트",
    backtestSubtitle: "과거 2년 데이터를 통해 내 전략의 수익과 위험을 검증하세요.",
    backtestPeriod: "백테스트 기간",
    strategyMaTitle: "이평선 구간매수",
    strategyMaDesc: "이평선과 RSI를 결합한 고급 구간 대응 전략",
    strategyMultiSplitTitle: "다분할 매매법",
    strategyMultiSplitDesc: "목표 수익률 기반의 체계적 가변 분할 매수",
    strategyNoStopMultiSplitTitle: "다분할 매매법(무손절)",
    strategyNoStopMultiSplitDesc: "손절 없이 평단가 LOC와 고가 LOC로 나누어 기계적으로 매수하는 공격적 전략",
    backtestParamsTitle: "백테스트 파라미터 설정",
    backtestParamsSubtitle: "SIMULATION SETTINGS",
    backtestRun: "백테스트 실행",
    backtestMocNote: "일별 종가 매수 기준입니다.",
    rsiComingSoon: "업데이트 예정입니다.",
    rsiUse: "RSI 사용",
    alignmentUse: "정배열일 때만 매수 (MA a > MA b)",
    totalReturn: "누적 수익률",
    cagr: "연평균 성장률",
    mdd: "최대 낙폭",
    mddHint: "전략 유지 결정의 핵심",
    winRate: "승률",
    assetGrowthCurve: "자산 성장 곡선",
    benchmarkCompare: "벤치마크 비교 (PRO)",
    benchmarkCompareUpgrade: "UPGRADE TO COMPARE WITH S&P 500 & NASDAQ",
    upgradeNow: "UPGRADE NOW",
    drawdownChart: "낙폭 차트 (DRAWDOWN)",
    drawdownHint: "*과거 최대 하락 폭을 확인하여 리스크를 관리하세요.",
    sharpeRatio: "샤프 지수",
    avgHoldingPeriod: "평균 보유 기간",
    days: "일",
    months: "개월",
    newBacktestSettings: "새로운 백테스트 설정",
    dailyBuyAmount: "매일 매수 금액",
    feeRate: "매매 수수료",
    feeRateUnit: "%",
    baseStock: "기준주식",
    section1: "구간 1",
    section2: "구간 2",
    section3: "구간 3",
    maPeriod: "이동평균선",
    rsiThreshold: "RSI 기준",
    takeProfit: "중간이익실현",
    takeProfitPct: "이익실현 %",
    targetReturnRate: "목표수익률",
    totalSplitCount: "총 분할 횟수",
    oneTimeAmount: "1회 매수금액",
    firstRoundStartHint: "1회차 매수를 시작하세요",
    overLimit: "매매 내역을 확인하세요. 총투자금을 초과했습니다.",
    firstHalf: "전반전",
    secondHalf: "후반전",
    quarterStopLoss: "쿼터 손절",
    strategyPreparing: "전략 준비 중",
    quarterReturnTip: "쿼터손절 → 복귀 : LOC 매도 또는 지정가 매도가 체결될 때.",
    quarterEntryTip: "정규 → 쿼터손절 : T > a-1 이면 자동 진입.",
    checkingSection: "구간 확인 중…",
    locBuy1: "LOC 매수1",
    locBuy2: "LOC 매수2",
    lowLoc: "저가 LOC",
    highLoc: "고가 LOC",
    locSell: "LOC 매도",
    limitSell: "지정가 매도",
    mocSell: "MOC 매도",
    firstBuyAmount: "1회 매수금",
    noStopFirstBuyHint: "첫 매수는 장중 아무 때나, 자유롭게 매수해 주세요.",
    noStopSplitComplete: "분할 매수가 모두 완료되었습니다. 추가 매수 없이 보유(존버)와 익절만 수행합니다.",
    noStopTakeProfitTarget: "익절 목표",
    noStopGuaranteedDailyFill: "매일 체결 보장용",
    quarterHint: "MOC 매도 하여 쿼터 손절 모드 시작",
    sharesUnit: "주",
    noOrder: "오늘 주문 요약은 앱에서 확인해 주세요.",
    alarmSettingsLabel: "알람 설정",
    membershipFreeCoreAlerts: "기본 알람 · 기록 기능",
    membershipPricingFreeSubtitle: "초보 투자자",
    membershipPricingFreePriceLabel: "₩0",
    membershipPricingFreePriceNote: "/ 평생",
    membershipPricingFreeFeature1: "포트폴리오 최대 2개",
    membershipPricingFreeFeature2: "알람 슬롯 2개",
    membershipPricingFreeFeature3: "기본 13개 ETF",
    membershipPricingFreeFeature4: "AI 매매 인식 (1회/일)",
    membershipPricingFreeFeature5: "백테스트 (2회/일)",
    membershipPricingFreeFeature7: "광고 포함",
    membershipPricingProSubtitle: "전문 투자자",
    membershipPricingProPriceNote: "/ 월 (예정)",
    membershipPricingProBadge: "가장 인기 있는 선택",
    membershipPricingProFeature1: "포트폴리오 최대 5개",
    membershipPricingProFeature2: "알람 슬롯 10개",
    membershipPricingProFeature3: "기본 13개 + PRO 전용 종목",
    membershipPricingProFeature4: "AI 매매 인식 (50회/월)",
    membershipPricingProFeature5: "백테스트 (5회/일)",
    membershipPricingProFeature6: "텔레그램 상세 알림",
    membershipPricingProFeature7: "광고 제거",
    membershipPricingPremiumSubtitle: "슈퍼 고래",
    membershipPricingPremiumPriceNote: "/ 월 (출시 예정)",
    membershipPricingPremiumBadge: "COMING SOON",
    membershipPricingPremiumFeature1: "포트폴리오 최대 20개",
    membershipPricingPremiumFeature2: "알람 슬롯 40개",
    membershipPricingPremiumFeature3: "모든 종목 + 베타 종목",
    membershipPricingPremiumFeature4: "AI 매매 인식 (무제한)",
    membershipPricingPremiumFeature5: "백테스트 (10회/일)",
    membershipPricingPremiumFeature6: "신규 전략 선공개",
    membershipPricingPremiumFeature7: "VIP 전용 고객 지원",
    TIER_NAME_FREE: "베이직",
    TIER_NAME_PRO: "프로",
    TIER_NAME_PREMIUM: "프리미엄",
  },
  en: {
    dashboard: "Dashboard",
    markets: "Markets",
    history: "History",
    membership: "Membership",
    portfolioMgmt: "Portfolio Management",
    newPortfolio: "New Portfolio",
    totalValuation: "TOTAL VALUATION",
    gain24h: "24H GAIN",
    activeStrategy: "ACTIVE STRATEGY",
    invested: "INVESTED",
    yield: "YIELD",
    dailyExecution: "DAILY EXECUTION",
    terminate: "TERMINATE STRATEGY",
    aiAdvisor: "AI ADVISOR",
    settlementHistory: "Settlement History",
    globalMarkets: "Markets",
    searchTicker: "Search ticker...",
    launchStrategy: "Launch Strategy",
    systematicAccumulation: "Systematic asset accumulation through quantitative dip-buying strategies.",
    pulseTitle: "System Pulse",
    pulseStatus: "Healthy",
    quickInput: "Quick Input",
    tradeExecutionRecord: "Trade Execution Record",
    buy: "Buy",
    sell: "Sell",
    save: "Save",
    cancel: "Cancel",
    executionPrice: "Execution Price",
    quantity: "Quantity",
    calculatedQty: "Calculated Quantity",
    calculatedFee: "Calculated Fee",
    totalAmount: "Total Amount",
    stock: "Ticker",
    date: "Buy Date",
    sellDate: "Sell Date",
    fee: "Fee",
    secFee: "SEC Fee (0.003%) (Est.)",
    totalProfit: "Total Profit",
    successRate: "Success Rate",
    closedStrategies: "Closed Strategies",
    noHistory: "No history found.",
    viewSettlement: "View Settlement",
    closePortfolioDetailsBackdrop: "Close portfolio details",
    login: "Login",
    signup: "Sign Up",
    logout: "Logout",
    changePassword: "Change Password",
    email: "Email Address",
    password: "Password",
    activeSection: "Active Section",
    section: "Section",
    aiScan: "AI Trade Recognition",
    aiScanSub: "Screenshot auto-analysis",
    dropImageOrClick: "Drop image here or click",
    pasteShortcut: "PASTE (CTRL+V)",
    pasteImageButton: "Paste copied image",
    pasteImageUnsupported: "This browser does not support clipboard image paste.",
    pasteImageNotFound: "No image found in clipboard.",
    pasteImageError: "Failed to read image from clipboard. Check browser permissions or use Ctrl+V to paste.",
    screenshotOnly: "SCREENSHOT ONLY",
    aiScanStart: "Start AI Scan",
    aiScanHint: "Upload a screenshot of your broker's execution screen and we'll auto-fill the trade info.",
    aiScanError: "Could not recognize the image. Try again or enter manually.",
    aiScanRateLimit: "AI service is busy. Please try again later.",
    aiConfirmSave: "Confirm & Save",
    aiRecognizedTrades: "Recognized trades",
    sectionPartialProfit: "Partial profit",
    sectionWatchRsiNotMet: "Watch (RSI not met)",
    sectionWatchAlignmentNotMet: "Watch (alignment not met)",
    sectionWatchBothNotMet: "Watch (alignment not met, RSI not met)",
    backtest: "Backtest",
    backtestSubtitle: "Verify your strategy's profit and risk using the past 2 years of data.",
    backtestPeriod: "Backtest Period",
    strategyMaTitle: "Moving Average Interval",
    strategyMaDesc: "Advanced interval strategy combining MAs and RSI",
    strategyMultiSplitTitle: "Multi-Split Strategy",
    strategyMultiSplitDesc: "Systematic variable split buying based on target return",
    strategyNoStopMultiSplitTitle: "No-Stop Multi-Split",
    strategyNoStopMultiSplitDesc: "Aggressive split-buy strategy that keeps buying with avg-price and premium LOC orders without stop-loss",
    backtestParamsTitle: "Backtest Parameter Settings",
    backtestParamsSubtitle: "SIMULATION SETTINGS",
    backtestRun: "Run Backtest",
    backtestMocNote: "Based on daily closing price buy (MOC).",
    rsiComingSoon: "Coming soon.",
    rsiUse: "Enable RSI",
    alignmentUse: "Buy only when MA a > MA b",
    totalReturn: "Total Return",
    cagr: "CAGR",
    mdd: "Max Drawdown",
    mddHint: "Key to deciding whether to maintain the strategy",
    winRate: "Win Rate",
    assetGrowthCurve: "Asset Growth Curve",
    benchmarkCompare: "Benchmark Compare (PRO)",
    benchmarkCompareUpgrade: "UPGRADE TO COMPARE WITH S&P 500 & NASDAQ",
    upgradeNow: "UPGRADE NOW",
    drawdownChart: "Drawdown Chart",
    drawdownHint: "*Check past maximum drawdown to manage risk.",
    sharpeRatio: "Sharpe Ratio",
    avgHoldingPeriod: "Avg Holding Period",
    days: "days",
    months: "months",
    newBacktestSettings: "New Backtest Settings",
    dailyBuyAmount: "Daily Buy Amount",
    feeRate: "Fee Rate",
    feeRateUnit: "%",
    baseStock: "Base Stock",
    section1: "Section 1",
    section2: "Section 2",
    section3: "Section 3",
    maPeriod: "MA Period",
    rsiThreshold: "RSI Threshold",
    takeProfit: "Take Profit",
    takeProfitPct: "Take Profit %",
    targetReturnRate: "Target Return %",
    totalSplitCount: "Total Splits",
    oneTimeAmount: "1st Buy Amount",
    firstRoundStartHint: "Start your 1st round buy",
    overLimit: "Check your trades. Total invested has exceeded the limit.",
    firstHalf: "First Half",
    secondHalf: "Second Half",
    quarterStopLoss: "Quarter Stop-Loss",
    strategyPreparing: "Strategy preparing",
    quarterReturnTip: "Quarter Stop-Loss → Return: When LOC sell or limit sell is executed.",
    quarterEntryTip: "Normal → Quarter Stop-Loss: Auto when T > a-1.",
    checkingSection: "Checking section…",
    locBuy1: "LOC Buy 1",
    locBuy2: "LOC Buy 2",
    lowLoc: "Low LOC",
    highLoc: "High LOC",
    locSell: "LOC Sell",
    limitSell: "Limit Sell",
    mocSell: "MOC Sell",
    firstBuyAmount: "1st Buy Amount",
    noStopFirstBuyHint: "For your first buy, feel free to buy anytime during market hours.",
    noStopSplitComplete: "All split buys are complete. Hold and wait for take profit without additional buys.",
    noStopTakeProfitTarget: "Take-profit target",
    noStopGuaranteedDailyFill: "For guaranteed daily fill",
    quarterHint: "Execute MOC sell to start quarter stop-loss mode",
    sharesUnit: "shares",
    noOrder: "Please check today's orders in the app.",
    alarmSettingsLabel: "Alarm settings",
    membershipFreeCoreAlerts: "Core alerts & trading history",
    membershipPricingFreeSubtitle: "Getting Started",
    membershipPricingFreePriceLabel: "$0",
    membershipPricingFreePriceNote: "/ lifetime",
    membershipPricingFreeFeature1: "Up to 2 portfolios",
    membershipPricingFreeFeature2: "2 alert slots",
    membershipPricingFreeFeature3: "13 core ETFs",
    membershipPricingFreeFeature4: "AI Trade Recognition (1/day)",
    membershipPricingFreeFeature5: "Backtesting (2/day)",
    membershipPricingFreeFeature7: "Includes ads",
    membershipPricingProSubtitle: "Active Investor",
    membershipPricingProPriceNote: "/ month (planned)",
    membershipPricingProBadge: "Most popular",
    membershipPricingProFeature1: "Up to 5 portfolios",
    membershipPricingProFeature2: "10 alert slots",
    membershipPricingProFeature3: "Core + PRO tickers (TSLA, NVDA, MSTR …)",
    membershipPricingProFeature4: "AI Trade Recognition (50/month)",
    membershipPricingProFeature5: "Backtesting (5/day)",
    membershipPricingProFeature6: "Detailed Telegram alerts",
    membershipPricingProFeature7: "No ads",
    membershipPricingPremiumSubtitle: "Power User",
    membershipPricingPremiumPriceNote: "/ month (coming soon)",
    membershipPricingPremiumBadge: "COMING SOON",
    membershipPricingPremiumFeature1: "Up to 20 portfolios",
    membershipPricingPremiumFeature2: "40 alert slots",
    membershipPricingPremiumFeature3: "All tickers + beta",
    membershipPricingPremiumFeature4: "Unlimited AI Recognition",
    membershipPricingPremiumFeature5: "Backtesting (10/day)",
    membershipPricingPremiumFeature6: "Early access to strategies",
    membershipPricingPremiumFeature7: "VIP priority support",
    TIER_NAME_FREE: "FREE",
    TIER_NAME_PRO: "PRO",
    TIER_NAME_PREMIUM: "PREMIUM",
  }
};
```

### `src/utils/a11yHelpers.ts`

```ts
import type { KeyboardEvent } from 'react';

const ENTER_KEY = 'Enter';
const SPACE_KEY = ' ';

export function handlePressEnterOrSpace(
  event: KeyboardEvent<HTMLElement>,
  action: () => void,
): void {
  const isActivationKey =
    event.key === ENTER_KEY || event.key === SPACE_KEY;

  if (!isActivationKey) {
    return;
  }

  event.preventDefault();
  action();
}
```

### `src/utils/tradeModalCalculations.ts`

```ts
import type { AppLang, Trade } from '@/types';
import { areStrictPositiveFiniteScalars } from '@/utils/financialScalarGuards';
import { safeNumber } from '../components/StrategyCreator/utils';
import { roundMoneyToPlaces } from './financialCalculations';

const ZERO_AMOUNT = 0;
const DEFAULT_FEE_RATE_PERCENT = 0.25;
const PERCENT_DENOMINATOR = 100;
const MONEY_DECIMALS = 2;
const FEE_DECIMALS = 4;
const SHARE_DECIMALS = 1;
const SEC_FEE_RATE = 0.00003;
const MOC_SELL_RATIO = 0.25;
const MONTH_START_DAY = 1;

const DATE_LOCALE_MAP: Record<AppLang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
};

export interface TradeFeePreviewInput {
  tradeType: Trade['type'];
  price: number;
  quantity: number;
  feeRatePercent: number;
}

export interface TradeSettlementPreviewInput {
  tradeType: Trade['type'];
  price: number;
  quantity: number;
  fee: number;
}

export interface TradeFeePreview {
  notional: number;
  commission: number;
  secFee: number;
  totalFee: number;
  totalSettlement: number;
}

export interface BudgetQuantityInput {
  price: number;
  dailyBuyAmount: number;
  feeRatePercent: number;
}

export interface BudgetWarningInput {
  tradeType: Trade['type'];
  totalSettlement: number;
  dailyBuyAmount: number;
}

function normalizeSignedZero(value: number): number {
  return value === 0 ? ZERO_AMOUNT : value;
}

function normalizeNonNegativeNumber(value: unknown): number {
  const parsed = safeNumber(value, ZERO_AMOUNT);
  if (!Number.isFinite(parsed)) {
    return ZERO_AMOUNT;
  }
  return Math.max(ZERO_AMOUNT, parsed);
}

export function roundTradeMoney(
  value: number,
  digits: number = MONEY_DECIMALS,
): number {
  return normalizeSignedZero(roundMoneyToPlaces(value, digits));
}

export function roundTradeQuantity(
  value: number,
  digits: number = SHARE_DECIMALS,
): number {
  return normalizeSignedZero(roundMoneyToPlaces(value, digits));
}

export function parseTradeNumericInput(raw: string): number {
  return normalizeNonNegativeNumber(raw);
}

export function formatUsd(
  value: number,
  digits: number = MONEY_DECIMALS,
): string {
  const rounded = roundTradeMoney(value, digits);
  return `$${rounded.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatShareQuantity(
  value: number,
  digits: number = SHARE_DECIMALS,
): string {
  return roundTradeQuantity(value, digits).toFixed(digits);
}

export function getTodayDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateKeyToLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map((value) => Number(value));
  return new Date(year, (month || MONTH_START_DAY) - 1, day || MONTH_START_DAY);
}

export function getMonthStartDateKey(dateKey: string): string {
  const date = dateKeyToLocalDate(dateKey);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function shiftMonthDateKey(
  monthStartDateKey: string,
  delta: number,
): string {
  const date = dateKeyToLocalDate(monthStartDateKey);
  const shifted = new Date(
    date.getFullYear(),
    date.getMonth() + delta,
    MONTH_START_DAY,
  );
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function formatTradeDateLabel(dateKey: string, lang: AppLang): string {
  const date = dateKeyToLocalDate(dateKey);
  return new Intl.DateTimeFormat(DATE_LOCALE_MAP[lang], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatCalendarMonthLabel(
  monthStartDateKey: string,
  lang: AppLang,
): string {
  const date = dateKeyToLocalDate(monthStartDateKey);
  return new Intl.DateTimeFormat(DATE_LOCALE_MAP[lang], {
    year: 'numeric',
    month: 'long',
  }).format(date);
}

export function buildTradeSettlementPreview(
  input: TradeSettlementPreviewInput,
): number {
  if (!areStrictPositiveFiniteScalars(input.price, input.quantity)) {
    return ZERO_AMOUNT;
  }

  const notional = roundTradeMoney(input.price * input.quantity, MONEY_DECIMALS);
  const normalizedFee = roundTradeMoney(
    normalizeNonNegativeNumber(input.fee),
    FEE_DECIMALS,
  );

  const rawSettlement =
    input.tradeType === 'buy'
      ? notional + normalizedFee
      : notional - normalizedFee;

  return roundTradeMoney(rawSettlement, MONEY_DECIMALS);
}

export function buildTradeFeePreview(
  input: TradeFeePreviewInput,
): TradeFeePreview {
  if (!areStrictPositiveFiniteScalars(input.price, input.quantity)) {
    return {
      notional: ZERO_AMOUNT,
      commission: ZERO_AMOUNT,
      secFee: ZERO_AMOUNT,
      totalFee: ZERO_AMOUNT,
      totalSettlement: ZERO_AMOUNT,
    };
  }

  const normalizedFeeRatePercent = normalizeNonNegativeNumber(
    input.feeRatePercent ?? DEFAULT_FEE_RATE_PERCENT,
  );
  const notional = roundTradeMoney(input.price * input.quantity, MONEY_DECIMALS);
  const commission = roundTradeMoney(
    notional * (normalizedFeeRatePercent / PERCENT_DENOMINATOR),
    FEE_DECIMALS,
  );
  const secFee =
    input.tradeType === 'sell'
      ? roundTradeMoney(notional * SEC_FEE_RATE, FEE_DECIMALS)
      : ZERO_AMOUNT;
  const totalFee = roundTradeMoney(commission + secFee, FEE_DECIMALS);

  return {
    notional,
    commission,
    secFee,
    totalFee,
    totalSettlement: buildTradeSettlementPreview({
      tradeType: input.tradeType,
      price: input.price,
      quantity: input.quantity,
      fee: totalFee,
    }),
  };
}

export function shouldWarnTradeBudgetExceeded(
  input: BudgetWarningInput,
): boolean {
  if (input.tradeType !== 'buy') {
    return false;
  }

  if (
    !areStrictPositiveFiniteScalars(
      input.totalSettlement,
      input.dailyBuyAmount,
    )
  ) {
    return false;
  }

  const normalizedSettlement = roundTradeMoney(input.totalSettlement, MONEY_DECIMALS);
  const normalizedBudget = roundTradeMoney(input.dailyBuyAmount, MONEY_DECIMALS);

  return normalizedSettlement > normalizedBudget;
}

export function calculateBudgetBuyQuantity(input: BudgetQuantityInput): number {
  if (!areStrictPositiveFiniteScalars(input.price, input.dailyBuyAmount)) {
    return ZERO_AMOUNT;
  }

  const normalizedBudget = roundTradeMoney(input.dailyBuyAmount, MONEY_DECIMALS);
  const feeRatePercentNormalized = normalizeNonNegativeNumber(
    input.feeRatePercent ?? DEFAULT_FEE_RATE_PERCENT,
  );
  const feeRateFraction = feeRatePercentNormalized / PERCENT_DENOMINATOR;
  const unitCostMultiplier = 1 + feeRateFraction;

  if (!Number.isFinite(unitCostMultiplier) || unitCostMultiplier <= 0) {
    return ZERO_AMOUNT;
  }

  const theoreticalQuantity = Math.floor(
    normalizedBudget / (input.price * unitCostMultiplier),
  );

  let quantity = theoreticalQuantity;
  while (quantity > 0) {
    const preview = buildTradeFeePreview({
      tradeType: 'buy',
      price: input.price,
      quantity,
      feeRatePercent: input.feeRatePercent,
    });

    if (preview.totalSettlement <= normalizedBudget) {
      return quantity;
    }

    quantity -= 1;
  }

  return ZERO_AMOUNT;
}

export function calculateMocSellQuantity(holdingQuantity: number): number {
  if (!areStrictPositiveFiniteScalars(holdingQuantity)) {
    return ZERO_AMOUNT;
  }

  return roundTradeQuantity(holdingQuantity * MOC_SELL_RATIO, SHARE_DECIMALS);
}

export function createTradeId(): string {
  return crypto.randomUUID();
}
```

### `src/utils/financialCalculations.ts`

```ts
import { areStrictPositiveFiniteScalars } from '@/utils/financialScalarGuards';

const DECIMAL_BASE = 10;
const MIN_DECIMAL_PLACES = 0;
const ZERO_AMOUNT = 0;
export const TRADE_JOURNAL_NOTIONAL_DECIMAL_PLACES = 2;

export interface TradeBudgetExceededInput {
  tradeType: 'buy' | 'sell';
  price: number;
  quantity: number;
  dailyBuyAmount: number;
}

export function roundMoneyToPlaces(value: number, places: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(places)) {
    return ZERO_AMOUNT;
  }

  const normalizedPlaces = Math.max(
    MIN_DECIMAL_PLACES,
    Math.trunc(places),
  );
  const factor = DECIMAL_BASE ** normalizedPlaces;

  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function calculateTotalTradeAmount(
  price: number,
  quantity: number,
): number {
  if (!areStrictPositiveFiniteScalars(price, quantity)) {
    return ZERO_AMOUNT;
  }

  const rawTradeAmount = price * quantity;

  return roundMoneyToPlaces(
    rawTradeAmount,
    TRADE_JOURNAL_NOTIONAL_DECIMAL_PLACES,
  );
}

export function shouldWarnBudgetExceeded(
  input: TradeBudgetExceededInput,
): boolean {
  if (input.tradeType !== 'buy') {
    return false;
  }

  if (
    !areStrictPositiveFiniteScalars(
      input.price,
      input.quantity,
      input.dailyBuyAmount,
    )
  ) {
    return false;
  }

  const tradeAmount = calculateTotalTradeAmount(
    input.price,
    input.quantity,
  );
  const budgetAmount = roundMoneyToPlaces(
    input.dailyBuyAmount,
    TRADE_JOURNAL_NOTIONAL_DECIMAL_PLACES,
  );

  return tradeAmount > budgetAmount;
}
```

### `src/components/StrategyCreator/utils.ts`

```ts
import {
  STRATEGY_DEFAULTS,
  roundMoney,
} from '@/constants/domain/financeRules';
import { RATE_PRECISION_MULTIPLIER } from '@/constants/vrConstants';
import type {
  Portfolio,
  Strategy,
  VrBandStrategyParams,
  VrSnapshot,
} from '@/types';
import {
  createInitialVrSnapshot,
  sanitizeVrCycleWeeks,
} from '@/utils/vrBandStrategy';

const PERCENT_DENOMINATOR = 100;
const SECTION_TWO_SPLIT_COUNT = 1;
const DEFAULT_VR_REFERENCE_STOCK = 'TQQQ';
const ZERO_AMOUNT = 0;
const EMPTY_STRING = '';

export type StrategyType =
  | 'rsi_ma_interval'
  | 'multi_split'
  | 'no_stop_multi_split'
  | 'vr_band';

export interface StrategyCreatorMetaDraftInput {
  name?: string;
  /** 폼/controlled input에서 `string`으로 올 수 있음 — `safeNumber`가 파싱 */
  dailyBuyAmount?: number | string;
  startDate?: string;
  /** 빈 문자열 `""`는 `Number("") === 0` 맹점이 있으므로 `safeNumber(..., STRATEGY_DEFAULTS.FEE_RATE_PERCENT)`로만 정규화 */
  feeRatePercent?: number | string;
}

export interface MaIntervalSectionDraftInput {
  stock?: string;
  rsiThreshold?: number;
  takePartialProfit?: boolean;
  partialProfitTargetPct?: number;
}

export interface MaIntervalWizardDraftInput {
  ma0Stock?: string;
  maAPeriod?: number;
  maBPeriod?: number;
  rsiEnabled?: boolean;
  alignmentEnabled?: boolean;
  ma1?: MaIntervalSectionDraftInput;
  ma2?: MaIntervalSectionDraftInput;
  ma3?: MaIntervalSectionDraftInput;
}

export interface MultiSplitWizardDraftInput {
  targetStock?: string;
  targetReturnRate?: number;
  totalSplitCount?: number;
}

export interface NoStopMultiSplitWizardDraftInput {
  targetStock?: string;
  lowLocBudgetRatio?: number;
  highLocPremiumPct?: number;
  takeProfitPct?: number;
  totalSplitCount?: number;
}

export interface VrBandWizardDraftInput {
  vrMode?: VrBandStrategyParams['vrMode'];
  initialCapital?: number;
  initialV?: number;
  minOrderQty?: number;
  bandUpperPct?: number;
  bandLowerPct?: number;
  g?: number;
  poolUsagePct?: number;
  deltaCash?: number;
  cycleWeeks?: number;
}

export interface StrategyWizardDraftInput {
  meta?: StrategyCreatorMetaDraftInput;
  maInterval?: MaIntervalWizardDraftInput;
  multiSplit?: MultiSplitWizardDraftInput;
  noStopMultiSplit?: NoStopMultiSplitWizardDraftInput;
  vrBand?: VrBandWizardDraftInput;
}

export interface PortfolioSetupValidationInput {
  name: string;
  dailyBuyAmount: number;
  feeRatePercent: number;
  maShortPeriod: number;
  maLongPeriod: number;
  withdrawalAmount: number;
}

export interface PortfolioDraftBuildResult {
  portfolio: Omit<Portfolio, 'id'>;
  validationInput: PortfolioSetupValidationInput;
}

interface StrategyBuildResult {
  strategy: Strategy;
  initialVrSnapshot: VrSnapshot | null;
}

interface NormalizedMetaDraft {
  name: string;
  dailyBuyAmount: number;
  startDate: string;
  feeRatePercent: number;
}

interface NormalizedMaSectionDraft {
  stock: string;
  rsiThreshold: number;
  takePartialProfit: boolean;
  partialProfitTargetPct: number;
}

export function safeTrim(val: unknown): string {
  return typeof val === 'string' ? val.trim() : EMPTY_STRING;
}

/**
 * Rule 1 & 6: `Number("") === 0` 맹점 — 빈 문자열은 유효한 숫자 0이 아니라 **미입력**으로 보고 `fallback`을 쓴다.
 * (공백만 있는 문자열은 `trim()` 후 빈 문자열과 동일하게 처리한다. `Number("  ")`는 `NaN`이지만, 여기서는 일관되게 fallback으로 보낸다.)
 */
export function safeNumber(val: unknown, fallback: number = ZERO_AMOUNT): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === EMPTY_STRING) {
      return fallback;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function safeBoolean(val: unknown, fallback = false): boolean {
  return typeof val === 'boolean' ? val : fallback;
}

function toDecimalRate(percent: number): number {
  if (!Number.isFinite(percent)) {
    return ZERO_AMOUNT;
  }

  const rawRate = percent / PERCENT_DENOMINATOR;

  return (
    Math.round((rawRate + Number.EPSILON) * RATE_PRECISION_MULTIPLIER) /
    RATE_PRECISION_MULTIPLIER
  );
}

function normalizeMetaDraft(
  meta: StrategyCreatorMetaDraftInput | undefined,
): NormalizedMetaDraft {
  return {
    name: safeTrim(meta?.name),
    dailyBuyAmount: roundMoney(
      safeNumber(meta?.dailyBuyAmount, STRATEGY_DEFAULTS.DAILY_BUY_AMOUNT_USD),
    ),
    startDate: safeTrim(meta?.startDate),
    // 수수료: 빈 문자열·미입력이 0%로 떨어지면 정산 오류 — 도메인 기본값을 명시 fallback으로 전달
    feeRatePercent: roundMoney(
      safeNumber(meta?.feeRatePercent, STRATEGY_DEFAULTS.FEE_RATE_PERCENT),
    ),
  };
}

function normalizeMaSectionDraft(
  section: MaIntervalSectionDraftInput | undefined,
): NormalizedMaSectionDraft {
  return {
    stock: safeTrim(section?.stock),
    rsiThreshold: safeNumber(section?.rsiThreshold),
    takePartialProfit: safeBoolean(section?.takePartialProfit),
    partialProfitTargetPct: safeNumber(section?.partialProfitTargetPct),
  };
}

export function buildValidationInput(
  selectedStrategy: StrategyType,
  wizardState: StrategyWizardDraftInput,
): PortfolioSetupValidationInput {
  const meta = normalizeMetaDraft(wizardState.meta);

  switch (selectedStrategy) {
    case 'rsi_ma_interval': {
      const maIntervalDraft = wizardState.maInterval;
      return {
        name: meta.name,
        dailyBuyAmount: meta.dailyBuyAmount,
        feeRatePercent: meta.feeRatePercent,
        maShortPeriod: safeNumber(maIntervalDraft?.maAPeriod),
        maLongPeriod: safeNumber(maIntervalDraft?.maBPeriod),
        withdrawalAmount: ZERO_AMOUNT,
      };
    }
    case 'multi_split':
    case 'no_stop_multi_split':
      return {
        name: meta.name,
        dailyBuyAmount: meta.dailyBuyAmount,
        feeRatePercent: meta.feeRatePercent,
        maShortPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
        maLongPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
        withdrawalAmount: ZERO_AMOUNT,
      };
    case 'vr_band': {
      const vrBandDraft = wizardState.vrBand;
      const vrMode = vrBandDraft?.vrMode ?? 'lump_sum';
      const normalizedWithdrawalAmount =
        vrMode === 'withdraw'
          ? roundMoney(Math.abs(safeNumber(vrBandDraft?.deltaCash)))
          : ZERO_AMOUNT;

      return {
        name: meta.name,
        dailyBuyAmount: meta.dailyBuyAmount,
        feeRatePercent: meta.feeRatePercent,
        maShortPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
        maLongPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
        withdrawalAmount: normalizedWithdrawalAmount,
      };
    }
    default: {
      const exhaustiveCheck: never = selectedStrategy;
      return exhaustiveCheck;
    }
  }
}

function buildMaIntervalStrategy(
  wizardState: StrategyWizardDraftInput,
): StrategyBuildResult {
  const maDraft = wizardState.maInterval;
  const ma1 = normalizeMaSectionDraft(maDraft?.ma1);
  const ma2 = normalizeMaSectionDraft(maDraft?.ma2);
  const ma3 = normalizeMaSectionDraft(maDraft?.ma3);
  const isRsiEnabled = safeBoolean(maDraft?.rsiEnabled);

  return {
    strategy: {
      ma0: {
        stock: safeTrim(maDraft?.ma0Stock),
        rsiEnabled: isRsiEnabled,
        alignmentEnabled: safeBoolean(maDraft?.alignmentEnabled),
        maAPeriod: safeNumber(maDraft?.maAPeriod),
        maBPeriod: safeNumber(maDraft?.maBPeriod),
      },
      ma1: {
        stock: ma1.stock,
        rsiThreshold: isRsiEnabled ? ma1.rsiThreshold : undefined,
        takePartialProfit: ma1.takePartialProfit,
        partialProfitTargetPct: ma1.takePartialProfit
          ? ma1.partialProfitTargetPct
          : undefined,
      },
      ma2: {
        stock: ma2.stock,
        splitCount: SECTION_TWO_SPLIT_COUNT,
        rsiThreshold: isRsiEnabled ? ma2.rsiThreshold : undefined,
        takePartialProfit: ma2.takePartialProfit,
        partialProfitTargetPct: ma2.takePartialProfit
          ? ma2.partialProfitTargetPct
          : undefined,
      },
      ma3: {
        stock: ma3.stock,
        rsiThreshold: isRsiEnabled ? ma3.rsiThreshold : undefined,
        takePartialProfit: ma3.takePartialProfit,
        partialProfitTargetPct: ma3.takePartialProfit
          ? ma3.partialProfitTargetPct
          : undefined,
      },
    },
    initialVrSnapshot: null,
  };
}

function buildSingleStockStrategyBase(targetStock: string): Pick<
  Strategy,
  'ma0' | 'ma1' | 'ma2' | 'ma3'
> {
  return {
    ma0: {
      stock: targetStock,
      rsiEnabled: false,
      alignmentEnabled: false,
      maAPeriod: STRATEGY_DEFAULTS.MA_SHORT_PERIOD,
      maBPeriod: STRATEGY_DEFAULTS.MA_LONG_PERIOD,
    },
    ma1: { stock: targetStock },
    ma2: { stock: targetStock, splitCount: SECTION_TWO_SPLIT_COUNT },
    ma3: { stock: targetStock },
  };
}

function buildMultiSplitStrategy(
  wizardState: StrategyWizardDraftInput,
): StrategyBuildResult {
  const draft = wizardState.multiSplit;
  const targetStock = safeTrim(draft?.targetStock);

  return {
    strategy: {
      ...buildSingleStockStrategyBase(targetStock),
      multiSplit: {
        targetStock,
        targetReturnRate: safeNumber(draft?.targetReturnRate),
        totalSplitCount: safeNumber(draft?.totalSplitCount),
      },
    },
    initialVrSnapshot: null,
  };
}

function buildNoStopMultiSplitStrategy(
  wizardState: StrategyWizardDraftInput,
): StrategyBuildResult {
  const draft = wizardState.noStopMultiSplit;
  const targetStock = safeTrim(draft?.targetStock);

  return {
    strategy: {
      ...buildSingleStockStrategyBase(targetStock),
      noStopMultiSplit: {
        targetStock,
        lowLocBudgetRatio: safeNumber(draft?.lowLocBudgetRatio),
        highLocPremiumPct: safeNumber(draft?.highLocPremiumPct),
        takeProfitPct: safeNumber(draft?.takeProfitPct),
        totalSplitCount: safeNumber(draft?.totalSplitCount),
      },
    },
    initialVrSnapshot: null,
  };
}

function buildVrBandStrategy(
  wizardState: StrategyWizardDraftInput,
  feeRatePercent: number,
): StrategyBuildResult {
  const draft = wizardState.vrBand;
  const vrMode = draft?.vrMode ?? 'lump_sum';
  // `feeRatePercent`는 `buildValidationInput` → `normalizeMetaDraft`를 거친 UI 퍼센트(%) — 여기서 `safeNumber`·`Number.isFinite`로 이중 방어하지 않는다(Rule 6 데드코드 제거).
  const normalizedFeeRate = toDecimalRate(feeRatePercent);
  const absoluteDeltaCash = roundMoney(Math.abs(safeNumber(draft?.deltaCash)));

  const vrBaseParams = {
    initialCapital: safeNumber(draft?.initialCapital),
    initialV: safeNumber(draft?.initialV),
    minOrderQty: safeNumber(draft?.minOrderQty),
    feeRate: normalizedFeeRate,
    bandRateUpper: toDecimalRate(safeNumber(draft?.bandUpperPct)),
    bandRateLower: toDecimalRate(safeNumber(draft?.bandLowerPct)),
    G: safeNumber(draft?.g),
    poolUsageRateBuy: toDecimalRate(safeNumber(draft?.poolUsagePct)),
    cycleWeeks: sanitizeVrCycleWeeks(draft?.cycleWeeks),
  };

  let vrParams: VrBandStrategyParams;

  switch (vrMode) {
    case 'accumulate':
      vrParams = {
        ...vrBaseParams,
        vrMode: 'accumulate',
        deltaCash: absoluteDeltaCash,
      };
      break;
    case 'withdraw':
      vrParams = {
        ...vrBaseParams,
        vrMode: 'withdraw',
        deltaCash: absoluteDeltaCash,
      };
      break;
    case 'lump_sum':
      vrParams = {
        ...vrBaseParams,
        vrMode: 'lump_sum',
        deltaCash: ZERO_AMOUNT,
      };
      break;
    default: {
      const exhaustiveCheck: never = vrMode;
      return exhaustiveCheck;
    }
  }

  return {
    strategy: {
      ...buildSingleStockStrategyBase(DEFAULT_VR_REFERENCE_STOCK),
      vrBand: vrParams,
    },
    initialVrSnapshot: createInitialVrSnapshot(vrParams),
  };
}

function buildStrategyFromWizardState(
  selectedStrategy: StrategyType,
  wizardState: StrategyWizardDraftInput,
  feeRatePercent: number,
): StrategyBuildResult {
  switch (selectedStrategy) {
    case 'rsi_ma_interval':
      return buildMaIntervalStrategy(wizardState);
    case 'multi_split':
      return buildMultiSplitStrategy(wizardState);
    case 'no_stop_multi_split':
      return buildNoStopMultiSplitStrategy(wizardState);
    case 'vr_band':
      return buildVrBandStrategy(wizardState, feeRatePercent);
    default: {
      const exhaustiveCheck: never = selectedStrategy;
      return exhaustiveCheck;
    }
  }
}

export function buildPortfolioDraftFromWizardState(input: {
  selectedStrategy: StrategyType;
  wizardState: StrategyWizardDraftInput;
}): PortfolioDraftBuildResult {
  const validationInput = buildValidationInput(
    input.selectedStrategy,
    input.wizardState,
  );
  const strategyBuildResult = buildStrategyFromWizardState(
    input.selectedStrategy,
    input.wizardState,
    validationInput.feeRatePercent,
  );
  const meta = normalizeMetaDraft(input.wizardState.meta);

  return {
    portfolio: {
      name: validationInput.name,
      dailyBuyAmount: validationInput.dailyBuyAmount,
      startDate: meta.startDate,
      feeRate: validationInput.feeRatePercent,
      isClosed: false,
      trades: [],
      strategy: strategyBuildResult.strategy,
      ...(strategyBuildResult.initialVrSnapshot != null
        ? { vrSnapshot: strategyBuildResult.initialVrSnapshot }
        : {}),
    },
    validationInput,
  };
}

export function hasDuplicatedSectionStocks(
  strategy: Partial<Pick<Strategy, 'ma1' | 'ma2' | 'ma3'>>,
): boolean {
  const sectionStocks = [
    safeTrim(strategy.ma1?.stock),
    safeTrim(strategy.ma2?.stock),
    safeTrim(strategy.ma3?.stock),
  ].filter((stock) => stock.length > 0);

  if (sectionStocks.length === 0) {
    return false;
  }

  return new Set(sectionStocks).size !== sectionStocks.length;
}
```

### `src/hooks/usePortfolioUiCommands.ts`

```ts
import { useCallback, useMemo } from 'react';
import type { FinalSellInput } from '@/components/SettlementModals';
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
  closePortfolio: UiMutationCommand<
    [portfolioId: string, finalSells: FinalSellInput[], additionalFee: number],
    SettlementResult | null
  >;
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
    async (
      portfolioId: string,
      finalSells: FinalSellInput[],
      additionalFee: number,
    ) => bundle.closePortfolioCommand.run(portfolioId, finalSells, additionalFee),
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
```

### `tsconfig.json`

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "jsx": "react-jsx",
    "moduleDetection": "force",
    "isolatedModules": true,
    "allowImportingTsExtensions": true,
    "allowJs": false,
    "baseUrl": ".",
    "paths": {
      "@/*": [
        "./*"
      ]
    },
    "types": [
      "vite/client",
      "vitest/globals"
    ],
    "noEmit": true
  },
  "include": [
    "App.tsx",
    "index.tsx",
    "constants.tsx",
    "types.ts",
    "vite-env.d.ts",
    "components/**/*.ts",
    "components/**/*.tsx",
    "src/**/*.ts",
    "src/**/*.tsx",
    "constants/**/*.ts",
    "contexts/**/*.ts",
    "contexts/**/*.tsx",
    "features/**/*.ts",
    "features/**/*.tsx",
    "hooks/**/*.ts",
    "hooks/**/*.tsx",
    "services/**/*.ts",
    "services/**/*.tsx",
    "types/**/*.ts",
    "types/**/*.d.ts",
    "utils/**/*.ts",
    "utils/**/*.tsx",
    "*.test.ts",
    "*.test.tsx"
  ],
  "exclude": [
    "dist",
    "node_modules",
    "docs2",
    "server",
    "supabase",
    "toss-bff"
  ]
}
```
