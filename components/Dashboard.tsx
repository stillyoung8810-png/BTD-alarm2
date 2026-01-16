
import React from 'react';
import { Portfolio } from '../types';
import { I18N, CUSTOM_GRADIENT_LOGOS } from '../constants';
import { 
  Plus, 
  Zap,
  Info,
  Bell,
  BellOff,
  Trash2
} from 'lucide-react';

interface DashboardProps {
  lang: 'ko' | 'en';
  portfolios: Portfolio[];
  onClosePortfolio: (id: string) => void;
  onDeletePortfolio: (id: string) => void;
  onUpdatePortfolio: (updated: Portfolio) => void;
  onOpenCreator: () => void;
  onOpenAlarm: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onOpenQuickInput: (id: string) => void;
  onOpenExecution: (id: string) => void;
  totalValuation: number;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  lang, 
  portfolios, 
  onClosePortfolio,
  onDeletePortfolio,
  onOpenCreator, 
  onOpenAlarm,
  onOpenDetails,
  onOpenQuickInput,
  onOpenExecution,
  totalValuation 
}) => {
  const t = I18N[lang];

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      
      <section className="flex flex-col md:flex-row md:items-start justify-between gap-8 pt-8">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight dark:text-white mb-4 leading-[1.1]">
            {t.portfolioMgmt}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg font-medium leading-relaxed">
            {t.systematicAccumulation}
          </p>
        </div>
        
        <div className="flex flex-col items-end gap-6 min-w-[280px]">
          <div className="flex items-center gap-8 px-2">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.totalValuation}</span>
              <span className="text-3xl font-black dark:text-white tracking-tighter">${totalValuation.toLocaleString()}</span>
            </div>
            <div className="w-[1px] h-10 bg-slate-200 dark:bg-slate-800"></div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.gain24h}</span>
              <span className="text-3xl font-black text-emerald-500 tracking-tighter">+$0.00</span>
            </div>
          </div>
          
          <button 
            onClick={onOpenCreator}
            className="w-full md:w-auto px-10 py-5 bg-blue-600 text-white rounded-[2rem] font-black text-sm uppercase shadow-xl shadow-blue-500/30 hover:scale-105 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} strokeWidth={3} /> {t.newPortfolio}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {portfolios.length === 0 ? (
          <div className="col-span-full glass p-16 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed border-slate-200 dark:border-white/5">
             <p className="text-slate-500">{lang === 'ko' ? '포트폴리오가 없습니다. 포트폴리오를 추가해주세요.' : 'No portfolios. Please add a portfolio.'}</p>
          </div>
        ) : (
          portfolios.map(p => (
            <PortfolioCard 
              key={p.id} 
              portfolio={p} 
              lang={lang}
              onOpenAlarm={() => onOpenAlarm(p.id)}
              onOpenDetails={() => onOpenDetails(p.id)}
              onOpenQuickInput={() => onOpenQuickInput(p.id)}
              onOpenExecution={() => onOpenExecution(p.id)}
              onClose={() => onClosePortfolio(p.id)}
              onDelete={() => onDeletePortfolio(p.id)}
            />
          ))
        )}
      </section>
    </div>
  );
};

