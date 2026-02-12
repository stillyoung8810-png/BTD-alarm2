# Vendor 청크 최적화 계획 (1.3MB+ 해소)

> 목표: Vite 빌드 시 vendor 청크 1.3MB 초과 문제를 체계적으로 해소하고, 유지보수성·클린코드 관점의 개선을 반영한다.

---

## 요약: 중요도 순 액션 리스트

| 우선순위 | 항목 | 효과 |
|----------|------|------|
| **P0** | Firebase 지연 로드 | 초기 번들에서 firebase 제거 (vendor-api/초기 크기 감소) |
| **P0** | 라우트(탭) 단위 코드 스플리팅 (Dashboard, Markets, History, Pricing, Privacy, Terms) | index 청크 감소, 첫 화면만 먼저 로드 |
| **P0** | 무거운 모달 지연 로드 (StrategyCreator, AIImageInputModal, CheckoutModal, AlarmModal, PortfolioDetailsModal) | 초기 번들 대폭 감소 |
| **P1** | manualChunks 세분화 검토 (lucide 등, 순환 없을 때만) | 캐시·병렬 로드 효율 |
| **P1** | rollup-plugin-visualizer 등으로 번들 분석 정례화 | 변경 시 크기 회귀 방지 |
| **P2** | Tailwind CDN → 빌드 시 컴파일 검토 | ✅ 적용됨 (Tailwind v4 + PostCSS, index.css) |
| **유지보수** | DRY: normalizePortfolioData, getCurrentKSTDateString, 세션 에러 분기 → 유틸로 추출 | ✅ 적용됨 (dateUtils, portfolioNormalize, authHelpers, deviceInfo) |
| **유지보수** | Dead Code: 미사용 import/변수 정리, userProfile 타입 분리 | ✅ 적용됨 (Sparkles 제거, types/appUserProfile.ts) |
| **유지보수** | 인지 복잡도: App.tsx 로직을 useAuth, usePortfolios, useFCMToken 등 훅으로 분리 | 가독성·테스트 용이 |
| **유지보수** | 안티패턴: as any 축소, 인라인 콜백/객체 useCallback/useMemo 정리 | 리렌더·타입 안전성 |

---

## 1. 현재 상태 요약

| 청크 | 크기(min) | 내용 추정 |
|------|-----------|-----------|
| **vendor** | **~1,115 kB** | React 엔진 + lucide-react + @emotion + @toss/tds-colors + 기타 공통 의존성 |
| vendor-api | ~243 kB | @supabase/supabase-js, firebase |
| recharts | ~236 kB | 차트 라이브러리 (이미 분리) |
| dexie | ~95 kB | IndexedDB 래퍼 (이미 분리) |
| index | ~391 kB | 앱 진입점 + 라우트/모달 등 번들 |

- **문제**: vendor 단일 청크가 500kB 경고를 크게 상회하여, 초기 로딩·캐시 효율·LCP에 부담.
- **원인**: 모든 탭·모달이 정적 import되어 진입점에서 한 번에 로드됨. Firebase는 FCM용으로만 쓰이는데 앱 부팅 시부터 로드됨.

---

## 2. React 엔진 분리 검토

### 2.1 효용성

- **이론적 이점**: React + react-dom을 별도 청크로 빼면 vendor 나머지(lucide, UI 라이브러리 등)와 캐시 분리·병렬 로드 가능.
- **실제 제약**: 이 프로젝트에서는 **이미 시도 시 순환 청크가 발생**함.  
  `vendor → react-vendor → vendor` (다른 라이브러리들이 React를 참조하고, React 쪽에서 다시 vendor에 속한 모듈을 참조하는 구조).

### 2.2 결론: **현재 프로젝트에 React 단일 청크 분리는 적용하지 않음**

- Rollup/Vite의 `manualChunks`로 React만 분리하면 **Circular chunk** 에러가 나며, 해결하려면 의존성 그래프를 크게 재구성해야 함.
- 대신 **라우트/기능 단위 코드 스플리팅**으로 초기 번들에서 제거하는 편이 효과 크고 리스크 적음.

---

## 3. 최적화 방안 및 계획 (중요도 순)

### P0 (필수 — 즉시 적용 권장)

1. **Firebase 지연 로드 (Lazy load)**  
   - **현상**: `App.tsx`에서 `requestForToken`, `getNotificationPermission`를 정적 import → `services/firebase.ts` 전체(및 firebase 패키지)가 초기 번들에 포함됨.  
   - **조치**: FCM 토큰 요청이 필요한 시점(로그인 직후·세션 복구 시)에만 `import('./services/firebase')`로 동적 로드.  
   - **기대 효과**: vendor-api 또는 별도 청크로 firebase가 분리되고, 비로그인/알림 미사용 사용자는 firebase 미로드.

