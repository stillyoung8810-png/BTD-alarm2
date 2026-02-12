## App.tsx 구조 리팩토링 계획 (Auth / Portfolio / FCM / DRY)

> 목표: `App.tsx`를 얇은 컴포지션 레이어로 단순화하고, 인증·포트폴리오·FCM·유틸 로직을 훅/유틸 모듈로 분리하여 **DRY**, **유지보수성**, **성능**을 동시에 개선한다.

---

## 0. 현재 문제 인식

- `App.tsx`에 다음 책임이 모두 뒤섞여 있어 **인지 복잡도와 변경 비용이 높음**:
  - Supabase 인증/세션 복구/에러 처리
  - 포트폴리오 fetch/캐싱/CRUD/정산/히스토리
  - FCM 토큰 저장 및 디바이스 정보 파싱
  - 날짜/타임존 계산, 포트폴리오 정규화 등 유틸 로직
  - 라우팅/레이아웃/모달 상태 관리
- 이미 아래와 같은 훅·유틸이 존재하지만, `App.tsx`가 여전히 같은 책임을 중복 구현 중:
  - `hooks/useAuth.ts`
  - `hooks/usePortfolios.ts`
  - `hooks/useFCMToken.ts`
  - `utils/dateUtils.ts`
  - `utils/deviceInfo.ts`
  - `utils/portfolioNormalize.ts`
  - `utils/authHelpers.ts`

**지향점**:  
Google/Meta 수준의 서비스처럼, **역할이 분리되고 한 책임당 진실 소스(single source of truth)가 명확한 구조**로 만드는 것.

---

## 1단계 — 공용 유틸로 DRY 정리 (완료)

### 1.1 대상

`App.tsx` 내부에 로컬로 구현돼 있으나, 이미 공용 유틸이 존재하는 함수들:

- 날짜/타임존
  - `getDeviceTimeZone` → `utils/dateUtils.getDeviceTimeZone`
  - `getCurrentKSTDateString` → `utils/dateUtils.getCurrentKSTDateString`
- 디바이스 정보 파싱
  - `parseDeviceInfo` → `utils/deviceInfo.parseDeviceInfo`
- 포트폴리오 정규화
  - 로컬 `normalizePortfolioData` → `utils/portfolioNormalize.normalizePortfolioData`

### 1.2 조치

- `App.tsx`에서 위 함수들의 **로컬 구현 삭제**.
- 동일 이름의 유틸을 다음과 같이 import해서 사용:

```ts
import { getCurrentKSTDateString, getDeviceTimeZone } from './utils/dateUtils';
import { parseDeviceInfo } from './utils/deviceInfo';
import { normalizePortfolioData } from './utils/portfolioNormalize';
```

### 1.3 효과·리스크 분석

- **DRY**: 날짜/디바이스/포트폴리오 정규화 로직의 단일 소스 확보.
- **Dead Code**: App 내부에 사실상 “사본”이던 구현 제거.
- **기능 리스크**: 유틸 구현이 기존 로컬 버전과 동등하거나 상위호환이며, API 시그니처도 동일 → 회귀 위험 매우 낮음.
- **리렌더링**: 순수 함수 삭제 후 import 사용으로 변경 → 렌더 플로우에는 영향 없음.

---

## 2단계 — FCM 토큰 저장 로직 `useFCMToken`으로 이관 (완료)

### 2.1 대상

- `App.tsx` 내부:
  - `saveFCMTokenInProgressRef`
  - `saveFCMToken` 함수 (동적 firebase import, Notification.permission 체크, Supabase `user_devices` upsert 포함)
- 이미 존재하는 훅:
  - `hooks/useFCMToken.ts`

### 2.2 조치

- `App.tsx` 상단 import:

```ts
import { useFCMToken } from './hooks/useFCMToken';
```

- 컴포넌트 내부에서 훅 사용:

```ts
const { saveFCMToken } = useFCMToken();
```

- `App.tsx`의 로컬 구현 제거:
  - `saveFCMTokenInProgressRef` 삭제
  - `const saveFCMToken = async (userId: string) => { ... }` 삭제

- 기존 호출부는 유지:
  - 세션 복구(`checkUser`) 후 `saveFCMToken(session.user.id)`
  - `onAuthStateChange`에서 `SIGNED_IN` 시 `saveFCMToken(currentUser.id)`

### 2.3 효과·리스크 분석

- **DRY**: FCM 관련 로직(동적 firebase import, 권한 체크, 디바이스 파싱, Supabase upsert, 중복 방지 ref)을 훅 한 곳에서 관리.
- **기능 동등성**:
  - `useFCMToken`은 App 버전과 사실상 동일한 로직을 사용 (동일 모듈 import, 동일 테이블 upsert).
  - `saveFCMToken(userId)`의 시그니처와 호출 타이밍은 유지 → 동작 변경 없이 책임만 분리.
