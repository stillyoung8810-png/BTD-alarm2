import React, { useState, useCallback, useRef } from 'react';
import { Sparkles, Star, Crown, Check, Lock, Zap, Bell, Clock } from 'lucide-react';

interface PricingProps {
  lang: 'ko' | 'en';
  currentTier: 'free' | 'pro' | 'premium' | string;
}

// 텔레그램 알람 미리보기용 3종 메시지 데이터 (기본 분할 / 커스텀 혼합 / 손절·특수대응)
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
  const previewCards = TELEGRAM_PREVIEW_CARDS(isKo);
  const cycleNext = useCallback(() => setTelegramCardIndex((i) => (i + 1) % previewCards.length), [previewCards.length]);
  const touchStartX = useRef<number>(0);

  const tiers = [
    {
      id: 'free',
      label: 'FREE',
      subtitle: isKo ? '초보 투자자' : 'Getting Started',
      price: isKo ? '₩0' : '$0',
      priceNote: isKo ? '/ 평생' : '/ lifetime',
      highlight: false,
      disabled: false,
      theme: 'free',
      features: [
        isKo ? '포트폴리오 최대 2개' : 'Up to 2 portfolios',
        isKo ? '알람 슬롯 2개' : '2 alert slots',
        isKo ? '기본 13개 ETF' : '13 core ETFs',
        isKo ? 'AI 매매 인식 (1회/일)' : 'AI Trade Recognition (1/day)',
        isKo ? '백테스트 (2회/일, 제한된 정보)' : 'Backtesting (2/day, limited info)',
        isKo ? '기본 알람 · 기록 기능' : 'Core alerts & history',
        isKo ? '광고 포함' : 'Includes ads',
      ],
    },
    {
      id: 'pro',
      label: 'PRO',
      subtitle: isKo ? '전문 투자자' : 'Active Investor',
      price: isKo ? '₩5,900' : '$5.90',
      priceNote: isKo ? '/ 월 (예정)' : '/ month (planned)',
      highlight: true,
      disabled: false,
      theme: 'pro',
      badge: isKo ? '가장 인기 있는 선택' : 'Most popular',
      features: [
        isKo ? '포트폴리오 최대 5개' : 'Up to 5 portfolios',
        isKo ? '알람 슬롯 10개' : '10 alert slots',
        isKo ? '기본 13개 + PRO 전용 종목' : 'Core + PRO tickers (TSLA, NVDA, MSTR …)',
        isKo ? 'AI 매매 인식 (50회/월)' : 'AI Trade Recognition (50/month)',
        isKo ? '백테스트 (5회/일)' : 'Backtesting (5/day)',
        isKo ? '텔레그램 상세 알림' : 'Detailed Telegram alerts',
        isKo ? '광고 제거' : 'No ads',
      ],
    },
    {
      id: 'premium',
      label: 'PREMIUM',
      subtitle: isKo ? '슈퍼 고래' : 'Power User',
      price: isKo ? '₩9,900' : '$9.90',
      priceNote: isKo ? '/ 월 (출시 예정)' : '/ month (coming soon)',
      highlight: false,
      disabled: true,
      theme: 'premium',
      badge: isKo ? 'COMING SOON' : 'COMING SOON',
      features: [
        isKo ? '포트폴리오 최대 20개' : 'Up to 20 portfolios',
        isKo ? '알람 슬롯 40개' : '40 alert slots',
        isKo ? '모든 종목 + 베타 종목' : 'All tickers + beta',
        isKo ? 'AI 매매 인식 (무제한)' : 'Unlimited AI Recognition',
        isKo ? '백테스트 (10회/일)' : 'Backtesting (10/day)',
        isKo ? '신규 전략 선공개' : 'Early access to strategies',
        isKo ? 'VIP 전용 고객 지원' : 'VIP priority support',
      ],
    },
  ];

  const renderIcon = (theme: 'free' | 'pro' | 'premium') => {
    if (theme === 'premium') {
      return <Crown size={26} className="text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" />;
    }
    if (theme === 'pro') {
      return <Star size={24} className="text-blue-300 drop-shadow-[0_0_8px_rgba(147,197,253,0.7)]" />;
    }
    // FREE: 상단 왼쪽 티어 아이콘과 동일하게 번개(Zap) 사용
    return <Zap size={22} className="text-slate-200" />;
  };

  return (
    <div className="relative min-h-[70vh]">
      {/* Background */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-32 -left-16 w-80 h-80 bg-gradient-to-br from-blue-500/25 via-indigo-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-24 right-0 w-96 h-96 bg-gradient-to-tl from-purple-500/25 via-amber-500/10 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-700 text-[10px] font-black uppercase tracking-[0.25em] text-slate-200">
            <Sparkles size={14} className="text-amber-300" />
            {isKo ? 'Premium Plans' : 'Premium Plans'}
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-black tracking-tight text-white">
            {isKo ? '등급별 혜택을 한눈에 비교하세요' : 'Compare benefits by membership tier'}
          </h2>
          <p className="mt-3 text-sm md:text-base text-slate-400 max-w-xl mx-auto">
            {isKo
              ? '심플하지만 강력한 등급별 혜택. 필요에 맞는 멤버십을 선택해 BUY THE DIP 전략을 확장해 보세요.'
              : 'Simple but powerful benefits. Choose the right membership to scale your BUY THE DIP strategies.'}
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {tiers.map((tier) => {
            const isCurrent = currentTier === tier.id;
            const disabled = tier.disabled;

            const baseCardClasses =
              tier.theme === 'premium'
                ? 'bg-gradient-to-br from-slate-900/90 via-slate-950 to-slate-900 border border-amber-500/30'
                : tier.theme === 'pro'
                ? 'bg-gradient-to-br from-blue-900/80 via-indigo-900/80 to-slate-950 border border-blue-500/40'
                : 'bg-slate-900/80 border border-slate-700/70';

            const ringClasses =
              tier.theme === 'pro'
                ? 'shadow-[0_0_40px_rgba(59,130,246,0.7)]'
                : tier.theme === 'premium'
                ? 'shadow-[0_0_40px_rgba(251,191,36,0.5)]'
                : 'shadow-[0_0_30px_rgba(15,23,42,0.7)]';

            return (
              <div
                key={tier.id}
                className={`relative rounded-[2.2rem] p-6 md:p-7 flex flex-col justify-between overflow-hidden ${baseCardClasses} ${ringClasses} ${
                  disabled ? 'opacity-60 grayscale pointer-events-none' : ''
                }`}
              >
                {/* Glow */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent pointer-events-none" />

                {/* Badge */}
                <div className="relative flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-black/30 flex items-center justify-center backdrop-blur-sm border border-white/10">
                      {renderIcon(tier.theme as 'free' | 'pro' | 'premium')}
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-black tracking-[0.2em] uppercase text-slate-300">
                        {tier.label}
                        {isCurrent && !disabled && (
                          <span className="ml-2 text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-400/30 whitespace-nowrap">
                            {isKo ? '현재 등급' : 'Current plan'}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium mt-0.5">{tier.subtitle}</div>
                    </div>
                  </div>

                  {tier.badge && (
                    <div
                      className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border whitespace-nowrap ${
                        tier.theme === 'premium'
                          ? 'bg-slate-900/80 text-amber-300 border-amber-500/40'
                          : 'bg-blue-500/10 text-blue-200 border-blue-400/40'
                      }`}
                    >
                      {tier.badge}
                    </div>
                  )}
                </div>

                {/* Price */}
                <div className="relative mb-5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl md:text-3xl font-black text-white tracking-tight">{tier.price}</span>
                    <span className="text-xs text-slate-400 font-medium">{tier.priceNote}</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="relative space-y-2 mb-6 text-xs text-slate-200">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check size={13} className="mt-0.5 text-emerald-300" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="relative mt-auto">
                  {disabled ? (
                    <button
                      type="button"
                      className="w-full py-3 rounded-2xl bg-slate-800/70 border border-slate-600 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center justify-center gap-2 cursor-not-allowed"
                    >
                      <Lock size={14} />
                      {isKo ? '곧 오픈 예정' : 'Coming soon'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        alert(
                          isKo
                            ? 'PRO 멤버십 결제/업그레이드 플로우는 곧 연결될 예정입니다.'
                            : 'The PRO upgrade flow will be connected soon.',
                        );
                      }}
                      className={`w-full py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all ${
                        tier.theme === 'pro'
                          ? 'bg-blue-500 text-white border border-blue-300/60 shadow-[0_0_20px_rgba(59,130,246,0.9)] hover:bg-blue-400'
                          : 'bg-slate-800 text-slate-100 border border-slate-600 hover:bg-slate-700'
                      }`}
                    >
                      <ArrowRightIcon />
                      {isKo ? '업그레이드 안내 받기' : 'Learn about upgrade'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* AI 스마트 매매 인식 섹션 */}
        <section className="mt-24 bg-gradient-to-br from-slate-900/50 to-indigo-950/30 rounded-[3rem] border border-white/5 p-8 md:p-16 overflow-hidden relative">
          {/* Background effects */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] -mr-64 -mt-32 pointer-events-none" />
          
          <div className="grid md:grid-cols-2 gap-12 items-center relative z-10">
            {/* Left: Content */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 text-[10px] font-black uppercase tracking-wider">
                <Sparkles size={12} />
                {isKo ? '스마트 매매 인식' : 'Smart Trade Recognition'}
              </div>

              <h3 className="text-4xl md:text-5xl font-black text-white leading-[1.15] tracking-tight">
                {isKo ? (
                  <>
                    스크린샷 한 장으로<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">매매</span> 기록 끝.
                  </>
                ) : (
                  <>
                    Trade logging done<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">with one</span> screenshot.
                  </>
                )}
              </h3>

              <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-md">
                {isKo 
                  ? '증권사 앱의 체결 내역을 캡쳐해서 올리거나 붙여넣기만 하세요. AI가 종목, 단가, 수량을 자동으로 추출하여 포트폴리오에 반영합니다.'
                  : 'Simply capture and upload or paste your trade details from any brokerage app. AI automatically extracts the ticker, price, and quantity to sync with your portfolio.'}
              </p>

              {/* Usage limits per tier */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'free', label: 'FREE', limit: isKo ? '1회 / 일' : '1/day', bg: 'bg-slate-800/50', border: 'border-slate-700/50', text: 'text-slate-300' },
                  { id: 'pro', label: 'PRO', limit: isKo ? '50회 / 월' : '50/month', bg: 'bg-blue-900/40', border: 'border-blue-500/30', text: 'text-blue-200' },
                  { id: 'premium', label: 'PREMIUM', limit: isKo ? '무제한' : 'Unlimited', bg: 'bg-amber-900/20', border: 'border-amber-500/30', text: 'text-amber-200' },
                ].map((item) => (
                  <div key={item.id} className={`p-4 rounded-2xl border ${item.border} ${item.bg} flex flex-col items-center justify-center gap-1`}>
                    <span className="text-[10px] font-black text-slate-500 tracking-tighter uppercase">{item.label}</span>
                    <span className={`text-[12px] md:text-[13px] font-bold ${item.text} whitespace-nowrap`}>{item.limit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Visual Mockup */}
            <div className="relative h-[450px] md:h-[500px] flex items-center justify-center group scale-[0.85] md:scale-100">
              {/* Back card: Scanning UI (Input Modal Style) */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[310px] h-[400px] bg-[#1a1d24] rounded-[1.5rem] border border-white/5 shadow-2xl transition-transform duration-700 group-hover:-translate-x-[65%] group-hover:-rotate-6 overflow-hidden">
                {/* Modal Header */}
                <div className="p-4 flex items-center justify-between border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                      <Sparkles size={14} className="text-white" />
                    </div>
                    <div>
                      <div className="text-[11px] font-black text-white leading-none">AI 매매 인식</div>
                      <div className="text-[8px] text-slate-500 font-bold mt-1">스크린샷 자동 분석</div>
                    </div>
                  </div>
                  <div className="text-slate-500 text-xs">✕</div>
                </div>
                
                {/* Modal Body (Dashed Area with Screenshot) */}
                <div className="p-4 space-y-4">
                  <div className="relative aspect-[9/12] rounded-xl border-2 border-dashed border-white/10 bg-black/20 flex flex-col items-center justify-center overflow-hidden">
                    {/* Actual Screenshot (Kiwoom) */}
                    <div className="absolute inset-1 rounded-lg bg-white overflow-hidden opacity-90">
                      <img 
                        src="/images/kiwoom_screenshot.jpg" 
                        alt="Kiwoom Screenshot" 
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Laser Scan Line */}
                    <div className="absolute inset-x-0 h-[2px] bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,1)] animate-scan-refined z-20" />
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400">취소</div>
                    <div className="flex-[2] h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white shadow-lg shadow-indigo-900/40">
                      <Sparkles size={12} className="mr-1.5" />
                      AI 스캔 시작
                    </div>
                  </div>
                </div>
              </div>

              {/* Front card: Success UI (Result Modal Style) */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 translate-x-12 translate-y-12 w-[290px] h-[360px] bg-[#1a1d24] rounded-[1.5rem] border border-white/10 shadow-[-20px_20px_50px_rgba(0,0,0,0.5)] transition-transform duration-700 group-hover:translate-x-[45%] group-hover:rotate-6 z-30 overflow-hidden">
                 {/* Modal Header */}
                 <div className="p-4 flex items-center justify-between border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                      <Sparkles size={14} className="text-white" />
                    </div>
                    <div>
                      <div className="text-[11px] font-black text-white leading-none">AI 매매 인식</div>
                      <div className="text-[8px] text-slate-500 font-bold mt-1">스크린샷 자동 분석</div>
                    </div>
                  </div>
                  <div className="text-slate-500 text-xs">✕</div>
                </div>

                <div className="p-5 h-full flex flex-col pt-4">
                  <div className="text-[12px] font-black text-white mb-4">인식된 매매 내역</div>

                  <div className="space-y-2.5 flex-1">
                    {[
                      { t: 'TQQQ', date: '2026-01-09', p: '$54.50', q: '10', fee: '$0.16', side: '매도' },
                      { t: 'TQQQ', date: '2026-01-09', p: '$54.14', q: '9', fee: '$0.14', side: '매도' },
                    ].map((tx, i) => (
                      <div key={i} className="bg-[#242932] rounded-xl p-3 px-4 border border-white/5 flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-rose-400">{tx.side}</span>
                          <span className="text-[11px] font-black text-white">{tx.t}</span>
                        </div>
                        <div className="text-[9px] text-slate-400 font-bold">
                          {tx.date} · {tx.p} × {tx.q} · fee {tx.fee}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto mb-8 flex gap-2">
                    <div className="flex-1 h-10 rounded-xl bg-[#242932] flex items-center justify-center text-[10px] font-black text-slate-400">취소</div>
                    <div className="flex-[2] h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-[10px] font-black text-white shadow-lg shadow-indigo-900/40">
                      확인 후 저장 〉
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Custom Animation Styles */}
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes scanRefined {
              0% { top: 10%; opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { top: 90%; opacity: 0; }
            }
            .animate-scan-refined {
              animation: scanRefined 2.5s ease-in-out infinite;
            }
          `}} />
        </section>

        <section className="mt-24 md:mt-32 scroll-mt-20">
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-700 text-[10px] font-black uppercase tracking-[0.2em] text-slate-200">
              <Bell size={14} className="text-amber-300" />
              {isKo ? '텔레그램 알람 미리보기' : 'Telegram Alarm Preview'}
            </span>
            <h3 className="mt-4 text-2xl md:text-3xl font-black tracking-tight text-white">
              {isKo ? '매일 정해진 시간, 한 통의 메시지로' : 'One message at your set time'}
            </h3>
            <p className="mt-2 text-sm text-slate-400 max-w-xl mx-auto">
              {isKo
                ? 'LOC 매수가·수량·지정가 매도점까지 텔레그램 한 통으로 확인하세요.'
                : 'Check LOC buy price, quantity, and limit sell in a single Telegram message.'}
            </p>
          </div>

          {/* 스마트폰 목업 + 스택 카드 */}
          <div className="flex justify-center">
            <div
              className="relative w-[min(320px,90vw)] select-none"
              style={{ perspective: '1200px' }}
            >
              {/* 폰 베젤 */}
              <div className="relative rounded-[2.5rem] bg-slate-800 shadow-2xl border border-slate-600/80 overflow-hidden aspect-[9/19] max-h-[520px]">
                {/* 폰 내부 (채팅 배경) */}
                <div className="absolute inset-3 rounded-[2rem] bg-[#0e1117] overflow-hidden">
                  {/* 봇 프로필 헤더 */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-black text-lg">B</div>
                    <div>
                      <div className="text-sm font-bold text-white">btd_alarm_bot</div>
                      <div className="text-[10px] text-slate-500">bot</div>
                    </div>
                  </div>

                  {/* 스택된 메시지 카드 영역 (클릭/스와이프로 순환) */}
                  <div
                    className="absolute inset-x-2 top-14 bottom-12 flex items-start justify-center pt-2 cursor-pointer touch-pan-y"
                    onClick={cycleNext}
                    onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                    onTouchEnd={(e) => {
                      const endX = e.changedTouches[0].clientX;
                      const diff = touchStartX.current - endX;
                      if (Math.abs(diff) > 40) setTelegramCardIndex((i) => (diff > 0 ? (i + 1) : i - 1 + previewCards.length) % previewCards.length);
                    }}
                  >
                    {previewCards.map((card, idx) => {
                      const order = (idx - telegramCardIndex + previewCards.length) % previewCards.length;
                      const isFront = order === 0;
                      const z = order === 0 ? 30 : order === 1 ? 20 : 10;
                      const translateX = order === 0 ? 0 : order === 1 ? 12 : 24;
                      const translateY = order === 0 ? 0 : order === 1 ? 8 : 16;
                      const rotate = order === 0 ? 0 : order === 1 ? -2 : -4;
                      const scale = order === 0 ? 1 : order === 1 ? 0.98 : 0.96;
                      return (
                        <div
                          key={idx}
                          className="absolute left-0 right-0 rounded-2xl border border-white/10 bg-slate-800/95 shadow-xl overflow-hidden transition-all duration-300 ease-out"
                          style={{
                            zIndex: z,
                            transform: `translate(${translateX}px, ${translateY}px) rotate(${rotate}deg) scale(${scale})`,
                            boxShadow: isFront ? '0 20px 40px rgba(0,0,0,0.4)' : '0 8px 20px rgba(0,0,0,0.3)',
                          }}
                        >
                          <div className="p-4 space-y-2 text-left">
                            {/* 상단 배지 */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 text-amber-400 font-black text-xs">
                                <Bell size={12} /> BTD 매매 알람
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${card.badgeClass}`}>
                                {card.badge}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-snug">{card.intro}</p>
                            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                              <Clock size={12} /> KST {card.time}
                            </div>
                            <div className="border-t border-white/5 pt-2 mt-2">
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                <span aria-hidden>📁</span> DAILY EXECUTION
                              </div>
                              {card.lines.map((line, i) => (
                                <div
                                  key={i}
                                  className={`text-[11px] leading-relaxed ${
                                    line.type === 'buy' ? 'text-emerald-400' : line.type === 'sell' ? 'text-rose-400' : line.type === 'footer' ? 'text-slate-500 italic' : 'text-slate-300'
                                  }`}
                                >
                                  {line.type === 'text' || line.type === 'footer' ? (line.text.startsWith('—') ? '—' : `- ${line.text}`) : `- ${line.text}`}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 하단 안내 */}
                  <div className="absolute bottom-2 left-0 right-0 text-center">
                    <p className="text-[10px] text-slate-500">
                      {isKo ? '클릭하여 다음 예시 보기' : 'Click to see next example'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 페이지네이션 점 */}
              <div className="flex justify-center gap-2 mt-4">
                {previewCards.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={isKo ? `예시 ${i + 1}` : `Example ${i + 1}`}
                    onClick={(e) => { e.stopPropagation(); setTelegramCardIndex(i); }}
                    className={`w-2 h-2 rounded-full transition-colors ${i === telegramCardIndex ? 'bg-blue-400 scale-110' : 'bg-slate-600'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

const ArrowRightIcon: React.FC = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="inline-block"
  >
    <path
      d="M5 12H19M19 12L13 6M19 12L13 18"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default Pricing;

