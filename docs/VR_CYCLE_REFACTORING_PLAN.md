## 1. 개요 및 아키텍처 변경점

### 1.1 목적

타겟 밸류 채널(VR 밴드) 전략에 **리밸런싱 주기(cycleWeeks)** 개념을 도입한다. 사용자는 전략 생성 시 **1~12주 단위**로 주기를 선택하며, 이 값은:

- 타입 레벨: `VrBandStrategyBase`/`VrBandStrategyParams`에 **필수 설정값**으로 포함되고
- UI 레벨: 전략 생성 폼(StrategyCreator)과 대시보드 요약 박스에 노출되며
- 백엔드/스케줄러 레벨: **언제 새로운 사이클을 시작해 V/주문표를 재계산할지**를 결정하는 기준으로 사용된다.

본 문서는 실제 코드 변경 전에, **파일별 Before/After 코드 스니펫과 예상 에러, 방어 전략까지 포함한 기술 설계서**이다.

### 1.2 현재 아키텍처 요약 (사이클 관점)

- VR 전략 설정(SSOT): `Strategy.vrBand?: VrBandStrategyParams`
- 런타임 상태: `Portfolio.vrSnapshot?: VrSnapshot`
- 현재는 **사이클 주기 파라미터가 없음**:
  - “언제 리밸런싱할지”는 코드에 구체적으로 표현되지 않고,
  - 최근 변경으로, **사이클 도중 매매는 Pool/shares/avgPrice만 갱신하고 V/밴드/주문표는 고정**하도록 `computeVrSnapshotAfterTrade`가 변경되어 있음.

### 1.3 cycleWeeks 도입에 따른 아키텍처 변경점

- **타입/데이터 모델**:
  - `VrBandStrategyBase`에 `cycleWeeks: number` 필드 추가 (1~12 범위).
  - 모든 VR 포트폴리오의 `strategy.vrBand` JSON은 `cycleWeeks`를 갖게 됨.

- **UI**:
  - StrategyCreator에서 VR 모드 선택 시, **1~12주 드롭다운 또는 number input** 추가.
  - 대시보드의 **"일별 매매 실행" 파란색 박스 헤더(`Dashboard.tsx`)** 안에서 VR 전략일 때만,
    - VR 모드 배지(`VrBadge`) 오른쪽에 **`#1: 3/18 ~ 3/24`** 형식의 사이클 배지를 함께 렌더링:
      - `#회차: MM/DD ~ MM/DD` (현재 사이클 번호 + 해당 기간)
      - 여백을 살리기 위해 짧은 텍스트 포맷만 사용.

- **로직/백엔드** (이 문서에서는 스켈레톤 수준):
  - 날짜 기반 헬퍼: `(startDate, cycleWeeks, today)` → 현재 사이클 인덱스/기간을 계산하고, UI/알람용 문자열 `#n: MM/DD ~ MM/DD` 생성.
  - 백그라운드 스케줄러(Edge Function/Cron)는 각 포트폴리오의 `cycleWeeks`를 사용해 **새 사이클이 도래했는지** 판정하고, 해당 시점에만 V/밴드/주문표를 재계산.

- **마이그레이션/호환성**:
  - 기존 VR 포트폴리오에는 `cycleWeeks`가 없으므로, **기본값(예: 2주)** 를 DB 마이그레이션(SQL) 또는 런타임 방어(`?? 2`)로 처리해야 한다.

---

## 2. 파일별 실제 코드 변경 계획 (Before / After)

> 주의: 이 섹션의 코드는 **설계용 예시**이며, 일부는 이미 병합되었을 수 있다.

### 2.0 [CRITICAL] 스니펫 상대 import 경로 (실제 파일 위치 기준)

계획서 코드를 복사할 때 **파일이 놓인 디렉터리**에 따라 `..` 개수가 바뀐다. 아래는 **레포 루트 기준 일반 규칙**이다.

| 작성 위치 | `types` | `utils` | `constants` (요약) |
|-----------|---------|---------|---------------------|
| `components/*.tsx` (루트) | `from '../types'` | `from '../utils/vrBandStrategy'` | 아래 **[FINAL PATH SEAL]** |
| `components/strategies/*.tsx` | `from '../../types'` | `from '../../utils/vrBandStrategy'` | 아래 **[FINAL PATH SEAL]** |
| `hooks/*.ts` (예: `useVrOrders.ts`) | `from '../types'` | (필요 시) `from '../utils/vrBandStrategy'` | `from '../constants/vrConstants'` 등 |
| `utils/*.ts` | `from '../types'` | **`from './vrBandStrategy'`** (동일 폴더만; `../utils/vrBandStrategy` 우회 금지) | `from '../constants/vrConstants'` 등 |
| `constants/vrConstants.ts` | `import type { OrderLevel } from '../types'` (타입 전용) | — | — |
| `supabase/functions/<name>/index.ts` | Deno 전용 — `../_shared/types.ts` 또는 `../../../types.ts` (§4.2) | `../../../utils/vrBandStrategy.ts` 등 배포 정책에 맞출 것 | `../../../constants/vrConstants.ts` |

**[FINAL PATH SEAL] `constants` 복붙용:**

- **`components/` 루트** (`Dashboard.tsx`, `StrategyCreator.tsx`, `VrOrderModal.tsx`, `VrPortfolioSummary.tsx` 등):  
  `from '../constants/vrConstants'`, `from '../constants/vrMessages'` (필요 시 기타 `../constants/...`).  
  타입은 **`from '../types'`** 만 — **`../../types` 금지** (한 단계 더 올라가면 빌드 실패).  
  공통 훅: **`from '../hooks/useVrOrders'`** (`hooks/`는 프로젝트 루트 기준).
- **`components/strategies/`** (`VrBandStrategyForm.tsx` 등):  
  `from '../../constants/vrConstants'`, `from '../../constants/vrMessages'`.

**`utils/` 세부 (`portfolioNormalize.ts`, `dailyExecutionSummary.ts`, `vrBandStrategy.ts` 등):**

- `from '../types'`, `from '../constants/vrConstants'`, **`from '../constants/vrMessages'`** (필요 시).
- 동일 폴더의 `vrBandStrategy` 참조는 **`from './vrBandStrategy'`** 만.
- **금지:** `from '../utils/vrBandStrategy'`, **`from './constants/...'`** (constants는 프로젝트 루트의 `constants/`이므로 항상 `../constants/...`).

**금지:** `components/StrategyCreator.tsx`에 `./types` 또는 `../../utils/...`처럼 **깊이를 어림잡아** 쓰기. `utils/*.ts`에서 동일 폴더 `vrBandStrategy`를 `../utils/...`로 가져오기.

**복붙 예시 (표와 동일 SSOT):** `components/StrategyCreator.tsx` → `from '../utils/vrBandStrategy'`, `from '../constants/vrConstants'` / `components/strategies/VrBandStrategyForm.tsx` → `from '../../utils/vrBandStrategy'`, `from '../../constants/vrConstants'`.

### 2.1 `types.ts` — `VrBandStrategyBase`에 cycleWeeks 추가

#### 2.1.1 Before

```ts
// types.ts (발췌)

export interface VrBandStrategyBase {
  initialV: number;
  initialCapital: number;
  bandRateUpper: number;
  bandRateLower: number;
  feeRate: number;
  G: number;
  minOrderQty: number;
  poolUsageRateBuy: number;
}

export interface VrBandAccumulate extends VrBandStrategyBase {
  vrMode: 'accumulate';
  deltaCash: number;
}

export interface VrBandWithdraw extends VrBandStrategyBase {
  vrMode: 'withdraw';
  deltaCash: number;
}

export interface VrBandLumpSum extends VrBandStrategyBase {
  vrMode: 'lump_sum';
  deltaCash: 0;
}
```

#### 2.1.2 After

```ts
// types.ts (설계안)

export interface VrBandStrategyBase {
  initialV: number;
  initialCapital: number;
  bandRateUpper: number;
  bandRateLower: number;
  feeRate: number;
  G: number;
  minOrderQty: number;
  poolUsageRateBuy: number;
  /** 리밸런싱 주기(주). 1~12 사이의 정수. */
  cycleWeeks: number;
}

export interface VrBandAccumulate extends VrBandStrategyBase {
  vrMode: 'accumulate';
  deltaCash: number;
}

export interface VrBandWithdraw extends VrBandStrategyBase {
  vrMode: 'withdraw';
  deltaCash: number;
}

export interface VrBandLumpSum extends VrBandStrategyBase {
  vrMode: 'lump_sum';
  deltaCash: 0;
}
```

> **주의**: `cycleWeeks`를 Optional(`?`)로 두지 않고 필수로 추가하면, `VrBandStrategyParams`를 생성하는 모든 코드에서 이 필드를 채워야 한다. 아래 StrategyCreator 변경이 그 역할을 한다.

#### 2.1.3 `VrSnapshot` 타입 확장

백엔드 스케줄러(섹션 4)에서 사이클 전환 여부를 판별하기 위해, `VrSnapshot`에도 현재 사이클 인덱스를 기록하는 필드를 추가한다.

```ts
// types.ts (설계안 — VrSnapshot 확장)

export interface VrSnapshot {
  // ... 기존 속성들 (pool, shares, avgPrice, currentV, bandLow, bandHigh, buyOrders, sellOrders 등)

  /** 현재 진행 중인 리밸런싱 사이클 회차 (0부터 시작) */
  cycleIndex?: number;
}
```

> `cycleIndex`를 Optional(`?`)로 두는 이유: 기존에 이미 저장된 `vrSnapshot`에는 이 필드가 없으므로, `?? -1` 폴백으로 안전하게 처리한다 (섹션 4 Edge Function 참고).

#### 2.1.4 `PortfolioRow` — DB(Supabase) snake_case 행 타입 (`types.ts` 추가)

**🚨 [CRITICAL]** §4.2 `mapPortfolioRow(row: PortfolioRow)` 등은 **실제로 존재하는 타입**을 참조해야 한다.  
앱에는 `Portfolio`(camelCase)만 있고 Row 타입이 없으면 Edge·정규화 코드가 **즉시 TS2304**로 멈춘다.

아래를 **`types.ts`에 `export`로 추가**한다. 필드는 실제 `portfolios` 테이블·`.select()` 컬럼에 맞게 보강·옵셔널 조정한다.

```ts
// types.ts — DB에서 가져온 snake_case 행 (매핑 전 단계). Record 확장으로 추가 컬럼도 허용.
export interface PortfolioRow extends Record<string, unknown> {
  id?: string | null;
  user_id?: string | null;
  name?: string | null;
  daily_buy_amount?: number | null;
  start_date?: string | null;
  fee_rate?: number | null;
  /** 레거시/일부 클라이언트에서 camelCase로 올 수 있음 — `fee_rate` 우선 */
  feeRate?: number | null;
  strategy?: Strategy;
  trades?: Trade[] | null;
  alarm_config?: AlarmConfig | null;
  is_quarter_mode?: boolean | null;
  is_closed?: boolean | null;
  closed_at?: string | null;
  final_sell_amount?: number | null;
  vr_snapshot?: VrSnapshot | null;
}
```

- **프론트** `utils/portfolioNormalize.ts`는 **`RawPortfolioRow` 등 판박이 인터페이스를 새로 만들지 말고** `import type { PortfolioRow } from '../types'`(또는 동일 re-export)만 사용한다 — **이중 SSOT 금지** (§9.8.2).
- **Edge** `mapPortfolioRow`는 `import type { PortfolioRow, Portfolio, ... } from '../_shared/types.ts'`(re-export)로 동일 심볼을 쓴다.

#### 2.1.5 [CRITICAL] Pool 사용 비율 — `vrPoolUsagePct` vs `poolUsageRateBuy` 명명 계약

**이 둘은 서로 다른 단위이므로 “이름만 통일”하면 안 된다.** 설계도에 부품 A(소수)·B(퍼센트)가 모두 필요하되, **조립 위치**를 고정한다.

| 위치 | 변수·필드명 | 단위 | 예시 |
|------|-------------|------|------|
| React state, `VrBandStrategyForm` props | **`vrPoolUsagePct`** | **퍼센트** (UI, `50` = 50%) | 입력·라벨 `%` |
| `VrBandStrategyParams`, DB `strategy.vrBand`, `generateBuyOrders` 인자 | **`poolUsageRateBuy`** | **소수 비율** (`0.5` = 50%) | `pool * poolUsageRateBuy` |

**필수 매핑 (단일 경계):** `StrategyCreator.handleSave` VR 분기에서만  
`const poolUsageRateBuy = Number.isFinite(vrPoolUsagePct) ? toDecimalRate(vrPoolUsagePct) : 0`  
후 `vrParams` 객체에 **`poolUsageRateBuy` 키**로 넣는다.

**🚨 금지:**

- `vrParams`에 **`vrPoolUsagePct` 키**를 넣거나 DB에 퍼센트 값을 그대로 저장.
- `generateBuyOrders({ poolUsageRateBuy: vrPoolUsagePct, ... })`처럼 **퍼센트를 소수 필드에 직접 주입**.
- UI props 이름을 `poolUsageRateBuy`로 바꿔 **50을 소수로 오해**하게 만들기.

계획서 스니펫은 위 계약을 따른다. “변수명을 전부 `poolUsageRateBuy`로만 통일”하는 것은 **단위 오류**를 유발하므로 따르지 않는다.

---

### 2.2 `constants/vrConstants.ts` — 전역 상수 정의 (매직 넘버 제거)

리밸런싱 주기와 기본 타임존에 대한 매직 넘버/문자열을 제거하고,  
모든 코드에서 공통 상수를 참조하도록 전역 상수를 정의한다.

```ts
// constants/vrConstants.ts (설계안 — VR 금육·주기·빈 주문 폴백 SSOT 단일 블록)

import type { OrderLevel } from '../types';

export const VR_CYCLE = {
  DEFAULT_WEEKS: 2,
  MIN_WEEKS: 1,
  MAX_WEEKS: 12,
} as const;

export const DEFAULT_TIMEZONE = 'Asia/Seoul';

/** 🚨 [SSOT] VR·`strategy.vrBand.feeRate` 등 **소수** 수수료율 기본값(0.0025 = 0.25%). UI 퍼센트 `0.25`와 혼동 금지. */
export const DEFAULT_FEE_RATE = 0.0025;

/**
 * 🚨 [Legacy / 비-VR 포트폴리오 루트 `Portfolio.feeRate` SSOT]
 * 다분할·RSI 등 **비 VR** 경로는 `StrategyCreator`에서 수수료를 **퍼센트**(예: 0.25 = 0.25%)로 저장하는 계약이 있다.
 * `normalizePortfolioData`의 **포트폴리오 최상위** `feeRate` 폴백에만 사용 — `DEFAULT_FEE_RATE`(소수)와 바꿔 쓰면 타 전략 금융 수학이 붕괴한다.
 */
export const LEGACY_FEE_RATE_PCT = 0.25;

/** 🚨 [Financial Math SSOT] 퍼센트 → 소수 비율 변환 시 부동소수점 오염 방지용 고정밀 배수 (지역 `1_000_000_000` 금지) */
export const RATE_PRECISION_MULTIPLIER = 1_000_000_000;

/** VR 스냅샷에 buy/sellOrders가 없을 때 `??` 폴백용 — 인라인 `[]` 금지. 런타임 `push` 오염 방지를 위해 동결. §5.4 호출부. */
export const EMPTY_VR_ORDERS: OrderLevel[] = Object.freeze([]) as unknown as OrderLevel[];
```

이 상수는 다음과 같이 사용될 예정이다.

- `StrategyCreator.tsx`:
  - 초기 state: `const [vrCycleWeeks, setVrCycleWeeks] = useState(VR_CYCLE.DEFAULT_WEEKS);`
  - 검증: `vrCycleWeeks < VR_CYCLE.MIN_WEEKS || vrCycleWeeks > VR_CYCLE.MAX_WEEKS`
  - VR 저장 시: **`Portfolio.feeRate`(루트)** 는 **퍼센트 유지** — `newP.feeRate`에 `toDecimalRate` 금지(§4.0). **`vrBand.feeRate`** 만 소수; 누락/비유한 시 **`DEFAULT_FEE_RATE`** (`0.0025`·`0.25` 하드코딩 금지).
  - 퍼센트→소수: **`RATE_PRECISION_MULTIPLIER`**만 사용 — 파일 내부 `const PRECISION_MULTIPLIER = 1_000_000_000` 금지 (§4.0).
- `LEGACY_FEE_RATE_PCT`:
  - **`normalizePortfolioData`·Edge `mapPortfolioRow`** 등 **포트폴리오 루트** `feeRate` 폴백 전용(퍼센트). VR 내부 `vrBand.feeRate`에는 **`DEFAULT_FEE_RATE`**(소수)만 사용 — §9.8.2 · §4.2.
- `EMPTY_VR_ORDERS`:
  - `Dashboard.tsx` / `VrPortfolioSummary.tsx` 등 §5.4 — 스냅샷 없음·Step 0 불가 시 **빈 배열 폴백 전용**. **`VrOrderModal` 주문 목록은 `buyOrders ?? EMPTY_VR_ORDERS` 단독 금지** — 반드시 §5.4대로 **`hooks/useVrOrders.ts` SSOT**(내부에서 Step 0 + 스냅샷 병합) 후 전달. 컴포넌트에 **동일 `useMemo` 3중 복붙 금지.** **스프레드·복사 후 조작** — 공유 배열에 직접 `push` 금지.
- `normalizePortfolioData`:
  - `cycleWeeks` 보정: `rawCycle`가 없으면 `VR_CYCLE.DEFAULT_WEEKS` 적용.
  - **최상위** `fee_rate`/`feeRate` 누락 시: **`LEGACY_FEE_RATE_PCT`** (비 VR 레거시와 동일 단위). **`vrBand.feeRate`** 누락 시에만 **`DEFAULT_FEE_RATE`** — 이중 잣대 금지(루트 vs VR).
- `getVrCyclePeriodText`:
  - `cycleWeeks`가 잘못된 값일 때 방어 로직에서 `VR_CYCLE.MIN_WEEKS`를 하한으로 사용.
- Timezone:
  - 대시보드/알람에서 `portfolio.alarmconfig?.timezone || DEFAULT_TIMEZONE` 형태로 기본값 주입.

---

### 2.3 `constants/vrMessages.ts` — VR 생성 폼 라벨에 주기 관련 I18N 추가

#### 2.3.1 Before

