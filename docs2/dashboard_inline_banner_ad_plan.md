# 대시보드 인라인 배너 광고 추가 계획서

**상태**: 문서 전용 - 제품 코드 변경 전 검토·시뮬레이션용  
**목표**: 대시보드의 `+ 새 포트폴리오` 버튼 영역 아래, 포트폴리오 카드 목록 위에 작은 배너 광고 추가  
**시뮬레이션**: `docs2/dashboard_inline_banner_ad_simulation.test.ts`  
**실행 명령**: `npx vitest run --config docs2/vitest.dashboard-inline-banner.config.ts`

---

## 0. 결론

현재 시스템에서는 대규모 리팩터링 없이 적용 가능합니다. 이번 요구사항은 새 광고 지면을 만드는 것이 아니라, `History.tsx`의 인라인 배너를 대시보드에도 그대로 넣는 작업입니다.

권장 구현은 아래 2개 파일만 최소 수정하는 방식입니다.

| 파일 | 변경 목적 |
|------|-----------|
| `components/TabContent.tsx` | 이미 계산 중인 `shouldShowAds`를 `Dashboard`로 전달 |
| `components/Dashboard.tsx` | 히스토리탭과 같은 광고 ID의 `TossInlineBanner`를 대시보드 헤더와 포트폴리오 카드 목록 사이에 삽입 |

안정성을 위해 광고 컴포넌트는 아래 조건이 모두 맞을 때만 마운트합니다.

1. 토스 앱 안에서 실행 중입니다.
2. 현재 사용자 정책상 광고를 보여줘야 합니다. 현재 기준은 `paidTier === 'free'`입니다.

포트폴리오 개수는 노출 조건에 넣지 않습니다. 빈 포트폴리오 상태에서도 토스 앱 안의 광고 대상 사용자라면 대시보드 헤더 아래, 빈 상태 섹션 위에 광고를 노출합니다.

---

## 1. 현재 시스템 검토

### 1.1 광고 정책 흐름

`TabContent.tsx`는 이미 유료 등급을 정규화한 뒤 무료 사용자에게만 광고를 보여주도록 계산합니다.

```tsx
const paidTier = resolvePaidTier(currentTier);
const shouldShowAds = paidTier === 'free';
```

이 값은 현재 `Markets`, `History`에는 전달되지만 `Dashboard`에는 전달되지 않습니다.

```tsx
<Markets
  lang={lang}
  portfolios={portfolios}
  canAccessPaidStocks={canAccessPaidStocks}
  shouldShowAds={shouldShowAds}
/>

<History
  lang={lang}
  portfolios={closedPortfolios}
  shouldShowAds={shouldShowAds}
  onOpenDetails={onOpenDetails}
  onDeleteHistory={onDeleteHistory}
  onClearHistory={onClearHistory}
/>
```

따라서 새 광고 정책을 만들 필요는 없습니다. 기존 `shouldShowAds`를 `Dashboard`로 넘기면 됩니다.

### 1.2 기존 배너 컴포넌트

`TossInlineBanner`는 아래 책임을 이미 갖고 있습니다.

| 책임 | 현재 처리 |
|------|-----------|
| 토스 앱 여부 | `isInTossApp`가 아니면 `null` 반환 |
| 광고 정책 | `shouldShowAd`가 false면 `null` 반환 |
| 공식 SDK 호출 | `useTossBanner` 경유 |
| 광고 실패 | `onNoFill`, `onAdFailedToRender`에서 숨김 |
| 정리 | 언마운트 시 `destroy()` 호출 |

따라서 대시보드에서 새 SDK 호출, 새 hook, 새 상태를 만들면 오버코딩입니다.

### 1.3 기존 히스토리 배너 크기

`History.tsx`는 96px 고정 컨테이너를 사용합니다.

```tsx
const HISTORY_LIST_BANNER_CONTAINER_CLASS_NAME = 'h-[96px] min-h-[96px]';
```

대시보드 배너도 같은 높이를 사용합니다. 단, 이름은 대시보드 전용으로 둡니다.

```tsx
const DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME = 'h-[96px] min-h-[96px]';
```

---

## 2. 제품 정책 가정

| 항목 | 결정 |
|------|------|
| 노출 위치 | 대시보드 헤더 바로 아래, 포트폴리오 카드 섹션 바로 위 |
| 노출 대상 | `shouldShowAds === true`인 사용자 |
| 실행 환경 | 토스 앱 안에서만 노출 |
| 빈 포트폴리오 | 노출 |
| 광고 SDK | 기존 `TossInlineBanner`만 사용 |
| 광고 그룹 ID | 히스토리탭의 실제 인라인 배너 ID 그대로 사용 |
| 결제/멤버십 로직 | 수정하지 않음 |
| Supabase/Edge Function | 수정·배포 없음 |

별도 대시보드 광고 그룹 ID, 새 env flag, 새 resolver는 만들지 않습니다. 사용자가 명시한 정책상 히스토리탭 인라인 배너와 동일한 실제 ID를 공유합니다.

