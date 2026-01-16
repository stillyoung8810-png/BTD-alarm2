
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
import { supabase } from './services/supabase';
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
  const [authModal, setAuthModal] = useState<'login' | 'signup' | 'profile' | 'reset-password' | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const authModalRef = useRef(authModal);

  const [alarmTargetId, setAlarmTargetId] = useState<string | null>(null);
  const [detailsTargetId, setDetailsTargetId] = useState<string | null>(null);
  const [quickInputTargetId, setQuickInputTargetId] = useState<string | null>(null);
  const [executionTargetId, setExecutionTargetId] = useState<string | null>(null);
  
  // States for the 2-step termination flow
  const [terminateTargetId, setTerminateTargetId] = useState<string | null>(null);
  const [settlementResult, setSettlementResult] = useState<{
    portfolio: Portfolio;
    totalInvested: number;
    profit: number;
    yieldRate: number;
    finalSellAmount: number;
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

        // fetchPortfolios 함수 사용 (정규화 로직 포함)
        if (!isMounted) return;
        const { data, error } = await supabase
          .from('portfolios')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false });

        if (!isMounted) return;
        if (!error && data) {
          // Supabase 컬럼명이 snake_case이므로 모든 필드를 camelCase로 정규화
          const normalized = (data as any[]).map((row) => ({
            ...row,
            dailyBuyAmount: row.dailyBuyAmount ?? row.daily_buy_amount ?? 0,
            startDate: row.startDate ?? row.start_date ?? '',
            feeRate: row.feeRate ?? row.fee_rate ?? 0.25,
            isClosed: row.isClosed ?? row.is_closed ?? false,
            closedAt: row.closedAt ?? row.closed_at ?? undefined,
            finalSellAmount: row.finalSellAmount ?? row.final_sell_amount ?? undefined,
            alarmConfig: row.alarmConfig ?? row.alarm_config ?? undefined,
          }));
          setPortfolios(normalized as Portfolio[]);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to fetch user data:', err);
        }
      }
    };

    const initAuthAndData = async () => {
      try {
        if (!isMounted) return;
        setIsLoading(true);

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (sessionError) {
          if (sessionError.name !== 'AbortError') {
            console.error('Session error:', sessionError);
          }
        }

        if (session?.user) {
          await fetchUserData(session.user);
        } else {
          setUser(null);
          setPortfolios([]);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError' && isMounted) {
          console.error('Init auth error:', err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initAuthAndData();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        try {
          console.log('Auth state changed:', event, session?.user?.email);

          if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
            // 로그인 성공 시에만 URL 해시 정리
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }

          if (session?.user) {
            await fetchUserData(session.user);

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
            setPortfolios([]);
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError' && isMounted) {
            console.error('Auth state change error:', err);
          }
        }
      },
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // 1. 포트폴리오 데이터를 가져오는 함수
  const fetchPortfolios = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('데이터 로드 에러:', error.message);
        return;
      }

      if (data) {
        // DB의 snake_case를 UI에서 사용하는 camelCase 구조로 변환하여 저장
        // (Supabase 테이블은 snake_case, 프론트엔드는 camelCase 사용)
        const formattedData = (data as any[]).map((item) => ({
          ...item,
          dailyBuyAmount: item.dailyBuyAmount ?? item.daily_buy_amount ?? 0,
          startDate: item.startDate ?? item.start_date ?? '',
          feeRate: item.feeRate ?? item.fee_rate ?? 0.25,
          isClosed: item.isClosed ?? item.is_closed ?? false,
          closedAt: item.closedAt ?? item.closed_at ?? undefined,
          finalSellAmount: item.finalSellAmount ?? item.final_sell_amount ?? undefined,
          alarmConfig: item.alarmConfig ?? item.alarm_config ?? undefined,
          strategy: item.strategy, // strategy 컬럼은 이미 일치
        }));
        setPortfolios(formattedData as Portfolio[]);
      }
    } catch (err) {
      console.error('예기치 못한 에러:', err);
    }
  };

  // 2. 로그인 상태가 변경될 때마다 데이터를 새로 고침
  useEffect(() => {
    if (user) {
      fetchPortfolios(user.id);
    } else {
      setPortfolios([]);
    }
  }, [user]);

  const totalValuation = useMemo(() => {
    return portfolios.reduce((sum, p) => {
      const invested = p.trades.reduce((tSum, t) => tSum + (t.price * t.quantity), 0);
      return sum + invested;
    }, 0);
  }, [portfolios]);

  const handleAddPortfolio = async (newP: Omit<Portfolio, 'id'>) => {
    if (!user) {
      alert("로그인 세션이 만료되었습니다. 다시 로그인해주세요.");
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
      alarmConfig,
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
      alarm_config: alarmConfig || null,
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
        const normalized = (data as any[]).map((row) => ({
          ...row,
          dailyBuyAmount: row.dailyBuyAmount ?? row.daily_buy_amount ?? 0,
          startDate: row.startDate ?? row.start_date ?? '',
          feeRate: row.feeRate ?? row.fee_rate ?? 0.25,
          isClosed: row.isClosed ?? row.is_closed ?? false,
          closedAt: row.closedAt ?? row.closed_at ?? undefined,
          finalSellAmount: row.finalSellAmount ?? row.final_sell_amount ?? undefined,
          alarmConfig: row.alarmConfig ?? row.alarm_config ?? undefined,
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

  const handleClosePortfolio = async (id: string, sellAmount: number, fee: number) => {
    const portfolio = portfolios.find(p => p.id === id);
    if (!portfolio) return;

    const totalInvested = portfolio.trades.reduce((sum, t) => sum + (t.price * t.quantity), 0);
    const profit = sellAmount - totalInvested - fee;
    const yieldRate = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    // 1. Show Result
    setSettlementResult({
      portfolio,
      totalInvested,
      profit,
      yieldRate,
      finalSellAmount: sellAmount
    });

    // 2. Actually update state
    const updated = {
      ...portfolio,
      isClosed: true,
      closedAt: new Date().toISOString(),
      finalSellAmount: sellAmount,
    };

    const { error } = await supabase
      .from('portfolios')
      .update({
        is_closed: true,
        closed_at: updated.closedAt,
        final_sell_amount: sellAmount,
      })
      .eq('id', id);

    if (error) {
      console.error('Failed to close portfolio', error);
      alert(lang === 'ko' ? '전략 종료 저장에 실패했습니다.' : 'Failed to save termination.');
      return;
    }

    setPortfolios(prev => prev.map(p => 
      p.id === id ? updated : p
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
        alarm_config: updated.alarmConfig || null,
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
                onUpdatePortfolio={handleUpdatePortfolio}
                onOpenCreator={() => setIsCreatorOpen(true)}
                onOpenAlarm={(id) => setAlarmTargetId(id)}
                onOpenDetails={(id) => setDetailsTargetId(id)}
                onOpenQuickInput={(id) => setQuickInputTargetId(id)}
                onOpenExecution={(id) => setExecutionTargetId(id)}
                totalValuation={totalValuation}
              />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8">
                <div className="glass max-w-xl w-full px-10 py-12 rounded-[3rem] border border-white/10 bg-slate-900/40">
                  <p className="text-[11px] font-black text-blue-400 uppercase tracking-[0.3em] mb-3">
                    {lang === 'ko' ? '로그인이 필요합니다' : 'Sign in required'}
                  </p>
                  <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-4">
                    {lang === 'ko'
                      ? '나만의 BUY THE DIP 전략을 저장하고 관리하세요.'
                      : 'Save and manage your own BUY THE DIP strategies.'}
                  </h2>
                  <p className="text-slate-400 text-sm md:text-base font-medium leading-relaxed mb-8">
                    {lang === 'ko'
                      ? '이메일 또는 소셜 계정으로 로그인하면, 언제 어디서든 동일한 포트폴리오를 불러올 수 있습니다.'
                      : 'Log in with email or social accounts to access your portfolios from anywhere.'}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button
                      onClick={() => setAuthModal('signup')}
                      className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.25em] shadow-xl shadow-blue-500/40 hover:scale-[1.03] active:scale-95 transition-all"
                    >
                      {lang === 'ko' ? '무료로 시작하기' : 'Start for free'}
                    </button>
                    <button
                      onClick={() => setAuthModal('login')}
                      className="px-8 py-4 bg-transparent text-slate-200 rounded-2xl font-black text-xs uppercase tracking-[0.25em] border border-white/15 hover:bg-white/5 transition-all"
                    >
                      {lang === 'ko' ? '이미 계정이 있으신가요? 로그인' : 'Already have an account? Log in'}
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
          {activeTab === 'markets' && <Markets lang={lang} />}
          {activeTab === 'history' && (
            <History 
              lang={lang} 
              portfolios={portfolios.filter(p => p.isClosed)} 
              onOpenDetails={(id) => setDetailsTargetId(id)}
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
                className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-700 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-500/40 hover:scale-110 active:scale-95 transition-all border-4 border-white dark:border-slate-900"
              >
                <Plus size={28} strokeWidth={3} />
              </button>
            </div>
          </nav>
        </div>

        {isCreatorOpen && <StrategyCreator lang={lang} onClose={() => setIsCreatorOpen(false)} onSave={handleAddPortfolio} />}
        {currentAlarmPortfolio && <AlarmModal lang={lang} portfolio={currentAlarmPortfolio} onClose={() => setAlarmTargetId(null)} onSave={(config) => { handleUpdatePortfolio({ ...currentAlarmPortfolio, alarmConfig: config }); setAlarmTargetId(null); }} />}
        {currentDetailsPortfolio && <PortfolioDetailsModal lang={lang} portfolio={currentDetailsPortfolio} onClose={() => setDetailsTargetId(null)} onDeleteTrade={(tid) => handleDeleteTrade(currentDetailsPortfolio.id, tid)} />}
        {currentQuickInputPortfolio && <QuickInputModal lang={lang} portfolio={currentQuickInputPortfolio} onClose={() => setQuickInputTargetId(null)} onSave={(trade) => { handleAddTrade(currentQuickInputPortfolio.id, trade); setQuickInputTargetId(null); }} />}
        {currentExecutionPortfolio && <TradeExecutionModal lang={lang} portfolio={currentExecutionPortfolio} onClose={() => setExecutionTargetId(null)} onSave={(trade) => { handleAddTrade(currentExecutionPortfolio.id, trade); setExecutionTargetId(null); }} />}
        
        {/* Termination Flow Modals */}
        {currentTerminatePortfolio && (
          <SettlementModals.TerminationInput 
            lang={lang} 
            portfolio={currentTerminatePortfolio} 
            onClose={() => setTerminateTargetId(null)} 
            onSave={(amount, fee) => handleClosePortfolio(currentTerminatePortfolio.id, amount, fee)} 
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
                const normalized = (data as any[]).map((row) => ({
                  ...row,
                  dailyBuyAmount: row.dailyBuyAmount ?? row.daily_buy_amount ?? 0,
                  startDate: row.startDate ?? row.start_date ?? '',
                  feeRate: row.feeRate ?? row.fee_rate ?? 0.25,
                  isClosed: row.isClosed ?? row.is_closed ?? false,
                  closedAt: row.closedAt ?? row.closed_at ?? undefined,
                  finalSellAmount: row.finalSellAmount ?? row.final_sell_amount ?? undefined,
                  alarmConfig: row.alarmConfig ?? row.alarm_config ?? undefined,
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
