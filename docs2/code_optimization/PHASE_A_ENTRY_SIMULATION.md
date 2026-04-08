# Phase A Entry Simulation

> 대상 파일: `App.tsx`, `index.tsx`  
> 제약: **원본 파일은 직접 수정하지 않음**. 이 문서는 Phase A 드라이런용 시뮬레이션 문서입니다.

## 0. 외부 리뷰 반영 메모

아래는 Google 스타일 리뷰 3건에 대한 **합의 여부**와, 본 문서 스니펫을 어떻게 고쳤는지 요약입니다.

| # | 리뷰 요지 | 합의 | 본 문서 조치 |
|---|-----------|------|--------------|
| 1 | `useMemo` + 거대 `renderTabContent` 조합은 안티패턴 | **부분 동의 → 구조는 동의** | `useMemo`로 팩토리 함수를 감싸는 패턴을 폐기하고, **`React.memo`로 감싼 `<TabContent />` 컴포넌트**로 교체했습니다. 참고: `useMemo`가 곧바로 “Fiber/Reconciliation 무시”는 아니지만, 팀 규칙(무분별한 `useMemo` 금지, DevTools 추적·하위 훅 확장) 관점에서는 정식 컴포넌트가 더 낫습니다. |
| 2 | 로컬 `ENTRY_*` 다국어 객체는 I18N SSOT 위반 | **전면 동의** | 스니펫의 로컬 딕셔너리를 제거하고, **`@/constants/appShellMessages.ts`에서만 import**하는 형태로 통일했습니다. (진입점·앱 셸 문구 SSOT는 **본 파일 신설·단일 관리**로 확정.) |
| 3 | props 폭발 + 비안정 콜백 | **동의** | 부모(`App`)에서는 탭에 넘기는 핸들러를 **`useCallback`으로 고정**하는 예시를 추가했습니다. 자식(`TabContent`) 내부에서는 `Pricing`의 `onUpgrade` 등을 **`useCallback`으로 한 번 더 고정**해, 같은 렌더에서 새 함수 참조가 남지 않게 했습니다. |

**확정(팀):** 진입점(App Shell) 전용 문구의 I18N SSOT는 **`constants/appShellMessages.ts` 신설·전용 관리(1안)** 로 고정합니다. `constants.tsx`의 `I18N`은 기존 네비·대시보드 등과 같이 유지하되, **셸 전용 키는 `appShellMessages`에만 추가**합니다.

### 0.1 추가 코드 리뷰 반영 (Exhaustive switch / useMemo / 매직 넘버)

| # | 지적 | 합의 | 문서 반영 |
|---|------|------|-----------|
| 1 | `TabContent`의 `default: return null` → union 누락 시 컴파일 미검출 + WSOD | **동의** | `default`에 **`never` exhaustive 변수** + **`<SuspenseFallback message={copy.loadingGeneric} />`**(동등 범용 폴백 UI) 반환(§3.3). |
| 2 | `Suspense` fallback 3곳에 무분별 `useMemo` | **동의** | 무분별 `useMemo` 제거. 이어서 **상단에서 fallback을 3개 미리 만들거나 팩토리를 매 렌더 3회 호출하는 패턴도 지양**하고, **`React.memo`인 `SuspenseFallback`** 을 두어 **각 `case`의 `Suspense` 안에서만** 선언(§3.3, §0.4). |
| 3 | `HeaderBrandButton`의 `size={11}`, `marginTop: 2` 매직 넘버 | **동의** | `TIER_ICON_SIZE_PX` 상수 + **`mt-[2px]`** 로 정리(§3.2). |
| 4 | `style={{ marginTop: 2 }}` 인라인 객체 | **동의** | Tailwind 클래스로 대체(§3.2). |

**확정(TS vs 런타임):** 빌드 단계에서 `never` 좁히기·exhaustive 관련 **TS/ESLint 엣지 케이스**는 리팩터·규칙으로 해결한다. **런타임에서는 무조건** `TabContent` 등 탭 라우팅의 `default`에서 **범용 폴백 UI**(§3.3의 **`SuspenseFallback` + `copy.loadingGeneric`** 등과 동등)를 렌더링한다 — 앱 정지·**WSOD·빈 메인 금지**. `default: return assertNever(activeTab)` 처럼 **사용자 경로에서 throw 되는 패턴은 쓰지 않는다.**

### 0.2 추가 코드 리뷰 (React.memo·토스트·의존성·import.meta)

| # | 지적 | 합의 | 문서 반영 |
|---|------|------|-----------|
| 1 | `TabContent`에 배열 props를 매 렌더 새 참조로 넘기면 `React.memo` 무력화 + 얕은 비교 비용만 증가 | **동의** | §3.3 파일 B에 **경고 블록** 추가. 부모에서 `activePortfolios` / `portfolios` / `closedPortfolios` 는 **`useMemo`로 참조 안정화**할 것을 계획서·스니펫에 명시. |
| 2 | 일일 요약 저장 실패 시 `console.warn` 만 → silent failure | **동의** | §3.5 After에 **`showErrorToast`** + **`APP_SHELL_MESSAGES` 문구** 반영. |
| 3 | `handlePricingUpgrade` 의존 배열에 객체 `user` 전체 | **동의** | 로그인 판별을 **`user?.id`** 기준으로 바꾸고 의존 배열은 **`[user?.id, …]`** (§3.3·§3.3.1). |
| 4 | `import.meta.env.DEV` 직접 접근 | **동의** | §3.1 After에서 **`import.meta.env?.DEV ?? false`** 로 수정. **`import.meta?.env` 금지**(메타 속성에 대한 `?.` 는 TS1303 유발 가능, §0.6). |

### 0.3 추가 코드 리뷰 (Mutex·확정 스니펫·Promise.resolve)

| # | 지적 | 합의 | 문서 반영 |
|---|------|------|-----------|
| 1 | `handleUpdatePortfolioForDashboard` 에 동기식 mutex 없음 → 더블 클릭·repaint gap 중복 Mutation | **동의** | §3.3 파일 B에 **`isUpdatingPortfolioRef` + guard + `finally` 해제** 추가. |
| 2 | 배열 `useMemo` 를 주석으로만 안내 — 스니펫이 “예상” 수준 | **동의** | 파일 B에 **`activePortfolios` / `closedPortfolios` 의 `useMemo` 확정 구현** + 실제 파일 통합 시 **중복 제거** 주석. |
| 3 | 브릿지/외부 모듈 가능 경로에 `await` 만 사용 | **동의** | **`await Promise.resolve(handleUpdatePortfolio(portfolio))`** 로 래핑(§3.3 파일 B). |

### 0.4 추가 코드 리뷰 (회귀 방지: null 방어·Suspense fallback·`useCallback` deps)

| # | 지적 | 합의 | 문서 반영 |
|---|------|------|-----------|
| 1 | 일일 요약 `useEffect`에서 `summaryToSave.trim()` 만 사용 → `null`/`undefined` 시 TypeError | **동의** | §3.5 After에 **`if (!summaryToSave \|\| summaryToSave.trim().length === 0) return;`** 복구. |
| 2 | `TabContent`에서 실행 분기와 무관하게 매 렌더 fallback 엘리먼트 3개 생성(또는 팩토리 3회 호출) | **동의** | **`SuspenseFallback = React.memo(...)`** + 각 `case`의 `Suspense`에서만 **`<SuspenseFallback message={...} />`** (§3.3 파일 A). |
| 3 | `handleOpenQuickInput`·`handleBackToDashboard`의 `useCallback` 의존 배열에 setter·`setActiveTab` 누락 | **동의** | 파일 B 스니펫을 **`[setQuickInputTargetId, setQuickInputActiveSection]`** / **`[handleRequestBackNavigation, setActiveTab, replaceHashIfMatched]`** 로 수정(§3.3); **`exhaustive-deps`는 `eslint-disable` 없이 린트가 요구하는 참조 전부 명시**(§3.3 파일 B 인용 블록). |

### 0.5 추가 코드 리뷰 (파괴적 Mutation mutex·브라우저 타이머 통일)

| # | 지적 | 합의 | 문서 반영 |
|---|------|------|-----------|
| 1 | 계획서·스니펫이 `onUpdatePortfolio` 만 mutex로 두고 `deletePortfolioById` 등 파괴적 Mutation 은 pass-through — *「동일 패턴 검토」* 는 Lazy Planning | **동의** | 초기 반영: 도메인별 ref. **후속(§0.7):** **`useMutexAction`** 으로 DRY 통일(§3.3.2·§3.3 파일 B). 계획서 Phase A 표 **Mutex** 행 참고. |
| 2 | §3.5 일일 요약 effect 가 `setTimeout`/`clearTimeout` 만 사용 → `@types/node` 와 타입 충돌 위험, §3.4 `NavIcon` 과 불일치 | **동의** | §3.5 After 에 **`window.setTimeout` / `window.clearTimeout`** + **`dailyExecutionDebounceRef` = `useRef<number \| null>(null)`** + 설명 블록. |

### 0.6 추가 코드 리뷰 (`import.meta` 문법·훅 deps 일관성·불필요한 `??`)

| # | 지적 | 합의 | 문서 반영 |
|---|------|------|-----------|
| 1 | `import.meta?.env?.DEV` → 메타 속성에 `?.` 조합 시 **TS1303** 등 파싱 실패 | **동의** | §3.1 After 및 참고 주석을 **`import.meta.env?.DEV ?? false`** 로 통일(§0.2·§1.1·계획서). |
| 2 | `handleOpenLogin`/`Signup`·`handleNavigateDashboard`·`showDisabledTooltip` 에서 팀 규칙과 달리 setter deps 누락 | **동의** | §3.2·§3.3 파일 B·§3.4 After 에 **`[setAuthModal]`**, **`[setActiveTab]`**, **`[clearTooltipTimer, tooltip, setIsTooltipVisible]`** 반영. |
| 3 | `lang: 'ko' \| 'en'` 이고 `APP_SHELL_MESSAGES` 가 동일 키를 갖는데 `?? APP_SHELL_MESSAGES.ko` 는 도달 불가 | **동의** | §3.2·§3.3 파일 A·B·§3.5 에서 **`APP_SHELL_MESSAGES[lang]`** 만 사용(불필요한 `??` 제거). |