---

## 3. 구현 스니펫

### 3.1 `components/TabContent.tsx`

`Dashboard`에 기존 광고 정책 플래그를 전달합니다.

```tsx
<Dashboard
  lang={lang}
  portfolios={activePortfolios}
  shouldShowAds={shouldShowAds}
  onClosePortfolio={onClosePortfolio}
  onDeletePortfolio={onDeletePortfolio}
  onOpenCreator={onRequestOpenCreator}
  onOpenAlarm={onOpenAlarm}
  onOpenDetails={onOpenDetails}
  onOpenQuickInput={onOpenQuickInput}
  onOpenExecution={onOpenExecution}
  onOpenAIImage={onOpenAIImage}
  totalValuation={totalValuation}
  totalValuationChange={totalValuationChange}
  totalValuationChangePct={totalValuationChangePct}
  onDailyExecutionSummaryChange={onDailyExecutionSummaryChange}
/>
```

### 3.2 `components/Dashboard.tsx`

import를 추가합니다.

```tsx
import { getResolvedHistoryBannerAdGroupId } from '../services/ads/adPlacements';
import { TossInlineBanner } from './TossInlineBanner';
```

대시보드 전용 컨테이너 높이를 모듈 상단 상수로 둡니다.

```tsx
const DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME = 'h-[96px] min-h-[96px]';
```

`DashboardProps`에 광고 정책 플래그를 추가합니다.

```tsx
interface DashboardProps {
  lang: AppLang;
  portfolios: Portfolio[];
  shouldShowAds: boolean;
  onClosePortfolio: (id: string) => void;
  onDeletePortfolio: (id: string) => Promise<void> | void;
  onOpenCreator: () => void;
  onOpenAlarm: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onOpenQuickInput: (
    id: string,
    activeSection?: 1 | 2 | 3,
  ) => Promise<void> | void;
  onOpenExecution: (id: string, guideData?: TradeExecutionGuideData) => void;
  onOpenAIImage: (id: string) => void;
  totalValuation: number;
  totalValuationChange: number;
  totalValuationChangePct: number;
  onDailyExecutionSummaryChange?: (summaryText: string | null) => void;
}
```

컴포넌트 인자에서 `shouldShowAds`를 받습니다.

```tsx
const Dashboard: React.FC<DashboardProps> = ({
  lang,
  portfolios,
  shouldShowAds,
  onClosePortfolio,
  onDeletePortfolio,
  onOpenCreator,
  onOpenAlarm,
  onOpenDetails,
  onOpenQuickInput,
  onOpenExecution,
  onOpenAIImage,
  totalValuation,
  totalValuationChange,
  totalValuationChangePct,
  onDailyExecutionSummaryChange,
}) => {
```

렌더 직전 표시 조건과 광고 그룹 ID를 계산합니다.

```tsx
const shouldRenderDashboardBanner = isInTossApp && shouldShowAds;
const dashboardInlineBannerAdGroupId = getResolvedHistoryBannerAdGroupId();
```

대시보드 헤더와 포트폴리오 섹션 사이에 삽입합니다.

```tsx
<DashboardHeader
  isInTossApp={isInTossApp}
  headerVm={headerVm}
  totalValuationLabel={t.totalValuation}
  totalValuationChangeLabel={t.gain24h}
  createLabel={copy.createLabel}
  onOpenCreator={onOpenCreator}
/>

{shouldRenderDashboardBanner ? (
  <TossInlineBanner
    adGroupId={dashboardInlineBannerAdGroupId}
    shouldShowAd
    isInTossApp={isInTossApp}
    variant="card"
    containerClassName={DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME}
  />
) : null}

{portfolios.length === 0 ? (
  <section
    className={
      isInTossApp ? 'block' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'
    }
  >
```

여기서 `TossInlineBanner` 자체가 조기 반환을 갖고 있지만, 대시보드에서는 컴포넌트 마운트 자체를 조건부로 제한합니다. 광고 비노출 상태에서 hook 호출 순서가 바뀔 여지를 만들지 않는 보수적 선택입니다.

중요: `TossInlineBanner`를 항상 마운트한 뒤 `shouldShowAd={shouldShowAds}`로 켜고 끄는 방식은 사용하지 않습니다. 대시보드에서 이미 `shouldRenderDashboardBanner`로 노출 여부를 결정했으므로, 마운트된 배너에는 `shouldShowAd`를 항상 true로 전달합니다.

---

## 4. 시뮬레이션

시뮬레이션은 실제 토스 SDK를 호출하지 않습니다. 렌더링 정책만 순수 함수로 검증합니다.

```ts
export const DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME =
  'h-[96px] min-h-[96px]';

export function resolveDashboardBannerDecision(
  input: DashboardBannerDecisionInput,
): DashboardBannerDecision {
  const shouldRender = input.isInTossApp && input.shouldShowAds;

  if (!shouldRender) {
    return {
      shouldRender: false,
      placement: 'hidden',
      adGroupIdSource: 'history-inline-banner',
      containerClassName: DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME,
      variant: 'card',
    };
  }

  return {
    shouldRender: true,
    placement: 'after-header-before-dashboard-content',
    adGroupIdSource: 'history-inline-banner',
    containerClassName: DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME,
    variant: 'card',
  };
}
```

