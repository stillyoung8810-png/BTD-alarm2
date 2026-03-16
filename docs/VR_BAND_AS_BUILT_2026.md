## 1. 시스템 개요 (Overview)

VR 밴드 전략은 기존 대시보드(`Dashboard.tsx`)에 **"또 하나의 전략 타입"** 으로 통합된 기능이다.  
핵심 개념은 다음 두 가지로 분리된다.

- **설정(Strategy Settings, SSOT)**: `Portfolio.strategy.vrBand` (`VrBandStrategyParams`)  
  - 초기 V, 밴드폭, G, deltaCash, 수수료율, 최소 주문 수량 등 **전략이 어떻게 동작해야 하는지에 대한 불변 설정**.
- **실시간 상태(Runtime State)**: `Portfolio.vrSnapshot` (`VrSnapshot`)  
  - 현재 V, Pool, 보유 주식 수, 평균 단가, 밴드 하단/상단, 예약 주문표(`buyOrders`/`sellOrders`) 등 **지금 시점의 실제 상태**.

프론트엔드는 이 두 축에 대해 **읽기 전용 UI** 역할만 수행한다.

- 대시보드는 `strategy.vrBand`와 `vrSnapshot`이 존재하는 포트폴리오를 **VR 전략 포트폴리오**로 인식하고:
  - VR용 요약 박스(`VrPortfolioSummary`)를 마운트한다.
  - "예약 주문 가격표 보기" 버튼 → `VrOrderModal` 모달을 통해 예약 주문표를 표시한다.
- 코어 엔진(`utils/vrBandStrategy.ts`)은:
  - V 업데이트(`calculateNextV`)
  - 밴드 계산(`calculateBands`)
  - 예약 매수/매도 주문표 생성(`generateBuyOrders`, `generateSellOrders`)
  - Pool 변동액 계산(`calculatePoolDelta`)
  - 금융 인자 통합 검증(`validateFinancialArgs`)
  를 담당하는 순수 함수 집합이다.

즉, **설정은 Strategy에, 실시간 상태는 Snapshot에, 계산은 Engine에, 표시와 상호작용은 UI 컴포넌트에** 각각 분리되어 있다.

---

## 2. 파일 아키텍처 (File Structure & SRP)

VR 밴드 전략과 관련된 주요 파일 및 각자의 단일 책임(SRP)은 다음과 같다.

```text
docs/
  VR_BAND_STRATEGY.md              # 수학/전략 스펙 문서 (기획 수식)
  VR_BAND_UI_IMPLEMENTATION_PLAN.md# UI/아키텍처 계획서
  VR_BAND_AS_BUILT_2026.md         # (본 문서) 실제 구현 상태 정리

components/
  Dashboard.tsx                    # 포트폴리오 카드 및 전략별 진입점
  VrPortfolioSummary.tsx           # VR 전용 요약 박스 + 모달 트리거
  VrOrderModal.tsx                 # 예약 주문표 모달 (탭 + 테이블)
  VrBadge.tsx                      # VR 전략 타입 배지 (거치식/적립식/인출식)

constants/
  vrMessages.ts                    # VR 관련 I18N 및 UI 상수 (모달/요약/배지/히ント)

utils/
  vrBandStrategy.ts                # VR 코어 계산 엔진 (V, 밴드, 주문표, Pool Delta, Validator)

types.ts                           # VrBandStrategyParams, VrSnapshot, OrderLevel, Strategy/Portfolio 확장
```

### 2.1 `types.ts`

- **`VrBandStrategyBase` / `VrBandStrategyParams`**
  - 공통 필드: `initialV`, `initialCapital`, `bandRateUpper`, `bandRateLower`, `feeRate`, `G`, `minOrderQty`, `poolUsageRateBuy`.
  - Discriminated Union:
    - `VrBandAccumulate` (`vrMode: 'accumulate'; deltaCash: number`)
    - `VrBandWithdraw` (`vrMode: 'withdraw'; deltaCash: number`)
    - `VrBandLumpSum` (`vrMode: 'lump_sum'; deltaCash: 0`)
  - **SSOT 원칙**: VR 전략 설정은 오직 `Strategy.vrBand?: VrBandStrategyParams` 한 곳에만 존재.