### 0.7 추가 코드 리뷰 (TS2531·`useMutexAction` DRY)

| # | 지적 | 합의 | 문서 반영 |
|---|------|------|-----------|
| 1 | 일일 요약 effect 의 `setTimeout` 콜백 안에서 `user.id` → 비동기 클로저에서 **TS2531** | **동의** | §3.5 After 에 **`const currentUserId = user?.id`** 캡처 후 **`userId: currentUserId`** 만 사용. |
| 2 | Mutation 마다 동일 mutex 보일러플레이트 복붙 → DRY·유지보수성 저하 | **동의** | **`hooks/useMutexAction.ts`** 신설(§3.3.2) + §3.3 파일 B 에서 **`useMutexAction(useCallback(...))`** 로 통일(§0.5 표 1행은 후속 §0.7으로 대체·보강). |

### 0.8 A3 포트폴리오 폼·훅 계약 (팀 확정 — Option B)

진입점(`App.tsx`)은 `StrategyCreator`의 `onSave` → `handleAddPortfolio` 등 **포트폴리오 뮤테이션**을 연결한다. 아래는 **`docs2/PHASE_A_CONSTANTS_SIMULATION.md` §0.1** 및 **`docs2/PRE_RELEASE_CODE_OPTIMIZATION_MASTER_PLAN.md`** 의 **「확정(비가역) — A3 포트폴리오 설정 폼 검증 파이프라인 (Option B·Rule 1·6·SRP)」** 과 **동일한 팀 합의**를 본 문서에도 명시한다.

1. **Option B (데이터 구조):** UI(`StrategyCreator`, 향후 `PortfolioEditModal` 등)에서 **`trim`·`roundMoney` 등 선제 정제** → **평면 DTO** → **`validatePortfolioSetupInput(dto, copy)`** → 통과 시 **동일 필드로만** `Portfolio` 객체를 조립 → **`usePortfolios`** 로 전달. **`hooks/usePortfolios.ts` 내부의 폼형 인라인 검증**(이름·일매수·수수료·시작일 등)은 **제거**하고, 훅은 **통신·세션·한도** 중심(SRP)만 담당한다.
2. **에러 반환 (폼 검증 표준):** **`validatePortfolioSetupInput`** 은 **`string | null`만 반환**하고, 주입된 **`copy`**(`CommonMessageSet` 등)로만 사용자 문구를 고른다 — **폼 검증 경로에서 `throw` 금지**. DB·네트워크·권한 실패는 **`createPortfolioMutationError` + `getPortfolioMutationNotice`** 등 **뮤테이션 레이어**에서 기존 패턴을 유지한다.
3. **Rule 1 & Rule 6 (페이로드 무결 일치):** 검증기에 넣은 **`trimmedName`**, **`normalizedFeeRate`** 등 **정제 완료 값**은 DB에 쓰이는 값과 **100% 동일**해야 한다. 검증 후 **재-trim·재-round·암묵적 보정**으로 저장 값이 달라지는 경로를 금지한다. 생성·수정·모달 등 **데이터가 들어오는 모든 입구**는 동일 파이프라인을 따른다.

**스니펫·상수·마이그레이션 순서 SSOT:** `docs2/PHASE_A_CONSTANTS_SIMULATION.md` §2.1·§2.1.1·§3.3·§3.6. **진입점 관점:** `App.tsx`는 정제/검증 로직을 불필요하게 늘리지 않고, 자식이 **이미 무결한 계약**으로 넘긴 `Portfolio`를 훅에 **배선**하는 역할을 유지한다(검증 책임은 **폼 컴포넌트 + 도메인 순수 함수**).

## 1. 진입점 분석 (Analysis)

### 1.1 `App.tsx`

| 분류 | 진단 | 판단 |
|------|------|------|
| A1 데드 코드 | `calculateTotalInvested` import는 현재 파일에서 사용되지 않습니다. | 제거 후보 확정 |
| A1 데드 코드 | `handleRequestBackNavigation()` 내부의 `const labels = TDS_DIALOG_MESSAGES[lang]?.actions;` 는 null 체크 외 실사용이 없습니다. | 제거 후보 확정 |
| A1 데드 코드 | `TDSWrapper` 는 현재 `children`만 그대로 반환하고, `isInTossApp` prop도 사용하지 않습니다. | 제거 또는 실제 역할 부여 후보 |
| A1 구조 중복 | `Footer` 의 `terms` / `privacy` / `refundPolicy` 해시 이동 로직이 반복됩니다. | 공통 helper 추출 후보 |
| A1 구조 중복 | `currentTier === 'premium' || currentTier === 'pro' ? ... : 'free'` 패턴이 여러 번 반복됩니다. | tier resolver helper 추출 후보 |
| A2 타입 엄격화 | `supabase.from(...).upsert(..., { onConflict: 'user_id,summary_date' } as any)` 에 `as any`가 남아 있습니다. | 즉시 제거 대상 |
| A2 타입 안정성 | `const t = I18N[lang];` 는 현재 union 타입상 안전하지만, 딕셔너리 누락 시 런타임 fallback이 없습니다. | `I18N[lang] ?? I18N.ko` 권장 |
| A2 타입 안정성 | `process as { env?: { API_KEY?: string } }` 형태의 임시 캐스트는 브라우저 엔트리에서 의도가 불명확합니다. | env helper 또는 명시 타입으로 정리 권장 |
| A3 하드코딩 문자열 | 로딩 문구, `BUY THE DIP`, `게시판`, 백테스트 준비중 tooltip, 로그 메시지 일부가 파일 내부에 하드코딩되어 있습니다. | 상수/I18N 추출 대상 |
| A3 매직 넘버 | `3000`, `9 * 60 * 60 * 1000`, `24 * 60 * 60 * 1000`, `220`, `11`, `14`, `22` 등이 문맥 없이 흩어져 있습니다. | 최상단 상수 추출 권장 |
| A2·A6 | `TabContent` `switch (activeTab)` 의 `default: return null` 은 union 케이스 누락 시 컴파일 경고가 약하고, 비정상 탭 시 WSOD 유발 | **`never` exhaustive + 폴백 UI** 로 교체 |
| A2 Rule 2 | `Suspense` fallback용 단순 JSX를 `useMemo`로 감싼 패턴 | **제거** — **`React.memo`인 `SuspenseFallback`** + **각 `case` 내부에서만** 선언(§0.4·§3.3). 상단에서 분기 무관 fallback 3개 생성·팩토리 3회 호출 지양 |
| A3·A6 | 헤더 브랜드의 `TierIcon size={11}`, `style={{ marginTop: 2 }}` | **상수화 + Tailwind `mt-[2px]`** |
| A6·A11 | 일일 요약 upsert 실패 시 콘솔만 | **`showErrorToast` + `appShellMessages`** |
| Rule 10 | `React.memo(TabContent)` + 부모가 매번 새 배열 참조 전달 | 부모에서 **`useMemo`로 배열 참조 고정** (§3.3 파일 B) |
| Rule 10 | `useCallback` deps에 `user` 객체 | **`user?.id` 등 원시값** 우선 (§3.3) |
| Rule 6·7 | `index.tsx` `import.meta` | **`import.meta.env?.DEV ?? false`** — `import.meta?.env` 금지(§3.1·§0.6) |
| Rule 11 | `TabContent` 로 이어지는 `onUpdatePortfolio` 래퍼에 mutex·`Promise.resolve` 없음 | **§3.3 파일 B** + **`useMutexAction`**(§3.3.2); 액션 내부 **`Promise.resolve(handleUpdatePortfolio(...))`** |
| Rule 11 | `onDeletePortfolio` / `onDeleteHistory` / `onClearHistory` 가 raw 함수로 pass-through → 파괴적 Mutation 더블 제출 | **§3.3 파일 B** 에 **`useMutexAction` 래핑** + 실패 시 **`showErrorToast` + SSOT 키**(§0.5·§0.7·§3.6) |
| Rule 7 | 일일 요약 effect 가 네이키드 `setTimeout`/`clearTimeout` → Node·브라우저 타입 혼선 가능 | **§3.5 After** 에서 **`window.setTimeout` / `window.clearTimeout`** + **`useRef<number \| null>`** (§3.4 `NavIcon` 과 정렬) |
| Rule 7 | 일일 요약 `setTimeout` 콜백에서 `user.id` 직접 참조 | **`currentUserId` 원시 캡처**로 **TS2531** 방지(§3.5·§0.7) |
| A4 A11y | 헤더 로고 컨테이너가 클릭 가능한 `div`인데 `role`, `tabIndex`, `onKeyDown`, `aria-label` 이 없습니다. | 즉시 수정 필요 |
| A4 A11y | 언어 전환 버튼, 다크모드 버튼, 프로필 버튼에 명시적 `aria-label` 이 없습니다. | 수정 필요 |
| A4 A11y | `NavIcon` 버튼은 `aria-disabled`만 있고 `aria-current`, keyboard 설명, tooltip 연결(`aria-describedby`)이 없습니다. | 개선 필요 |
| A4 JSX 안티패턴 | `tabContentNode` 내부의 큰 `switch`에 인라인 콜백과 인라인 fallback JSX가 많아 진입점 복잡도가 높습니다. | **`React.memo`인 `<TabContent />`로 분리** + 부모는 안정 콜백(`useCallback`) 권장 |
| A4 JSX 안티패턴 | JSX 내부 즉시실행함수(IIFE)로 `TdsConfirmDialog`, `TdsAlertDialog` 를 렌더링합니다. | guard helper/component 분리 권장 |

#### `App.tsx` 추가 메모

- 현재 파일은 기능적으로는 동작 가능해 보이지만, **엔트리 파일 하나가 너무 많은 책임**을 가지고 있습니다.
- Phase A에서는 아키텍처를 크게 갈아엎기보다, 아래 순서로 **저위험 정리**만 하는 것이 안전합니다.
  1. 미사용 import / 변수 제거
  2. `any` 제거
  3. 하드코딩 문구와 매직 넘버 상수화
  4. a11y와 JSX 안티패턴 완화

### 1.2 `index.tsx`

