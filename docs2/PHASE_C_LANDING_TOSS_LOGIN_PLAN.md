# PHASE C Landing Toss Login Plan

**상태:** 계획(코드 미반영)  
**요약:** 토스 미니앱 심사 반려(이중 CTA) 대응 — 웹은 기존 2버튼 유지, 토스는 I18N SSOT 기반 단일 `TDSButton`, 인증 플로우는 기존 `TossLoginView` 재사용.

## 1. Objective
현재 로그인 전 대시보드는 [components/TabContent.tsx](components/TabContent.tsx)에서 `activeTab === 'dashboard' && user == null`일 때 [components/Landing.tsx](components/Landing.tsx)을 렌더하고, 실제 CTA는 [components/LandingHero.tsx](components/LandingHero.tsx)에 있습니다. 지금 구조는 `isInTossApp` 여부에 따라 버튼 스타일만 달라질 뿐, 토스 환경에서도 사실상 2개의 CTA(`ctaSignup`, `ctaLogin`)가 노출되어 Toss 심사 반려 사유와 충돌합니다.

이번 Phase C의 목표는 **플랫폼 분기 범위를 CTA 전용 컴포넌트 하나로 한정**하는 것입니다.
- 웹(`isInTossApp === false`)에서는 기존 2버튼 UX를 유지합니다.
- 토스(`isInTossApp === true`)에서는 2버튼을 숨기고 단일 `TDSButton`만 노출합니다.
- 문자열은 실제 SSOT 파일인 [constants/landingMessages.ts](constants/landingMessages.ts)에만 추가합니다.
- `LandingHero` 본체에는 복잡한 인라인 조건 렌더링을 늘리지 않고, memoized CTA boundary로 분리합니다.
- 인증 동작은 새로 만들지 않습니다. 현재 [components/auth/LoginView.tsx](components/auth/LoginView.tsx)와 [components/auth/SignupView.tsx](components/auth/SignupView.tsx)가 토스 환경에서 모두 `TossLoginView`를 렌더하므로, 이번 단계는 **UI 분기 리팩터링만** 수행하면 됩니다.

권장 설계 선택은 다음과 같습니다.
- 새 semantic callback 이름은 `onContinueWithToss`로 둡니다.
- [App.tsx](App.tsx)에서는 초기 구현을 `handleOpenLogin`에 연결합니다.
- 이유: 현재 시스템에서 Toss login 진입은 login/signup view가 동일한 `TossLoginView`로 수렴하므로, 불필요한 auth-flow 변경 없이 리뷰 사유만 정확히 제거할 수 있습니다.

## 2. I18N SSOT Definition
현재 저장소의 실제 랜딩 SSOT는 [constants/landingMessages.ts](constants/landingMessages.ts)입니다. 계획서는 이 파일을 기준으로 문구를 추가하며, JSX에는 `TOSS로 계속하기`를 직접 쓰지 않습니다.

```ts
import type { AppLang } from '../types';
import type { LandingFeatureId } from './landingConfig';

/** 번역 문자열로 분기하지 않고 레이아웃만 구분 (Rule: string-based logic 금지) */
export type LandingHeroTitleLayout = 'ko_brand_lines' | 'en_brand_lines';

export type LandingHeroTitle =
  | {
      layout: 'ko_brand_lines';
      line1Before: string;
      line1Highlight: string;
      line1After: string;
      line2: string;
    }
  | {
      layout: 'en_brand_lines';
      line1: string;
      line2Highlight: string;
      line2After: string;
    };

export interface LandingPageCopy {
  hero: {
    badge: string;
    title: LandingHeroTitle;
    body: string;
    ctaSignup: string;
    ctaLogin: string;
    ctaTossLogin: string;
  };
  trustLine: string;
  featureLabels: Record<LandingFeatureId, string>;
}

const LANDING_PAGE_COPY_KO: LandingPageCopy = {
  hero: {
    badge: '로그인 후 시작하세요',
    title: {
      layout: 'ko_brand_lines',
      line1Before: '나만의 ',
      line1Highlight: 'BUY THE DIP',
      line1After: ' 전략을',
      line2: '저장하고 관리하세요.',
    },
    body: '퀀트 기반의 매매 전략을 생성하고, 실시간 알림을 통해 체계적으로 자산을 불려나가세요. 프리미엄 등급의 매니징 경험을 제공합니다.',
    ctaSignup: '무료로 시작하기',
    ctaLogin: '이미 계정이 있으신가요? 로그인',
    ctaTossLogin: 'TOSS로 계속하기',
  },
  trustLine: '안전하고 신뢰할 수 있는 자산 관리 플랫폼',
  featureLabels: {
    secureAssetManagement: '안전한 자산 관리',
    quickTradeEntry: '빠른 매매 입력',
    realTimeMarketData: '실시간 마켓 데이터',
    customAlertSettings: '커스텀 알람 설정',
  },
};

const LANDING_PAGE_COPY_EN: LandingPageCopy = {
  hero: {
    badge: 'Sign in to get started',
    title: {
      layout: 'en_brand_lines',
      line1: 'Save and manage your own',
      line2Highlight: 'BUY THE DIP',
      line2After: ' strategies.',
    },
    body: 'Create quant-based trading strategies and grow your assets systematically with real-time alerts. Experience premium-grade portfolio management.',
    ctaSignup: 'Start for Free',
    ctaLogin: 'Already have an account? Log in',
    ctaTossLogin: 'Continue with TOSS',
  },
  trustLine: 'Secure & Trusted Asset Management Platform',
  featureLabels: {
    secureAssetManagement: 'Secure Asset Management',
    quickTradeEntry: 'Quick Trade Entry',
    realTimeMarketData: 'Real-time Market Data',
    customAlertSettings: 'Custom Alert Settings',
  },
};

const LANDING_PAGE_COPY: Record<AppLang, LandingPageCopy> = {
  ko: LANDING_PAGE_COPY_KO,
  en: LANDING_PAGE_COPY_EN,
};

export function getLandingPageCopy(lang: AppLang): LandingPageCopy {
  return LANDING_PAGE_COPY[lang];
}
```

