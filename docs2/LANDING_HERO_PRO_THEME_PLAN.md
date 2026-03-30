# 랜딩 히어로 PRO 테마 이식 — 리팩터링 계획서

**상태:** 일부 시각 변경은 이미 반영됨 가능. 본 문서는 **규정 준수(I18N·DRY·다크 트랙 분리)** 및 남은 작업·원칙의 단일 기준(SSOT)으로 유지한다.  
**배경:** 라이트 모드에서 히어로와 `Pricing` PRO 카드의 톤을 맞추고, 웹 로그인 CTA 가독성을 높인다. **다크 모드에서는 랜딩 히어로는 기존 짙은 인디고 그라디언트, `Pricing` PRO 카드는 기존 다크 PRO 톤**을 각각 유지한다(서로 다른 다크 트랙).  
**참조:** `components/Pricing.tsx`의 `tier.theme === 'pro'`, 랜딩은 **`components/Landing.tsx`**(조합·레이아웃)와 **필수 분리된** **`components/LandingHero.tsx`**(히어로 SRP)를 쓴다.

---

## 코어 원칙 반영 (리뷰 이슈 대응)

### [Rule 3] Strict I18N (Critical)

- **금지:** 계획서·구현 JSX 안에 `나만의`, `전략을` 등 **로케일 문자열을 직접 하드코딩**하지 않는다.
- **필수:** 히어로 배지·제목 조각·본문·CTA·신뢰 문구는 **`constants/landingMessages.ts`(또는 프로젝트가 채택한 단일 i18n 사전)** 에 `ko` / `en`으로 정의한다. 피처 칩의 `id`·`icon` 같은 구조적 설정 데이터는 **`constants/landingConfig.ts`** 로 분리하고, 컴포넌트는 **키·구조(`layout: 'ko_brand_lines' | 'en_brand_lines'` 등)로만 분기**한다. 번역 문자열로 `if (title === '…')` 식 분기는 금지.
- **계획서 스니펫:** 아래 예시는 **클래스만** 보이거나 `{copy.hero.badge}` 형태의 자리 표시를 쓴다.

### [Rule 6 & 8] DRY·매직 스트링 상수화 (High)

- **금지:** `bg-gradient-to-br from-[#E0F2FE] via-[#F3E8FF] …` 를 `Pricing.tsx`와 `Landing.tsx`에 **복붙**하지 않는다.
- **필수:** 라이트 PRO 표면은 **`constants/proPlanSurface.ts`(가칭)** 등 한 곳에 상수로 두고, Pricing·랜딩이 **동일 문자열을 import**한다.
- **다크는 화면별 상수 분리:** Pricing PRO 다크 스톱(`dark:from-blue-900/40` …)과 랜딩 히어로 다크(아래 **Two-Track**)는 **서로 다른 export**로 명시한다.

### 다크 모드 Two-Track (Medium) — 스니펫에 반드시 구분

| 구분 | 용도 | 다크 배경 |
|------|------|-----------|
| **랜딩 히어로** | 메인 랜딩 카드 | 기존 **135° 인디고** `linear-gradient(135deg, #4F46E5 → … → #2563EB)` + `dark:border-indigo-500/50` 등 |
| **Pricing PRO 티어** | 멤버십 그리드 PRO 카드 | 기존 **Pricing 전용** `dark:from-blue-900/40 dark:via-indigo-900/40 dark:to-slate-900` + `dark:border-blue-500/30` |

- 랜딩 히어로에 Pricing 다크 스톱만 붙이면 **오리지널 남색 감성이 깨진다.** 계획·구현 모두 **랜딩 다크 = 인디고 트랙**, **Pricing 다크 = PRO 카드 트랙**으로 유지한다.
- **라이트**는 양쪽 모두 동일: `PRO_PLAN_LIGHT_GRADIENT_STOPS` + `border-blue-200` + `shadow-xl` 조합(상수명은 구현 시 조정 가능).

### [Rule 4] A11y

- 장식용 블러·스파클 레이어에 `aria-hidden="true"`(또는 동등 처리).
- 웹 **실제 클릭 가능 요소는 `<button type="button">`**; `div` + `onClick` 금지.

