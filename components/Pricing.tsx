import React, { useState, useCallback, useRef } from 'react';
import { Sparkles, Star, Crown, Check, Lock, Zap, Bell, Clock, Brain, ArrowRight } from 'lucide-react';

const PREMIUM_GLOW_STYLE = `
  @keyframes breathe-gold {
    0%, 100% { box-shadow: 0 0 10px rgba(252, 213, 53, 0.2), inset 0 0 5px rgba(252, 213, 53, 0.1); }
    50% { box-shadow: 0 0 25px rgba(252, 213, 53, 0.5), inset 0 0 10px rgba(252, 213, 53, 0.2); }
  }
  .animate-premium-glow {
    animation: breathe-gold 3s infinite ease-in-out;
  }
`;

interface PricingProps {
  lang: 'ko' | 'en';
  currentTier: 'free' | 'pro' | 'premium' | string;
}

const MOCK_TRADES = (isKo: boolean) => [
  { text: 'TQQQ MOC Sell' },
  { text: 'NVDA LOC Buy' }
];

const TELEGRAM_PREVIEW_CARDS = (isKo: boolean) => [
  {
    badge: isKo ? '기본 분할매수' : 'Basic Split',
    badgeClass: 'bg-blue-500/20 text-blue-200 border-blue-400/50',
    intro: isKo ? '설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.' : 'Your set trading alarm time. Please check your portfolio strategy.',
    time: '18:00',
    lines: [
      { text: isKo ? '다분할 매매법' : 'Multi-split trading', type: 'text' },
      { text: isKo ? '알람 시간 (KST): 17:10, 18:00' : 'Alarm (KST): 17:10, 18:00', type: 'text' },
      { text: 'LOC 매수1: 55.14 / 9주', type: 'buy' },
      { text: 'LOC 매수2: 60.37 / 8주', type: 'buy' },
      { text: 'LOC 매도: 60.38 / 4주', type: 'sell' },
      { text: '지정가 매도: 60.65 / 13주', type: 'sell' },
    ],
  },
  {
    badge: isKo ? '커스텀 전략 혼합' : 'Custom Strategy Mix',
    badgeClass: 'bg-purple-500/20 text-purple-200 border-purple-400/50',
    intro: isKo ? '설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.' : 'Your set trading alarm time. Please check your portfolio strategy.',
    time: '09:00',
    lines: [
      { text: isKo ? '다분할 매매법' : 'Multi-split trading', type: 'text' },
      { text: isKo ? '알람 시간 (KST): 09:00' : 'Alarm (KST): 09:00', type: 'text' },
      { text: 'LOC 매수2: 54.56 / 18주', type: 'buy' },
      { text: 'LOC 매도: 54.57 / 100주', type: 'sell' },
      { text: '지정가 매도: 60.65 / 300주', type: 'sell' },
      { text: '—', type: 'text' },
      { text: isKo ? '이평선 구간매수' : 'MA interval buy', type: 'text' },
      { text: isKo ? '구간 2: QLD 매수' : 'Section 2: QLD Buy', type: 'buy' },
      { text: isKo ? '오늘 주문 요약은 앱에서 확인해 주세요.' : 'Check today\'s order summary in the app.', type: 'footer' },
    ],
  },
  {
    badge: isKo ? '손절 및 특수대응' : 'Stop-loss & Special',
    badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-400/50',
    intro: isKo ? '설정하신 매매 알람 시간입니다. 포트폴리오 전략을 확인해 주세요.' : 'Your set trading alarm time. Please check your portfolio strategy.',
    time: '09:00',
    lines: [
      { text: isKo ? '이평선 구간매수' : 'MA interval buy', type: 'text' },
      { text: isKo ? '알람 시간 (KST): 09:00' : 'Alarm (KST): 09:00', type: 'text' },
      { text: isKo ? '구간 3: QQQ 매수' : 'Section 3: QQQ Buy', type: 'buy' },
      { text: isKo ? '오늘 주문 요약은 앱에서 확인해 주세요.' : 'Check today\'s order summary in the app.', type: 'footer' },
      { text: '—', type: 'text' },
      { text: isKo ? '다분할 매매법' : 'Multi-split trading', type: 'text' },
      { text: 'MOC 매도: 104.25 주', type: 'sell' },
      { text: isKo ? 'MOC 매도 하여 쿼터 손절 모드 시작' : 'MOC sell to start quarter stop-loss mode', type: 'sell' },
    ],
  },
];

