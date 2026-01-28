
import React, { useState } from 'react';
import { Portfolio, Strategy } from '../types';
import { AVAILABLE_STOCKS, ALL_STOCKS, PAID_STOCKS, I18N } from '../constants';
import { X, ChevronRight, ChevronLeft, Info, Sparkles, Target, Zap, Settings2, Calendar, Wallet, Percent, AlertTriangle, ChevronDown, Lock, TrendingUp, Layers } from 'lucide-react';
import { useTossApp } from '../contexts/TossAppContext';
import CustomDropdown from './CustomDropdown';
import HoverTip from './HoverTip';
import InfoModal from './InfoModal';

// 전략 타입 정의 (확장 가능)
export type StrategyType = 'rsi_ma_interval' | 'multi_split';

interface StrategyDefinition {
  id: StrategyType;
  title: string;
  description: string;
  tier: 'FREE' | 'PRO' | 'PREMIUM';
  icon: React.ReactNode;
  gradient: string;
  disabled?: boolean;
  comingSoon?: boolean;
}

// 전략 정의 목록 (추가 전략은 여기에만 추가하면 됨)
const STRATEGY_DEFINITIONS: StrategyDefinition[] = [
  {
    id: 'rsi_ma_interval',
    title: 'RSI & 이동평균선 구간 매수',
    description: '이평선 구간별로 매수종목과 비중을 조절하는 전략입니다.',
    tier: 'FREE',
    icon: <TrendingUp size={24} />,
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
  },
  {
    id: 'multi_split',
    title: '다분할 매매법',
    description: '레버리지 ETF를 규칙대로 사서, 평단가 위에서 기계적으로 파는 분할 매수·매도 전략입니다. 무한매수법 v2.2을 참조하였습니다.',
    tier: 'FREE',
    icon: <Layers size={24} />,
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  },
];

// 토스 앱 환경에서만 Menu 컴포넌트 import
let Menu: any = null;
if (typeof window !== 'undefined') {
  try {
    const tossMobile = require('@toss/tds-mobile');
    Menu = tossMobile.Menu;
  } catch (e) {
    // @toss/tds-mobile이 없거나 로드 실패 시 무시
  }
}

interface StrategyCreatorProps {
  lang: 'ko' | 'en';
  onClose: () => void;
  onSave: (p: Omit<Portfolio, 'id'>) => void;
  canAccessPaidStocks?: boolean;
}