- **`OrderLevel`**
  - `step: number`
  - `price: number`
  - `qty: number`
  - `isBuffer: boolean` — Pool 한도 초과 여부(가이드용)
  - `sharesAfter: number` — 해당 단계까지 체결 후 보유 주식 수 (Step 0은 현재 보유 수량)
  - `poolAfter: number` — 해당 단계까지 체결 후 Pool 잔액 (Step 0은 현재 Pool)

- **`VrSnapshot`**
  - `currentV: number`
  - `pool: number`
  - `shares: number`
  - `avgPrice: number`
  - `bandLow: number`
  - `bandHigh: number`
  - `buyOrders: OrderLevel[]`
  - `sellOrders: OrderLevel[]`

- **`getVrDeltaCashForNextV(params)`**
  - 금융 방어를 위해 **모드별 부호를 강제**:
    - `accumulate`: `+|deltaCash|`
    - `withdraw`: `-|deltaCash|`
    - `lump_sum`: `0`

- **`Portfolio` 확장**
  - `strategy.vrBand?: VrBandStrategyParams`
  - `vrSnapshot?: VrSnapshot`
  - 이 외 기존 전략(multiSplit, ma0 등)은 그대로 유지.

### 2.2 `utils/vrBandStrategy.ts` — 코어 엔진

**책임:**
- V 업데이트, 밴드 계산, 예약 주문표 생성, Pool 변동액 계산, 금융 인자 통합 검증.
- 클라이언트/백엔드 공용 순수 함수로 설계되어 Edge Function에서 직접 호출 가능.

**주요 export:**
- `toDisplayNumber(value): number | null`
  - UI 표시용 숫자 검증. `number` & `isFinite` 가 아니면 `console.error` 후 `null` 반환.

- `calculateMaxBuyStep(buyOrders: OrderLevel[]): number`
  - `isBuffer === false` 인 `OrderLevel`들 중 최대 `step` 값을 반환.

- `validateFinancialArgs(args, rules, context)`
  - `args: Record<string, number>`
  - `rules: Record<string, { min?: number; strictPositive?: boolean }>`
  - 모든 키에 대해:
    - rule 존재 여부
    - 유한수(Finite) 여부
    - `strictPositive`/`min` 규칙 위반 여부를 검사.
  - 위반 시 **컨텍스트가 포함된 런타임 에러**를 발생시켜 엔진 방어.

- `calculatePoolDelta(type, price, quantity, feeRate): number`
  - Invariant:
    - `price > 0`, `quantity > 0`, `feeRate >= 0` 를 `validateFinancialArgs`로 강제.
  - 반환값:
    - `buy`: `-(price * quantity * (1 + feeRate))` (Pool 감소, 음수)
    - `sell`: `price * quantity * (1 - feeRate)` (Pool 증가, 양수)

- `calculateNextV(currentV, pool, params): number`
  - `validateFinancialArgs({ currentV, pool, G }, { G: { strictPositive: true } }, 'calculateNextV')`
  - 공식:  
    `V_next = currentV + pool / G + getVrDeltaCashForNextV(params)`
  - `getVrDeltaCashForNextV`가 모드별 부호를 보장.

- `calculateBands(v, bandRateUpper, bandRateLower)`
  - `validateFinancialArgs({ v }, { v: { strictPositive: true } }, 'calculateBands')`
  - 반환:
    - `bandLow = v * (1 - bandRateLower)`
    - `bandHigh = v * (1 + bandRateUpper)`