```ts
// constants/vrMessages.ts (발췌)

export const VR_CREATOR_LABELS: Record<
  AppLang,
  {
    strategyTitle: string;
    strategyDesc: string;
    sectionTitle: string;
    modeLabel: string;
    modes: { ... };
    initialCapital: string;
    initialV: string;
    bandUpper: string;
    bandLower: string;
    minOrderQty: string;
    G: string;
    poolUsage: string;
    deltaCash: string;
    feeRate: string;
    // ...
  }
> = {
  ko: {
    strategyTitle: '타겟 밸류 채널',
    // ...
    initialCapital: '초기 투자 원금 ($)',
    initialV: '초기 V 값 ($)',
    bandUpper: '상단 밴드 폭 (%)',
    bandLower: '하단 밴드 폭 (%)',
    minOrderQty: '최소 주문 수량 (주)',
    G: 'G (풀-밴드 비율 계수)',
    poolUsage: '매수 시 Pool 사용 비율 (%)',
    deltaCash: '주기별 입·출금 금액 ($)',
    feeRate: '수수료율 (%)',
    // ...
  },
  en: {
    strategyTitle: 'Target Value Channel',
    // ...
    initialCapital: 'Initial Capital ($)',
    initialV: 'Initial V ($)',
    bandUpper: 'Upper Band Width (%)',
    bandLower: 'Lower Band Width (%)',
    minOrderQty: 'Minimum Order Quantity (shares)',
    G: 'G (Pool-to-band ratio)',
    poolUsage: 'Pool Usage on Buy (%)',
    deltaCash: 'Periodic Cash In/Out ($)',
    feeRate: 'Fee Rate (%)',
    // ...
  },
};
```

#### 2.3.2 After

```ts
// constants/vrMessages.ts (설계안)

export const VR_CREATOR_LABELS: Record<
  AppLang,
  {
    strategyTitle: string;
    strategyDesc: string;
    sectionTitle: string;
    modeLabel: string;
    modes: { ... };
    initialCapital: string;
    initialV: string;
    bandUpper: string;
    bandLower: string;
    minOrderQty: string;
    G: string;
    poolUsage: string;
    /** 리밸런싱 주기(주) 라벨 */
    cycleWeeks: string;
    /** 리밸런싱 주기 검증 에러 메시지 */
    cycleWeeksError: (min: number, max: number) => string;
    /** 드롭다운 옵션 표시용 텍스트 생성기 */
    cycleWeeksOption: (week: number) => string;
    /** 사이클 기간 UI 표시용 포맷터 (#1: 3/18 ~ 3/24 등) */
    cyclePeriodFormat: (index: number, start: string, end: string) => string;
    deltaCash: string;
    feeRate: string;
    // ...
  }
> = {
  ko: {
    strategyTitle: '타겟 밸류 채널',
    // ...
    initialCapital: '초기 투자 원금 ($)',
    initialV: '초기 V 값 ($)',
    bandUpper: '상단 밴드 폭 (%)',
    bandLower: '하단 밴드 폭 (%)',
    minOrderQty: '최소 주문 수량 (주)',
    G: 'G (풀-밴드 비율 계수)',
    poolUsage: '매수 시 Pool 사용 비율 (%)',
    cycleWeeks: '리밸런싱 주기 (주)',
    cycleWeeksError: (min, max) => `리밸런싱 주기는 ${min}~${max}주 사이여야 합니다.`,
    cycleWeeksOption: (week) => `${week}주`,
    cyclePeriodFormat: (index, start, end) => `#${index}: ${start} ~ ${end}`,
    deltaCash: '주기별 입·출금 금액 ($)',
    feeRate: '수수료율 (%)',
    // ...
  },
  en: {
    strategyTitle: 'Target Value Channel',
    // ...
    initialCapital: 'Initial Capital ($)',
    initialV: 'Initial V ($)',
    bandUpper: 'Upper Band Width (%)',
    bandLower: 'Lower Band Width (%)',
    minOrderQty: 'Minimum Order Quantity (shares)',
    G: 'G (Pool-to-band ratio)',
    poolUsage: 'Pool Usage on Buy (%)',
    cycleWeeks: 'Rebalancing Period (weeks)',
    cycleWeeksError: (min, max) =>
      `Rebalancing period must be between ${min} and ${max} weeks.`,
    cycleWeeksOption: (week) => `${week} week${week > 1 ? 's' : ''}`,
    cyclePeriodFormat: (index, start, end) => `Cycle ${index}: ${start} to ${end}`,
    deltaCash: 'Periodic Cash In/Out ($)',
    feeRate: 'Fee Rate (%)',
    // ...
  },
};
```

---

### 2.4 `components/strategies/VrBandStrategyForm.tsx` 및 `StrategyCreator.tsx` 연동

VR 밴드의 모든 입력 UI는 단일 책임 원칙(SRP)에 따라 `VrBandStrategyForm.tsx`에서 전담한다.
`StrategyCreator.tsx`는 상태(State)만 보유하고 Props로 주입하는 껍데기(Layout) 역할만 수행한다.
`cycleWeeks` 속성을 인터페이스에 추가하고 UI를 구현한다.

#### 2.4.1 `VrBandStrategyForm.tsx` 인터페이스 및 UI 수정

**🚨 [2.4.2항과 계약 일치]** `values` / `callbacks` 객체 묶음은 폐기하고, **평탄화된 단일 `VrBandStrategyFormProps`**만 사용한다. 기존 JSX의 `values.xxx`·`callbacks.setXxx` 참조는 전부 **`xxx` prop / `onXxxChange` 콜백**으로 치환한다.

```tsx
// components/strategies/VrBandStrategyForm.tsx

// 1. 컴포넌트 외부: 상수 기반 옵션 배열 호이스팅 (유지 — 리렌더마다 배열 재생성 방지)
import type { AppLang, VrBandStrategyParams } from '../../types';
import { VR_CREATOR_LABELS } from '../../constants/vrMessages';
import { VR_CYCLE } from '../../constants/vrConstants';
import { sanitizeVrCycleWeeks } from '../../utils/vrBandStrategy';

const CYCLE_WEEK_OPTIONS = Array.from(
  { length: VR_CYCLE.MAX_WEEKS - VR_CYCLE.MIN_WEEKS + 1 },
  (_, i) => i + VR_CYCLE.MIN_WEEKS,
);

// 🚨 [React Anti-Pattern 방어] values, callbacks 인라인 객체 묶음 절대 금지 (§2.4.2 · Core Principles §10)
// 2. 인터페이스 평탄화 (Flat Props — Setter는 onVr*Change 네이밍 통일)
export interface VrBandStrategyFormProps {
  lang: AppLang;
  showErrors: boolean;
  vrMode: VrBandStrategyParams['vrMode'];
  onVrModeChange: (mode: VrBandStrategyParams['vrMode']) => void;
  vrInitialCapital: number;
  onVrInitialCapitalChange: (v: number) => void;
  vrInitialV: number;
  onVrInitialVChange: (v: number) => void;
  vrMinOrderQty: number;
  onVrMinOrderQtyChange: (v: number) => void;
  vrBandUpperPct: number;
  onVrBandUpperPctChange: (v: number) => void;
  vrBandLowerPct: number;
  onVrBandLowerPctChange: (v: number) => void;
  vrG: number;
  onVrGChange: (v: number) => void;
  vrPoolUsagePct: number;
  onVrPoolUsagePctChange: (v: number) => void;
  vrDeltaCash: number;
  onVrDeltaCashChange: (v: number) => void;
  vrCycleWeeks: number;
  onVrCycleWeeksChange: (v: number) => void;
}

export default function VrBandStrategyForm({
  lang,
  showErrors,
  vrMode,
  onVrModeChange,
  vrInitialCapital,
  onVrInitialCapitalChange,
  vrInitialV,
  onVrInitialVChange,
  vrMinOrderQty,
  onVrMinOrderQtyChange,
  vrBandUpperPct,
  onVrBandUpperPctChange,
  vrBandLowerPct,
  onVrBandLowerPctChange,
  vrG,
  onVrGChange,
  vrPoolUsagePct,
  onVrPoolUsagePctChange,
  vrDeltaCash,
  onVrDeltaCashChange,
  vrCycleWeeks,
  onVrCycleWeeksChange,
}: VrBandStrategyFormProps) {
  const vrT = VR_CREATOR_LABELS[lang];

  // 3. 컴포넌트 내부 UI 렌더링 — 기존 그리드/모드 버튼 등은 vrMode·onVrModeChange 등 직접 참조로 이전
  return (
    <div className="space-y-3">
      <label htmlFor="vrCycleWeeksSelect" className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
        {vrT.cycleWeeks}
      </label>
      <select
        id="vrCycleWeeksSelect"
        value={vrCycleWeeks}
        onChange={(e) => onVrCycleWeeksChange(sanitizeVrCycleWeeks(e.target.value))}
        className="w-full p-4 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-black ..."
      >
        {CYCLE_WEEK_OPTIONS.map((week) => (
          <option key={week} value={week}>
            {vrT.cycleWeeksOption(week)}
          </option>
        ))}
      </select>
      {/* [Zero Dead Code] <select>는 유효값만 선택 가능 — 범위 초과 에러 블록은 Dead Code로 삭제 */}
    </div>
  );
}
```

#### 2.4.2 `StrategyCreator.tsx` 상태 연동 및 날짜 고정

부모 컴포넌트에서는 상태를 들고 자식에게 Props로 주입하며,
VR 전략 시 시작일을 로컬 오늘 날짜로 강제 고정한다.

**🚨 [Core Principles §10] 무거운 자식 컴포넌트에 `values={{ ... }}` / `callbacks={{ ... }}` 같은 인라인 객체를 props로 넘기지 않는다.**  
부모가 리렌더될 때마다 객체 참조가 매번 새로 생겨 `React.memo`가 무력화되고, 입력 시 **렌더링 폭포·인풋 랙**이 난다. **Props는 평탄화(Flattening)** 하여 원시값·개별 setter·`useCallback`으로 안정화한 핸들러만 넘긴다. (`VrBandStrategyForm`의 props 인터페이스도 이에 맞게 개별 필드로 확장한다.)

**🚨 [비즈니스 로직 보호 — CRITICAL]** 실제 `StrategyCreator.tsx`는 `renderStrategySelection` 내부 **`handleStrategySelect`**에서 PRO/PREMIUM 전략에 대해 `canAccessPaidStocks`를 검증한 뒤에만 `setSelectedStrategy`를 호출한다. **`handleStrategyChange` 등 새 핸들러를 만들어 전략 선택 진입점을 통째로 바꾸지 말 것** — 복붙 과정에서 위 검증이 빠지면 유료 전략이 무료 회원에게 열리는 심각한 결함으로 이어진다. VR 시작일 동기화는 **기존 `handleStrategySelect`의 검증 통과 후**, `setSelectedStrategy` / `setStep(1)` **직후**에만 주입한다.

```tsx
// components/StrategyCreator.tsx

// 상태 추가
import { VR_CYCLE } from '../constants/vrConstants';
const [vrCycleWeeks, setVrCycleWeeks] = useState<number>(VR_CYCLE.DEFAULT_WEEKS);

// VR 전략 선택 시 startDate 타임존 방어 (en-CA 꼼수 금지)
import { getLocalTodayString } from '../utils/dateHelpers';

// 🚨 [React Anti-Pattern 방어] selectedStrategy만 감시하는 useEffect에서 setStartDate만 연쇄 호출하는 패턴은
// 핸들러 주입과 중복되면 제거한다 (이중 갱신·타이밍 혼선 방지).
// ❌ 제거 대상(핸들러 주입 후 중복 시): useEffect(() => { if (selectedStrategy === 'vr_band') setStartDate(...); }, [selectedStrategy]);

// ✅ 해결: 새 핸들러를 만들지 않고, 기존 handleStrategySelect 최하단에만 날짜 동기화 추가 (PRO/PREMIUM 분기·return 절대 유지)
const handleStrategySelect = (strategyId: StrategyType) => {
  const definitions = getStrategyDefinitions(t, vrT);
  const strategyDef = definitions.find((s) => s.id === strategyId);
  if (!strategyDef) return;

  // ... 기존 PRO/PREMIUM 검증: tier === 'PRO' | 'PREMIUM' && !canAccessPaidStocks → setProInfoOpen(true); return; ...

  setSelectedStrategy(strategyId);
  setStep(1);

  if (strategyId === 'vr_band') {
    setStartDate(getLocalTodayString());
  }
};

// 실제 UI: 버튼 onClick → handleStrategySelect(strategy.id) 패턴 유지 (별도 통로 금지).

// 🚨 [React Anti-Pattern 방어] 인라인 객체 {{...}} 전달 절대 금지 (렌더링 폭포 방지)
// 자식 Props는 1차원(Flat)으로 풀어 원시값 및 안정된 콜백으로만 전달 (생략·「알아서」 주석 금지)
{step === 1 && selectedStrategy === 'vr_band' && (
  <VrBandStrategyForm
    lang={lang}
    showErrors={vrShowErrors}
    vrCycleWeeks={vrCycleWeeks}
    onVrCycleWeeksChange={setVrCycleWeeks}
    vrMode={vrMode}
    onVrModeChange={setVrMode}
    vrInitialCapital={vrInitialCapital}
    onVrInitialCapitalChange={setVrInitialCapital}
    vrInitialV={vrInitialV}
    onVrInitialVChange={setVrInitialV}
    vrMinOrderQty={vrMinOrderQty}
    onVrMinOrderQtyChange={setVrMinOrderQty}
    vrBandUpperPct={vrBandUpperPct}
    onVrBandUpperPctChange={setVrBandUpperPct}
    vrBandLowerPct={vrBandLowerPct}
    onVrBandLowerPctChange={setVrBandLowerPct}
    vrG={vrG}
    onVrGChange={setVrG}
    vrPoolUsagePct={vrPoolUsagePct}
    onVrPoolUsagePctChange={setVrPoolUsagePct}
    vrDeltaCash={vrDeltaCash}
    onVrDeltaCashChange={setVrDeltaCash}
  />
)}

// 달력 UI: VR 전략일 경우 조작 원천 차단
<input
  type="date"
  value={startDate}
  onChange={(e) => setStartDate(e.target.value)}
  disabled={selectedStrategy === 'vr_band'}
  className={`w-full p-5 pl-14 bg-slate-100/50 ... ${
    selectedStrategy === 'vr_band' ? 'opacity-50 cursor-not-allowed' : ''
  }`}
/>
```

#### 2.4.3 `StrategyCreator.tsx` 제출 버튼 중첩 삼항 연산자 평탄화 (레거시 리팩토링)

현재 하단 제출 버튼 렌더링부에 3중 중첩 삼항 연산자(`strategy === ... ? (step === 2 ? ... : ...) : (step < 3 ? ... : ...)`)가 존재한다.
`vr_band` 로직을 연동하기 전에 반드시 아래와 같이 헬퍼 함수로 추출하여 평탄화해야 한다.

**🚨 [Core Principles §6·§8]** `ChevronRight` 노출 조건에 `step < 2`·`step < 3` 등 **매직 넘버와 4중 `&&`/`||`를 JSX 안에 두지 않는다.** 단계 상한은 `MAX_STEP_*` 상수로, 노출 여부는 **`canShowNextIcon` 단일 boolean**으로 JSX 위에서 결정한다.

```tsx
// 컴포넌트 외부 또는 최상단에 헬퍼 함수로 추출
// 🚨 [가짜 인라인 타입 완전 제거]
// 9.8.10항에서 정의한 글로벌 I18N 타입(MainStrings, VrCreatorStrings)을 그대로 사용한다.
// 이렇게 하면 메인 딕셔너리에 startStrategy 키가 없으면 컴파일러가 즉시 에러를 띄워 잡아준다.
function getSubmitButtonText(
  strategy: StrategyType | null,
  step: number,
  t: MainStrings,        // 가짜 타입({ next: string... }) 절대 금지. 진짜 I18N 타입 사용.
  vrT: VrCreatorStrings, // 진짜 VR I18N 타입 사용.
): string {
  if (!strategy) return t.next;

  if (strategy === 'vr_band') {
    return step === 2 ? vrT.submit : t.next;
  }
  if (strategy === 'multi_split' || strategy === 'no_stop_multi_split') {
    // 🚨 [I18N 준수] 하드코딩 완전 제거, 딕셔너리 SSOT 맹종
    return step === 2 ? t.startStrategy : t.next;
  }
  return step < 3 ? t.next : t.save;
}

// 🚨 [Core Principle 8] 마법의 단계 번호 — 파일 상단 또는 컴포넌트 바깥에 상수로 고정
const MAX_STEP_STANDARD = 2; // multi_split / no_stop_multi_split / vr_band — "다음" 아이콘 노출 상한(step)
const MAX_STEP_INTERVAL = 3; // rsi_ma_interval 플로우 최종 step 직전까지

// 🚨 [Core Principle 6] JSX 이전에 논리 평탄화 — 렌더 블록 안에 && step < n 중첩 금지
const isStandardStrategy =
  selectedStrategy === 'multi_split' ||
  selectedStrategy === 'no_stop_multi_split' ||
  selectedStrategy === 'vr_band';

const isIntervalStrategy = selectedStrategy === 'rsi_ma_interval';

const canShowNextIcon =
  (isStandardStrategy && step < MAX_STEP_STANDARD) ||
  (isIntervalStrategy && step < MAX_STEP_INTERVAL);

// JSX: 버튼 본문
<button ...>
  {getSubmitButtonText(selectedStrategy, step, t, vrT)}
  {canShowNextIcon && <ChevronRight size={18} strokeWidth={3} />}
</button>
```

---

### 2.5 `components/Dashboard.tsx` — 헤더에 사이클 기간 배지 추가

이전 버전에서는 별도의 주기 배지를 `VrPortfolioSummary` 내부에 추가하는 설계였다.  
디자인 여백과 가독성을 위해, **대시보드의 "일별 매매 실행" 헤더 영역에 `#회차 + 날짜 구간`을 표시하는 배지**로 변경한다.

#### 2.5.1 Before

```tsx
// components/Dashboard.tsx (발췌)

<div className="flex items-center gap-1.5 mb-1.5 opacity-80">
  <span className="text-[9px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest">
    {t.dailyExecution}
  </span>
  <Info size={10} className="text-blue-700 dark:text-blue-300" />
  {isVrStrategy && vrSettings && (
    <VrBadge mode={vrSettings.vrMode} lang={lang} />
  )}
  {/* 다분할 매매법 배지 등 기타 배지들... */}
</div>
```

#### 2.5.2 After