2. **라우트(탭) 단위 코드 스플리팅**  
   - **현상**: Dashboard, Markets, History, Pricing, Privacy, Terms, StrategyCreator 등이 모두 `App.tsx`에서 정적 import됨.  
   - **조치**:  
     - `Dashboard`, `Markets`, `History`, `Pricing`, `Privacy`, `Terms`를 `React.lazy(() => import(...))`로 전환.  
     - 해당 탭이 활성화될 때만 해당 청크 로드.  
   - **기대 효과**: 초기 `index` + vendor 크기 감소, 첫 화면(Dashboard or Landing)에 필요한 코드만 로드.

3. **무거운 모달 지연 로드**  
   - **대상**: `StrategyCreator`, `AIImageInputModal`, `CheckoutModal`, `AlarmModal`, `PortfolioDetailsModal` 등 (아이콘·폼·차트 의존성 다수).  
   - **조치**: 모달 컴포넌트를 `React.lazy`로 래핑하고, 모달이 열릴 때만 로드 (Suspense fallback은 기존 로딩 UI 활용).  
   - **기대 효과**: 초기 번들에서 상당량 제거, 특히 StrategyCreator·AIImageInputModal·CheckoutModal 비중 큼.

### P1 (권장 — 단기)

4. **manualChunks 세분화 (순환 없이)** ✅ 적용됨  
   - **유지**: `recharts`, `dexie`, `vendor-api`(supabase + firebase) 분리 유지.  
   - **추가**: `lucide-react`를 별도 청크(`lucide-react`)로 분리. (순환 발생 시 빌드 에러로 확인 후 제외 가능.)

5. **번들 분석 도구로 검증** ✅ 적용됨  
   - `rollup-plugin-visualizer` 추가.  
   - **사용법**: `npm run build:analyze` 실행 후 `dist/stats.html`을 브라우저에서 열어 청크 구성·크기 확인.  
   - P0 적용 전/후·manualChunks 변경 후 vendor/index 크기·구성 비교에 활용.

### P2 (중기)

6. **Tailwind CDN → 빌드 시 컴파일** ✅ 적용됨  
   - Tailwind v4 + `@tailwindcss/postcss`, `index.css`에 `@import "tailwindcss"` 및 `@theme` 확장, 기존 `<style>` 이관.  
   - `index.html`에서 CDN·인라인 config·`<style>` 제거. 빌드 시 CSS 트리쉐이킹 적용.

---

## 4. 유지보수성·클린코드 관점 점검

### 4.1 DRY (Don't Repeat Yourself)

| 항목 | 위치 | 내용 | 권장 조치 |
|------|------|------|-----------|
| **normalizePortfolioData** | `App.tsx` 내부 정의 | Supabase 응답의 snake_case → camelCase 변환이 `App.tsx`에만 있음. `handleAddPortfolio` 내 정규화 코드와 중복 패턴. | `utils/portfolioNormalize.ts`(또는 기존 portfolio 관련 util)로 추출하고, `normalizePortfolioData` 한 곳에서만 정의 후 재사용. |
| **getCurrentKSTDateString** | `App.tsx` 내부 정의 | KST 기준 `YYYY-MM-DD` 생성. Supabase Edge 함수 등 다른 곳에도 유사 로직 존재. | `utils/dateUtils.ts`에 `getCurrentKSTDateString()` 한 번만 정의하고 App·다른 모듈에서 import. |
| **에러 메시지 분기** | 다수 핸들러 | `refresh token` / `invalid` / `expired` 등 동일 문자열 체크가 `checkUser`, `onAuthStateChange`, `handleAuthError`에 반복. | `authHelpers.ts`에 `isSessionRecoverableError(err)` 같은 단일 함수로 모아서 호출처에서만 사용. |

### 4.2 Dead Code & Unused Props

| 항목 | 내용 | 권장 조치 |
|------|------|-----------|
| **Sparkles (App.tsx)** | `lucide-react`에서 `Sparkles` import 되어 있는데, 네비게이션/헤더에서는 사용처 없음(다른 컴포넌트로 내려줄 수 있음). | 사용처 확인 후, App에서 불필요하면 import 제거. |
| **userProfile 타입** | `App.tsx`의 `userProfile` state 타입이 인라인으로 길게 정의됨. | `types/userProfile.ts` 등으로 분리해 재사용 및 가독성 확보. |
| **미사용 import/변수** | 각 컴포넌트별로 선언만 되고 사용되지 않는 props·변수 존재 가능. | ESLint `no-unused-vars` / `@typescript-eslint/no-unused-vars` 적용 후, 단계적으로 제거. |

