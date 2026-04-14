import React, { useMemo } from 'react';
import { getLandingPageCopy } from '../constants/landingMessages';
import { LANDING_FEATURES_CONFIG } from '../constants/landingConfig';
import type { AppLang } from '../types';
import { useTossApp } from '../contexts/TossAppContext';
import { getConditionalTypographyStyle } from '../utils/tossStyleHelpers';
import { LandingHero, FeatureIcon } from './LandingHero';
import { LegalDisclaimer } from './common/LegalDisclaimer';

interface LandingProps {
  lang: AppLang;
  onOpenSignup: () => void;
  onOpenLogin: () => void;
  onContinueWithToss: () => void;
}

const Landing: React.FC<LandingProps> = ({
  lang,
  onOpenSignup,
  onOpenLogin,
  onContinueWithToss,
}) => {
  const { isInTossApp } = useTossApp();
  const copy = getLandingPageCopy(lang);

  const tossTitleStyle = getConditionalTypographyStyle(isInTossApp, 'Typography2', 'Bold');
  const tossSubtitleStyle = getConditionalTypographyStyle(isInTossApp, 'Typography5', 'Regular');
  const tossCaptionStyle = getConditionalTypographyStyle(isInTossApp, 'Typography7', 'Regular');
  const featureSharedStyle: React.CSSProperties | undefined = useMemo(() => {
    if (!isInTossApp || tossCaptionStyle == null) {
      return undefined;
    }

    return {
      fontSize: tossCaptionStyle.fontSize,
      lineHeight: tossCaptionStyle.lineHeight,
      fontWeight: tossCaptionStyle.fontWeight,
    };
  }, [isInTossApp, tossCaptionStyle]);

  return (
    <div className="relative min-h-[80vh] flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
      <div className="absolute inset-0 -z-10 overflow-hidden dark:hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-blue-100/60 via-indigo-100/40 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-gradient-to-tl from-purple-100/50 via-pink-100/30 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-cyan-50/40 via-blue-50/30 to-indigo-50/40 rounded-full blur-3xl" />
      </div>

      <div className="absolute inset-0 -z-10 overflow-hidden hidden dark:block">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-blue-900/20 via-indigo-900/15 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-gradient-to-tl from-purple-900/20 via-pink-900/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-slate-900/50 via-blue-950/30 to-indigo-950/40 rounded-full blur-3xl" />
      </div>

      <LandingHero
        copy={copy}
        isInTossApp={isInTossApp}
        tossTitleStyle={tossTitleStyle}
        tossSubtitleStyle={tossSubtitleStyle}
        onOpenSignup={onOpenSignup}
        onOpenLogin={onOpenLogin}
        onContinueWithToss={onContinueWithToss}
      />

      <div className="mt-12 flex flex-wrap justify-center gap-3 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
        {LANDING_FEATURES_CONFIG.map((feature) => (
          <div
            key={feature.id}
            className="flex items-center gap-2 px-5 py-3 rounded-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
            style={featureSharedStyle}
          >
            <span className="text-blue-500 dark:text-blue-400" aria-hidden="true">
              <FeatureIcon iconKey={feature.icon} />
            </span>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
              {copy?.featureLabels?.[feature.id] ?? ''}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center animate-in fade-in duration-700 delay-500">
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
          {copy?.trustLine ?? ''}
        </p>
      </div>

      <LegalDisclaimer
        lang={lang}
        variant="standard"
        layoutClassName="mt-6 text-center"
      />
    </div>
  );
};

export default Landing;