```tsx
// components/Dashboard.tsx (설계안)
// 상단 import — JSX에서 실제 사용하는 심볼만 (calculateMaxBuyStep 등 미사용 시 배제):
import {
  getVrCyclePeriodText,
  sanitizeVrCycleWeeks,
} from '../utils/vrBandStrategy';
import { VR_CREATOR_LABELS } from '../constants/vrMessages';
import { DEFAULT_TIMEZONE } from '../constants/vrConstants';

<div className="flex items-center gap-1.5 mb-1.5 opacity-80">
  <span className="text-[9px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest">
    {t.dailyExecution}
  </span>
  <Info size={10} className="text-blue-700 dark:text-blue-300" />

  {isVrStrategy && vrSettings && (
    <>
      {/* 기존 VR 모드 배지 (거치식/적립식/인출식) */}
      <VrBadge mode={vrSettings.vrMode} lang={lang} />

      {/* 신규 사이클 날짜 배지: #회차 + 날짜 구간 (예: "#1: 3/18 ~ 3/24") */}
      <span className="text-[9px] font-bold px-2 py-0.5 rounded-md text-blue-700 dark:text-blue-300 bg-blue-100/50 dark:bg-blue-900/30 whitespace-nowrap">
        {getVrCyclePeriodText({
          startDate: portfolio.startDate,
          cycleWeeks: sanitizeVrCycleWeeks(vrSettings.cycleWeeks),
          currentCycleIndex: portfolio.vrSnapshot?.cycleIndex,
          timezone: portfolio.alarmconfig?.timezone ?? DEFAULT_TIMEZONE,
          lang,
          // 🚨 공용 utils는 VR_CREATOR_LABELS를 import하지 않음 — 프론트(대시보드)에서만 포맷터 주입
          cycleFormat: (idx, start, end) =>
            VR_CREATOR_LABELS[lang].cyclePeriodFormat(idx, start, end),
        })}
      </span>
    </>
  )}

  {/* 다분할 매매법 배지 등 기존 로직은 그대로 유지 */}
</div>
```

> 이 배지는 파란 박스 헤더 내부에서 VR 전략일 때만 노출되며,  
> 다분할/무손절 전략 배지와 나란히 배치되어도 여백을 크게 해치지 않도록 텍스트 길이를 최소화한다.

---

### 2.6 `utils/vrBandStrategy.ts` — 사이클 기간 텍스트/검증 헬퍼 (SSOT)

이전 버전의 설계는 “현재 사이클 인덱스”와 “새 사이클 여부”를 계산하는 헬퍼였다.  
UI 요구사항과 **사용자별 타임존(Timezone)**, 그리고 **검증 로직의 단일 진실 공급원(SSOT)** 을 반영하기 위해,  
다음 두 가지 헬퍼로 재구성한다.

**🚨 [FINAL PATH SEAL] 호출부:** `getVrCyclePeriodText`·`sanitizeVrCycleWeeks` 를 사용하는 **`components/Dashboard.tsx` 상단 import는 §2.5.2 스니펫과 동일**하게 맞춘다 (`calculateMaxBuyStep` 등 **미사용 심볼은 import 금지**).

```ts
// utils/vrBandStrategy.ts (설계안 추가/개선)
// 🚨 [Reference Error 방어] TIME_MS 누락 시 빌드가 폭발하므로 반드시 import 한다.
import { VR_CYCLE, TIME_MS } from '../constants/vrConstants';
import type { AppLang } from '../types';

export interface VrCycleTextOptions {
  startDate: string;
  cycleWeeks: number;
  currentCycleIndex?: number; // DB vrSnapshot 값 (최우선 순위 SSOT)
  lang?: AppLang; // [Strict TypeScript] string 금지, AppLang으로 엄격 제한
  timezone?: string;
  /** 🚨 [Reference Error 방어] UI 딕셔너리(VR_CREATOR_LABELS)를 utils에서 import하지 않고, 호출부에서 포맷터 주입 */
  cycleFormat?: (cycleIndex: number, start: string, end: string) => string;
}

/**
 * 알 수 없는 입력값을 받아 유효한 리밸런싱 주기(1~12 정수)로 안전하게 변환합니다.
 * - 타입 단에서 any/unknown을 받더라도 이 함수의 결과는 항상 1~12 사이의 정수입니다.
 * - 숫자형 문자열("3")도 Number() 캐스팅으로 안전하게 처리합니다.
 */
export function sanitizeVrCycleWeeks(weeks: unknown): number {
  const parsed = Number(weeks);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return VR_CYCLE.DEFAULT_WEEKS;
  }
  return Math.max(
    VR_CYCLE.MIN_WEEKS,
    Math.min(VR_CYCLE.MAX_WEEKS, Math.floor(parsed)),
  );
}

/**
 * 내부 계산은 UTC 기준 절대 시간을 사용하되,
 * 화면(UI)/알람에 표시되는 날짜는 **lang에 맞는 로캘**로 `Intl`에 위임한다 (미국식 M/D 하드코딩 금지).
 *
 * 예: ko-KR → `3. 18.` 형태 등 로캘 네이티브 / en-US → `3/18` 등
 * [I18N] 회차/구분 문자열(`#`, `~` 등)은 **cycleFormat 콜백**에만 위임한다 (utils는 VR_CREATOR_LABELS import 금지).
 */
export function getVrCyclePeriodText({
  startDate,
  cycleWeeks,
  currentCycleIndex,
  lang = 'ko',
  timezone = 'UTC',
  cycleFormat,
}: VrCycleTextOptions): string {
  // [Lazy Check 방어] startDate 유효성 명시적 검증 (undefined/빈 문자열 방어)
  if (!startDate) return '-';
  const start = new Date(`${startDate}T00:00:00Z`);
  if (isNaN(start.getTime())) return '-';

  // 매직 넘버 제거 및 검증 로직 위임
  const safeWeeks = sanitizeVrCycleWeeks(cycleWeeks);

  let cycleIndex = 0;

  // [SSOT 원칙] DB의 vrSnapshot.cycleIndex가 존재하면 독자 계산을 건너뛰고 맹종한다.
  // 백엔드 T+1 Forward Calculation으로 이미 선행 계산된 값이므로, 프론트가 재계산하면 충돌한다.
  if (currentCycleIndex !== undefined && currentCycleIndex >= 0) {
    cycleIndex = currentCycleIndex;
  } else {
    // DB 값이 없을 때만 폴백으로 자체 계산 (최초 생성 직후 등)
    // [미국장 달력 기준] 사이클 인덱스 판별은 백엔드와 동일하게 NY 시간 기준
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;

    // [Guard Clause] 파싱 실패 시 조기 리턴 (WSOD 및 NaN 전파 방어)
    if (!y || !m || !d) {
      console.error('[VR_Timezone_Error] Date formatting failed', { y, m, d });
      return '-';
    }

    const logicalToday = new Date(`${y}-${m}-${d}T00:00:00Z`);
    // [DRY] 중복 수식 제거 — SSOT 헬퍼 함수 호출 (백엔드와 동일한 T+1 로직 보장)
    cycleIndex = calculateCycleIndexFromDates(start.getTime(), logicalToday.getTime(), safeWeeks);
  }

  // 시작일 계산 (UTC 기준, 매직 넘버 대신 TIME_MS 상수 사용)
  const cycleStart = new Date(start.getTime() + cycleIndex * safeWeeks * TIME_MS.PER_WEEK);

  // 종료일 계산 (밀리초 뺄셈 금지 — DST 경계 버그 방지)
  // setUTCDate를 활용한 순수 날짜 연산으로 안전하게 산출
  const cycleEnd = new Date(cycleStart.getTime());
  const DAYS_PER_WEEK = 7;
  cycleEnd.setUTCDate(cycleStart.getUTCDate() + (safeWeeks * DAYS_PER_WEEK) - 1);

  // [UX 대원칙] 사이클 인덱스 계산은 백엔드(NY) 기준이지만,
  // 화면에 날짜를 표시할 때는 사용자의 타임존으로 변환하여 직관성을 제공한다.
  // cycleStart/cycleEnd는 UTC 자정이므로 Intl로 유저 로컬 날짜를 안전하게 추출한다.
  // 🚨 [Strict I18N] en-US 고정 + formatToParts 수동 조립 금지 — lang에 따라 로캘 적용 후 Intl에 위임
  const formatMD = (d: Date) => {
    try {
      const locale = lang === 'ko' ? 'ko-KR' : 'en-US';
      return new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        month: 'numeric',
        day: 'numeric',
      }).format(d);
    } catch (error) {
      console.warn(`[VR_Timezone_Error] Invalid timezone "${timezone}". Falling back to UTC.`);
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: 'numeric',
        day: 'numeric',
      }).format(d);
    }
  };

  // 🚨 UI 딕셔너리 직접 참조(VR_CREATOR_LABELS) 완전 삭제 — 주입된 cycleFormat만 사용
  const defaultFormatter = (idx: number, s: string, e: string) => `Cycle ${idx}: ${s} ~ ${e}`;
  const formatter = cycleFormat ?? defaultFormatter;
  return formatter(cycleIndex + 1, formatMD(cycleStart), formatMD(cycleEnd));
}
```

> **`cycleFormat` 주입 규칙:** `getVrCyclePeriodText`는 `utils`에서 UI 딕셔너리를 import하지 않는다.  
> - **프론트(예: `Dashboard.tsx`):** `cycleFormat: (i, s, e) => VR_CREATOR_LABELS[lang].cyclePeriodFormat(i, s, e)`  
> - **백엔드/알람(예: `dailyExecutionSummary.ts`):** `cycleFormat: (i, s, e) => STRINGS[lang].cyclePeriodFormat(i, s, e)` (§2.7.3에 `cyclePeriodFormat` 키 필수)  
> - **미주입 시:** 위 스니펫의 `defaultFormatter`가 동작(영문 중심)하므로, 사용자 대면 UI에서는 반드시 주입할 것.

> `sanitizeVrCycleWeeks`는 **주기 검증/정규화의 단일 진실 공급원(SSOT)** 으로 사용되며,  
> `StrategyCreator`, `normalizePortfolioData`, `dailyExecutionSummary`, `getVrCyclePeriodText` 등  
> 모든 소비자에서 동일한 규칙을 재사용하도록 한다.

또한 각 파일에 산재해 있던 금액/가격 포매팅 헬퍼(`formatCurrency`)는 모두 삭제하고,  
아래와 같이 `utils/vrBandStrategy.ts`에서 **공용 유틸리티 함수로 단일 정의**하여 재사용한다.

```ts
// utils/vrBandStrategy.ts (공용 화폐 포맷터 — DRY 원칙)
export function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0.00';
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
```

#### 2.6.3 `createInitialVrSnapshot` 팩토리 헬퍼 추가 (StrategyCreator 의존성 분리)

`StrategyCreator.tsx`에서 VR 포트폴리오 최초 생성 시,  
초기 VR 스냅샷(`vrSnapshot`)을 인라인으로 계산/조립하던 로직을 **전용 팩토리 함수로 분리**하여 재사용성과 테스트 용이성을 높인다.

> ⚠️ **중요**: 이 헬퍼는 실제 `StrategyCreator.tsx`에서 직접 import 하여 사용하므로,  
> 구현 누락 시 `Module '"../utils/vrBandStrategy"' has no exported member 'createInitialVrSnapshot'.` 타입/빌드 에러가 발생한다.

```ts
// utils/vrBandStrategy.ts (파일 내 적절한 위치에 추가)

/**
 * [SRP] 최초 VR 스냅샷 생성 팩토리 함수
 * StrategyCreator에서 인라인으로 계산하던 로직을 분리하여 재사용성과 테스트 용이성을 높임.
 *
 * - cycleIndex: 0으로 고정 (Cycle 0 시딩)
 * - currentV: 최초에는 initialV를 그대로 사용
 * - pool / shares / avgPrice: 최초 상태값을 명시적으로 기록
 * - 밴드/주문표: 기존 유틸리티(calculateBands, generateBuyOrders, generateSellOrders)를 재사용
 */
export function createInitialVrSnapshot(params: VrBandStrategyParams): VrSnapshot {
  const { bandLow, bandHigh } = calculateBands(
    params.initialV,
    params.bandRateUpper,
    params.bandRateLower,
  );

  const buyOrders = generateBuyOrders({
    bandLow,
    pool: params.initialCapital,
    shares: 0,
    ...params,
  });

  const sellOrders = generateSellOrders({
    bandHigh,
    pool: params.initialCapital,
    shares: 0,
    ...params,
  });

  return {
    cycleIndex: 0,
    currentV: params.initialV,
    pool: params.initialCapital,
    shares: 0,
    avgPrice: 0,
    bandLow,
    bandHigh,
    buyOrders,
    sellOrders,
  };
}
```

> 구현 시에는 **기존 수학 유틸리티를 100% 재사용**하고,  
> 새 로직(반복문, 개별 주문 생성 로직 등)을 이 함수 안에서 다시 작성하지 않는다.  
> 이렇게 하면 `calculateBands` / `generateBuyOrders` / `generateSellOrders`의 개선이  
> 최초 스냅샷 생성에도 자동으로 전파되며, 테스트 코드에서도 단일 진입점으로 검증할 수 있다.

---

### 2.7 `utils/dailyExecutionSummary.ts` — VR 알람 헤더에 사이클 정보 포함

텔레그램/일별 브리핑 알람 메시지에서도, 대시보드 헤더와 동일한 사이클 정보(`#회차: MM/DD ~ MM/DD`)를 노출하여 사용자의 인지력을 높인다.

#### 2.7.1 목적

- **일관성**: 대시보드 UI와 텔레그램 알람에서 **동일한 사이클 표현**을 사용해, 사용자가 “현재 몇 번째 사이클인지 · 어떤 날짜 범위를 커버하는지”를 한눈에 이해하도록 한다.
- **문맥 제공**: 단순히 V/Pool/밴드 수치만 나열하는 것보다, “이번 주기 전체에 대한 작전 지도”라는 맥락을 부여한다.

#### 2.7.2 Before (예시)

```ts
// utils/dailyExecutionSummary.ts (발췌 — 기존 VR 헤더 조립 예시)

// ...
if (isVrStrategy) {
  const strategyName = STRINGS[lang].strategyVrBand;
  const vrModeText = getVrModeText(vrSettings.vrMode, lang);

  let block = `[${strategyName} - ${vrModeText}]\n`;
  block += `V: $${currentV}\n`;   // ⚠️ [I18N 위반] 영문 "V:" 하드코딩
  block += `Pool: $${pool}\n`;    // ⚠️ [I18N 위반] 영문 "Pool:" 하드코딩
  // ... 밴드/주문표 요약 텍스트 이어서 추가

  return block;
}
// ...
```

#### 2.7.3 After (설계안)

**🚨 [I18N 빌드 에러 방어]**  
`dailyExecutionSummary.ts` 상단의 `STRINGS` 인터페이스에 반드시 아래 키를 추가하고, `ko`/`en` 딕셔너리에 번역을 채워 넣어야 한다. (누락 시 빌드 크래시)

```ts
// STRINGS 인터페이스에 추가 (백엔드/Edge/dailyExecutionSummary 전용 — 프론트 VR_SUMMARY·VR_DASHBOARD_HINT 참조 금지)
vrV: string;
vrPool: string;
vrBand: string;
cyclePeriodFormat: (cycleIndex: number, start: string, end: string) => string;
// 🚨 [Reference Error 방어] 백엔드/유틸에는 프론트 전용 VR_BADGE_CONFIG가 없으므로 모드 라벨은 STRINGS로만 조립
vrModeLumpSum: string;
vrModeAccumulate: string;
vrModeWithdraw: string;
vrMaxBuyHint: (step: number) => string;
vrNoOrder: string;
vrReadyHint: string;

// ko 구현부 추가
vrV: '현재 V',
vrPool: 'Pool 잔액',
vrBand: '목표 밴드',
cyclePeriodFormat: (n, s, e) => `#${n}: ${s} ~ ${e}`,
vrModeLumpSum: '거치식',
vrModeAccumulate: '적립식',
vrModeWithdraw: '인출식',
vrMaxBuyHint: (step) => `최대 ${step}분할 매수 대기`,
vrNoOrder: '대기 중인 주문 없음',
vrReadyHint: '조건 도달 시 즉시 실행 대기',

// en 구현부 추가
vrV: 'Current V',
vrPool: 'Pool Balance',
vrBand: 'Target Band',
cyclePeriodFormat: (n, s, e) => `Cycle ${n}: ${s} to ${e}`,
vrModeLumpSum: 'Lump sum',
vrModeAccumulate: 'Accumulate',
vrModeWithdraw: 'Withdraw',
vrMaxBuyHint: (step) => `Up to ${step}-split buy pending`,
vrNoOrder: 'No pending orders',
vrReadyHint: 'Ready to execute upon condition',
```

```ts
// utils/dailyExecutionSummary.ts (설계안)
// 실제 파일 구조: VR 밴드 알람 조립은 formatVrBandBlock 헬퍼에서 전담한다.
// [주의] 이 파일은 AppLang이 아니라 자체 타입 Lang('ko' | 'en')을 사용한다.
//
// 🚨 [FINAL PATH & IMPORT SEAL] 본 파일은 `utils/` 루트 — `vrBandStrategy`는 **`./vrBandStrategy`** (`../utils/vrBandStrategy` 금지).
// 🚨 [DRY / §2.6 SSOT] `formatCurrency`는 `dailyExecutionSummary`에 두지 말고 **§2.6에서 `utils/vrBandStrategy.ts`에 단일 export한 뒤** 아래처럼 import한다 (구현 순서: vrBandStrategy에 추가 → 본 파일에서 제거·import).
// import { getVrCyclePeriodText, sanitizeVrCycleWeeks, toFixedMoney, formatCurrency } from './vrBandStrategy';
// import { DEFAULT_TIMEZONE } from '../constants/vrConstants';
//
// formatPortfolioDailyExecutionBlock 내부의 숨은 any 제거:
// ❌ const isVrBand = !!(portfolio.strategy as any).vrBand;
// ✅ const isVrBand = !!portfolio.strategy.vrBand;

