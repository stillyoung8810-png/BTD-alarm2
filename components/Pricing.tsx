import React from 'react';
import { Sparkles, Star, Crown, Check, Lock, Zap } from 'lucide-react';

interface PricingProps {
  lang: 'ko' | 'en';
  currentTier: 'free' | 'pro' | 'premium' | string;
}

const Pricing: React.FC<PricingProps> = ({ lang, currentTier }) => {
  const isKo = lang === 'ko';

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
        isKo ? '포트폴리오 최대 4개' : 'Up to 4 portfolios',
        isKo ? '알람 슬롯 4개' : '4 alert slots',
        isKo ? '기본 13개 + PRO 전용 종목' : 'Core + PRO tickers (TSLA, NVDA, MSTR …)',
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
        isKo ? '포트폴리오 개수 무제한 (예정)' : 'Unlimited portfolios (planned)',
        isKo ? '알람 슬롯 무제한 (예정)' : 'Unlimited alerts (planned)',
        isKo ? '모든 종목 + 베타 종목 (예정)' : 'All tickers + beta (planned)',
        isKo ? '신규 전략 선공개 (예정)' : 'Early access to strategies',
        isKo ? 'VIP 전용 고객 지원 (예정)' : 'VIP priority support',
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
                          <span className="ml-2 text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-400/30">
                            {isKo ? '현재 등급' : 'Current plan'}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium mt-0.5">{tier.subtitle}</div>
                    </div>
                  </div>

                  {tier.badge && (
                    <div
                      className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
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