| 분류 | 진단 | 판단 |
|------|------|------|
| A1 데드 코드 | 명확한 미사용 import는 보이지 않습니다. 다만 `React` 기본 import는 JSX 설정에 따라 불필요할 수 있으므로 tsconfig 확인 후 판단해야 합니다. | 조건부 점검 |
| A1 구조 정리 | `import.meta.env.DEV ? <Route ... /> : null` 형태의 인라인 조건 라우트는 간단하지만, 엔트리에서 라우트 정의를 읽기 어렵게 만듭니다. | route config/helper 분리 권장 |
| Rule 6·7 | `import.meta` 사용 | **`import.meta.env?.DEV ?? false`** (§3.1). **`import.meta?.env` 문법 오류 가능** |
| A2 타입 엄격화 | `document.getElementById('root')` 이후 즉시 throw 하는 구조는 괜찮지만, root id가 문자열 literal로 고정되어 있습니다. | 상수 추출 권장 |
| A3 하드코딩 문자열 | `"Could not find root element"` 가 하드코딩되어 있습니다. | 상수 추출 대상 |
| A3 하드코딩 경로 | `"/__debug/tds-dialog"`, `"/posts"`, `"/posts/:id"`, `"/markets"`, `"*"` 가 파일 내부 literal입니다. | route path 상수화 권장 |
| A4 A11y | 직접 UI를 렌더링하는 파일이 아니라 명시적 a11y 누락은 없습니다. | 해당 없음 |
| A4 구조 단순화 | `BrowserRouter` 안의 fragment는 없어도 동작합니다. | 정리 가능 |

#### `index.tsx` 추가 메모

- 이 파일은 규모가 작아서 **기능 변화 없는 선언형 정리**가 핵심입니다.
- 즉, Phase A에서는 라우팅 구조를 갈아엎지 말고, **상수 추출 + 조건부 route 분리 + bootstrap helper 도입** 정도면 충분합니다.

---

## 2. Phase A 액션 플랜 (Action Plan)

### A1. 데드 코드 제거

1. `App.tsx` 에서 미사용 import `calculateTotalInvested` 제거
2. `handleRequestBackNavigation()` 내부 미사용 변수 `labels` 제거
3. `TDSWrapper` 가 계속 pass-through 라면 제거하고 provider 트리를 직접 반환
4. `Footer` 해시 이동 로직은 `navigateToHashTab(tab, hash)` 같은 helper로 통합
5. 반복되는 tier narrowing (`pro` / `premium` / `free`)은 `resolvePaidTier()` helper로 단일화

### A2. 타입 엄격화

1. `as any` 제거
   - `upsert` payload 타입을 local type 또는 `satisfies`로 고정
   - `onConflict` 문자열도 상수로 추출
2. `const t = I18N[lang] ?? I18N.ko` 로 fallback 보강
3. `process as { env?: { API_KEY?: string } }` 캐스트는 `getGeminiApiKeyFallback(): string | undefined` helper로 감싸기
4. 라우트/탭 관련 helper는 `ActiveTab` union을 그대로 받아서 `undefined` 참조를 줄이기

### A3. 상수 / I18N 추출

1. 엔트리 전용 문구를 SSOT로 추출 (**확정:** `constants/appShellMessages.ts`만 사용)
   - 로딩 문구
   - 브랜드 표시 문구·헤더 `aria-label`
   - 게시판 라벨
   - 백테스트 준비중 tooltip
   - root element 에러 메시지
   - 일일 요약 저장 실패·네트워크 오류 토스트 문구(`dailySummarySaveErrorPrefix`, `dailySummaryNetworkError`)
2. 엔트리 전용 매직 넘버를 상수화
   - 일일 요약 debounce 시간
   - KST 오프셋
   - 하루 밀리초
   - tooltip 표시 시간
   - tooltip 최소 폭
3. 라우트 path와 hash도 상수화
4. **포트폴리오 생성·수정 파이프라인:** `StrategyCreator` → `onSave` → `handleAddPortfolio` / `handleUpdatePortfolio` 경로는 **§0.8 Option B** 계약을 따른다(정제·평면 DTO·`validatePortfolioSetupInput`·페이로드 일치·훅은 통신만). 상세 스니펫·체크리스트·`usePortfolios` 검증 제거 순서는 **`docs2/PHASE_A_CONSTANTS_SIMULATION.md` §0.1·§2.1.1·§4** 를 SSOT로 한다.

### A4. UI / A11y 안티패턴 제거

1. 클릭 가능한 헤더 로고 `div`를 `button`으로 교체하거나, 최소한 `role="button"`, `tabIndex={0}`, `onKeyDown`, `aria-label` 추가
2. 언어 버튼 / 테마 버튼 / 프로필 버튼에 `aria-label` 추가
3. `NavIcon` 에 `aria-current`, `aria-label`, tooltip 연결 속성 추가
4. 큰 `tabContentNode` 블록은 **`React.memo` 컴포넌트(`TabContent`)로 분리**하고, 부모에서는 **`useCallback`으로 콜백 참조 안정화** + **`useMemo`로 `activePortfolios`·`closedPortfolios` 등 파생 배열 참조 고정**(`React.memo` 무력화 방지)
5. `TabContent` 내부 `useCallback` 의존 배열에는 **`user` 객체 대신 `user?.id` 등 원시값** 우선
6. 사용자 영향 비동기 실패(일일 요약 upsert 등)는 **`console.warn` 만으로 끝내지 말고 `showErrorToast` + `appShellMessages`**
7. `TabContent` 로 전달하는 **포트폴리오·파괴적 Mutation 래퍼**에는 **`useMutexAction`**(§3.3.2)으로 1-tick 중복 차단을 DRY하게 적용하고, 업데이트 경로 액션 내부에는 **`await Promise.resolve(handleUpdatePortfolio(...))`** 를 유지(§3.3 파일 B·§0.7)
8. JSX IIFE는 `renderNavigationExitDialog()`, `renderPortfolioLimitDialog()` 같은 helper로 분리

---

## 3. 시뮬레이션용 코드 스니펫 (Before & After)

아래 스니펫은 **원본 전체 파일을 직접 덮어쓰라는 뜻이 아니라**, 실제 수정 전에 빌드 검증용으로 드라이런 복사 테스트를 할 수 있게 만든 완성형 문맥 예시입니다.

### 3.1 `index.tsx` 전체 파일 시뮬레이션

#### ❌ Before

```tsx
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import { PostsListPage } from './features/board/PostsListPage';
import { PostDetailPage } from './features/board/PostDetailPage';
import { TdsDialogDebugHarness } from './components/tds-adapter/TdsDialogDebugHarness';
import TdsErrorToastHost from './components/tds-adapter/TdsErrorToastHost';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <>
        <Routes>
          {import.meta.env.DEV ? (
            <Route path="/__debug/tds-dialog" element={<TdsDialogDebugHarness />} />
          ) : null}
          <Route path="/posts" element={<PostsListPage />} />
          <Route path="/posts/:id" element={<PostDetailPage />} />
          <Route path="/markets" element={<App />} />
          <Route path="*" element={<App />} />
        </Routes>
        <TdsErrorToastHost />
      </>
    </BrowserRouter>
  </React.StrictMode>
);
```

#### ✅ After

```tsx
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import App from './App';
import { PostsListPage } from './features/board/PostsListPage';
import { PostDetailPage } from './features/board/PostDetailPage';
import { TdsDialogDebugHarness } from './components/tds-adapter/TdsDialogDebugHarness';
import TdsErrorToastHost from './components/tds-adapter/TdsErrorToastHost';

const ROOT_ELEMENT_ID = 'root';
const ROOT_ELEMENT_MISSING_ERROR = 'Could not find root element';

const ROUTE_PATHS = {
  debugTdsDialog: '/__debug/tds-dialog',
  postsList: '/posts',
  postDetail: '/posts/:id',
  markets: '/markets',
  appFallback: '*',
} as const;

function getRootElement(): HTMLElement {
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (rootElement == null) {
    throw new Error(ROOT_ELEMENT_MISSING_ERROR);
  }
  return rootElement;
}

function AppRoutes(): React.ReactElement {
  const isDev = import.meta.env?.DEV ?? false;

  return (
    <Routes>
      {isDev && (
        <Route
          path={ROUTE_PATHS.debugTdsDialog}
          element={<TdsDialogDebugHarness />}
        />
      )}
      <Route path={ROUTE_PATHS.postsList} element={<PostsListPage />} />
      <Route path={ROUTE_PATHS.postDetail} element={<PostDetailPage />} />
      <Route path={ROUTE_PATHS.markets} element={<App />} />
      <Route path={ROUTE_PATHS.appFallback} element={<App />} />
    </Routes>
  );
}

const root = ReactDOM.createRoot(getRootElement());

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AppRoutes />
      <TdsErrorToastHost />
    </BrowserRouter>
  </React.StrictMode>,
);
```

> **TS/파서 (Rule 7):** `import.meta`는 **메타 속성**이라 **`import.meta?.env` 처럼 `import.meta` 자체에 `?.` 를 붙이면 TS1303 등 문법 오류**가 날 수 있습니다. **`import.meta.env?.DEV ?? false`** 처럼 **`.env` 뒤에서만** optional chaining·nullish를 씁니다.

### 3.2 `App.tsx` 헤더 로고 진입 버튼 시뮬레이션

#### ❌ Before

```tsx
const MainContent = () => (
  <div className="min-h-screen transition-colors duration-500 bg-slate-50 dark:bg-slate-950 dark:text-slate-200">
    <div className="pb-32">
      <header className="sticky top-0 z-40 w-full glass glass-header px-6 md:px-12 py-5 flex items-center justify-between border-b border-slate-200/50 dark:border-white/10">
        <div
          className="flex items-center gap-4 cursor-pointer group"
          onClick={() => setActiveTab('dashboard')}
        >
          <div className="w-11 h-11 relative flex items-center justify-center group-hover:scale-110 transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-indigo-600 to-purple-500 rounded-xl shadow-lg shadow-blue-500/20 transform -rotate-3 group-hover:rotate-0 transition-transform" />
            <div className="relative z-10 text-white font-black text-xl flex items-baseline select-none">
              <span className="tracking-tighter">B</span>
              <span className="text-blue-300 -ml-1.5 opacity-90 transform translate-y-0.5">D</span>
            </div>
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-black tracking-tight dark:text-white uppercase leading-none mb-1">
              BUY THE DIP
            </h1>
            <div style={{ marginTop: 2 }}>
              <span className={tierClassName}>
                <TierIcon
                  size={11}
                  className={tierIconClassName}
                  {...(currentTier === 'pro'
                    ? { fill: 'currentColor', stroke: 'currentColor' }
                    : {})}
                />
                {tierLabel}
              </span>
            </div>
          </div>
        </div>
      </header>
    </div>
  </div>
);
```