function formatVrBandBlock(
  portfolio: Portfolio,
  lang: Lang,
  options: { vrMaxBuyStep?: number },
): string {
  const s = STRINGS[lang] ?? STRINGS.ko;
  const snapshot = portfolio.vrSnapshot;

  if (!snapshot) {
    // 🚨 [Lazy Code 방어] 빈 주석/퉁치기 금지 — 백엔드 STRINGS 기반 I18N Fallback 문장을 명시적으로 조립
    const mode = portfolio.strategy.vrBand?.vrMode;
    const fallbackMode =
      mode === 'lump_sum'
        ? s.vrModeLumpSum
        : mode === 'withdraw'
          ? s.vrModeWithdraw
          : s.vrModeAccumulate;
    return `[${fallbackMode}]\n- ${s.vrNoOrder}\n- ${s.vrReadyHint}`;
  }

  const lines: string[] = [];
  // [Strict TypeScript] any 및 강제 캐스팅(as) 제거
  const vrParams = portfolio.strategy.vrBand;
  const vrMode = vrParams?.vrMode;

  // 1. 모드 배지 + 사이클 텍스트 한 줄에 조립
  let headerLine = '';
  // 🚨 [Reference Error 방어] 백엔드에 없는 프론트엔드 전용 VR_BADGE_CONFIG 사용 절대 금지
  if (vrMode) {
    // 🚨 [Cognitive Complexity 완화] 중첩 3항 연산자 금지 — O(1) 객체 매핑
    const modeLabelMap: Record<'lump_sum' | 'accumulate' | 'withdraw', string> = {
      lump_sum: s.vrModeLumpSum,
      accumulate: s.vrModeAccumulate,
      withdraw: s.vrModeWithdraw,
    };
    const modeLabel = modeLabelMap[vrMode];
    headerLine += `[${modeLabel}]`;
  }

  const tzLabel = portfolio.alarmconfig?.timezone || DEFAULT_TIMEZONE;
  const cycleText = getVrCyclePeriodText({
    startDate: portfolio.startDate,
    cycleWeeks: sanitizeVrCycleWeeks(vrParams?.cycleWeeks),
    currentCycleIndex: snapshot.cycleIndex,
    lang,
    timezone: tzLabel,
    // 🚨 [Reference Error 방어] 공용 헬퍼는 UI 딕셔너리를 import하지 않고, STRINGS 기반 포맷터만 주입
    cycleFormat: (idx, start, end) => s.cyclePeriodFormat(idx, start, end),
  });

  if (cycleText && cycleText !== '-') {
    headerLine += ` (${cycleText})`;
  }

  if (headerLine) {
    lines.push(headerLine);
  }

  const { currentV, pool, bandLow, bandHigh } = snapshot;
  // [Isolate Formatting + Precision] 금액/가격 포맷은 formatCurrency만 사용 (.toFixed 금지)
  lines.push(`- ${s.vrV}: ${formatCurrency(currentV)}`);
  lines.push(`- ${s.vrPool}: ${formatCurrency(pool)}`);
  if (typeof bandLow === 'number' && typeof bandHigh === 'number') {
    lines.push(`- ${s.vrBand}: ${formatCurrency(bandLow)} ~ ${formatCurrency(bandHigh)}`);
  }

  // 🚨 [Reference Error 방어] 백엔드에서 프론트 전용 VR_SUMMARY, VR_DASHBOARD_HINT 참조 절대 금지 — STRINGS만 사용
  const maxStep = options.vrMaxBuyStep ?? 0;
  if (maxStep > 0) {
    lines.push(`- ${s.vrMaxBuyHint(maxStep)}`);
  } else {
    lines.push(`- ${s.vrNoOrder}`);
  }

  lines.push(`- ${s.vrReadyHint}`);

  return lines.join('\n');
}
```

> 이렇게 하면 텔레그램 브리핑에서도,  
> `"[타겟 밸류 채널 - 거치식] (#1: 3/18 ~ 3/24)"` 형태로 **현재 사이클의 회차와 기간**이 명시되어,  
> UI 헤더 배지와 동일한 맥락을 유지할 수 있다.

---

## 3. 🚨 잠재적 에러 및 사이드 이펙트 예측 (Risk Assessment)

### 3.1 타입 에러 예측 및 대응

#### 3.1.1 `VrBandStrategyBase`에 cycleWeeks 추가 시 영향

- **증상**: `VrBandStrategyParams`를 생성하는 모든 위치에서 `cycleWeeks`를 채우지 않으면 TypeScript 에러 발생:
  - 예: `Property 'cycleWeeks' is missing in type '{ ... }' but required in type 'VrBandStrategyBase'.`
- **발생 위치**:
  - `components/StrategyCreator.tsx` 의 `const vrParams: VrBandStrategyParams = { ... }` (이미 확인).
  - 추후 테스트 코드, 목업 데이터, Storybook 등에서 직접 `VrBandStrategyParams`를 생성하는 부분이 있다면 모두 영향.

#### 3.1.2 대응 전략

- 1차로 **컴파일 에러가 나는 모든 생성 지점에 `cycleWeeks`를 명시적으로 추가**한다.
- 만약 테스트/목업에서 “주기” 개념이 중요하지 않다면, **테스트 기본값(예: 2)** 을 사용해도 좋다:

```ts
const mockVrParams: VrBandStrategyParams = {
  vrMode: 'lump_sum',
  initialCapital: 10000,
  initialV: 10000,
  minOrderQty: 1,
  feeRate: 0.0025,
  bandRateUpper: 0.05,
  bandRateLower: 0.05,
  G: 10,
  poolUsageRateBuy: 0.5,
  cycleWeeks: 2,
  deltaCash: 0,
};
```

### 3.2 런타임 에러 예측 및 방어

#### 3.2.1 기존 DB 데이터에 cycleWeeks가 없는 경우

- **문제**:
  - 기존 `portfolios.strategy.vrBand` JSON에는 `cycleWeeks` 필드가 없음.
  - 타입상 필수 필드로 추가해도, **런타임에는 `undefined`** 로 들어올 수 있다.
  - 이 상태에서 `vrSettings.cycleWeeks` 를 그대로 사용하면:
    - UI: `cycleWeeks`가 NaN/0/undefined일 때 잘못된 사이클 텍스트가 나올 수 있음.

- **방어 전략**: 인라인 방어 코드를 파편적으로 작성하지 않고, 모든 소비자에서 **`sanitizeVrCycleWeeks`** 를 호출하도록 통일한다.

```ts
// 어디서든 동일한 패턴으로 사용 (인라인 검증 금지)
import { sanitizeVrCycleWeeks } from './vrBandStrategy';

const cycleWeeks = sanitizeVrCycleWeeks(vrSettings.cycleWeeks);
// 결과: 항상 1~12 사이의 정수. undefined/NaN/0 → VR_CYCLE.DEFAULT_WEEKS(2)
```

#### 3.2.2 normalize/로딩 시 방어 (`portfolioNormalize.ts`)

- **SSOT (중복 스니펫 금지):** `normalizePortfolioData` **전체 구현**은 **§9.8.2 「2. [Strict TypeScript] …」 코드 펜스 한 블록**만 따른다.  
  본 절에서는 요지만 기술한다: **`unknown[]` + 행 가드**, 루트 `feeRate` 폴백 **`LEGACY_FEE_RATE_PCT`(퍼센트)**, `vrBand.feeRate` 폴백 **`DEFAULT_FEE_RATE`(소수)**, `sanitizeVrCycleWeeks`, **`PortfolioRow` 타입만** (`RawPortfolioRow` 등 판박이 금지).

이렇게 하면:

- DB에 `cycleWeeks`가 없는 옛 포트폴리오라도 **프론트에서 항상 1~12 범위의 정수로 정규화**된다.
- 주기 검증 규칙이 `sanitizeVrCycleWeeks` 한 곳에만 존재하므로,  
  Edge Function/스케줄러/알람/대시보드에서 모두 동일한 규칙을 따르게 된다(SSOT).
- `any` 타입을 완전히 제거하여 `strict` 모드에서도 경고 없이 컴파일된다.

### 3.3 Edge Function/스케줄러와의 상호작용 리스크

- **이상 케이스**:
  - 스케줄러가 `cycleWeeks`를 사용해 새 사이클을 결정하는데,
  - 프론트/백엔드 사이에 “기본값”이 불일치할 경우:
    - 예: 프론트는 `undefined → 2주`, 백엔드는 `undefined → 1주` 로 처리하면, 리밸런싱 타이밍이 어긋난다.

- **대응 방안** (이미 설계에 반영 완료):
  - **`sanitizeVrCycleWeeks`가 단일 SSOT**:
    - 프론트(`normalizePortfolioData`, `Dashboard`, `StrategyCreator`)와 백엔드(`dailyExecutionSummary`, Edge Function) 모두 이 함수를 호출하므로, 기본값 규칙이 자동으로 일치한다.
  - **이중 안전장치**: Supabase 마이그레이션(4.1절 SQL)으로 DB에도 `cycleWeeks: 2`를 미리 채워두면, 런타임에서 `sanitizeVrCycleWeeks`가 실제로 방어할 일 자체가 없어진다.

### 3.4 UI/UX 리스크

- **사용자 혼란**:
  - 주기를 표시하는 UI가 너무 복잡하면, VR 전략을 처음 보는 사용자가 이해하기 어렵다.
  - 사이클 관련 표기가 너무 장황하면, 핵심 정보(V/Pool/밴드)보다 먼저 눈에 띄어 정보 구조를 해칠 수 있다.

- **대응 제안**:
  - 사이클 배지는 `"일별 매매 실행"` 헤더 내에서 **작고 은은한 스타일의 `#회차: MM/DD ~ MM/DD` 텍스트**로 두어, 시각적 우선순위를 낮춘다.
  - StrategyCreator에서는 `cycleWeeks` 옆에 짧은 설명을 추가할 수 있다:
    - 예: `"리밸런싱 주기: 주문표와 V값을 몇 주마다 다시 계산할지 설정합니다."`

---

## 4. 마무리

위 설계안은 다음 순서로 적용하는 것을 전제로 한다.

1. **타입/상수/StrategyCreator**: `cycleWeeks` 필드와 UI 추가, 기본값/검증까지 포함.
2. **정규화/방어 코드**: `portfolioNormalize`에서 기존 데이터 보정 (`cycleWeeks ?? 2`).
3. **DB 마이그레이션**: Supabase SQL로 기존 `strategy.vrBand` JSON에 `cycleWeeks` 기본값을 채움 (아래 SQL 스니펫 참고).
4. **백엔드/스케줄러**: Edge Function이 매일 아침 실행되어, **'오늘이 새 사이클이 시작되는 첫날인지'를 포트폴리오별로 판별**하고, 해당하는 포트폴리오만 V값과 밴드를 재계산한다.

   **Cron 스케줄:**
   - Supabase Scheduled Functions 또는 별도 Cron 인프라에서 **`10 6 * * 2-6` (Timezone: `Asia/Seoul`)** 스케줄로 실행
   - **실행 시간:** 매주 화~토요일 아침 06:10 (KST)
   - 미국 주식 시장 정규장(월~금) 마감 후 확정된 종가를 사용해 V/예약 주문표 재계산
   - 서머타임(DST) 여부와 무관하게 한국 시간 기준으로 고정 실행
   - 일요일/월요일 아침에는 미국 장 데이터가 없어 스케줄을 돌리지 않아 **비용 최적화**

   **사이클 전환 판별 로직 (Edge Function 내부):**
   ```ts
   // Edge Function: 새 사이클 도래 여부를 판별하는 핵심 조건식
   // 예: supabase/functions/refresh-vr-snapshots/index.ts
   //
   // 🚨 [Strict TS / Import Deadlock 방어] Portfolio·Strategy 등 앱 도메인 타입은 경로를 “알아서” 두지 말고 명시한다.
   // Deno Edge는 Vite와 달리 `../../types` 상대경로가 함수 파일 위치에 따라 달라진다.
   //
   // 권장: `supabase/functions/_shared/types.ts` 를 추가해 단일 진입점으로만 import 한다.
   // _shared/types.ts 예시:
   //   export type {
   //     Portfolio, PortfolioRow, Strategy, Trade, VrSnapshot, VrBandStrategyParams, OrderLevel, AlarmConfig,
   //   } from '../../../types.ts';
   // — 위 `../../../` 는 `_shared/types.ts` 기준 레포 루트의 `types.ts` 를 가리키도록 조정한다.
   //
   // 대안: 함수 파일에서 직접 (refresh-vr-snapshots/index.ts 기준):
   //   import type { Portfolio, Strategy, Trade, VrSnapshot, VrBandStrategyParams, OrderLevel, AlarmConfig } from '../../../types.ts';
   //   (같은 파일에 mapPortfolioRow 를 둔다면 PortfolioRow 도 함께 import)
   //
   import type {
     Portfolio,
     Strategy,
     Trade,
     VrSnapshot,
     VrBandStrategyParams,
     OrderLevel,
     AlarmConfig,
   } from '../_shared/types.ts';

   // 🚨 [Reference Error 방어] VR 수학 헬퍼 — 실제 배포 경로에 맞출 것 (예: ../../../utils/vrBandStrategy.ts)
   // 번들/복제 정책을 쓰면 `_shared/vrBandStrategy.ts` 등으로 복사본을 두고 여기서 import (SSOT 주석 필수)
   import {
     sanitizeVrCycleWeeks,
     calculateCycleIndexFromDates,
     calculateNextV,
     calculateBands,
     generateBuyOrders,
     generateSellOrders,
   } from '../../../utils/vrBandStrategy.ts';

   /**
    * 포트폴리오의 사이클 전환 여부를 판별하고, 갱신이 필요하면 새 cycleIndex를 반환한다.
    * @returns 갱신이 필요하면 targetCycleIndex (number), 불필요하면 null
    */
   function calculateNextCycleIndex(portfolio: Portfolio): number | null {
     const vrBand = portfolio.strategy?.vrBand;
     if (!vrBand) return null;

     // [Guard Clause] 첫 거래 전이라 스냅샷(잔고)이 없는 포트폴리오는 리밸런싱 불가
     if (!portfolio.vrSnapshot) return null;

     const startDate = new Date(`${portfolio.startDate}T00:00:00Z`);
     if (isNaN(startDate.getTime())) return null;

     const cycleWeeks = sanitizeVrCycleWeeks(vrBand.cycleWeeks);

     // 미국장 마감일(New York Time) 기준 '오늘 캘린더 날짜' 추출
     // (KST 06:10 실행 시점 → 뉴욕은 전날 16:10~17:10 → 장 마감 후 확정 종가 기준일)
     // ❌ [금지] en-CA 로캘 .format() 꼼수 사용 금지
     // ✅ [강제] formatToParts로 수학적 조립
     const parts = new Intl.DateTimeFormat('en-US', {
       timeZone: 'America/New_York',
       year: 'numeric',
       month: '2-digit',
       day: '2-digit',
     }).formatToParts(new Date());
     const y = parts.find((p) => p.type === 'year')?.value;
     const m = parts.find((p) => p.type === 'month')?.value;
     const d = parts.find((p) => p.type === 'day')?.value;

     // [Guard Clause] 파싱 실패 시 조기 리턴 (NaN 전파 및 스케줄러 붕괴 방어)
     if (!y || !m || !d) {
       console.error('[VR_Scheduler_Error] Date formatting failed', { y, m, d });
       return null;
     }

     const usDateString = `${y}-${m}-${d}`;
     const logicalToday = new Date(`${usDateString}T00:00:00Z`);

     // [DRY/SSOT] 중복된 수식(Math.floor...)을 제거하고 공통 헬퍼 함수 호출
     // T+1 Forward Calculation 포함, 프론트엔드 getVrCyclePeriodText와 동일한 로직 보장
     const targetCycleIndex = calculateCycleIndexFromDates(
       startDate.getTime(),
       logicalToday.getTime(),
       cycleWeeks,
     );

     // 직전 스냅샷에 기록된 사이클 인덱스와 비교
     const lastCycleIndex = portfolio.vrSnapshot?.cycleIndex ?? -1;

     // 갱신이 필요하면 새로운 인덱스 번호를 반환, 아니면 null
     return targetCycleIndex > lastCycleIndex ? targetCycleIndex : null;
   }

   // 🚨 [Financial Math 방어] generateBuyOrders / generateSellOrders에 G·bandRate 등 필수 필드가 빠지면
   // 런타임에서 NaN이 퍼질 수 있다. 하드코딩 인자 나열 대신 **전략 params를 스프레드한 뒤** 런타임 인자만 덮어쓴다.
   // 🚨 [TS 초과 프로퍼티] 로컬 `GenerateBuyOrdersParams`가 6필드만 받으면, 빌드 에러 시 `Pick`/`satisfies`로 좁히거나
   //    Edge 번들에서 헬퍼 시그니처를 `VrBandStrategyParams & { bandLow; pool; shares }` 형태로 확장한다.
   async function refreshVrSnapshotForPortfolio(
     portfolio: Portfolio,
     portfolioId: string,
     targetCycleIndex: number,
   ): Promise<void> {
     const params = portfolio.strategy.vrBand;
     const prev = portfolio.vrSnapshot;
     if (!params || !prev) return;

     const nextV = calculateNextV(prev.currentV, prev.pool, params);
     const { bandLow, bandHigh } = calculateBands(nextV, params.bandRateUpper, params.bandRateLower);

     const buyOrders = generateBuyOrders({
       ...params,
       bandLow,
       pool: prev.pool,
       shares: prev.shares,
     });
     const sellOrders = generateSellOrders({
       ...params,
       bandHigh,
       pool: prev.pool,
       shares: prev.shares,
     });

     const updatedSnapshot: VrSnapshot = {
       ...prev,
       currentV: nextV,
       bandLow,
       bandHigh,
       buyOrders,
       sellOrders,
       cycleIndex: targetCycleIndex,
     };

     await supabase.from('portfolios').update({ vr_snapshot: updatedSnapshot }).eq('id', portfolioId);
   }

   // 🚨 [SSOT — 단일 구현] `processAllVrPortfolios` 전체 본문은 **§4.2** `refresh-vr-snapshots/index.ts` 코드 펜스만 따른다.
   //    청크(PAGE_SIZE + .range) + 청크마다 Promise.allSettled(batch.map) — 순차 for...of 절대 금지(Core Principles §10·§6). (문서 중복·모순 방지)
   ```

   > **핵심 (T+1 Forward Calculation)**:
   > - `calculateNextCycleIndex`는 `number | null`을 반환하므로, 호출부에서 반환값을 그대로 `vrSnapshot.cycleIndex`에 기록할 수 있다. boolean 기반에서 발생하던 이중 계산 문제가 원천 해소된다.
   > - `diffMs + msPerDay`를 `cycleLengthMs`로 나누면, 사이클 마지막 날에 자동으로 다음 인덱스로 올라간다.
   >   예) 2주(14일) 주기, 오늘이 13일차(0-indexed) → `(13 + 1) * msPerDay / (14 * msPerDay) = 1` → cycleIndex 1로 전환.
   > - 이를 통해 마지막 날 장 마감 직후 **다음 사이클의 V값과 주문표를 미리 세팅**하여, 익일 장 오픈 시 즉시 매매할 수 있다.
   > - `targetCycleIndex > lastCycleIndex` 비교로 중복 갱신은 방지되고, 서버 장애 후 재실행 시에도 안전하게 동작한다.
   >
   > **도메인 규칙 (V/밴드/주문표 계산)**:
   > - V값과 주문표는 **현재 vrSnapshot 상태값(pool, shares, currentV)과 전략 파라미터(G, bandRate, deltaCash)만으로** 결정되는 순수 수학 계산이다.
   > - 시장 종가(Closing Price)나 외부 시세 API와는 **일절 무관**하다. 스케줄러 내부에서 시세 API를 호출하는 코드가 있다면 즉시 삭제해야 한다.
   >
   > **vrSnapshot Null 방어 (Control Flow 기반)**:
   > - `calculateNextCycleIndex`는 `if (!portfolio.vrSnapshot) return null;` 가드가 최상단에 있으므로, 이 함수가 `number`를 반환한 시점에서는 `vrSnapshot`의 존재가 **타입 수준에서 보장**된다.
   > - 따라서 Step 4의 스프레드에서 `...(portfolio.vrSnapshot || {})` 같은 불필요한 폴백을 넣지 않는다. 논리적 모순(이미 보장된 값에 폴백을 씌우는 것)은 타입 안정성을 오히려 해치고 코드 리뷰어에게 혼란을 준다.
   > - 최초 스냅샷 생성은 아래 4.0항에서 별도로 처리한다.