### [Rule 2 & 7] 망라적 검사와 React 반환값 (Critical)

- **`switch`의 `default`에서 `return _exhaustiveCheck` 금지(컴포넌트):** 타입스크립트 `never` 할당은 컴파일용으로만 쓰고, **런타임에 예외적 prop이 들어오면 `_exhaustiveCheck`가 객체 등이 될 수 있어** React가 **"Objects are not valid as a React child"** 로 크래시한다. **`HeroTitle` / `FeatureIcon` 등 FC는 `default`에서 `return null`**(또는 안전한 대체 UI)만 한다. **망라적 검사용 식별자는 `title.layout`·`iconKey`처럼 원시/유니온 필드에만 할당**한다.
- **문자열만 반환하는 순수 함수**(예: `getTierSurfaceClasses`)는 **`never` 검사 후 `void _exhaustiveCheck` + 안전한 기본 클래스 문자열**로 끝낸다(React 자식과 무관).

---

## 대상 범위

| 항목 | 경로 |
|------|------|
| 랜딩 | **`components/Landing.tsx`** + **`components/LandingHero.tsx`**(히어로 단일 책임·**필수 분리**) |
| 참조·공유 | `components/Pricing.tsx`, `constants/proPlanSurface.ts`, `constants/landingMessages.ts`, `constants/landingConfig.ts` |

**목표:** 라이트에서 PRO 표면·타이포·웹 보조 CTA 대비 정렬; 다크는 위 Two-Track 유지; I18N·시각 토큰은 상수·사전으로 SSOT.

---

## 작업 체크리스트 (남은·권장 항목)

- [x] 히어로 라이트: PRO 파스텔 그라디언트·보더·그림자 (이미 반영 가능)
- [x] 히어로 다크: 인디고 135° 그라디언트 유지 (이미 반영 가능)
- [x] 라이트 타이포·웹 로그인 버튼 대비 (이미 반영 가능)
- [ ] **I18N/정규화:** 번역은 `constants/landingMessages.ts`, 피처 설정은 `constants/landingConfig.ts`로 분리
- [ ] **DRY:** PRO 라이트 표면·Pricing/랜딩 각각 다크 클래스를 `constants/proPlanSurface.ts`로 추출
- [ ] 제목 줄바꿈: `layout` 기반 분기로 ko/en 구조 분리 (번역 문자열 비교 금지)
- [ ] 피처 칩: `featureItems`에 **stable id** 부여, `key={index}` 제거
- [ ] 렌더 경계: `renderHeroTitle` / `renderFeatureIcon` 일반 함수 대신 `HeroTitle` / `FeatureIcon` 컴포넌트로 분리
- [ ] **파일 분리(필수):** `LandingHero.tsx` 신설·히어로 SRP, `Landing.tsx`는 조합만
- [ ] 장식 글로우·라이트 카드 충돌 시 opacity 조정 및 회귀 점검

---

## 1. PRO 테마 추출 및 히어로 카드 매핑

### 1.1 라이트 표면 (Pricing · 랜딩 공통, 상수 SSOT)

```ts
// constants/proPlanSurface.ts (예시 이름)
export const PRO_PLAN_LIGHT_GRADIENT_STOPS =
  'bg-gradient-to-br from-[#E0F2FE] via-[#F3E8FF] to-[#FFFFFF]';
export const PRO_PLAN_LIGHT_BORDER_SHADOW = 'border border-blue-200 shadow-xl';
export const HERO_CARD_BASE_CLASSES =
  'relative rounded-[3rem] p-10 md:p-14 overflow-hidden transition-all duration-500';
```

### 1.2 다크 표면 — **트랙 A: 랜딩 히어로만**

