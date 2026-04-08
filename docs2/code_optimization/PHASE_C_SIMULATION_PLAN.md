# PHASE C 시뮬레이션 계획서

## 0. 문서 상태

- 이 문서는 **Phase C: 도메인별 UI 컴포넌트 정비 및 상세 로직 통합**을 위한 **시뮬레이션 계획서**입니다.
- 현재 단계는 **문서화 전용**이며, 시니어 아키텍트 및 PO 승인 전까지 **`components/**`, `hooks/**`, `services/**` 실제 소스 수정은 금지**합니다.
- Phase B(전역 오케스트레이션 및 코어 모달 정비)는 종료된 것으로 간주하고, Phase C는 **도메인 단위 UI 정비 + 세부 로직 결속도 해소**에만 집중합니다.
- 본 계획서는 **11대 Core Principles** 를 전부 준수하는 방향만 채택하며, 비즈니스 가치가 약한 과잉 추상화는 명시적으로 배제합니다.

## 1. Phase C 전역 고정 원칙

1. **Financial Math**: 금액 표시는 `Number.EPSILON` 반올림을 전제로 하며, `0` 또는 비정상 입력은 안전 폴백으로 닫습니다.
2. **React Anti-Patterns**: JSX의 3중첩 삼항은 helper/view-model 함수로 평탄화합니다. 작은 O(1) 계산을 `useMemo`로 감싸는 행위는 금지합니다.
3. **Strict I18N**: JSX 및 컴포넌트 본문에 한국어/영어 생텍스트를 남기지 않습니다. 도메인별 메시지 SSOT를 둡니다. `get…Messages(lang)` 등 메시지 접근은 **§1.2 안정 참조(모듈 레벨 캐시)**를 만족해야 하며, 동일 `lang` 입력에 대해 매 호출마다 새 객체를 `return { … }`로 만들어 반환하는 패턴은 금지합니다.
4. **A11y**: 클릭 가능한 비시맨틱 요소는 `role`, `tabIndex`, `onKeyDown`, `aria-label`을 함께 갖춥니다.
5. **DRY/SRP**: 도메인 뷰는 렌더링만 담당하고, 계산/게이트/상태 전이는 controller 또는 pure helper로 이동합니다.
6. **Clean Code**: Guard Clause, Optional Chaining, 명시적 fallback으로 depth를 낮추고 WSOD 가능성을 차단합니다.
7. **Strict TS**: `any`, non-null assertion, 느슨한 캐스팅 남발을 금지합니다. 필요 시 `unknown` + type guard로 좁힙니다.
8. **Naming / Magic Numbers**: 기간, 퍼센트, 카드 개수, 오프셋 등 의미 없는 숫자는 상수화합니다.
9. **Mutex**: 결제, 실행, 업그레이드, 상세 삭제 같은 비동기 액션은 `useRef` 기반 동기 락 또는 기존 `useMutexAction`으로 잠급니다.
10. **상태 공존 원칙**: Toss 전용 UI 분기와 일반 웹 분기는 남기되, 스타일/문구/액션 결정은 view-model 함수에서 먼저 닫습니다.
11. **비목표**: XState, React Hook Form, 전역 스토어 신규 도입, 범용 디자인 시스템 재구축, 가상 스크롤 도입은 Phase C 기본 범위에서 제외합니다. **I18N 메시지 모듈용 개발 전용 캐시 무효화·클리어 코드**도 추가하지 않으며, 로컬 검증은 §**1.2**의 **F5 전체 새로고침** 관행으로 처리합니다.
12. **하이브리드 에러 노출(토스·웹 공통)**: 미니앱 WebView·브라우저를 아우르는 UX에서는 **`window.alert`를 사용하지 않습니다.** 에러 안내는 **`showErrorToast`**(`@/components/tds-adapter/showErrorToast` 계약)로 통일합니다. 결제 등 도메인 문구는 **SSOT 문자열만** 전달하며, 뷰에서 **`?? '영문 폴백'`** 으로 번역 누락을 숨기지 않습니다(누락은 타입·빌드·QA로 차단).
13. **비동기 DOM 핸들러**: `async` 클릭 등은 **`onClick={() => void handler()}`** 형태만 허용하여 **`@typescript-eslint/no-misused-promises`** 를 충족합니다. 해당 규칙을 **`eslint-disable`** 로 끄는 것은 **금지**입니다.

### 1.1 아키텍트 리뷰 반영 요약 (스니펫 정정)

아래 항목은 **초안 스니펫 대비** 원칙 위반이었으며, **본 문서의 To-Be Snippet에 반영 완료**했습니다. 실제 앱 소스는 여전히 수정하지 않습니다.

| 구분 | 판단 | 반영 내용 |
|------|------|-----------|
| **Rule 10** | 동의 | `map` 내부 `onSelect={() => {}}`, `tiers.map` 안 매 행 `handleClick` 신규 생성 등 **인라인/루프 클로저 제거**. 부모 `useCallback` + `React.memo` 행 컴포넌트(`StockCard`, `TierCard`)로 분리. C5 `HistoryRecordCard`도 동일 패턴(행 컴포넌트 + `useCallback`)으로 스니펫 정합. |
| **Rule 6 (key)** | 동의 (보완) | 배열 `index`만으로 key를 만드는 패턴 폐기. **루프 슬롯 + 원본 슬롯**을 포함한 명시 id(`ticker-loop-{n}-slot-{m}`)로 안정화. **`defaultTickers` 내 동일 티커 중복 시** id 충돌 가능 — 구현 시 중복 불가 전제 또는 `slot` 인덱스 필수. |
| **Rule 11 / 설계 블랙박스 (C3)** | 동의 | 주석만 남기는 **추상화 도피 금지**. **`BacktestController`**에 `executeRemoteSimulation`과 함께 **`notifyError(message: string)`** 를 명시하고, `executeBacktest`의 `catch`에서 **`controller.notifyError(copy.errorRunFailed)`** 를 호출해 외부 알림(현재는 `showErrorToast` 등으로 주입)을 스니펫에 강제합니다. Phase D 전역 에러 채널 연동 시 구현체만 교체하면 됩니다. |
| **Rule 1 & Rule 5 (금융 수학, C2·C5)** | 동의 | **`getRounded`** 로 EPSILON 반올림을 한곳에 두고, **`formatUsdValue` / `formatSignedPercent` / `formatSignedUsdValue`** 로 금액·%·부호 달러를 캡슐화합니다. 달러 변동·손익은 **`formatSignedUsdValue`**, Tone·`isProfitPositive`는 **반올림 후** 비교합니다(실제 구현 시 `src/utils/financialCalculations.ts` 등 단일 모듈로 승격 권장). |
| **Rule 1 (로캘, C2·C5 `formatUsdValue`)** | 동의 | `$` 접두를 쓰는 한 **숫자 그룹핑·소수점 표기는 시스템 로캘에 맡기면 안 됩니다.** `toLocaleString(undefined, …)` 금지 → **`toLocaleString('en-US', …)`** 로 미국식 고정. 유럽 로캘 기기에서 `$1.000,50` 형태 붕괴를 방지합니다. |
| **Rule 1 (`formatSignedPercent`, -0)** | 동의 | `rounded >= 0 ? '+' : ''` 는 **`-0`이 `>= 0`으로 참**이 되어 `+`와 `toFixed`의 `-0.00`이 결합되는 **`+-0.00%`** 버그를 유발합니다. **`Object.is(rounded, -0) \|\| rounded === 0`이면 `0.00%`**, 양수만 `+` 접두, 음수는 `toFixed`의 `-`에 맡깁니다(C2·C5 스니펫). |
| **Rule 1 (달러 부호·Tone, C2·C5)** | 동의 | 변동액·손익 금액에 **`>= 0 ? '+'` + `formatUsdValue(Math.abs(...))`** 를 쓰면 **`-0` → `+$0.00`** 및 **`getChangeTone(원시값)` vs 표시 반올림 불일치**(초록색 + $0.00)가 납니다. **`formatSignedUsdValue`** 로 부호·`-0`·`$0.00`을 일원화하고, **`getChangeTone`은 `getRounded` 이후**로 판별합니다. 손익 **`isProfitPositive`도 `getRounded(profit) >= 0`** 로 맞춥니다. |
| **Rule 2 (Blind useMemo / 헛 useCallback, C1·C2)** | 동의 | **`DashboardHeader`가 `React.memo`가 아닐 때 `headerVm`만 `useMemo`** 하면 이득이 없습니다. **`DashboardPortfolioCardHost`** 도 **`<article>` 등 메모되지 않은 DOM만 쓰면 `vm`용 `useMemo`는 Blind** — **`buildDashboardPortfolioCardVm(portfolio, copy)` 즉시 호출**로 둡니다. C1 **`getCardAriaLabel` `useCallback`** 은 **인라인 보간**으로 제거합니다. |
| **Rule 11 (C2 퀵 입력)** | 동의 | **`handleOpenQuickInput`의 `try/finally`에 `catch` 없음**이면 비동기 실패가 침묵합니다. **`catch`에서 로깅 + `showErrorToast(copy.systemError)`**(대시보드 SSOT, 영문 폴백 금지). |
| **Rule 10 (C2 onClick, 비동기)** | 동의 | **`async` 핸들러**를 DOM에 넘길 때는 **`onClick={() => void handleOpenQuickInput()}`** 형태의 **인라인 `void` 래퍼**를 허용합니다(`no-misused-promises` 준수). **동기** 핸들러는 **`onClick={fn}`** 직접 참조가 가능합니다. **`eslint-disable`로 규칙 무력화는 금지**합니다. |
| **Rule 11 (C4 CheckoutModal)** | 동의 | **비즈니스 실패**(`success: false`, 잔액 부족 등): **`showErrorToast(copy.paymentFailed)`** 만 호출하고 **`onClose()` 금지** — 모달을 열어 둔 채 다른 결제 수단·재시도 UX를 허용합니다. **시스템/네트워크 예외**(`catch`): **`showErrorToast(copy.systemError)`** 후 **`onClose()`** 로 갇힘 방지. **`window.alert` 금지**(§1 원칙 12). **`copy.systemError ?? '…'` 영문 폴백 금지**(Rule 3). |
| **Rule 2·11 (C4 `finally` + `setState`)** | 동의 | 성공·`catch`에서 **`onClose()`** 후 **`finally`의 `setIsProcessing(false)`** 는 **이미 언마운트된 컴포넌트에 대한 상태 변이**로 경고·누수 소지가 있습니다. **`isUnmounted` 플래그**로 **`onClose()` 호출 경로에서는 `setIsProcessing` 생략**, ref 정리는 유지합니다. |
| **Rule 1 (C3 `amountUsd` 0)** | 동의 | **`normalizePositiveIntegerInput`이 `parsed < 0`만 막으면 `0`이 통과**해 원격 엔진에 **`amountUsd: 0`** 이 전달될 수 있습니다(분모 0·루프 위험). **`parsed <= 0`**(또는 동등 가드)으로 **양의 정수만** 통과시키고 **그 외는 fallback**합니다. |
| **Rule 10 (C1 `buildLoopedStockItems`)** | 동의 | 렌더 본문에서 **`buildLoopedStockItems(copy.defaultTickers)`** 를 매번 호출하면 O(N) 객체·배열이 **매 프레임 재생성**됩니다. **참조 안정**한 **`copy.defaultTickers`** 를 의존성으로 하는 **`useMemo`** 로 결과를 캐시합니다(맹목적 `useMemo` 금지와 구별되는 **정당한** 사용). |
| **Rule 3 (C1 StockCard)** | 동의 | `{isSelected ? <span aria-hidden>selected</span>}` 등 **영문 생텍스트**는 `aria-hidden`이어도 시각 노출·번역 누락으로 위반입니다. **`copy.selectedLabel`**(마켓 메시지 SSOT)만 사용합니다. |
| **Rule 4 (C3 입력)** | 동의 | `type="range"`·`type="text"` 입력에 **`<label>` 연동 또는 `aria-label`** 필수. To-Be 스니펫은 **`copy.monthsInputAria`**, **`copy.amountInputAria`**(백테스트 메시지 SSOT)를 사용합니다. |
| **Rule 6 & SRP (C5 reduce)** | 동의 | `invested` 누적 `reduce` 내부의 **한 줄 삼항 압축**을 금지하고, **`trade.type !== 'buy'` Early Return** + **`tradeCost` / `feeCost`** 줄 단위 분리로 인지 부하를 낮춥니다. |
| **Rule 2 (맹목적 useMemo)** | 동의 | `useMemo(() => copy.tiers, [copy])` 제거 → **`const tiers = copy.tiers`** 즉시 참조. TierCard 내부 **`getTierCtaState`는 O(1)** 이므로 `useMemo` 없이 즉시 평가(리뷰안의 `useMemo(ctaState)`는 Rule 2와 충돌하여 **채택하지 않음**). C3 **`isBenchmarkLocked`** 도 동일하게 O(1)이므로 **`useMemo` 없이** `shouldGateBenchmark(currentTier)` 직접 할당. |
| **메시지 객체 / stockCardCopy** | **§1.2로 종결** | 엔지니어링 표준에 따라 `get…Messages(lang)`는 **모듈 캐시로 안정 참조**를 강제합니다. UI에서는 **`const copy = getMarketMessages(lang)`만** 사용하고, 필드만 골라 담은 파생 객체(`stockCardCopy`)를 만들지 않습니다. 자식 `React.memo`에는 **동일 `copy` 참조**를 그대로 전달합니다(§1.2, C1 스니펫). |

