import React from 'react';
import { I18N } from '../constants';
import { 
  Shield, 
  Zap, 
  TrendingUp, 
  Bell,
  ArrowRight,
  Sparkles
} from 'lucide-react';

interface LandingProps {
  lang: 'ko' | 'en';
  onOpenSignup: () => void;
  onOpenLogin: () => void;
}

const Landing: React.FC<LandingProps> = ({ lang, onOpenSignup, onOpenLogin }) => {
  const t = I18N[lang];

  const features = [
    {
      icon: <Shield size={18} />,
      label: lang === 'ko' ? '안전한 자산 관리' : 'Secure Asset Management',
    },
    {
      icon: <Zap size={18} />,
      label: lang === 'ko' ? '빠른 매매 입력' : 'Quick Trade Entry',
    },
    {
      icon: <TrendingUp size={18} />,
      label: lang === 'ko' ? '실시간 마켓 데이터' : 'Real-time Market Data',
    },
    {
      icon: <Bell size={18} />,
      label: lang === 'ko' ? '커스텀 알람 설정' : 'Custom Alert Settings',
    },
  ];

  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
      {/* Background Mesh Gradient - Light Mode */}
      <div className="absolute inset-0 -z-10 overflow-hidden dark:hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-blue-100/60 via-indigo-100/40 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-gradient-to-tl from-purple-100/50 via-pink-100/30 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-cyan-50/40 via-blue-50/30 to-indigo-50/40 rounded-full blur-3xl"></div>
      </div>

      {/* Background Mesh Gradient - Dark Mode */}
      <div className="absolute inset-0 -z-10 overflow-hidden hidden dark:block">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-blue-900/20 via-indigo-900/15 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-gradient-to-tl from-purple-900/20 via-pink-900/10 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-slate-900/50 via-blue-950/30 to-indigo-950/40 rounded-full blur-3xl"></div>
      </div>

      {/* Hero Card */}
      <div className="relative w-full max-w-2xl mx-auto animate-in fade-in zoom-in-95 duration-700">
        {/* Multi-layer Shadow Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-indigo-600/20 rounded-[3rem] blur-2xl transform scale-105 dark:from-blue-500/10 dark:to-indigo-500/10"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-[3rem] blur-3xl transform scale-110 translate-y-4 dark:from-indigo-400/5 dark:to-purple-400/5"></div>
        
        {/* Main Card */}
        <div 
          className="relative rounded-[3rem] p-10 md:p-14 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 25%, #1E3A8A 50%, #1E40AF 75%, #2563EB 100%)',
          }}
        >
          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-white/10 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-400/20 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-b from-white/5 to-transparent"></div>
          
          {/* Sparkle Icon */}
          <div className="absolute top-8 right-8 opacity-60">
            <Sparkles className="text-blue-200" size={24} />
          </div>

          {/* Content */}
          <div className="relative z-10 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 mb-6">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              <span className="text-[11px] font-bold text-white/90 uppercase tracking-widest">
                {lang === 'ko' ? '로그인 후 시작하세요' : 'Sign in to get started'}
              </span>
            </div>

            {/* Main Title */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight mb-4">
              {lang === 'ko' ? (
                <>
                  나만의 <span className="text-blue-200">BUY THE DIP</span> 전략을
                  <br />
                  저장하고 관리하세요.
                </>
              ) : (
                <>
                  Save and manage your own
                  <br />
                  <span className="text-blue-200">BUY THE DIP</span> strategies.
                </>
              )}
            </h1>

            {/* Subtitle */}
            <p className="text-base md:text-lg text-blue-100/80 font-medium leading-relaxed mb-10 max-w-lg mx-auto">
              {lang === 'ko'
                ? '퀀트 기반의 매매 전략을 생성하고, 실시간 알림을 통해 체계적으로 자산을 불려나가세요. 프리미엄 등급의 매니징 경험을 제공합니다.'
                : 'Create quant-based trading strategies and grow your assets systematically with real-time alerts. Experience premium-grade portfolio management.'}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              {/* Primary Button - Glowing Effect */}
              <button
                onClick={onOpenSignup}
                className="group relative px-8 py-4 bg-white text-indigo-700 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-white/20 hover:shadow-white/30 hover:scale-[1.02] active:scale-95 transition-all duration-300 flex items-center gap-3 overflow-hidden"
              >
                {/* Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-100 via-white to-blue-100 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <Zap size={18} className="relative z-10" />
                <span className="relative z-10">
                  {lang === 'ko' ? '무료로 시작하기' : 'Start for Free'}
                </span>
              </button>

              {/* Secondary Button - Ghost Style */}
              <button
                onClick={onOpenLogin}
                className="group px-8 py-4 bg-transparent text-white rounded-2xl font-black text-sm uppercase tracking-widest border border-white/30 hover:bg-white/10 hover:border-white/50 transition-all duration-300 flex items-center gap-3 backdrop-blur-sm"
              >
                <span>
                  {lang === 'ko' ? '이미 계정이 있으신가요? 로그인' : 'Already have an account? Log in'}
                </span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Pills */}
      <div className="mt-12 flex flex-wrap justify-center gap-3 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
        {features.map((feature, index) => (
          <div
            key={index}
            className="flex items-center gap-2 px-5 py-3 rounded-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
          >
            <span className="text-blue-500 dark:text-blue-400">{feature.icon}</span>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
              {feature.label}
            </span>
          </div>
        ))}
      </div>

      {/* Trust Indicator */}
      <div className="mt-10 text-center animate-in fade-in duration-700 delay-500">
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
          {lang === 'ko' ? '안전하고 신뢰할 수 있는 자산 관리 플랫폼' : 'Secure & Trusted Asset Management Platform'}
        </p>
      </div>
    </div>
  );
};

export default Landing;