#### ✅ After

> **SSOT:** 사용자 노출 문자열은 `@/constants/appShellMessages.ts`에서만 정의하고 import 합니다. 아래 `APP_SHELL_MESSAGES` 스키마는 §3.6 예시 파일을 참고하세요.

```tsx
import { APP_SHELL_MESSAGES } from '@/constants/appShellMessages';

const TIER_ICON_SIZE_PX = 11;

const PRO_TIER_ICON_PROPS = {
  fill: 'currentColor',
  stroke: 'currentColor',
} as const;

interface HeaderBrandButtonProps {
  currentTier: string;
  lang: 'ko' | 'en';
  tierClassName: string;
  tierIconClassName: string;
  tierLabel: string;
  TierIcon: React.ComponentType<{
    size?: number;
    className?: string;
    fill?: string;
    stroke?: string;
  }>;
  onNavigateDashboard: () => void;
}

function HeaderBrandButton({
  currentTier,
  lang,
  tierClassName,
  tierIconClassName,
  tierLabel,
  TierIcon,
  onNavigateDashboard,
}: HeaderBrandButtonProps): React.ReactElement {
  const copy = APP_SHELL_MESSAGES[lang];
  const tierIconProps =
    currentTier === 'pro' ? PRO_TIER_ICON_PROPS : undefined;

  return (
    <button
      type="button"
      onClick={onNavigateDashboard}
      aria-label={copy.entryGoToDashboardAria}
      className="flex items-center gap-4 group"
    >
      <div className="w-11 h-11 relative flex items-center justify-center group-hover:scale-110 transition-all duration-300">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-indigo-600 to-purple-500 rounded-xl shadow-lg shadow-blue-500/20 transform -rotate-3 group-hover:rotate-0 transition-transform" />
        <div className="relative z-10 text-white font-black text-xl flex items-baseline select-none">
          <span className="tracking-tighter">B</span>
          <span className="text-blue-300 -ml-1.5 opacity-90 translate-y-0.5">
            D
          </span>
        </div>
      </div>
      <div className="hidden sm:block text-left">
        <h1 className="text-lg font-black tracking-tight dark:text-white uppercase leading-none mb-1">
          {copy.entryAppName}
        </h1>
        <div className="mt-[2px]">
          <span className={tierClassName}>
            <TierIcon
              size={TIER_ICON_SIZE_PX}
              className={tierIconClassName}
              {...tierIconProps}
            />
            {tierLabel}
          </span>
        </div>
      </div>
    </button>
  );
}

const MainContent = () => (
  <div className="min-h-screen transition-colors duration-500 bg-slate-50 dark:bg-slate-950 dark:text-slate-200">
    <div className="pb-32">
      <header className="sticky top-0 z-40 w-full glass glass-header px-6 md:px-12 py-5 flex items-center justify-between border-b border-slate-200/50 dark:border-white/10">
        <HeaderBrandButton
          currentTier={currentTier}
          lang={lang}
          tierClassName={tierClassName}
          tierIconClassName={tierIconClassName}
          tierLabel={tierLabel}
          TierIcon={TierIcon}
          onNavigateDashboard={handleNavigateDashboard}
        />
      </header>
    </div>
  </div>
);
```

`App` 컴포넌트 내부(부모)에서는 **`onNavigateDashboard={() => setActiveTab('dashboard')}` 대신** 아래처럼 고정합니다.

```tsx
const handleNavigateDashboard = useCallback(() => {
  setActiveTab('dashboard');
}, [setActiveTab]);
```

### 3.3 `App.tsx` 탭 콘텐츠 렌더링 블록 시뮬레이션

#### ❌ Before

```tsx
const tabContentNode = useMemo((): React.ReactNode => {
  const dashboardFallback = <div className="flex items-center justify-center min-h-[50vh] text-slate-500 dark:text-slate-400 font-bold">{lang === 'ko' ? '대시보드 로딩 중…' : 'Loading dashboard…'}</div>;
  const genericFallback = <div className="flex items-center justify-center min-h-[50vh] text-slate-500 dark:text-slate-400 font-bold">{lang === 'ko' ? '로딩 중…' : 'Loading…'}</div>;
  switch (activeTab) {
    case 'dashboard':
      return user ? (
        <React.Suspense fallback={dashboardFallback}>
          <Dashboard
            lang={lang}
            portfolios={activePortfolios}
            onClosePortfolio={(id) => setTerminateTargetId(id)}
            onDeletePortfolio={deletePortfolioById}
            onUpdatePortfolio={(updated) => {
              void handleUpdatePortfolio(updated).catch((error: unknown) => {
                openPortfolioMutationNotice(error);
              });
            }}
            onOpenCreator={handleRequestOpenCreator}
            onOpenAlarm={(id) => setAlarmTargetId(id)}
            onOpenDetails={(id) => setDetailsTargetId(id)}
            onOpenQuickInput={(id, activeSection) => {
              setQuickInputTargetId(id);
              setQuickInputActiveSection(activeSection);
            }}
            onOpenExecution={(id) => setExecutionTargetId(id)}
            onOpenAIImage={(id) => setAiImageTargetId(id)}
            totalValuation={totalValuation}
            totalValuationChange={totalValuationChange}
            totalValuationChangePct={totalValuationChangePct}
            onDailyExecutionSummaryChange={onDailyExecutionSummaryChange}
          />
        </React.Suspense>
      ) : (
        <Landing
          lang={lang}
          onOpenSignup={() => setAuthModal('signup')}
          onOpenLogin={() => setAuthModal('login')}
        />
      );
    case 'markets':
      return (
        <React.Suspense fallback={genericFallback}>
          <Markets
            lang={lang}
            portfolios={portfolios}
            canAccessPaidStocks={canAccessPaidStocks}
            currentTier={currentTier === 'premium' || currentTier === 'pro' ? (currentTier as 'pro' | 'premium') : 'free'}
          />
        </React.Suspense>
      );
    case 'backtest':
      return (
        <React.Suspense fallback={<div className="flex items-center justify-center min-h-[50vh] text-slate-500 dark:text-slate-400 font-bold">백테스트 로딩 중…</div>}>
          <Backtest lang={lang} currentTier={currentTier === 'premium' || currentTier === 'pro' ? currentTier : 'free'} />
        </React.Suspense>
      );
    case 'pricing':
      return (
        <Pricing
          lang={lang}
          currentTier={currentTier === 'premium' || currentTier === 'pro' ? currentTier : 'free'}
          onUpgrade={(planId) => {
            if (!user) {
              setAuthModal('login');
              return;
            }
            setCheckoutPlan(planId);
          }}
        />
      );
    case 'history':
      return (
        <React.Suspense fallback={genericFallback}>
          <History
            lang={lang}
            portfolios={closedPortfolios}
            onOpenDetails={setDetailsTargetId}
            onDeleteHistory={handleDeleteHistory}
            onClearHistory={handleClearHistory}
          />
        </React.Suspense>
      );
    case 'privacy':
      return (
        <Privacy
          lang={lang}
          onBack={() => {
            handleRequestBackNavigation(() => {
              setActiveTab('dashboard');
              const u = window.location;
              if (u.hash === '#privacy') window.history.replaceState(null, '', u.pathname + u.search);
            });
          }}
        />
      );
    case 'terms':
      return (
        <Terms
          lang={lang}
          onBack={() => {
            handleRequestBackNavigation(() => {
              setActiveTab('dashboard');
              const u = window.location;
              if (u.hash === '#terms') window.history.replaceState(null, '', u.pathname + u.search);
            });
          }}
        />
      );
    default:
      return null;
  }
}, [
  activeTab,
  lang,
  user,
  activePortfolios,
  portfolios,
  closedPortfolios,
  userProfile,
  currentTier,
  totalValuation,
  totalValuationChange,
  totalValuationChangePct,
  onDailyExecutionSummaryChange,
  canAccessPaidStocks,
  deletePortfolioById,
  handleClearHistory,
  handleDeleteHistory,
  handleRequestBackNavigation,
  handleRequestOpenCreator,
  handleUpdatePortfolio,
  openPortfolioMutationNotice,
]);
```

#### ✅ After

> **구조:** `useMemo` + 거대 렌더 팩토리 대신 **`React.memo` 컴포넌트**로 분리합니다. 문자열은 `@/constants/appShellMessages.ts`, 해시/티어 유틸은 `@/utils/appEntryHelpers.ts`를 사용합니다(§3.6~3.7).  
> **콜백:** 부모에서 인라인 화살표 함수를 탭 콘텐츠에 직접 넘기지 않고 **`useCallback`으로 고정**합니다.

**파일 A — `components/TabContent.tsx` (신규 제안, 완성형 스니펫)**