---

### 1.2 [Engineering Standard] 다국어(I18N) 메시지 객체 — 안정 참조(Stable Reference) 강제

**배경:** Phase C에서 `React.memo`·`useCallback`으로 행 단위 렌더 비용을 줄이더라도, `get…Messages(lang)`가 호출마다 **새 객체 참조**를 반환하면 부모가 렌덜될 때마다 메시지 prop이 매번 “바뀐 것”으로 간주되어 **연쇄 재렌더(Cascading Re-render)**가 발생합니다.

**목적:** 앱 기동 시 또는 **언어(`lang`)가 바뀔 때에만** 해당 언어의 메시지 객체를 생성하고, 그 외에는 **항상 동일한 메모리 주소(참조)**를 재사용하도록 `constants/messages/*.ts`에 강제합니다.

**핵심 원칙**

| 원칙 | 내용 |
|------|------|
| **Zero-Recreation** | 동일 `lang`에 대해 `get…Messages(lang)`가 매번 `return { … }`로 **새 객체를 만들어 반환하면 안 됩니다.** |
| **Stable Reference** | 다국어 사전 객체는 **모듈 레벨 캐시**에 보관하고, 어떤 컴포넌트에서 호출하든 **같은 `lang`이면 같은 참조**를 돌려줍니다. |
| **Deep Compare 금지** | 렌더 경로에서 메시지 내용을 깊게 비교하지 않습니다. **참조 동일성(`===`)**만으로 memo·자식 최적화가 성립해야 합니다. |

**팀 최종 결정 (HMR · 중첩 트리)** — 아래는 추가 코드 없이 **관행·데이터 형태**만으로 봉합합니다.

1. **HMR / 로컬 개발:** `constants/messages/*.ts`를 수정한 뒤 화면에 반영이 이상하면 **브라우저 F5(전체 새로고침)**으로 검증합니다. **개발 전용 캐시 무효화 로직·훅·환경 분기 코드를 넣는 것은 금지**합니다(Phase C에서의 오버 코딩·비목표).
2. **중첩 메시지 트리:** `get…Messages(lang)`가 돌려주는 **최상위(Root) 객체 한 덩어리**만 `lang` 키로 모듈 캐시에 둡니다. `checkout`, `sections` 등 **하위 브랜치마다 별도 캐시 맵·getter를 두는 패턴은 엄격히 금지**합니다. `create*(lang)` 안에서 **중첩 포함 전 트리를 한 번에** 조립해 루트 객체에 실어 넣으며, 동일 `lang`에 대해 루트 참조가 바뀌지 않게 합니다(하위만 따로 캐시하면 자식 prop 참조 안정성이 깨질 수 있음).

**구현 표준 (모듈 레벨 캐싱 패턴)** — 아래는 `marketMessages.ts` 예시이며, `getCommonMessages`, `getDashboardMessages`, `getBacktestMessages`, `getPricingMessages`, `getHistoryMessages` 등 **`constants/messages/` 전 파일**에 동일 패턴을 적용합니다. **Strict TS: non-null assertion(`!`) 금지** — 캐시 조회 후 `null`/`undefined`는 분기로 처리합니다. (`PricingMessages`처럼 `checkout` 등 **중첩 필드가 있으면** `createPricingMessages` **한 함수 안에서** 루트와 하위 객체를 함께 생성·고정합니다.)

```ts
// constants/messages/marketMessages.ts
import type { AppLang } from '@/types';

export interface MarketMessages {
  priceLabel: string;
  chartEmpty: string;
  chartLoading: string;
  defaultTickers: readonly string[];
  sectionTitle: string;
  scrollLeftAria: string;
  scrollRightAria: string;
  paidOnlyLabel: string;
  rsiLabel: string;
  bondNoticeBadge: string;
  bondNoticeTitle: string;
  bondInfoOnly: string;
  /** 카드 선택 시 시각 표시용(한/영 SSOT). `aria-hidden`이어도 생영문 금지. */
  selectedLabel: string;
}

const messageCache: Partial<Record<AppLang, MarketMessages>> = {};

function createMarketMessages(lang: AppLang): MarketMessages {
  if (lang === 'ko') {
    return {
      priceLabel: '…',
      chartEmpty: '…',
      chartLoading: '…',
      defaultTickers: ['QQQ', 'TQQQ'],
      sectionTitle: '…',
      scrollLeftAria: '…',
      scrollRightAria: '…',
      paidOnlyLabel: '…',
      rsiLabel: '…',
      bondNoticeBadge: '…',
      bondNoticeTitle: '…',
      bondInfoOnly: '…',
      selectedLabel: '…',
    };
  }

  return {
    priceLabel: '…',
    chartEmpty: '…',
    chartLoading: '…',
    defaultTickers: ['QQQ', 'TQQQ'],
    sectionTitle: '…',
    scrollLeftAria: '…',
    scrollRightAria: '…',
    paidOnlyLabel: '…',
    rsiLabel: '…',
    bondNoticeBadge: '…',
    bondNoticeTitle: '…',
    bondInfoOnly: '…',
    selectedLabel: '…',
  };
}

export function getMarketMessages(lang: AppLang): MarketMessages {
  const cached = messageCache[lang];
  if (cached != null) {
    return cached;
  }
  const created = createMarketMessages(lang);
  messageCache[lang] = created;
  return created;
}
```