- `generateBuyOrders(params): OrderLevel[]`
  - 입력:
    - `shares`, `pool`, `bandLow`, `minOrderQty`, `feeRate`, `poolUsageRateBuy`.
  - 검증:
    - `shares: { min: 0 }`, `pool: { min: 0 }`, `bandLow: { strictPositive: true }`
    - `minOrderQty: { strictPositive: true }`, `feeRate: { min: 0 }`, `poolUsageRateBuy: { strictPositive: true }`.
  - 동작:
    - `if (pool <= 0) return []` — 예산 0이면 즉시 종료.
    - `MAX_ORDER_STEPS = 20` — **서킷 브레이커**: 주문 레벨은 최대 20단계까지만 생성.
    - 각 레벨 `k` 에 대해:
      - `effectiveShares = shares === 0 ? k * minOrderQty : shares + (k - 1) * minOrderQty;`
      - `targetPrice = bandLow / effectiveShares`
      - `price = roundPrice2(targetPrice)` (EPSILON 포함 2자리 반올림)
      - `if (!isFinite(targetPrice) || targetPrice <= 0 || price <= 0) break;`
      - `orderCost = price * qty * (1 + feeRate)`
      - 누적 비용이 `maxBuyBudget = pool * poolUsageRateBuy`를 초과하는 순간부터 **버퍼 주문**:
        - `isBuffer = !isWithinBudget`
        - `bufferCount` 2개까지만 허용, 이후 break.
      - `sharesAfter`, `poolAfter`는 해당 레벨까지 체결 후 상태를 반영.

- `generateSellOrders(params): OrderLevel[]`
  - 입력:
    - `shares`, `pool`, `bandHigh`, `minOrderQty`, `feeRate`.
  - 검증:
    - `shares: { min: 0 }`, `pool: { min: 0 }`, `bandHigh: { strictPositive: true }`
    - `minOrderQty: { strictPositive: true }`, `feeRate: { min: 0 }`.
  - 동작:
    - `if (shares <= 0 || minOrderQty <= 0) return []` — 0주 보유 시 빈 배열.
    - `MAX_ORDER_STEPS = 20` 적용.
    - 각 레벨 `k` 에 대해:
      - `sharesBefore = shares - (k - 1) * minOrderQty; if (sharesBefore <= 0) break;`
      - `targetPrice = bandHigh / sharesBefore; price = roundPrice2(targetPrice);`
      - `if (!isFinite(targetPrice) || targetPrice <= 0 || price <= 0) break;`
      - `proceeds = price * qty * (1 - feeRate)`
      - 누적 매도 수량이 `shares`를 초과하지 않도록 Guard.
      - `sharesAfter`, `poolAfter`는 해당 레벨까지 매도 체결 후 상태를 반영.

### 2.3 `constants/vrMessages.ts`

**책임: VR 관련 모든 I18N & 상수의 단일 소스.**

- `VR_MODAL_LABELS`
  - 모달 타이틀/탭/테이블 헤더/뱃지 텍스트:
    - `title`, `tabSell`, `tabBuy`, `step`, `price`, `qty`, `sharesAfter`, `poolAfter`, `currentState`, `guide`, `emptyOrder`.

- `VR_FALLBACK`
  - VR 요약 Fallback 메시지:
    - `error`, `pending`.

- `VR_SUMMARY`
  - 요약 영역의 버튼 텍스트 + "N번까지 주문하세요" 헬퍼 함수.

- `VR_BADGE_CONFIG`
  - `vrMode`별 뱃지 텍스트/스타일(`textKo`, `textEn`, `classes`).

- `VR_TAB_ICONS`
  - 모달 탭별 이모지 아이콘 (`sell: '🔴 '`, `buy: '🔵 '`).

- `VR_DASHBOARD_HINT`
  - 대시보드 내 VR 전략 안내 힌트:
    - `ready`: 스냅샷이 있을 때
    - `pending`: 초기화/계산 대기 중

### 2.4 `components/VrBadge.tsx`

**책임: VR 전략 타입 배지 렌더링.**

- `VrBadgeProps`: `{ mode: VrMode; lang: AppLang }`
- 내부에서 `VR_BADGE_CONFIG[mode]`를 사용하여:
  - 라벨 텍스트(한/영)
  - Tailwind 스타일
  을 결정하고 `<span>`으로 배지 렌더.

### 2.5 `components/VrOrderModal.tsx`

**책임: 예약 주문 가격표 모달 (탭 + 테이블).**

- 탭:
  - `TabId = 'sell' | 'buy'`
  - `TABLE_CONFIG`에서 각 탭의:
    - `tabLabelKey` (`tabSell`/`tabBuy`)
    - `tabIcon` (`VR_TAB_ICONS`)
    - active/inactive 클래스
  를 정의.