### 4.0 최초 스냅샷 초기화 (Cycle 0 Seeding — 좀비 포트폴리오 방지)

VR 전략 포트폴리오가 생성된 직후에는 `vrSnapshot`이 `null`이다.
이 상태에서는 스케줄러(`calculateNextCycleIndex`)가 `return null`로 스킵하고,
매매 로직(`handleAddTrade`)도 `vrSnapshot`이 없으면 VR 분기에 진입하지 못한다.
결과적으로 **영원히 스냅샷을 갖지 못하는 데드락(Zombie Portfolio)**에 빠진다.

이를 방지하기 위해, **포트폴리오 Insert 시점에 `vrSnapshot`을 즉시 병합**하여
단일 Insert 트랜잭션으로 원자성을 보장한다. (별도 Update 쿼리 금지)

**🚨 [Core Principles §1·§8]** VR 분기에서 자본·V·최소주문 수량 등을 여러 줄의 인라인 `if (!(…positive))`로 나열하지 않고, **`validateFinancialArgs`**(로컬 `utils/vrBandStrategy.ts`)로 일원화한다. 퍼센트→소수 정밀도 배수는 **`RATE_PRECISION_MULTIPLIER`**(`constants/vrConstants.ts` SSOT)만 참조 — **컴포넌트 내부 매직 넘버 금지.**

**🚨 [CRITICAL — 루트 `feeRate` 단위 오염 방지 / §2.2·§9.8.2와 정합]**  
`Portfolio.feeRate`(루트)는 **비 VR 레거시와 동일하게 UI 퍼센트**(예: `0.25` = 0.25%)로 저장한다. **`strategy.vrBand.feeRate`만 소수**(예: `0.0025`)다. VR 분기에서 `finalFeeRate`·`newP.feeRate`를 `toDecimalRate`로 덮어쓰면 DB 루트 컬럼이 소수로 오염되어 다분할 등 타 전략 수학이 붕괴한다 — **VR 블록 안에서는 `vrDecimalFeeRate` 등 지역 변수만 소수로 두고, 루트 필드는 초기 `feeRate` 상태를 그대로 유지**한다.

**🚨 [FINAL SQUASH — SSOT]** 아래는 **`handleSave` 본문 교체용 최종 통합 스니펫**이다.  
- **`toDecimalRate` + `RATE_PRECISION_MULTIPLIER`**: 컴포넌트 **모듈 스코프**에 이미 두면 **여기서 재정의 금지** (로컬 `StrategyCreator.tsx`와 동일).  
- **`createInitialVrSnapshot`**: 현재 로컬 `vrBandStrategy.ts`에 **아직 없을 수 있음** → §2.6.3 구현·export **선행 필수** (없으면 import 빌드 실패).  
- **비 VR 분기**: 아래 스니펫은 **로컬 `StrategyCreator.tsx`와 동일한 if/else 체인**을 포함해 **문법적으로 완결**되게 두었다. 이후 필드명·PRO 전략이 바뀌면 **비 VR 블록만** 실제 파일에 맞게 수정한다.  
- **🚨 [Strict I18N]**: `alert()`에 **인라인 ko/en 문자열·`lang === 'ko' ? … : …` 금지** — 메인 딕셔너리 `t`(또는 동일 계약의 `STRINGS[lang]`)에 **`portfolioLimitReached(maxPortfolios)`**, **`needDifferentStocks`** 를 추가하고 아래처럼만 호출한다 (§10 체크리스트).

```ts
// components/StrategyCreator.tsx — handleSave 최종 통합본 (Squash)
// import { validateFinancialArgs, createInitialVrSnapshot, toFixedMoney } from '../utils/vrBandStrategy';
// import { DEFAULT_FEE_RATE } from '../constants/vrConstants';
// import { getLocalTodayString } from '../utils/dateHelpers';
// `t`: 컴포넌트에 이미 주입된 메인 I18N 딕셔너리 — portfolioLimitReached / needDifferentStocks 키 추가 필수

const handleSave = async () => {
  if (!selectedStrategy) return;

  if (currentPortfolioCount >= maxPortfolios) {
    // 🚨 [Strict I18N] 인라인 텍스트 및 3항 연산자 하드코딩 철저히 금지
    alert(t.portfolioLimitReached(maxPortfolios));
    return;
  }

  setVrShowErrors(false);

  let strategy: Strategy;
  let initialVrSnapshot: VrSnapshot | null = null;
  let finalFeeRate = feeRate;

  if (selectedStrategy === 'rsi_ma_interval') {
    if (ma1Stock === ma2Stock || ma2Stock === ma3Stock || ma1Stock === ma3Stock) {
      // 🚨 [Strict I18N] 인라인 하드코딩 금지
      alert(t.needDifferentStocks);
      return;
    }
    strategy = {
      ma0: { stock: ma0Stock, rsiEnabled, alignmentEnabled, maAPeriod, maBPeriod },
      ma1: {
        stock: ma1Stock,
        rsiThreshold: rsiEnabled ? ma1Rsi : undefined,
        takePartialProfit: ma1TakePartialProfit,
        partialProfitTargetPct: ma1TakePartialProfit ? ma1PartialProfitPct : undefined,
      },
      ma2: {
        stock: ma2Stock,
        splitCount: 1,
        rsiThreshold: rsiEnabled ? ma2Rsi : undefined,
        takePartialProfit: ma2TakePartialProfit,
        partialProfitTargetPct: ma2TakePartialProfit ? ma2PartialProfitPct : undefined,
      },
      ma3: {
        stock: ma3Stock,
        rsiThreshold: rsiEnabled ? ma3Rsi : undefined,
        takePartialProfit: ma3TakePartialProfit,
        partialProfitTargetPct: ma3TakePartialProfit ? ma3PartialProfitPct : undefined,
      },
    };
  } else if (selectedStrategy === 'multi_split') {
    strategy = {
      ma0: { stock: multiSplitStock, rsiEnabled: false, alignmentEnabled: false, maAPeriod: 20, maBPeriod: 60 },
      ma1: { stock: multiSplitStock },
      ma2: { stock: multiSplitStock, splitCount: 1 },
      ma3: { stock: multiSplitStock },
      multiSplit: {
        targetStock: multiSplitStock,
        targetReturnRate,
        totalSplitCount,
      },
    };
  } else if (selectedStrategy === 'no_stop_multi_split') {
    strategy = {
      ma0: { stock: noStopMultiSplitStock, rsiEnabled: false, alignmentEnabled: false, maAPeriod: 20, maBPeriod: 60 },
      ma1: { stock: noStopMultiSplitStock },
      ma2: { stock: noStopMultiSplitStock, splitCount: 1 },
      ma3: { stock: noStopMultiSplitStock },
      noStopMultiSplit: {
        targetStock: noStopMultiSplitStock,
        lowLocBudgetRatio,
        highLocPremiumPct,
        takeProfitPct,
        totalSplitCount: noStopTotalSplitCount,
      },
    };
  } else if (selectedStrategy === 'vr_band') {
    const bandUpper = Number.isFinite(vrBandUpperPct) ? toDecimalRate(vrBandUpperPct) : 0;
    const bandLower = Number.isFinite(vrBandLowerPct) ? toDecimalRate(vrBandLowerPct) : 0;
    const poolUsageRateBuy = Number.isFinite(vrPoolUsagePct) ? toDecimalRate(vrPoolUsagePct) : 0;
    const vrDecimalFeeRate = Number.isFinite(feeRate) ? toDecimalRate(feeRate) : DEFAULT_FEE_RATE;

    const safeInitialCapital = toFixedMoney(vrInitialCapital);
    const safeInitialV = toFixedMoney(vrInitialV);
    const safeG = Number.isFinite(vrG) ? toFixedMoney(vrG) : 0;

    try {
      validateFinancialArgs(
        {
          initialCapital: safeInitialCapital,
          initialV: safeInitialV,
          minOrderQty: vrMinOrderQty,
          G: safeG,
        },
        {
          initialCapital: { strictPositive: true },
          initialV: { strictPositive: true },
          minOrderQty: { strictPositive: true },
          G: { strictPositive: true },
        },
        'StrategyCreator.handleSave.vr_band',
      );
    } catch {
      setVrShowErrors(true);
      return;
    }

    const rawDeltaCash = Number.isFinite(vrDeltaCash) ? toFixedMoney(vrDeltaCash) : 0;
    let enforcedDeltaCash = Math.abs(rawDeltaCash);
    if (vrMode === 'lump_sum') enforcedDeltaCash = 0;
    else if (vrMode === 'withdraw') enforcedDeltaCash = -Math.abs(rawDeltaCash);

    // 🚨 [Strict TS / Core Principles §7] `as VrBandStrategyParams` 금지 — 유니온별 deltaCash 계약을 컴파일러가 검증하게 한다.
    //    `deltaCash`는 `vrMode === 'lump_sum' ? 0 : enforcedDeltaCash` 패턴으로 리터럴 0을 보장한다.
    const vrParams: VrBandStrategyParams = {
      vrMode,
      initialCapital: safeInitialCapital,
      initialV: safeInitialV,
      minOrderQty: vrMinOrderQty,
      feeRate: vrDecimalFeeRate,
      bandRateUpper: bandUpper,
      bandRateLower: bandLower,
      G: safeG,
      poolUsageRateBuy,
      cycleWeeks: vrCycleWeeks,
      deltaCash: vrMode === 'lump_sum' ? 0 : enforcedDeltaCash,
    };

    // 🚨 [Strict TS / Core Principles §7] `as Strategy` 금지 — 필수 ma0~ma3 + vrBand가 Strategy 계약을 만족하는지 컴파일러 검증.
    strategy = {
      ma0: { stock: 'TQQQ', rsiEnabled: false, alignmentEnabled: false, maAPeriod: 20, maBPeriod: 60 },
      ma1: { stock: 'TQQQ' },
      ma2: { stock: 'TQQQ', splitCount: 1 },
      ma3: { stock: 'TQQQ' },
      vrBand: vrParams,
    };

    initialVrSnapshot = createInitialVrSnapshot(vrParams);
  } else {
    strategy = {
      ma0: { stock: 'QQQ', rsiEnabled: false, alignmentEnabled: false, maAPeriod: 20, maBPeriod: 60 },
      ma1: { stock: 'TQQQ' },
      ma2: { stock: 'QLD', splitCount: 1 },
      ma3: { stock: 'QQQ' },
    };
  }

  const newP: Omit<Portfolio, 'id'> = {
    name: name || t.customStrategy,
    dailyBuyAmount: dailyBuy,
    startDate: selectedStrategy === 'vr_band' ? getLocalTodayString() : startDate,
    feeRate: finalFeeRate,
    isClosed: false,
    trades: [],
    strategy,
    ...(initialVrSnapshot ? { vrSnapshot: initialVrSnapshot } : {}),
  };

  await onSave(newP);
};
```

> **핵심**: `vrSnapshot`이 포트폴리오 Insert 페이로드에 포함되므로,
> 생성 직후부터 `vrSnapshot`이 존재하여 스케줄러(`calculateNextCycleIndex`)와
> 매매 로직(`handleAddTrade`)이 정상 작동한다.
> Insert 후 별도 Update를 호출하는 2단계 방식 대비, **단일 트랜잭션으로 원자성이 자동 보장**되어
> 네트워크 실패 시 '스냅샷 없는 좀비 포트폴리오' 발생을 원천 차단한다.

### 4.1 DB 마이그레이션 SQL (Supabase)

기존 VR 포트폴리오 중 `strategy.vrBand`에는 존재하지만 `cycleWeeks`가 아직 없는 레코드에 대해,  
**기본값 2주**를 주입하는 안전한 SQL 스니펫은 다음과 같다.

```sql
-- 기존 VR 포트폴리오 중 cycleWeeks가 없는 데이터에 기본값 2주 주입
UPDATE public.portfolios
SET strategy = jsonb_set(
  strategy,
  '{vrBand,cycleWeeks}',
  '2',
  true
)
WHERE jsonb_typeof(strategy->'vrBand') = 'object'
  AND (strategy->'vrBand'->>'cycleWeeks') IS NULL;
```

설명:

- `jsonb_typeof(strategy->'vrBand') = 'object'`
  - `strategy` JSON에 VR 설정(`vrBand`)이 **유효한 JSON 객체로** 존재하는 포트폴리오만 대상으로 한다. 단순 키 존재(`?`) 검사보다 안전하여, `vrBand`가 `null`이나 배열 등 비정상 값인 레코드를 자동 제외한다.
- `(strategy->'vrBand'->>'cycleWeeks') IS NULL`
  - 이미 `cycleWeeks`가 들어 있는 레코드는 건드리지 않는다.
- `jsonb_set(..., '2', true)`
  - `cycleWeeks` 키가 없을 경우 **정수 2**를 JSON에 삽입한다.
  - 네 번째 인자 `true`로 인해, 기존에 값이 있더라도 덮어쓸 수 있지만  
    WHERE 절에서 `IS NULL`만 잡기 때문에 **기존 값은 유지**되고, 없는 곳에만 새로 채워진다.

### 4.2 백엔드 스케줄러(Edge Function) 파이프라인 보완 (index.ts)

스케줄러(`calculateNextCycleIndex`) 및 알람(`dailyExecutionSummary`)에서 `portfolio.startDate`를 사용해 날짜 연산을 수행하려면, Edge Function의 DB Fetch 파이프라인이 반드시 이를 전달해야 한다.

```ts
// supabase/functions/refresh-vr-snapshots/index.ts (또는 mapPortfolioRow만 분리한 모듈)
//
// 🚨 [Strict TS / Import Deadlock 방어] Edge(Deno)에서 프론트 `types.ts` 를 쓰려면 import 경로를 파일 위치 기준으로 고정한다.
// “나중에 알아서 import” 금지 — 스케줄러 전체가 컴파일 실패한다.
//
// 1) 권장: `_shared/types.ts` 에서 앱 타입을 re-export 후, 모든 Edge 코드는 여기서만 가져온다.
//    supabase/functions/_shared/types.ts 예시:
//      export type {
//        Portfolio, PortfolioRow, Strategy, Trade, VrSnapshot, VrBandStrategyParams, OrderLevel, AlarmConfig,
//      } from '../../../types.ts';
//
// 2) 대안: 이 파일에서 직접 `../../../types.ts` (함수 폴더 깊이에 따라 `..` 개수 조정)
//
import type {
  Portfolio,
  PortfolioRow,
  Strategy,
  Trade,
  VrSnapshot,
  VrBandStrategyParams,
  OrderLevel,
  AlarmConfig,
} from '../_shared/types.ts';
// 🚨 `_shared/types.ts` 에서 `PortfolioRow` 를 `types.ts` 로부터 re-export 할 것 (§2.1.4)

import { DEFAULT_FEE_RATE, LEGACY_FEE_RATE_PCT } from '../../../constants/vrConstants.ts';
// 🚨 Edge에서 Supabase 클라이언트 타입: `@supabase/supabase-js`의 `SupabaseClient` 등 실제 배포 import에 맞출 것 (이름만 예시)

// 🚨 [Strict TS] `Strategy`·`Portfolio`·`PortfolioRow` 는 위에서 types(re-export)로만 가져온다 — 축약 interface 재정의 금지.
// `PortfolioRow` 정의 본문은 §2.1.4 `types.ts` 를 SSOT로 한다 (여기서 중복 선언 금지).

function mapPortfolioRow(row: PortfolioRow): Portfolio | null {
  if (!row || !row.strategy) return null;

  // 🚨 [Lazy Code 방어] "// ... 기존 매핑 ..." 퉁치기 금지 — 스네이크 → 카멜 명시 매핑 (앱 types.Portfolio와 1:1)
  // 🚨 참고: 프론트 `types.Portfolio`에는 userId가 없다. Edge에서 user_id가 필요하면 반환 타입을
  //    `Portfolio & { userId?: string }`로 확장하거나, 로깅용으로 row.user_id만 지역 변수로 사용한다.
  return {
    id: row.id ?? '',
    name: row.name ?? '',
    dailyBuyAmount: row.daily_buy_amount ?? 0,
    startDate: row.start_date ?? '', // 🚨 SSOT (사이클/Date 파싱용 — 빈 문자열이면 상위에서 가드)
    // 🚨 [SSOT 일치 §9.8.2] 루트 수수료 폴백은 **퍼센트** `LEGACY_FEE_RATE_PCT` — `DEFAULT_FEE_RATE`(소수) 금지
    feeRate: row.fee_rate ?? LEGACY_FEE_RATE_PCT,
    strategy: row.strategy,
    trades: row.trades ?? [],
    isClosed: row.is_closed ?? false,
    closedAt: row.closed_at ?? undefined,
    finalSellAmount: row.final_sell_amount ?? undefined,
    alarmconfig: row.alarm_config ?? undefined,
    isQuarterMode: row.is_quarter_mode ?? false,
    vrSnapshot: row.vr_snapshot ?? undefined,
  };
}

// 🚨 [SSOT — §4.2 단일 구현 / Core Principles §10·§6] `calculateNextCycleIndex`·`refreshVrSnapshotForPortfolio`·`mapPortfolioRow`는 본 파일(또는 동일 모듈)에 두고,
//    아래는 **청크 조회 + 병렬 처리만** 담당한다. **순차 `for...of` 절대 금지** — Edge Timeout·장애 격리를 위해 청크마다 `Promise.allSettled` 필수.
// import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'; // Deno Edge — 프로젝트가 쓰는 spec URL로 교체

const PAGE_SIZE = 1000;
const SELECT_COLUMNS =
  'id, user_id, name, daily_buy_amount, fee_rate, strategy, trades, alarm_config, is_quarter_mode, is_closed, vr_snapshot, start_date';

export async function processAllVrPortfolios(supabase: SupabaseClient) {
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: rows, error } = await supabase
      .from('portfolios')
      .select(SELECT_COLUMNS)
      .eq('is_closed', false)
      .range(offset, offset + PAGE_SIZE - 1); // 🚨 [OOM 방어]

    if (error) throw error;

    const batch = rows ?? [];
    if (batch.length === 0) break;

    // 🚨 [Performance & Resilience / Core Principles §10·§6] 순차 루프(for...of) 절대 금지. Promise.allSettled 병렬화로 Timeout 방어·개별 실패 격리.
    await Promise.allSettled(
      batch.map(async (row) => {
        try {
          const portfolio = mapPortfolioRow(row);
          if (!portfolio) return;

          const targetIdx = calculateNextCycleIndex(portfolio);
          if (targetIdx !== null) {
            await refreshVrSnapshotForPortfolio(portfolio, String(row.id), targetIdx);
          }
        } catch (err) {
          console.error(`[VR_Batch_Error] Failed portfolio ${row.id}:`, err);
        }
      }),
    );

    hasMore = batch.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }
}
```