const PortfolioCard: React.FC<{ 
  portfolio: Portfolio; 
  onClose: () => void;
  onDelete: () => void;
  onOpenAlarm: () => void;
  onOpenDetails: () => void;
  onOpenQuickInput: () => void;
  onOpenExecution: () => void;
  lang: 'ko' | 'en' 
}> = ({ portfolio, onClose, onDelete, onOpenAlarm, onOpenDetails, onOpenQuickInput, onOpenExecution, lang }) => {
  const t = I18N[lang];
  const ma0Ticker = portfolio.strategy.ma0.stock;
  const gradientInfo = CUSTOM_GRADIENT_LOGOS[ma0Ticker] || { gradient: 'linear-gradient(135deg, #2563eb, #1e40af)', label: 'STOCK' };
  const isAlarmEnabled = portfolio.alarmConfig?.enabled;

  return (
    <div className="glass p-7 rounded-[2.5rem] space-y-6 group hover:-translate-y-1 transition-all duration-500 relative overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.06)] dark:shadow-2xl">
      
      {/* Visual background layers */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none opacity-50 dark:hidden"></div>
      <div className="absolute -right-12 -top-12 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* 우측 상단 버튼 그룹 */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        {/* 알람 버튼 */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onOpenAlarm();
          }}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${
            isAlarmEnabled 
              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500 border border-amber-200 dark:border-amber-500/30' 
              : 'bg-transparent text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
          title={lang === 'ko' ? '알람 설정' : 'Alarm settings'}
        >
          {isAlarmEnabled ? <Bell size={16} fill="currentColor" /> : <BellOff size={16} />}
        </button>

        {/* 삭제 버튼 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-red-600 hover:text-white hover:border-red-600 transition-all duration-200 active:scale-95"
          title={lang === 'ko' ? '포트폴리오 삭제' : 'Delete portfolio'}
        >
          <Trash2 size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="flex justify-between items-start relative z-10">
        <div className="flex items-center gap-4">
          <div 
            onClick={onOpenDetails}
            className="w-16 h-16 rounded-full flex flex-col items-center justify-center text-white shadow-xl overflow-hidden relative cursor-pointer active:scale-95 transition-transform border border-white/20"
            style={{ background: gradientInfo.gradient }}
          >
            <span className="text-[14px] font-black leading-none z-10">{ma0Ticker}</span>
            <span className="text-[6px] font-bold opacity-80 tracking-tighter mt-1 z-10 uppercase text-center px-1">{gradientInfo.label}</span>
            <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors"></div>
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight mb-1">{portfolio.name}</h3>
            <div className="flex items-center gap-2">
               <div className={`w-1.5 h-1.5 rounded-full ${isAlarmEnabled ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-emerald-500'}`}></div>
               <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t.activeStrategy}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 relative z-10">
        <div className="bg-white/40 dark:bg-black/20 p-5 rounded-[1.5rem] border border-white/20 dark:border-white/5 backdrop-blur-sm">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 block">{t.invested}</span>
          <p className="text-xl font-black text-slate-800 dark:text-white">${portfolio.dailyBuyAmount.toLocaleString()}</p>
        </div>
        <div className="bg-white/40 dark:bg-black/20 p-5 rounded-[1.5rem] border border-white/20 dark:border-white/5 backdrop-blur-sm">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 block">{t.yield}</span>
          <p className="text-xl font-black text-emerald-500 flex items-center gap-1">
             <span className="text-xs">↑</span> +0.0%
          </p>
        </div>
      </div>

      <div 
        onClick={onOpenExecution}
        className="bg-blue-50/50 dark:bg-blue-600/15 p-5 rounded-[1.5rem] flex items-center justify-between shadow-md dark:shadow-lg dark:shadow-blue-500/20 relative overflow-hidden group/action cursor-pointer border border-blue-100 dark:border-blue-500/20"
      >
        <div className="absolute inset-0 bg-blue-100/50 dark:bg-white/10 opacity-0 group-hover/action:opacity-100 transition-opacity"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-1.5 mb-1 opacity-80">
             <span className="text-[9px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest">{t.dailyExecution}</span>
             <Info size={10} className="text-blue-700 dark:text-blue-300" />
          </div>
          <div className="text-lg font-black text-blue-900 dark:text-white">
            {t.section} 1: {portfolio.strategy.ma1.stock} {t.buy}
          </div>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onOpenQuickInput();
          }}
          className="w-10 h-10 rounded-xl bg-blue-600/20 dark:bg-white/20 flex items-center justify-center text-blue-700 dark:text-white backdrop-blur-md hover:scale-110 active:scale-95 transition-all shadow-sm dark:shadow-[0_0_15px_rgba(255,255,255,0.2)]"
        >
           <Zap size={20} className="fill-current" />
        </button>
      </div>

      <button 
        onClick={onClose}
        className="w-full py-4 text-[10px] font-black bg-slate-50 dark:bg-transparent text-slate-500 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/5 uppercase tracking-[0.2em] border border-slate-200 dark:border-white/10 rounded-2xl transition-all relative z-10"
      >
        {t.terminate}
      </button>
    </div>
  );
};

export default Dashboard;