- 테이블 컬럼 정의(`TABLE_COLUMNS`):
  - `id: 'step' | 'price' | 'qty' | 'sharesAfter' | 'poolAfter'`
  - `labelKey`: `VR_MODAL_LABELS`의 키
  - `align`, `format?`, `hideOnStepZero?`, `renderCell?`
  - `step` 컬럼의 `renderCell`:
    - `step === STEP_CURRENT_STATE`(0)일 때:
      - `t.currentState` 뱃지 렌더 (파란 배경/작은 뱃지).
    - 그 외:
      - `step` 숫자 + `isBuffer`일 때 `t.guide` 배지 표시.
  - `price`, `poolAfter`는 `format: 'decimal'` 유지 (소수점 2자리).
  - `qty`, `sharesAfter`는 format 없이 **원본 숫자 그대로** 렌더.
  - `hideOnStepZero`:
    - `price`, `qty`에서 Step 0일 때 `'-'`를 표시하기 위한 메타데이터.

- 공통 포맷터:
  - `defaultCellContent(order, column)`:
    - `toDisplayNumber` + `format` 기반으로 숫자 포맷팅.

- 셀 렌더링 평탄화:
  - `renderCellContent(order, col, labels)`:
    - `renderCell` → Step 0 숨김(`hideOnStepZero`) → `defaultCellContent` 순으로 평탄한 if-return 구조.

- Step 0 행:
  - `STEP_CURRENT_STATE = 0`
  - 행 스타일:
    - `bg-blue-50/50 dark:bg-blue-900/20` 강조 배경.
  - `sharesAfter`, `poolAfter`는 Step 0에서 현재 보유량/Pool을 표시.

- Zero-state 표시:
  - `orders.length <= 1` (Step 0만 존재)일 때:
    - `labels.emptyOrder`를 colspan 한 줄로 렌더.

- 접근성(A11y) 오버레이:
  - 배경막 `div`:
    - `role="button"`, `tabIndex={0}`, `aria-label`(다국어).
    - `onClick` + `onKeyDown(Enter/Space)` 로 모달 닫기.

### 2.6 `components/VrPortfolioSummary.tsx`

**책임: VR 포트폴리오의 요약 영역 + 모달 트리거 및 Step 0 주입.**

- Props (`VrPortfolioSummaryProps`):
  - `vrSettings: VrBandStrategyParams` — 전략 설정(SSOT).
  - `vrSnapshot: VrSnapshot | undefined` — 실시간 상태.
  - `vrSnapshotError?: boolean` — 스냅샷 생성 실패/동기화 오류 플래그.
  - `lang: AppLang`.

- 내부 State:
  - `isModalOpen: boolean` — `VrOrderModal` open/close.
  - `pendingTimedOut: boolean` — 스냅샷 대기 타임아웃(예: 15초) 플래그.

- Fallback 로직:
  - `vrSnapshot == null` 이면:
    - `isError = vrSnapshotError || pendingTimedOut`
    - `VR_FALLBACK[lang][isError ? 'error' : 'pending']` 사용.
    - 대기/에러 문구를 색상 구분하여 렌더.

- Step 0 주입 (현재 상태 행):
  - `stepZeroRow: OrderLevel`을 `useMemo`로 생성:
    - `{ step: 0, price: 0, qty: 0, isBuffer: false, sharesAfter: vrSnapshot.shares, poolAfter: vrSnapshot.pool }`
  - `safeBuyOrders = [stepZeroRow, ...(vrSnapshot.buyOrders ?? [])]`
  - `safeSellOrders = [stepZeroRow, ...(vrSnapshot.sellOrders ?? [])]`
  - Step 0은 항상 배열의 맨 앞에 위치.

- 수치 포맷팅:
  - `toDisplayNumber(currentV/pool/bandLow/bandHigh)`
  - 통화 표시용 `formatCurrency(val)` 헬퍼:
    - `val === null ? '-' : '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2 })`

- 최대 매수 단계 N:
  - `maxBuyStep = calculateMaxBuyStep(vrSnapshot.buyOrders ?? [])`
  - `VR_SUMMARY[lang].maxBuyHint(maxBuyStep)` 로 `"예약 매수는 표의 N번까지..."` 문구를 생성.