**금지 패턴 (AS-IS):** `export function getX(lang) { if (lang === 'ko') return { … }; return { … }; }` 처럼 **캐시 없이 매 호출 객체 리터럴 반환**.

**UI 측 평탄화:** 캐시 표준이 적용되면 `const copy = useMemo(() => getMarketMessages(lang), [lang])` 류는 불필요합니다. **`const copy = getMarketMessages(lang);`** 로 둡니다.

**Action Items (구현 착수 시)**

1. `constants/messages/**` 전수 검사 후 위 캐시 패턴으로 마이그레이션(**루트 단일 캐시·중첩은 `create*` 일괄 조립** 준수).
2. 컴포넌트 내 **메시지 getter 전용 `useMemo`** 제거 및 평탄화. **예외:** O(N) 파생 배열·객체를 매 렌더마다 새로 만들면 **참조 동일성이 깨져 자식이 불필요하게 재렌더**되므로, C1의 `buildLoopedStockItems(copy.defaultTickers)` 처럼 **비용·참조가 문제되는 파생 데이터**는 `copy.defaultTickers` 등 **안정 참조**를 의존성으로 한 **`useMemo`가 정당**합니다(Rule 10·§2 C1 스니펫).
3. **PR Merge 조건 (Phase C 구현 PR):** 위 규칙이 적용되어 `React.memo`가 메시지 prop 기준으로 기대대로 동작함이 리뷰에서 확인된 경우에만 승인합니다.
4. **개발 관행:** 메시지 파일 수정 후 이슈 시 **F5 전체 새로고침**; **캐시 클리어용 코드 추가는 하지 않음**.
5. **백테스트 사전에 `errorRunFailed` 키 추가 필수** — C3 `BacktestController.notifyError(copy.errorRunFailed)` 및 To-Be 스니펫의 전제 조건입니다(`constants/messages/backtestMessages` 등 `getBacktestMessages` SSOT).
6. **백테스트 사전에 `monthsInputAria`, `amountInputAria` 키 추가 필수** — C3 range/text 입력의 **`aria-label`**(Rule 4) 전제입니다.
7. **마켓 사전에 `selectedLabel` 키 추가 필수** — C1 StockCard 선택 표시의 Rule 3 준수 전제입니다.
8. **결제(`getPricingMessages`·`checkout`)에 `paymentFailed`, `systemError` 키 추가 필수** — C4 `CheckoutModal`의 **`showErrorToast`** 인자로만 사용합니다. **뷰 단 영문 폴백(`?? '…'`)은 금지**이며, 키 누락은 **타입·빌드·QA**에서 차단합니다(Rule 3·§1 원칙 12).
9. **대시보드 사전(`getDashboardMessages`)에 `systemError` 키 추가 필수** — C2 `DashboardPortfolioCardHost` 퀵 입력 실패 시 **`showErrorToast(copy.systemError)`** 전제입니다(결제 `checkout.systemError`와 **모듈·스코프가 다름**).

**정량 주장에 대해:** 표준문에 “렌더 부하 40% 이상 절감” 등이 언급될 수 있으나, **실제 수치는 프로파일링으로 검증**하는 것을 권장합니다(계획서는 아키텍처 규칙만 명시).

---

## 2. 도메인별 시뮬레이션

### C1. Markets 도메인

- **[Target]:** `components/Markets.tsx` / `StockCard` / `CustomTooltip`
- **[As-Is 결함]:**
  - `lang === 'ko' ? ... : ...` 형태의 인라인 다국어 분기가 `RSI` 주의문구, 차트 empty state, 섹션 제목, 스크롤 aria-label, 보유 종목 empty 문구 등 여러 지점에 흩어져 있습니다.
  - `chartData.length > 0 ? ... : isLoading ? ... : ...` 형태의 중첩 삼항이 남아 있어 Rule 2 위반입니다.
  - `el.children as unknown as HTMLElement[]` 같은 비정밀 DOM 캐스팅이 남아 있어, 현재 파일에 노출된 `any`는 없더라도 Strict TS 목표가 완결되지 않았습니다.
  - `Price`, `MA 20`, `MA 60`, `PRO/PREMIUM 전용`, `Stock Info` 등 UI 카피가 메시지 SSOT가 아니라 JSX/컴포넌트 내부에 산재합니다.
  - `loopedStocks.map((ticker, idx) => key=\`${ticker}-${idx}\`)` 는 필터/반복 카드 재배치 시 key 안정성을 약화시킬 수 있습니다.
  - 날짜 포맷, RSI 안내, 차트 상태 문구, 마켓 status badge 결정이 렌더 본문과 이벤트 처리에 뒤섞여 SRP가 흐려져 있습니다.
  - **`buildLoopedStockItems(copy.defaultTickers)`** 를 렌더 본문에서 매번 호출하면 O(N) 객체·배열이 **매 렌더 재생성**되어 Rule 10(성능·참조 안정성)에 취약합니다. To-Be 스니펫은 **`useMemo(..., [copy.defaultTickers])`** 로 캐시합니다.
  - StockCard 등에 **`selected`** 같은 **영문 생텍스트**가 남으면 Rule 3 위반이며, **`copy.selectedLabel`** SSOT로 치환해야 합니다.
  - **`cardAriaLabel`용 `useCallback`을 두고 map 본문에서 매 행 즉시 호출**하면 Rule 2(맹목적 최적화)에 가깝습니다. To-Be 스니펫은 **인라인 문자열 보간**으로 제거합니다.
- **[🔥 오버 코딩 검토]:**
  - 채택: `constants/messages/marketMessages.ts` 신설(§**1.2 모듈 레벨 캐시**로 `getMarketMessages` 안정 참조 준수), 차트 상태/RSI 경고/badge/view-model helper 분리, DOM child 추출 helper 추가.
  - 비채택: 차트 라이브러리 교체, 무한 캐러셀 엔진 재구축, 전역 theme 토큰화. 이는 Phase C 목적 대비 과합니다.
  - 결론: **I18N 정합성, 렌더 뎁스 감소, TS 안전성 강화는 직접적인 비즈니스 가치가 있으므로 수행**하고, 시각 효과 전면 재설계는 제외합니다.
- **[To-Be Snippet]:**