- **리렌더링**:
  - `useFCMToken` 내부에서 `useCallback`을 사용 → `saveFCMToken` 참조가 안정화.
  - App에서 FCM 로직이 빠져나가도 상태/props 흐름은 동일해, 실제 렌더 트리에는 변화 없음.
- **유지보수성**:
  - FCM 정책/테이블 스키마 변경 시 `useFCMToken`만 수정하면 전체 반영 가능.

---

## 3단계 — 인증 로직 `useAuth`로 통합 (설계, 적용 예정)

### 3.1 대상

- `App.tsx`의 인증 관련 상태/로직:
  - 상태:
    - `user`, `setUser`
    - `userProfile`, `setUserProfile` (인라인 타입)
    - `authModal`, `setAuthModal`
    - `isLoading`, `setIsLoading`
    - `authModalRef`, `justLoggedInRef`, `userIdRef`, `unhandledRejectionHandlerRef`
  - 로직:
    - 로컬 `fetchUserProfile`
    - auth 전담 `useEffect`:
      - `checkUser` (세션 복구)
      - `clearAuthState` (세션 에러 시 초기화)
      - `supabase.auth.onAuthStateChange` 리스너
      - `unhandledrejection` 핸들러 (`handleAuthError`)

- 이미 존재하는 훅:
  - `hooks/useAuth.ts`

### 3.2 조치 계획

1. **`useAuth`·`AppUserProfile` import**

```ts
import { useAuth } from './hooks/useAuth';
import type { AppUserProfile } from './types/appUserProfile';
```

2. **auth 상태를 `useAuth`로 대체**

```ts
const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
const fetchPortfoliosRef = useRef<(userId: string) => void>(() => {});
const { saveFCMToken } = useFCMToken();

const {
  user,
  setUser,
  userProfile,
  setUserProfile,
  authModal,
  setAuthModal,
  isLoading,
  fetchUserProfile,
  justLoggedInRef,
} = useAuth({
  lang,
  setPortfolios,
  saveFCMToken,
  fetchPortfoliosRef,
});
```

3. **로컬 `fetchUserProfile` 삭제**

- 동일 책임의 구현이 `useAuth` 내부에 존재하므로, App 쪽 구현은 제거.

4. **거대한 auth `useEffect` 블록 삭제**

- `App.tsx` 내 다음 책임을 가진 `useEffect` 전체 제거:
  - 첫 세션 복구(`checkUser`)
  - 세션 에러 처리 및 `clearAuthState`
  - `supabase.auth.onAuthStateChange` 이벤트 핸들링
  - `window.addEventListener('unhandledrejection', ...)`
- 해당 책임은 이미 `useAuth`의 내부 `useEffect`에서 수행:
  - `isSessionRecoverableError`를 통한 에러 판별 포함.

5. **`fetchPortfoliosRef`와 포트폴리오 로딩 함수 연결**

```ts
useEffect(() => {
  fetchPortfoliosRef.current = fetchPortfolios;
}, [fetchPortfolios]);
```

- `useAuth`는 세션 복구 시 `fetchPortfoliosRef.current(userId)`를 호출 → App의 `fetchPortfolios` 구현을 통해 실제 포트폴리오 로딩 수행.

6. **`AuthModals` 핸들러 단순화**

- `onLogin`/`onLogout`에서 세션/스토리지 정리를 직접 수행하던 코드를 최소화:
  - `onLogin`은 UI 레벨 처리(모달 전환, `justLoggedInRef` 플래그) 중심.
  - `onLogout`은 Supabase `signOut` 호출 + 페이지 리로드, 상태 정리는 `useAuth`/Supabase가 담당.

### 3.3 효과·리스크 분석

- **DRY**:
  - 세션 복구, auth 이벤트, 세션 에러 처리, clearAuthStorage를 `useAuth` 한 곳에서 관리.
  - App 내부의 중복 조건/에러 분기 제거.
- **Dead Code**:
  - 로컬 `fetchUserProfile`, auth 관련 ref/useEffect 제거로 Dead code 및 사본 코드 정리.
- **인지 복잡도**:
  - `App.tsx`에서 가장 복잡한 블록(Auth 관련 200+ 라인)이 사라져,  
    “인증 흐름”을 이해할 때 `hooks/useAuth.ts`만 보면 되도록 단순화.
- **Anti-pattern 개선**:
  - “거대 컴포넌트가 모든 글로벌 상태를 관리”하는 패턴을 줄이고,  
    React 권장 패턴인 “역할별 훅 분리” 구조에 가까워짐.
- **리스크**:
  - App와 `useAuth`의 로직이 **동시에 존재하면** 중복 실행/레이스 컨디션 위험 → 반드시 App 쪽 auth `useEffect`를 완전히 제거해야 함.
  - 변경 후 아래 시나리오 회귀 테스트 필수:
    - 새로고침 + 세션 복구
    - 로그인/로그아웃
    - 세션 만료/리프레시 토큰 에러 처리

---

## 4단계 — 포트폴리오 로직 `usePortfolios`로 통합 (차기 단계)

### 4.1 대상

