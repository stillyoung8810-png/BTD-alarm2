
import React, { useState, useEffect, useMemo } from 'react';
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
  const [authModal, setAuthModal] = useState<'login' | 'signup' | 'profile' | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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

  // 초기 다크 모드 및 Supabase 세션/포트폴리오 로딩
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const initAuthAndData = async () => {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const currentUser = {
          id: session.user.id,
          email: session.user.email || '',
        };
        setUser(currentUser);

        const { data, error } = await supabase
          .from('portfolios')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          setPortfolios(data as Portfolio[]);
        }
      } else {
        setUser(null);
        setPortfolios([]);
      }

      setIsLoading(false);
    };

    initAuthAndData();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const currentUser = {
            id: session.user.id,
            email: session.user.email || '',
          };
          setUser(currentUser);

          const { data, error } = await supabase
            .from('portfolios')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

          if (!error && data) {
            setPortfolios(data as Portfolio[]);
          }
        } else {
          setUser(null);
          setPortfolios([]);
        }
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const totalValuation = useMemo(() => {
    return portfolios.reduce((sum, p) => {
      const invested = p.trades.reduce((tSum, t) => tSum + (t.price * t.quantity), 0);
      return sum + invested;
    }, 0);
  }, [portfolios]);

  const handleAddPortfolio = async (newP: Portfolio) => {
    if (!user) {
      alert(lang === 'ko' ? '로그인이 필요합니다.' : 'Please log in first.');
      return;
    }

    const payload = { ...newP, user_id: user.id };

    const { error, data } = await supabase
      .from('portfolios')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Failed to create portfolio', error);
      alert(lang === 'ko' ? '포트폴리오 생성에 실패했습니다.' : 'Failed to create portfolio.');
      return;
    }

    setPortfolios(prev => [data as Portfolio, ...prev]);
    setIsCreatorOpen(false);
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
        isClosed: true,
        closedAt: updated.closedAt,
        finalSellAmount: sellAmount,
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
        dailyBuyAmount: updated.dailyBuyAmount,
        startDate: updated.startDate,
        feeRate: updated.feeRate,
        strategy: updated.strategy,
        trades: updated.trades,
        isClosed: updated.isClosed,
        closedAt: updated.closedAt,
        finalSellAmount: updated.finalSellAmount,
        alarmConfig: updated.alarmConfig,
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
            onSwitchType={setAuthModal} 
            onLogin={async (u) => { 
              setUser(u); 
              setAuthModal('profile'); 

              const { data, error } = await supabase
                .from('portfolios')
                .select('*')
                .eq('user_id', u.id)
                .order('created_at', { ascending: false });

              if (!error && data) {
                setPortfolios(data as Portfolio[]);
              }
            }}
            onLogout={async () => { 
              await supabase.auth.signOut();
              setUser(null); 
              setPortfolios([]); 
              setAuthModal(null); 
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