```tsx
import React, { useCallback, useMemo, useState } from 'react';
import type { AppLang, StockData } from '@/types';
import { getCommonMessages } from '@/constants/messages/commonMessages';
import { getMarketMessages } from '@/constants/messages/marketMessages';

const LOOP_COPY_COUNT = 3;
const RSI_PERCENT_MIN = 0;
const RSI_PERCENT_MAX = 100;

type MarketMessagesCopy = ReturnType<typeof getMarketMessages>;

interface LoopedStockItem {
  id: string;
  ticker: string;
}

function clampPercent(value: number): number {
  return Math.min(Math.max(value, RSI_PERCENT_MIN), RSI_PERCENT_MAX);
}

function getChartStateLabel(
  isLoading: boolean,
  copy: MarketMessagesCopy,
): string {
  if (isLoading) {
    return copy.chartLoading;
  }

  return copy.chartEmpty;
}

function buildLoopedStockItems(
  defaultTickers: readonly string[],
): readonly LoopedStockItem[] {
  if (defaultTickers.length < 2) {
    return defaultTickers.map((ticker, slotIdx) => ({
      id: `${ticker}-slot-${slotIdx}`,
      ticker,
    }));
  }

  return Array.from({ length: LOOP_COPY_COUNT }, (_, loopIdx) =>
    defaultTickers.map((ticker, slotIdx) => ({
      id: `${ticker}-loop-${loopIdx}-slot-${slotIdx}`,
      ticker,
    })),
  ).flat();
}

const StockCard = React.memo(function StockCard({
  ticker,
  data,
  copy,
  isLocked,
  isSelected,
  isTouch,
  cardAriaLabel,
  onSelect,
  onLockedTouch,
}: {
  ticker: string;
  data: StockData | undefined;
  copy: MarketMessagesCopy;
  isLocked: boolean;
  isSelected: boolean;
  isTouch: boolean;
  cardAriaLabel: string;
  onSelect: (ticker: string) => void;
  onLockedTouch: (ticker: string) => void;
}): React.ReactElement {
  const rsiValue = data?.rsi ?? 50;
  const rsiBarValue = isLocked ? 0 : clampPercent(rsiValue);

  const handleCardClick = useCallback((): void => {
    if (!isLocked) {
      onSelect(ticker);
      return;
    }

    if (isTouch) {
      onLockedTouch(ticker);
    }
  }, [isLocked, isTouch, onLockedTouch, onSelect, ticker]);

  return (
    <button type="button" onClick={handleCardClick} aria-label={cardAriaLabel}>
      <span>{copy.priceLabel}</span>
      {isLocked ? <span>{copy.paidOnlyLabel}</span> : null}
      <span title={copy.bondNoticeTitle}>{copy.bondNoticeBadge}</span>
      <span>{copy.rsiLabel}</span>
      <span>{copy.bondInfoOnly}</span>
      <div
        className="h-1 rounded-full bg-blue-500 transition-all duration-1000"
        style={{ width: `${rsiBarValue}%` }}
        role="presentation"
      />
      {isSelected ? <span aria-hidden>{copy.selectedLabel}</span> : null}
    </button>
  );
});

StockCard.displayName = 'StockCard';

export default function Markets({
  lang,
  isLoading,
  chartData,
}: {
  lang: AppLang;
  isLoading: boolean;
  chartData: readonly Array<{ price: number }>;
}): React.ReactElement {
  const commonCopy = getCommonMessages(lang);
  const copy = getMarketMessages(lang);
  const [selectedTicker, setSelectedTicker] = useState<string>('QQQ');

  const emptyChartLabel = getChartStateLabel(isLoading, copy);

  // [수정] Rule 10: 렌더 시마다 배열·내부 객체가 재생성되는 것을 방지 — copy.defaultTickers는 §1.2 모듈 캐시로 참조 안정
  const loopedItems = useMemo(
    () => buildLoopedStockItems(copy.defaultTickers),
    [copy.defaultTickers],
  );

  const handleSelectTicker = useCallback((ticker: string) => {
    setSelectedTicker(ticker);
  }, []);

  const handleLockedTickerTouch = useCallback((_ticker: string) => {
    // 유료 잠금 안내 모달 오픈 등 — 실제 구현 시 controller로 이전
  }, []);

  if (chartData.length === 0) {
    return (
      <div aria-live="polite" aria-label={commonCopy.notice}>
        {emptyChartLabel}
      </div>
    );
  }

  return (
    <section aria-label={copy.sectionTitle}>
      <button type="button" aria-label={copy.scrollLeftAria} />
      <button type="button" aria-label={copy.scrollRightAria} />
      {loopedItems.map((item) => {
        // [수정] Rule 2: cardAriaLabel은 useCallback 없이 인라인 보간
        return (
          <StockCard
            key={item.id}
            ticker={item.ticker}
            data={undefined}
            copy={copy}
            isLocked={false}
            isSelected={selectedTicker === item.ticker}
            isTouch={false}
            cardAriaLabel={`${item.ticker} ${copy.priceLabel}`}
            onSelect={handleSelectTicker}
            onLockedTouch={handleLockedTickerTouch}
          />
        );
      })}
    </section>
  );
}
```

### C2. Dashboard 도메인

- **[Target]:** `components/Dashboard.tsx` / `PortfolioCardContainer` / `PortfolioCardView`
- **[As-Is 결함]:**
  - `DashboardHeader` 등에 `create` 같은 **영문 생텍스트 버튼**이 남아 있으면 Rule 3(I18N) 위반이며, `getDashboardMessages(lang)` SSOT와 연결해야 합니다(To-Be 스니펫: `createLabel` prop).
  - `PortfolioCardContainer`가 메트릭 계산, 일일 실행 요약 조립, MA 분석, 분기별 모드 전환, VR 주문 모달 상태, 퀵 입력 mutex, 렌더용 문자열 포매팅까지 모두 담당합니다. SRP 관점에서 과밀합니다.
  - Toss 전용 UI와 웹 UI 분기가 헤더, CTA, empty state, 리스트 렌더, 카드 버튼에 반복되어 렌더 뎁스가 깊고 변경 파급 범위가 큽니다.
  - `className={condition ? ... : ...}` 및 `style={condition ? {...} : undefined}` 패턴이 본문에 다수 있어 시각 결정 로직이 UI 본문을 오염시킵니다.
  - `portfolio` 통객체를 effect 의존성으로 사용하는 구간이 많아, 실제로 필요한 필드보다 넓은 재실행 범위를 가집니다.
  - `PortfolioCardView`는 presenter에 가까워졌지만, 여전히 `executionSummary`를 ReactNode로 통째로 받아 시각/도메인 경계가 흐립니다.
  - `isOpeningQuickInputRef`는 올바른 방향이지만, 동일 수준의 액션 구분과 error UX 표준화가 card controller 밖으로 정리되어 있지 않습니다.
  - 헤더 집계(총 평가·변동·변동률) 문자열이 **템플릿 리터럴 안 인라인 `toFixed`/`Math.round`** 로 파편화되어 있으면 Rule 1(부동소수점)·Rule 5(DRY)에 취약합니다. To-Be 스니펫은 **`getRounded`·`formatUsdValue` / `formatSignedUsdValue` / `formatSignedPercent`** 로 통일합니다.
  - **`DashboardHeader`가 `React.memo`가 아닌데 `headerVm`만 `useMemo`** 하면 Rule 2(Blind useMemo)에 해당할 수 있습니다. To-Be 스니펫은 **plain 객체**로 두고, 향후 헤더를 메모할 때 의존성·이득을 함께 검토합니다.
  - **`DashboardPortfolioCardHost`의 퀵 입력**이 **`try/finally`만 있고 `catch` 없음**이면 Rule 11(Swallowed rejection) 위반입니다. **`showErrorToast(copy.systemError)`** 안전망을 둡니다(§1.2 Action Item 9).
  - 같은 카드에서 **`vm`을 `useMemo`로 감싸도** 소비자가 **메모되지 않은 `<article>`** 이면 Rule 2(Blind useMemo)에 가깝습니다. **`buildDashboardPortfolioCardVm` 즉시 호출**로 둡니다.
  - 퀵 입력 등 **`async` 클릭 핸들러**는 **`onClick={() => void handleOpenQuickInput()}`** 로 **`void` 래핑**하여 `no-misused-promises`를 만족합니다. **`eslint-disable` 금지**(Rule 10).
  - **(UX 정책 확정)** 총 평가는 **`formatUsdValue`**, 변동액(부호 포함)은 **`formatSignedUsdValue`**(`-0`·`+$0.00`·Tone 불일치 방지), 변동률은 **`formatSignedPercent`**. **`getChangeTone`은 반올림된 금액(`getRounded`) 기준**으로만 판별해 데이터·렌더 색상을 일치시킵니다. Helper는 **`getRounded` 공통**으로 DRY(Rule 5). 구현 시 **`src/utils/financialCalculations.ts` 등 단일 모듈로 승격**합니다.
- **[🔥 오버 코딩 검토]:**
  - 채택: `dashboard/` 로컬 컨트롤러 훅과 헤더/그리드 presenter 분리, summary view-model 반환, Toss/Web variant helper 도입. `getDashboardMessages` 루트 SSOT에 **`createLabel`**·**`systemError`**(퀵 입력 등 비동기 실패 토스트)를 두어 I18N·Rule 11을 만족합니다.
  - 비채택: 전역 포트폴리오 상태 스토어 재설계, 카드별 state machine, 애니메이션 프레임워크 교체.
  - 결론: **Fat component 분해와 뷰 모델 평탄화는 유지보수성과 회귀 방지에 직결되므로 수행**하되, 아키텍처 대공사는 제외합니다.
- **[To-Be Snippet]:**