```tsx
import React, { useCallback } from 'react';
import type { Portfolio } from '@/types';
import { APP_HASH, APP_SHELL_MESSAGES } from '@/constants/appShellMessages';
import { resolvePaidTier } from '@/utils/appEntryHelpers';

import Landing from '@/components/Landing';
import Pricing from '@/components/Pricing';
import Privacy from '@/components/Privacy';
import Terms from '@/components/Terms';

const Dashboard = React.lazy(() => import('@/components/Dashboard'));
const Markets = React.lazy(() => import('@/components/Markets'));
const Backtest = React.lazy(() => import('@/components/Backtest'));
const History = React.lazy(() => import('@/components/History'));

export type ActiveTab =
  | 'dashboard'
  | 'markets'
  | 'history'
  | 'backtest'
  | 'pricing'
  | 'privacy'
  | 'terms';

export interface TabContentProps {
  activeTab: ActiveTab;
  lang: 'ko' | 'en';
  user: { id: string; email: string } | null;
  activePortfolios: Portfolio[];
  portfolios: Portfolio[];
  closedPortfolios: Portfolio[];
  canAccessPaidStocks: boolean;
  currentTier: string;
  totalValuation: number;
  totalValuationChange: number;
  totalValuationChangePct: number;

  onDailyExecutionSummaryChange: (summary: string | null) => void;
  onOpenLogin: () => void;
  onOpenSignup: () => void;
  onRequestOpenCreator: () => void;
  onOpenAlarm: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onOpenQuickInput: (
    id: string,
    activeSection: 1 | 2 | 3 | undefined,
  ) => void;
  onOpenExecution: (id: string) => void;
  onOpenAIImage: (id: string) => void;
  onClosePortfolio: (id: string) => void;
  onDeletePortfolio: (id: string) => Promise<void>;
  onUpdatePortfolio: (portfolio: Portfolio) => Promise<void>;
  onDeleteHistory: (portfolioId: string) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onSelectCheckoutPlan: (planId: 'pro' | 'premium') => void;
  onBackToDashboard: (hash: string) => void;
}

const SuspenseFallback = React.memo(({ message }: { message: string }) => (
  <div className="flex min-h-[50vh] items-center justify-center font-bold text-slate-500 dark:text-slate-400">
    {message}
  </div>
));
SuspenseFallback.displayName = 'SuspenseFallback';

const TabContentComponent: React.FC<TabContentProps> = (props) => {
  const {
    activeTab,
    lang,
    user,
    activePortfolios,
    portfolios,
    closedPortfolios,
    canAccessPaidStocks,
    currentTier,
    totalValuation,
    totalValuationChange,
    totalValuationChangePct,
    onDailyExecutionSummaryChange,
    onOpenLogin,
    onOpenSignup,
    onRequestOpenCreator,
    onOpenAlarm,
    onOpenDetails,
    onOpenQuickInput,
    onOpenExecution,
    onOpenAIImage,
    onClosePortfolio,
    onDeletePortfolio,
    onUpdatePortfolio,
    onDeleteHistory,
    onClearHistory,
    onSelectCheckoutPlan,
    onBackToDashboard,
  } = props;

  const copy = APP_SHELL_MESSAGES[lang];
  const paidTier = resolvePaidTier(currentTier);

  const handlePricingUpgrade = useCallback(
    (planId: 'pro' | 'premium') => {
      if (user?.id == null) {
        onOpenLogin();
        return;
      }
      onSelectCheckoutPlan(planId);
    },
    [user?.id, onOpenLogin, onSelectCheckoutPlan],
  );

  const handlePrivacyBack = useCallback(() => {
    onBackToDashboard(APP_HASH.privacy);
  }, [onBackToDashboard]);

  const handleTermsBack = useCallback(() => {
    onBackToDashboard(APP_HASH.terms);
  }, [onBackToDashboard]);

  switch (activeTab) {
    case 'dashboard':
      if (user == null) {
        return (
          <Landing
            lang={lang}
            onOpenSignup={onOpenSignup}
            onOpenLogin={onOpenLogin}
          />
        );
      }

      return (
        <React.Suspense
          fallback={<SuspenseFallback message={copy.loadingDashboard} />}
        >
          <Dashboard
            lang={lang}
            portfolios={activePortfolios}
            onClosePortfolio={onClosePortfolio}
            onDeletePortfolio={onDeletePortfolio}
            onUpdatePortfolio={onUpdatePortfolio}
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
        </React.Suspense>
      );

    case 'markets':
      return (
        <React.Suspense
          fallback={<SuspenseFallback message={copy.loadingGeneric} />}
        >
          <Markets
            lang={lang}
            portfolios={portfolios}
            canAccessPaidStocks={canAccessPaidStocks}
            currentTier={paidTier}
          />
        </React.Suspense>
      );

    case 'backtest':
      return (
        <React.Suspense
          fallback={<SuspenseFallback message={copy.loadingBacktest} />}
        >
          <Backtest lang={lang} currentTier={paidTier} />
        </React.Suspense>
      );

    case 'pricing':
      return (
        <Pricing
          lang={lang}
          currentTier={paidTier}
          onUpgrade={handlePricingUpgrade}
        />
      );

    case 'history':
      return (
        <React.Suspense
          fallback={<SuspenseFallback message={copy.loadingGeneric} />}
        >
          <History
            lang={lang}
            portfolios={closedPortfolios}
            onOpenDetails={onOpenDetails}
            onDeleteHistory={onDeleteHistory}
            onClearHistory={onClearHistory}
          />
        </React.Suspense>
      );

    case 'privacy':
      return (
        <Privacy lang={lang} onBack={handlePrivacyBack} />
      );

    case 'terms':
      return <Terms lang={lang} onBack={handleTermsBack} />;

    default: {
      const _exhaustiveCheck: never = activeTab;
      void _exhaustiveCheck;
      return <SuspenseFallback message={copy.loadingGeneric} />;
    }
  }
};

TabContentComponent.displayName = 'TabContent';

export const TabContent = React.memo(TabContentComponent);
```

**`Suspense` fallback:** 매 렌더마다 **실행 분기와 무관하게** fallback 엘리먼트 3개를 미리 만들지 않습니다. **`React.memo`인 `SuspenseFallback`** 을 두고, **해당 `case`의 `Suspense` 안에서만** `<SuspenseFallback message={...} />` 를 선언합니다. (무분별 **상단 `useMemo`로 작은 div 캐시**는 금지하되, **UI 조각을 메모 컴포넌트로 분리**하는 것은 허용.)

**`default` 분기:** `return null` 금지. **`never` exhaustive 변수**(가능한 경우)로 union 누락을 컴파일 타임에 잡되, **런타임 반환은 항상 폴백 UI** — 여기서는 **`<SuspenseFallback message={copy.loadingGeneric} />`**(팀 확정: WSOD·빈 화면 불가). 문구가 “로딩 중”에 가깝다면 §3.6에 `unknownActiveTab` 등 전용 키를 추가해 메시지만 바꿀 수 있습니다.

**프로덕션용 `useCallback` 의존 배열:** 상단 스니펫은 `props`를 구조 분해한 뒤, 콜백만 필드 단위로 묶었습니다.

- `handlePricingUpgrade` → **`[user?.id, onOpenLogin, onSelectCheckoutPlan]`** (객체 `user` 전체 대신 **원시값** `user?.id`)
- `handlePrivacyBack` / `handleTermsBack` → `[onBackToDashboard]` (해시는 클로저로 캡처)

부모(`App`)에서 `onOpenLogin`, `onSelectCheckoutPlan`, `onBackToDashboard`를 `useCallback`으로 안정화해 두면, `React.memo(TabContent)`와 `Pricing` 사이의 불필요한 리렌더를 줄이기 쉽습니다.

#### 3.3.1 동일 로직 — 의존 배열만 발췌 (복사용)

구조 분해 없이 `props` 접두사를 유지할 경우에도 의존 배열은 동일하게 맞춥니다.

```tsx
const handlePricingUpgrade = useCallback(
  (planId: 'pro' | 'premium') => {
    if (props.user?.id == null) {
      props.onOpenLogin();
      return;
    }
    props.onSelectCheckoutPlan(planId);
  },
  [props.user?.id, props.onOpenLogin, props.onSelectCheckoutPlan],
);

const handlePrivacyBack = useCallback(() => {
  props.onBackToDashboard(APP_HASH.privacy);
}, [props.onBackToDashboard]);

const handleTermsBack = useCallback(() => {
  props.onBackToDashboard(APP_HASH.terms);
}, [props.onBackToDashboard]);
```

**파일 B — `App.tsx` 내부 사용부 (발췌, 완성형 맥락)**

```tsx
import React, { useCallback, useMemo } from 'react';
import type { Portfolio } from '@/types';
import { TabContent } from '@/components/TabContent';
import { replaceHashIfMatched } from '@/utils/appEntryHelpers';
import { showErrorToast } from '@/components/tds-adapter/showErrorToast';
import { APP_SHELL_MESSAGES } from '@/constants/appShellMessages';
import { useMutexAction } from '@/hooks/useMutexAction';

const activePortfolios = useMemo(
  () => portfolios.filter((p) => !p.isClosed),
  [portfolios],
);

const closedPortfolios = useMemo(
  () => portfolios.filter((p) => p.isClosed),
  [portfolios],
);

const handleOpenLogin = useCallback(() => {
  setAuthModal('login');
}, [setAuthModal]);

const handleOpenSignup = useCallback(() => {
  setAuthModal('signup');
}, [setAuthModal]);

const handleOpenQuickInput = useCallback(
  (id: string, activeSection: 1 | 2 | 3 | undefined) => {
    setQuickInputTargetId(id);
    setQuickInputActiveSection(activeSection);
  },
  [setQuickInputTargetId, setQuickInputActiveSection],
);

const { run: handleUpdatePortfolioForDashboard } = useMutexAction(
  useCallback(
    async (portfolio: Portfolio) => {
      try {
        await Promise.resolve(handleUpdatePortfolio(portfolio));
      } catch (error: unknown) {
        openPortfolioMutationNotice(error);
      }
    },
    [handleUpdatePortfolio, openPortfolioMutationNotice],
  ),
);

const { run: handleDeletePortfolio } = useMutexAction(
  useCallback(
    async (id: string) => {
      const shellCopy = APP_SHELL_MESSAGES[lang];

      try {
        await deletePortfolioById(id);
      } catch (error: unknown) {
        showErrorToast(shellCopy.portfolioDeleteFailed);
        console.error('[Portfolio] delete failed:', error);
      }
    },
    [deletePortfolioById, lang, showErrorToast],
  ),
);

const { run: handleSafeDeleteHistory } = useMutexAction(
  useCallback(
    async (portfolioId: string) => {
      const shellCopy = APP_SHELL_MESSAGES[lang];

      try {
        await handleDeleteHistory(portfolioId);
      } catch (error: unknown) {
        showErrorToast(shellCopy.historyEntryDeleteFailed);
        console.error('[History] delete failed:', error);
      }
    },
    [handleDeleteHistory, lang, showErrorToast],
  ),
);

const { run: handleSafeClearHistory } = useMutexAction(
  useCallback(
    async () => {
      const shellCopy = APP_SHELL_MESSAGES[lang];

      try {
        await handleClearHistory();
      } catch (error: unknown) {
        showErrorToast(shellCopy.historyClearFailed);
        console.error('[History] clear failed:', error);
      }
    },
    [handleClearHistory, lang, showErrorToast],
  ),
);

const handleBackToDashboard = useCallback(
  (hash: string) => {
    handleRequestBackNavigation(() => {
      setActiveTab('dashboard');
      replaceHashIfMatched(hash);
    });
  },
  [handleRequestBackNavigation, setActiveTab, replaceHashIfMatched],
);

return (
  <main className="max-w-7xl mx-auto px-6 md:px-16 py-10">
    <TabContent
      activeTab={activeTab}
      lang={lang}
      user={user}
      activePortfolios={activePortfolios}
      portfolios={portfolios}
      closedPortfolios={closedPortfolios}
      canAccessPaidStocks={canAccessPaidStocks}
      currentTier={currentTier}
      totalValuation={totalValuation}
      totalValuationChange={totalValuationChange}
      totalValuationChangePct={totalValuationChangePct}
      onDailyExecutionSummaryChange={onDailyExecutionSummaryChange}
      onOpenLogin={handleOpenLogin}
      onOpenSignup={handleOpenSignup}
      onRequestOpenCreator={handleRequestOpenCreator}
      onOpenAlarm={setAlarmTargetId}
      onOpenDetails={setDetailsTargetId}
      onOpenQuickInput={handleOpenQuickInput}
      onOpenExecution={setExecutionTargetId}
      onOpenAIImage={setAiImageTargetId}
      onClosePortfolio={setTerminateTargetId}
      onDeletePortfolio={handleDeletePortfolio}
      onUpdatePortfolio={handleUpdatePortfolioForDashboard}
      onDeleteHistory={handleSafeDeleteHistory}
      onClearHistory={handleSafeClearHistory}
      onSelectCheckoutPlan={setCheckoutPlan}
      onBackToDashboard={handleBackToDashboard}
    />
  </main>
);
```

