
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Portfolio, Trade } from './types';
import { I18N } from './constants';
import Dashboard from './components/Dashboard';
import Markets from './components/Markets';
import History from './components/History';
import StrategyCreator from './components/StrategyCreator';
import AlarmModal from './components/AlarmModal';
import PortfolioDetailsModal from './components/PortfolioDetailsModal';
import QuickInputModal from './components/QuickInputModal';
import TradeExecutionModal from './components/TradeExecutionModal';
import SettlementModals from './components/SettlementModals';
import AuthModals from './components/AuthModals';
import Landing from './components/Landing';
import { supabase, clearAuthStorage } from './services/supabase';
import { calculateTotalInvested, calculateAlreadyRealized, calculateHoldings } from './utils/portfolioCalculations';
import { fetchStockPricesWithPrev } from './services/stockService';
import { getUSSelectionHolidays } from './utils/marketUtils';
import { requestForToken, getNotificationPermission } from './services/firebase';
import { 
  LayoutDashboard, 
  BarChart3, 
  History as HistoryIcon, 
  Plus, 
  UserCircle,
  Languages
} from 'lucide-react';

const App: React.FC = () => {
  const [lang, setLang] = useState<'ko' | 'en'>('ko');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'markets' | 'history'>('dashboard');
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [userProfile, setUserProfile] = useState<{ 
    subscription_tier: string; 
    max_portfolios: number; 
    max_alarms: number;
  } | null>(null);
  const [authModal, setAuthModal] = useState<'login' | 'signup' | 'profile' | 'reset-password' | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const authModalRef = useRef(authModal);

  const [alarmTargetId, setAlarmTargetId] = useState<string | null>(null);
  const [detailsTargetId, setDetailsTargetId] = useState<string | null>(null);
  const [quickInputTargetId, setQuickInputTargetId] = useState<string | null>(null);
  const [quickInputActiveSection, setQuickInputActiveSection] = useState<1 | 2 | 3 | undefined>(undefined);
  const [executionTargetId, setExecutionTargetId] = useState<string | null>(null);
  const [hiddenHistoryIds, setHiddenHistoryIds] = useState<string[]>([]);
  const [totalValuation, setTotalValuation] = useState<number>(0);
  const [totalValuationPrev, setTotalValuationPrev] = useState<number>(0);
  const [totalValuationChange, setTotalValuationChange] = useState<number>(0);
  const [totalValuationChangePct, setTotalValuationChangePct] = useState<number>(0);

  // 주가 캐싱 관련 상수
  const STOCK_PRICE_CACHE_KEY = 'STOCK_PRICE_CACHE_V1';
  const KST_UPDATE_HOUR = 7;
  const KST_UPDATE_MINUTE = 20;
  
  // States for the 2-step termination flow
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

  // authModal의 최신 값을 ref에 동기화
  useEffect(() => {
    authModalRef.current = authModal;
  }, [authModal]);

  // 초기 다크 모드 및 Supabase 세션/포트폴리오 로딩
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    let isMounted = true;
    
    // 세션 기반 유저/포트폴리오 로딩 로직을 공통 함수로 분리
    const fetchUserData = async (sessionUser: { id: string; email?: string | null }) => {
      if (!sessionUser?.id || !isMounted) return;

      try {
        const currentUser = {
          id: sessionUser.id,
          email: sessionUser.email || '',
        };

        if (!isMounted) return;
        setUser(currentUser);

        // 사용자 프로필 (구독 정보) 가져오기
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('subscription_tier, max_portfolios, max_alarms')
          .eq('id', currentUser.id)
          .single();

        if (!profileError && profileData && isMounted) {
          setUserProfile({
            subscription_tier: profileData.subscription_tier || 'free',
            max_portfolios: profileData.max_portfolios ?? 3,
            max_alarms: profileData.max_alarms ?? 2,
          });
        } else {
          // 프로필이 없으면 기본값 설정 (free tier)
          if (isMounted) {
            setUserProfile({
              subscription_tier: 'free',
              max_portfolios: 3,
              max_alarms: 2,
            });
          }
        }

        // fetchPortfolios 함수 사용 (정규화 로직 포함)
        await fetchPortfolios(currentUser.id);
      } catch (err) {
        if (isMounted) {
          console.error('Failed to fetch user data:', err);
        }
      }
    };

    // 세션 에러 발생 시 로컬 스토리지 정리 및 상태 초기화 헬퍼 함수
    const clearAuthState = async (showAlert: boolean = true) => {
      if (!isMounted) return;
      
      console.log('[Auth] Clearing auth state due to session error');
      
      // Supabase 로컬 스토리지 키 정리 (공통 헬퍼 함수 사용)
      clearAuthStorage();
      
      // 강제 로그아웃 (에러 무시 - 이미 세션이 깨진 상태일 수 있음)
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (e) {
        console.warn('[Auth] signOut during clearAuthState failed (expected):', e);
      }
      
      // 상태 초기화
      setUser(null);
      setUserProfile(null);
      setPortfolios([]);
      
      if (showAlert) {
        alert(lang === 'ko' 
          ? '세션이 만료되었습니다. 다시 로그인해 주세요.' 
          : 'Session expired. Please log in again.');
      }
    };

    // 1. 현재 세션을 직접 확인하여 user 상태를 즉시 복구 시도 (새로고침 시 중요)
    const checkUser = async () => {
      console.log('[checkUser] 시작');
      if (!isMounted) {
        console.log('[checkUser] isMounted=false, 종료');
        return;
      }
      
      try {
        setIsLoading(true);
        console.log('[checkUser] getSession 호출 중...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        console.log('[checkUser] getSession 결과:', { 
          hasSession: !!session, 
          userId: session?.user?.id,
          email: session?.user?.email,
          error: sessionError?.message 
        });

        if (!isMounted) {
          console.log('[checkUser] isMounted=false (getSession 후), 종료');
          return;
        }

        if (sessionError) {
          if (sessionError.name !== 'AbortError') {
            console.error('[checkUser] Session error:', sessionError);
            
            // Invalid Refresh Token 등 세션 관련 에러 처리
            const errorMessage = sessionError.message?.toLowerCase() || '';
            if (
              errorMessage.includes('refresh token') ||
              errorMessage.includes('invalid') ||
              errorMessage.includes('expired') ||
              errorMessage.includes('not found')
            ) {
              console.warn('[checkUser] Session validation failed, clearing auth state');
              await clearAuthState(false); // 초기 로딩 시에는 알림 표시 안 함
              return;
            }
          }
        }

        if (session?.user) {
          console.log('[checkUser] 세션 있음, fetchUserData 호출');
          // 세션이 있으면 즉시 사용자 정보와 포트폴리오 로드
          await fetchUserData(session.user);
          console.log('[checkUser] fetchUserData 완료');
          
          // 기존 세션 복구 시에도 FCM 토큰 저장 시도 (로그인 상태 유지 중)
          if (session.user.id) {
            console.log('[FCM] Session restore detected. Trying to save FCM token for user:', session.user.id);
            saveFCMToken(session.user.id).catch((err) => {
              console.debug('[FCM] FCM token save attempt on session restore completed with error (can be null):', err);
            });
          }
        } else {
          console.log('[checkUser] 세션 없음, 상태 초기화');
          setUser(null);
          setUserProfile(null);
          setPortfolios([]);
        }
      } catch (err: any) {
        console.error('[checkUser] catch 블록 에러:', err);
        if (err?.name !== 'AbortError' && isMounted) {
          console.error('[checkUser] Init auth error:', err);
          
          // AuthApiError 등 인증 관련 에러 처리
          const errorMessage = err?.message?.toLowerCase() || '';
          if (
            errorMessage.includes('refresh token') ||
            errorMessage.includes('invalid') ||
            err?.name === 'AuthApiError'
          ) {
            await clearAuthState(false);
          }
        }
      } finally {
        console.log('[checkUser] finally 블록');
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    checkUser();

    // 2. 인증 상태 변화 감지 (로그인, 로그아웃, 토큰 갱신 등)
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        try {
          console.log('Auth state changed:', event, session?.user?.email);

          const currentUser = session?.user ?? null;

          // TOKEN_REFRESHED: 토큰이 성공적으로 갱신됨
          if (event === 'TOKEN_REFRESHED') {
            console.log('[Auth] Token refreshed successfully');
          }

          // SIGNED_IN: 로그인 성공
          if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
            // 로그인 성공 시에만 URL 해시 정리
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }

          // SIGNED_OUT: 로그아웃됨 (수동 또는 세션 만료)
          if (event === 'SIGNED_OUT') {
            console.log('[Auth] User signed out');
            setUser(null);
            setUserProfile(null);
            setPortfolios([]);
            // SIGNED_OUT 이벤트 시에는 이미 로그아웃된 상태이므로 추가 처리 불필요
            return;
          }

          if (currentUser) {
            await fetchUserData(currentUser);

            // 로그인 성공 시 FCM 토큰 저장 (SIGNED_IN 이벤트일 때만)
            if (event === 'SIGNED_IN' && currentUser.id) {
              console.log('[FCM] SIGNED_IN event detected. Trying to save FCM token for user:', currentUser.id);
              saveFCMToken(currentUser.id).catch((err) => {
                // 에러는 이미 saveFCMToken 내부에서 처리되므로 여기서는 조용히 처리
                console.debug('[FCM] FCM token save attempt on SIGNED_IN completed with error (can be null):', err);
              });
            }

            if (event === 'PASSWORD_RECOVERY' && isMounted) {
              // 비밀번호 재설정 모달 열기
              setAuthModal('reset-password');
            }

            if (event === 'USER_UPDATED' && isMounted) {
              // 비밀번호 변경 등 사용자 정보 업데이트 시 모달 닫기 및 성공 메시지
              if (authModalRef.current === 'reset-password') {
                setAuthModal(null);
                alert(lang === 'ko' ? '비밀번호가 성공적으로 변경되었습니다.' : 'Password updated successfully.');
              }
            }
          } else {
            setUser(null);
            setUserProfile(null);
            setPortfolios([]);
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError' && isMounted) {
            console.error('Auth state change error:', err);
            
            // AuthApiError (Invalid Refresh Token 등) 처리
            const errorMessage = err?.message?.toLowerCase() || '';
            if (
              errorMessage.includes('refresh token') ||
              errorMessage.includes('invalid') ||
              errorMessage.includes('expired') ||
              err?.name === 'AuthApiError'
            ) {
              console.warn('[Auth] Auth error detected in onAuthStateChange, clearing auth state');
              await clearAuthState(true);
            }
          }
        }
      },
    );

    // 3. Supabase 내부 에러 이벤트 리스너 (토큰 갱신 실패 등)
    // _recoverAndRefresh 에러를 잡기 위한 전역 에러 핸들러
    const handleAuthError = async (event: PromiseRejectionEvent) => {
      if (!isMounted) return;
      
      const errorMessage = event.reason?.message?.toLowerCase() || '';
      const errorName = event.reason?.name || '';
      
      // AuthApiError: Invalid Refresh Token 패턴 감지
      if (
        errorName === 'AuthApiError' ||
        errorMessage.includes('refresh token') ||
        errorMessage.includes('invalid refresh token')
      ) {
        console.warn('[Auth] Unhandled auth error detected:', event.reason);
        event.preventDefault(); // 콘솔 에러 방지
        await clearAuthState(true);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', handleAuthError);
    }

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
      
      // 전역 에러 핸들러 정리
      if (typeof window !== 'undefined') {
        // handleAuthError 참조를 유지하기 위해 동일한 함수를 제거해야 하지만,
        // 클로저 특성상 새로운 함수가 생성되므로 실제로는 제거되지 않을 수 있음
        // 하지만 isMounted 플래그로 인해 실행되지 않음
      }
    };
  }, [lang]);

  // 브라우저 정보 파싱 함수
  const parseDeviceInfo = (): { deviceName: string; userAgent: string; deviceType: string } => {
    if (typeof window === 'undefined' || !navigator) {
      return {
        deviceName: 'Unknown',
        userAgent: '',
        deviceType: 'web',
      };
    }

    const ua = navigator.userAgent;
    let browserName = 'Unknown Browser';
    let osName = 'Unknown OS';

    // 브라우저 감지
    if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) {
      browserName = 'Chrome';
    } else if (ua.includes('Firefox')) {
      browserName = 'Firefox';
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      browserName = 'Safari';
    } else if (ua.includes('Edg')) {
      browserName = 'Edge';
    } else if (ua.includes('OPR')) {
      browserName = 'Opera';
    }

    // OS 감지
    if (ua.includes('Windows')) {
      if (ua.includes('Windows NT 10.0')) {
        osName = 'Windows 10/11';
      } else if (ua.includes('Windows NT 6.3')) {
        osName = 'Windows 8.1';
      } else if (ua.includes('Windows NT 6.2')) {
        osName = 'Windows 8';
      } else if (ua.includes('Windows NT 6.1')) {
        osName = 'Windows 7';
      } else {
        osName = 'Windows';
      }
    } else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) {
      osName = 'macOS';
    } else if (ua.includes('Linux')) {
      osName = 'Linux';
    } else if (ua.includes('Android')) {
      osName = 'Android';
    } else if (ua.includes('iOS') || (ua.includes('iPhone') || ua.includes('iPad'))) {
      osName = 'iOS';
    }

    const deviceName = `${browserName} on ${osName}`;

    return {
      deviceName,
      userAgent: ua,
      deviceType: 'web',
    };
  };

  // FCM 토큰을 Supabase에 저장하는 함수 (디버깅 로그 포함)
  const saveFCMToken = async (userId: string): Promise<void> => {
    if (typeof window === 'undefined') {
      console.warn('[FCM] saveFCMToken called on non-browser environment. Skipping.');
      return;
    }

    console.log('[FCM] saveFCMToken called for user:', userId);

    try {
      // 알림 권한이 이미 거부된 경우 조용히 처리
      const permission = getNotificationPermission();
      console.log('[FCM] Current Notification.permission:', permission);

      if (permission === 'denied') {
        console.warn('[FCM] Notification permission was previously denied. Skipping FCM token request.');
        return;
      }

      // FCM 토큰 요청
      console.log('[FCM] Requesting FCM token via requestForToken()...');
      const token = await requestForToken();
      console.log('[FCM] requestForToken() resolved. Token:', token);
      
      if (!token) {
        // 권한이 거부되었거나 토큰을 가져올 수 없는 경우 조용히 처리
        console.warn('[FCM] Token is null/undefined. Aborting save.');
        return;
      }

      // 브라우저 정보 파싱
      const deviceInfo = parseDeviceInfo();
      console.log('[FCM] Parsed device info:', deviceInfo);

      // Supabase에 upsert (user_id와 fcm_token 기준)
      console.log('[FCM] Upserting token into user_devices...', {
        user_id: userId,
        fcm_token: token,
      });
      const { error } = await supabase
        .from('user_devices')
        .upsert(
          {
            user_id: userId,
            fcm_token: token,
            device_type: deviceInfo.deviceType,
            device_name: deviceInfo.deviceName,
            user_agent: deviceInfo.userAgent,
            is_active: true,
            // updated_at은 트리거에 의해 자동으로 갱신됨
          },
          {
            onConflict: 'user_id,fcm_token',
            ignoreDuplicates: false,
          }
        );

      if (error) {
        console.error('[FCM] Failed to save FCM token:', error);
      } else {
        console.log('[FCM] FCM token saved successfully');
      }
    } catch (error) {
      // 에러 발생 시에도 사용자 경험을 해치지 않도록 조용히 처리
      console.error('[FCM] Error saving FCM token:', error);
    }
  };

  // 1. 포트폴리오 데이터를 가져오는 함수
  const fetchPortfolios = async (userId: string) => {
    try {
      // 세션 유효성 먼저 체크
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !sessionData?.session) {
        console.error('[fetchPortfolios] 세션 없음 또는 에러:', sessionError?.message);
        console.log('[fetchPortfolios] 세션 상태:', sessionData);
        // 세션이 없으면 데이터를 가져오지 않음 (RLS에서 어차피 차단됨)
        return;
      }

      // 세션의 user.id와 요청된 userId가 일치하는지 확인
      if (sessionData.session.user.id !== userId) {
        console.warn('[fetchPortfolios] 세션 user.id 불일치:', {
          sessionUserId: sessionData.session.user.id,
          requestedUserId: userId
        });
      }

      console.log('[fetchPortfolios] 데이터 요청 시작, userId:', userId);

      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[fetchPortfolios] 데이터 로드 에러:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        return;
      }

      console.log('[fetchPortfolios] 응답 데이터 개수:', data?.length ?? 0);

      if (data) {
        // DB의 snake_case를 UI에서 사용하는 camelCase 구조로 변환하여 저장
        // (Supabase 테이블은 snake_case, 프론트엔드는 camelCase 사용)
        // DB 컬럼명(daily_buy_amount)을 우선적으로 사용
        const formattedData = (data as any[]).map((item) => ({
          ...item,
          dailyBuyAmount: item.daily_buy_amount ?? item.dailyBuyAmount ?? 0,
          startDate: item.start_date ?? item.startDate ?? '',
          feeRate: item.fee_rate ?? item.feeRate ?? 0.25,
          isClosed: item.is_closed ?? item.isClosed ?? false,
          closedAt: item.closed_at ?? item.closedAt ?? undefined,
          finalSellAmount: item.final_sell_amount ?? item.finalSellAmount ?? undefined,
          alarmconfig: item.alarm_config ?? item.alarmconfig ?? undefined,
          strategy: item.strategy, // strategy 컬럼은 이미 일치
        }));
        setPortfolios(formattedData as Portfolio[]);
        console.log('[fetchPortfolios] 포트폴리오 상태 업데이트 완료');
      }
    } catch (err) {
      console.error('[fetchPortfolios] 예기치 못한 에러:', err);
    }
  };


  // 전체 보유 수량 집계 (포트폴리오/거래 변경시에만 재계산)
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

  // 전체 포트폴리오의 현재 평가액 및 24h 변동 계산 + 캐싱
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
        // 한국 시간(KST) 기준 날짜/시간 계산 (KST는 UTC+9, DST 없음)
        const nowUtc = new Date();
        const nowKst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
        const year = nowKst.getUTCFullYear();
        const month = nowKst.getUTCMonth() + 1;
        const day = nowKst.getUTCDate();
        const hours = nowKst.getUTCHours();
        const minutes = nowKst.getUTCMinutes();

        const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const minutesOfDay = hours * 60 + minutes;

        // 전일(미국 시장) 공휴일 여부 확인
        const yesterday = new Date(nowKst.getTime() - 24 * 60 * 60 * 1000);
        const yYear = yesterday.getUTCFullYear();
        const yMonth = yesterday.getUTCMonth() + 1;
        const yDay = yesterday.getUTCDate();
        const yesterdayStr = `${yYear}-${String(yMonth).padStart(2, '0')}-${String(yDay).padStart(2, '0')}`;

        // 연도별 미국 휴장일 목록 (부활절 제외 9개, 대체 휴일 포함)
        const usHolidaysForYear = getUSSelectionHolidays(yYear);
        const wasHolidayYesterday = usHolidaysForYear.includes(yesterdayStr);

        // KST 기준 요일 (0=Sun..6=Sat)
        const kstDayOfWeek = nowKst.getUTCDay();

        const isAfterUpdateTime =
          minutesOfDay >= KST_UPDATE_HOUR * 60 + KST_UPDATE_MINUTE;

        // 화(2)~토(6) 07:20 이후 && 전날이 휴일이 아닌 경우에만 새로운 종가가 있을 가능성이 높다고 가정
        const isPotentialNewCloseAvailable =
          kstDayOfWeek >= 2 &&
          kstDayOfWeek <= 6 &&
          isAfterUpdateTime &&
          !wasHolidayYesterday;

        // localStorage 캐시 확인
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
          !cachedPrices || // 캐시 없음
          (isPotentialNewCloseAvailable && !cachedPrices); // 새로운 종가가 있을 수 있는데 캐시도 없는 경우

        if (shouldFetchFromServer) {
          priceMap = await fetchStockPricesWithPrev(symbols);

          // 캐시에 저장
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
          // 캐시 사용 (휴장일/일~월/07:20 이전 등)
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

  const handleAddPortfolio = async (newP: Omit<Portfolio, 'id'>) => {
    if (!user) {
      alert("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
      return;
    }

    // 포트폴리오 개수 제한 체크 (진행 중인 포트폴리오만 카운트)
    const activePortfolios = portfolios.filter(p => !p.isClosed);
    const maxPortfolios = userProfile?.max_portfolios ?? 3;
    
    if (maxPortfolios !== -1 && activePortfolios.length >= maxPortfolios) {
      const tierName = userProfile?.subscription_tier === 'free' ? '무료' : userProfile?.subscription_tier;
      alert(lang === 'ko' 
        ? `${tierName} 플랜에서는 최대 ${maxPortfolios}개의 포트폴리오만 생성할 수 있습니다.\n현재 ${activePortfolios.length}개의 진행 중인 포트폴리오가 있습니다.`
        : `You can only create up to ${maxPortfolios} portfolios on the ${tierName} plan.\nYou currently have ${activePortfolios.length} active portfolios.`
      );
      return;
    }

    // Supabase 테이블 컬럼명이 snake_case이므로 모든 필드를 매핑
    const {
      dailyBuyAmount,
      startDate,
      feeRate,
      isClosed,
      closedAt,
      finalSellAmount,
      alarmconfig,
      ...rest
    } = newP;

    // 1. 데이터 준비
    const payload = {
      ...rest,
      id: crypto.randomUUID(),
      user_id: user.id,
      daily_buy_amount: dailyBuyAmount,
      start_date: startDate,
      fee_rate: feeRate,
      is_closed: isClosed,
      closed_at: closedAt || null,
      final_sell_amount: finalSellAmount || null,
      alarm_config: alarmconfig || null,
    };

    console.log('전송 직전 최종 확인:', payload);
    
    try {
      // 2. 여기서 브라우저가 일시정지되는지 확인하세요
      // alert('지금부터 Supabase로 전송을 시도합니다!'); 

      const { data, error } = await supabase
        .from('portfolios')
        .insert([payload])
        .select();

      if (error) {
        console.error('Supabase 에러 발생:', error);
        alert(`저장 실패: ${error.message}`);
        return;
      }

      console.log('서버 응답 데이터:', data);
      if (data && data.length > 0) {
        // Supabase 컬럼명이 snake_case이므로 모든 필드를 camelCase로 정규화
        // DB 컬럼명(daily_buy_amount)을 우선적으로 사용
        const normalized = (data as any[]).map((row) => ({
          ...row,
          dailyBuyAmount: row.daily_buy_amount ?? row.dailyBuyAmount ?? 0,
          startDate: row.start_date ?? row.startDate ?? '',
          feeRate: row.fee_rate ?? row.feeRate ?? 0.25,
          isClosed: row.is_closed ?? row.isClosed ?? false,
          closedAt: row.closed_at ?? row.closedAt ?? undefined,
          finalSellAmount: row.final_sell_amount ?? row.finalSellAmount ?? undefined,
          alarmconfig: row.alarmconfig ?? row.alarm_config ?? undefined,
        }));
        setPortfolios(prev => [...prev, ...normalized]);
        setIsCreatorOpen(false);
        alert('저장 성공!');
      }

    } catch (err) {
      console.error('네트워크/코드 실행 에러:', err);
      alert('시스템 에러가 발생했습니다.');
    }
  };

  const handleClosePortfolio = async (finalSells: Array<{ stock: string; quantity: number; price: number; fee: number }>, additionalFee: number) => {
    const portfolio = portfolios.find(p => p.id === terminateTargetId);
    if (!portfolio || !user || !terminateTargetId) return;

    // 1. 총 투자금 계산: 모든 buy 타입 거래 합계
    const totalInvested = calculateTotalInvested(portfolio);

    // 2. 기 회수금 계산: 기존 sell 타입 거래 합계
    const alreadyRealized = calculateAlreadyRealized(portfolio);

    // 3. 최종 매도금 계산: 사용자 입력한 각 종목의 (수량 * 단가) - 수수료 합계
    const finalSellAmount = finalSells.reduce((sum, fs) => {
      const sellAmount = fs.price * fs.quantity;
      const netAmount = sellAmount - fs.fee;
      return sum + netAmount;
    }, 0) - additionalFee; // 추가 수수료 차감

    // 4. 최종 회수금 = 기 회수금 + 최종 매도금
    const totalReturn = alreadyRealized + finalSellAmount;

    // 5. 최종 수익금 = 최종 회수금 - 총 투자금
    const totalProfit = totalReturn - totalInvested;

    // 6. 최종 수익률 = (최종 회수금 / 총 투자금 - 1) * 100
    const yieldRate = totalInvested > 0 ? ((totalReturn / totalInvested) - 1) * 100 : 0;

    // 7. 최종 매도 거래를 Trade로 생성 (정산 상세 보기용)
    const endDate = new Date();
    const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    const finalSellTrades: Trade[] = finalSells.map((fs, index) => ({
      id: `final-${endDate.getTime()}-${index}`,
      type: 'sell',
      stock: fs.stock,
      date: endDateStr,
      price: fs.price,
      quantity: fs.quantity,
      fee: fs.fee,
    }));

    // 8. Show Result
    setSettlementResult({
      portfolio,
      totalInvested,
      alreadyRealized,
      finalSellAmount,
      totalReturn,
      profit: totalProfit,
      yieldRate
    });

    // 9. Actually update state (trades에 최종 매도 거래 포함)
    const updated = {
      ...portfolio,
      isClosed: true,
      closedAt: endDate.toISOString(),
      finalSellAmount: finalSellAmount + additionalFee, // 총 매도금액 (수수료 포함)
      trades: [...portfolio.trades, ...finalSellTrades],
    };

    // 10. portfolio_history 테이블에 이력 저장 (성공 시에만 포트폴리오 종료 처리)
    const startDate = portfolio.startDate ? new Date(portfolio.startDate) : new Date();

    const { error: historyError } = await supabase
      .from('portfolio_history')
      .insert([{
        portfolio_id: terminateTargetId,
        user_id: user.id,
        portfolio_name: portfolio.name,
        total_invested: totalInvested,
        total_return: totalReturn,
        total_profit: totalProfit,
        yield_rate: yieldRate,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString(),
        strategy_detail: {
          strategy: portfolio.strategy,
          daily_buy_amount: portfolio.dailyBuyAmount,
          fee_rate: portfolio.feeRate,
          alarmconfig: portfolio.alarmconfig,
        },
      }]);

    if (historyError) {
      console.error('Failed to save portfolio history', historyError);
      alert(
        lang === 'ko'
          ? '이력 저장에 실패하여 포트폴리오를 종료하지 않았습니다. 다시 시도해주세요.'
          : 'Failed to save portfolio history. The portfolio was not closed. Please try again.'
      );
      return;
    }

    // 11. portfolios 테이블 업데이트 (history 저장 성공 이후)
    const { error: updateError } = await supabase
      .from('portfolios')
      .update({
        is_closed: true,
        closed_at: updated.closedAt,
        final_sell_amount: updated.finalSellAmount,
        trades: updated.trades,
      })
      .eq('id', terminateTargetId);

    if (updateError) {
      console.error('Failed to close portfolio', updateError);
      alert(lang === 'ko' ? '전략 종료 저장에 실패했습니다.' : 'Failed to save termination.');
      return;
    }

    setPortfolios(prev => prev.map(p => 
      p.id === terminateTargetId ? updated : p
    ));
    setTerminateTargetId(null);
  };

  const handleUpdatePortfolio = async (updated: Portfolio) => {
    const { error } = await supabase
      .from('portfolios')
      .update({
        name: updated.name,
        daily_buy_amount: updated.dailyBuyAmount,
        start_date: updated.startDate,
        fee_rate: updated.feeRate,
        strategy: updated.strategy,
        trades: updated.trades,
        is_closed: updated.isClosed,
        closed_at: updated.closedAt || null,
        final_sell_amount: updated.finalSellAmount || null,
        alarm_config: updated.alarmconfig || null,
      })
      .eq('id', updated.id);

    if (error) {
      console.error('Failed to update portfolio', error);
      alert(lang === 'ko' ? '포트폴리오 업데이트에 실패했습니다.' : 'Failed to update portfolio.');
      return;
    }

    setPortfolios(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const handleAddTrade = async (portfolioId: string, trade: Trade) => {
    const target = portfolios.find(p => p.id === portfolioId);
    if (!target) return;

    const updatedTrades = [trade, ...target.trades];

    const { error } = await supabase
      .from('portfolios')
      .update({ trades: updatedTrades })
      .eq('id', portfolioId);

    if (error) {
      console.error('Failed to add trade', error);
      alert(lang === 'ko' ? '거래 추가에 실패했습니다.' : 'Failed to add trade.');
      return;
    }

    setPortfolios(prev => prev.map(p => 
      p.id === portfolioId ? { ...p, trades: updatedTrades } : p
    ));
  };

  const handleDeleteTrade = async (portfolioId: string, tradeId: string) => {
    const target = portfolios.find(p => p.id === portfolioId);
    if (!target) return;

    const updatedTrades = target.trades.filter(t => t.id !== tradeId);

    const { error } = await supabase
      .from('portfolios')
      .update({ trades: updatedTrades })
      .eq('id', portfolioId);

    if (error) {
      console.error('Failed to delete trade', error);
      alert(lang === 'ko' ? '거래 삭제에 실패했습니다.' : 'Failed to delete trade.');
      return;
    }

    setPortfolios(prev => prev.map(p => {
      if (p.id === portfolioId) {
        return {
          ...p,
          trades: updatedTrades,
        };
      }
      return p;
    }));
  };

  const handleDeletePortfolio = async (id: string) => {
    // 사용자 확인
    const confirmMessage = lang === 'ko' 
      ? '정말로 이 포트폴리오를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.'
      : 'Are you sure you want to delete this portfolio? This action cannot be undone.';
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('portfolios')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Failed to delete portfolio', error);
        const errorMessage = lang === 'ko' 
          ? `포트폴리오 삭제에 실패했습니다: ${error.message}`
          : `Failed to delete portfolio: ${error.message}`;
        alert(errorMessage);
        return;
      }

      // UI에서 즉시 제거
      setPortfolios(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Unexpected error while deleting portfolio', err);
      const errorMessage = lang === 'ko' 
        ? '포트폴리오 삭제 중 예기치 못한 오류가 발생했습니다.'
        : 'An unexpected error occurred while deleting the portfolio.';
      alert(errorMessage);
    }
  };

  const currentAlarmPortfolio = portfolios.find(p => p.id === alarmTargetId);
  const currentDetailsPortfolio = portfolios.find(p => p.id === detailsTargetId);
  const currentQuickInputPortfolio = portfolios.find(p => p.id === quickInputTargetId);
  const currentExecutionPortfolio = portfolios.find(p => p.id === executionTargetId);
  const currentTerminatePortfolio = portfolios.find(p => p.id === terminateTargetId);

  return (
    <div className={`min-h-screen transition-colors duration-500 bg-slate-50 dark:bg-slate-950 dark:text-slate-200`}>
      <div className="pb-32">
        
        {/* Header */}
        <header className="sticky top-0 z-40 w-full glass px-6 md:px-12 py-5 flex items-center justify-between border-b border-slate-200/50 dark:border-white/10">
          <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setActiveTab('dashboard')}>
            <div className="w-11 h-11 relative flex items-center justify-center group-hover:scale-110 transition-all duration-300">
               <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-indigo-600 to-purple-500 rounded-xl shadow-lg shadow-blue-500/20 transform -rotate-3 group-hover:rotate-0 transition-transform"></div>
               <div className="relative z-10 text-white font-black text-xl flex items-baseline select-none">
                 <span className="tracking-tighter">B</span>
                 <span className="text-blue-300 -ml-1.5 opacity-90 transform translate-y-0.5">D</span>
               </div>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-black tracking-tight dark:text-white uppercase leading-none mb-1">BUY THE DIP</h1>
              <span className="text-[9px] font-black text-blue-500 tracking-[0.3em] uppercase block opacity-80">Premium Pro</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-8">
            <button 
              onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
              className="px-4 py-2 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-black uppercase transition-all hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2"
            >
              <Languages size={14} />
              {lang}
            </button>
            
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="w-10 h-10 rounded-full flex items-center justify-center glass hover:scale-110 transition-all text-lg"
            >
              {isDarkMode ? '☀️' : '🌙'}
            </button>

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
          {activeTab === 'dashboard' && (
            user ? (
              <Dashboard 
                lang={lang}
                portfolios={portfolios.filter(p => !p.isClosed)} 
                onClosePortfolio={(id) => setTerminateTargetId(id)}
                onDeletePortfolio={handleDeletePortfolio}
                onUpdatePortfolio={handleUpdatePortfolio}
                onOpenCreator={() => setIsCreatorOpen(true)}
                onOpenAlarm={(id) => setAlarmTargetId(id)}
                onOpenDetails={(id) => setDetailsTargetId(id)}
                onOpenQuickInput={(id, activeSection) => {
                  setQuickInputTargetId(id);
                  setQuickInputActiveSection(activeSection);
                }}
                onOpenExecution={(id) => setExecutionTargetId(id)}
                totalValuation={totalValuation}
                totalValuationChange={totalValuationChange}
                totalValuationChangePct={totalValuationChangePct}
              />
            ) : (
              <Landing 
                lang={lang}
                onOpenSignup={() => setAuthModal('signup')}
                onOpenLogin={() => setAuthModal('login')}
              />
            )
          )}
          {activeTab === 'markets' && <Markets lang={lang} portfolios={portfolios} />}
          {activeTab === 'history' && (
            <History 
              lang={lang} 
              portfolios={portfolios.filter(p => p.isClosed && !hiddenHistoryIds.includes(p.id))} 
              onOpenDetails={(id) => setDetailsTargetId(id)}
              onDeleteHistory={async (portfolioId) => {
                if (!user) return;
                try {
                  const { error } = await supabase
                    .from('portfolio_history')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('portfolio_id', portfolioId);
                  if (error) {
                    console.error('Failed to delete portfolio history record', error);
                    alert(lang === 'ko' ? '종료 내역 삭제에 실패했습니다.' : 'Failed to delete history record.');
                    return;
                  }
                  setHiddenHistoryIds(prev => [...prev, portfolioId]);
                } catch (err) {
                  console.error('Unexpected error deleting history record', err);
                  alert(lang === 'ko' ? '종료 내역 삭제 중 오류가 발생했습니다.' : 'Unexpected error while deleting history record.');
                }
              }}
              onClearHistory={async () => {
                if (!user) return;
                const msg = lang === 'ko'
                  ? '모든 종료 내역을 삭제하시겠습니까? (포트폴리오 자체는 삭제되지 않습니다)'
                  : 'Delete all history records? Original portfolios will not be deleted.';
                if (!window.confirm(msg)) return;
                try {
                  const { error } = await supabase
                    .from('portfolio_history')
                    .delete()
                    .eq('user_id', user.id);
                  if (error) {
                    console.error('Failed to clear portfolio history', error);
                    alert(lang === 'ko' ? '종료 내역 전체 삭제에 실패했습니다.' : 'Failed to clear history.');
                    return;
                  }
                  const closedIds = portfolios.filter(p => p.isClosed).map(p => p.id);
                  setHiddenHistoryIds(closedIds);
                } catch (err) {
                  console.error('Unexpected error clearing history', err);
                  alert(lang === 'ko' ? '종료 내역 삭제 중 오류가 발생했습니다.' : 'Unexpected error while clearing history.');
                }
              }}
            />
          )}
        </main>

        {/* Unified Floating Navigation Bar - Reordered & Wallet Removed */}
        <div className="floating-nav w-[calc(100%-3rem)] md:w-auto">
          <nav className="glass rounded-full px-4 py-3 flex items-center gap-2 md:gap-6 shadow-2xl border border-white/10 premium-shadow min-w-[320px] justify-center">
            <NavIcon active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={22} />} label={t.dashboard} />
            <NavIcon active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<HistoryIcon size={22} />} label={t.history} />
            <NavIcon active={activeTab === 'markets'} onClick={() => setActiveTab('markets')} icon={<BarChart3 size={22} />} label={t.markets} />
            
            <div className="mx-1">
              <button 
                onClick={() => setIsCreatorOpen(true)} 
                className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-700 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-500/40 hover:scale-110 active:scale-95 transition-transform border-4 border-white dark:border-slate-900 p-3"
              >
                <Plus size={28} strokeWidth={3} />
              </button>
            </div>
          </nav>
        </div>

        {isCreatorOpen && <StrategyCreator lang={lang} onClose={() => setIsCreatorOpen(false)} onSave={handleAddPortfolio} />}
        {currentAlarmPortfolio && <AlarmModal lang={lang} portfolio={currentAlarmPortfolio} onClose={() => setAlarmTargetId(null)} onSave={(config) => { handleUpdatePortfolio({ ...currentAlarmPortfolio, alarmconfig: config }); setAlarmTargetId(null); }} />}
        {currentDetailsPortfolio && (
          <PortfolioDetailsModal 
            lang={lang} 
            portfolio={currentDetailsPortfolio} 
            onClose={() => setDetailsTargetId(null)} 
            onDeleteTrade={(tid) => handleDeleteTrade(currentDetailsPortfolio.id, tid)} 
            isHistory={currentDetailsPortfolio.isClosed}
          />
        )}
        {currentQuickInputPortfolio && <QuickInputModal lang={lang} portfolio={currentQuickInputPortfolio} activeSection={quickInputActiveSection} onClose={() => { setQuickInputTargetId(null); setQuickInputActiveSection(undefined); }} onSave={(trade) => { handleAddTrade(currentQuickInputPortfolio.id, trade); setQuickInputTargetId(null); setQuickInputActiveSection(undefined); }} />}
        {currentExecutionPortfolio && <TradeExecutionModal lang={lang} portfolio={currentExecutionPortfolio} onClose={() => setExecutionTargetId(null)} onSave={(trade) => { handleAddTrade(currentExecutionPortfolio.id, trade); setExecutionTargetId(null); }} />}
        
        {/* Termination Flow Modals */}
        {currentTerminatePortfolio && (
          <SettlementModals.TerminationInput 
            lang={lang} 
            portfolio={currentTerminatePortfolio} 
            onClose={() => setTerminateTargetId(null)} 
            onSave={(finalSells, additionalFee) => handleClosePortfolio(finalSells, additionalFee)} 
          />
        )}
        {settlementResult && (
          <SettlementModals.Result 
            lang={lang} 
            result={settlementResult} 
            onClose={() => setSettlementResult(null)} 
          />
        )}
        
        {authModal && (
          <AuthModals 
            lang={lang} 
            type={authModal} 
            onClose={() => setAuthModal(null)} 
            onSwitchType={(type) => setAuthModal(type)} 
            onLogin={async (u) => { 
              setUser(u); 
              setAuthModal('profile'); 

              const { data, error } = await supabase
                .from('portfolios')
                .select('*')
                .eq('user_id', u.id)
                .order('created_at', { ascending: false });

              if (!error && data) {
                // Supabase 컬럼명이 snake_case이므로 모든 필드를 camelCase로 정규화
                // DB 컬럼명(daily_buy_amount)을 우선적으로 사용
                const normalized = (data as any[]).map((row) => ({
                  ...row,
                  dailyBuyAmount: row.daily_buy_amount ?? row.dailyBuyAmount ?? 0,
                  startDate: row.start_date ?? row.startDate ?? '',
                  feeRate: row.fee_rate ?? row.feeRate ?? 0.25,
                  isClosed: row.is_closed ?? row.isClosed ?? false,
                  closedAt: row.closed_at ?? row.closedAt ?? undefined,
                  finalSellAmount: row.final_sell_amount ?? row.finalSellAmount ?? undefined,
                  alarmconfig: row.alarm_config ?? row.alarmconfig ?? undefined,
                }));
                setPortfolios(normalized as Portfolio[]);
              }
            }}
            onLogout={async () => { 
              try {
                const { error } = await supabase.auth.signOut();
                
                if (error) {
                  console.error('Logout error:', error);
                  // 에러가 발생해도 상태는 초기화 (세션이 이미 만료되었을 수 있음)
                }
                
                // 로그아웃 성공 또는 에러와 관계없이 상태 초기화
                setUser(null); 
                setUserProfile(null);
                setPortfolios([]); 
                setAuthModal(null);

                // 배포 환경 포함 전체 상태를 확실히 초기화
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              } catch (err) {
                console.error('Unexpected logout error:', err);
                // 예상치 못한 에러가 발생해도 상태는 초기화
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
          />
        )}
      </div>
    </div>
  );
};

interface NavIconProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const NavIcon: React.FC<NavIconProps> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1 group transition-all px-2 md:px-4">
    <div className={`p-2.5 rounded-xl transition-all duration-300 ${active ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
      {icon}
    </div>
    <span className={`text-[9px] font-black uppercase tracking-tighter hidden md:block transition-colors ${active ? 'text-blue-500' : 'text-slate-500'}`}>{label}</span>
  </button>
);

export default App;