`App.tsx`의 포트폴리오 관련 로직:

- 데이터 로딩/캐싱
  - `loadPortfoliosFromCache`
  - `fetchPortfoliosFromSupabase`
  - `fetchPortfolios`
- CRUD/정산/히스토리
  - `handleAddPortfolio`
  - `handleClosePortfolio`
  - `handleUpdatePortfolio`
  - `handleAddTrade` / `handleDeleteTrade`
  - `handleDeletePortfolio`
  - `handleDeleteHistory`
  - `handleClearHistory`

이미 존재하는 훅:

- `hooks/usePortfolios.ts`

### 4.2 조치 계획

1. **`usePortfolios` import + 호출**

```ts
import { usePortfolios } from './hooks/usePortfolios';

const {
  portfolios,
  setPortfolios,
  fetchPortfolios,
  loadPortfoliosFromCache,
  handleAddPortfolio,
  handleClosePortfolio,
  handleUpdatePortfolio,
  handleAddTrade,
  handleDeleteTrade,
  handleDeletePortfolio,
  handleDeleteHistory,
  handleClearHistory,
} = usePortfolios({
  lang,
  userId: user?.id ?? null,
  userProfile,
  portfolios,
  setPortfolios,
});
```

2. **App 내부 포트폴리오 관련 함수 삭제**

- 위 책임을 수행하던 `App.tsx` 로컬 함수들을 순차적으로 제거하고, JSX에 넘기는 핸들러를 `usePortfolios` 버전으로 교체.

3. **정산(termination) 플로우 연결**

- `usePortfolios.handleClosePortfolio`는 `SettlementResult | null`을 반환하므로, App에서는:

```ts
onSave={async (finalSells, additionalFee) => {
  const result = await handleClosePortfolio(currentTerminatePortfolio.id, finalSells, additionalFee);
  if (result) {
    setSettlementResult(result);
    setTerminateTargetId(null);
  }
}}
```

### 4.3 효과·리스크 분석

- **DRY**: 포트폴리오 도메인 로직이 `usePortfolios` 하나에 집중.
- **인지 복잡도**: App는 포트폴리오 상태/핸들러 wiring만 담당하는 얇은 레이어로 단순화.
- **리스크**:
  - 포트폴리오 CRUD/정산/히스토리는 비즈니스 핵심이므로, 변경 후 플로우 전반 회귀 테스트 필수.

---

## 5단계 — 콜백/타입/`as any` 정리 & Dead Code 스윕 (마무리 단계)

### 5.1 콜백 정리

- `Dashboard`/`History`/각 모달에 전달되는 인라인 콜백을 `useCallback`으로 래핑:
  - `onOpenCreator`, `onOpenAlarm`, `onOpenDetails`, `onOpenQuickInput`, `onOpenExecution`, `onOpenAIImage` 등.
- **효과**:
  - prop reference 안정화 → `React.memo`된 자식 컴포넌트의 불필요 리렌더 감소.

### 5.2 타입·`as any` 정리

- `userProfile` 타입을 전부 `AppUserProfile`로 통일.
- Supabase `upsert`의 `onConflict` 옵션 등 불가피한 `as any`는:
  - 별도 유틸/래퍼 함수(예: `upsertDailyExecutionSummary`) 안에 캡슐화해,  
    App 레벨에서는 타입 단언을 보지 않도록 정리.

### 5.3 Dead Code & Unused 스윕

- 위 단계들 완료 후 ESLint (`no-unused-vars`, `@typescript-eslint/no-unused-vars`)를  
  `App.tsx`·`hooks`·`utils` 위주로 실행:
  - 미사용 import/변수/함수/타입 제거.
  - 더 이상 쓰이지 않는 테스트용 코드/주석 정리.

---

## 6. 회귀 테스트 체크리스트

각 단계 이후 최소한 아래 시나리오를 검증:

- **새로고침 후 세션 복구**
  - 세션 있는 유저: `Dashboard`/`Markets`/`History` 데이터 정상 로딩.
  - 세션 없는 유저: `Landing` 노출 + 로그인 플로우 정상 동작.
- **로그인/로그아웃**
  - 로그인 후 포트폴리오/프로필/FCM 토큰 저장 정상 작동.
  - 로그아웃 후 상태 초기화 + 재로그인 시 이상 없음.
- **전략 플로우**
  - 포트폴리오 생성/수정/삭제.
  - 전략 종료(정산) → 히스토리 저장 → 상세 모달.
  - 히스토리 삭제/전체 삭제.
- **모달/탭**
  - Dashboard/Markets/History/Pricing/Privacy/Terms lazy 로딩 및 전환.
  - `StrategyCreator` / `AIImageInputModal` / `CheckoutModal` / `AlarmModal` / `PortfolioDetailsModal` / `QuickInputModal` lazy 로딩 및 열기/닫기.

이 문서는 `App.tsx` 구조 리팩토링의 **장기 로드맵 및 단계별 가이드**로 사용하며,  
