import React from 'react';
import type { CSSProperties } from 'react';
import { Bell, Shield, TrendingUp, Zap, ArrowRight, Sparkles } from 'lucide-react';
import { TDSButton } from './tds';
import type { LandingHeroTitle, LandingPageCopy } from '../constants/landingMessages';
import { LANDING_HERO_CARD_SURFACE_CLASSES } from '../constants/proPlanSurface';
import type { LandingFeatureIconKey } from '../constants/landingConfig';

export interface FeatureIconProps {
  iconKey: LandingFeatureIconKey;
}

export const FeatureIcon: React.FC<FeatureIconProps> = ({ iconKey }) => {
  switch (iconKey) {
    case 'shield':
      return <Shield size={18} aria-hidden="true" />;
    case 'zap':
      return <Zap size={18} aria-hidden="true" />;
    case 'trendingUp':
      return <TrendingUp size={18} aria-hidden="true" />;
    case 'bell':
      return <Bell size={18} aria-hidden="true" />;
    default: {
      const _exhaustiveCheck: never = iconKey;
      return _exhaustiveCheck;
    }
  }
};

interface HeroTitleProps {
  title: LandingHeroTitle;
}

const FALLBACK_HERO_TITLE: LandingHeroTitle = {
  layout: 'en_brand_lines',
  line1: '',
  line2Highlight: '',
  line2After: '',
};

const HeroTitle: React.FC<HeroTitleProps> = ({ title }) => {
  switch (title.layout) {
    case 'ko_brand_lines':
      return (
        <>
          {title.line1Before}
          <span className="text-blue-700 dark:text-blue-200">{title.line1Highlight}</span>
          {title.line1After}
          <br />
          {title.line2}
        </>
      );
    case 'en_brand_lines':
      return (
        <>
          {title.line1}
          <br />
          <span className="text-blue-700 dark:text-blue-200">{title.line2Highlight}</span>
          {title.line2After}
        </>
      );
    default: {
      const _exhaustiveCheck: never = title;
      return _exhaustiveCheck;
    }
  }
};

export interface LandingHeroProps {
  copy: LandingPageCopy;
  isInTossApp: boolean;
  tossTitleStyle: CSSProperties | null;
  tossSubtitleStyle: CSSProperties | null;
  onOpenSignup: () => void;
  onOpenLogin: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({
  copy,
  isInTossApp,
  tossTitleStyle,
  tossSubtitleStyle,
  onOpenSignup,
  onOpenLogin,
}) => {
  const safeHeroTitle = copy?.hero?.title ?? FALLBACK_HERO_TITLE;

  return (
    <div className="relative w-full max-w-2xl mx-auto animate-in fade-in zoom-in-95 duration-700">
      <div
        className="absolute inset-0 bg-gradient-to-br from-blue-400/12 to-indigo-400/10 rounded-[3rem] blur-2xl transform scale-105 dark:from-blue-500/10 dark:to-indigo-500/10"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-gradient-to-br from-indigo-400/8 to-purple-400/8 rounded-[3rem] blur-3xl transform scale-110 translate-y-4 dark:from-indigo-400/5 dark:to-purple-400/5"
        aria-hidden="true"
      />

      <div className={LANDING_HERO_CARD_SURFACE_CLASSES}>
        <div
          className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-blue-400/15 to-transparent dark:from-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-500/20 to-transparent dark:from-blue-400/20 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"
          aria-hidden="true"
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-b from-blue-500/[0.06] to-transparent dark:from-white/5"
          aria-hidden="true"
        />

        <div className="absolute top-8 right-8 opacity-60" aria-hidden="true">
          <Sparkles className="text-blue-500 dark:text-blue-200" size={24} />
        </div>

        <div className="relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-sm mb-6 bg-blue-500/10 border border-blue-200 dark:bg-white/10 dark:border-white/20">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            <span className="text-[11px] font-bold text-slate-700 dark:text-white/90 uppercase tracking-widest">
              {copy?.hero?.badge ?? ''}
            </span>
          </div>

          <h1
            className={
              !isInTossApp
                ? 'text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white leading-tight tracking-tight mb-4'
                : 'mb-4 text-slate-900 dark:text-white'
            }
            style={tossTitleStyle ?? undefined}
          >
            <HeroTitle title={safeHeroTitle} />
          </h1>

          <p
            className={
              !isInTossApp
                ? 'text-base md:text-lg text-slate-600 dark:text-blue-100/80 font-medium leading-relaxed mb-10 max-w-lg mx-auto'
                : 'mb-10 max-w-lg mx-auto text-slate-600 dark:text-blue-100/90'
            }
            style={tossSubtitleStyle ?? undefined}
          >
            {copy?.hero?.body ?? ''}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {isInTossApp ? (
              <>
                <TDSButton variant="primary" onClick={onOpenSignup} className="px-8 py-4 flex items-center gap-3">
                  <Zap size={18} aria-hidden="true" />
                  {copy?.hero?.ctaSignup ?? ''}
                </TDSButton>
                <TDSButton variant="secondary" onClick={onOpenLogin} className="px-8 py-4 flex items-center gap-3">
                  {copy?.hero?.ctaLogin ?? ''}
                  <ArrowRight size={18} aria-hidden="true" />
                </TDSButton>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onOpenSignup}
                  className="group relative px-8 py-4 bg-white text-indigo-700 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-white/20 hover:shadow-white/30 hover:scale-[1.02] active:scale-95 transition-all duration-300 flex items-center gap-3 overflow-hidden"
                >
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-blue-100 via-white to-blue-100 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    aria-hidden="true"
                  />
                  <Zap size={18} className="relative z-10" aria-hidden="true" />
                  <span className="relative z-10">{copy?.hero?.ctaSignup ?? ''}</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="group px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300 flex items-center gap-3 backdrop-blur-sm bg-white/70 text-slate-700 border border-slate-300 hover:bg-white hover:border-slate-400 hover:text-slate-900 dark:bg-transparent dark:text-white dark:border-white/30 dark:hover:bg-white/10 dark:hover:border-white/50"
                >
                  <span>{copy?.hero?.ctaLogin ?? ''}</span>
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