- UI:
  - `VrBadge mode={vrSettings.vrMode} lang={lang}` 로 VR 타입 배지 표시.
  - `V`, `Pool`, `밴드` 수치 표시.
  - "예약 주문 가격표 보기" 버튼:
    - 클릭 시 `isModalOpen = true`
    - `VrOrderModal`에 `safeBuyOrders`, `safeSellOrders` 전달.

### 2.7 `components/Dashboard.tsx` (VR 관련 부분만)

**책임: VR 전략 포트폴리오 감지 및 VR 요약 컴포넌트 마운트.**

- 전략 플래그:

```typescript
const isMultiSplitStrategy = !!portfolio.strategy.multiSplit;
const isNoStopMultiSplitStrategy = !!portfolio.strategy.noStopMultiSplit;
const vrSettings = portfolio.strategy.vrBand;
const isVrStrategy = !!vrSettings;
```

- 티커 결정(`ma0Ticker`):

```typescript
const ma0Ticker =
  portfolio.strategy.multiSplit?.targetStock ||
  portfolio.strategy.noStopMultiSplit?.targetStock ||
  (isVrStrategy ? 'TQQQ' : portfolio.strategy.ma0?.stock) ||
  'TQQQ';
```

- MA 분석 useEffect에서 VR 우회:

```typescript
useEffect(() => {
  if (portfolio.strategy.multiSplit || portfolio.strategy.noStopMultiSplit || isVrStrategy) {
    setMaActiveSection(null);
    setMaRsiNotMet(false);
    setMaAlignmentNotMet(false);
    setMaPartialProfitLines([]);
    return;
  }
  // ... MA runAnalysis ...
}, [portfolio.id, portfolio.trades.length, portfolio.strategy.multiSplit, portfolio.strategy.noStopMultiSplit, maSectionDepsKey]);
```

- 전략 이름/아이콘 (`getStrategyInfo`):

```typescript
const getStrategyInfo = () => {
  if (isVrStrategy) {
    return {
      name: lang === 'ko' ? 'VR 밴드 전략' : 'VR Band Strategy',
      icon: <Layers size={14} className="text-indigo-500" />,
    };
  } else if (portfolio.strategy.multiSplit) {
    // ... 다분할 ...
  } else if (portfolio.strategy.noStopMultiSplit) {
    // ... 무손절 다분할 ...
  } else {
    // 이평선 전략
  }
};
```

- Daily Execution 블록에서 VR 안내 힌트:

```tsx
{isVrStrategy ? (
  <div className="text-[12px] text-indigo-600/90 dark:text-indigo-400/90 font-medium">
    {portfolio.vrSnapshot
      ? VR_DASHBOARD_HINT[lang].ready
      : VR_DASHBOARD_HINT[lang].pending}
  </div>
) : isMultiSplitStrategy ? (
  // ... 기존 다분할 ...
```

- VR 요약 마운트:

```tsx
{vrSettings && (
  <VrPortfolioSummary
    vrSettings={vrSettings}
    vrSnapshot={portfolio.vrSnapshot}
    lang={lang}
  />
)}
```

---

## 3. 핵심 데이터 흐름 (Data Flow)

### 3.1 설정 vs 상태 (SSOT & Snapshot)

1. **전략 설정 (SSOT)** — `Portfolio.strategy.vrBand: VrBandStrategyParams`
   - 사용자가 VR 전략을 생성할 때 지정하는 **고정 파라미터**:
     - 초기 V (`initialV`), 초기 자본(`initialCapital`)
     - 밴드폭(`bandRateUpper`/`bandRateLower`)
     - 수수료율(`feeRate`)
     - 기울기(`G`)
     - 최소 주문 수량(`minOrderQty`)
     - 매수 Pool 사용 비율(`poolUsageRateBuy`)
     - 사이클당 현금 흐름(`deltaCash`, 모드별 부호 강제).

2. **실시간 상태 (Snapshot)** — `Portfolio.vrSnapshot?: VrSnapshot`
   - Edge Function 또는 백엔드에서 주기적으로 계산/저장:
     - `currentV`, `pool`, `shares`, `avgPrice`, `bandLow`, `bandHigh`
     - `buyOrders`, `sellOrders` (`OrderLevel[]`, Step 0 포함)
   - 클라이언트는 이 값을 단순히 렌더링만 수행 (계산 X).

### 3.2 UI로의 전달