## 3. Component Architecture & Snippets
핵심 원칙은 **LandingHero는 hero shell만 담당하고, CTA branching은 `LandingCtaButtonGroup`이 전담**하게 하는 것입니다. 현재 시스템에서는 CTA가 [components/LandingHero.tsx](components/LandingHero.tsx)에만 쓰이므로, 별도 파일을 추가하기보다 **같은 파일 안의 file-local `React.memo` component**로 두는 편이 더 단순하고 유지보수성이 높습니다.

추가로, 아래 두 가지를 문서 단계에서 명시적으로 강제합니다.
- memoized child에는 큰 `copy` 객체를 통째로 넘기지 않고 **primitive label props**만 넘깁니다. 이는 workspace rule의 primitive props 원칙과도 맞습니다.
- `LANDING_FEATURES_CONFIG.map(...)` 내부에서는 동일한 스타일 객체를 반복 생성하지 않습니다. `featureSharedStyle`을 루프 밖에서 한 번만 만들고 모든 chip이 동일 참조를 재사용합니다.
- `FeatureIcon`은 `switch` 대신 **정적 `Record` dictionary**로 아이콘을 매핑해, 새 아이콘 추가 시 기존 렌더링 분기문을 수정하지 않는 OCP 구조를 유지합니다.

### 3.1 `LandingHero.tsx` focused snippet

```tsx
import React from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  Bell,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { TDSButton } from './tds';
import type { LandingHeroTitle, LandingPageCopy } from '../constants/landingMessages';
import { LANDING_HERO_CARD_SURFACE_CLASSES } from '../constants/proPlanSurface';
import type { LandingFeatureIconKey } from '../constants/landingConfig';

export interface FeatureIconProps {
  iconKey: LandingFeatureIconKey;
}

const FEATURE_ICON_MAP: Record<LandingFeatureIconKey, LucideIcon> = {
  shield: Shield,
  zap: Zap,
  trendingUp: TrendingUp,
  bell: Bell,
};

export const FeatureIcon = React.memo(function FeatureIcon({
  iconKey,
}: FeatureIconProps): React.ReactElement | null {
  const IconComponent = FEATURE_ICON_MAP[iconKey];

  if (IconComponent == null) {
    return null;
  }
 
  return <IconComponent size={18} aria-hidden="true" />;
});

FeatureIcon.displayName = 'FeatureIcon';

interface LandingCtaButtonGroupProps {
  isInTossApp: boolean;
  signupLabel: string;
  loginLabel: string;
  tossLoginLabel: string;
  onOpenSignup: () => void;
  onOpenLogin: () => void;
  onContinueWithToss: () => void;
}

const LandingCtaButtonGroup = React.memo(function LandingCtaButtonGroup({
  isInTossApp,
  signupLabel,
  loginLabel,
  tossLoginLabel,
  onOpenSignup,
  onOpenLogin,
  onContinueWithToss,
}: LandingCtaButtonGroupProps): React.ReactElement {
  if (isInTossApp) {
    return (
      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
        <TDSButton
          variant="primary"
          onClick={onContinueWithToss}
          className="px-8 py-4 flex items-center gap-3"
          aria-label={tossLoginLabel}
        >
          <Zap size={18} aria-hidden="true" />
          {tossLoginLabel}
        </TDSButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
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
        <span className="relative z-10">{signupLabel}</span>
      </button>

      <button
        type="button"
        onClick={onOpenLogin}
        className="group px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300 flex items-center gap-3 backdrop-blur-sm bg-white/70 text-slate-700 border border-slate-300 hover:bg-white hover:border-slate-400 hover:text-slate-900 dark:bg-transparent dark:text-white dark:border-white/30 dark:hover:bg-white/10 dark:hover:border-white/50"
      >
        <span>{loginLabel}</span>
        <ArrowRight
          size={18}
          className="group-hover:translate-x-1 transition-transform"
          aria-hidden="true"
        />
      </button>
    </div>
  );
});

LandingCtaButtonGroup.displayName = 'LandingCtaButtonGroup';

export interface LandingHeroProps {
  copy: LandingPageCopy;
  isInTossApp: boolean;
  tossTitleStyle: CSSProperties | null;
  tossSubtitleStyle: CSSProperties | null;
  onOpenSignup: () => void;
  onOpenLogin: () => void;
  onContinueWithToss: () => void;
}

const FALLBACK_HERO_TITLE: LandingHeroTitle = {
  layout: 'en_brand_lines',
  line1: '',
  line2Highlight: '',
  line2After: '',
};

const HeroTitle: React.FC<{ title: LandingHeroTitle }> = ({ title }) => {
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
      const exhaustiveCheck: never = title.layout;
      void exhaustiveCheck;
      return null;
    }
  }
};

export const LandingHero: React.FC<LandingHeroProps> = ({
  copy,
  isInTossApp,
  tossTitleStyle,
  tossSubtitleStyle,
  onOpenSignup,
  onOpenLogin,
  onContinueWithToss,
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

          <LandingCtaButtonGroup
            isInTossApp={isInTossApp}
            signupLabel={copy?.hero?.ctaSignup ?? ''}
            loginLabel={copy?.hero?.ctaLogin ?? ''}
            tossLoginLabel={copy?.hero?.ctaTossLogin ?? ''}
            onOpenSignup={onOpenSignup}
            onOpenLogin={onOpenLogin}
            onContinueWithToss={onContinueWithToss}
          />
        </div>
      </div>
    </div>
  );
};
```