검증 케이스는 다음과 같습니다.

| 케이스 | 기대 |
|--------|------|
| 토스 앱 + 광고 대상 | 배너 노출 |
| 토스 앱 아님 | 숨김 |
| 광고 대상 아님 | 숨김 |
| 포트폴리오 0개 | 노출 조건에 영향 없음 |

실행 명령:

```bash
npx vitest run --config docs2/vitest.dashboard-inline-banner.config.ts
```

---

## 5. 안정성 검토

### 5.1 다른 시스템과의 충돌 여부

| 시스템 | 영향 |
|--------|------|
| 결제/IAP | 없음. `shouldShowAds` 계산만 읽음 |
| 멤버십 탭 | 없음 |
| 종목 접근 무료화 | 없음 |
| 포트폴리오 생성/삭제 | 없음. 포트폴리오 개수를 광고 노출 조건으로 읽지 않음 |
| 알람/텔레그램 | 없음 |
| Supabase Edge Function | 없음 |
| 금융 계산 | 없음 |
| Toss 광고 SDK | 기존 `TossInlineBanner` 경유 |
| 광고 그룹 ID | 히스토리탭 ID 재사용. 신규 ID/env/resolver 없음 |

### 5.2 실패 모드

| 실패 상황 | 기대 동작 |
|-----------|-----------|
| 토스 앱 밖에서 접근 | 광고 미마운트 |
| 광고 대상이 아닌 유료 사용자 | 광고 미마운트 |
| 광고 no-fill | 기존 `TossInlineBanner`가 숨김 |
| SDK 렌더 실패 | 기존 `TossInlineBanner`가 숨김 |
| 포트폴리오 0개 | 토스 앱 + 광고 대상이면 광고 마운트 |

---

## 6. 12가지 Core Rules 준수 검토

| 규칙 | 검토 결과 |
|------|-----------|
| 1. 금융 수학 안전성 | 금융 계산을 추가하지 않음 |
| 2. React UI 안티패턴 | 중첩 ternary 없음, render 중 ref/state mutation 없음 |
| 3. I18N | 새 UI 문구 없음 |
| 4. A11y | 새 interactive div/button 없음 |
| 5. DRY/OCP | 기존 `TossInlineBanner`, 기존 광고 정책 플래그, 히스토리 배너 ID resolver 재사용 |
| 6. Clean Code | 수정 범위는 2개 파일로 제한 |
| 7. Strict TypeScript | `any`, non-null assertion 없음 |
| 8. Naming/Magic Numbers | 96px 높이는 설명 있는 상수로 분리 |
| 9. Meaningful Comments | 필요한 경우 광고 트래픽 오염 방지 목적만 주석 처리 |
| 10. Performance/State | 새 state/hook 없음. 조건부 마운트로 불필요한 SDK 초기화 방지 |
| 11. Async/Bridge Resilience | SDK 직접 호출 없음. 기존 hook의 실패 처리 재사용 |
| 12. Toss 공식 API | `@apps-in-toss/web-framework` 경로를 감싼 기존 hook만 사용 |

---

## 7. 오버코딩 여부 검토

이번 작업에서 하지 말아야 할 것:

1. 새 광고 컴포넌트 작성
2. 새 광고 hook 작성
3. 광고 노출 정책을 별도 store/context로 분리
4. 대시보드 전용 광고 그룹 ID/resolver/env flag 추가
5. 광고 실패 로그 수집 시스템 추가
6. 빈 포트폴리오 온보딩 화면 재설계
7. 결제/멤버십/텔레그램 로직 동시 수정
8. Supabase 함수 수정 또는 배포

필요한 최소 변경:

1. `Dashboard`에 `shouldShowAds` prop 추가
2. `TabContent`에서 기존 `shouldShowAds` 전달
3. `Dashboard`에서 `getResolvedHistoryBannerAdGroupId()`와 기존 `TossInlineBanner` 조건부 마운트
4. 포트폴리오 개수 조건은 추가하지 않음

따라서 이 계획은 현재 요구사항에 대해 과도하지 않습니다. 히스토리탭 ID를 그대로 쓰는 정책이므로 `services/ads/adPlacements.ts`는 수정하지 않는 편이 더 안정적입니다.

---

## 8. 구현 전 체크리스트

1. `npx vitest run --config docs2/vitest.dashboard-inline-banner.config.ts` 통과
2. 실제 구현 후 `npm run typecheck:app` 실행
3. 토스 앱 환경에서 무료 사용자 케이스 수동 확인
4. 토스 앱 밖, 유료 사용자 케이스에서 광고 미노출 확인
5. 포트폴리오 0개와 1개 이상 모두에서 토스 앱 + 광고 대상이면 광고 노출 확인