1. **Dashboard**
   - 포트폴리오별로 `strategy.vrBand` 존재 여부로 VR 전략 여부 판단.
   - VR일 때:

```tsx
{vrSettings && (
  <VrPortfolioSummary
    vrSettings={vrSettings}
    vrSnapshot={portfolio.vrSnapshot}
    lang={lang}
  />
)}
```

2. **VrPortfolioSummary**
   - `vrSettings`로부터 VR 모드/설정(`vrMode`, `G`, `deltaCash` 등)을 읽어:
     - `VrBadge mode={vrSettings.vrMode}` 렌더.
   - `vrSnapshot`으로부터:
     - `currentV`, `pool`, `bandLow`, `bandHigh` 렌더.
     - `buyOrders`/`sellOrders`를 읽어 Step 0 포함 배열(`safeBuyOrders`/`safeSellOrders`) 생성.
     - `calculateMaxBuyStep(vrSnapshot.buyOrders)` 로 "N번까지 주문" 힌트 계산.

3. **VrOrderModal**
   - `VrPortfolioSummary`로부터:
     - `buyOrders={safeBuyOrders}`
     - `sellOrders={safeSellOrders}`
     - `lang`
   - 언어별 라벨은 `VR_MODAL_LABELS[lang]`에서만 가져와 테이블 헤더/뱃지/Zero-state 메시지를 렌더.

4. **Edge Function (미구현 파트)**
   - 예상 플로우:
     - DB에서 `Portfolio` 및 `vrSnapshot` 로드.
     - `calculateNextV` / `calculateBands` / `generateBuyOrders` / `generateSellOrders` 호출.
     - 새 `VrSnapshot` 저장 후 클라이언트에 전달.

---

## 4. 컴포넌트 명세 (Component Specs)

### 4.1 `VrPortfolioSummary`

- **Props**
  - `vrSettings: VrBandStrategyParams`
  - `vrSnapshot: VrSnapshot | undefined`
  - `vrSnapshotError?: boolean`
  - `lang: AppLang`

- **State**
  - `isModalOpen: boolean` — 예약 주문표 모달 open/close.
  - `pendingTimedOut: boolean` — 스냅샷 대기 타임아웃 상태.

- **동작 요약**
  - `vrSnapshot == null`:
    - `VR_FALLBACK[lang]` 기반 pending/error 문구 표시.
  - `vrSnapshot != null`:
    - `stepZeroRow` 생성 후 `safeBuyOrders`/`safeSellOrders` 생성.
    - `formatCurrency` 로 V/Pool 표시.
    - `bandLow`/`bandHigh` 범위를 표시.
    - 버튼 클릭 시 `VrOrderModal` 오픈.
    - `maxBuyStep` 계산 후 힌트 렌더.

### 4.2 `VrOrderModal`

- **Props**
  - `isOpen: boolean`
  - `onClose: () => void`
  - `buyOrders: OrderLevel[]`
  - `sellOrders: OrderLevel[]`
  - `lang?: AppLang` (기본 `'ko'`)

- **State**
  - `activeTab: 'sell' | 'buy'` — 기본 `'buy'` (하단 매수 탭).

- **동작 요약**
  - `VR_MODAL_LABELS[lang]`로 모든 텍스트 라벨 로딩.
  - 탭 전환 시 `orders`를 `sellOrders`/`buyOrders`로 스위치.
  - `VrOrderTable` 내부에서:
    - Step 0 행 강조 + "현재 상태" 뱃지.
    - Step 0에서는 `price`/`qty`에 `'-'` 표시.
    - Step 0 + buffer 상태에서 스타일/가이드 뱃지 적용.
    - `labels.emptyOrder`로 Zero-state 메시지 렌더.

### 4.3 `VrBadge`

- **Props**
  - `mode: VrMode` (`'accumulate' | 'withdraw' | 'lump_sum'`)
  - `lang: AppLang`

- **동작 요약**
  - `VR_BADGE_CONFIG[mode]`를 사용해:
    - 텍스트 (`textKo`/`textEn`)
    - 클래스 (`classes`)
  를 결정하고 `<span>`으로 배지 렌더.

### 4.4 Dashboard 내 VR 관련 블록