> **§4 마무리 펜스**의 `calculateNextCycleIndex` / `refreshVrSnapshotForPortfolio` / 상단 import 블록과 **이 펜스의 `mapPortfolioRow` + `processAllVrPortfolios`**를 **하나의 `index.ts`에 합쳐** 배포한다. `processAllVrPortfolios` 중복 정의 금지.

---

## 5. Cycle 0 주문표 블라인드(Masking) 처리 — UX 보정

### 5.1 배경

포트폴리오 생성 직후(Cycle 0), `createInitialVrSnapshot`에 의해 주문표(`buyOrders`, `sellOrders`)가 수학적으로 생성된다.
그러나 첫 매수(Initial Buy)를 진행하기 전에는 **정확한 체결 단가를 알 수 없으므로**,
주문표의 `sharesAfter`(체결 후 보유량)와 `poolAfter`(체결 후 Pool)를 숫자로 확정 지어 보여주는 것은 사용자에게 혼란을 준다.

### 5.2 설계 원칙

- **데이터 계층은 건드리지 않는다:** `OrderLevel` 인터페이스의 `sharesAfter`, `poolAfter`는 `number` 타입을 그대로 유지한다. `null`이나 `string`을 허용하도록 타입을 망가뜨리지 않는다.
- **View 계층에서만 블라인드 처리:** 렌더링 시점에 조건문으로 마스킹한다.

### 5.3 `VrOrderModal.tsx` 구현 스니펫

```tsx
// VrOrderModal.tsx (실제 파일 구조에 맞춘 마스킹 로직 수정 가이드)
// 🚨 [FINAL PATH SEAL] `components/VrOrderModal.tsx` 루트 — 타입·메시지는 한 단계 위만: `../types`, `../constants/vrMessages` (`../../types` 금지)
// import type { OrderLevel } from '../types';
// import { VR_MODAL_LABELS } from '../constants/vrMessages';
// 인라인 .toFixed() 금지. 반드시 정밀도 보정된 유틸리티 함수를 사용할 것.

// 1. props에 hasNoTrades 추가
export default function VrOrderModal({
  isOpen, onClose, buyOrders, sellOrders, lang = 'ko',
  hasNoTrades = false,  // 첫 매수 전 여부 (Dashboard에서 주입)
}: {
  // ... 기존 props ...
  hasNoTrades?: boolean; // portfolio.trades.length === 0 또는 vrSnapshot.shares === 0
}) { ... }

// 2. renderCellContent 함수에 hasNoTrades 파라미터 추가 후 마스킹 로직 삽입
//    기존 TABLE_COLUMNS + renderCellContent 데이터 드리븐 패턴을 그대로 유지하면서,
//    첫 매수 전에 sharesAfter/poolAfter 열만 '-'로 가린다.
function renderCellContent(
  order: OrderLevel,
  col: (typeof TABLE_COLUMNS)[number],
  labels: LabelsLang,
  hasNoTrades: boolean,
): React.ReactNode {
  // [마스킹] 첫 매수 전이고, 보유량/Pool 열이면 '-' 반환
  if (hasNoTrades && (col.id === 'sharesAfter' || col.id === 'poolAfter')) {
    return '-';
  }

  if (col.renderCell) return col.renderCell(order, labels);
  if (col.hideOnStepZero && order.step === STEP_CURRENT_STATE) return '-';
  return defaultCellContent(order, { id: col.id, format: col.format });
}

// 🚨 [Strict TypeScript] VrOrderTableProps 인터페이스에 hasNoTrades 추가 필수
// components/VrOrderModal.tsx 내의 VrOrderTableProps 정의부를 찾아 아래 속성을 추가할 것:
// hasNoTrades?: boolean;

// 3. VrOrderTable에 hasNoTrades prop 전달
<VrOrderTable orders={orders} labels={t} hasNoTrades={hasNoTrades} />

// 4. VrOrderTable 내부에서 renderCellContent 호출 시 hasNoTrades 전달
{TABLE_COLUMNS.map((col) => (
  <td key={col.id} className="...">
    {renderCellContent(order, col, labels, hasNoTrades)}
  </td>
))}

// 5. 표 하단 안내 문구 (첫 매수 전인 경우에만 노출 — 하드코딩 금지, i18n 딕셔너리 참조)
{hasNoTrades && (
  <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-2">
    {VR_MODAL_LABELS[lang].firstBuyGuide}
  </p>
)}
```

### 5.4 호출부 (`Dashboard.tsx` · `VrPortfolioSummary.tsx`)

**🚨 [CRITICAL — 기능 보존 / Core Principles §10]** 로컬 `Dashboard.tsx`는 `VrOrderModal`에 **`step: 0`(현재 Pool·보유량)** 행을 배열 맨 앞에 끼워 넣는다. `?? []`만 `EMPTY_VR_ORDERS`로 치환하면 **Step 0 행이 영구 증발**한다 — **절대 `buyOrders={portfolio.vrSnapshot?.buyOrders ?? EMPTY_VR_ORDERS}` 단독 지시 금지.**

**🚨 [FINAL SQUASH — Core Principles §5·§6 DRY]** `Dashboard`·`VrPortfolioSummary`에 흩어진 **`stepZeroRow` / `safeBuyOrders` / `safeSellOrders`용 `useMemo` 3중 덩어리는 금지** — **`hooks/useVrOrders.ts` 단일 SSOT 훅**으로 추출하고, 호출부는 **`const { safeBuyOrders, safeSellOrders } = useVrOrders(스냅샷)` 한 줄**로 통일한다. (프로젝트에 이미 `hooks/` 디렉터리 존재 — 동일 패턴으로 추가.)

**올바른 패턴:** `PortfolioCard`(또는 동일 스코프)에서 훅을 **카드당 1회**만 호출하고, **듀얼 모달 두 곳 모두 동일 `safeBuyOrders` / `safeSellOrders`**를 넘긴다. 빈 스냅샷 시 훅 내부가 **`EMPTY_VR_ORDERS`**(§2.2 동결 SSOT)를 반환한다.

**🚨 [주의: 듀얼 모달 동시 수정]** `Dashboard.tsx`는 반응형 분기로 `<VrOrderModal />`이 두 군데 있을 수 있다 — **`useVrOrders`는 상위에서 1회만** 호출하고, `hasNoTrades={!portfolio.trades || portfolio.trades.length === 0}` 등은 **두 JSX 동일**하게 맞춘다.

**🚨 [Core Principles §5]** `EMPTY_VR_ORDERS`는 **`constants/vrConstants.ts`만** 정의하고, 훅에서 import한다 — 컴포넌트 로컬 상수 금지.

> **`EMPTY_VR_ORDERS`** 정의는 **§2.2 마스터 스니펫**에만 둔다.

#### 5.4.1 SSOT 훅 `useVrOrders` (신규)

```ts
// hooks/useVrOrders.ts
import { useMemo } from 'react';
import type { VrSnapshot, OrderLevel } from '../types';
import { EMPTY_VR_ORDERS } from '../constants/vrConstants';

export function useVrOrders(vrSnapshot: VrSnapshot | null | undefined) {
  const stepZeroRow = useMemo((): OrderLevel | null => {
    if (!vrSnapshot) return null;
    return {
      step: 0,
      price: 0,
      qty: 0,
      isBuffer: false,
      sharesAfter: vrSnapshot.shares,
      poolAfter: vrSnapshot.pool,
    };
  }, [vrSnapshot?.shares, vrSnapshot?.pool]);

  const safeBuyOrders = useMemo((): OrderLevel[] => {
    if (!vrSnapshot || !stepZeroRow) return EMPTY_VR_ORDERS;
    return [stepZeroRow, ...(vrSnapshot.buyOrders ?? [])];
  }, [stepZeroRow, vrSnapshot?.buyOrders]);

  const safeSellOrders = useMemo((): OrderLevel[] => {
    if (!vrSnapshot || !stepZeroRow) return EMPTY_VR_ORDERS;
    return [stepZeroRow, ...(vrSnapshot.sellOrders ?? [])];
  }, [stepZeroRow, vrSnapshot?.sellOrders]);

  return { safeBuyOrders, safeSellOrders, stepZeroRow };
}
```

> `stepZeroRow`는 테이블/디버그에 필요 시에만 구조 분해; 모달만 쓰면 `safeBuyOrders` / `safeSellOrders`만 받으면 된다.

#### 5.4.2 호출부 (`Dashboard.tsx`)

```tsx
// components/Dashboard.tsx — PortfolioCard 내부 (모달 JSX보다 위, Rules of Hooks 준수)
import { useVrOrders } from '../hooks/useVrOrders';

const { safeBuyOrders, safeSellOrders } = useVrOrders(portfolio.vrSnapshot);

// … 모바일·데스크탑 각각의 <VrOrderModal /> — 동일 props
<VrOrderModal
  isOpen={isVrOrderModalOpen}
  onClose={() => setIsVrOrderModalOpen(false)}
  buyOrders={safeBuyOrders}
  sellOrders={safeSellOrders}
  lang={lang}
  hasNoTrades={!portfolio.trades || portfolio.trades.length === 0}
/>
```

#### 5.4.3 호출부 (`VrPortfolioSummary.tsx`)

```tsx
// components/VrPortfolioSummary.tsx
import { useVrOrders } from '../hooks/useVrOrders';

// 스냅샷만 props로 받는 경우
const { safeBuyOrders, safeSellOrders } = useVrOrders(vrSnapshot);
// 상위에서 portfolio를 넘기는 경우 — Dashboard와 동일 계약으로 통일
// const { safeBuyOrders, safeSellOrders } = useVrOrders(portfolio.vrSnapshot);
// 🚨 얼리 리턴은 **모든 훅 호출 이후**에만 (§9.8.4)
```

> **핵심**: **`EMPTY_VR_ORDERS`**는 빈 배열 자리표시자일 뿐, **Step 0 행은 훅 내부에서만** 조립한다. `?? EMPTY_VR_ORDERS`만으로 스냅샷 주문을 넘기는 지시는 **기능 유실**이다. **`Dashboard`·`VrPortfolioSummary` 양쪽 모두 컴포넌트 본문에 `useMemo` 3중 복붙 금지** — 반드시 **`useVrOrders(...)` SSOT** 한 줄로 대체 (§9.8.4).

---

## 6. 타임존 처리 대원칙 (Timezone Policy)

시스템 전체에서 날짜/시간 데이터를 다루는 방식을 아래 3가지 원칙으로 통일한다.

### 6.1 매매 기록 (`trades.date`)

- **저장:** DB에는 **UTC 표준시**(ISO 8601)로 저장한다.
- **표시:** UI(매매 이력, 거래 내역 등)에 출력할 때는 **브라우저의 로컬 타임존**을 사용하여 변환 출력한다.

### 6.2 시작일 (`startDate`)

- **저장:** `'YYYY-MM-DD'` 순수 문자열로 저장한다 (시간 정보 없음).
- **내부 파싱:** 계산 시에는 `new Date('YYYY-MM-DDT00:00:00Z')`로 **UTC 자정** 기준 파싱한다.
- **표시:** 화면에 출력할 때는 유저 타임존으로 변환 시 하루가 밀리지 않도록 **Local Midnight** 기준으로 파싱하여 출력한다.

### 6.3 백엔드 로직 vs 프론트엔드 뷰 (이원화 원칙)

| 구분 | 기준 타임존 | 근거 |
|---|---|---|
| **백엔드 스케줄러** (사이클 전환 판별, `calculateNextCycleIndex`) | `America/New_York` (미국장 달력) | 미국 주식 시장 마감 후 확정된 데이터 기준으로 리밸런싱 여부를 판별해야 하므로, 뉴욕 시간을 절대 기준으로 삼는다. |
| **프론트엔드 Fallback** (DB에 `cycleIndex`가 없을 때 자체 계산) | `America/New_York` (백엔드와 동일) | 프론트/백엔드 사이클 인덱스 엇박자를 방지하기 위해 동일한 달력 기준을 적용한다. |
| **화면 날짜 표시** (대시보드 배지, 텔레그램 알람의 `MM/DD` 포맷) | `alarmconfig.timezone` (유저 설정) | 사용자가 자신의 로컬 시간 기준으로 날짜를 직관적으로 인지할 수 있도록 유저 타임존으로 포맷팅한다. |

> **요약:** "계산은 뉴욕, 표시는 사용자." — 내부 연산의 정합성(NY 기준)과 사용자 경험의 직관성(로컬 TZ)을 동시에 달성한다.

---

## 9.8 코딩 전제 조건 (Pre-requisites): 레거시 안티 패턴 청산

본 VR 사이클 리팩토링(Step 1)을 수행하는 과정에서, 기존 코드베이스에 숨어있는 다음 안티 패턴을 반드시 함께 청산(Refactoring)해야 한다. 이 작업이 선행/동반되지 않으면 VR 스냅샷의 수학적 무결성과 타입 안정성이 붕괴된다.

**🚨 [CRITICAL — 금지 심볼]** 프로젝트에는 **`toDecimalMoney` 함수가 존재하지 않는다.** 금액·가격·G 등 **2자리 금융 반올림 SSOT**는 오직 **`toFixedMoney`** (`utils/vrBandStrategy.ts`)만 사용한다. 계획서·PR·주석에서 `import { toDecimalMoney }` 또는 호출을 **작성하지 말 것** (빌드 즉시 실패).  
퍼센트 입력 → 소수 비율 변환은 **`toDecimalRate`**(StrategyCreator 로컬 헬퍼 또는 동일 로직)와 **혼동 금지** — 이름에 `Decimal`이 들어가도 역할이 다르다.

### 1. [Financial Math] `computeVrSnapshotAfterTrade` 부동소수점 오염 방어
- **대상 파일:** `utils/vrBandStrategy.ts`
- **문제점:** `avgPrice` 계산 시 JS 네이티브 나눗셈(`(prevCost + totalCost) / newShares`)을 그대로 사용하여 미세한 소수점 오차가 DB 상태값으로 스노우볼링됨.
- **추가 문제 (Divide by Zero / NaN):** 전량 매도로 `newShares === 0`이 되면 `totalCost / newShares`가 **`0/0 → NaN`**이 되어 DB·스케줄러·UI로 전파된다. 주문 생성 쪽 `9.8.12`만 막고 체결 후 스냅샷 갱신을 비우면 안 된다.
- **해결책:**  
  - **매도 체결 시 평단가(`avgPrice`)는 변하지 않는다** (금융 규칙). 매수 체결 시에만 가중 평균으로 갱신한다.  
  - `newShares > 0`일 때만 매수 분기에서 나눗셈 후 **`toFixedMoney`**로 정밀도 보정한다 (로컬 SSOT — `toDecimalMoney` 심볼 없음).  
  - **`newShares <= 0`(전량 매도 등)이면 `avgPrice`를 명시적으로 `0`으로 리셋**한다.

```ts
// utils/vrBandStrategy.ts — computeVrSnapshotAfterTrade 내부 (avgPrice 블록 예시)
// isBuy / trade.price / trade.quantity / trade.fee 는 실제 파일의 기존 변수명에 맞출 것
const isBuy = trade.type === 'buy';
const newShares = prev.shares + (isBuy ? trade.quantity : -trade.quantity);

// 🚨 [Financial Math & Lazy Code 방어] 매도 시에는 평단가가 변하지 않음
let newAvgPrice = prev.avgPrice;

if (newShares <= 0) {
  newAvgPrice = 0; // 전량 매도·포지션 소멸 시 초기화
} else if (isBuy) {
  const prevTotalCost = prev.shares * prev.avgPrice;
  const tradeCost = trade.price * trade.quantity + (trade.fee ?? 0);
  newAvgPrice = toFixedMoney((prevTotalCost + tradeCost) / newShares);
}
```