> **통합 시(실제 `App.tsx`):** 위 `activePortfolios` / `closedPortfolios` 의 `useMemo`는 **이미 동일 로직이 컴포넌트 상단에 있으면 중복 선언하지 말고 한 벌만** 유지합니다. 스니펫은 드라이런용 **확정 패턴**을 한 블록에 모은 것입니다.  
> **`useCallback` 의존 배열:** `setState` setter는 React에서 참조가 안정적이지만, 팀 규칙(명시적 의존성·향후 훅 래핑 대비)상 **본 스니펫에서는 `setAuthModal`, `setQuickInputTargetId`, `setQuickInputActiveSection`, `setActiveTab` 등 본문에서 쓰는 setter를 전부 명시**합니다(§3.2 `handleNavigateDashboard`, §3.4 `showDisabledTooltip` 포함, §0.6).  
> **`react-hooks/exhaustive-deps` (팀 확정):** Core Principles의 lazy/band-aid 금지에 따라 **`eslint-disable`로 훅 린트를 우회하지 않으며**, 린트가 요구하면 **`replaceHashIfMatched` 등 본문에서 참조하는 심볼은 순수 함수라도 예외 없이 의존 배열에 명시**합니다.

**[⚠️ 중요: `React.memo` 성능]**  
`TabContent`에 넘기는 **`activePortfolios`**, **`closedPortfolios`** 는 반드시 **`useMemo`로 참조 고정**합니다(위 스니펫과 동일). `portfolios` 원본은 상태 소스로 그대로 전달합니다.

**[Rule 11 — Mutation / 브릿지]** 진입점에서 `TabContent`로 내려보내는 **비동기 상태 변이**는 스니펫 단계에서 **끝까지** 정한다. **Mutex(1-tick 중복 차단)** 는 **`hooks/useMutexAction.ts`의 `useMutexAction`** 으로 DRY·SRP 유지(§3.3.2). 훅은 **`{ run, isExecuting }`** 를 반환하도록 확장하는 것을 계획서에 반영했고, 구현은 **Rule 2 준수를 위해 `actionRef.current` 갱신을 `useLayoutEffect`로만 수행**하고, **`run` 참조는 고정(`useCallback` 빈 deps)** + **`useMemo` 반환 객체**로 Stale closure를 방지한다(`PRE_RELEASE_CODE_OPTIMIZATION_MASTER_PLAN.md` Phase A **Mutex** 행, `docs2/PHASE_A_CONSTANTS_SIMULATION.md` §3.5.1). 진입점에서는 보통 **`const { run: handleX } = useMutexAction(...)`** 만 쓰면 되고, 버튼·로딩 UI가 필요한 화면에서는 **`isExecuting`** 을 함께 구조 분해한다. 래핑된 액션 내부에서는 업데이트 경로에 **`await Promise.resolve(handleUpdatePortfolio(...))`** 를 유지하고, 훅 본체는 **`await Promise.resolve(actionRef.current(...args))`** 에 상응하게 최신 액션을 호출한다. 파괴적 Mutation(`deletePortfolioById` 등)도 동일 패턴으로 감싼다. 실패 시 사용자 피드백은 **`showErrorToast` + `APP_SHELL_MESSAGES` 키**(§3.6)만 사용한다(§0.5·§0.7·계획서 Phase A 표).

**요약:** 탭 영역은 `<TabContent ... />` 한 번으로 두고, 부모는 **파생 배열 `useMemo` + `useMutexAction` 기반 Mutation 래핑**까지 스니펫 수준에서 확정합니다.

#### 3.3.2 `hooks/useMutexAction.ts` (확장 — Mutex DRY + `isExecuting`)

> **통합 시:** `App.tsx` 등에서 **`@/hooks/useMutexAction`** 으로 import. 동일 뮤텍스 패턴을 **여러 `useRef(false)` 복붙**하지 않는다(§0.7).  
> **반환값:** **`{ run, isExecuting }`**. 기존 스니펫 `const fn = useMutexAction(...)` 는 **`const { run: fn } = useMutexAction(...)`** 로 일괄 치환한다. 상세 계약은 `docs2/PHASE_A_CONSTANTS_SIMULATION.md` §3.5.1 과 동일.

```ts
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface UseMutexActionResult<Args extends unknown[]> {
  run: (...args: Args) => Promise<void>;
  isExecuting: boolean;
}

export function useMutexAction<Args extends unknown[]>(
  action: (...args: Args) => void | Promise<void>,
): UseMutexActionResult<Args> {
  const isExecutingRef = useRef(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const actionRef = useRef(action);

  useLayoutEffect(() => {
    actionRef.current = action;
  }, [action]);

  const run = useCallback(async (...args: Args) => {
    if (isExecutingRef.current) {
      return;
    }

    try {
      isExecutingRef.current = true;
      setIsExecuting(true);
      await Promise.resolve(actionRef.current(...args));
    } finally {
      isExecutingRef.current = false;
      setIsExecuting(false);
    }
  }, []);

  return useMemo(
    () => ({ run, isExecuting }),
    [run, isExecuting],
  );
}
```

### 3.4 `App.tsx` `NavIcon` 전체 컴포넌트 시뮬레이션

#### ❌ Before

```tsx
interface NavIconProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  tooltip?: string;
  tooltipIcon?: React.ReactNode;
}

const NavIcon: React.FC<NavIconProps> = ({ active, onClick, icon, label, disabled, tooltip, tooltipIcon }) => {
  const [showTooltip, setShowTooltip] = React.useState(false);
  const hideTimeoutRef = React.useRef<number | null>(null);

  const handleClick = () => {
    if (disabled) {
      if (tooltip) {
        if (hideTimeoutRef.current) {
          window.clearTimeout(hideTimeoutRef.current);
        }
        setShowTooltip(true);
        hideTimeoutRef.current = window.setTimeout(() => {
          setShowTooltip(false);
        }, 3000);
      }
      return;
    }
    onClick();
  };

  const isActive = !disabled && active;

  return (
    <div className="relative flex flex-col items-center group">
      {tooltip && (
        <div
          className={`pointer-events-none absolute -top-16 z-50 flex items-center gap-3 rounded-2xl bg-[#0F172A] px-4 py-3 shadow-2xl border border-white/10 transition-all duration-300 ${
            showTooltip 
              ? 'opacity-100 translate-y-0 scale-100' 
              : 'opacity-0 translate-y-2 scale-95 group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100'
          }`}
          style={{ width: 'max-content', minWidth: '220px' }}
        >
          {tooltipIcon && (
            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <div className="animate-pulse">
                {tooltipIcon}
              </div>
            </div>
          )}
          <div className="text-[11px] font-bold leading-tight text-slate-100 whitespace-pre-line">
            {tooltip}
          </div>
          <div className="absolute left-1/2 -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-[#0F172A] border-r border-b border-white/10" />
        </div>
      )}
      <button
        type="button"
        onClick={handleClick}
        className="flex flex-col items-center gap-1 transition-all px-2 md:px-4"
        aria-disabled={disabled ? 'true' : 'false'}
      >
        <div
          className={`p-2.5 rounded-xl transition-all duration-300 ${
            isActive
              ? 'bg-blue-600 text-white shadow-lg'
              : disabled
              ? 'text-slate-500/60 bg-white/0 cursor-not-allowed'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
          }`}
        >
          {icon}
        </div>
        <span
          className={`text-[9px] font-black uppercase tracking-tighter hidden md:block transition-colors ${
            isActive ? 'text-blue-500' : disabled ? 'text-slate-500/60' : 'text-slate-500'
          }`}
        >
          {label}
        </span>
      </button>
    </div>
  );
};
```

#### ✅ After