- **전략명/아이콘**: `getStrategyInfo`에서 VR 모드를 첫 분기로 처리.
- **티커**: VR 전략일 때는 fallback `'TQQQ'` 로고 사용.
- **Daily Execution**:
  - VR 전략일 때만 `VR_DASHBOARD_HINT[lang]` 기반 안내 문구 렌더.
  - 이평선 및 다분할 로직은 VR일 때 비활성화.

---

## 5. 현재 진행 상태 및 남은 작업 (Current Status & Pending Tasks)

### 5.1 완료된 작업 (Completed)

- **코어 계산 엔진 (`utils/vrBandStrategy.ts`)**
  - `calculateNextV`, `calculateBands` 구현 (문서 수식 준수).
  - `generateBuyOrders`, `generateSellOrders`:
    - Pool 예산/버퍼 2개/서킷 브레이커(최대 20단계)/0달러 호가 방어/0주·Pool=0·분모 0 방어 포함.
  - `calculatePoolDelta`, `validateFinancialArgs`, `toDisplayNumber` 등 방어적 프로그래밍 적용.

- **타입 및 데이터 모델 (`types.ts`)**
  - `VrBandStrategyBase` + Discriminated Union(`VrBandStrategyParams`).
  - `OrderLevel`, `VrSnapshot`, `Strategy.vrBand`, `Portfolio.vrSnapshot`.
  - `getVrDeltaCashForNextV`에서 모드별 부호 강제.

- **VR 상수 및 I18N (`constants/vrMessages.ts`)**
  - `VR_MODAL_LABELS`, `VR_FALLBACK`, `VR_SUMMARY`, `VR_BADGE_CONFIG`, `VR_TAB_ICONS`, `VR_DASHBOARD_HINT`.
  - 모든 VR 관련 텍스트는 이 파일에서만 관리.

- **UI 컴포넌트**
  - `VrPortfolioSummary.tsx`:
    - VR 요약 박스, Fallback, Step 0 주입, N 계산, 모달 트리거.
  - `VrOrderModal.tsx`:
    - 탭 기반 예약 주문표 모달, Step 0(현재 상태) 행, Zero-state 메시지, A11y 오버레이.
  - `VrBadge.tsx`:
    - VR 모드 배지(거치식/적립식/인출식) 표시.
  - `Dashboard.tsx`:
    - VR 전략 감지, VR 요약 마운트, VR 전략명/아이콘, VR용 힌트 텍스트 표시.

### 5.2 남은 작업 (Pending)

- **[미완료] `dailyExecutionSummary.ts` 알람 텍스트 포매터 연동**
  - `formatPortfolioDailyExecutionBlock` 에 VR 인자(`vrSnapshot`, `vrMode`, `vrMaxBuyStep` 등)를 추가하고,
  - VR일 때:
    - V, Pool, 밴드, deltaCash, "예약 매수는 N번까지" 등의 라인을 알람 텍스트에 포함.
  - 현재는 MA/다분할 전략용 포맷터만 존재하며, VR 분기/문구는 미구현.

- **[미완료] Edge Function(백엔드) 일일 갱신 로직 연동**
  - 대상: `supabase/functions/generate-daily-execution-summaries` 또는 별도 VR 전용 Edge Function.
  - 해야 할 일:
    - DB에서 `Portfolio` + 기존 `vrSnapshot` 로드.
    - `calculateNextV` / `calculateBands` / `generateBuyOrders` / `generateSellOrders` 호출.
    - 새 `VrSnapshot` 을 `portfolio.vrSnapshot` 필드에 저장.
    - 텔레그램/알람용 텍스트 생성시 VR용 `formatPortfolioDailyExecutionBlock` 분기 사용.

- **[미완료] 실제 매매 체결 시 DB 상태 업데이트 (`handleVrTrade`)**
  - 문서에 제안된 플로우:
    1. `portfolio.vrSnapshot` 존재 여부 가드 (없으면 매매 금지).
    2. `calculatePoolDelta(type, price, quantity, feeRate)` 로 Pool 변동액 계산.
    3. `trade.metadata.pool_after = newPool` 로 저장 후 기존 `handleAddTrade` 호출.
    4. `computeVrSnapshotAfterTrade`(미구현 헬퍼)로:
       - `shares`, `avgPrice`, `pool`, 필요 시 `currentV`/밴드/예약 주문표 재계산.
    5. 새 `VrSnapshot` 으로 DB 업데이트.
  - 현재:
    - `calculatePoolDelta`/`validateFinancialArgs` 등 엔진은 준비 완료.
    - 실제 `handleVrTrade` 와 스냅샷 갱신 로직은 구현되지 않은 상태.