### 2. [Strict TypeScript] `normalizePortfolioData`의 `any[]` 시그니처 제거 및 안전한 캐스팅
- **대상 파일:** `utils/portfolioNormalize.ts`
- **문제점:** 파라미터 타입이 `export function normalizePortfolioData(data: any[])`로 열려 있어 타입스크립트의 방어선이 무의미하며, 이를 단순히 `unknown[]`로 바꾸면 하위의 모든 속성 접근(`item.fee_rate` 등)에서 컴파일 에러가 폭발한다.
- **해결책:** Supabase 응답 행 타입은 **`types.ts`의 `PortfolioRow`(§2.1.4) 단일 SSOT**만 사용한다 — **`interface RawPortfolioRow` 등 판박이 타입을 본 파일에 새로 정의하지 않는다.** `unknown[]` 입력에 대해 행 단위 가드 후 `as PortfolioRow`로 1회 캐스팅하여 `any`를 멸균한다. 반환 시 **`acc.push({ ... } as Portfolio);` 형태의 게으른 단언 금지** — 반드시 **`const portfolio: Portfolio = { ... }; acc.push(portfolio);`** 로 컴파일러가 필수 필드 누락을 검증하게 한다 (`strategy`가 없으면 행 스킵 가드 필수).
- **🚨 [Strict TS / Core Principles §7 — VR 밴드 JSON]** `strategy.vrBand` 조립 시 **`} as VrBandStrategyParams` 금지**. DB JSON의 **`vrMode`는 `'lump_sum' | 'accumulate' | 'withdraw'` 유니온**으로 런타임 멸균하고, **`VrBandLumpSum`은 `deltaCash: 0` 리터럴**, withdraw/accumulate는 부호 규칙에 맞는 `deltaCash`를 써서 **`const sanitizedVrParams: VrBandStrategyParams` 명시 선언 + 모드별 분기**로 컴파일러 검증을 받는다 (오타·누락 시 스프레드로 오염 유입 방지).
- **🚨 [SSOT] 수수료 이중 잣대 방지 (레거시 보호):**  
  - **포트폴리오 루트**(`Portfolio.feeRate` / 행의 `fee_rate`): 비 VR 전략은 **퍼센트** 계약이므로 누락 시 **`LEGACY_FEE_RATE_PCT`(0.25)** 만 폴백 — `DEFAULT_FEE_RATE`(소수 0.0025)를 여기에 쓰면 **타 전략 수학 붕괴**.  
  - **`strategy.vrBand.feeRate`**: 항상 **소수** SSOT — 누락 시 **`DEFAULT_FEE_RATE`** 만.
- **🚨 [Edge Case]** 배열 원소가 `null`/비객체이면 `TypeError`로 WSOD → **`reduce` + 진입 가드**로 행 단위 스킵.

```ts
// utils/portfolioNormalize.ts — normalizePortfolioData 최종 통합본 (Squash SSOT)
import type { Portfolio, PortfolioRow, Strategy, VrBandStrategyParams } from '../types';
import { DEFAULT_FEE_RATE, LEGACY_FEE_RATE_PCT } from '../constants/vrConstants';
import { sanitizeVrCycleWeeks } from './vrBandStrategy';

export function normalizePortfolioData(data: unknown[]): Portfolio[] {
  if (!Array.isArray(data)) return [];

  return data.reduce<Portfolio[]>((acc, rawItem) => {
    if (!rawItem || typeof rawItem !== 'object') {
      console.warn('[VR_Normalize_Warning] Invalid portfolio row skipped', rawItem);
      return acc;
    }

    const item = rawItem as PortfolioRow;
    const rawFeeRate = item.fee_rate ?? item.feeRate ?? LEGACY_FEE_RATE_PCT;

    let normalizedStrategy = item.strategy as Strategy | undefined;

    if (normalizedStrategy?.vrBand) {
      const vrRecord = (
        typeof normalizedStrategy.vrBand === 'object' && normalizedStrategy.vrBand !== null
          ? normalizedStrategy.vrBand
          : {}
      ) as Record<string, unknown>;

      const cycleWeeks = sanitizeVrCycleWeeks(vrRecord.cycleWeeks);

      // 🚨 [Strict TS & 런타임 방어] vrMode 유니온 멸균 — 없음/오타 시 accumulate 폴백 (레거시 JSON 보호)
      const rawVrMode = vrRecord.vrMode;
      const validVrMode: VrBandStrategyParams['vrMode'] =
        rawVrMode === 'lump_sum' || rawVrMode === 'withdraw' || rawVrMode === 'accumulate'
          ? rawVrMode
          : 'accumulate';

      const n = (v: unknown) => Number(v ?? 0);
      const baseFields = {
        initialV: n(vrRecord.initialV),
        initialCapital: n(vrRecord.initialCapital),
        bandRateUpper: n(vrRecord.bandRateUpper),
        bandRateLower: n(vrRecord.bandRateLower),
        G: n(vrRecord.G),
        minOrderQty: n(vrRecord.minOrderQty),
        poolUsageRateBuy: n(vrRecord.poolUsageRateBuy),
        feeRate: n(vrRecord.feeRate ?? DEFAULT_FEE_RATE),
        cycleWeeks,
      };

      const rawDeltaCash = n(vrRecord.deltaCash);

      // 🚨 [Strict TS] `as VrBandStrategyParams` 금지 — 유니온 구성원별 deltaCash 계약을 분기로 강제
      const sanitizedVrParams: VrBandStrategyParams =
        validVrMode === 'lump_sum'
          ? { ...baseFields, vrMode: 'lump_sum', deltaCash: 0 }
          : validVrMode === 'withdraw'
            ? {
                ...baseFields,
                vrMode: 'withdraw',
                deltaCash: rawDeltaCash <= 0 ? rawDeltaCash : -Math.abs(rawDeltaCash),
              }
            : { ...baseFields, vrMode: 'accumulate', deltaCash: Math.abs(rawDeltaCash) };

      normalizedStrategy = {
        ...normalizedStrategy,
        vrBand: sanitizedVrParams,
      };
    }

    if (normalizedStrategy === undefined) {
      console.warn('[VR_Normalize_Warning] Row skipped: missing strategy', item.id);
      return acc;
    }

    const portfolio: Portfolio = {
      id: item.id ?? '',
      name: item.name ?? '',
      dailyBuyAmount: item.daily_buy_amount ?? 0,
      startDate: item.start_date ?? item.startDate ?? '',
      feeRate: Number(rawFeeRate),
      strategy: normalizedStrategy,
      isClosed: item.is_closed ?? item.isClosed ?? false,
      trades: Array.isArray(item.trades) ? item.trades : [],
      closedAt: item.closed_at ?? item.closedAt ?? undefined,
      finalSellAmount: item.final_sell_amount ?? item.finalSellAmount ?? undefined,
      alarmconfig: item.alarm_config ?? item.alarmconfig ?? undefined,
      isQuarterMode: item.is_quarter_mode ?? item.isQuarterMode ?? false,
      vrSnapshot: item.vr_snapshot ?? item.vrSnapshot ?? undefined,
    };

    acc.push(portfolio);
    return acc;
  }, []);
}
```

### 3. [DRY 원칙] 중복 반올림 함수 `roundPrice2` 완전 삭제
- **대상 파일:** `utils/vrBandStrategy.ts`
- **문제점:** 파일 상단에 `toFixedMoney`가 존재함에도, 하단에 동일한 로직의 `roundPrice2` 함수가 중복 선언되어 사용 중임. (Lazy Code)
- **해결책:** `roundPrice2` 함수를 파일에서 완전히 삭제하고, `generateBuyOrders` 등에서 이를 호출하던 모든 코드를 `toFixedMoney` 참조로 일괄 변경한다.

```ts
// utils/vrBandStrategy.ts (generateBuyOrders / generateSellOrders 내부)
// 🚨 [DRY 원칙] roundPrice2 삭제 후 중앙화된 toFixedMoney만 사용

// As-Is: const orderPrice = roundPrice2(bandLow / effectiveShares);
// To-Be:
const orderPrice = toFixedMoney(bandLow / effectiveShares);
// (실제 변수명은 프로젝트의 타깃 가격 계산식과 일치시킬 것 — 위는 치환 패턴 예시)
```

### 4. [Strict TypeScript & React Rules — §9.8.4] `VrPortfolioSummary.tsx` 내 `!` 연산자 전면 제거 · `useVrOrders` DRY
- **대상 파일:** `components/VrPortfolioSummary.tsx`
- **문제점:** `vrSnapshot!.shares` 등 런타임 에러를 유발하는 `!` 연산자가 도배되어 있으며, 이를 고치겠다고 **훅(`useMemo` 등) 선언 이전에** `if (!vrSnapshot) return <PendingUI />;`를 두면 하단 훅이 실행되지 않아 **React Rules of Hooks 에러(“Rendered fewer hooks than expected”, WSOD)**가 발생한다.
- **해결책:** 훅 **내부**에서 null 체크로 타입 내로잉을 하고, `!` 연산자는 제거한다. **스냅샷 없음 UI 분기는 모든 훅 선언이 끝난 직후**(일반 변수·파생값 계산보다 **위**)에 두어, 하위에서는 `hasSnapshot ? … : …` 같은 3항 연산자와 `vrSnapshot!` 단언 없이 **`vrSnapshot`을 확정된 값으로만** 사용한다.  
  또한 `useMemo` 의존성에는 **`[vrSnapshot]` 통째 객체 금지** — 스냅샷 안에서 해당 메모가 실제로 쓰는 **원시값·배열 참조**(`vrSnapshot?.shares`, `vrSnapshot?.buyOrders` 등)만 넣어 불필요한 재계산을 막는다 (Core Principles §10).

**🚨 [통화 표시 / Strict TS — 이중 포맷팅 금지]** `formatCurrency`(§2.6) 시그니처는 **`number | null | undefined`**이다. **`toDisplayNumber` 결과를 다시 `formatCurrency`에 넣는 이중 파이프는 금지** — 로컬 `toDisplayNumber`는 `number | null`이지만, 문서·리뷰 혼동 시 문자열·잘못된 가정으로 **`$0.00` 폴백**으로 이어질 수 있다. **V/Pool/밴드 통화 줄은 `formatCurrency(vrSnapshot.currentV)` 등 스냅샷 원시 필드 직통.** `toDisplayNumber`는 **`calculateMaxBuyStep`·스텝 검증** 등 비-통화 경로에만 사용한다.

**🚨 [§5.4 / §10 DRY]** Step 0·주문 병합은 **`hooks/useVrOrders`** SSOT만 사용 — 컴포넌트에 **`useMemo` 3중 복붙 금지**. 훅 내부 빈 분기는 **`return []` 금지** — **`EMPTY_VR_ORDERS`**(§2.2 동결 SSOT)만 반환한다.

```tsx
// components/VrPortfolioSummary.tsx
// import { formatCurrency, calculateMaxBuyStep } from '../utils/vrBandStrategy';
// import { useVrOrders } from '../hooks/useVrOrders';
// 🚨 [DRY / §2.6] 통화 문자열은 `formatCurrency` SSOT만 — 컴포넌트 로컬 중복 정의 금지 (선행: §2.6 export)
// import { VR_MODAL_LABELS, VR_DASHBOARD_HINT } from '../constants/vrMessages';

const { safeBuyOrders, safeSellOrders } = useVrOrders(vrSnapshot);

// 🚨 모든 훅 선언 종료 후에만 얼리 리턴 (일반 변수보다 위)
if (!vrSnapshot) {
  return <div role="status">{VR_DASHBOARD_HINT[lang].pending}</div>;
}

// 🚨 얼리 리턴 이후에는 vrSnapshot이 확정 — hasSnapshot 3항 연산자·! 단언문 금지
const maxBuyStep = calculateMaxBuyStep(vrSnapshot.buyOrders ?? []);

return (
  <div className="space-y-3">
    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
      <span className="text-xs font-medium text-slate-500">V</span>
      <span className="font-bold text-slate-800 dark:text-slate-100">
        {formatCurrency(vrSnapshot.currentV)}
      </span>
    </div>
    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
      <span className="text-xs font-medium text-slate-500">
        {VR_MODAL_LABELS[lang].poolAfter}
      </span>
      <span className="font-bold text-slate-800 dark:text-slate-100">
        {formatCurrency(vrSnapshot.pool)}
      </span>
    </div>
    {/* 밴드: formatCurrency(vrSnapshot.bandLow) / formatCurrency(vrSnapshot.bandHigh) — 동일 직통 패턴 */}
    {/* maxBuyStep·모달 트리거·테이블은 safeBuyOrders / safeSellOrders 매핑 유지 */}
  </div>
);
```

### 5. [Financial Math] `calculateCycleIndexFromDates` Divide by Zero 방어
- **대상 파일:** `utils/vrBandStrategy.ts`
- **문제점:** `cycleWeeks`가 0 이하로 유입될 경우, `cycleLengthMs = cycleWeeks * TIME_MS.PER_WEEK`에서 0으로 나누는 연산이 발생해 `Infinity`/`NaN`이 전파될 수 있다.
- **해결책:** 함수 내부에 **Zero-Tolerance 가드**를 추가해 `cycleWeeks <= 0`이면 무조건 `0`을 반환하도록 한다.

```ts
export function calculateCycleIndexFromDates(
  startDateMs: number,
  targetDateMs: number,
  cycleWeeks: number,
): number {
  // [Zero-Tolerance] 나눗셈 변수 0 검증 가드 (필수)
  if (cycleWeeks <= 0) return 0;

  const diffMs = targetDateMs - startDateMs;
  if (diffMs < 0) return 0;
  const cycleLengthMs = cycleWeeks * TIME_MS.PER_WEEK;
  return Math.floor((diffMs + TIME_MS.PER_DAY) / cycleLengthMs);
}
```

### 6. [Logical Hazard] `computeVrSnapshotAfterTrade`의 텅 빈 스냅샷 폴백 제거
- **대상 파일:** `utils/vrBandStrategy.ts`
- **문제점:** `!prev`인 경우 빈 주문표(`buyOrders: [], sellOrders: []`)를 가진 기형적인 스냅샷을 생성하는 폴백 블록이 존재한다.  
  하지만 4.0항(최초 스냅샷 초기화)와 5.1항(매매 진입 가드)에 의해 이 함수는 **항상 유효한 스냅샷(prev)**을 가진 상태로만 호출되어야 하므로, 해당 폴백은 수학적으로 도달 불가능한 Dead Code이자 잠재적 논리 지뢰다.
- **해결책:** 함수 **시그니처는 원본(`VrSnapshot | null | undefined`)을 유지**하여 호출부 타입 에러를 방지하고, 함수 내부에서 `!prev`일 때 명시적 런타임 에러를 던져 설계 위반을 조기에 드러낸다.

```ts
export function computeVrSnapshotAfterTrade(
  currentSnapshot: VrSnapshot | null | undefined, // 시그니처 원본 유지 (매우 중요)
  trade: Trade,
  newPool: number,
  params: VrBandStrategyParams,
): VrSnapshot {
  // 🚨 [Guard Clause] 계산 전에 최우선으로 배치하여 TypeError 원천 차단
  if (!currentSnapshot) {
    throw new Error('[VR_Logic_Error] computeVrSnapshotAfterTrade requires an existing snapshot.');
  }
  const prev = currentSnapshot;
  const isBuy = trade.type === 'buy';
  const newShares = prev.shares + (isBuy ? trade.quantity : -trade.quantity);
  // … 기존 본문: newPool 산출, 매수/매도·수수료 반영 (실제 파일과 동일) …

  // 🚨 [Financial Math] 매도 시 평단 유지 / 전량 매도 시 0 / 매수 시에만 가중 평균 — §9.8.1과 동일 정책
  let newAvgPrice = prev.avgPrice;
  if (newShares <= 0) {
    newAvgPrice = 0;
  } else if (isBuy) {
    const prevTotalCost = prev.shares * prev.avgPrice;
    const tradeCost = trade.price * trade.quantity + (trade.fee ?? 0);
    newAvgPrice = toFixedMoney((prevTotalCost + tradeCost) / newShares);
  }

  return {
    ...prev,
    pool: newPool,
    shares: newShares,
    avgPrice: newAvgPrice,
    currentV: prev.currentV,
    bandLow: prev.bandLow,
    bandHigh: prev.bandHigh,
    buyOrders: prev.buyOrders,
    sellOrders: prev.sellOrders,
  };
}
```

### 7. [Strict I18N] `VrOrderModal.tsx` 접근성 라벨의 다국어 하드코딩 제거
- **대상 파일:** `components/VrOrderModal.tsx`, `constants/vrMessages.ts`
- **문제점:** 모달 오버레이/닫기 버튼의 접근성 라벨에 `lang === 'ko' ? '모달 닫기' : 'Close modal'` 등 한/영 문자열이 직접 하드코딩되어 있다.
- **해결책:** `VR_MODAL_LABELS` 딕셔너리에 `closeModal` 키를 추가하고, 컴포넌트에서는 `t.closeModal`만 참조하도록 수정한다.

```ts
// constants/vrMessages.ts
export const VR_MODAL_LABELS: Record<AppLang, { 
  closeModal: string;
  firstBuyGuide: string; // 🚨 TS 에러 방지 (5.3항에서 참조)
}> = {
  ko: {
    closeModal: '모달 닫기',
    firstBuyGuide: '첫 매수 전입니다. V값과 밴드 기준에 따라 초기 진입을 진행해 주세요.',
  },
  en: {
    closeModal: 'Close modal',
    firstBuyGuide: 'Before initial buy. Please execute your first entry based on V and Band limits.',
  },
};

// VrOrderModal.tsx (components/ 루트)
// import { VR_MODAL_LABELS } from '../constants/vrMessages';
const t = VR_MODAL_LABELS[lang];

<div
  className="absolute inset-0 ..."
  onClick={onClose}
  role="button"
  tabIndex={0}
  aria-label={t.closeModal}
  // [A11y] 키보드 사용자도 엔터/스페이스로 모달을 닫을 수 있도록 한다.
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClose();
    }
  }}
/>
```

### 8. [Floating-Point Precision] `dailyExecutionSummary.ts` 내 `.toFixed()` 전면 금지
- **대상 파일:** `utils/dailyExecutionSummary.ts`
- **문제점:** 파일 내부에 `price.toFixed(2)`, `qty.toFixed(2)`, `bandLow.toFixed(2)` 등 반올림 오차를 유발하는 JS 네이티브 포맷팅이 다수 존재한다.
- **해결책:** 파일 내 모든 `.toFixed(2)` 호출을 삭제하고, 아래 원칙을 따른다.
  - 금액/가격 포맷팅은 `toFixedMoney(val)` 또는 **`formatCurrency(val)`(§2.6 `vrBandStrategy` SSOT import)** 만 사용한다 — **본 파일에 `formatCurrency` 재정의 금지** (§2.7.3과 동일 DRY).
  - `Number.EPSILON`을 포함한 공통 유틸리티를 통해 반올림 오차를 차단하고, 문자열 조립은 해당 헬퍼의 반환값에만 위임한다.

```ts
// utils/dailyExecutionSummary.ts (formatVrBandBlock 등 내부)
// 🚨 [Floating-Point 방어] .toFixed() 절대 금지. `formatCurrency`·`toFixedMoney`는 §2.6·§2.7.3대로 `./vrBandStrategy`에서 import
// 🚨 [FINAL PATH SEAL] constants는 `../constants/...` — `./constants/...` 금지
const { currentV, pool, bandLow, bandHigh } = snapshot;

lines.push(`- ${s.vrV}: ${formatCurrency(currentV)}`);
lines.push(`- ${s.vrPool}: ${formatCurrency(pool)}`);

if (typeof bandLow === 'number' && typeof bandHigh === 'number') {
  lines.push(`- ${s.vrBand}: ${formatCurrency(bandLow)} ~ ${formatCurrency(bandHigh)}`);
}
```

