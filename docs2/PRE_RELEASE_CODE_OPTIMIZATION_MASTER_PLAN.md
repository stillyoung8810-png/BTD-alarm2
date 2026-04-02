# 출시 전 코드 최적화 마스터 플랜

> **서비스 개요:** 주식 매매 유틸리티(백테스트, VR 밴드·주문, 포트폴리오·알람 등)  
> **런타임:** 토스 미니앱([`@apps-in-toss/web-framework`](https://developers-apps-in-toss.toss.im/)) 및 일반 웹 브라우저(일부 기능 차등)

이 문서는 출시 전 **코드 최적화·리팩토링·정리** 작업을 팀(또는 개인)이 동일한 기준으로 나누고, 머지 전 검증까지 일관되게 수행하기 위한 **실무 가이드**입니다. GitHub Wiki·Notion 등에 그대로 옮겨 사용할 수 있도록 표와 체크리스트 중심으로 구성했습니다.

---

## 1. 문서의 목적 및 기본 원칙

### 1.1 목적

- 출시 직전 기간에 **방대한 코드베이스를 한 번에** 손대다가 기능이 꼬이는 것을 방지합니다.
- **작업 단위(수리 범위)** 와 **검증 단위(QA 범위)** 를 명확히 분리해, PR 단위로 안전하게 진행합니다.
- 토스 미니앱 환경(브릿지, 세션, 인앱결제, 라이트 테마 가이드 등)에서만 드러나는 회귀를 체크리스트로 누락하지 않습니다.

### 1.2 기본 원칙: 하이브리드 접근

| 축 | 원칙 | 이유 |
|----|------|------|
| **수리(리팩토링·정리)** | **레이어(폴더)별**로 묶는다 | `utils` / `hooks` / `services` / `components` / `server` / `supabase`처럼 **같은 종류의 변경**을 연속으로 하면 패턴이 반복되어 속도와 일관성이 좋아집니다. |
| **검증(QA)** | **탭·사용자 플로우별**로 진행한다 | 한 파일이 여러 화면을 동시에 묶고 있으므로(특히 `App.tsx`, 공통 훅), **“어느 화면까지 손댔는지”** 를 탭·시나리오로 확인해야 회귀를 놓치지 않습니다. |

**한 줄 요약:** *수리는 레이어(폴더)별로, 검증은 탭/플로우별로 진행한다.*

### 1.3 도메인 특성(토스 미니앱)

- **`isTossApp()` 분기:** 테마(예: 라이트 고정), 다크 모드 토글 비노출, `restorePendingIapOrders`, 뒤로가기·종료 시 TDS 확인 다이얼로그, `closeView` 브릿지 등이 웹과 다릅니다.
- **결제:** 인앱 결제·서버 이행·웹훅·Supabase 함수가 얽혀 있어 D단계 변경은 검증 비용이 큽니다.
- **라우팅:** 메인 앱은 `react-router-dom`에서 `App`이 대부분의 경로를 담당하고, **탭 상태(`activeTab`)** 와 **`/markets`**, **`#privacy` / `#terms`** 가 함께 쓰입니다. (`index.tsx` 참고)

---

## 2. 4단계 작업 페이즈 (Phase A ~ D)

각 페이즈는 **별도 PR(또는 PR 시리즈)** 로 나누는 것을 권장합니다. 한 PR에 A+B를 섞으면 리뷰·롤백이 어려워집니다.

### Phase A — 데드 코드 및 타입 정리 (저위험)

| 항목 | 작업 내용 (예시) |
|------|------------------|
| **범위** | 미사용 export·파일, 주석 처리된 옛 코드, `any` 축소·타입 좁히기, import·상수 정리, ESLint/TS 규칙 정리 |
| **위험도** | **낮음 ~ 중간** — 타입만 손대도 동작 동일해야 하나, 동적 import·문자열 기반 라우트·리플렉션에만 쓰이는 심볼 삭제 시 런타임 오류 가능 |
| **중점 확인** | 삭제 전 **전역 검색(`grep`)**, `npm run build`, 변경 파일이 **어느 탭에서 참조되는지** 한 줄 메모 |
| **QA 힌트** | 해당 폴더를 직접 쓰는 **대표 탭 1개**만 스모크 테스트해도 됨(전수는 불필요) |

**세부 분류(러프):** A1 데드 코드 / A2 `any`·타입 / A3 상수·i18n 딕셔너리 정리 / A4 린트·포맷 일괄

**진입점·탭 라우팅(`App.tsx` / `TabContent` 등) Phase A 시 추가 준수(워크스페이스 규칙 정렬):**

| 주제 | 기대 |
|------|------|
| **Union `switch` + WSOD 방지** | `activeTab` 등 문자열 유니온을 `switch`로 분기할 때 `default: return null`만 두지 말 것. `never` 기반 **exhaustive check**로 누락 케이스를 컴파일 타임에 잡고, 런타임 비정상 값에는 **폴백 UI**(예: 범용 로딩/안내 문구)를 반환해 하얀 화면을 방지할 것. |
| **무분별 `useMemo` vs 참조 안정화** | 단순 JSX(예: `Suspense`용 작은 `fallback` div)는 **`useMemo`로 캐시하지 말 것**. 탭 라우팅에서는 **실행 분기와 무관하게** 상단에서 fallback 엘리먼트를 여러 개 만들거나 동일 팩토리를 매 렌더 여러 번 호출하지 말고, **`React.memo` 소형 컴포넌트(`SuspenseFallback`)** 를 두고 **해당 `switch` 분기의 `Suspense` 안에서만** `<SuspenseFallback message={...} />` 로 선언할 것(`docs2/PHASE_A_ENTRY_SIMULATION.md` §0.4·§3.3). 반대로 **`React.memo` 자식에 넘기는 배열**(`activePortfolios`, `portfolios`, `closedPortfolios` 등)은 부모에서 `.filter()` 등으로 매 렌더 새 배열이 나오면 메모가 무력화되므로, **의도적으로 `useMemo`로 참조 동일성을 유지**할 것(같은 문서 §3.3 파일 B). |
| **`React.memo` + props** | 메모된 자식에 객체·배열 props를 줄 때는 부모에서 참조가 흔들리지 않게 설계할 것. `useCallback` 의존 배열에는 가능하면 **원시값**(`user?.id` 등)을 사용해 콜백 재생성을 줄일 것. **팀 규칙(명시적 deps·향후 훅 래핑 대비)** 에 따라 `setState` setter·`setActiveTab` 등 **본문에서 참조하는 심볼은 배열에 명시**할 것(같은 문서 §0.4). |
| **`react-hooks/exhaustive-deps`** | Core Principles의 lazy/band-aid 금지에 따라 **`eslint-disable`로 훅 린트 우회 금지**; 린트가 요구하면 **`replaceHashIfMatched` 등 순수 함수까지 예외 없이 의존 배열에 명시**할 것(`docs2/PHASE_A_ENTRY_SIMULATION.md` §3.3 파일 B 인용 블록). |
| **`useEffect`·nullable 문자열** | `string \| null` 등으로 올 수 있는 값에 대해 **`.trim()`·`.length` 전에 falsy·optional 방어** (`!value \|\| value.trim().length === 0` 등). 일일 요약 저장 effect는 `docs2/PHASE_A_ENTRY_SIMULATION.md` §3.5·§0.4 참고. |
| **비동기 실패·Silent failure** | Supabase 등 사용자 데이터에 영향 있는 실패는 `console.warn`만으로 끝내지 말고 **`showErrorToast` 등 전역 피드백**을 트리거할 것(문구는 `appShellMessages` 등 SSOT). |
| **Mutation mutex·브릿지 (Rule 11)** | 금융·포트폴리오 등 **비동기 Mutation**은 `disabled`만으로 부족할 수 있음. 진입점(`App.tsx` 등)에서 `TabContent`로 내려보내는 **모든 비동기 상태 변이**(업데이트·**파괴적 삭제/비우기** 포함)에 **1-tick 중복 제출 방지**를 적용할 것. Mutex 구현은 **`hooks/useMutexAction`** 으로 DRY·SRP 유지하고, 훅 내부는 **`await Promise.resolve(action(...args))`** 로 동기·비동기 혼합 호출을 수렴한다. 업데이트 액션 본문에서는 기존처럼 **`await Promise.resolve(handleUpdatePortfolio(...))`** 등을 유지할 수 있다. 실패 피드백은 **`showErrorToast` + `appShellMessages` SSOT** — *「다른 Mutation에도 동일 패턴을 검토」* 같은 **미완 계획 문구로 치명 경로를 남기지 말 것**(lazy/band-aid 금지). 상세: `docs2/PHASE_A_ENTRY_SIMULATION.md` §0.5·§0.7·§3.3.2·§3.3 파일 B·§3.6. |
| **디바운스·비동기 클로저 (Rule 7)** | `useEffect` + `window.setTimeout` 콜백 등 **비동기 클로저** 안에서 `user.id` 같이 **객체 필드**를 쓰면 TS가 **TS2531** 을 낼 수 있다. **`user?.id` 를 effect 본문에서 원시값(`currentUserId`)으로 캡처**한 뒤 콜백에는 그 값만 넘긴다(`docs2/PHASE_A_ENTRY_SIMULATION.md` §3.5·§0.7). |
| **브라우저 타이머 API (Rule 7)** | `useRef`에 디바운스·타이머 ID를 둘 때는 **`window.setTimeout` / `window.clearTimeout`** 으로 호출해 반환 타입을 브라우저 `number`에 맞출 것. 네이키드 `setTimeout`만 쓰면 `@types/node` 혼재 시 **`NodeJS.Timeout` vs `number` 추론 충돌**이 날 수 있음(`docs2/PHASE_A_ENTRY_SIMULATION.md` §3.5·§3.4 `NavIcon` 정렬). |
| **진입점 `import.meta`** | 디버그 라우트 등에서 개발 모드를 읽을 때는 **`import.meta.env?.DEV ?? false`** 를 쓴다. **`import.meta?.env` 는 금지** — `import.meta`는 메타 속성이라 **그 자체에 `?.` 를 붙이면 TS1303 등 파싱 오류**가 날 수 있다(`docs2/PHASE_A_ENTRY_SIMULATION.md` §3.1·§0.6). |
| **`lang`·앱 셸 딕셔너리 (확정)** | 현재 아키텍처에서 `lang` 은 **`'ko' \| 'en'` 으로만 통제**되며, 런타임에 제3의 문자열이 주입될 여지가 없다. 따라서 **정식 언어 추가 전까지** `APP_SHELL_MESSAGES[lang] ?? APP_SHELL_MESSAGES.ko` 처럼 **도달 불가능한 nullish 폴백(Dead Code)** 을 두지 않는다 — **`const copy = APP_SHELL_MESSAGES[lang]`** 만 사용한다(Core Principles·Dead Code 금지와 정합). 새 언어를 제품에 추가할 때는 **유니온 타입·딕셔너리 키·필요 시 폴백**을 그 시점에 일괄 설계한다(`docs2/PHASE_A_ENTRY_SIMULATION.md` §0.6·§3.2·§3.3·§3.6). |
| **매직 넘버·인라인 스타일** | 셸 UI(헤더 아이콘 크기, `marginTop: 2` 등)는 **파일 상단 상수** 또는 **Tailwind 유틸 클래스**로 의미를 드러낼 것. `style={{ ... }}` 객체는 메모 컴포넌트와 결합 시 리렌더 유발 가능성이 있으므로 가능하면 클래스로 대체할 것. |

**확정(비가역) — 탭 라우팅 `default` / TS 빌드와 런타임 UX 분리**

- **빌드(TS) 단계:** exhaustive 누락·`never` 좁히기 실패 등 **엣지 케이스는 ESLint·리팩터·타입 보강**으로 해결한다. 컴파일만을 위해 사용자 화면을 희생하지 않는다.
- **런타임(사용자 화면):** 어떤 경우에도 앱이 멈추거나 **하얀 화면(WSOD)** 이 나와서는 안 된다. `TabContent` 등 진입 탭 라우팅의 `default` 분기에서는 **반드시 범용 폴백 UI**를 렌더링한다(스니펫 기준: **`<SuspenseFallback message={copy.loadingGeneric} />`** 등과 동등). `throw`·`return null`만으로 빈 메인을 두지 않는다.
- **`lang` / `APP_SHELL_MESSAGES` (팀 확정):** 위 표 **`lang`·앱 셸 딕셔너리** 행과 동일 — **`?? APP_SHELL_MESSAGES.ko` 폴백 없이 `APP_SHELL_MESSAGES[lang]` 최종본**을 따른다.

> 상세 스니펫·드라이런: `docs2/PHASE_A_ENTRY_SIMULATION.md` 참고.

---

### Phase B — 공통 로직 정비 (고위험)

| 항목 | 작업 내용 (예시) |
|------|------------------|
| **범위** | 금융·포트폴리오·VR 관련 **`utils/`**, 데이터·세션·구독과 연결된 **`hooks/`**, Supabase·결제·토스·주식·Gemini 등 **`services/`** |
| **위험도** | **높음** — 한 함수 변경이 대시보드·백테스트·정산·알람 등 여러 화면에 동시에 파급 |
| **중점 확인** | 기존 **`vitest`**·`test:server`가 있으면 그 경로부터; `useEffect` 의존성·에러 삼키기 여부; 금액·수량 **0·NaN·divide-by-zero** |
| **QA 힌트** | 이 페이즈 PR에는 **도메인별 최소 시나리오(섹션 4)** 를 반드시 첨부 |

**세부 분류(러프):** B1 `utils`(계산·날짜·시장) / B2 `hooks` / B3 `services`(외부 API)

---

### Phase C — UI 및 화면 도메인 정리 (중~고위험)

| 항목 | 작업 내용 (예시) |
|------|------------------|
| **범위** | `components/` 내 **화면별·기능별** 모듈(대시보드, VR, 히스토리, 백테스트, 랜딩, 멤버십, 인증, TDS 어댑터, 광고 UI 등) |
| **위험도** | **중간 ~ 높음** — 인증·결제 진입 UI는 Phase D와 경계가 겹침; TDS 공통은 전 화면 확인 다이얼로그에 영향 |
| **중점 확인** | 워크스페이스 규칙: 하드코딩 문구·A11y·중첩 삼항 등; 토스에서만 타는 분기 재확인 |
| **QA 힌트** | **해당 도메인 체크리스트 전부** + 토스 스모크 1회 |

**세부 분류(러프):** C1 인증·프로필 / C2 대시보드·포트폴리오·모달군 / C3 VR·전략 폼 / C4 히스토리·정산 / C5 백테스트 / C6 랜딩·멤버십 / C7 광고·프리로드 / C8 TDS·토스트 공통

---

### Phase D — 백엔드 및 Edge 함수 (최고위험)

| 항목 | 작업 내용 (예시) |
|------|------------------|
| **범위** | `server/src`(Fastify: 토스 인증·결제·웹훅·스마트메시지 등), `supabase/functions/*` |
| **위험도** | **매우 높음** — 결제 이행 실패, 중복 청구, 알람 미발송, 계정 삭제 오류 등 **금전·알림·개인정보** 직결 |
| **중점 확인** | 멱등성, 웹훅 서명·재시도, 로그(`correlationId`), 롤백·배포 순서 문서화 |
| **QA 힌트** | **스테이징·샌드박스**에서 결제·구독·웹훅 시나리오 필수; 운영 배포는 변경 범위별 체크리스트 서명 권장 |

**세부 분류(러프):** D1 `server` 라우트·서비스 / D2 Supabase Edge / D3 배포·시크릿·모니터링

---

## 3. 도메인 ↔ 폴더 매핑 표 (Mapping Matrix)

아래는 **`App.tsx`의 `activeTab`·`index.tsx` 라우트** 를 기준으로 한 **1차 매핑**입니다. 실제 import는 컴포넌트 내부에서 더 깊게 연결되므로, 작업 시 **추가 grep** 으로 보완합니다.

### 3.1 진입점 요약

| 진입 | 설명 |
|------|------|
| 탭 `dashboard` | 로그인 시 `Dashboard`, 비로그인 시 `Landing` |
| 탭 `markets` | `Markets` (`/markets` 경로로 진입 시 동일) |
| 탭 `history` | `History` (종료 포트폴리오) |
| 탭 `backtest` | `Backtest` — **현재 하단 네비 UI는 비활성(준비 중 안내)** 이지만 코드상 탭·Lazy 로드 존재 |
| 탭 `pricing` | `Pricing` + (조건부) `CheckoutModal` |
| 탭 `privacy` / `terms` | `Privacy` / `Terms`, 해시 `#privacy` / `#terms` |
| 경로 `/posts`, `/posts/:id` | 게시판 — **웹 전용**, 토스 미니앱에서는 일반적으로 미노출 (`App.tsx` 기준) |
| 전역 | `AuthModalCoordinator`, 광고(`AdPreloadProvider`), TDS 다이얼로그, 세션 만료 게이트, 푸터 등 |

### 3.2 매핑 매트릭스

| 도메인 / 화면 | 진입 (탭·경로·해시) | 주요 `components/` | 주요 `hooks/` | 주요 `services/`·기타 프론트 | `server/src` | `supabase/functions` (관련 시) |
|---------------|---------------------|--------------------|---------------|------------------------------|--------------|----------------------------------|
| 랜딩·온보딩 | `dashboard` + 비로그인 | `Landing.tsx`, `LandingHero.tsx` | `useAuth` | `supabase.ts` | — | — |
| 대시보드·포트폴리오·VR·알람·거래 입력 | `dashboard` + 로그인 | `Dashboard.tsx`, `StrategyCreator.tsx`, `portfolio/*`, `strategies/*`, `VrOrderModal.tsx`, `VrPortfolioSummary.tsx`, `AlarmModal.tsx`, `QuickInputModal.tsx`, `TradeExecutionModal.tsx`, `AIImageInputModal.tsx`, `SettlementModals.tsx` | `usePortfolios`, `useAuth`, `useTierDisplay`, `useVrOrders`, `useFCMToken` | `supabase.ts`, `stockService`, `geminiService`, `utils/*` | — | `send-alarm`, `check-and-trigger-alarms`, `push-notification`, `refresh-vr-snapshots`, `generate-daily-execution-summaries`, `gemini` |
| 시장 | `markets`, `/markets` | `Markets.tsx` | (공유 훅) | `stockService`, `subscriptionUtils` | — | `update-stock-prices` |
| 히스토리·종료 상세 | `history` | `History.tsx`, `HistoryHeaderActions.tsx`, `PortfolioDetailsModal.tsx` | `usePortfolios` | `supabase.ts` | — | — |
| 백테스트 | `backtest` (네비 비활성) | `Backtest.tsx` | — | `utils/*`(계산), `geminiService`(해당 시) | — | — |
| 멤버십·결제 UI | `pricing` | `Pricing.tsx`, `CheckoutModal.tsx` | `useAuth` | `payment/*`, `tossIapService.ts` | `routes/payment.ts` | `verify-payment`, `payment-webhook`, `reconcile-subscriptions`, `cancel-subscription` |
| 인증·프로필·세션 | 헤더 프로필 버튼, `/auth/reset-password` | `auth/*`, `AuthModals.tsx`, `TossLoginView.tsx`, `SessionExpiredAlertGate.tsx` | `useAuth` | `supabase.ts`, `toss/*`, `tossAppBridge.ts`, `utils/authHelpers.ts`, `utils/supabaseAuthStorage.ts` | `routes/tossAuthRoute.ts`, `routes/tossDisconnectCallbackRoute.ts`, `toss/*` | `delete-account` |
| 법무·정책 | `privacy`, `terms`, `#privacy`, `#terms` | `Privacy.tsx`, `Terms.tsx`, `Footer.tsx` | — | — | — | — |
| 광고·토스 쉘 | 전역 | `services/ads/*` (예: `AdPreloadProvider`, `globalAdManager`) — `App.tsx`에서 조합 | `useAdPreload`(Provider 내부) | `tossIntegratedFullScreenAdApi.ts`, `tossAppBridge.ts` | — | — |
| 공통 다이얼로그·토스트 | 전역 | `tds-adapter/*`, `tds/TDSModal.tsx` | `useAsyncTdsConfirm` | `constants/tdsDialogMessages.ts` | — | — |
| 게시판(웹) | `/posts` | `features/board/*` | — | — | — | — |
| 앱 껍데기·오케스트레이션 | `*` → `App` | `App.tsx`, `contexts/TossAppContext.tsx` | 위 훅 다수 조합 | 위 서비스 다수 조합 | — | 클라이언트에서 직접 호출하는 테이블 RPC 등 |

> **참고:** `App.tsx`는 `daily_execution_summaries` 등 **Supabase 클라이언트 직접 호출**을 포함합니다. Phase B/C에서 `App.tsx`를 건드릴 때는 **대시보드 + 로그인 상태** QA를 필수로 넣습니다.

---

## 4. 도메인별 QA 체크리스트 (토스 미니앱 필수 고려)

머지 전 **해당 PR이 건드린 도메인** 행만 전부 체크합니다. (전부 해당 시 전체 실행)

### 4.1 공통 — 토스 미니앱 환경

- [ ] 토스 샌드박스(또는 실기기 미니앱)에서 앱 **최초 진입** 후 화면이 정상 로드된다.
- [ ] **백그라운드 → 포그라운드** 전환 후에도 로그인 상태·포트폴리오 목록이 비정상 초기화되지 않는다.
- [ ] 미니앱에서 **뒤로가기/종료** 시(TDS 확인이 있는 플로우) 다이얼로그가 뜨고, 취소·확인 동작이 기대와 같다.
- [ ] 라이트 테마 고정 등 **토스 UI 가이드**와 충돌하는 회귀가 없다(다크 토글은 웹만 해당).
- [ ] (결제 PR인 경우) **인앱 결제·복원** 플로우: 상품 선택 → 결제/취소 → 프로필 티어·혜택 반영. **미완료 주문 복원**(`restorePendingIapOrders`) 관련 회귀 확인.

### 4.2 공통 — 웹(선택·회귀 방지)

- [ ] 일반 브라우저에서 동일 시나리오 스모크(특히 다크 모드·`/posts`·게시판 링크).

---

### 4.3 도메인별 최소 시나리오

#### 랜딩·온보딩

- [ ] 비로그인 상태에서 대시보드 탭에 랜딩이 보인다.
- [ ] 로그인·회원가입 모달 진입·닫기가 정상이다.

#### 대시보드·포트폴리오·VR·알람·거래

- [ ] 포트폴리오 목록 로드·생성·수정·삭제(권한 내)가 된다.
- [ ] 상세 모달·퀵 입력·체결·AI 입력(해당 티어) 중 PR에서 수정한 경로만큼 실행한다.
- [ ] VR 관련 화면/저장이 된다.
- [ ] 알람 저장이 되고(제한 정책 포함), 필요 시 서버/Edge와 연동되는 부분이 오류 없다.
- [ ] 종료·정산 플로우에서 금액·수익률 표시가 비정상이 아니다.

#### 시장

- [ ] 시세 탭(및 `/markets` 진입)에서 데이터·유료 시세 게이트가 기대와 같다.

#### 히스토리

- [ ] 종료 포트폴리오 목록·상세·삭제/비우기 중 PR 범위 내 동작이 정상이다.

#### 백테스트

- [ ] (백테스트 코드/계산 utils를 수정한 경우) 입력·결과·티어 게이트가 정상이다. *(UI 네비가 비활성인 경우에도 직접 진입·테스트 경로가 있으면 동일)*

#### 멤버십·결제

- [ ] 요금제 화면 진입, 로그인 요구 분기, 업그레이드 → 체크아웃 모달까지 이어진다.
- [ ] **토스:** 결제 성공/실패/취소 후 프로필·혜택(`fetchUserProfile` 등)이 일관된다.
- [ ] **서버/웹훅/Edge를 수정한 경우:** 스테이징에서 웹훅·구독 검증·재조정 함수를 별도 시나리오로 검증한다.

#### 인증·프로필·세션

- [ ] 로그인·로그아웃·프로필 열기·비밀번호 재설정 경로(`#/auth/reset-password` 유입 포함).
- [ ] 세션 만료 게이트가 의도대로 동작한다.
- [ ] (토스 연동 수정 시) 토스 로그인·연동 해제·콜백 관련 회귀.

#### 법무·정책

- [ ] 푸터 또는 링크로 이용약관·개인정보 처리방침 진입, 뒤로가기(토스 확인 포함) 후 탭 상태가 꼬이지 않는다.

#### 광고

- [ ] 전면 광고 노출·실패 시 앱이 멈추지 않는다(배치 키 변경 시 해당 배치 위치에서 재확인).

#### 공통 다이얼로그·토스트

- [ ] 확인/알림/에러 토스트가 PR에서 건드린 플로우에서 정상이다.

#### 게시판(웹)

- [ ] `/posts` 목록·상세가 PR 범위에서 깨지지 않는다.

---

## 5. 운영 팁 (선택)

- **PR 설명 템플릿:** `Phase: [A|B|C|D]`, `Folders touched: …`, `QA: 섹션 4 중 [체크한 도메인]`.
- **작은 PR:** 같은 페이즈라도 폴더 단위로 쪼개면 리뷰·롤백이 쉽습니다.
- **금융 로직:** Phase B에서 `utils`를 수정하면 백테스트·대시보드·정산을 한 묶음으로 QA에 적습니다.

---

## 6. 문서 메타

| 항목 | 내용 |
|------|------|
| 기준 코드 위치 | 루트 `App.tsx`, `index.tsx`, `components/`, `hooks/`, `services/`, `server/src/`, `supabase/functions/` |
| 갱신 시점 | 탭·라우팅 구조 또는 폴더 대규모 이동 시 이 표(§3)를 반드시 업데이트 |

---

*이 문서는 사내 출시 전 코드 품질 계획용이며, 법적·회계적 조언이 아닙니다.*