const Pricing: React.FC<PricingProps> = ({ lang, currentTier }) => {
  const isKo = lang === 'ko';
  const [telegramCardIndex, setTelegramCardIndex] = useState(0);
  const [aiCardIndex, setAiCardIndex] = useState(0);
  const previewCards = TELEGRAM_PREVIEW_CARDS(isKo);
  
  const cycleTelegram = useCallback(() => setTelegramCardIndex((i) => (i + 1) % previewCards.length), [previewCards.length]);
  const cycleAI = useCallback(() => setAiCardIndex((i) => (i + 1) % 3), []);
  
  const touchStartX = useRef<number>(0);

  const tiers = [
    {
      id: 'free',
      label: 'FREE',
      subtitle: isKo ? '초보 투자자' : 'Getting Started',
      price: isKo ? '₩0' : '$0',
      priceNote: isKo ? '/ 평생' : '/ lifetime',
      theme: 'free',
      features: [
        { text: isKo ? '포트폴리오 최대 2개' : 'Up to 2 portfolios' },
        { text: isKo ? '알람 슬롯 2개' : '2 alert slots' },
        { text: isKo ? '기본 13개 ETF' : '13 core ETFs' },
        { text: isKo ? 'AI 매매 인식 (1회/일)' : 'AI Trade Recognition (1/day)' },
        { text: isKo ? '백테스트 (2회/일)' : 'Backtesting (2/day)', disabled: true },
        { text: isKo ? '기본 알람 · 기록 기능' : 'Core alerts & history' },
        { text: isKo ? '광고 포함' : 'Includes ads' },
      ],
    },
    {
      id: 'pro',
      label: 'PRO',
      subtitle: isKo ? '전문 투자자' : 'Active Investor',
      price: isKo ? '₩5,900' : '$5.90',
      priceNote: isKo ? '/ 월 (예정)' : '/ month (planned)',
      theme: 'pro',
      badge: isKo ? '가장 인기 있는 선택' : 'Most popular',
      features: [
        { text: isKo ? '포트폴리오 최대 5개' : 'Up to 5 portfolios' },
        { text: isKo ? '알람 슬롯 10개' : '10 alert slots' },
        { text: isKo ? '기본 13개 + PRO 전용 종목' : 'Core + PRO tickers (TSLA, NVDA, MSTR …)' },
        { text: isKo ? 'AI 매매 인식 (50회/월)' : 'AI Trade Recognition (50/month)' },
        { text: isKo ? '백테스트 (5회/일)' : 'Backtesting (5/day)', disabled: true },
        { text: isKo ? '텔레그램 상세 알림' : 'Detailed Telegram alerts' },
        { text: isKo ? '광고 제거' : 'No ads' },
      ],
    },
    {
      id: 'premium',
      label: 'PREMIUM',
      subtitle: isKo ? '슈퍼 고래' : 'Power User',
      price: isKo ? '₩9,900' : '$9.90',
      priceNote: isKo ? '/ 월 (출시 예정)' : '/ month (coming soon)',
      theme: 'premium',
      badge: isKo ? 'COMING SOON' : 'COMING SOON',
      features: [
        { text: isKo ? '포트폴리오 최대 20개' : 'Up to 20 portfolios' },
        { text: isKo ? '알람 슬롯 40개' : '40 alert slots' },
        { text: isKo ? '모든 종목 + 베타 종목' : 'All tickers + beta' },
        { text: isKo ? 'AI 매매 인식 (무제한)' : 'Unlimited AI Recognition' },
        { text: isKo ? '백테스트 (10회/일)' : 'Backtesting (10/day)', disabled: true },
        { text: isKo ? '신규 전략 선공개' : 'Early access to strategies' },
        { text: isKo ? 'VIP 전용 고객 지원' : 'VIP priority support' },
      ],
    },
  ];

  const renderIcon = (theme: 'free' | 'pro' | 'premium') => {
    if (theme === 'premium') {
      return (
        <div className="relative w-full h-full bg-[#000000] rounded-2xl flex items-center justify-center overflow-hidden border-2 border-[#FCD535] animate-premium-glow">
          {/* 미세 광원 효과 */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(252,213,53,0.1)_0%,transparent_70%)]" />
          
          <Crown size={24} className="text-[#FCD535] drop-shadow-[0_0_8px_rgba(252,213,53,0.6)] relative z-10" />
        </div>
      );
    }
    if (theme === 'pro') {
      return (
        <div className="w-full h-full bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-400/30">
          <Star size={24} className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
        </div>
      );
    }
    return (
      <div className="w-full h-full rounded-2xl flex items-center justify-center border border-slate-300 dark:border-white">
        <Zap size={22} className="text-slate-900 dark:text-slate-200" />
      </div>
    );
  };

  return (
    <div className="relative min-h-[70vh] pb-20 font-sans">
      <style>{PREMIUM_GLOW_STYLE}</style>
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-32 -left-16 w-80 h-80 bg-gradient-to-br from-blue-500/25 via-indigo-500/10 to-transparent rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-24 right-0 w-96 h-96 bg-gradient-to-tl from-purple-500/25 via-amber-500/10 to-transparent rounded-full blur-3xl opacity-50" />
      </div>

      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center space-y-4 mb-20">
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tighter uppercase italic">
            Membership
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
            {isKo ? '나에게 맞는 등급을 선택하고 거래 효율을 높여보세요.' : 'Simple but powerful benefits. Choose the right membership to scale your strategies.'}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {tiers.map((tier) => {
            const isCurrent = currentTier === tier.id;
            const isDisabled = tier.id === 'premium';

            const baseCardClasses =
              tier.theme === 'premium'
                ? 'bg-[#000000] border border-amber-500/30 ring-1 ring-amber-500/20'
                : tier.theme === 'pro'
                ? 'bg-gradient-to-br from-[#E0F2FE] via-[#F3E8FF] to-[#FFFFFF] dark:from-blue-900/40 dark:via-indigo-900/40 dark:to-slate-900 border border-blue-200 dark:border-blue-500/30 shadow-xl'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/70 shadow-xl dark:shadow-2xl';

            return (
              <div
                key={tier.id}
                className={`relative rounded-[2.2rem] p-6 md:p-8 flex flex-col justify-between overflow-hidden transition-all duration-300 ${baseCardClasses} ${
                  isDisabled ? 'opacity-80' : ''
                }`}
              >
                <div className="relative mb-8 pt-4">
                  {isCurrent && (
                    <div className="absolute -top-2 -left-2 z-20">
                      <span className={`text-[9px] px-2.5 py-1 rounded-full border whitespace-nowrap font-black uppercase tracking-wider shadow-sm ${
                        tier.theme === 'pro' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-400/30'
                      }`}>
                        {isKo ? '현재 등급' : 'Current plan'}
                      </span>
                    </div>
                  )}

                  {tier.badge && (
                    <div className="absolute -top-2 -right-2 z-20">
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border whitespace-nowrap shadow-sm ${
                        tier.theme === 'premium' ? 'bg-slate-950 text-amber-300 border-amber-500/40' : 'bg-blue-600 text-white border-blue-400'
                      }`}>
                        {tier.badge}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 shrink-0">
                      {renderIcon(tier.theme as 'free' | 'pro' | 'premium')}
                    </div>
                    <div className={`text-left ${isDisabled ? 'grayscale opacity-50' : ''}`}>
                      <div className={`text-sm font-black tracking-[0.2em] uppercase ${tier.theme === 'free' ? 'text-slate-900 dark:text-slate-300' : tier.theme === 'pro' ? 'text-blue-900 dark:text-white' : 'text-white'}`}>
                        {tier.label}
                      </div>
                      <div className={`text-[11px] font-medium ${tier.theme === 'pro' ? 'text-blue-600/70 dark:text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>{tier.subtitle}</div>
                    </div>
                  </div>
                </div>

                <div className={`flex flex-col h-full ${isDisabled ? 'grayscale opacity-50' : ''}`}>
                  <div className="mb-6">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-3xl font-black tracking-tight ${tier.theme === 'free' ? 'text-slate-900 dark:text-white' : tier.theme === 'pro' ? 'text-blue-950 dark:text-white' : 'text-white'}`}>
                        {tier.price}
                      </span>
                      <span className={`text-xs font-medium ${tier.theme === 'pro' ? 'text-blue-600/60 dark:text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>{tier.priceNote}</span>
                    </div>
                  </div>

                  <ul className={`space-y-3 mb-8 text-xs ${tier.theme === 'free' ? 'text-slate-600 dark:text-slate-300' : tier.theme === 'pro' ? 'text-blue-900/80 dark:text-slate-200' : 'text-slate-200'}`}>
                    {tier.features.map((f, idx) => (
                      <li key={idx} className={`flex items-start gap-2.5 ${f.disabled ? 'opacity-40' : ''}`}>
                        <div className="mt-0.5 shrink-0">
                          {f.disabled ? (
                            <Lock size={12} className="text-slate-500" />
                          ) : (
                            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${tier.theme === 'pro' ? 'border-blue-400 bg-blue-400/20' : tier.theme === 'premium' ? 'border-amber-400 bg-amber-400/20' : 'border-emerald-400 bg-emerald-400/20'}`}>
                              <Check size={9} className={tier.theme === 'pro' ? 'text-blue-500' : tier.theme === 'premium' ? 'text-amber-400' : 'text-emerald-500'} />
                            </div>
                          )}
                        </div>
                        <span>{f.text}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 group/btn ${
                      tier.theme === 'premium' ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20' : tier.theme === 'pro' ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
                    }`}
                  >
                    {isCurrent ? (isKo ? '사용 중인 플랜' : 'Current Plan') : tier.id === 'premium' ? (isKo ? '출시 알림 받기' : 'Get Notified') : (isKo ? '업그레이드하기' : 'Upgrade Now')}
                    {!isCurrent && tier.id !== 'premium' && <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />}
                    {tier.id === 'premium' && <Bell size={16} className="animate-pulse" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Section (Simplified for this file's context, restoring your specific visual logic) */}
        <section className="mt-40 mb-20 p-8 md:p-16 rounded-[3rem] bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-500/20 transition-all">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-[10px] font-black uppercase tracking-widest">
                <Brain size={14} /> AI SMART SCAN
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white leading-[1.1] tracking-tight">
                {isKo ? '스크린샷 한 장으로\n매매 기록을 끝내세요' : 'Auto-log trades with\na screenshot'}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg md:text-xl font-medium leading-relaxed max-w-lg">
                {isKo ? '증권사 앱의 체결 내역 화면을 캡처해서 올려주시면 AI가 종목, 단가, 수량을 자동으로 인식하여 포트폴리오에 반영합니다.' : 'Upload execution history and AI logs trades automatically.'}
              </p>
              <div className="space-y-4">
                {[{text: isKo ? '정밀한 인식률 (99%)' : '99% Accuracy'}, {text: isKo ? '일괄 처리 지원' : 'Batch Support'}, {text: isKo ? '수기 입력 제로' : 'Zero Manual Entry'}].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-slate-700 dark:text-slate-300 font-bold">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400"><Check size={14} /></div>
                    <span className="text-sm md:text-base">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative flex justify-center lg:justify-end">
              <div className="relative w-[325px] h-[375px] select-none" style={{ perspective: '1200px' }}>
                <div className="relative w-full h-full cursor-pointer" onClick={cycleAI}>
                  <div className="absolute inset-0 transition-opacity duration-300" style={{ opacity: aiCardIndex === 0 ? 1 : 0.4, zIndex: aiCardIndex === 0 ? 30 : 10 }}>
                    <div className="relative h-full rounded-2xl overflow-hidden shadow-xl bg-slate-900 flex items-center justify-center border border-white/10">
                      <img src="/images/ai_step_input.jpg" alt="Step 1" className="max-w-full max-h-full object-contain" />
                    </div>
                  </div>
                  <div className="absolute inset-0 transition-opacity duration-300" style={{ opacity: aiCardIndex === 1 ? 1 : 0.4, zIndex: aiCardIndex === 1 ? 30 : 10 }}>
                    <div className="relative h-full rounded-2xl overflow-hidden shadow-xl bg-slate-900 flex items-center justify-center border border-white/10">
                      <img src="/images/ai_step_processing.jpg" alt="Step 2" className="max-w-full max-h-full object-contain" />
                    </div>
                  </div>
                  <div className="absolute inset-0 transition-opacity duration-300" style={{ opacity: aiCardIndex === 2 ? 1 : 0.4, zIndex: aiCardIndex === 2 ? 30 : 10 }}>
                    <div className="relative h-full rounded-2xl overflow-hidden shadow-xl bg-slate-900 flex items-center justify-center border border-white/10">
                      <img src="/images/ai_step_result.jpg" alt="Step 3" className="max-w-full max-h-full object-contain" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Telegram Section */}
        <section className="mt-40 mb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="relative group">
              <div className="relative w-full max-w-[320px] mx-auto aspect-[9/18.5] bg-[#1a1c23] rounded-[3rem] border-8 border-slate-800 shadow-2xl overflow-hidden ring-1 ring-white/10">
                <div className="absolute inset-4 rounded-[2rem] bg-[#0e1117] overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 bg-slate-900/80 border-b border-white/5">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-black">B</div>
                    <div className="text-xs font-black text-white">BTD Alarm Bot</div>
                  </div>
                  <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-60px)]" onClick={cycleTelegram}>
                    {previewCards.map((card, idx) => (
                      <div key={idx} className={`p-4 rounded-2xl bg-slate-800 border border-white/5 transition-all duration-300 ${idx === telegramCardIndex ? 'opacity-100' : 'hidden'}`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${card.badgeClass}`}>{card.badge}</span>
                          <span className="text-[8px] text-slate-500">{card.time}</span>
                        </div>
                        <p className="text-[10px] text-slate-300 mb-3">{card.intro}</p>
                        <div className="space-y-1">
                          {card.lines.map((line, i) => (
                            <div key={i} className={`text-[9px] ${line.type === 'buy' ? 'text-emerald-400' : line.type === 'sell' ? 'text-rose-400' : 'text-slate-100'}`}>• {line.text}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 text-[10px] font-black uppercase tracking-widest">
                <Bell size={14} /> SMART NOTIFICATIONS
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white leading-[1.1] tracking-tight">
                {isKo ? '매매 시점을\n노치지 마세요' : 'Real-time alerts,\nZero missed trades'}
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-lg md:text-xl font-medium leading-relaxed">
                {isKo ? '복잡한 계산 없이 텔레그램으로 전송되는 정교한 매매 지시를 따르기만 하세요.' : 'Get precise trading signals via Telegram.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Pricing;
