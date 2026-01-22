
import React, { useState } from 'react';
import { Portfolio, Strategy } from '../types';
import { AVAILABLE_STOCKS, I18N } from '../constants';
import { X, ChevronRight, ChevronLeft, Info, Sparkles, Target, Zap, Settings2, Calendar, Wallet, Percent, AlertTriangle, ChevronDown } from 'lucide-react';
import { useTossApp } from '../contexts/TossAppContext';
import CustomDropdown from './CustomDropdown';

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
}

const StrategyCreator: React.FC<StrategyCreatorProps> = ({ lang, onClose, onSave }) => {
  const { isInTossApp } = useTossApp();
  const [step, setStep] = useState(1);
  
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

  // Step 3: Meta
  const [name, setName] = useState('');
  const [dailyBuy, setDailyBuy] = useState(1000);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [feeRate, setFeeRate] = useState(0.25);

  const t = I18N[lang];

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
    const newP: Omit<Portfolio, 'id'> = {
      name: name || (lang === 'ko' ? '커스텀 전략' : 'Custom Strategy'),
      dailyBuyAmount: dailyBuy,
      startDate: startDate,
      feeRate: feeRate,
      isClosed: false,
      trades: [],
      strategy: {
        ma0: { stock: ma0Stock, rsiEnabled },
        ma1: { period: ma1Period, stock: ma1Stock, rsiThreshold: rsiEnabled ? ma1Rsi : undefined },
        ma2: { period1: ma2Period1, period2: ma2Period2, stock: ma2Stock, splitCount: ma2Split, rsiThreshold: rsiEnabled ? ma2Rsi : undefined },
        ma3: { period: ma3Period, stock: ma3Stock, rsiThreshold: rsiEnabled ? ma3Rsi : undefined }
      }
    };
    console.log('부모 함수 호출 시작');
    await onSave(newP);
    console.log('부모 함수 호출 완료');
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
                {AVAILABLE_STOCKS.map((stock) => (
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
                ))}
              </Menu.Dropdown>
            </Menu>
          ) : (
            <CustomDropdown
              value={ma0Stock}
              options={AVAILABLE_STOCKS.map(s => ({ value: s, label: s }))}
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
                  {AVAILABLE_STOCKS.map((stock) => (
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
                  ))}
                </Menu.Dropdown>
              </Menu>
            ) : (
              <CustomDropdown
                value={ma1Stock}
                options={AVAILABLE_STOCKS.map(s => ({ value: s, label: s }))}
                onChange={(value) => setMa1Stock(value)}
                header={lang === 'ko' ? '종목 선택' : 'Select Stock'}
              />
            )}
          </div>
        </div>

        {rsiEnabled && (
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/5 animate-in fade-in slide-in-from-top-2">
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? 'RSI 기준 값 (0-100):' : 'RSI Base Value (0-100):'}</label>
            <input 
              type="number" 
              value={ma1Rsi}
              onChange={(e) => setMa1Rsi(Number(e.target.value))}
              className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              min="0"
              max="100"
            />
            <p className="text-[10px] text-slate-500 font-medium">
              {lang === 'ko' ? 'RSI가 이 값 이하일 때만 매수합니다.' : 'Buy only when RSI is below this value.'}
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
                  {AVAILABLE_STOCKS.map((stock) => (
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
                  ))}
                </Menu.Dropdown>
              </Menu>
            ) : (
              <CustomDropdown
                value={ma2Stock}
                options={AVAILABLE_STOCKS.map(s => ({ value: s, label: s }))}
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
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? 'RSI 기준 값 (0-100):' : 'RSI Base Value (0-100):'}</label>
            <input 
              type="number" 
              value={ma2Rsi}
              onChange={(e) => setMa2Rsi(Number(e.target.value))}
              className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              min="0"
              max="100"
            />
            <p className="text-[10px] text-slate-500 font-medium">
              {lang === 'ko' ? 'RSI가 이 값 이하일 때만 매수합니다.' : 'Buy only when RSI is below this value.'}
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
                  {AVAILABLE_STOCKS.map((stock) => (
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
                  ))}
                </Menu.Dropdown>
              </Menu>
            ) : (
              <CustomDropdown
                value={ma3Stock}
                options={AVAILABLE_STOCKS.map(s => ({ value: s, label: s }))}
                onChange={(value) => setMa3Stock(value)}
                header={lang === 'ko' ? '종목 선택' : 'Select Stock'}
              />
            )}
          </div>
        </div>

        {rsiEnabled && (
          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/5 animate-in fade-in slide-in-from-top-2">
            <label className="text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{lang === 'ko' ? 'RSI 기준 값 (0-100):' : 'RSI Base Value (0-100):'}</label>
            <input 
              type="number" 
              value={ma3Rsi}
              onChange={(e) => setMa3Rsi(Number(e.target.value))}
              className="w-full p-4 bg-slate-100/50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              min="0"
              max="100"
            />
            <p className="text-[10px] text-slate-500 font-medium">
              {lang === 'ko' ? 'RSI가 이 값 이하일 때만 매수합니다.' : 'Buy only when RSI is below this value.'}
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
                {step === 3 ? <Sparkles className="text-white" size={24} /> : <Target className="text-white" size={24} />}
             </div>
             <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {step === 3 ? (lang === 'ko' ? '포트폴리오 기타 정보 설정' : 'Portfolio Final Settings') : (lang === 'ko' ? '전략 세부 설정' : 'Strategy Detailed Settings')}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                   <div className="flex gap-1">
                      {[1, 2, 3].map(i => (
                        <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${step === i ? 'w-8 bg-blue-500' : 'w-3 bg-slate-200 dark:bg-slate-800'}`}></div>
                      ))}
                   </div>
                   <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-2">Step {step} of 3</span>
                </div>
             </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500 dark:text-slate-400">
            <X size={24} />
          </button>
        </div>

        {/* Content Area - 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 md:p-10 scrollbar-hide">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>

        {/* Footer - 하단 고정 */}
        <div className="p-6 md:p-10 border-t border-slate-200 dark:border-white/5 flex gap-4 bg-slate-50 dark:bg-slate-900/60 shrink-0">
          {step > 1 && (
            <button 
              onClick={() => setStep(step - 1)}
              className="px-8 py-5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 transition-all border border-slate-200 dark:border-white/10"
            >
              <ChevronLeft size={18} strokeWidth={3} /> {lang === 'ko' ? '이전' : 'Back'}
            </button>
          )}
          <button 
            onClick={() => step < 3 ? setStep(step + 1) : handleSave()}
            className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 shadow-xl shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-all"
          >
            {step < 3 ? (lang === 'ko' ? '다음' : 'Next') : (lang === 'ko' ? '저장' : 'Save')} 
            {step < 3 && <ChevronRight size={18} strokeWidth={3} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StrategyCreator;