const StrategyCreator: React.FC<StrategyCreatorProps> = ({ lang, onClose, onSave, canAccessPaidStocks = false }) => {
  const { isInTossApp } = useTossApp();
  const [step, setStep] = useState(0); // 0: 전략 선택, 1-3: 기존 단계
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType | null>(null);
  const [proInfoOpen, setProInfoOpen] = useState(false);
  
  // Step 1: Section 0
  const [ma0Stock, setMa0Stock] = useState('QQQ');
  const [rsiEnabled, setRsiEnabled] = useState(false);
  const [ma0MenuOpen, setMa0MenuOpen] = useState(false);

  // Step 2: Sections 1, 2, 3
  const [ma1Period, setMa1Period] = useState(20);
  const [ma1Stock, setMa1Stock] = useState('TQQQ');
  const [ma1Rsi, setMa1Rsi] = useState(30);
  const [ma1MenuOpen, setMa1MenuOpen] = useState(false);

  const [ma2Period1, setMa2Period1] = useState(20);
  const [ma2Period2, setMa2Period2] = useState(60);
  const [ma2Stock, setMa2Stock] = useState('QLD');
  const [ma2Split, setMa2Split] = useState(3);
  const [ma2Rsi, setMa2Rsi] = useState(30);
  const [ma2MenuOpen, setMa2MenuOpen] = useState(false);

  const [ma3Period, setMa3Period] = useState(60);
  const [ma3Stock, setMa3Stock] = useState('QQQ');
  const [ma3Rsi, setMa3Rsi] = useState(30);
  const [ma3MenuOpen, setMa3MenuOpen] = useState(false);

  // 다분할 매매법 전용 state
  const [multiSplitStock, setMultiSplitStock] = useState('TQQQ');
  const [targetReturnRate, setTargetReturnRate] = useState(10); // A: 목표 수익률 (5-30)
  const [totalSplitCount, setTotalSplitCount] = useState(40); // a: 총 분할 횟수 (20-80)
  const [multiSplitMenuOpen, setMultiSplitMenuOpen] = useState(false);

  // Step 3: Meta
  const [name, setName] = useState('');
  const [dailyBuy, setDailyBuy] = useState(1000);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [feeRate, setFeeRate] = useState(0.25);

  const t = I18N[lang];

  const isLockedTicker = (ticker: string) => PAID_STOCKS.includes(ticker) && !canAccessPaidStocks;
  const lockedTooltip =
    lang === 'ko' ? 'PRO/PREMIUM 전용 종목입니다.' : 'This ticker is PRO/PREMIUM only.';

  const stockOptions = ALL_STOCKS.map((s) => ({
    value: s,
    label: s,
    disabled: isLockedTicker(s),
    badge: PAID_STOCKS.includes(s) ? 'PRO+' : undefined,
    tooltip: PAID_STOCKS.includes(s) ? lockedTooltip : undefined,
  }));

  // 이동평균선 입력값 검증 및 정규화 함수
  const normalizeMaPeriod = (value: string): number => {
    // 빈 문자열이면 현재 값을 유지하기 위해 -1 반환 (호출부에서 처리)
    if (value === '' || value === '-') {
      return -1;
    }
    
    // 앞의 0 제거 (예: "020" -> "20", "001" -> "1")
    let numStr = value.replace(/^0+/, '') || '0';
    let num = parseInt(numStr, 10);
    
    // NaN이거나 1 미만이면 1로 설정
    if (isNaN(num) || num < 1) {
      return 1;
    }
    
    // 240 초과면 240으로 제한
    if (num > 240) {
      return 240;
    }
    
    return num;
  };

  const handleSave = async () => {
    if (!selectedStrategy) return;

    // 전략별로 다른 strategy 객체 생성
    let strategy: Strategy;
    
    if (selectedStrategy === 'rsi_ma_interval') {
      strategy = {
        ma0: { stock: ma0Stock, rsiEnabled },
        ma1: { period: ma1Period, stock: ma1Stock, rsiThreshold: rsiEnabled ? ma1Rsi : undefined },
        ma2: { period1: ma2Period1, period2: ma2Period2, stock: ma2Stock, splitCount: ma2Split, rsiThreshold: rsiEnabled ? ma2Rsi : undefined },
        ma3: { period: ma3Period, stock: ma3Stock, rsiThreshold: rsiEnabled ? ma3Rsi : undefined }
      };
    } else if (selectedStrategy === 'multi_split') {
      // 다분할 매매법 전략 - targetStock을 ma0에도 설정
      strategy = {
        ma0: { stock: multiSplitStock, rsiEnabled: false },
        ma1: { period: 20, stock: multiSplitStock },
        ma2: { period1: 20, period2: 60, stock: multiSplitStock, splitCount: 3 },
        ma3: { period: 60, stock: multiSplitStock },
        multiSplit: {
          targetStock: multiSplitStock,
          targetReturnRate: targetReturnRate,
          totalSplitCount: totalSplitCount,
        }
      };
    } else {
      // 기본값
      strategy = {
        ma0: { stock: 'QQQ', rsiEnabled: false },
        ma1: { period: 20, stock: 'TQQQ' },
        ma2: { period1: 20, period2: 60, stock: 'QLD', splitCount: 3 },
        ma3: { period: 60, stock: 'QQQ' }
      };
    }

    const newP: Omit<Portfolio, 'id'> = {
      name: name || (lang === 'ko' ? '커스텀 전략' : 'Custom Strategy'),
      dailyBuyAmount: dailyBuy,
      startDate: startDate,
      feeRate: feeRate,
      isClosed: false,
      trades: [],
      strategy
    };
    console.log('부모 함수 호출 시작');
    await onSave(newP);
    console.log('부모 함수 호출 완료');
  };

  // 전략 선택 화면 렌더링
  const renderStrategySelection = () => {
    const handleStrategySelect = (strategyId: StrategyType) => {
      const strategyDef = STRATEGY_DEFINITIONS.find(s => s.id === strategyId);
      if (!strategyDef) return;
      
      // PRO/PREMIUM 전용 전략 체크
      if (strategyDef.tier === 'PRO' || strategyDef.tier === 'PREMIUM') {
        if (!canAccessPaidStocks) {
          setProInfoOpen(true);
          return;
        }
      }
      
      setSelectedStrategy(strategyId);
      setStep(1); // 다음 단계로
    };

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-8">
          <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">
            {lang === 'ko' ? '전략 엔진 선택' : 'Select Strategy Engine'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {lang === 'ko' ? '사용할 전략을 선택하세요' : 'Choose your trading strategy'}
          </p>
        </div>

        <div className="space-y-4">
          {STRATEGY_DEFINITIONS.map((strategy) => {
            const isLocked = (strategy.tier === 'PRO' || strategy.tier === 'PREMIUM') && !canAccessPaidStocks;
            const tierColors = {
              FREE: 'bg-slate-200/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300',
              PRO: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
              PREMIUM: 'bg-slate-800/60 dark:bg-slate-900/80 text-slate-300 dark:text-slate-400 border-slate-700/40 dark:border-slate-600/40',
            };

            return (
              <button
                key={strategy.id}
                onClick={() => !isLocked && !strategy.disabled && !strategy.comingSoon && handleStrategySelect(strategy.id)}
                disabled={isLocked || strategy.disabled || strategy.comingSoon}
                className={`w-full relative group transition-all duration-300 ${
                  isLocked || strategy.disabled || strategy.comingSoon
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
                }`}
              >
                <div
                  className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/70 dark:border-slate-700/70 rounded-2xl p-6 shadow-lg dark:shadow-2xl transition-all duration-300"
                >
                  <div className="flex items-start gap-4">
                    {/* 아이콘 */}
                    <div
                      className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 shadow-lg transition-transform duration-300 group-hover:scale-110"
                      style={{
                        background: strategy.gradient,
                      }}
                    >
                      <div className="text-white">
                        {strategy.icon}
                      </div>
                    </div>

                    {/* 내용 */}
                    <div className="flex-1 text-left space-y-2">
                      <div className="flex items-center gap-3">
                        <h4 className="text-base font-black text-slate-900 dark:text-white">
                          {strategy.title}
                        </h4>
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                            tierColors[strategy.tier]
                          }`}
                        >
                          {strategy.tier}
                        </span>
                        {strategy.comingSoon && (
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                            ({lang === 'ko' ? '준비중' : 'Coming Soon'})
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                        {strategy.description}
                      </p>
                    </div>

                    {/* 화살표 버튼 */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                        isLocked || strategy.disabled || strategy.comingSoon
                          ? 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                          : 'bg-blue-600 text-white group-hover:bg-blue-500 group-hover:scale-110'
                      }`}
                    >
                      <ChevronRight size={20} strokeWidth={3} />
                    </div>
                  </div>

                  {/* 잠금 오버레이 */}
                  {isLocked && (
                    <div className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <Lock className="mx-auto text-slate-400" size={24} />
                        <p className="text-xs font-black text-slate-300 uppercase tracking-widest">
                          {strategy.tier} 전용
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          
          {/* 추후 전략 업데이트 예정 카드 */}
          <div className="bg-white/40 dark:bg-slate-800/40 backdrop-blur-xl border border-slate-200/40 dark:border-white/5 rounded-2xl p-6 shadow-lg dark:shadow-2xl opacity-60">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-slate-200/60 dark:bg-slate-700/60">
                <Sparkles className="text-slate-400" size={24} />
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="text-base font-black text-slate-600 dark:text-slate-400">
                    {lang === 'ko' ? '추후 전략 업데이트 예정' : 'More Strategies Coming Soon'}
                  </h4>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-500 leading-relaxed font-medium">
                  {lang === 'ko' 
                    ? '새로운 전략이 곧 추가될 예정입니다.' 
                    : 'New strategies will be added soon.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStep1 = () => (
    <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
      <div className="bg-blue-600/5 border border-blue-500/20 p-8 rounded-[2rem] space-y-6 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-2">
           <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-[10px] font-black text-white">0</span>
           </div>
           <h3 className="text-sm font-black dark:text-white uppercase tracking-widest">
             {lang === 'ko' ? '구간 0: 이동평균선과의 위치를 정하는 주식' : 'Section 0: Base Position Reference'}
           </h3>
        </div>
        
        <div className="space-y-4">
          <label className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '기준 주식 선택:' : 'Select Reference Stock:'}</label>
          {isInTossApp && Menu ? (
            <Menu
              open={ma0MenuOpen}
              onOpen={() => setMa0MenuOpen(true)}
              onClose={() => setMa0MenuOpen(false)}
              placement="bottom"
            >
              <Menu.Trigger>
                <button className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer flex items-center justify-between">
                  <span>{ma0Stock || (lang === 'ko' ? '선택하세요' : 'Select')}</span>
                  <ChevronDown size={16} className="text-slate-500" />
                </button>
              </Menu.Trigger>
              <Menu.Dropdown>
                <Menu.Header>{lang === 'ko' ? '종목 선택' : 'Select Stock'}</Menu.Header>
                {ALL_STOCKS.map((stock) => {
                  const locked = isLockedTicker(stock);
                  if (locked) {
                    return (
                      <div
                        key={stock}
                        onClick={() => setProInfoOpen(true)}
                        className="px-4 py-3 text-sm font-bold text-slate-400 dark:text-slate-600 flex items-center justify-between opacity-70 cursor-not-allowed"
                      >
                        <span className="flex items-center gap-2">
                          <span>{stock}</span>
                          <HoverTip text={lockedTooltip}>
                            <span className="inline-flex items-center">
                              <Lock size={14} className="text-slate-400 dark:text-slate-600" />
                            </span>
                          </HoverTip>
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest bg-white/10 border border-white/10 px-2 py-0.5 rounded-full">
                          PRO+
                        </span>
                      </div>
                    );
                  }
                  return (
                    <Menu.DropdownCheckItem
                      key={stock}
                      checked={ma0Stock === stock}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setMa0Stock(stock);
                          setMa0MenuOpen(false);
                        }
                      }}
                    >
                      {stock}
                    </Menu.DropdownCheckItem>
                  );
                })}
              </Menu.Dropdown>
            </Menu>
          ) : (
            <CustomDropdown
              value={ma0Stock}
              options={stockOptions}
              onChange={(value) => setMa0Stock(value)}
              placeholder={lang === 'ko' ? '선택하세요' : 'Select'}
              header={lang === 'ko' ? '종목 선택' : 'Select Stock'}
            />
          )}
          <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
            {lang === 'ko' 
              ? '구간 0에서 선택한 주식의 가격을 구간 1, 2, 3의 이동평균선 위치와 비교하여 매수 여부를 결정합니다.' 
              : 'The price of the Section 0 stock is compared to the MA positions in Sections 1, 2, and 3 to determine execution.'}
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {lang === 'ko' ? 'RSI 사용' : 'Enable RSI'}
            </span>
            <button
              onClick={() => setRsiEnabled(!rsiEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${
                rsiEnabled 
                  ? 'bg-blue-500 shadow-lg shadow-blue-500/50' 
                  : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                  rsiEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">
            {lang === 'ko' ? 'RSI 기준 값 아래에서만 매수 진행' : 'Buy only below RSI threshold'}
          </span>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
      {/* Section 1 */}
      <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-8 rounded-[2rem] space-y-5 shadow-md dark:shadow-xl">
        <h3 className="text-xs font-black dark:text-white uppercase tracking-widest flex items-center gap-2">
          <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center text-[10px]">1</div>
          {lang === 'ko' ? '구간 1: 특정 이동평균선 위에서 매일 매수 구간' : 'Section 1: Daily Buy Above MA'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '기준 이동평균선 설정 (1~240일):' : 'MA Period (1-240):'}</label>
            <input 
              type="number" 
              value={ma1Period}
              onChange={(e) => {
                const normalized = normalizeMaPeriod(e.target.value);
                if (normalized !== -1) {
                  setMa1Period(normalized);
                }
              }}
              onBlur={(e) => {
                const normalized = normalizeMaPeriod(e.target.value);
                if (normalized !== -1) {
                  setMa1Period(normalized);
                }
              }}
              min="1"
              max="240"
              className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '매수할 종목 선택:' : 'Stock to Buy:'}</label>
            {isInTossApp && Menu ? (
              <Menu
                open={ma1MenuOpen}
                onOpen={() => setMa1MenuOpen(true)}
                onClose={() => setMa1MenuOpen(false)}
                placement="bottom"
              >
                <Menu.Trigger>
                  <button className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer flex items-center justify-between">
                    <span>{ma1Stock}</span>
                    <ChevronDown size={16} className="text-slate-500" />
                  </button>
                </Menu.Trigger>
                <Menu.Dropdown>
                  <Menu.Header>{lang === 'ko' ? '종목 선택' : 'Select Stock'}</Menu.Header>
                  {ALL_STOCKS.map((stock) => {
                    const locked = isLockedTicker(stock);
                    if (locked) {
                      return (
                        <div
                          key={stock}
                          onClick={() => setProInfoOpen(true)}
                          className="px-4 py-3 text-sm font-bold text-slate-400 dark:text-slate-600 flex items-center justify-between opacity-70 cursor-not-allowed"
                        >
                          <span className="flex items-center gap-2">
                            <span>{stock}</span>
                            <HoverTip text={lockedTooltip}>
                              <span className="inline-flex items-center">
                                <Lock size={14} className="text-slate-400 dark:text-slate-600" />
                              </span>
                            </HoverTip>
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-widest bg-white/10 border border-white/10 px-2 py-0.5 rounded-full">
                            PRO+
                          </span>
                        </div>
                      );
                    }
                    return (
                      <Menu.DropdownCheckItem
                        key={stock}
                        checked={ma1Stock === stock}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setMa1Stock(stock);
                            setMa1MenuOpen(false);
                          }
                        }}
                      >
                        {stock}
                      </Menu.DropdownCheckItem>
                    );
                  })}
                </Menu.Dropdown>
              </Menu>
            ) : (
              <CustomDropdown
                value={ma1Stock}
                options={stockOptions}
                onChange={(value) => setMa1Stock(value)}
                header={lang === 'ko' ? '종목 선택' : 'Select Stock'}
              />
            )}
          </div>
        </div>

        {rsiEnabled && (
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/5 animate-in fade-in slide-in-from-top-2">
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">
              {lang === 'ko' ? 'RSI 기준 값 (0-100):' : 'RSI Base Value (0-100):'}
            </label>
            <input 
              type="number" 
              value={ma1Rsi}
              onChange={(e) => setMa1Rsi(Number(e.target.value))}
              className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              min="0"
              max="100"
            />
            <p className="text-[10px] text-slate-500 font-medium">
              {lang === 'ko'
                ? 'RSI가 이 값 이하일 때만 매수합니다.'
                : 'Buy only when RSI is below this value.'}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              {lang === 'ko'
                ? '채권형 ETF는 가격 변동폭이 극히 작아 RSI 지표의 신뢰도가 낮습니다.'
                : 'For bond ETFs, very small price movements can make RSI less reliable.'}
            </p>
          </div>
        )}

        <p className="text-[10px] text-slate-500 font-medium">
          {lang === 'ko' ? `구간 0 주식이 구간 1 이동평균선 아래에 있을 때 매수합니다.` : `Executes buy when Section 0 stock is below Section 1 MA.`}
        </p>
      </div>

      {/* Section 2 */}
      <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-8 rounded-[2rem] space-y-5 shadow-md dark:shadow-xl">
        <h3 className="text-xs font-black dark:text-white uppercase tracking-widest flex items-center gap-2">
          <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center text-[10px]">2</div>
          {lang === 'ko' ? '구간 2: 특정 2개의 이동평균선 사이에서 매일 매수' : 'Section 2: Daily Buy Between 2 MAs'}
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '기준 이동평균선 1 (1~240일):' : 'MA Period 1 (1-240):'}</label>
            <input 
              type="number" 
              value={ma2Period1}
              onChange={(e) => {
                const normalized = normalizeMaPeriod(e.target.value);
                if (normalized !== -1) {
                  setMa2Period1(normalized);
                }
              }}
              onBlur={(e) => {
                const normalized = normalizeMaPeriod(e.target.value);
                if (normalized !== -1) {
                  setMa2Period1(normalized);
                }
              }}
              min="1"
              max="240"
              className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '기준 이동평균선 2 (1~240일):' : 'MA Period 2 (1-240):'}</label>
            <input 
              type="number" 
              value={ma2Period2}
              onChange={(e) => {
                const normalized = normalizeMaPeriod(e.target.value);
                if (normalized !== -1) {
                  setMa2Period2(normalized);
                }
              }}
              onBlur={(e) => {
                const normalized = normalizeMaPeriod(e.target.value);
                if (normalized !== -1) {
                  setMa2Period2(normalized);
                }
              }}
              min="1"
              max="240"
              className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '매수할 종목 선택:' : 'Stock to Buy:'}</label>
            {isInTossApp && Menu ? (
              <Menu
                open={ma2MenuOpen}
                onOpen={() => setMa2MenuOpen(true)}
                onClose={() => setMa2MenuOpen(false)}
                placement="bottom"
              >
                <Menu.Trigger>
                  <button className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer flex items-center justify-between">
                    <span>{ma2Stock}</span>
                    <ChevronDown size={16} className="text-slate-500" />
                  </button>
                </Menu.Trigger>
                <Menu.Dropdown>
                  <Menu.Header>{lang === 'ko' ? '종목 선택' : 'Select Stock'}</Menu.Header>
                  {ALL_STOCKS.map((stock) => {
                    const locked = isLockedTicker(stock);
                    if (locked) {
                      return (
                        <div
                          key={stock}
                          onClick={() => setProInfoOpen(true)}
                          className="px-4 py-3 text-sm font-bold text-slate-400 dark:text-slate-600 flex items-center justify-between opacity-70 cursor-not-allowed"
                        >
                          <span className="flex items-center gap-2">
                            <span>{stock}</span>
                            <HoverTip text={lockedTooltip}>
                              <span className="inline-flex items-center">
                                <Lock size={14} className="text-slate-400 dark:text-slate-600" />
                              </span>
                            </HoverTip>
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-widest bg-white/10 border border-white/10 px-2 py-0.5 rounded-full">
                            PRO+
                          </span>
                        </div>
                      );
                    }
                    return (
                      <Menu.DropdownCheckItem
                        key={stock}
                        checked={ma2Stock === stock}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setMa2Stock(stock);
                            setMa2MenuOpen(false);
                          }
                        }}
                      >
                        {stock}
                      </Menu.DropdownCheckItem>
                    );
                  })}
                </Menu.Dropdown>
              </Menu>
            ) : (
              <CustomDropdown
                value={ma2Stock}
                options={stockOptions}
                onChange={(value) => setMa2Stock(value)}
                header={lang === 'ko' ? '종목 선택' : 'Select Stock'}
              />
            )}
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '매수한 종목 분할 횟수:' : 'Split Count:'}</label>
            <input 
              type="number" 
              value={ma2Split}
              onChange={(e) => setMa2Split(Number(e.target.value))}
              className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>
        </div>

        {rsiEnabled && (
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/5 animate-in fade-in slide-in-from-top-2">
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">
              {lang === 'ko' ? 'RSI 기준 값 (0-100):' : 'RSI Base Value (0-100):'}
            </label>
            <input 
              type="number" 
              value={ma2Rsi}
              onChange={(e) => setMa2Rsi(Number(e.target.value))}
              className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              min="0"
              max="100"
            />
            <p className="text-[10px] text-slate-500 font-medium">
              {lang === 'ko'
                ? 'RSI가 이 값 이하일 때만 매수합니다.'
                : 'Buy only when RSI is below this value.'}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              {lang === 'ko'
                ? '채권형 ETF는 가격 변동폭이 극히 작아 RSI 지표의 신뢰도가 낮습니다.'
                : 'For bond ETFs, very small price movements can make RSI less reliable.'}
            </p>
          </div>
        )}

        <p className="text-[10px] text-slate-500 font-medium">
          {lang === 'ko' ? `구간 0 주식이 구간 2의 두 이동평균선 사이에 있을 때 매수합니다.` : `Executes buy when Section 0 stock is between Section 2 MAs.`}
        </p>
      </div>

      {/* Section 3 */}
      <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-8 rounded-[2rem] space-y-5 shadow-md dark:shadow-xl">
        <h3 className="text-xs font-black dark:text-white uppercase tracking-widest flex items-center gap-2">
          <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center text-[10px]">3</div>
          {lang === 'ko' ? '구간 3: 특정 이동평균선 아래에서 매일 매수 구간' : 'Section 3: Daily Buy Below MA'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '기준 이동평균선 설정 (1~240일):' : 'MA Period (1-240):'}</label>
            <input 
              type="number" 
              value={ma3Period}
              onChange={(e) => {
                const normalized = normalizeMaPeriod(e.target.value);
                if (normalized !== -1) {
                  setMa3Period(normalized);
                }
              }}
              onBlur={(e) => {
                const normalized = normalizeMaPeriod(e.target.value);
                if (normalized !== -1) {
                  setMa3Period(normalized);
                }
              }}
              min="1"
              max="240"
              className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? '매수할 종목 선택:' : 'Stock to Buy:'}</label>
            {isInTossApp && Menu ? (
              <Menu
                open={ma3MenuOpen}
                onOpen={() => setMa3MenuOpen(true)}
                onClose={() => setMa3MenuOpen(false)}
                placement="bottom"
              >
                <Menu.Trigger>
                  <button className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer flex items-center justify-between">
                    <span>{ma3Stock}</span>
                    <ChevronDown size={16} className="text-slate-500" />
                  </button>
                </Menu.Trigger>
                <Menu.Dropdown>
                  <Menu.Header>{lang === 'ko' ? '종목 선택' : 'Select Stock'}</Menu.Header>
                  {ALL_STOCKS.map((stock) => {
                    const locked = isLockedTicker(stock);
                    if (locked) {
                      return (
                        <div
                          key={stock}
                          onClick={() => setProInfoOpen(true)}
                          className="px-4 py-3 text-sm font-bold text-slate-400 dark:text-slate-600 flex items-center justify-between opacity-70 cursor-not-allowed"
                        >
                          <span className="flex items-center gap-2">
                            <span>{stock}</span>
                            <HoverTip text={lockedTooltip}>
                              <span className="inline-flex items-center">
                                <Lock size={14} className="text-slate-400 dark:text-slate-600" />
                              </span>
                            </HoverTip>
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-widest bg-white/10 border border-white/10 px-2 py-0.5 rounded-full">
                            PRO+
                          </span>
                        </div>
                      );
                    }
                    return (
                      <Menu.DropdownCheckItem
                        key={stock}
                        checked={ma3Stock === stock}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setMa3Stock(stock);
                            setMa3MenuOpen(false);
                          }
                        }}
                      >
                        {stock}
                      </Menu.DropdownCheckItem>
                    );
                  })}
                </Menu.Dropdown>
              </Menu>
            ) : (
              <CustomDropdown
                value={ma3Stock}
                options={stockOptions}
                onChange={(value) => setMa3Stock(value)}
                header={lang === 'ko' ? '종목 선택' : 'Select Stock'}
              />
            )}
          </div>
        </div>

        {rsiEnabled && (
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/5 animate-in fade-in slide-in-from-top-2">
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">
              {lang === 'ko' ? 'RSI 기준 값 (0-100):' : 'RSI Base Value (0-100):'}
            </label>
            <input 
              type="number" 
              value={ma3Rsi}
              onChange={(e) => setMa3Rsi(Number(e.target.value))}
              className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              min="0"
              max="100"
            />
            <p className="text-[10px] text-slate-500 font-medium">
              {lang === 'ko'
                ? 'RSI가 이 값 이하일 때만 매수합니다.'
                : 'Buy only when RSI is below this value.'}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              {lang === 'ko'
                ? '채권형 ETF는 가격 변동폭이 극히 작아 RSI 지표의 신뢰도가 낮습니다.'
                : 'For bond ETFs, very small price movements can make RSI less reliable.'}
            </p>
          </div>
        )}

        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
          <p className="text-[11px] font-bold text-amber-500 leading-tight">
            {lang === 'ko' 
              ? '* 수익률 10% 초과시 전량 매도 및 구간 2 매수 종목 전량 매수' 
              : '* Sell all if yield exceeds 10%, and execute bulk buy for Section 2 holdings.'}
          </p>
        </div>
      </div>
    </div>
  );

  // 다분할 매매법 Step 1: 파라미터 설정
  const renderMultiSplitStep1 = () => {
    // 레버리지 ETF 추천 목록 (TQQQ, QLD, UPRO, SOXL 등)
    const leveragedStocks = ALL_STOCKS.filter(s => 
      ['TQQQ', 'QLD', 'UPRO', 'SOXL', 'SSO', 'TSLL', 'NVDL', 'GGLL', 'PTIR', 'CONL', 'MSTX'].includes(s)
    );
    const leveragedStockOptions = leveragedStocks.map((s) => ({
      value: s,
      label: s,
      disabled: isLockedTicker(s),
      badge: PAID_STOCKS.includes(s) ? 'PRO+' : undefined,
      tooltip: PAID_STOCKS.includes(s) ? lockedTooltip : undefined,
    }));

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
        {/* V2.2 PARAMETERS 카드 */}
        <div className="bg-gradient-to-br from-teal-500/10 via-emerald-500/10 to-green-500/10 border border-teal-500/30 dark:border-emerald-500/20 p-8 rounded-[2rem] space-y-6 backdrop-blur-xl shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/40">
              <Target className="text-emerald-400" size={20} />
            </div>
            <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-widest">
              V2.2 PARAMETERS
            </h3>
          </div>

          {/* 대상 종목 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
                {lang === 'ko' ? '대상 종목' : 'Target Stock'}
              </label>
              <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                LEVERAGED RECOMMENDED
              </span>
            </div>
            {isInTossApp && Menu ? (
              <Menu
                open={multiSplitMenuOpen}
                onOpen={() => setMultiSplitMenuOpen(true)}
                onClose={() => setMultiSplitMenuOpen(false)}
                placement="bottom"
              >
                <Menu.Trigger>
                  <button className="w-full p-5 bg-slate-900/60 dark:bg-slate-800/80 border border-slate-700/50 dark:border-slate-600/50 rounded-xl text-base font-black text-slate-100 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all cursor-pointer flex items-center justify-between backdrop-blur-sm">
                    <span>{multiSplitStock}</span>
                    <ChevronDown size={18} className="text-slate-400" />
                  </button>
                </Menu.Trigger>
                <Menu.Dropdown>
                  <Menu.Header>{lang === 'ko' ? '종목 선택' : 'Select Stock'}</Menu.Header>
                  {leveragedStocks.map((stock) => {
                    const locked = isLockedTicker(stock);
                    if (locked) {
                      return (
                        <div
                          key={stock}
                          onClick={() => setProInfoOpen(true)}
                          className="px-4 py-3 text-sm font-bold text-slate-400 dark:text-slate-600 flex items-center justify-between opacity-70 cursor-not-allowed"
                        >
                          <span className="flex items-center gap-2">
                            <span>{stock}</span>
                            <HoverTip text={lockedTooltip}>
                              <span className="inline-flex items-center">
                                <Lock size={14} className="text-slate-400 dark:text-slate-600" />
                              </span>
                            </HoverTip>
                          </span>
                          <span className="text-[9px] font-black uppercase tracking-widest bg-white/10 border border-white/10 px-2 py-0.5 rounded-full">
                            PRO+
                          </span>
                        </div>
                      );
                    }
                    return (
                      <Menu.DropdownCheckItem
                        key={stock}
                        checked={multiSplitStock === stock}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setMultiSplitStock(stock);
                            setMultiSplitMenuOpen(false);
                          }
                        }}
                      >
                        {stock}
                      </Menu.DropdownCheckItem>
                    );
                  })}
                </Menu.Dropdown>
              </Menu>
            ) : (
              <CustomDropdown
                value={multiSplitStock}
                options={leveragedStockOptions}
                onChange={(value) => setMultiSplitStock(value)}
                header={lang === 'ko' ? '종목 선택' : 'Select Stock'}
              />
            )}
          </div>

          {/* 파라미터 입력 필드 (2개 나란히) */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            {/* 목표 수익률 (A %) */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest block">
                {lang === 'ko' ? '목표 수익률 (A %)' : 'Target Return Rate (A %)'}
              </label>
              <input
                type="number"
                value={targetReturnRate}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 5 && val <= 30) {
                    setTargetReturnRate(val);
                  }
                }}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (val < 5) setTargetReturnRate(5);
                  else if (val > 30) setTargetReturnRate(30);
                }}
                min="5"
                max="30"
                className="w-full p-5 bg-slate-900/60 dark:bg-slate-800/80 border border-slate-700/50 dark:border-slate-600/50 rounded-xl text-lg font-black text-slate-100 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all backdrop-blur-sm"
              />
              <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                5 ~ 30%
              </p>
            </div>

            {/* 총 분할 횟수 (a회) */}
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest block">
                {lang === 'ko' ? '총 분할 횟수 (a회)' : 'Total Split Count (a times)'}
              </label>
              <input
                type="number"
                value={totalSplitCount}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val >= 20 && val <= 80) {
                    setTotalSplitCount(val);
                  }
                }}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (val < 20) setTotalSplitCount(20);
                  else if (val > 80) setTotalSplitCount(80);
                }}
                min="20"
                max="80"
                className="w-full p-5 bg-slate-900/60 dark:bg-slate-800/80 border border-slate-700/50 dark:border-slate-600/50 rounded-xl text-lg font-black text-slate-100 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all backdrop-blur-sm"
              />
              <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                20 ~ 80회
              </p>
            </div>
          </div>

          {/* 전략 로직 설명 */}
          <div className="mt-6 p-4 bg-slate-900/40 dark:bg-slate-800/40 border border-slate-700/30 dark:border-slate-600/30 rounded-xl space-y-2">
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">
              {lang === 'ko' ? '전략 로직 요약' : 'Strategy Logic Summary'}
            </p>
            <ul className="text-[10px] text-slate-300 dark:text-slate-400 space-y-1.5 font-medium leading-relaxed">
              <li>• {lang === 'ko' ? 'B: 감소 계수 (a / 2A)' : 'B: Reduction Coefficient (a / 2A)'}</li>
              <li>• {lang === 'ko' ? 'LOC 기준점 = A - (T/B × 40/a)' : 'LOC Point = A - (T/B × 40/a)'}</li>
              <li>• {lang === 'ko' ? '전반전: 1 ≤ T < a/2 (전체 회차의 절반 미만)' : 'First Half: 1 ≤ T < a/2 (Less than half of total rounds)'}</li>
              <li>• {lang === 'ko' ? '후반전: a/2 ≤ T < a-1 (절반 이후부터 마지막 직전까지)' : 'Second Half: a/2 ≤ T < a-1 (After half until one before last)'}</li>
              <li>• {lang === 'ko' ? '쿼터 손절 모드: a-1 < T ≤ a (자금이 1회치 남았거나 모두 소진된 상태)' : 'Quarter Stop-Loss Mode: a-1 < T ≤ a (Funds left for 1 round or exhausted)'}</li>
              <li>• {lang === 'ko' ? '매도: 1/4은 LOC 지점, 3/4은 +A% 지정가' : 'Sell: 1/4 at LOC, 3/4 at +A% limit'}</li>
            </ul>
            <div className="mt-3 pt-3 border-t border-slate-700/30 dark:border-slate-600/30">
              <p className="text-[9px] text-slate-400 dark:text-slate-500">
                {lang === 'ko' ? '출처 : ' : 'Source : '}
                <a 
                  href="https://www.youtube.com/@laofus" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline"
                >
                  https://www.youtube.com/@laofus
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 다분할 매매법 Step 2: 포트폴리오 메타 정보
  const renderMultiSplitStep2 = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="space-y-6">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-[0.2em]">
            {lang === 'ko' ? '포트폴리오 이름:' : 'Portfolio Name:'}
          </label>
          <div className="relative">
            <Settings2 className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              type="text"
              placeholder={lang === 'ko' ? '예: 내 은퇴 자금 40분할' : 'e.g., My retirement fund 40-split'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-6 pl-16 bg-slate-100/50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl border border-slate-200 dark:border-white/10 focus:ring-4 focus:ring-emerald-500/20 font-black text-lg outline-none transition-all"
            />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-[0.2em]">
            {lang === 'ko' ? '1회 매수 금액 ($):' : '1st Purchase Amount ($):'}
          </label>
          <div className="relative">
            <Wallet className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <div className="absolute right-8 top-1/2 -translate-y-1/2 text-xl font-black text-slate-600">$</div>
            <input
              type="number"
              value={dailyBuy}
              onChange={(e) => setDailyBuy(Number(e.target.value))}
              className="w-full p-6 pl-16 bg-slate-100/50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl border border-slate-200 dark:border-white/10 focus:ring-4 focus:ring-emerald-500/20 font-black text-xl outline-none transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-4">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-[0.2em]">
              {lang === 'ko' ? '시작일:' : 'Start Date:'}
            </label>
            <div className="relative">
              <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={18} />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-white/10 font-bold text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              />
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-[0.2em]">
              {lang === 'ko' ? '수수료율 (선택):' : 'Fee Rate (%):'}
            </label>
            <div className="relative">
              <Percent className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={18} />
              <input
                type="number"
                step="0.01"
                value={feeRate}
                onChange={(e) => setFeeRate(Number(e.target.value))}
                className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-white/10 font-bold text-sm outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              />
            </div>
            <p className="text-[9px] text-slate-500 font-bold uppercase">
              {lang === 'ko' ? '미입력시 기본값 0.25%가 적용됩니다.' : 'Defaults to 0.25% if empty.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
      <div className="space-y-6">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-[0.2em]">{lang === 'ko' ? '포트폴리오 이름:' : 'Portfolio Name:'}</label>
          <div className="relative">
             <Settings2 className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
             <input 
              type="text" 
              placeholder={lang === 'ko' ? '포트폴리오 이름을 입력하세요' : 'Enter portfolio name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-6 pl-16 bg-slate-100/50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl border border-slate-200 dark:border-white/10 focus:ring-4 focus:ring-blue-500/20 font-black text-lg outline-none transition-all" 
             />
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-[0.2em]">{lang === 'ko' ? '매일 매수하는 금액:' : 'Daily Purchase Amount:'}</label>
          <div className="relative">
             <Wallet className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
             <div className="absolute right-8 top-1/2 -translate-y-1/2 text-xl font-black text-slate-600">$</div>
             <input 
              type="number" 
              value={dailyBuy}
              onChange={(e) => setDailyBuy(Number(e.target.value))}
              className="w-full p-6 pl-16 bg-slate-100/50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl border border-slate-200 dark:border-white/10 focus:ring-4 focus:ring-blue-500/20 font-black text-xl outline-none transition-all" 
             />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-4">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-[0.2em]">{lang === 'ko' ? '시작일:' : 'Start Date:'}</label>
            <div className="relative">
               <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={18} />
               <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-white/10 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" 
               />
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-600 dark:text-slate-500 uppercase tracking-[0.2em]">{lang === 'ko' ? '수수료율 (선택):' : 'Fee Rate (%):'}</label>
            <div className="relative">
               <Percent className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={18} />
               <input 
                type="number" 
                step="0.01"
                value={feeRate}
                onChange={(e) => setFeeRate(Number(e.target.value))}
                className="w-full p-5 pl-14 bg-slate-100/50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-white/10 font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" 
               />
            </div>
            <p className="text-[9px] text-slate-500 font-bold uppercase">{lang === 'ko' ? '미입력시 기본값 0.25%가 적용됩니다.' : 'Defaults to 0.25% if empty.'}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-slate-950/90 backdrop-blur-xl" onClick={onClose}></div>
      <div 
        className="relative w-full max-w-2xl bg-white dark:bg-[#111827] rounded-[2.5rem] md:rounded-[3rem] shadow-2xl dark:shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)] border border-slate-200 dark:border-white/10"
        style={{ touchAction: 'pan-y' }}
      >
        
        {/* Header - 고정 */}
        <div className="p-6 md:p-10 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                {step === 0 ? (
                  <Sparkles className="text-white" size={24} />
                ) : step === 3 ? (
                  <Sparkles className="text-white" size={24} />
                ) : (
                  <Target className="text-white" size={24} />
                )}
             </div>
             <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {step === 0 
                    ? (lang === 'ko' ? '전략 엔진 선택' : 'Strategy Engine Selection')
                    : step === 3 
                    ? (lang === 'ko' ? '포트폴리오 기타 정보 설정' : 'Portfolio Final Settings') 
                    : (lang === 'ko' ? '전략 세부 설정' : 'Strategy Detailed Settings')}
                </h2>
                {step > 0 && (
                  <div className="flex items-center gap-2 mt-0.5">
                     <div className="flex gap-1">
                        {selectedStrategy === 'rsi_ma_interval' 
                          ? [1, 2, 3].map(i => (
                              <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${step === i ? 'w-8 bg-blue-500' : 'w-3 bg-slate-200 dark:bg-slate-800'}`}></div>
                            ))
                          : selectedStrategy === 'multi_split'
                          ? [1, 2].map(i => (
                              <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${step === i ? 'w-8 bg-emerald-500' : 'w-3 bg-slate-200 dark:bg-slate-800'}`}></div>
                            ))
                          : null
                        }
                     </div>
                     <span className={`text-[10px] font-black uppercase tracking-widest ml-2 ${
                       selectedStrategy === 'multi_split' ? 'text-emerald-500' : 'text-blue-500'
                     }`}>
                       {selectedStrategy === 'rsi_ma_interval' 
                         ? `Step ${step} of 3`
                         : selectedStrategy === 'multi_split'
                         ? `Step ${step} of 2`
                         : ''}
                     </span>
                  </div>
                )}
             </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-400">
            <X size={24} />
          </button>
        </div>

        {/* Content Area - 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 md:p-10 scrollbar-hide">
          {step === 0 && renderStrategySelection()}
          {step === 1 && selectedStrategy === 'rsi_ma_interval' && renderStep1()}
          {step === 2 && selectedStrategy === 'rsi_ma_interval' && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 1 && selectedStrategy === 'multi_split' && renderMultiSplitStep1()}
          {step === 2 && selectedStrategy === 'multi_split' && renderMultiSplitStep2()}
        </div>

        {/* Footer - 하단 고정 */}
        <div className="p-6 md:p-10 border-t border-slate-200 dark:border-white/5 flex gap-4 bg-slate-50 dark:bg-slate-900/60 shrink-0">
          {step === 0 ? (
            <button 
              onClick={onClose}
              className="flex-1 py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl font-black uppercase text-xs transition-all border border-slate-200 dark:border-white/10"
            >
              {lang === 'ko' ? '취소' : 'Cancel'}
            </button>
          ) : (
            <>
              {step > 1 && (
                <button 
                  onClick={() => {
                    if (step === 1) {
                      setStep(0);
                      setSelectedStrategy(null);
                    } else {
                      setStep(step - 1);
                    }
                  }}
                  className="px-8 py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 transition-all border border-slate-200 dark:border-white/10"
                >
                  <ChevronLeft size={18} strokeWidth={3} /> {lang === 'ko' ? '이전' : 'Back'}
                </button>
              )}
              <button 
                onClick={() => {
                  if (selectedStrategy === 'multi_split') {
                    // 다분할 매매법: step 1 -> step 2 -> 저장
                    if (step === 1) {
                      setStep(2);
                    } else if (step === 2) {
                      handleSave();
                    }
                  } else if (selectedStrategy === 'rsi_ma_interval') {
                    // RSI & 이평선: step 1 -> step 2 -> step 3 -> 저장
                    if (step < 3) {
                      setStep(step + 1);
                    } else {
                      handleSave();
                    }
                  }
                }}
                disabled={!selectedStrategy}
                className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedStrategy === 'multi_split' 
                  ? (step === 2 ? (lang === 'ko' ? '전략 시작' : 'Start Strategy') : (lang === 'ko' ? '다음' : 'Next'))
                  : (step < 3 ? (lang === 'ko' ? '다음' : 'Next') : (lang === 'ko' ? '저장' : 'Save'))
                }
                {((selectedStrategy === 'multi_split' && step < 2) || (selectedStrategy === 'rsi_ma_interval' && step < 3)) && <ChevronRight size={18} strokeWidth={3} />}
              </button>
            </>
          )}
        </div>
      </div>

      <InfoModal
        open={proInfoOpen}
        title="PRO/PREMIUM 전용"
        message={lockedTooltip}
        onClose={() => setProInfoOpen(false)}
      />
    </div>
  );
};

export default StrategyCreator;