### 9. [Strict I18N] `VrOrderModal.tsx` 접근성 라벨의 하드코딩 제거
- **대상 파일:** `components/VrOrderModal.tsx`
- **문제점:** 모달 오버레이 `div`에 `role`과 `onKeyDown` 등 접근성(A11y) 속성은 이미 완벽하게 구현되어 있으나, `aria-label`에 한/영 텍스트가 하드코딩되어 있다 (`lang === 'ko' ? '모달 닫기' : 'Close modal'`).
- **해결책:** 훌륭하게 작성된 기존 A11y 로직은 절대 건드리지 말고, 오직 `aria-label` 속성만 딕셔너리(`t.closeModal`)를 참조하도록 교체한다.

```tsx
// components/VrOrderModal.tsx
// import { VR_MODAL_LABELS } from '../constants/vrMessages';
// 🚨 주의: 기존의 onKeyDown 이벤트를 절대 삭제하지 말고, aria-label만 교체한다.
const t = VR_MODAL_LABELS[lang];

<div
  className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md cursor-pointer"
  onClick={onClose}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClose();
    }
  }}
  role="button"
  tabIndex={0}
  // 🚨 오직 이 부분만 하드코딩을 제거하고 교체한다
  aria-label={t.closeModal}
/>
```

### 10. [Strict TypeScript] `StrategyCreator.tsx` 헬퍼 함수의 `any` 완전 제거
- **대상 파일:** `components/StrategyCreator.tsx`
- **문제점:** 상단 헬퍼 `getStrategyDefinitions(t: any, vrT: any)`에서 번역 객체 파라미터가 `any`로 선언되어 있어, I18N 키 오탈자나 변경 시 타입스크립트가 에러를 잡아주지 못한다.
- **해결책:** `any`를 삭제하고, 실제 I18N 딕셔너리 타입을 그대로 매핑한다.

```ts
// components/StrategyCreator.tsx 상단 import 영역에 반드시 추가할 것
// 🚨 [빌드 크래시 방어] AppLang, StrategyDefinition 타입을 반드시 import 해야 한다.
import type { AppLang, StrategyDefinition } from '../types';

// 예시 타입 정의 (실제 I18N 구조에 맞게 조정)
// StrategyCreator.tsx 에서는 공통 다국어 객체를 I18N으로 import 하므로,
// STRINGS가 아니라 I18N을 기준으로 타입을 추론해야 한다.
type MainStrings = (typeof I18N)[AppLang];
type VrCreatorStrings = (typeof VR_CREATOR_LABELS)[AppLang];

const getStrategyDefinitions = (
  t: MainStrings,
  vrT: VrCreatorStrings,
): StrategyDefinition[] => [
  // ...
];

```

### 11. [Financial Math] `StrategyCreator.tsx` 비율(%) 소수점 변환 오염 방어
- **대상 파일:** `components/StrategyCreator.tsx`
- **문제점:** `vrBandUpperPct / 100`, `vrBandLowerPct / 100`, `feeRate / 100` 등 JS 원시 나눗셈 사용으로 인해 `5.1 / 100 = 0.051000000000000004` 같은 부동소수점 오염이 발생하여 DB에 저장될 수 있다.
- **해결책:** `handleSave` 내부의 모든 `% → 소수점` 변환에 정밀도 보정 유틸리티를 적용한다.

```ts
// 🚨 [Financial Precision] 미세 수수료율(예: 0.015% -> 0.00015)
// import { RATE_PRECISION_MULTIPLIER } from '../constants/vrConstants';
const toDecimalRate = (pct: number): number =>
  Math.round((pct / 100 + Number.EPSILON) * RATE_PRECISION_MULTIPLIER) / RATE_PRECISION_MULTIPLIER;

// handleSave 내부 적용 예시 (4개 변수 모두 적용 강제)
const bandUpper = Number.isFinite(vrBandUpperPct) ? toDecimalRate(vrBandUpperPct) : 0;
const bandLower = Number.isFinite(vrBandLowerPct) ? toDecimalRate(vrBandLowerPct) : 0;
const poolUsageRateBuy = Number.isFinite(vrPoolUsagePct) ? toDecimalRate(vrPoolUsagePct) : 0;
const normalizedFeeRate = Number.isFinite(feeRate) ? toDecimalRate(feeRate) : DEFAULT_FEE_RATE;
```

### 9.8.12 [Financial Math] 주문 생성 시 Divide by Zero / OOM(무한 루프) 방어 구체화
- **대상 파일:** `utils/vrBandStrategy.ts`
- **문제점:** `shares === 0` 등에서 분모·예산 로직이 어긋나면 `NaN`/`Infinity`가 전파된다. 또한 상한 없는 `for`는 브라우저/스케줄러 OOM으로 이어질 수 있다.
- **🚨 [Financial Dust / §1·§7]** 루프마다 **기준 예산 `maxBuyBudget`**(`pool * poolUsageRateBuy`)·`orderCost`·**`nextCumulativeCost`(누적 비용 덧셈 직후)**·`poolAfter`(매수), `proceeds`·`cumulativeProceeds`·`poolAfter`(매도)를 **원시 부동소수점 그대로 두면** 스텝마다 미세 오차가 쌓여 **예산 판정·잔액 표시가 어긋난다.** **해당 값들은 계산 직후 `toFixedMoney`로 멸균**하고, 기존 **`orderCost <= 0` / `proceeds <= 0` OOM 가드는 Preserve**(삭제 금지).
- **🚨 [Local Fact-Check / DRY]** 로컬 `vrBandStrategy.ts`에는 이미 매수 루프에서 `orderCost = price * qty * (1 + feeRate)` 직후 **`if (orderCost <= 0) break;`**, 매도 루프에서 `proceeds` 직후 **`if (proceeds <= 0) break;`** 가 구현되어 있다. **리팩터링 시 “추가 복붙”이 아니라 이 가드를 절대 삭제·훼손하지 말고 유지(Preserve)한다.** 아래 스니펫은 계약·코드 리뷰용 참고이며, 동일 블록을 중복 삽입하지 않는다.
- **해결책 (신규 구현이 아닌 유지·검증 계약):**  
  - **`safeShares`**: `shares > 0 ? shares : minOrderQty`로 분모용 보수값을 둔다 (로컬 `effectiveShares` 분기와 함께 사용).  
  - **`MAX_ORDER_STEPS` 상한**: 루프마다 `k > MAX_ORDER_STEPS`이면 **즉시 `break`** (로컬 기본값 20 — 필요 시 `vrConstants`로만 승격).  
  - **가격 0 이하**: `targetPrice`/`price`가 비정상이면 **즉시 `break`**.  
  - **비용/대금 0 이하 (OOM 최후 보루) — 유지 필수:** 매수에서 **`orderCost <= 0`이면 `break`**, 매도에서 **`proceeds <= 0`이면 `break`** (`minOrderQty`·`feeRate` 비정상 조합 방어). 이미 로컬에 있으면 **그대로 둔다**.  
  - 🚨 **교차 검증:** 아키텍처 예시로 흔한 `Math.pow(1 - bandRateLower, step)` 루프는 **로컬 SSOT 수식(`bandLow / effectiveShares`)과 다르다.** 구현·문서는 **항상 로컬 파일 본문**을 기준으로 삼는다.
  - 🚨 **`params.G` 정밀도 신뢰 확약:** `G`는 **§4.0 `handleSave`**에서 `safeG`(= `Number.isFinite` 가드 + `toFixedMoney`)로 이미 멸균되어 DB에 저장되고, **레거시 행은 `portfolioNormalize` 등 로딩 경로에서 한 번만** 동일 정책으로 맞춘다. `refreshVrSnapshotForPortfolio`가 `generateBuyOrders({ ...params, ... })`로 넘기더라도, **루프 내부에서 `G`에 대해 `toFixedMoney`를 또 호출하지 않는다** — 임의 재보정은 이중 잣대이며 버그를 숨긴다.

```ts
// utils/vrBandStrategy.ts — generateBuyOrders (로컬 SSOT 패턴 참고 요약 — 중복 삽입 금지, OOM 가드는 Preserve)
//
// 🚨 [Financial Math — G 신뢰 확약] VrBandStrategyParams.G 는 저장/정규화 단계에서 이미 toFixedMoney(소수 2자리) SSOT가
// 적용된 값으로 간주한다. 본 함수 및 형제 헬퍼의 루프·분기 안에서 G에 대해 중복 보정 금지.
// (시그니처에 G가 없더라도, 호출부가 ...params 로 스프레드할 때 동일 계약을 따른다.)
const MAX_ORDER_STEPS = 20; // 🚨 [OOM 방어] 상한 필수

export function generateBuyOrders({
  shares,
  pool,
  bandLow,
  minOrderQty,
  feeRate,
  poolUsageRateBuy,
}: GenerateBuyOrdersParams): OrderLevel[] {
  // 🚨 [Divide by Zero 방어] 분모/누적 보유량 보정 — 0주 스냅샷에서도 effectiveShares가 0으로 고착되지 않게
  const safeShares = shares > 0 ? shares : minOrderQty;

  validateFinancialArgs(/* ... 로컬과 동일 ... */);

  if (pool <= 0) return [];

  // 🚨 [Financial Math] 비교 대상인 기준 예산도 사전에 완벽히 멸균(toFixedMoney)해야 오작동을 막을 수 있음
  const maxBuyBudget = toFixedMoney(pool * poolUsageRateBuy);
  const orders: OrderLevel[] = [];
  let cumulativeShares = shares;
  let cumulativeCost = 0;
  let bufferCount = 0;

  for (let k = 1; ; k += 1) {
    if (k > MAX_ORDER_STEPS) break; // 🚨 OOM 방어

    const effectiveShares =
      shares === 0 ? k * minOrderQty : safeShares + (k - 1) * minOrderQty;

    const targetPrice = bandLow / effectiveShares;
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) break;

    const price = toFixedMoney(targetPrice);
    if (price <= 0) break; // 🚨 [Financial Math / OOM 방어] 0달러 호가 — 예산이 안 닳아 무한 루프 위험

    const qty = minOrderQty;
    // 🚨 [Financial Math — Dust] 주문 대금·잔액은 스텝마다 toFixedMoney 멸균 (누적 오차 방지)
    const orderCost = toFixedMoney(price * qty * (1 + feeRate));

    // 🚨 [OOM 방어 유지] 로컬에 이미 존재 — 리팩터 시 삭제 금지. 비용 0 이하면 예산이 닳지 않아 무한 루프 위험.
    if (orderCost <= 0) break;

    // 🚨 [Financial Math — Cumulative Dust] 덧셈 직후에도 toFixedMoney 멸균 — 예산 경계(isWithinBudget) 오작동 방지
    const nextCumulativeCost = toFixedMoney(cumulativeCost + orderCost);
    // 🚨 양쪽 모두 멸균된 안전한 비교 달성 (maxBuyBudget·nextCumulativeCost 모두 toFixedMoney 경유)
    const isWithinBudget = nextCumulativeCost <= maxBuyBudget;
    if (!isWithinBudget) bufferCount += 1;

    cumulativeCost = nextCumulativeCost;
    cumulativeShares += qty;
    const poolAfter = toFixedMoney(pool - cumulativeCost);

    orders.push({
      step: k,
      price,
      qty,
      isBuffer: !isWithinBudget,
      sharesAfter: cumulativeShares,
      poolAfter,
    });

    if (!isWithinBudget && bufferCount >= 2) break;
  }

  return orders;
}
```

`generateSellOrders` 루프에도 **동일한 계약**을 적용한다 — 로컬에 `proceeds <= 0` 가드가 있으면 **유지(Preserve)** (중복 삽입 금지).

```ts
// utils/vrBandStrategy.ts — generateSellOrders 루프 내부 (발췌 · 참고용)
const qty = minOrderQty;
cumulativeSold += qty;
if (cumulativeSold > shares) break;

const proceeds = toFixedMoney(price * qty * (1 - feeRate));

// 🚨 [OOM 방어 유지] 로컬에 이미 존재 — 리팩터 시 삭제 금지
if (proceeds <= 0) break;

cumulativeProceeds = toFixedMoney(cumulativeProceeds + proceeds);
const poolAfter = toFixedMoney(pool + cumulativeProceeds);
// orders.push({ ..., poolAfter }) — poolAfter는 위 멸균값 사용
```

---

## 10. 체크리스트 (구현 완료 시)

- [ ] §9.8 코딩 전제 조건 (부동소수점 방어, any 제거, 중복 함수 삭제, `!` 연산자 제거, Divide by Zero 가드, Dead Code 제거, A11y/I18N 정리, `.toFixed` 전면 금지, 퍼센트→소수점 변환 정밀도 보정) 반영
- [ ] `StrategyCreator.tsx`: 하단 제출 버튼 중첩 삼항 연산자 → `getSubmitButtonText` 헬퍼 추출 (§2.4.3)
- [ ] `types.ts`: `VrBandStrategyBase`에 `cycleWeeks: number` 추가, `VrSnapshot`에 `cycleIndex?: number` 추가, **`PortfolioRow`(§2.1.4) export** — Edge `mapPortfolioRow`·`portfolioNormalize`가 동일 심볼만 사용, **`RawPortfolioRow` 등 판박이 타입 금지**
- [ ] 금융 반올림: **`toFixedMoney`만 사용** — `toDecimalMoney` import/호출 **금지** (§9.8 상단)
- [ ] Pool 사용 비율: UI는 **`vrPoolUsagePct`**, 저장·수학은 **`poolUsageRateBuy`** — §2.1.5 계약 위반 없는지 확인
- [ ] `constants/vrConstants.ts`: `VR_CYCLE` + `DEFAULT_FEE_RATE`(소수) + **`LEGACY_FEE_RATE_PCT`(루트 수수료 퍼센트 폴백)** + `RATE_PRECISION_MULTIPLIER` + **`EMPTY_VR_ORDERS`(`Object.freeze` + 캐스팅)** SSOT 추가
- [ ] `StrategyCreator.tsx`: `toDecimalRate`가 **`RATE_PRECISION_MULTIPLIER`만** 참조 (지역 `1_000_000_000` 금지) — §2.0 import 경로 준수
- [ ] `constants/vrMessages.ts`(또는 `StrategyCreator`가 쓰는 메인 I18N 딕셔너리): `cycleWeeks`, `cycleWeeksError`, `cycleWeeksOption`, `cyclePeriodFormat` + **`portfolioLimitReached(max: number)`**, **`needDifferentStocks`** (§4.0 `handleSave` alert — 인라인 ko/en 금지)
- [ ] `components/strategies/VrBandStrategyForm.tsx`: 인터페이스 확장 + 1~12주 선택 UI 추가
- [ ] `components/StrategyCreator.tsx`: `vrCycleWeeks` 상태 추가 + props 연동 + `handleSave` vrParams 포함 + **`validateFinancialArgs`에 `G: safeG` / `strictPositive` 규칙** (§4.0) + **VR 저장 시 루트 `feeRate` 퍼센트 유지·`vrDecimalFeeRate`만 `vrBand`** (§4.0) + VR `startDate`는 **`handleStrategySelect` 내부(과금 검증 이후)** 에만 동기화 — 새 핸들러로 PRO 분기 우회 금지 (§2.4.2) + **`handleSave` 상단 `alert` 2곳은 `t.portfolioLimitReached` / `t.needDifferentStocks`만** (§4.0 Strict I18N) + **Core Principles §7: `as VrBandStrategyParams` / `as Strategy` 금지** — `const vrParams: VrBandStrategyParams` + `deltaCash: vrMode === 'lump_sum' ? 0 : …` + `strategy = { … vrBand: vrParams }` (§4.0)
- [ ] `hooks/useVrOrders.ts`: Step 0 + `safeBuyOrders` / `safeSellOrders` SSOT 훅 신설 (`EMPTY_VR_ORDERS` 폴백) — §5.4.1
- [ ] `components/Dashboard.tsx`: 헤더에 사이클 기간 배지 추가 (`getVrCyclePeriodText`) + **`useVrOrders(portfolio.vrSnapshot)`** 로 모달에 주입, 듀얼 모달 동일 props — `buyOrders ?? EMPTY_VR_ORDERS` 단독 금지 (§5.4)
- [ ] `components/VrPortfolioSummary.tsx`: **`useVrOrders(vrSnapshot)`** 로 테이블·스프레드 주문 배열 통일 (§5.4 · §9.8.4)
- [ ] `utils/vrBandStrategy.ts`: `sanitizeVrCycleWeeks`, `getVrCyclePeriodText` 헬퍼 추가, `roundPrice2` 삭제
- [ ] `utils/portfolioNormalize.ts`: `cycleWeeks` 정규화 + `any` 시그니처 제거 + 루트 `feeRate` 폴백 **`LEGACY_FEE_RATE_PCT`** / `vrBand.feeRate` 폴백 **`DEFAULT_FEE_RATE`** + **`vrMode` 유니온 런타임 멸균** + **`as VrBandStrategyParams` 금지** — `sanitizedVrParams` 모드별 분기(§9.8.2 · Core Principles §7)
- [ ] `utils/dailyExecutionSummary.ts`: VR 알람 헤더에 사이클 정보 추가 + V/Pool 라벨 `STRINGS[lang]` 참조로 I18N 준수
- [ ] 백엔드: `supabase/functions/refresh-vr-snapshots/` 신규 Edge Function 생성 (T+1 선행 계산) + `mapPortfolioRow` 루트 `feeRate` 폴백 **`LEGACY_FEE_RATE_PCT`** (§4.2) + **`processAllVrPortfolios`는 §4.2 SSOT 단일 스니펫만** — **`PAGE_SIZE` 청크 `.range` + 청크마다 `Promise.allSettled(batch.map)`** (순차 `for...of` 절대 금지, **Core Principles §10·§6**, OOM·Timeout·에러 격리)
- [ ] 백엔드: Cron 마이그레이션 SQL (`10 21 * * 1-5` UTC = KST 06:10 화~토)
- [ ] DB 마이그레이션: 기존 VR 포트폴리오에 `cycleWeeks` 기본값 2 주입 SQL

---

본 문서의 스니펫은 **로컬 코드베이스(`types.ts`, `utils/vrBandStrategy.ts` 등)와 교차 검증**을 거친 **구현 가이드**이며, 붙여넣기 전에 항상 실제 파일 SSOT와 diff를 맞출 것. (예: `GenerateBuyOrdersParams` 6필드 제약 vs `...params` 스프레드 — §4.0 스케줄러 주석 참고)