```ts
export const LANDING_HERO_CARD_DARK_SURFACE_CLASSES =
  'dark:border-indigo-500/50 dark:shadow-2xl dark:bg-[linear-gradient(135deg,#4F46E5_0%,#3730A3_25%,#1E3A8A_50%,#1E40AF_75%,#2563EB_100%)]';
export const LANDING_HERO_CARD_SURFACE_CLASSES = [
  HERO_CARD_BASE_CLASSES,
  PRO_PLAN_LIGHT_GRADIENT_STOPS,
  PRO_PLAN_LIGHT_BORDER_SHADOW,
  LANDING_HERO_CARD_DARK_SURFACE_CLASSES,
].join(' ');
```

히어로 카드 셸 조합 예시(주석만 한글, 클래스는 상수 참조):

```tsx
<div className={LANDING_HERO_CARD_SURFACE_CLASSES}>
```

### 1.3 다크 표면 — **트랙 B: Pricing PRO 티어만** (랜딩에 사용 금지)

```ts
export const PRICING_PRO_TIER_DARK_GRADIENT_STOPS =
  'dark:from-blue-900/40 dark:via-indigo-900/40 dark:to-slate-900';
export const PRICING_PRO_TIER_DARK_BORDER = 'dark:border-blue-500/30';
export const PRICING_PRO_TIER_CARD_SURFACE_CLASSES = [
  PRO_PLAN_LIGHT_GRADIENT_STOPS,
  PRICING_PRO_TIER_DARK_GRADIENT_STOPS,
  PRO_PLAN_LIGHT_BORDER_SHADOW,
  PRICING_PRO_TIER_DARK_BORDER,
].join(' ');

function getTierSurfaceClasses(theme: 'free' | 'pro' | 'premium'): string {
  switch (theme) {
    case 'premium':
      return 'bg-[#000000] border border-amber-500/30 ring-1 ring-amber-500/20';
    case 'pro':
      return PRICING_PRO_TIER_CARD_SURFACE_CLASSES;
    case 'free':
      return 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/70 shadow-xl dark:shadow-2xl';
    default: {
      // [Rule 7] compile-time exhaustiveness; [Rule 2] 런타임 비정상 값 시에도 문자열 반환 보장(React 자식 아님)
      const _exhaustiveCheck: never = theme;
      void _exhaustiveCheck;
      return 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/70 shadow-xl dark:shadow-2xl';
    }
  }
}

const baseCardClasses = getTierSurfaceClasses(tier.theme);
```

**과거 계획 오류 정정:** 랜딩 히어로에 `dark:from-blue-900/40 dark:via-indigo-900/40 …` 만 덧붙이는 스니펫은 **Pricing 색감**이므로 랜딩 다크 요구사항과 불일치한다.

### 1.4 인라인 `style.background` 제거

- 교체 전: 히어로가 `linear-gradient(135deg, …)` 인라인을 쓰는 경우 → 다크는 **트랙 A** 상수로 대체.
- 라이트는 **트랙 공통** 그라디언트 유틸만 사용.

장식 레이어(선택, 클래스만 예시):

```tsx
<div
  className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-[3rem] blur-2xl scale-105 dark:opacity-20 pointer-events-none"
  aria-hidden="true"
/>
```

---

## 2. 텍스트 명도 대비(Contrast) 최적화

배경이 밝아지면 `text-white` 계열은 대비가 급락한다. **라이트**에서 아래 매핑을 쓰고, **다크**는 기존 `dark:text-white` 등으로 되돌린다.

| 요소 | 라이트 | 다크(기존 유지) |
|------|--------|------------------|
| 메인 제목 | `text-slate-900` | `dark:text-white` |
| 강조(BUY THE DIP) | `text-blue-700` | `dark:text-blue-200` |
| 본문 | `text-slate-600` | `dark:text-blue-100/80` 등 |
| 배지 텍스트 | `text-slate-700` | `dark:text-white/90` |
| 배지 컨테이너 | `bg-blue-500/10 border-blue-200` | `dark:bg-white/10 dark:border-white/20` |
| 스파클 | `text-blue-500` | `dark:text-blue-200` |

**I18N 준수 스니펫 (문자열은 사전, 렌더링은 컴포넌트 경계로만):**