```tsx
const NAV_ICON_TOOLTIP_HIDE_MS = 3000;
const NAV_ICON_TOOLTIP_MIN_WIDTH_PX = 220;

interface NavIconProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  tooltip?: string;
  tooltipIcon?: React.ReactNode;
}

function getNavIconButtonClassName(): string {
  return 'flex flex-col items-center gap-1 transition-all px-2 md:px-4';
}

function getNavIconSurfaceClassName(
  isActive: boolean,
  isDisabled: boolean,
): string {
  if (isActive) {
    return 'p-2.5 rounded-xl transition-all duration-300 bg-blue-600 text-white shadow-lg';
  }

  if (isDisabled) {
    return 'p-2.5 rounded-xl transition-all duration-300 text-slate-500/60 bg-white/0 cursor-not-allowed';
  }

  return 'p-2.5 rounded-xl transition-all duration-300 text-slate-500 hover:text-slate-300 hover:bg-white/5';
}

function getNavIconLabelClassName(
  isActive: boolean,
  isDisabled: boolean,
): string {
  if (isActive) {
    return 'text-[9px] font-black uppercase tracking-tighter hidden md:block transition-colors text-blue-500';
  }

  if (isDisabled) {
    return 'text-[9px] font-black uppercase tracking-tighter hidden md:block transition-colors text-slate-500/60';
  }

  return 'text-[9px] font-black uppercase tracking-tighter hidden md:block transition-colors text-slate-500';
}

const NavIcon: React.FC<NavIconProps> = ({
  active,
  onClick,
  icon,
  label,
  disabled = false,
  tooltip,
  tooltipIcon,
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = React.useState(false);
  const hideTimeoutRef = React.useRef<number | null>(null);
  const tooltipId = React.useId();
  const isActive = !disabled && active;

  const clearTooltipTimer = React.useCallback(() => {
    if (hideTimeoutRef.current == null) {
      return;
    }

    window.clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = null;
  }, []);

  const showDisabledTooltip = React.useCallback(() => {
    if (!tooltip) {
      return;
    }

    clearTooltipTimer();
    setIsTooltipVisible(true);
    hideTimeoutRef.current = window.setTimeout(() => {
      setIsTooltipVisible(false);
      hideTimeoutRef.current = null;
    }, NAV_ICON_TOOLTIP_HIDE_MS);
  }, [clearTooltipTimer, tooltip, setIsTooltipVisible]);

  const handleClick = React.useCallback(() => {
    if (disabled) {
      showDisabledTooltip();
      return;
    }

    onClick();
  }, [disabled, onClick, showDisabledTooltip]);

  React.useEffect(() => {
    return () => {
      clearTooltipTimer();
    };
  }, [clearTooltipTimer]);

  return (
    <div className="relative flex flex-col items-center group">
      {tooltip && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute -top-16 z-50 flex items-center gap-3 rounded-2xl bg-[#0F172A] px-4 py-3 shadow-2xl border border-white/10 transition-all duration-300 ${
            isTooltipVisible
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-2 scale-95 group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100'
          }`}
          style={{ width: 'max-content', minWidth: `${NAV_ICON_TOOLTIP_MIN_WIDTH_PX}px` }}
        >
          {tooltipIcon && (
            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <div className="animate-pulse">{tooltipIcon}</div>
            </div>
          )}
          <div className="text-[11px] font-bold leading-tight text-slate-100 whitespace-pre-line">
            {tooltip}
          </div>
          <div className="absolute left-1/2 -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-[#0F172A] border-r border-b border-white/10" />
        </div>
      )}

      <button
        type="button"
        onClick={handleClick}
        className={getNavIconButtonClassName()}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        aria-disabled={disabled}
        aria-describedby={tooltip ? tooltipId : undefined}
      >
        <div className={getNavIconSurfaceClassName(isActive, disabled)}>
          {icon}
        </div>
        <span className={getNavIconLabelClassName(isActive, disabled)}>
          {label}
        </span>
      </button>
    </div>
  );
};
```

### 3.5 `App.tsx` 일일 요약 저장 effect 시뮬레이션 (`any` 제거)

실패 시 **`showErrorToast`** 로 사용자 피드백을 주고, 문구는 **`APP_SHELL_MESSAGES`**(§3.6)에서만 가져옵니다. `console` 은 개발 추적용으로만 유지합니다.

#### ❌ Before

```tsx
useEffect(() => {
  if (!user?.id) return;
  if (!summaryToSave || summaryToSave.trim().length === 0) return;

  if (dailyExecutionDebounceRef.current) {
    clearTimeout(dailyExecutionDebounceRef.current);
  }

  dailyExecutionDebounceRef.current = setTimeout(async () => {
    try {
      if (lastSavedSummaryRef.current === summaryToSave) {
        return;
      }

      const summaryDate = getCurrentKSTDateString();

      const { error } = await supabase
        .from('daily_execution_summaries')
        .upsert(
          {
            user_id: user.id,
            summary_date: summaryDate,
            summary_text: summaryToSave,
            lang,
          },
          {
            onConflict: 'user_id,summary_date',
          } as any,
        );

      if (error) {
        console.warn('[DailyExecution] upsert error:', error.message);
      } else {
        lastSavedSummaryRef.current = summaryToSave;
        console.log('[DailyExecution] summary upserted for', summaryDate);
      }
    } catch (err) {
      console.warn('[DailyExecution] upsert failed:', err);
    }
  }, 3000);

  return () => {
    if (dailyExecutionDebounceRef.current) {
      clearTimeout(dailyExecutionDebounceRef.current);
      dailyExecutionDebounceRef.current = null;
    }
  };
}, [user?.id, summaryToSave, lang]);
```

#### ✅ After

```tsx
import { useEffect, useRef } from 'react';
import { showErrorToast } from '@/components/tds-adapter/showErrorToast';
import { APP_SHELL_MESSAGES } from '@/constants/appShellMessages';

const DAILY_EXECUTION_DEBOUNCE_MS = 3000;
const DAILY_EXECUTION_ON_CONFLICT = 'user_id,summary_date';

interface DailyExecutionSummaryUpsertRow {
  user_id: string;
  summary_date: string;
  summary_text: string;
  lang: 'ko' | 'en';
}

async function saveDailyExecutionSummary(params: {
  userId: string;
  summary: string;
  lang: 'ko' | 'en';
}): Promise<{ summaryDate: string; errorMessage: string | null }> {
  const summaryDate = getCurrentKSTDateString();
  const payload: DailyExecutionSummaryUpsertRow = {
    user_id: params.userId,
    summary_date: summaryDate,
    summary_text: params.summary,
    lang: params.lang,
  };

  const { error } = await supabase
    .from('daily_execution_summaries')
    .upsert(payload, {
      onConflict: DAILY_EXECUTION_ON_CONFLICT,
    });

  return {
    summaryDate,
    errorMessage: error?.message ?? null,
  };
}

const dailyExecutionDebounceRef = useRef<number | null>(null);

useEffect(() => {
  const currentUserId = user?.id;

  if (currentUserId == null) {
    return;
  }

  if (!summaryToSave || summaryToSave.trim().length === 0) {
    return;
  }

  if (dailyExecutionDebounceRef.current != null) {
    window.clearTimeout(dailyExecutionDebounceRef.current);
  }

  dailyExecutionDebounceRef.current = window.setTimeout(async () => {
    const shellCopy = APP_SHELL_MESSAGES[lang];

    try {
      if (lastSavedSummaryRef.current === summaryToSave) {
        return;
      }

      const result = await saveDailyExecutionSummary({
        userId: currentUserId,
        summary: summaryToSave,
        lang,
      });

      if (result.errorMessage != null) {
        showErrorToast(
          `${shellCopy.dailySummarySaveErrorPrefix}${result.errorMessage}`,
        );
        return;
      }

      lastSavedSummaryRef.current = summaryToSave;
      console.log('[DailyExecution] summary upserted for', result.summaryDate);
    } catch (error: unknown) {
      showErrorToast(shellCopy.dailySummaryNetworkError);
      console.error('[DailyExecution] upsert failed:', error);
    }
  }, DAILY_EXECUTION_DEBOUNCE_MS);

  return () => {
    if (dailyExecutionDebounceRef.current == null) {
      return;
    }

    window.clearTimeout(dailyExecutionDebounceRef.current);
    dailyExecutionDebounceRef.current = null;
  };
}, [user?.id, summaryToSave, lang]);
```

> **Rule 7·환경 일관성:** 브라우저 전용 디바운스는 **`window.setTimeout` / `window.clearTimeout`** 만 사용한다. `dailyExecutionDebounceRef` 는 **`useRef<number | null>(null)`** 로 두어 §3.4 `NavIcon` 과 같이 **`@types/node` 가 섞일 때 `setTimeout` 반환 타입이 `NodeJS.Timeout` 으로 잡히는 문제**를 피한다.

> **Rule 7·TS2531:** 동기 스코프에서 `user` 를 좁혀도 **`window.setTimeout` 비동기 콜백 안에서는 `user` 가 다시 `null` 일 수 있다고 추론**되어 `user.id` 접근이 **TS2531** 로 깨질 수 있다. **`user?.id` 를 원시값 `currentUserId` 로 캡처**한 뒤 콜백에서는 **`currentUserId` 만** 쓴다(§0.7).

### 3.6 `constants/appShellMessages.ts` (신규, SSOT — **확정**)

실제 적용 시 이 파일을 추가하고, §3.2·§3.3 스니펫에서 import 합니다. `vrMessages.ts`는 VR 도메인 전용이므로, **앱 셸(진입점·탭 로딩·브랜드 접근성 문구)** 는 **본 파일에만** 둡니다. `constants.tsx`의 `I18N`과 역할을 섞지 않습니다. Mutation mutex 훅은 **§3.3.2 `useMutexAction`** 과 별도입니다.

```ts
export const APP_HASH = {
  privacy: '#privacy',
  terms: '#terms',
} as const;

export const APP_SHELL_MESSAGES = {
  ko: {
    entryAppName: 'BUY THE DIP',
    entryGoToDashboardAria: '대시보드로 이동',
    loadingDashboard: '대시보드 로딩 중…',
    loadingGeneric: '로딩 중…',
    loadingBacktest: '백테스트 로딩 중…',
    dailySummarySaveErrorPrefix: '요약 저장 실패: ',
    dailySummaryNetworkError: '네트워크 오류로 요약을 저장하지 못했습니다.',
    portfolioDeleteFailed: '포트폴리오 삭제에 실패했습니다.',
    historyEntryDeleteFailed: '히스토리 항목 삭제에 실패했습니다.',
    historyClearFailed: '히스토리 비우기에 실패했습니다.',
  },
  en: {
    entryAppName: 'BUY THE DIP',
    entryGoToDashboardAria: 'Go to dashboard',
    loadingDashboard: 'Loading dashboard…',
    loadingGeneric: 'Loading…',
    loadingBacktest: 'Loading backtest…',
    dailySummarySaveErrorPrefix: 'Could not save summary: ',
    dailySummaryNetworkError: 'Network error. Summary was not saved.',
    portfolioDeleteFailed: 'Could not delete portfolio.',
    historyEntryDeleteFailed: 'Could not delete history entry.',
    historyClearFailed: 'Could not clear history.',
  },
} as const;
```

### 3.7 `utils/appEntryHelpers.ts` (신규 제안)

```ts
export type PaidTier = 'free' | 'pro' | 'premium';