### 3.2 `Landing.tsx` integration snippet

```tsx
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
```

### 3.3 Upstream wiring note
`Landing` prop signature가 바뀌면 상위 조립도 함께 맞춰야 합니다.
- [components/TabContent.tsx](components/TabContent.tsx): `Landing`에 `onContinueWithToss` 전달.
- [App.tsx](App.tsx): `handleContinueWithToss`를 정의하고 `TabContent`에 주입.
- 초기 wiring은 `handleContinueWithToss = handleOpenLogin` 또는 동일 동작의 `useCallback`으로 충분합니다.
- 이 설계는 auth backend/BFF를 건드리지 않고, 리뷰 사유가 된 랜딩 CTA만 정밀하게 수정합니다.

## 4. Verification Checklist
- [ ] JSX 어디에도 `TOSS로 계속하기` / `Continue with TOSS` literal을 직접 쓰지 않고 [constants/landingMessages.ts](constants/landingMessages.ts)만 사용합니다.
- [ ] Toss branch의 CTA는 [components/LandingHero.tsx](components/LandingHero.tsx) 내부 `LandingCtaButtonGroup`로 격리되어 있고, `LandingHero` 본체에 새로운 인라인 ternary 난립이 없습니다.
- [ ] Toss 환경(`isInTossApp === true`)에서는 CTA가 정확히 1개이며 `TDSButton` `variant="primary"`를 사용합니다.
- [ ] Web 환경(`isInTossApp === false`)에서는 기존 signup/login 2버튼 UX와 스타일이 유지됩니다.
- [ ] `LandingCtaButtonGroup`는 큰 `copy` 객체 대신 primitive label props와 handler props를 받아 memoization 경계가 명확합니다.
- [ ] [components/Landing.tsx](components/Landing.tsx)의 feature chip 렌더링은 `map` 내부에서 새 style 객체를 만들지 않고, 루프 밖 `featureSharedStyle` 단일 참조를 재사용합니다.
- [ ] [components/LandingHero.tsx](components/LandingHero.tsx)의 `FeatureIcon`은 `switch` 대신 `FEATURE_ICON_MAP` 기반 O(1) dictionary lookup을 사용합니다.
- [ ] [App.tsx](App.tsx) → [components/TabContent.tsx](components/TabContent.tsx) → [components/Landing.tsx](components/Landing.tsx) → [components/LandingHero.tsx](components/LandingHero.tsx)로 `onContinueWithToss`가 누락 없이 전달됩니다.
- [ ] Toss에서 버튼 클릭 시 기존 `TossLoginView` 진입이 유지되며, signup/login backend behavior regression이 없습니다.
- [ ] 수동 검증 기준: 토스 미니앱 비로그인 대시보드 스크린샷에서 2버튼이 사라지고 단일 `TOSS로 계속하기`만 보입니다.

## 5. Implementation todos (체크리스트)
- [ ] `constants/landingMessages.ts`에 Toss 전용 CTA key(`ctaTossLogin`) 추가, JSX 하드코딩 금지
- [ ] `components/LandingHero.tsx`에서 CTA를 `LandingCtaButtonGroup` memoized component로 분리
- [ ] `components/LandingHero.tsx`의 `FeatureIcon`을 `FEATURE_ICON_MAP` 기반 dictionary lookup으로 교체
- [ ] `components/Landing.tsx`에서 feature chip 공용 style reference를 `useMemo`로 루프 밖에 고정
- [ ] `App.tsx` → `components/TabContent.tsx` → `components/Landing.tsx`로 `onContinueWithToss` 연결
- [ ] Toss 단일 `TDSButton` / Web 2버튼 / Toss login 동작 회귀 검증