### 4.3 Cognitive Complexity (인지 복잡도)

| 항목 | 내용 | 권장 조치 |
|------|------|-----------|
| **App.tsx** | 단일 파일에 인증·포트폴리오 fetch·FCM·정산·모달 핸들러 등이 모두 있어 1200줄 이상. | 인증 로직 → `hooks/useAuth.ts` 또는 `hooks/useSession.ts`, 포트폴리오 CRUD → `hooks/usePortfolios.ts`, FCM → `hooks/useFCMToken.ts` 등으로 분리. 조건 분기·early return 정리. |
| **checkUser / onAuthStateChange** | 중첩 if와 에러 메시지 문자열 비교가 반복됨. | 위 DRY의 `isSessionRecoverableError` 사용 + 단계별 early return으로 depth 축소. |
| **parseDeviceInfo** | 긴 if-else 체인으로 브라우저/OS 파싱. | `utils/deviceInfo.ts`로 이동하고, 작은 헬퍼(예: `getBrowserName(ua)`, `getOSName(ua)`)로 나누어 가독성 확보. |

### 4.4 Anti-patterns

| 항목 | 내용 | 권장 조치 |
|------|------|-----------|
| **일부 타입 단언** | `as any` 사용 (예: Supabase upsert `onConflict`). | Supabase 타입 정의를 활용하거나, 제네릭/오버로드로 `as any` 제거. |
| **인라인 객체를 자식에 전달** | `onSave`, `onClose` 등에 인라인 화살표 함수·객체가 많아 불필요한 리렌더 유발 가능. | `useCallback`으로 안정적인 참조 유지하고, 객체는 `useMemo`로 메모이제이션 검토. |
| **거대 단일 컴포넌트** | `App`이 라우팅·레이아웃·모달·결제·인증을 모두 포함. | 라우트별 레이아웃 컴포넌트 분리, 모달은 컨테이너/훅으로 열기 로직만 두고 내용은 lazy 컴포넌트로 분리. |

---

## 5. 리팩토링된 개선 코드 제안

### 5.1 Firebase 지연 로드 (P0)

**현재 (App.tsx):**

```ts
import { requestForToken, getNotificationPermission } from './services/firebase';
// ...
const token = await requestForToken();
```

**개선:**

- `services/firebase.ts`는 그대로 두고, **진입점만 동적 로드하는 래퍼**를 둠.

**새 파일 `services/firebaseLazy.ts`:**

```ts
export const getNotificationPermission = (): NotificationPermission | null => {
  if (typeof window === 'undefined') return null;
  return window.Notification?.permission ?? null;
};

export const requestForToken = async (): Promise<string | null> => {
  const { requestForToken: impl } = await import('./firebase');
  return impl();
};
```

- `App.tsx`에서는 `./services/firebaseLazy`만 정적 import.  
  `getNotificationPermission`은 동기·가벼운 값만 사용하므로 래퍼에 두고, 실제 FCM 초기화·토큰 요청은 `import('./firebase')` 시점에만 로드.

또는 **App에서 완전 동적 호출**:

```ts
// App.tsx — saveFCMToken 내부
const permission = (await import('./services/firebase')).getNotificationPermission();
if (permission === 'denied') return;
const token = await (await import('./services/firebase')).requestForToken();
```

- 두 번째 방식이면 `firebase.ts` 전체가 초기 번들에서 제거됨.

### 5.2 라우트(탭) 단위 스플리팅 (P0)

**App.tsx 상단 변경:**

```ts
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const Markets = React.lazy(() => import('./components/Markets'));
const History = React.lazy(() => import('./components/History'));
const Pricing = React.lazy(() => import('./components/Pricing'));
const Privacy = React.lazy(() => import('./components/Privacy'));
const Terms = React.lazy(() => import('./components/Terms'));
const Backtest = React.lazy(() => import('./components/Backtest'));
```

- 기존 `Backtest`만 lazy였던 것을 확장.  
- 렌더 시 해당 탭에 대해 `<Suspense fallback={...}>`로 감싸기 (이미 Backtest에 적용된 패턴 재사용).

### 5.3 무거운 모달 지연 로드 (P0)

**예: StrategyCreator, AIImageInputModal, CheckoutModal**

```ts
const StrategyCreator = React.lazy(() => import('./components/StrategyCreator'));
const AIImageInputModal = React.lazy(() => import('./components/AIImageInputModal'));
const CheckoutModal = React.lazy(() => import('./components/CheckoutModal'));
const AlarmModal = React.lazy(() => import('./components/AlarmModal'));
const PortfolioDetailsModal = React.lazy(() => import('./components/PortfolioDetailsModal'));
```