export function resolvePaidTier(currentTier: string): PaidTier {
  if (currentTier === 'pro' || currentTier === 'premium') {
    return currentTier;
  }
  return 'free';
}

export function replaceHashIfMatched(expectedHash: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const currentLocation = window.location;
  if (currentLocation.hash !== expectedHash) {
    return;
  }

  window.history.replaceState(
    null,
    '',
    `${currentLocation.pathname}${currentLocation.search}`,
  );
}

export function assertNever(value: never): never {
  throw new Error(`[assertNever] Unexpected value: ${String(value)}`);
}
```

- **`TabContent` 탭 라우팅:** 사용자에게는 **항상 폴백 UI**를 주는 것이 우선이므로 §3.3처럼 **`never` 검증 변수 + `return <SuspenseFallback message={copy.loadingGeneric} />`** 패턴을 씁니다. `assertNever` 를 `default` 에서 직접 호출하면 런타임에 throw 되어 WSOD와 유사한 경험이 될 수 있어, **이 컴포넌트에서는 사용하지 않습니다.**
- **그 외 `switch`:** 개발/내부 전용 분기에서 누락 시 즉시 실패해도 된다면 `return assertNever(x)` 패턴을 쓸 수 있습니다.
- **`const _x: never = activeTab` 가 전 케이스 나열 후에도 타입 에러**가 나면, ESLint exhaustive switch 또는 `activeTab` 을 좁히는 리팩터로 맞추고, 런타임 폴백은 **`<SuspenseFallback message={copy.loadingGeneric} />`**(또는 동등 범용 UI)를 유지합니다.

---

## 4. 실제 적용 전 체크리스트

- [ ] `App.tsx`, `index.tsx` 원본은 아직 직접 수정하지 않았다.
- [ ] `App.tsx` 의 미사용 import / 변수 제거 목록을 먼저 확정했다.
- [ ] `as any` 제거 대체안이 빌드 가능한지 별도 검토했다.
- [ ] 엔트리 문구 SSOT를 `constants/appShellMessages.ts`에만 두기로 확정했고, 해당 파일 초안을 맞췄다.
- [ ] 클릭 가능한 비시맨틱 요소를 `button` 또는 a11y-complete 형태로 치환할 준비가 됐다.
- [ ] 토스 미니앱 경로(`/markets`, 뒤로가기, `closeView`)는 동작 변화 없이 유지되도록 dry-run 했다.
- [ ] `TabContent` 의 `switch (activeTab)` 에 **`never` exhaustive check(가능 시) + `default`에서 무조건 범용 폴백 UI**(`<SuspenseFallback message={copy.loadingGeneric} />` 등)를 적용했다 (`return null`·사용자 경로 `throw` 금지, WSOD 불가).
- [ ] `Suspense` 용 fallback 에 **무분별 `useMemo`를 쓰지 않았고**, **상단에서 분기와 무관하게 fallback을 여러 개 미리 만들지 않았다** — 필요 시 **`React.memo`인 `SuspenseFallback`** 을 두고 **해당 `case` 안에서만** 선언한다(§0.4·§3.3).
- [ ] `HeaderBrandButton` 등 셸 UI의 **매직 넘버·인라인 `style` 객체**를 상수 또는 Tailwind 클래스로 치환했다.
- [ ] `TabContent` 로 넘기는 **파생 배열**(`activePortfolios`, `closedPortfolios` 등)이 부모에서 **`useMemo`로 참조 고정**되는지 확인했다.
- [ ] 일일 요약 저장 등 **사용자 영향 실패**에 `showErrorToast` + `appShellMessages` 를 적용했다(silent `console.warn` 만 금지). **`summaryToSave`가 `null`/`undefined`일 수 있으면** `.trim()` 전에 **falsy 방어**했다(§0.4·§3.5).
- [ ] `handlePricingUpgrade` 등 **`useCallback` deps에 객체 전체 대신 원시값**(`user?.id`)을 썼다. **`handleOpenQuickInput`·`handleBackToDashboard` 등** 팀 규칙에 맞게 **setter·`setActiveTab`·`replaceHashIfMatched` 등 린트가 잡는 참조를 전부 의존 배열에 명시**했고, **`eslint-disable`로 `exhaustive-deps`를 우회하지 않았다**(§0.4·§3.3 파일 B 인용 블록).
- [ ] `index.tsx` 진입에서 **`import.meta.env?.DEV ?? false`** 를 적용했고, **`import.meta?.env` 형태는 쓰지 않았다**(§0.6·§3.1).
- [ ] `handleUpdatePortfolioForDashboard` 및 **`onDeletePortfolio` / `onDeleteHistory` / `onClearHistory`** 진입점 래퍼에 **`useMutexAction`**(§3.3.2)·**`const { run: … } = useMutexAction(...)`** 구조 분해·액션 내부 **`Promise.resolve`**·실패 시 **`showErrorToast` + `APP_SHELL_MESSAGES`**(§3.3 파일 B·§3.6·§0.5·§0.7)를 적용했다. *「나중에 검토」* 로 미루지 않았다.
- [ ] 일일 요약 디바운스는 **`window.setTimeout` / `window.clearTimeout`** 과 **`useRef<number | null>`** 로 §3.4 `NavIcon` 과 API·타입 스타일을 맞췄다(§3.5). **`setTimeout` 콜백 안에서는 `user.id` 대신 `currentUserId` 원시 캡처**로 **TS2531** 을 막았다(§0.7·§3.5).

## 5. 권장 적용 순서

1. `index.tsx` 먼저 정리
   - 상수 추출
   - route helper 분리
   - bootstrap helper 추가
2. `hooks/useMutexAction.ts`, `constants/appShellMessages.ts`, `utils/appEntryHelpers.ts`, `components/TabContent.tsx` 추가 후 `App.tsx`에서 탭 영역을 `<TabContent />`로 교체
3. `App.tsx` 에서 미사용 import / `any` 제거
4. a11y 수정
   - 헤더 로고
   - 상단 버튼들
   - `NavIcon`
5. 마지막에 남은 하드코딩 문자열·반복 helper 정리

이 순서가 가장 안전한 이유는, **엔트리의 구조적 안정성(`index.tsx`)을 먼저 확보한 뒤 `App.tsx` 내부 복잡도를 낮추는 편이 빌드 실패 원인을 좁히기 쉽기 때문**입니다.

---

## 6. 문서 상태 (최종)

- **I18N SSOT:** 진입점(App Shell) 전용 문구는 **`constants/appShellMessages.ts` 전용**으로 확정되었으며, 본 문서의 스니펫·체크리스트·§0은 그 기준으로 정렬되어 있습니다.
- **`TabContent`:** §3.3 본문은 **프로덕션용 필드 단위 `useCallback` 의존 배열**을 사용합니다. §3.3.1은 동일 의존성을 `props.` 접두사 스타일로만 발췌한 복사용 블록입니다.
- **§0.1·계획서:** Union `switch` 의 **`default` WSOD 방지 + `never` exhaustive**, **`Suspense` fallback 에 대한 무분별 `useMemo` 금지** 및 **`SuspenseFallback`(`React.memo`) + 분기 내 선언** 패턴, **헤더 매직 넘버·인라인 스타일 정리**를 반영했습니다.
- **`utils/appEntryHelpers.ts`:** §3.7에 **`assertNever`** 예시를 두었으나, **탭 라우팅 `default`에서는 사용하지 않음**(런타임은 항상 **`SuspenseFallback` 등 범용 폴백 UI**). 내부·개발용 `switch` 등에만 한정.
- **§0.2:** `React.memo` + **배열 참조 안정화**, **일일 요약 실패 토스트**, **`useCallback` 원시 deps**, **`import.meta` 방어 접근**을 반영했습니다.
- **§0.3·§3.3 파일 B:** **확정 `useMemo` 파생 배열**, Mutation 은 **`useMutexAction` + `Promise.resolve`**(§3.3.2·§0.7)로 정렬.
- **§0.4:** 일일 요약 effect **`summaryToSave` null 방어**, **`SuspenseFallback` 메모 컴포넌트 + 분기 내 선언**, **`useCallback` deps에 setter·`setActiveTab` 명시** 반영.
- **§0.5:** 진입점 **파괴적 Mutation**(포트폴리오 삭제·히스토리 삭제·히스토리 비우기) **mutex + `Promise.resolve` + 토스트 SSOT** 확정; 일일 요약 **`window` 타이머 API** 통일.
- **§0.6:** **`import.meta.env?.DEV`** 로 TS1303 회피; 훅 deps에 **`setAuthModal`·`setActiveTab`·`setIsTooltipVisible`** 등 setter 일관 명시; **`lang: 'ko'|'en'` 맥락에서 `APP_SHELL_MESSAGES[lang] ?? …` 제거**.
- **§0.7:** 일일 요약 **`currentUserId` 캡처(TS2531)**; **`hooks/useMutexAction`** 로 Mutex DRY.
- **§0.8:** A3 **Option B** 포트폴리오 폼 파이프라인 — UI 정제·`validatePortfolioSetupInput`(`string | null`·throw 금지)·페이로드 일치·**`usePortfolios` 폼 검증 제거(SRP)** — `PHASE_A_CONSTANTS_SIMULATION` §0.1·`PRE_RELEASE` 확정 절과 동일 문장.

**위 기준으로 `PHASE_A_ENTRY_SIMULATION.md` 및 `PRE_RELEASE_CODE_OPTIMIZATION_MASTER_PLAN.md` (Phase A 보강) 반영을 완료했습니다.**