```tsx
import React from 'react';
import type { LandingHeroTitle } from '../constants/landingMessages';

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
      // [Rule 7] 식별자는 layout으로만 좁힘(객체 전체를 never에 넣지 않음)
      const _exhaustiveCheck: never = title.layout;
      void _exhaustiveCheck;
      // [Rule 2 & 6] React에 객체를 반환하면 WSOD — 안전하게 null
      return null;
    }
  }
};

const safeHeroTitle = copy?.hero?.title ?? FALLBACK_HERO_TITLE;

<h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 dark:text-white leading-tight tracking-tight mb-4">
  <HeroTitle title={safeHeroTitle} />
</h1>
<p className="text-base md:text-lg text-slate-600 dark:text-blue-100/80 font-medium leading-relaxed mb-10 max-w-lg mx-auto">
  {copy?.hero?.body ?? ''}
</p>
```

`HeroTitle`은 `title.layout === 'ko_brand_lines' | 'en_brand_lines'`만 분기한다. **`default`는 위 [Rule 2 & 7]대로 `null` 반환**으로 WSOD를 막는다.

**토스:** `style={tossTitleStyle}` / `tossSubtitleStyle` 유지, 웹은 `className` 색상으로 대비 처리.

---

## 3. 피처 칩(Feature Chips) 고유 ID 설계

현재 `Landing.tsx`는 `features.map((feature, index) => ...)` 구조라면, 향후 순서 변경·A/B 테스트·조건부 노출 시 `key={index}`가 회귀할 위험이 있다. 계획 단계에서부터 **번역 문자열과 분리된 안정 식별자**를 강제하고, 구조적 설정(`id`, `icon`)과 번역(`label`)을 정규화하여 분리한다.

```ts
import type { AppLang } from '../types';

export type LandingFeatureId =
  | 'secureAssetManagement'
  | 'quickTradeEntry'
  | 'realTimeMarketData'
  | 'customAlertSettings';

export type LandingFeatureIconKey = 'shield' | 'zap' | 'trendingUp' | 'bell';

export interface LandingFeatureConfigItem {
  id: LandingFeatureId;
  icon: LandingFeatureIconKey;
}

export const LANDING_FEATURES_CONFIG: readonly LandingFeatureConfigItem[] = [
  { id: 'secureAssetManagement', icon: 'shield' },
  { id: 'quickTradeEntry', icon: 'zap' },
  { id: 'realTimeMarketData', icon: 'trendingUp' },
  { id: 'customAlertSettings', icon: 'bell' },
] as const;

export interface LandingPageCopy {
  hero: {
    badge: string;
    title: LandingHeroTitle;
    body: string;
    ctaSignup: string;
    ctaLogin: string;
  };
  trustLine: string;
  featureLabels: Record<LandingFeatureId, string>;
}

export const LANDING_PAGE_COPY: Record<AppLang, LandingPageCopy> = {
  ko: {
    hero: { /* ... */ },
    trustLine: '...',
    featureLabels: {
      secureAssetManagement: '...',
      quickTradeEntry: '...',
      realTimeMarketData: '...',
      customAlertSettings: '...',
    },
  },
  en: {
    hero: { /* ... */ },
    trustLine: '...',
    featureLabels: {
      secureAssetManagement: '...',
      quickTradeEntry: '...',
      realTimeMarketData: '...',
      customAlertSettings: '...',
    },
  },
};
```

위 구조의 핵심은 다음과 같다.

- `LANDING_FEATURES_CONFIG`는 구조적 설정이므로 1회만 선언된다.
- `featureLabels`는 번역 문자열만 가지므로 설정과 번역의 강결합이 사라진다.
- `id`는 번역과 무관한 영문 식별자이므로 로케일 변경과 독립적이다.
- 나중에 피처 순서나 아이콘을 바꿔도 모든 언어 사전을 뒤질 필요가 없다.

아이콘도 일반 함수 호출이 아니라 **명시적 React 컴포넌트 경계**로 고정한다.