```tsx
import React, { useCallback, useRef } from 'react';
import type { AppLang, Portfolio } from '@/types';
import { getDashboardMessages } from '@/constants/messages/dashboardMessages';
import { showErrorToast } from '@/components/tds-adapter/showErrorToast';

// [신규 공통 Helper: src/utils/financialCalculations.ts 등으로 승격 권장]
function getRounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatUsdValue(value: number): string {
  const rounded = getRounded(value);
  return `$${rounded.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedPercent(rate: number): string {
  const rounded = getRounded(rate);
  if (Object.is(rounded, -0) || rounded === 0) {
    return '0.00%';
  }
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}%`;
}

// [수정] Rule 1: 달러($) 금액에 대한 -0 처리 및 부호 할당 완벽 제어
function formatSignedUsdValue(value: number): string {
  const rounded = getRounded(value);
  if (Object.is(rounded, -0) || rounded === 0) {
    return '$0.00';
  }
  return `${rounded > 0 ? '+' : '-'}$${Math.abs(rounded).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface DashboardPortfolioCardVm {
  id: string;
  portfolioName: string;
  ma0Ticker: string;
  valuationText: string;
  realizedProfitText: string;
  roiText: string;
  isYieldPositive: boolean;
  executionSummaryLines: readonly string[];
  isVrStrategy: boolean;
  canOpenVrOrders: boolean;
}

interface DashboardHeaderVm {
  title: string;
  subtitle: string;
  totalValuationText: string;
  totalValuationChangeText: string;
  totalValuationChangePctText: string;
  changeTone: 'positive' | 'negative' | 'neutral';
}

function buildDashboardPortfolioCardVm(
  portfolio: Portfolio,
  copy: ReturnType<typeof getDashboardMessages>,
): DashboardPortfolioCardVm {
  return {
    id: portfolio.id,
    portfolioName: portfolio.name,
    ma0Ticker: portfolio.strategy.ma0?.stock ?? 'TQQQ',
    valuationText: copy.calculatingLabel,
    realizedProfitText: copy.calculatingLabel,
    roiText: copy.calculatingLabel,
    isYieldPositive: true,
    executionSummaryLines: [copy.execution.calculating],
    isVrStrategy: portfolio.strategy.vrBand != null,
    canOpenVrOrders: portfolio.vrSnapshot != null,
  };
}

// [수정] Rule 1: Tone은 반올림된 최종 금액 기준(원시값과 표시 불일치 방지)
function getChangeTone(value: number): DashboardHeaderVm['changeTone'] {
  const rounded = getRounded(value);
  if (rounded > 0) {
    return 'positive';
  }
  if (rounded < 0) {
    return 'negative';
  }
  return 'neutral';
}

function DashboardPortfolioCardHost({
  portfolio,
  lang,
  onOpenQuickInput,
  quickInputLabel,
}: {
  portfolio: Portfolio,
  lang: AppLang;
  onOpenQuickInput: (
    portfolioId: string,
    activeSection?: 1 | 2 | 3,
  ) => Promise<void> | void;
  quickInputLabel: string;
}): React.ReactElement {
  const copy = getDashboardMessages(lang);
  const isOpeningQuickInputRef = useRef(false);

  // [수정] Rule 2: 자식이 React.memo가 아닌 일반 DOM만 있으면 vm용 useMemo는 Blind useMemo
  const vm = buildDashboardPortfolioCardVm(portfolio, copy);

  const handleOpenQuickInput = useCallback(async (): Promise<void> => {
    if (isOpeningQuickInputRef.current) {
      return;
    }

    isOpeningQuickInputRef.current = true;
    try {
      await Promise.resolve(onOpenQuickInput(portfolio.id));
    } catch (error) {
      console.error('[Dashboard] QuickInput failed:', error);
      showErrorToast(copy.systemError);
    } finally {
      isOpeningQuickInputRef.current = false;
    }
  }, [onOpenQuickInput, portfolio.id, copy]);

  return (
    <article className="rounded-[2rem] border p-6">
      <h2>{vm.portfolioName}</h2>
      <p>{vm.valuationText}</p>
      <button type="button" onClick={() => void handleOpenQuickInput()}>
        {quickInputLabel}
      </button>
    </article>
  );
}

function DashboardHeader({
  headerVm,
  createLabel, // Rule 3 적용
  onOpenCreator,
}: {
  headerVm: DashboardHeaderVm;
  createLabel: string;
  onOpenCreator: () => void;
}): React.ReactElement {
  const isPositive = headerVm.changeTone === 'positive';
  const isNegative = headerVm.changeTone === 'negative';

  let changeClassName = 'text-slate-400';
  if (isPositive) {
    changeClassName = 'text-emerald-500';
  } else if (isNegative) {
    changeClassName = 'text-rose-500';
  }

  return (
    <section className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-4xl font-extrabold">{headerVm.title}</h1>
        <p className="text-slate-500">{headerVm.subtitle}</p>
      </div>
      <div className="flex items-center gap-8">
        <div>
          <div>{headerVm.totalValuationText}</div>
          <div className={changeClassName}>{headerVm.totalValuationChangeText}</div>
          <div className={changeClassName}>
            {headerVm.totalValuationChangePctText}
          </div>
        </div>
        <button type="button" onClick={onOpenCreator}>
          {createLabel}
        </button>
      </div>
    </section>
  );
}

export default function Dashboard({
  lang,
  portfolios,
  onOpenCreator,
  onOpenQuickInput,
  totalValuation,
  totalValuationChange,
  totalValuationChangePct,
}: {
  lang: AppLang;
  portfolios: readonly Portfolio[];
  onOpenCreator: () => void;
  onOpenQuickInput: (portfolioId: string, activeSection?: 1 | 2 | 3) => Promise<void> | void;
  totalValuation: number;
  totalValuationChange: number;
  totalValuationChangePct: number;
}): React.ReactElement {
  const copy = getDashboardMessages(lang);

  // [수정] Rule 2: DashboardHeader가 React.memo가 아니면 headerVm 전용 useMemo는 Blind useMemo
  const headerVm: DashboardHeaderVm = {
    title: copy.portfolioTitle,
    subtitle: copy.portfolioSubtitle,
    totalValuationText: formatUsdValue(totalValuation),
    totalValuationChangeText: formatSignedUsdValue(totalValuationChange),
    totalValuationChangePctText: formatSignedPercent(totalValuationChangePct),
    changeTone: getChangeTone(totalValuationChange),
  };

  return (
    <div className="space-y-12">
      <DashboardHeader
        headerVm={headerVm}
        createLabel={copy.createLabel}
        onOpenCreator={onOpenCreator}
      />
      <section className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
        {portfolios.map((portfolio) => (
          <DashboardPortfolioCardHost
            key={portfolio.id}
            portfolio={portfolio}
            lang={lang}
            onOpenQuickInput={onOpenQuickInput}
            quickInputLabel={copy.quickInputAria}
          />
        ))}
      </section>
    </div>
  );
}
```

### C3. Backtest 도메인

- **[Target]:** `components/Backtest.tsx`
- **[As-Is 결함]:**
  - `Number(e.target.value) || default` 패턴이 다수 산재하여 `0`, 빈 문자열, `NaN`, 범위 초과를 한 줄에서 뒤섞어 처리합니다. Rule 1 / Rule 6 관점에서 입력 정규화 SSOT가 없습니다.
  - 전략별 파라미터 폼이 단일 파일에 집약되어 있어, step 전환/전략 선택/원격 실행/결과 렌더링/업그레이드 CTA가 한 컴포넌트에 혼재합니다.
  - 결과 화면의 업그레이드 유도는 `document.querySelector('[data-tab="pricing"]')` 에 의존합니다. 이는 UI DOM 구조와 비즈니스 게이트를 강결합합니다.
  - 무료 티어 게이트와 실제 백테스트 실행 로직이 동일 본문에 섞여 있어, 향후 결제 플로우 변경 시 Backtest가 연쇄 수정될 가능성이 큽니다.
  - remote 응답 파싱은 `Record<string, unknown>` 기반으로 시작했지만 `equityCurve as ...` 같은 단축 캐스팅이 남아 있어 결과 구조 검증이 충분히 강하지 않습니다.
  - `useMutexAction`은 올바르게 사용 중이므로 유지해야 하나, 실행 전 입력 검증/게이트/결과 조립의 단계 분리가 부족합니다.
  - 투자금(`amountUsd`)을 **소수점 없는 정수**로 받는 정책과 별개로, 입력 중 빈 칸·삭제 시마다 즉시 `0`으로 되돌리는 UX는 타이핑을 방해합니다. **raw 문자열 상태 + onChange 차단 + onBlur/제출 시에만** `normalizePositiveIntegerInput`으로 정규화해야 합니다(To-Be 스니펫).
  - **`normalizePositiveIntegerInput`이 `parsed < 0`만 막으면 `0`이 통과**하여 원격 실행에 **`amountUsd: 0`** 이 전달될 수 있습니다. Rule 1(분모 0·엔진 루프 위험) 위반이므로 **`parsed <= 0`**(또는 동등 가드)으로 **양의 정수만** 허용하고 나머지는 **fallback**합니다(To-Be 스니펫).
  - 원격 실행 `catch`에 **“실제 구현: 토스트 등” 주석만** 두고 알림 파이프를 생략하면 Rule 11(설계 블랙박스) 위반입니다. To-Be 스니펫은 **`BacktestController.notifyError`** 로 위임을 명시합니다.
  - `type="range"`·금액 `type="text"` 에 **`aria-label`**(또는 연결된 `<label>`)이 없으면 Rule 4(A11y) 위반입니다. To-Be 스니펫은 **`copy.monthsInputAria`**, **`copy.amountInputAria`** 를 사용합니다(§1.2 Action Items 6번).
  - **(정책 확정)** 다국어 번역 사전(`getBacktestMessages` SSOT)에 **`errorRunFailed`**, **`monthsInputAria`**, **`amountInputAria`** 키가 추가되는 것을 전제로 합니다(§1.2 Action Items 5·6번).
- **[🔥 오버 코딩 검토]:**
  - 채택: 입력 정규화 helper, 전략별 params section 분리, `onRequestUpgrade` 커맨드 prop 도입, remote response decoder 명시화.
  - 비채택: 범용 form engine, schema library 대도입, 백테스트 엔진 자체 재작성.
  - 결론: **게이트 분리와 입력 안전성은 직접적인 에러 방지 효과가 있으므로 수행**하고, 대형 폼 프레임워크 도입은 제외합니다.
- **[To-Be Snippet]:**

```tsx
import React, { useCallback, useState } from 'react';
import type { AppLang } from '@/types';
import { BACKTEST_DEFAULTS } from '@/constants/domain/backtestDefaults';
import { getBacktestMessages } from '@/constants/messages/backtestMessages';
import { useMutexAction } from '@/hooks/useMutexAction';

const MIN_MONTHS = 6;
const MAX_MONTHS = 24;

/** 원격 시뮬레이션·디코딩·에러 매핑은 뷰 밖(controller/service)에서 담당. 뷰는 이 계약만 주입받습니다. */
interface BacktestController {
  executeRemoteSimulation: (params: {
    months: number;
    amountUsd: number;
  }) => Promise<void>;
  notifyError: (message: string) => void;
}

function normalizeIntegerInput(
  raw: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

// [개선] Rule 1: 0·음수·비유한값·빈 문자열은 fallback — 원격 시뮬에 amountUsd: 0 전달 방지
function normalizePositiveIntegerInput(raw: string, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || raw.trim() === '') {
    return fallback;
  }
  return Math.trunc(parsed);
}

function shouldGateBenchmark(currentTier: string | null | undefined): boolean {
  return currentTier == null || currentTier === '' || currentTier === 'free';
}

function BacktestUpgradeGate({
  copy,
  onRequestUpgrade,
}: {
  copy: ReturnType<typeof getBacktestMessages>;
  onRequestUpgrade: () => void;
}): React.ReactElement {
  return (
    <div className="rounded-2xl border p-8 text-center">
      <h4 className="text-lg font-black">{copy.benchmarkCompare}</h4>
      <p className="text-sm text-slate-500">{copy.benchmarkCompareUpgrade}</p>
      <button type="button" onClick={onRequestUpgrade}>
        {copy.upgradeNow}
      </button>
    </div>
  );
}

export default function Backtest({
  lang,
  currentTier,
  controller,
  onRequestUpgrade,
}: {
  lang: AppLang;
  currentTier: string;
  controller: BacktestController;
  onRequestUpgrade: () => void;
}): React.ReactElement {
  const copy = getBacktestMessages(lang);
  const [months, setMonths] = useState(BACKTEST_DEFAULTS.COMMON.MONTHS);
  const [rawAmount, setRawAmount] = useState<string>(
    String(BACKTEST_DEFAULTS.COMMON.ONE_TIME_AMOUNT_USD),
  );

  const executeBacktest = useCallback(async (): Promise<void> => {
    const finalIntegerAmount = normalizePositiveIntegerInput(
      rawAmount,
      BACKTEST_DEFAULTS.COMMON.ONE_TIME_AMOUNT_USD,
    );
    try {
      await controller.executeRemoteSimulation({
        months,
        amountUsd: finalIntegerAmount,
      });
    } catch (error) {
      console.error('[Backtest] Simulation failed:', error);
      controller.notifyError(copy.errorRunFailed);
    }
  }, [controller, months, rawAmount, copy.errorRunFailed]);

  const { run: handleRunBacktest, isExecuting } = useMutexAction(executeBacktest);
  const isBenchmarkLocked = shouldGateBenchmark(currentTier);

  return (
    <section className="space-y-6">
      {/* [수정] Rule 4: Range Input에 스크린리더용 목적 명시 */}
      <input
        type="range"
        aria-label={copy.monthsInputAria}
        min={MIN_MONTHS}
        max={MAX_MONTHS}
        step={1}
        value={months}
        onChange={(event) => {
          setMonths(
            normalizeIntegerInput(
              event.target.value,
              BACKTEST_DEFAULTS.COMMON.MONTHS,
              MIN_MONTHS,
              MAX_MONTHS,
            ),
          );
        }}
      />

      {/* [수정] Rule 4: Text Input에 스크린리더용 목적 명시 */}
      <input
        type="text"
        inputMode="numeric"
        aria-label={copy.amountInputAria}
        value={rawAmount}
        onChange={(event) => {
          const val = event.target.value;
          if (val === '' || /^\d+$/.test(val)) setRawAmount(val);
        }}
        onBlur={() => {
          const safeInteger = normalizePositiveIntegerInput(
            rawAmount,
            BACKTEST_DEFAULTS.COMMON.ONE_TIME_AMOUNT_USD,
          );
          setRawAmount(String(safeInteger));
        }}
      />

      <button
        type="button"
        onClick={() => void handleRunBacktest()}
        disabled={isExecuting}
      >
        {isExecuting ? copy.processing : copy.startRun}
      </button>

      {isBenchmarkLocked ? (
        <BacktestUpgradeGate
          copy={copy}
          onRequestUpgrade={onRequestUpgrade}
        />
      ) : null}
    </section>
  );
}
```

### C4. 멤버십 / 결제 도메인

- **[Target]:** `components/Pricing.tsx` / `components/CheckoutModal.tsx`
- **[As-Is 결함]:**
  - `Pricing.tsx`는 hero, AI 섹션, Telegram preview, CTA 라벨 전반에 `isKo ? ... : ...` 하드코딩이 광범위합니다. Strict I18N 원칙을 정면 위반합니다.
  - `tier.theme === 'pro' ? ... : tier.theme === 'premium' ? ... : ...` 식의 중첩 삼항이 색상, 버튼 variant, CTA 라벨, feature icon 클래스에 반복됩니다.
  - 시각 샘플 데이터(`TELEGRAM_PREVIEW_CARDS`)와 실서비스 CTA 로직이 한 파일에 섞여 있어 도메인 책임이 불명확합니다.
  - `style={{ perspective: '1200px' }}`, `style={{ opacity, zIndex }}` 같은 인라인 스타일 결정이 반복됩니다. 이는 테마/상태 모델 분리 없이 render path에 남아 있습니다.
  - `CheckoutModal.tsx`는 `handlePay`에서 **try/finally만 있고 `catch`가 없으면** `requestTossIAP` 또는 `Promise.resolve` 경로의 **처리되지 않은 거부·예외가 침묵**할 수 있어 Rule 11 위반입니다. 반드시 **`catch`에서 로깅 및(추후) 토스트 등 안전망**을 가동합니다(To-Be 스니펫).
  - 결제 **비즈니스 실패**(`success: false`)나 **`catch`**에서 **사용자 알림 없이** 스피너만 끄면 Rule 11(기만적 침묵)·갇힘 위험이 큽니다. **비즈니스 실패** 시에는 **`showErrorToast(copy.paymentFailed)`** 만 하고 **`onClose()`를 호출하지 않습니다**(잔액 부족 등 — 다른 수단으로 재시도). **`catch`(시스템/네트워크)** 에서만 **`showErrorToast(copy.systemError)`** 및 **`onClose()`** 로 갇힘을 방지합니다. **`window.alert` 금지**, 영문 `??` 폴백 금지(§1.2 Action Item 8·원칙 12).
  - 성공·`catch`에서 **`onClose()`** 로 모달이 언마운트된 뒤에도 **`finally`에서 무조건 `setIsProcessing(false)`** 를 호출하면 **파기된 컴포넌트에 대한 상태 변이**가 발생합니다(Rule 2·11). To-Be 스니펫은 **`isUnmounted` 플래그**로 **`onClose()` 경로에서는 `setIsProcessing` 생략**합니다.
  - `CheckoutModal.tsx`는 전반적으로 Phase B 기준을 따르지만, 오류 코드 매핑에서 `as TossIapErrorCode | undefined` 캐스팅이 남아 있고, 플랜 표시용 view-model이 본문에 직접 조립됩니다.
  - 결제 CTA와 출시 대기 CTA(`premium`)가 같은 버튼 결정식에 얽혀 있어 향후 플랜 정책 변경 시 회귀 위험이 있습니다.
- **[🔥 오버 코딩 검토]:**
  - 채택: `pricingMessages.ts` / preview card SSOT / CTA resolver / tier theme resolver / checkout outcome normalizer 분리. `CheckoutModal` **`handlePay`는 try/catch/finally**로 로깅하고, **비즈니스 실패 → `showErrorToast(copy.paymentFailed)`·모달 유지**, **`catch` → `showErrorToast(copy.systemError)`·`onClose()`**, **`finally`에서는 `onClose()` 호출 시 `setIsProcessing` 생략(`isUnmounted`)** 으로 Rule 11·§1 원칙 12 및 언마운트 후 setState 방지를 만족합니다.
  - 비채택: CMS 연동, 결제 상태 머신, 디자인 시스템 전면 교체.
  - 결론: **I18N 일원화와 CTA 의사결정 분리는 제품 정책 변경 비용을 줄이므로 수행**하고, 마케팅 콘텐츠 엔진화는 제외합니다.
- **[To-Be Snippet]:**

```tsx
import React, { useRef, useState, useCallback } from 'react';
import type { AppLang } from '@/types';
import {
  getPricingMessages,
  type PricingTierTheme,
  type PricingTierId,
} from '@/constants/messages/pricingMessages';
import { requestTossIAP } from '@/services/payment/tossIapService';
import { showErrorToast } from '@/components/tds-adapter/showErrorToast';

interface PricingTierRow {
  id: PricingTierId;
  label: string;
  subtitle: string;
  theme: PricingTierTheme;
}

type TierCtaState =
  | { kind: 'current'; label: string; isDisabled: true }
  | { kind: 'upgrade'; label: string; isDisabled: false }
  | { kind: 'notify'; label: string; isDisabled: false };

function getTierCtaState(input: {
  tierId: PricingTierId;
  currentTier: string;
  copy: ReturnType<typeof getPricingMessages>;
}): TierCtaState {
  const { tierId, currentTier, copy } = input;

  if (tierId === currentTier) {
    return { kind: 'current', label: copy.currentPlan, isDisabled: true };
  }

  if (tierId === 'premium') {
    return { kind: 'notify', label: copy.notifyWhenReleased, isDisabled: false };
  }

  return { kind: 'upgrade', label: copy.upgradeNow, isDisabled: false };
}

function getTierThemeClassName(theme: PricingTierTheme): string {
  switch (theme) {
    case 'free':
      return 'bg-white border-slate-200';
    case 'pro':
      return 'bg-blue-50 border-blue-200';
    case 'premium':
      return 'bg-black border-amber-500/30';
    default: {
      const exhaustiveCheck: never = theme;
      return exhaustiveCheck;
    }
  }
}

function normalizeCheckoutErrorCode(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

const TierCard = React.memo(function TierCard({
  tier,
  currentTier,
  copy,
  onUpgrade,
  onNotifyPremium,
}: {
  tier: PricingTierRow;
  currentTier: string;
  copy: ReturnType<typeof getPricingMessages>;
  onUpgrade: (planId: 'pro') => void;
  onNotifyPremium: () => void;
}): React.ReactElement {
  const ctaState = getTierCtaState({
    tierId: tier.id,
    currentTier,
    copy,
  });

  const handleClick = useCallback((): void => {
    if (ctaState.kind === 'upgrade') {
      onUpgrade('pro');
      return;
    }

    if (ctaState.kind === 'notify') {
      onNotifyPremium();
    }
  }, [ctaState.kind, onNotifyPremium, onUpgrade]);

  return (
    <article
      className={`rounded-[2rem] border p-8 ${getTierThemeClassName(tier.theme)}`}
    >
      <h2>{tier.label}</h2>
      <p>{tier.subtitle}</p>
      <button type="button" disabled={ctaState.isDisabled} onClick={handleClick}>
        {ctaState.label}
      </button>
    </article>
  );
});

TierCard.displayName = 'TierCard';

export function Pricing({
  lang,
  currentTier,
  onUpgrade,
  onNotifyPremium,
}: {
  lang: AppLang;
  currentTier: string;
  onUpgrade: (planId: 'pro') => void;
  onNotifyPremium: () => void;
}): React.ReactElement {
  const copy = getPricingMessages(lang);
  const tiers = copy.tiers;

  return (
    <section className="grid gap-6 md:grid-cols-3">
      {tiers.map((tier) => (
        <TierCard
          key={tier.id}
          tier={tier}
          currentTier={currentTier}
          copy={copy}
          onUpgrade={onUpgrade}
          onNotifyPremium={onNotifyPremium}
        />
      ))}
    </section>
  );
}

export function CheckoutModal({
  lang,
  onClose,
  onPaymentSuccess,
}: {
  lang: AppLang;
  onClose: () => void;
  onPaymentSuccess: () => void;
}): React.ReactElement {
  const copy = getPricingMessages(lang).checkout;
  const [isProcessing, setIsProcessing] = useState(false);
  const isExecutingRef = useRef(false);

  const handlePay = useCallback(async (): Promise<void> => {
    if (isExecutingRef.current) return;
    isExecutingRef.current = true;
    setIsProcessing(true);

    let isUnmounted = false;

    try {
      const result = await Promise.resolve(requestTossIAP('pro', 1));
      if (result.success) {
        onPaymentSuccess();
        isUnmounted = true;
        onClose();
        return;
      }

      const errorCode = normalizeCheckoutErrorCode(result.errorCode);
      console.error('[CheckoutModal] payment failed:', errorCode, result.rawMessage);

      showErrorToast(copy.paymentFailed);
    } catch (error) {
      console.error('[CheckoutModal] unhandled rejection:', error);

      showErrorToast(copy.systemError);
      isUnmounted = true;
      onClose();
    } finally {
      isExecutingRef.current = false;
      if (!isUnmounted) {
        setIsProcessing(false);
      }
    }
  }, [onClose, onPaymentSuccess, copy]);

  return (
    <button type="button" disabled={isProcessing} onClick={() => void handlePay()}>
      {isProcessing ? copy.processing : copy.pay}
    </button>
  );
}
```

### C5. History 도메인

- **[Target]:** `components/History.tsx` / `components/HistoryHeaderActions.tsx` / `components/PortfolioDetailsModal.tsx` / `components/portfolioDetails/*`
- **[As-Is 결함]:**
  - 목록 카드에 `details` 같은 **영문 생텍스트 버튼**이 남아 있으면 Rule 3 위반이며, `getHistoryMessages(lang)`에서 주입한 라벨(`detailsLabel` 등)로 치환해야 합니다(To-Be 스니펫).
  - `History.tsx`는 제목, 기간, 총 투자금, 총 수익률 등의 문구를 `lang === 'ko' ? ... : ...` 로 직접 렌더링합니다.
  - Toss 전용 목록 카드와 일반 웹 목록 카드가 같은 데이터 표시를 거의 중복으로 갖고 있어 DRY가 깨집니다.
  - 금액/수익률/날짜 포매팅이 `toLocaleString`, `new Date(...).toLocaleDateString()` 형태로 곳곳에 흩어져 있습니다.
  - 상세 모달 `PortfolioDetailsView.tsx`는 캘린더 셀 렌더마다 `allTradesForDate.filter(...)` 를 반복하여 buy/sell 아이콘 배열을 즉석 계산합니다. 종료 포트폴리오 수 또는 거래 수가 커질수록 render 비용이 커집니다.
  - `renderStockIcon()`과 인라인 style(`touchAction`, icon stack transform)이 뷰 내부에 있어 presentation helper와 domain-precomputed data 경계가 약합니다.
  - `HistoryHeaderActions`와 `usePortfolioDetailsController`는 TDS 확인 흐름을 잘 잡고 있으므로, 이 부분은 유지하면서 뷰 모델만 더 평탄화하면 됩니다.
  - 종료 포트폴리오 **`invested` 누적**을 `reduce` 한 줄 삼항으로 압축하면 Rule 6·SRP에 어긋납니다. To-Be 스니펫은 **Guard Clause + 단계별 지역 변수**로 해체합니다.
  - 손익 문자열·색상이 **`profit >= 0` 원시값**만 보면 **`-0`·반올림 $0.00** 과 불일치할 수 있습니다(Rule 1). **`formatSignedUsdValue`·`getRounded(profit) >= 0`** 로 정합합니다.
  - **(UX 정책 확정)** 투자원금은 **`formatUsdValue`**, 수익률은 **`formatSignedPercent`**, 손익 금액은 **`formatSignedUsdValue(profit)`**(`-0`·`+$0.00` 방지). **`isProfitPositive`는 `getRounded(profit) >= 0`** 로 색상과 숫자 표기를 정합합니다(C2와 Helper 계약 공유).
- **[🔥 오버 코딩 검토]:**
  - 채택: `historyMessages.ts` 신설 또는 기존 `portfolioDetailsMessages.ts` 확장, 공통 record view-model, calendar day summary precompute. 루트 SSOT에 **`detailsLabel`**(상세 버튼 문구)를 두어 카드 CTA를 I18N으로만 노출.
  - 비채택: 가상 스크롤, 전체 목록 virtualization, 별도 캘린더 엔진 교체. 현재 범위에서는 과합니다.
  - 결론: **하드코딩 제거와 렌더 비용 절감은 직접적인 유지보수/성능 가치가 있으므로 수행**하고, 인프라급 UI 엔진 교체는 제외합니다.
- **[To-Be Snippet]:**

```tsx
import React, { useCallback, useMemo } from 'react';
import type { AppLang, Portfolio } from '@/types';
import { getHistoryMessages } from '@/constants/messages/historyMessages';

// [신규 공통 Helper: src/utils/financialCalculations.ts 등으로 승격 권장 — C2와 동일 계약]
function getRounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatUsdValue(value: number): string {
  const rounded = getRounded(value);
  return `$${rounded.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedPercent(rate: number): string {
  const rounded = getRounded(rate);
  if (Object.is(rounded, -0) || rounded === 0) {
    return '0.00%';
  }
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}%`;
}

function formatSignedUsdValue(value: number): string {
  const rounded = getRounded(value);
  if (Object.is(rounded, -0) || rounded === 0) {
    return '$0.00';
  }
  return `${rounded > 0 ? '+' : '-'}$${Math.abs(rounded).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface HistoryRecordVm {
  id: string;
  name: string;
  startDateLabel: string;
  closedDateLabel: string;
  investedText: string;
  yieldText: string;
  profitText: string;
  isProfitPositive: boolean;
}

function buildHistoryRecordVm(
  portfolio: Portfolio,
  copy: ReturnType<typeof getHistoryMessages>,
): HistoryRecordVm {
  // [수정] Rule 6: reduce 내부를 명확한 흐름으로 해체
  const invested = portfolio.trades.reduce((sum, trade) => {
    // Guard Clause: 매수가 아니면 무시
    if (trade.type !== 'buy') {
      return sum;
    }
    
    // 개별 계산 로직 분리
    const tradeCost = trade.price * trade.quantity;
    const feeCost = Math.abs(trade.fee); // 수수료 음수 방어
    
    return sum + tradeCost + feeCost;
  }, 0);

  const finalSellAmount = portfolio.finalSellAmount ?? 0;
  const profit = finalSellAmount - invested;
  const yieldRate = invested > 0 ? (profit / invested) * 100 : 0;

  return {
    id: portfolio.id,
    name: portfolio.name,
    startDateLabel: copy.startDate(portfolio.startDate),
    closedDateLabel: copy.closedDate(portfolio.closedAt ?? ''),
    investedText: formatUsdValue(invested),
    yieldText: formatSignedPercent(yieldRate),
    profitText: formatSignedUsdValue(profit),
    isProfitPositive: getRounded(profit) >= 0,
  };
}

const HistoryRecordCard = React.memo(function HistoryRecordCard({
  vm,
  detailsLabel, // Rule 3 적용
  onOpenDetails,
}: {
  vm: HistoryRecordVm;
  detailsLabel: string;
  onOpenDetails: (id: string) => void;
}): React.ReactElement {
  const profitClassName = vm.isProfitPositive
    ? 'text-emerald-500'
    : 'text-rose-500';

  const handleOpenDetailsClick = useCallback((): void => {
    onOpenDetails(vm.id);
  }, [onOpenDetails, vm.id]);

  return (
    <article className="rounded-[2rem] border p-6">
      <h3 className="text-lg font-black">{vm.name}</h3>
      <p>{vm.startDateLabel}</p>
      <p>{vm.closedDateLabel}</p>
      <p>{vm.investedText}</p>
      <p className={profitClassName}>{vm.yieldText}</p>
      <p className={profitClassName}>{vm.profitText}</p>
      <button type="button" onClick={handleOpenDetailsClick}>
        {detailsLabel}
      </button>
    </article>
  );
});

HistoryRecordCard.displayName = 'HistoryRecordCard';

export default function History({
  lang,
  portfolios,
  onOpenDetails,
}: {
  lang: AppLang;
  portfolios: readonly Portfolio[];
  onOpenDetails: (id: string) => void;
}): React.ReactElement {
  const copy = getHistoryMessages(lang);

  const recordVms = useMemo(
    () => portfolios.map((portfolio) => buildHistoryRecordVm(portfolio, copy)),
    [copy, portfolios],
  );

  return (
    <section aria-label={copy.historyTitle}>
      <h2>{copy.historyTitle}</h2>
      <p>{copy.historySubtitle}</p>
      <div className="space-y-4">
        {recordVms.map((vm) => (
          <HistoryRecordCard
            key={vm.id}
            vm={vm}
            detailsLabel={copy.detailsLabel}
            onOpenDetails={onOpenDetails}
          />
        ))}
      </div>
    </section>
  );
}
```

---

## 3. Phase C 실행 순서 제안

1. **§1.2 I18N 모듈 캐시 표준**을 `constants/messages/**`에 적용(또는 `Markets` 등 첫 도메인 작업과 **동일 스프린트 내 병행**)하여 `get…Messages(lang)`의 **안정 참조**를 먼저 확보합니다. 그렇지 않으면 이후 `React.memo`·행 컴포넌트 분리 효과가 상쇄될 수 있습니다.
2. `Markets`의 하드코딩/I18N/중첩 삼항 제거를 진행합니다. **`buildLoopedStockItems`는 `useMemo(..., [copy.defaultTickers])`** 로 캐시하고, **`cardAriaLabel`은 인라인 보간**(불필요한 `useCallback` 제거), 선택 표시는 **`selectedLabel`** SSOT로 통일합니다. 화면 범위가 제한적이고 검증 비용이 낮아 Phase C 착수점으로 적합합니다.
3. `Dashboard`를 카드 controller / presenter / header variant로 쪼개어 가장 큰 UI 복잡도를 먼저 낮춥니다. 헤더는 **`formatSignedUsdValue`·`formatSignedPercent`·`getRounded` 기반 `getChangeTone`**, **`headerVm`·카드 `vm` Blind `useMemo` 제거**, 퀵 입력 **`catch` + `showErrorToast(copy.systemError)`**, 비동기 클릭은 **`onClick={() => void handleOpenQuickInput()}`**(`no-misused-promises`, **disable 금지**)로 Rule 1·2·5·10·11을 만족시킵니다(§1.2 Action Item 9).
4. `Backtest`에서 입력 정규화, **`normalizePositiveIntegerInput`의 `parsed <= 0` 가드로 `amountUsd: 0` 원천 차단**, **투자금 정수 정책 + raw 문자열/`onBlur`·제출 시 정규화 UX**, **`aria-label`(`monthsInputAria` / `amountInputAria`)**, **`BacktestController` 주입(`executeRemoteSimulation` + `notifyError` 계약)**, 원격 실패 시 **`notifyError(copy.errorRunFailed)`** 로 사용자 알림을 침묵 없이 연결하고, 업그레이드 게이트를 분리해 결제 탭 DOM 의존과 실행 블랙박스를 제거합니다.
5. `Pricing` / `CheckoutModal`에서 CTA resolver와 메시지 SSOT를 고정하고, 결제 **`handlePay`에 비즈니스 실패 시 `showErrorToast(paymentFailed)`·모달 유지**, **`catch` 시 `showErrorToast(systemError)`·`onClose()`**, **`finally`에서 `onClose()` 호출 경로는 `setIsProcessing` 생략(`isUnmounted`)** 을 포함합니다(`window.alert`·영문 폴백 금지, §1.2·원칙 12).
6. `History` / `PortfolioDetails`에서 하드코딩 제거, **`invested` reduce 해체**, **`formatSignedUsdValue`·`formatSignedPercent`·`getRounded` 기반 `isProfitPositive`**, day-summary precompute를 적용합니다.

## 4. 승인 전 비목표 재확인

- 실제 `tsx` / `ts` 소스 수정 금지
- 서버 결제 라우트, Supabase 함수, Toss 브릿지 계약 변경 금지
- 전역 상태관리 도입 금지
- virtualization, 차트 라이브러리 교체, 대규모 CSS 시스템 재설계 금지

**구현 착수 후 PR 승인(참고):** Phase C 관련 PR은 §**1.2**에 따라 `constants/messages/**`의 **모듈 레벨 캐시·안정 참조**가 반영되고, 메시지 전용 `useMemo`가 불필요한 곳에서 제거·평탄화되었으며, `React.memo`가 메시지 prop 기준으로 의도대로 동작함이 코드 리뷰에서 확인될 때 승인하는 것을 권장합니다(본 문서는 시뮬레이션 단계이므로 실제 머지는 팀 규칙에 따름).

## 5. 최종 결론

- Phase C는 **UI 정리 자체가 목적이 아니라**, I18N 누락, 렌더 복잡도, 타입 경계, 액션 게이트 결합, 상세 렌더 비용 같은 **실제 회귀 포인트를 제거하는 단계**로 정의합니다.
- **§1.2**에 따라 다국어 메시지는 **참조 안정성**이 프런트 성능·메모 전략의 전제가 되며, getter 매호출 객체 재생성 패턴은 Phase C에서 **배제**합니다. **루트 단일 캐시·중첩 트리 일괄 조립**, 로컬 개발 시 메시지 수정 검증은 **F5 전체 새로고침** 관행으로 둡니다.
- 특히 `Markets`, `Backtest`, `Pricing`, `History`는 하드코딩 제거가 우선이며, `Dashboard`는 **거대 카드 컨테이너 해체**가 핵심입니다. `Markets`는 **`loopedItems` `useMemo`**, **aria 인라인**, **`selectedLabel`** 로 Rule 10·2·3을 맞추고, `Backtest`는 **`normalizePositiveIntegerInput`의 `parsed <= 0` 가드(Rule 1)**, **`notifyError`**, **입력 `aria-label`** 로 Rule 11·4를 맞춥니다. `Dashboard`·`History`는 **`getRounded`·`formatSignedUsdValue`·`formatSignedPercent`** 및 **Tone/`isProfitPositive`의 반올림 정합**, 카드 **퀵 입력 `catch`·`showErrorToast`**, 비동기 **`onClick={() => void …}`**(**eslint-disable 금지**)(구현 시 단일 유틸 승격)로 Rule 1·2·5·10·11을 만족합니다. `CheckoutModal`은 **비즈니스 실패 시 `showErrorToast`·모달 유지**, **`catch` 시 `showErrorToast`·`onClose()`**, **`finally`에서 `onClose()` 경로는 `setIsProcessing` 생략**으로 침묵·갇힘·언마운트 후 setState를 막으며 **`alert`/영문 폴백 없음**(Rule 11·§1 원칙 12).
- 본 문서의 To-Be Snippet은 실제 구현이 아니라 **승인용 mental compile 기준서**이며, 승인 후에도 동일 계약을 벗어나는 과잉 추상화는 허용하지 않습니다.