---

이 문서는 2026년 현재 시점의 **VR 밴드 전략 As-Built 구현 상태**를 반영한다.  
신규 기여자는 본 문서를 통해:
- 타입 모델(`types.ts`)
- 코어 엔진(`vrBandStrategy.ts`)
- UI 계층(`Dashboard`, `VrPortfolioSummary`, `VrOrderModal`, `VrBadge`)
- 상수/I18N(`vrMessages.ts`)
간의 의존 관계와 책임 분리를 이해하고, 남은 백엔드/알람 연동 작업을 이어갈 수 있다.

---

## 🛡️ [Appendix] Core Architecture & Edge-Case Defenses (결정 히스토리)

본 시스템은 단순한 UI 렌더링을 넘어, 금융 시스템 수준의 안정성을 확보하기 위해 다음과 같은 엄격한 방어 로직과 클린 코드 원칙이 적용되어 있습니다. 새로 합류하는 개발자는 이 원칙을 절대 훼손해서는 안 됩니다.

### 1. 코어 엔진 방어 로직 (`utils/vrBandStrategy.ts`)
* **0주 데드락(Deadlock) 방지:** 고객이 주식을 모두 매도하여 `shares === 0`이 되었을 때, `0`으로 나누기(Divide by zero) 에러가 발생하지 않도록 첫 매수 분모를 `minOrderQty`로 보정하여 최초 진입가를 안전하게 산출합니다.
* **0달러 무한 루프(OOM) 원천 차단:** 동전주 폭락이나 계산식 오차로 인해 반올림된 주문 가격(`price`)이 `0`달러 이하가 될 경우, 예산이 닳지 않아 예약 주문표를 무한대로 생성하는 서버 크래시를 막기 위해 `if (price <= 0) break;` 서킷 브레이커가 적용되어 있습니다.
* **물리적 서킷 브레이커 (MAX_ORDER_STEPS):** 비정상적인 예산/주문 단위 입력으로 인한 메모리 초과를 막기 위해 루프 최대 생성 횟수를 20회(또는 지정된 하드 리밋)로 제한합니다.
* **부호 강제 (Sign Enforcement):** 적립식/인출식 등 `deltaCash` 입력 시, 프론트엔드의 오입력을 신뢰하지 않고 엔진 단에서 `Math.abs()`를 활용해 물리적으로 올바른 부호(+,-)를 강제합니다.

### 2. UI/UX 및 클린 코드 원칙
* **접근성(A11y) 필수 적용:** 모달 배경막(Backdrop) 등 클릭 가능한 모든 `div`에는 반드시 `role="button"`, `tabIndex`, `onKeyDown` 이벤트 핸들러가 포함되어 있어 스크린 리더 및 키보드 사용자의 권리를 보장합니다.
* **I18N 하드코딩 완전 배제:** Dashboard 및 모든 컴포넌트 내부에는 한국어/영어 문자열이 직접 작성되어 있지 않습니다. 모든 텍스트는 단일 소스인 `constants/vrMessages.ts`에서 가져와 렌더링(DRY 원칙)합니다.
* **조건문 평탄화 (Flattening):** JSX 내부에 3중 삼항 연산자(`a ? b : c ? d : e`) 사용을 엄격히 금지하며, 테이블 셀 렌더링 등 복잡한 조건은 외부 헬퍼 함수(`renderCellContent` 등)의 `if-return` 구조로 평탄화되어 있습니다.
* **전략 간 간섭 차단 (`Dashboard.tsx`):** 기존 이평선(MA) 및 다분할 전략과 VR 밴드 전략이 충돌하지 않도록 명확한 분기(`isVrStrategy`)를 통해 렌더링 및 알람 페이로드 계산이 완벽하게 격리되어 있습니다.

이렇게 커서에게 문서 생성을 지시하시고, 위 부록을 추가해 두시면 완벽합니다.