```tsx
import React from 'react';

interface FeatureIconProps {
  iconKey: LandingFeatureIconKey;
}

const FeatureIcon: React.FC<FeatureIconProps> = ({ iconKey }) => {
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
      void _exhaustiveCheck;
      return null;
    }
  }
};

{LANDING_FEATURES_CONFIG.map((feature) => (
  <div
    key={feature.id}
    className="flex items-center gap-2 px-5 py-3 rounded-full bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
  >
    <span className="text-blue-500 dark:text-blue-400" aria-hidden="true">
      <FeatureIcon iconKey={feature.icon} />
    </span>
    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
      {copy?.featureLabels?.[feature.id] ?? ''}
    </span>
  </div>
))}
```

이 스니펫은 다음 규칙을 동시에 만족한다.

- `Rule 3`: UI 문자열은 사전에만 있음
- `Rule 6`: 피처 설정과 번역 데이터가 분리됨
- `React Anti-Pattern`: `key={index}` 제거
- `Rule 7`: `switch` exhaustive check 보장
- `SRP`: 제목/아이콘 렌더링 책임이 별도 컴포넌트로 분리됨

---

## 4. 로그인 버튼 시인성 개선 (웹)

- **라이트:** `bg-white/70 text-slate-700 border-slate-300` + hover 시 `border-slate-400`, `text-slate-900`.
- **다크:** 기존 `bg-transparent text-white border-white/30` + hover 유지.

```tsx
<button
  type="button"
  onClick={onOpenLogin}
  className="group px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300 flex items-center gap-3 backdrop-blur-sm bg-white/70 text-slate-700 border border-slate-300 hover:bg-white hover:border-slate-400 hover:text-slate-900 dark:bg-transparent dark:text-white dark:border-white/30 dark:hover:bg-white/10 dark:hover:border-white/50"
>
  <span>{copy?.hero?.ctaLogin ?? ''}</span>
  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
</button>
```

`type="button"` 명시.

---

## 5. 가상 런타임 시뮬레이션 (검토 요약)

### Visual Consistency

- **라이트:** Pricing PRO와 동일 라이트 토큰을 쓰면 랜딩·프라이싱이 정렬된다.
- **다크:** 랜딩=인디고 히어로, Pricing=PRO 카드 다크 — **의도적으로 다를 수 있음**(각 화면 레거시 유지).

### A11y (WCAG 2.1)

- 라이트에서 `text-slate-900` / `text-slate-600` / `text-slate-700` 조합으로 대비 개선 기대. 구현 후 도구로 측정 권장.

### Zero Regression

- 레이아웃 클래스 유지, `dark:` 병행 시 라이트·다크 각각 깨지지 않게 점검.
- 히어로 앞 글로우가 라이트 카드와 겹치면 탁해질 수 있어 opacity 조정.

---

## 6. 실제 수정 순서 (권장)

1. `constants/proPlanSurface.ts`에 라이트 공통 + 랜딩 다크 + Pricing PRO 다크 상수 정의 후 `Pricing.tsx`·랜딩에 import.
2. `constants/landingConfig.ts`에 피처 구조(`LANDING_FEATURES_CONFIG`), `constants/landingMessages.ts`에 히어로·신뢰 문구·`featureLabels`를 정의한다.
3. 랜딩 컴포넌트에서 하드코딩 문자열 제거, `HeroTitle` / `FeatureIcon` 컴포넌트 적용, `LANDING_FEATURES_CONFIG.map(...)` + `key={feature.id}`로 렌더링한다.
4. **(필수·SRP)** 히어로 UI·카피 바인딩은 **`components/LandingHero.tsx`** 로만 두고, `Landing.tsx`는 섹션 조합·공통 레이아웃만 담당한다. 비대한 단일 파일 방치는 허용하지 않는다.
5. 린트 및 라이트/다크 표시 회귀 점검.

---

## 참고: Pricing PRO 아이콘 박스·페이지 블러

- **아이콘 박스:** `bg-blue-500/10 rounded-2xl border border-blue-400/30` (히어로에 별도 박스를 둘 경우).
- **페이지 분위기 블러:** `from-blue-500/25 via-indigo-500/10 to-transparent` + `blur-3xl` — 랜딩 페이지 배경과 중복 시 한쪽만 쓰거나 강도 조절.