- 모달이 열릴 때만 해당 청크 로드.  
- 모달을 렌더하는 부모에서 `<Suspense fallback={null}>` 또는 짧은 스피너로 감싸기.

### 5.4 DRY — 공통 유틸 추출

**`utils/dateUtils.ts` (신규 또는 기존 유틸에 추가):**

```ts
export function getCurrentKSTDateString(): string {
  const nowUtc = new Date();
  const kstTime = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  const y = kstTime.getUTCFullYear();
  const m = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kstTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

**`utils/portfolioNormalize.ts` (또는 기존 portfolio 유틸):**

```ts
import type { Portfolio } from '../types';

export function normalizePortfolioData(data: any[]): Portfolio[] {
  return data.map((item: any) => ({
    ...item,
    dailyBuyAmount: item.daily_buy_amount ?? 0,
    startDate: item.start_date ?? item.startDate ?? '',
    feeRate: item.fee_rate ?? item.feeRate ?? 0.25,
    isClosed: item.is_closed ?? item.isClosed ?? false,
    closedAt: item.closed_at ?? item.closedAt ?? undefined,
    finalSellAmount: item.final_sell_amount ?? item.finalSellAmount ?? undefined,
    alarmconfig: item.alarm_config ?? item.alarmconfig ?? undefined,
    isQuarterMode: item.is_quarter_mode ?? item.isQuarterMode ?? false,
    strategy: item.strategy,
  })) as Portfolio[];
}
```

- `App.tsx`에서는 위 함수들을 import하여 사용하고, 내부 중복 정의 제거.

### 5.5 인증 에러 판별 DRY — `utils/authHelpers.ts`

**기존:** `authHelpers.ts` 존재 여부 확인 후, 다음 함수 추가 또는 신규 생성:

```ts
export function isSessionRecoverableError(err: unknown): boolean {
  const name = err && typeof err === 'object' && 'name' in err ? (err as { name?: string }).name : '';
  const message = err && typeof err === 'object' && 'message' in err
    ? String((err as { message?: unknown }).message).toLowerCase()
    : '';
  return (
    name === 'AuthApiError' ||
    message.includes('refresh token') ||
    message.includes('invalid') ||
    message.includes('expired') ||
    message.includes('not found')
  );
}
```

- `checkUser`, `onAuthStateChange`, `handleAuthError`에서는 `if (isSessionRecoverableError(err)) { await clearAuthState(...); }` 형태로 통일.

### 5.6 디바이스 정보 — `utils/deviceInfo.ts`

**`parseDeviceInfo`를 App.tsx에서 분리:**

```ts
export function parseDeviceInfo(): { deviceName: string; userAgent: string; deviceType: string } {
  if (typeof window === 'undefined' || !navigator) {
    return { deviceName: 'Unknown', userAgent: '', deviceType: 'web' };
  }
  const ua = navigator.userAgent;
  const browserName = getBrowserName(ua);
  const osName = getOSName(ua);
  return {
    deviceName: `${browserName} on ${osName}`,
    userAgent: ua,
    deviceType: 'web',
  };
}

function getBrowserName(ua: string): string {
  if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('OPR')) return 'Opera';
  return 'Unknown Browser';
}

function getOSName(ua: string): string {
  if (ua.includes('Windows NT 10.0')) return 'Windows 10/11';
  if (ua.includes('Windows NT 6.3')) return 'Windows 8.1';
  if (ua.includes('Windows NT 6.2')) return 'Windows 8';
  if (ua.includes('Windows NT 6.1')) return 'Windows 7';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS X') || ua.includes('Macintosh')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iOS')) return 'iOS';
  return 'Unknown OS';
}
```

- App.tsx에서는 `import { parseDeviceInfo } from './utils/deviceInfo'` 후 기존 호출만 유지.

---

## 6. 적용 순서 제안

1. **DRY/유틸 정리** (dateUtils, portfolioNormalize, authHelpers, deviceInfo)  
   → 동작 변경 없이 유지보수성만 개선.
2. **Firebase 지연 로드**  
   → 빌드 후 vendor-api 또는 초기 번들 크기 감소 확인.
3. **라우트(탭) lazy**  
   → index 청크 감소 및 초기 로딩 시간 개선 확인.
4. **무거운 모달 lazy**  
   → 추가 감소 확인.
5. **manualChunks·lucide 검토 및 번들 분석**  
   → 필요 시 문서 업데이트 및 추가 분리.

이 순서로 적용하면 **경고 수준을 넘어선 1.3MB+ vendor 문제를 단계적으로 해소**하면서, **유지보수성과 클린코드**를 함께 높일 수 있다.
