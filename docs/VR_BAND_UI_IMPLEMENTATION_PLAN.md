# VR 밴드 전략 UI 구현 계획서

## 문서 목적

기존 `PortfolioCard` 구조를 유지하면서, **밸류 리밸런싱(VR) 전략** 전용 UI와 **예약 주문표 모달**을 추가하기 위한 구현 계획이다.  
계획 검토 후 진행 여부를 결정한다.

---

## 0. 리뷰 및 시스템 정합성 정정

### 0.1 지시사항과 현재 코드베이스의 불일치 (반드시 반영)

| 지시사항 표현 | 현재 시스템 | 계획서 반영 |
|---------------|------------|-------------|
| "`PortfolioCard.tsx` 파일 수정" | **`PortfolioCard`는 별도 파일이 아님.** `Dashboard.tsx` 내부에 인라인 컴포넌트로 정의됨 (L266~L1087). | **`Dashboard.tsx` 내 `PortfolioCard` 영역을 수정**한다. 별도 `PortfolioCard.tsx` 추출은 본 작업 범위 밖(선택)으로 둔다. |
| "`strategyType === 'vr_band'`" | **`Portfolio`에는 `strategyType` 필드가 없음.** 전략 구분은 `portfolio.strategy.multiSplit`, `portfolio.strategy.ma0` 등 **필드 존재 여부**로 함. | VR 여부는 **`const isVrStrategy = !!portfolio.strategy.vrBand`** 로 판별한다. `Strategy` 타입에 `vrBand?: VrBandStrategyParams` 를 추가해야 함. |
| "PortfolioCard가 받을 VR 전용 추가 props" | 현재 카드는 `portfolio`, `lang`, 콜백들만 받음. 상위에서 VR 데이터를 넘기는 패턴은 없음. | VR 요약/주문 데이터는 **백엔드(Supabase Edge Function)에서 계산해 DB에 스냅샷으로 저장**하고, **`portfolio.vrSnapshot`** 형태로 내려받아 **카드는 해당 필드만 읽어 렌더링**한다. 카드/반복문 내부에서 `getVrPortfolioData` 등 무거운 연산을 수행하지 않는다. |

### 0.2 선행 조건

- **`types.ts`**  
  - `Trade`에 `metadata?: { pool_after?: number; [key: string]: unknown }` 추가.  
  - `Strategy`에 **`vrBand?: VrBandStrategyParams`** 추가. VR 설정은 **이 필드 단일 소스(SSOT)**.  
  - `OrderLevel`, `VrSnapshot` 정의. **`VrSettings`는 삭제** — 설정은 `VrBandStrategyParams` 하나로 통일.  
  - `Portfolio`에 **`vrSnapshot?: VrSnapshot`** 만 추가. **`vrSettings` 필드 없음** — 초기 설정은 `portfolio.strategy.vrBand` 만 사용 (§0.3).
- **`utils/vrBandStrategy.ts`**  
  - VR 문서(docs/VR_BAND_STRATEGY.md)의 공식에 따른 **순수 함수** 구현.  
  - 최소: `generateBuyOrders`, `generateSellOrders`, `calculateBands`, `getVrPortfolioData`.  
  - **호출 위치**: Supabase Edge Function(백엔드)에서 스냅샷 계산·DB 저장. **Dashboard/PortfolioCard 렌더 경로에서는 호출하지 않음.**  
  - **VR 전략 생성 UI(StrategyCreator)가 아직 없을 수 있음** → 1단계에서는 `vrSnapshot`을 수동/목업으로 넣어 카드·모달만 검증 가능.

### 0.3 Pool 데이터 오해와 동기화 문제 — 비판 반영 및 아키텍처 확정

**비판 요지**  
VR 전략에서 **Pool**은 증권사 계좌의 '현재 예수금'이 아닌, **사이클마다 누적·차감되는 전략 전용 상태값(가상 Pool)** 이다.  
거래소 API에서 가져온 계좌 예수금(holdings)으로 Pool을 대체하면, 실제 계좌 현금과 전략상 Pool이 꼬여 **로직이 전부 깨진다**.  
기존 시스템의 `Portfolio`/holdings 구조만으로는 이 **가상 Pool**을 분리해 저장할 수 있음이 문서에 명시되어 있지 않았음.

**해결 원칙 (아키텍처 최종 확정)**  
- **상태 격리 (State Isolation)**  
  VR의 **Pool**과 **V**는 **외부 증권사 계좌의 실제 예수금 변동에 영향받지 않는다.**  
  **오직 DB에 저장된 전략 전용 상태값**만 기준으로 계산한다. 잔액 계산·스냅샷 갱신 시 **`portfolio.vrSnapshot.pool`** 을 사용하며, 증권사 API 현금은 사용하지 않는다.  
- **DRY**  
  체결 내역을 위한 **별도 DB 테이블을 만들지 않는다.** 기존 **`Portfolio.trades`** 배열을 그대로 재활용하고, VR 체결 시 **`trade.metadata.pool_after`** 에 체결 직후 Pool을 기록한다.  
- **설정 vs 상태 분리 · SSOT**  
  VR **초기 설정**은 **`portfolio.strategy.vrBand` 단 한 곳(SSOT)** 에만 존재한다. `portfolio.vrSettings` 같은 중복 필드는 **금지** — 설정이 두 곳에 나뉘면 데이터 정합성이 깨진다.  
  - **초기 설정**: `portfolio.strategy.vrBand` (타입: `VrBandStrategyParams`)  
  - **실시간 상태**: `portfolio.vrSnapshot` (덮어쓰기용): `currentV`, `pool`, `shares`, `avgPrice`, `bandLow`, `bandHigh`, `buyOrders`, `sellOrders`  
  Pool·V·주문표 계산은 **vrSnapshot**을 기준으로 하며, 설정 참조는 **strategy.vrBand** 만 사용한다.

이에 따라 **§2 타입 정의**에서 `Trade.metadata`, **VrBandStrategyParams(단일 타입, VrSettings 폐기)**, `VrSnapshot` 및 **§5.1 매매 실행 로직 가이드**를 반영한다.

---

## 1. 현재 아키텍처 및 목표

### 1.1 기존 패턴

- **전략 분기**: `Dashboard.tsx` 내 `PortfolioCard`에서  
  `isMultiSplitStrategy = !!portfolio.strategy.multiSplit`,  
  `isNoStopMultiSplitStrategy = !!portfolio.strategy.noStopMultiSplit` 로 UI 분기.
- **일별 매매 실행 블록**: 파란색 큰 클릭 영역(`onClick={onOpenExecution}`)에 "일별 매매 실행" 텍스트와 전략별 실행 요약 표시. 그 바로 아래에 "전략 종료하기" 버튼(`onClose` → `t.terminate`).

### 1.2 목표

- **목표 1**  
  `PortfolioCard`(실제로는 `Dashboard.tsx` 내 해당 컴포넌트) 안에  
  - VR 전략일 때만 **VR 요약 박스**(현재 V, Pool, 밴드 하단/상단)  
  - **"예약 주문 가격표 보기"** 버튼  
  을 추가한다. 버튼 위치: **일별 매매 실행 블록과 "전략 종료하기" 버튼 사이**.
- **목표 2**  
  예약 주문 호가창 표는 **`VrOrderModal`** 이라는 **신규 컴포넌트**로 완전 분리하여, 카드에서는 `isOpen`/`onClose` 상태와 데이터만 넘긴다.

---

## 2. 타입 정의 (types.ts 반영)

기존 `Strategy`, `Portfolio`와 병합하여 사용할 타입.  
(필요 시 `types/vrBand.ts`로 분리 후 re-export 가능.)

### 2.1 Trade 메타데이터 확장 (영수증 비고란)

VR 전략에서 체결 직후의 **가상 Pool 잔액**을 기록하기 위해 기존 `Trade` 인터페이스에 `metadata` 필드를 추가한다.

```typescript
/** 기존 Trade 확장: 체결 직후 VR Pool 등 메타데이터 기록 */
export interface Trade {
  id: string;
  type: 'buy' | 'sell';
  stock: string;
  date: string;
  price: number;
  quantity: number;
  fee: number;
  isMOC?: boolean;
  /** VR 전략: pool_after 등 체결 직후 상태 기록. 다른 전략은 확장 가능. */
  metadata?: { pool_after?: number; [key: string]: unknown };
}
```

- **요구사항**: `metadata?: { pool_after?: number; [key: string]: unknown }` 형태로 엄격히 관리. VR 체결 시 `trade.metadata = { pool_after: newPool }` 주입 후 `handleAddTrade`로 저장.

### 2.2 공통·스냅샷 타입 (OrderLevel, VrSnapshot)

```typescript
/** VR 예약 주문 한 레벨 (매수/매도 공통) */
export interface OrderLevel {
  step: number;
  price: number;
  qty: number;
  /** true: Pool 한도 초과로 "가이드" 표시용 (회색 + 배지) */
  isBuffer: boolean;
  /** 주문 성공 시 보유 주식 수 (필수). 매수: 이 단계까지 체결 시 누적 주수, 매도: 이 단계 체결 후 잔량. */
  sharesAfter: number;
  /** 주문 성공 시 Pool 잔액 (필수). 해당 단계 체결 직후의 Pool. */
  poolAfter: number;
}

/** VR 실시간 상태(덮어쓰기용). DB에 저장·조회하며, 증권사 API 현금과 혼용하지 않음. */
export interface VrSnapshot {
  currentV: number;
  /** 수수료/매매 반영된 최신 가상 Pool 잔액. 잔액 계산의 유일한 기준. */
  pool: number;
  /** 현재 보유 주식 수 (VR 대상 종목). */
  shares: number;
  /** 현재 평균 단가. */
  avgPrice: number;
  bandLow: number;
  bandHigh: number;
  buyOrders: OrderLevel[];
  sellOrders: OrderLevel[];
}
```

- **타입 별칭**: `VrPortfolioData = VrSnapshot` 은 **사용하지 않는다**. 코드베이스에서 import하는 곳이 없으면 **계획서·types.ts 모두 제거**하고 **VrSnapshot만** 사용한다. (Dead 타입 방지.)

### 2.3 VrBand 전략 파라미터 — SSOT, Base + Discriminated Union (VrSettings 폐기)

- **SSOT**: VR 초기 설정은 **`portfolio.strategy.vrBand` 단 한 곳**에만 존재한다. `VrSettings` 인터페이스는 **삭제**하며, 설정 타입은 **`VrBandStrategyParams` 하나로 통일**한다. `portfolio.vrSettings` 필드는 사용하지 않는다.
- **Base 인터페이스**: 공통 필수 필드만 담은 **`VrBandStrategyBase`**. Optional(`?`) 속성은 **허용하지 않는다**.
- **Discriminated Union**: `vrMode` 판별자로 세 가지 인터페이스. `lump_sum`은 **`deltaCash: 0`** 리터럴로 강제.

```typescript
/** VR 밴드 전략 공통 필드. Optional 속성 없음(필수만). */
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

/** 적립식: 매 사이클 deltaCash 필수 */
export interface VrBandAccumulate extends VrBandStrategyBase {
  vrMode: 'accumulate';
  deltaCash: number;
}

/** 인출식: 매 사이클 인출 금액 필수 */
export interface VrBandWithdraw extends VrBandStrategyBase {
  vrMode: 'withdraw';
  deltaCash: number;
}

/** 거치식: deltaCash는 리터럴 0으로 강제 */
export interface VrBandLumpSum extends VrBandStrategyBase {
  vrMode: 'lump_sum';
  deltaCash: 0;
}

/** Strategy.vrBand 에 넣을 설정. SSOT — 포트폴리오 VR 설정은 이 타입 단 한 곳. */
export type VrBandStrategyParams =
  | VrBandAccumulate
  | VrBandWithdraw
  | VrBandLumpSum;

/**
 * 다음 V 계산 시 사용할 deltaCash. switch로 타입 가드 완전 추론.
 * lump_sum → 0, accumulate/withdraw → params.deltaCash. ?? 0 같은 nullish 처리 금지.
 */
export function getVrDeltaCashForNextV(params: VrBandStrategyParams): number {
  switch (params.vrMode) {
    case 'accumulate':
    case 'withdraw':
      return params.deltaCash;
    case 'lump_sum':
      return 0;
    default: {
      const _exhaustive: never = params;
      return _exhaustive;
    }
  }
}
```

- **Strategy** 에 **`vrBand?: VrBandStrategyParams`** 필드 추가.  
- **Portfolio** 에는 **`vrSnapshot?: VrSnapshot`** 만 추가. **`vrSettings` 필드 없음.**  
- VR 판별: **`const isVrStrategy = !!portfolio.strategy.vrBand;`** (단일 소스만 참조).

### 2.5 비대칭 밴드 계산 — `calculateBands` 수정

밴드 계산은 **`bandRateUpper` / `bandRateLower`** 를 사용하며, 대칭이 아닌 비대칭 밴드폭을 지원한다.

```typescript
/** 비대칭 밴드: bandHigh = V * (1 + bandRateUpper), bandLow = V * (1 - bandRateLower) */
export function calculateBands(
  v: number,
  bandRateUpper: number,
  bandRateLower: number
): { bandLow: number; bandHigh: number } {
  return {
    bandLow: v * (1 - bandRateLower),
    bandHigh: v * (1 + bandRateUpper),
  };
}

// 사용 예 (params가 VrBandStrategyParams인 경우)
// const { bandLow, bandHigh } = calculateBands(
//   currentV,
//   params.bandRateUpper,
//   params.bandRateLower
// );
```

- **`Strategy` 인터페이스 확장**  
  - `types.ts`의 `Strategy`에 **`vrBand?: VrBandStrategyParams`** 필드 추가.  
  - 기존 `ma0`, `multiSplit`, `noStopMultiSplit` 등과 동일하게 선택 필드로 둔다.

- **`Portfolio` 인터페이스 확장**  
  - **`vrSnapshot?: VrSnapshot`** (실시간 상태) 필드만 추가. **초기 설정은 `portfolio.strategy.vrBand` 단일 소스(SSOT)** 이며, `vrSettings` 필드는 두지 않는다.  
  - Pool·V·주문표는 **vrSnapshot**만 기준으로 하며, 증권사 API 예수금과 혼용하지 않는다 (§0.3).  
  - 백엔드(Edge Function)에서 스냅샷 계산·매매 반영 후 DB에 덮어쓰고, 포트폴리오 조회 시 함께 내려준다.  
  - 클라이언트는 `vrSnapshot`이 있으면 그대로 표시하고, 없으면 VR 요약/버튼을 비표시 또는 "준비 중" 처리한다.

---

## 3. Task A: `VrOrderModal.tsx` 신규 생성

### 3.1 역할

- VR 밴드 **상단(매도)** / **하단(매수)** 예약 주문 호가창을 팝업 모달로 표시.
- **props**
  - `isOpen: boolean`
  - `onClose: () => void`
  - `buyOrders: OrderLevel[]`
  - `sellOrders: OrderLevel[]`
  - `lang: 'ko' | 'en'` (기존 I18N 패턴)

### 3.2 UI 구성 — 탭(Tab) 기반 레이아웃 (필수)

- **레이아웃 원칙**  
  - 매도 표와 매수 표를 **위아래로 단순 배치(Stacked)** 하면 모바일에서 끝없는 스크롤이 발생하므로 **금지**.  
  - **탭(Tab) 기반 UI**로 구현하여, 모바일·데스크톱 모두에서 한 번에 **하나의 표만** 노출.

- **상태 관리**
  - 모달 내부: `const [activeTab, setActiveTab] = useState<'sell' | 'buy'>('sell');` (기본값 `'sell'`).

- **탭 메뉴 (Tab Navigation)**
  - 모달 타이틀 바로 아래에 두 개의 탭 버튼을 나란히 배치.
  - **[상단 매도 주문]** 탭  
    - 활성: 빨간색 텍스트 + 빨간색 밑줄(또는 배경). 예: `text-red-600 border-b-2 border-red-600`.  
    - 비활성: `text-gray-500`.
  - **[하단 매수 주문]** 탭  
    - 활성: 파란색 텍스트 + 파란색 밑줄(또는 배경). 예: `text-blue-600 border-b-2 border-blue-600`.  
    - 비활성: `text-gray-500`.

- **조건부 렌더링**
  - 탭 버튼 아래 콘텐츠 영역: **`activeTab`에 따라 하나의 표만 렌더링.**
  - `activeTab === 'sell'` → `sellOrders` 테이블만.
  - `activeTab === 'buy'` → `buyOrders` 테이블만.

- **테이블 열**
  - 필수: 단계(Step), 주문가($), 수량, **주문 성공 시 주식 개수(sharesAfter)**, **주문 성공 시 Pool(poolAfter)** (§3.5 참조).  
- **테이블 구현 규칙 (유지보수성)**  
  - **Dead 파라미터 금지**: 주문 목록을 받는 함수/컴포넌트는 `(orders: OrderLevel[])` 만 받는다. 사용하지 않는 `isSell` 등 두 번째 인자 제거.  
  - **행 key**: `key={idx}` 금지. **안정적 식별자** 사용: `key={order.step}` 또는 `key={\`${order.step}-${order.price}\`}`.  
  - **숫자 표시 방어**: sharesAfter, poolAfter 등 숫자 필드는 레거시/외부 데이터에서 undefined 가능성이 있으면 **`Number(value ?? 0).toFixed(2)`** 또는 유한수 체크 후 표시.  
  - **(권장)** 테이블을 **`VrOrderTable({ orders, lang })`** 전용 컴포넌트로 분리하면 테스트·재사용에 유리. `VrOrderModal`은 탭·레이아웃만 담당.

### 3.5 예약 주문 가격표 수치 정리

가격표(모달 내 테이블)에 기입되는 수치는 **`OrderLevel`** 타입 필드와 1:1 대응한다.  
또한, 표의 **맨 첫 줄에는 항상 "Step 0 (현재 상태)" 행을 추가**하여 현재 보유 수량과 현재 Pool 잔액을 명시적으로 보여준다.

| 표시 열 | OrderLevel 필드 | 설명 |
|--------|-----------------|------|
| 단계 | `step` | 0부터 시작하는 주문 단계 번호. **step=0은 "현재 상태" 행**이며, 이후 1부터는 주문 단계 번호. 매도/매수 각각 독립 번호. |
| 주문가($) | `price` | 해당 단계의 주문 가격 (USD). **Step 0(현재 상태)에서는 '-' 로 표시.** |
| 수량 | `qty` | 해당 단계에서 주문할 주 수. **Step 0(현재 상태)에서는 '-' 로 표시.** |
| 주문 성공 시 주식 개수 | `sharesAfter` | 해당 단계가 체결되었을 때의 보유 주식 수. 매수: 이 단계까지 체결 시 누적 주수, 매도: 이 단계 체결 후 남은 주수. **Step 0(현재 상태)에서는 현재 보유 주식 수를 표시.** |
| 주문 성공 시 Pool | `poolAfter` | 해당 단계가 체결된 직후의 Pool 잔액. **Step 0(현재 상태)에서는 현재 Pool 잔액을 표시.** |
| (행 스타일) | `isBuffer` | `true`이면 Pool 한도 초과 가이드용 → 회색 텍스트 + "가이드" 배지. |

- **열 구현 정책**: step, price, qty, sharesAfter, poolAfter는 **모두 필수 열**이다.  
  - Step 0(현재 상태) 행은 위 표 설명에 맞게 `price='-'`, `qty='-'`, `sharesAfter=현재 보유 주식 수`, `poolAfter=현재 Pool` 로 렌더링한다.  
  - Step 1 이상 주문 행은 `sharesAfter`, `poolAfter` 를 각각 해당 단계 체결 후 상태로 계산하여 필수로 채운다.
- **데이터 소스**: `portfolio.vrSnapshot.buyOrders`, `portfolio.vrSnapshot.sellOrders` (백엔드 스냅샷에서 계산된 값).

- **시각적 디테일 (유지)**
  - `buyOrders`에서 **`order.isBuffer === true`** 인 행:  
    - 글씨 **회색** (`text-gray-400` / 다크모드 대응).  
    - 해당 셀 또는 행 옆에 **작은 "가이드" 배지** 표시.  
  - 테이블·모달은 Tailwind CSS로 깔끔한 모던 금융 앱 스타일 유지.

### 3.3 구현 위치 및 패턴

- **파일**: `components/VrOrderModal.tsx` (신규).
- **모달 패턴**: 기존 `PortfolioDetailsModal`, `AlarmModal`과 유사하게 배경 오버레이 + 내부 박스, `onClose`로 닫기. 토스 미니앱에서는 기존 모달과 동일하게 동작.

### 3.4 의존성

- `OrderLevel` 타입은 `types.ts`에서 import (또는 동일 구조 로컬 정의).
- 부모는 `buyOrders`/`sellOrders`를 **`portfolio.vrSnapshot`** 에서 전달.

---

## 4. Task B: SRP 준수 — `VrPortfolioSummary.tsx` 분리 및 Dashboard 역할 축소

기존 800줄 이상의 `Dashboard.tsx` 내부에 VR 전용 UI·모달 상태·복잡한 렌더 로직을 모두 넣는 **안티 패턴을 폐기**한다.  
**단일 책임 원칙(SRP)** 에 따라 VR 요약·모달·N번 계산은 **신규 컴포넌트**에서만 담당하고, Dashboard는 **판별 + 한 줄 마운트**만 수행한다.

---

### 4.1 신규 컴포넌트: `VrPortfolioSummary.tsx`

VR 전략의 **요약 정보**와 **예약 주문 모달**을 관리하는 책임을 **완전히 분리**한 전용 컴포넌트를 신규 생성한다.

#### 4.1.1 Props 정의

| Prop | 타입 | 설명 |
|------|------|------|
| `vrSnapshot` | `VrSnapshot \| undefined` | 백엔드에서 내려준 실시간 상태. 미전달 시 Fallback UI 표시. |
| `vrSettings` | `VrBandStrategyParams` | 초기 설정(vrMode, deltaCash 등). **SSOT**: `portfolio.strategy.vrBand` 단 한 곳만 전달. 구현·계획서 모두 **prop 이름은 vrSettings** 로 통일. |
| `lang` | `'ko' \| 'en'` | 기존 I18N 패턴. |

- **부모(Dashboard)는** 위 세 가지만 넘기고, VR 요약 박스·배지·버튼·모달·N 계산 등 **어떤 UI/로직도 직접 구현하지 않는다.**

#### 4.1.2 상태 관리 (컴포넌트 내부)

- **모달 오픈 상태**  
  - **Dashboard가 아닌 `VrPortfolioSummary` 내부**에서 관리한다.  
  - `const [isModalOpen, setIsModalOpen] = useState(false);`  
  - "예약 주문 가격표 보기" 버튼: `onClick={() => setIsModalOpen(true)}`  
  - `VrOrderModal`: `isOpen={isModalOpen}` `onClose={() => setIsModalOpen(false)}`  
  - Dashboard에는 VR용 모달 state를 두지 않는다.

#### 4.1.3 로직 이동: "N번까지 주문하세요"의 N 계산

- **"예약 매수는 표의 N번까지 주문하세요"** 에 들어가는 **N(maxBuyStep)** 은 **이 컴포넌트 내부**에서만 계산한다.
- **규격**: `vrSnapshot.buyOrders` 중 **`isBuffer === false`** 인 항목들의 **최대 `step`** 값을 N으로 사용.
- **구현**: **`useMemo`** 로 의존 배열 `[vrSnapshot?.buyOrders]` 기준 최적화.  
  - 예: `const maxBuyStep = useMemo(() => { const orders = vrSnapshot?.buyOrders ?? []; const nonBuffer = orders.filter(o => !o.isBuffer); return nonBuffer.length === 0 ? 0 : Math.max(...nonBuffer.map(o => o.step)); }, [vrSnapshot?.buyOrders]);`
- Dashboard(PortfolioCard)에서는 **maxBuyStep 계산·순회 로직을 두지 않는다.**

#### 4.1.4 담당 UI (이 컴포넌트가 렌더하는 것)

- **VR 요약 박스**: currentV, pool, bandLow, bandHigh (표시 형식·위치 기존 계획과 동일).
- **VR 타입 배지**: 거치식 / 적립식 / 인출식 (다분할 배지와 동일 위치·스타일 패턴).
- **Daily Execution 블록 내 VR 전용 내용**: V, Pool, bandLow/bandHigh, deltaCash(적립/인출식일 때), "예약 매수는 표의 N번까지 주문하세요" 문구 (N = 위 `maxBuyStep`).
- **"예약 주문 가격표 보기" 버튼** 및 클릭 시 **`VrOrderModal`** 렌더 (모달 state·props는 모두 이 컴포넌트 내부에서 처리).

#### 4.1.5 파일 위치 및 의존성

- **파일**: `components/VrPortfolioSummary.tsx` (신규).
- **의존**: `VrSnapshot`, `VrBandStrategyParams`, `OrderLevel` — `types.ts`에서 import.  
  `VrOrderModal` import하여 모달·버튼 연결.

#### 4.1.6 (선택) SRP 추가 분리

- 한 컴포넌트가 요약·배지·Fallback·모달·N 계산까지 모두 담당하면 변경 영향 범위가 커진다.  
- **선택적 개선**:  
  - "데이터 있을 때만 보이는 내용"을 **`VrSummaryContent`** 로 분리하고,  
  - "Pending/Error" 문구·스타일을 **`VrSnapshotFallback`** 으로 분리한 뒤,  
  - **`VrPortfolioSummary`** 는 **조건 분기 + 두 블록 조합**만 담당하도록 쪼갠다.  
- 구현 시 팀 판단에 따라 적용 여부 결정.

---

### 4.2 Edge Case: 대기(Pending) vs 실패(Error) 구분 — 무한 Fallback 방지

**`vrSnapshot == null`** 일 때 **"대기 상태(Pending)"** 와 **"생성 실패/동기화 오류(Error)"** 를 반드시 구분한다.  
백엔드 Edge Function이 에러로 종료되거나 스냅샷이 영원히 생성되지 않으면, 유저가 "계산 중입니다..."만 끝없이 보는 **무한 로딩**을 허용하지 않는다.

- **Pending (대기)**  
  - `vrSnapshot == null` 이고, **에러 플래그가 없고**, **타임아웃 전**일 때만 표시.  
  - 문구: (ko) **"로봇이 전략 데이터를 계산 중입니다..."**, (en) **"Calculating strategy data..."**  
  - 스타일: 비강조 텍스트(예: `text-sm text-slate-500 dark:text-slate-400`), 로딩 스피너는 선택.

- **Error (실패)**  
  - 다음 중 **하나라도 해당**하면 **대기 문구 대신** 실패 UI를 렌더한다.  
    - **(1) 명시적 에러 전달**: 상위/데이터 계층에서 **`vrSnapshotError === true`** (또는 `vrSnapshotStatus === 'error'`) 를 넘기면 즉시 실패로 간주.  
    - **(2) 타임아웃**: `vrSnapshot`이 **일정 시간(예: 15초) 동안 계속 null** 이면 **생성 실패**로 간주.  
  - 실패 시 문구: (ko) **"전략 데이터 생성에 실패했거나 동기화 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."**, (en) **"Strategy data failed to load or sync error occurred. Please try again later."**  
  - 스타일: 경고 톤(예: `text-sm text-amber-600 dark:text-amber-400`), 필요 시 재시도 버튼은 별도 스펙.

- **구현 책임**  
  - **`VrPortfolioSummary`** 내부에서만 처리. Dashboard는 관여하지 않음.  
  - (1) props에 **`vrSnapshotError?: boolean`** (또는 `vrSnapshotStatus?: 'pending' | 'ready' | 'error'`) 추가 시, 에러 시 실패 UI 표시.  
  - (2) `vrSnapshot == null` 인 동안 **useEffect + setTimeout(예: 15_000)** 으로 타임아웃을 두고, 만료 시 실패 UI로 전환. 클린업 시 clearTimeout 필수.
- **인지 복잡도 절감**: Fallback 문구는 **이중 삼항 연산자** 대신 **함수 또는 매핑**으로 선택한다.  
  - 예: 컴포넌트 외부에 `getVrFallbackMessage(p: { isError: boolean; lang: 'ko' | 'en' }): string` 를 두고,  
    `if (vrSnapshot == null) { const message = getVrFallbackMessage({ isError: vrSnapshotError || pendingTimedOut, lang }); return <div className={...}>{message}</div>; }`  
  - JSX에서는 **단일 변수 `message`** 만 렌더하여 가독성을 유지한다.
- **계약**: `vrSnapshot`이 채워지면 즉시 실제 VR 요약·배지·버튼·N번 문구로 전환. 타임아웃 타이머는 clear하여 무한 Fallback이 발생하지 않도록 한다.

---

### 4.3 `Dashboard.tsx` 역할 축소 (Dumb Component화)

Dashboard는 **VR 여부 판별**과 **한 줄 마운트**만 수행한다. VR 전용 UI·모달 state·maxBuyStep 로직은 **전부 `VrPortfolioSummary`에만** 둔다.

#### 4.3.1 수정 범위 (최소화)

- **추가 로직**: 카드(또는 일별 매매 실행 블록 근처)에서 **단 한 가지** 판별만 수행.  
  - **`const isVrStrategy = !!portfolio.strategy.vrBand;`** (SSOT — 설정은 이 필드만 참조.)  
  - (기존 `isMultiSplitStrategy`, `isNoStopMultiSplitStrategy`와 동일한 패턴.)
- **렌더링**: `isVrStrategy === true` 일 때, **방대한 인라인 VR UI 코드를 두지 않고**, 아래 **한 줄만** 마운트한다.

```tsx
{isVrStrategy && (
  <VrPortfolioSummary
    vrSnapshot={portfolio.vrSnapshot}
    vrSettings={portfolio.strategy.vrBand!}
    lang={lang}
  />
)}
```

- **금지**: Dashboard(또는 PortfolioCard) 내부에 VR 요약 박스·VR 타입 배지·"예약 매수 N번까지" 문구·`VrOrderModal`·`useState(isModalOpen)`·`maxBuyStep` 계산 등을 **직접 작성하지 않는다.**

#### 4.3.2 데이터 소스 (변경 없음)

- VR 데이터는 여전히 **백엔드 스냅샷** (`portfolio.vrSnapshot`) 및 설정(**`portfolio.strategy.vrBand`** 단일 소스)만 사용.  
- Dashboard는 해당 값을 **자식에게 props로 넘기기만** 하고, **연산·가공하지 않는다.**

---

### 4.4 Daily Execution 블록 — VR 표기 (참조)

VR 타입 배지·수치·"N번까지 주문하세요" 문구의 **표기 규격**은 기존과 동일하다. **구현 위치만** `VrPortfolioSummary` 내부로 이전한다.

#### 4.4.0 VR 타입 배지 — 매핑 객체 + 전용 컴포넌트 `VrBadge.tsx` (인지 복잡도 제거)

JSX 내부에 `vrMode`별 다중 조건문·삼항 연산자를 하드코딩하는 **안티 패턴을 금지**한다. 대신 **매핑 객체**와 **전용 컴포넌트**로 일원화한다.

- **매핑 객체 (컴포넌트 외부)**  
  - `vrMode`를 키로 갖는 **설정 객체(Record)** 를 선언.  
  - 각 모드별 `textKo`, `textEn`, Tailwind `classes` 문자열을 매핑.  
  - 예: `const BADGE_CONFIG: Record<VrMode, { textKo: string; textEn: string; classes: string }> = { lump_sum: { ... }, accumulate: { ... }, withdraw: { ... } };`

- **전용 컴포넌트 `VrBadge.tsx`**  
  - **Props**: `mode: VrMode`, `lang: 'ko' | 'en'`.  
  - 렌더 함수 내부에는 **분기 없이** `const config = BADGE_CONFIG[mode];` 한 줄로 속성을 가져와 `<span className={config.classes}>{label}</span>` 렌더.  
  - 파일: `components/VrBadge.tsx`.

- **부모(`VrPortfolioSummary`)에서 호출**  
  - 배지가 필요한 위치(일별 매매 실행 블록 상단, "일별 매매 실행" 라벨 오른쪽)에서 **한 줄만** 사용.  
  - `vrSettings`는 `VrPortfolioSummary`의 props로 전달된 **`portfolio.strategy.vrBand`** (SSOT) 이다.

```tsx
// VrPortfolioSummary.tsx 내부 (배지가 필요한 위치)
<VrBadge mode={vrSettings.vrMode} lang={lang} />
```

- **VR 타입 배지 (표기 규격)**: 거치식(slate) / 적립식(emerald) / 인출식(amber), 다분할 배지와 동일 위치·`text-[9px] font-bold px-2 py-0.5 rounded-md` 패턴 — 위 `BADGE_CONFIG` 및 `VrBadge`로 구현.
- **수치**: currentV, pool, bandLow, bandHigh, deltaCash(적립/인출식일 때만). `vrSnapshot`·`vrSettings`에서만 읽음.
- **N 계산**: `VrPortfolioSummary` 내부 `useMemo`로 `maxBuyStep` 계산 후 문구에 삽입 (§4.1.3).

#### 4.4.1 dailyExecutionSummary.ts / 알람 블록 확장 (변경 없음)

- **`utils/dailyExecutionSummary.ts`**: `formatPortfolioDailyExecutionBlock`의 `options`에 VR용 인자 (`vrSnapshot`, `vrMode`, `vrMaxBuyStep`) 추가.  
  VR일 때 블록 문자열에 V, Pool, bandLow, bandHigh, deltaCash, "예약 매수는 표의 N번까지 주문하세요" 라인 추가.
- **`generate-daily-execution-summaries`**: VR 포트폴리오 시 스냅샷·vrMode·N을 조회/계산해 위 포맷터에 전달.

---

## 5. `utils/vrBandStrategy.ts` (계산 모듈) 및 매매 실행 로직

### 5.1 매매 실행 로직 가이드라인 (App.tsx 또는 Edge Function)

VR 전략에서 **매매가 발생할 때** 다음 흐름이 코드와 주석으로 명확히 드러나야 한다.  
(데이터 저장은 기존 `Portfolio.trades` + `portfolio.vrSnapshot` 덮어쓰기로 수행하며, 별도 테이블 없음.)

1. **매매 발생 전 — 잔액 기준 및 가드 (필수)**  
   - **진입 가드**: `portfolio.vrSnapshot`이 없으면 매매를 진행하지 않는다.  
     `if (!portfolio.vrSnapshot) return;` 또는 `throw new Error('[VR] Cannot execute trade: vrSnapshot is missing.');` 로 **early return/throw** 한다.  
     (`vrSnapshot?.pool ?? 0`으로 0을 쓰면 Pool SSOT가 깨지므로 **금지**.)
   - 가드 통과 후에만 증권사 API가 아닌 **`portfolio.vrSnapshot.pool`** 을 `currentPool`로 사용한다.

2. **잔액 계산**  
   - **단일 책임 산술 함수** `calculatePoolDelta(type, price, quantity, feeRate)` 를 사용한다.  
   - 매수: 비용이므로 **음수** 반환, 매도: 수령액이므로 **양수** 반환 (부호 포함 Pool 변동액).  
   - `newPool = currentPool + poolDelta` 한 식으로 통일하여, `trade.type` 분기를 **한 번도** 반복하지 않는다 (DRY).

3. **Trade Log 저장**  
   계산된 **`newPool`** 을 **`trade.metadata = { pool_after: newPool }`** 에 넣은 뒤, 기존 **`handleAddTrade(portfolioId, trade)`** 를 호출하여 **`Portfolio.trades`** 배열에 추가한다. 별도 체결 테이블은 만들지 않는다.

4. **Snapshot 업데이트**  
  **`newPool`**, 갱신된 **`shares`**, **`avgPrice`** 를 반영한 **`portfolio.vrSnapshot`** 객체를 DB에 **덮어쓰기(Update)** 한다.

  > **[중요 원칙: 사이클 고정 (재계산 금지)]**
  > 일반 매매 체결 시(`computeVrSnapshotAfterTrade`), `generateBuyOrders`, `generateSellOrders`, `calculateBands`, `calculateNextV` 등을 호출하여 **주문표나 V값, 밴드 수치를 절대 새로 계산하지 않는다.**
  > 체결 시점에는 오직 `pool`, `shares`, `avgPrice` 세 가지만 갱신하며, 나머지 `currentV`, `bandLow`, `bandHigh`, `buyOrders`, `sellOrders`는 무조건 이전 스냅샷(`prevSnapshot`)의 값을 그대로 복사(Spread)하여 이번 사이클 동안 고정해야 한다.

  > **[예외 원칙: 첫 매수 (First-Buy Exception)]**
  > 단, 전략 가동 후 최초로 주식을 매수하는 경우에는 임시 주문표를 폐기하고 실제 잔고 기준으로 전면 재계산해야 한다.

  ```typescript
  // [첫 매수 예외 조항] 이전 보유량이 0이었는데 체결 후 주식이 생겼다면 최초 매수로 간주
  if (prevSnapshot.shares === 0 && newShares > 0) {
      // 이때에 한해서만 예약 주문표(Grid)를 현재 잔고 기준으로 전면 재계산한다.
      const newBuyOrders = generateBuyOrders({ ...params, bandLow: prevSnapshot.bandLow, shares: newShares, pool: newPool });
      const newSellOrders = generateSellOrders({ ...params, bandHigh: prevSnapshot.bandHigh, pool: newPool, shares: newShares });
      return { ...prevSnapshot, pool: newPool, shares: newShares, avgPrice: newAvgPrice, buyOrders: newBuyOrders, sellOrders: newSellOrders };
  }
  ```

**헬퍼: `calculatePoolDelta` (순수 함수, 단일 책임 + Invariant Guard)**

매수/매도 타입과 가격·수량·수수료율을 받아 **Pool 변동액(부호 포함)** 을 반환한다. 매수 시 비용이므로 음수, 매도 시 수령액이므로 양수.

- **Fail-Fast (빠른 실패)**: 함수 최상단에 **Invariant Guard** 를 둔다. `price <= 0`, `quantity <= 0`, `feeRate < 0` 중 하나라도 만족하거나, **숫자가 아닌 값(NaN)** 이 들어오면 **즉시 예외**를 던져 가상 금고(Pool) 잔액 오염·연쇄 붕괴를 막는다.
- **통합 밸리데이터**: Guard는 **`validateFinancialArgs(args, rules, context)`** 한 번 호출로 수행. `args`의 모든 키에 대해 `rules`에 대응 규칙이 없으면 에러를 던지도록 런타임 체크한다.

구현 위치: `utils/vrBandStrategy.ts`.

```typescript
/** 통합 검증 규칙: 각 키별로 min(이상) 또는 strictPositive(초과 0) 적용. */
export type FinancialArgRule = { min?: number; strictPositive?: boolean };

export function validateFinancialArgs(
  args: Record<string, number>,
  rules: Record<string, FinancialArgRule>,
  context: string
): void {
  const prefix = `[VR_Math_Error] ${context}: `;
  for (const name of Object.keys(args)) {
    if (!(name in rules)) {
      throw new Error(`${prefix}Missing rule for "${name}". Every key in args must have a corresponding rule.`);
    }
  }
  for (const [name, value] of Object.entries(args)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${prefix}${name} must be a finite number. Received: ${JSON.stringify(args)}`);
    }
    const rule = rules[name];
    if (rule?.strictPositive && value <= 0) throw new Error(`${prefix}${name} must be positive. ...`);
    if (rule?.min !== undefined && value < rule.min) throw new Error(`${prefix}${name} must be >= ${rule.min}. ...`);
  }
}

export function calculatePoolDelta(
  type: 'buy' | 'sell',
  price: number,
  quantity: number,
  feeRate: number
): number {
  const args = { price, quantity, feeRate };
  validateFinancialArgs(args, {
    price: { strictPositive: true },
    quantity: { strictPositive: true },
    feeRate: { min: 0 },
  }, 'calculatePoolDelta');
  if (type === 'buy') return -(price * quantity * (1 + feeRate));
  return price * quantity * (1 - feeRate);
}
```

**예시 코드 (리팩터링 — DRY + 진입 가드)**

```typescript
// VR 전략 매매 체결 시 (App.tsx 또는 Edge Function 내)
async function handleVrTrade(
  portfolioId: string,
  portfolio: Portfolio,
  trade: Trade,
  feeRate: number
) {
  // 1) 진입 가드: vrSnapshot 없으면 매매 진행 불가 (Pool SSOT 준수)
  if (!portfolio.vrSnapshot) {
    return; // 또는 throw new Error('[VR] Cannot execute trade: vrSnapshot is missing.');
  }
  const currentPool = portfolio.vrSnapshot.pool;

  // 2) 잔액 계산 — 단일 책임 함수로 분기 제거
  const poolDelta = calculatePoolDelta(
    trade.type,
    trade.price,
    trade.quantity,
    feeRate
  );
  const newPool = currentPool + poolDelta;

  // 3) Trade Log 저장 — 기존 배열 재활용, metadata에 pool_after 주입
  const tradeWithMeta: Trade = {
    ...trade,
    metadata: { ...trade.metadata, pool_after: newPool },
  };
  await handleAddTrade(portfolioId, tradeWithMeta);

  // 4) Snapshot 업데이트 — newPool, shares, avgPrice 등 반영 후 DB Update
  const updatedSnapshot = computeVrSnapshotAfterTrade(portfolio.vrSnapshot, trade, newPool);
  await supabase.from('portfolios').update({ vr_snapshot: updatedSnapshot }).eq('id', portfolioId);
}
```

- **`computeVrSnapshotAfterTrade`** 는 기존 `vrSnapshot` + 방금 저장한 `trade` + `newPool`을 입력으로 받아, 갱신된 `pool`, `shares`, `avgPrice`, 필요 시 `currentV`/밴드/주문표를 계산해 새 `VrSnapshot` 객체를 반환하는 함수로 구현한다. (구현 위치: `utils/vrBandStrategy.ts` 또는 Edge Function 내부.)

---

### 5.2 계산 모듈 (vrBandStrategy.ts) 및 백엔드 사용처

- **문서**: `docs/VR_BAND_STRATEGY.md`의 공식 및 5.3/6.2 항 수식 준수.
- **실행 위치**  
  - **주 사용처: Supabase Edge Function(또는 동일 백엔드).**  
  - VR 스냅샷 갱신 시(사이클 시작, 거래 반영 등) Edge Function에서 이 모듈의 순수 함수를 호출해 `VrSnapshot`을 계산하고, DB에 `portfolio.vrSnapshot`으로 저장.  
  - **클라이언트 Dashboard/PortfolioCard 렌더 경로에서는 이 모듈을 호출하지 않는다.**  
  - (예외: Web Worker 또는 최상단 데이터 패칭 단에서 부득이 계산할 때만 클라이언트에서 사용.)
- **Pool/V 데이터 소스 (금지 사항)**  
  - **currentV, pool** 은 **DB에 저장된 `portfolio.vrSnapshot` 및 `portfolio.trades`(체결 이력)만** 기준으로 계산한다.  
  - **증권사 API에서 긁어온 계좌 예수금(holdings/현금)** 으로 Pool을 대체하거나, `calculateHoldings` 결과의 현금을 VR Pool로 사용하는 것은 **금지**이다. (§0.3 상태 격리)
- **최소 export**  
  - **`calculatePoolDelta(type, price, quantity, feeRate): number`** — 매수 시 음수·매도 시 양수(Pool 변동액). 매매 실행 로직에서 DRY용 (§5.1).  
  - `generateBuyOrders(params): OrderLevel[]`  
  - `generateSellOrders(params): OrderLevel[]`  
  - `calculateBands(v, bandRateUpper, bandRateLower): { bandLow: number; bandHigh: number }`  
  - `getVrPortfolioData(portfolio, ...): VrSnapshot | null`  
    - Edge Function에서 호출. **입력 pool/shares/avgPrice/currentV** 는 **portfolio.vrSnapshot** 또는 이전 스냅샷·trades 재계산 결과에서만 가져온다.
- **OrderLevel 생성 시**
  - Pool 한도 초과 분은 **버퍼 2개까지** `isBuffer: true`로 넣음 (문서 5.2 항).
  - **`sharesAfter`**: 해당 단계 체결 시 보유 주식 수 (필수). 매수는 누적 주수, 매도는 체결 후 잔량. Step 0은 현재 보유 주식 수.
  - **`poolAfter`**: 해당 단계 체결 직후의 Pool 잔액 (필수). Step 0은 현재 Pool 잔액.

---

## 6. 상수·i18n

- **constants.tsx (I18N) — VR 문구 단일 소스**  
  - VR 관련 문구는 **한 곳(constants.tsx 또는 팀 규약에 따른 vrMessages 모듈)** 에만 정의한다.  
  - 포함: `reservationOrderTable`, 모달 내 "상단 매도", "하단 매수", "가이드", "단계", "주문가", "수량", **VrPortfolioSummary Fallback/Pending·Error 문구**, **VrBadge 배지 텍스트(거치식/적립식/인출식)**.  
  - **규칙**: `VrOrderModal`, `VrPortfolioSummary`, `VrBadge`는 위 상수 모듈만 import하여 사용한다. 컴포넌트 내부에 ko/en 문자열을 인라인으로 두지 않는다 (DRY·일관성).

---

## 7. 작업 순서 제안

1. **타입**  
   - `types.ts`에 `Trade.metadata`, `OrderLevel`, `VrSnapshot`, **`VrBandStrategyBase`·Union·`getVrDeltaCashForNextV`(switch/never)**, `Strategy.vrBand`, **`Portfolio.vrSnapshot`** 추가. **`VrSettings`·`Portfolio.vrSettings` 삭제(SSOT).**
2. **계산 모듈**  
   - `utils/vrBandStrategy.ts` 구현 (generateBuyOrders, generateSellOrders, getVrPortfolioData 등).  
   - **Edge Function(또는 백엔드)** 에서 이 모듈을 호출해 스냅샷 계산·DB 저장 로직 추가.  
   - 포트폴리오 조회 시 `vrSnapshot`을 함께 반환하도록 API/DB 스키마 반영.
3. **VrOrderModal**  
   - `components/VrOrderModal.tsx` 생성, props·테이블·isBuffer 스타일 반영.
4. **VrPortfolioSummary**  
   - `components/VrPortfolioSummary.tsx` 신규 생성. VR 요약 박스·배지·버튼·모달 state·maxBuyStep(useMemo)·Fallback UI 담당 (§4.1, §4.2).
5. **Dashboard (PortfolioCard)**  
   - **역할 축소**: **`isVrStrategy = !!portfolio.strategy.vrBand`** 판별만 수행 (SSOT).  
   - VR일 때 `<VrPortfolioSummary vrSnapshot={...} vrSettings={...} lang={...} />` **한 줄만** 마운트. VR용 인라인 UI·모달 state·N 계산 **금지** (§4.3).
6. **상수/i18n**  
   - constants.tsx에 VR 관련 문구 추가.
7. **테스트**  
   - `portfolio.vrSnapshot`을 수동으로 넣은 목업 포트폴리오로 카드·모달 동작 확인.  
   - (선택) StrategyCreator에 VR 전략 추가는 별도 Phase로 진행.

---

## 8. 무한루프·effect 주의 (기존 문서 반영)

- **참조**: `docs/INFINITE_LOOP_REVIEW.md`, `docs/INFINITE_LOOP_FIX_SUMMARY.md`, `docs/USEFFECT_INFINITE_LOOP_AUDIT.md`
- **원칙**  
  - VR 관련해서 **카드 내부에서 비동기 연산·setState를 유발하는 useEffect를 추가하지 않는다.**  
  - 데이터는 **이미 `portfolio.vrSnapshot`으로 내려온 값**만 사용하므로, "VR 스냅샷 갱신"을 카드 effect에서 호출하는 패턴은 사용하지 않는다.
- **추가하는 상태**  
  - 모달 state(`isModalOpen`)는 **`VrPortfolioSummary` 내부**에서만 관리. Dashboard에는 VR용 모달 state를 두지 않음.  
  - `VrPortfolioSummary` 내부에서도 effect 의존성에 객체·인라인 콜백 남발 금지. `maxBuyStep`은 `useMemo`로만 계산.
- **콜백**  
  - VR 모달 open/close는 `VrPortfolioSummary` 내부 state setter만 사용. Dashboard에서 VR용 콜백을 `portfolios.map` 안에서 넘기는 패턴은 사용하지 않음.

이에 따라 **이번 VR UI 추가로 인한 무한루프·연쇄 리렌더 위험은 없도록** 설계한다.

---

## 9. 비범위 및 "별도 확장 필요" 정리

### 9.1 계획서에 이미 포함된 것 (예약주문 버튼·가격표·모달)

- **"예약 주문 가격표 보기" 버튼**: §4.4 — 일별 매매 실행 블록 아래, 전략 종료 버튼 위에 배치.
- **예약 주문 가격표**: §3 (Task A) — **`VrOrderModal`** 안에서 **탭(매도/매수)** 별로 테이블로 표시. 수치 정의는 **§3.5 예약 주문 가격표 수치 정리**에 정리됨 (step, price, qty, sharesAfter, poolAfter, isBuffer).
- **예약주문 버튼 클릭 시 나오는 모달**: §3, §4.5 — **`VrOrderModal.tsx`** 가 그 모달이다. props·탭 UI·테이블·가이드 배지까지 계획서에 명시됨.

즉, **"별도 확장 필요"는 예약주문 버튼·가격표·모달을 가리키지 않으며**, 이들은 본 계획서 범위에 포함된다.

### 9.2 비범위 (이번 계획서 기준)

- **StrategyCreator에 VR 전략 생성 플로우 추가**  
  - 본 계획서는 **카드 + 모달 + 계산 모듈 + 타입 + Daily Execution 표기**까지.  
  - VR 포트폴리오를 "새 포트폴리오"로 만드는 UI는 별도 계획으로 두는 것을 권장.
- **"별도 확장 필요"가 가리키는 것**  
  - **Daily Execution 블록의 텍스트/알람용 문자열** 확장:  
    VR일 때 "예약 매수는 표의 N번까지 주문하세요", V/Pool/밴드/deltaCash 등이 **텔레그램·알람 블록**에 들어가려면 **dailyExecutionSummary.ts** 및 **generate-daily-execution-summaries** Edge Function에서 VR 분기 추가가 필요하다.  
  - 이 확장 내용은 **§4.6.4**에 구현 방향(옵션 인자, N 계산)으로 정리되어 있으며, 실제 문자열 포맷·i18n은 해당 모듈 수정 시 반영하면 된다.
- **텔레그램/이미지 전송**  
  - 유료 사용자 예약 주문 가격표 전송은 별도 스펙·계획으로 다룸.

---

## 9.5 유지보수성·클린코드 리뷰 (비판)

역할: 구글/메타 스타일 시니어 리뷰어. **유지보수성·클린코드** 관점에서 계획서·구현을 엄격히 비판한다. 칭찬 생략.

### 발견된 문제점 리스트 (중요도 순)

1. **Error/Edge — handleVrTrade 시 vrSnapshot null 미처리 (치명)**  
   - §5.1에서 "`portfolio.vrSnapshot.pool`을 가져와서 시작"이라고 했지만, **vrSnapshot이 null인 경우**에 대한 가드가 계획·코드 모두에 없다.  
   - `portfolio.vrSnapshot?.pool ?? 0`으로 0을 쓰면, VR 규칙(잔액은 vrSnapshot.pool 기준)과 모순된다. 스냅샷 없이 매매를 허용하면 Pool SSOT가 깨진다.  
   - **요구**: 매매 실행 진입 시 `if (!portfolio.vrSnapshot) return;` 또는 throw/early return으로 **vrSnapshot 없으면 매매 진행 불가**로 명시.

2. **Dead Code — `renderTable(orders, isSell)`의 `isSell` 미사용**  
   - `VrOrderModal.tsx`에서 `renderTable(orders: OrderLevel[], isSell: boolean)`의 **`isSell`이 함수 내부에서 전혀 사용되지 않음**.  
   - Dead parameter 제거: 시그니처를 `renderTable(orders: OrderLevel[])`로 바꾸고 호출부에서 두 번째 인자 제거.

3. **DRY 위반 — VR 관련 i18n 분산**  
   - `VrOrderModal`의 `LABELS`, `VrPortfolioSummary`의 Pending/Error 문구(인라인 ko/en), `VrBadge`의 `BADGE_CONFIG`가 **각 컴포넌트에 흩어져 있음**.  
   - §6에서 "constants.tsx에 VR 관련 문구 추가"만 있고, **"모달·요약·배지 문구는 constants에서만 참조"**라는 규칙이 없어 중복·불일치 위험이 있다.  
   - **요구**: VR 문구를 **한 곳(예: constants.tsx 또는 vrMessages.ts)** 에 모으고, 컴포넌트는 해당 모듈만 import하도록 계획에 명시.

4. **DRY 위반 — calculatePoolDelta Guard 메시지 반복**  
   - `utils/vrBandStrategy.ts`의 Invariant Guard가 **동일한 메시지 포맷**을 6번 반복한다.  
   - 필드명(price/quantity/feeRate)과 조건(유한수/양수/비음수)만 바뀌는 패턴이므로, **헬퍼 하나**(예: `assertFinitePositive(value, name, context)`)로 묶어 반복 제거.

5. **Cognitive Complexity — Fallback UI 이중 삼항**  
   - `VrPortfolioSummary`의 `vrSnapshot == null` 분기에서  
     `isError ? (lang === 'ko' ? '...' : '...') : (lang === 'ko' ? '...' : '...')`  
     형태로 **이중 삼항**이 사용되면 가독성이 떨어진다.  
   - **개선**: 메시지 선택을 **함수 또는 매핑 객체**로 분리해 한 번만 선택한 뒤, JSX에서는 단일 변수만 렌더. (예: `const message = getFallbackMessage({ isError, lang });`)

6. **Anti-pattern — renderTable을 컴포넌트 본문에 정의**  
   - `renderTable`이 **함수 컴포넌트 본문 안**에 정의되어 매 렌더마다 새 함수가 생성된다.  
   - 테이블만 쓰는 경우엔 큰 문제는 아니지만, **테이블을 자식 컴포넌트로 분리**하면 테스트·가독성·재사용에 유리하다.  
   - **권장**: `VrOrderTable({ orders, lang }: { orders: OrderLevel[]; lang: 'ko'|'en' })` 같은 전용 컴포넌트로 추출하고, `VrOrderModal`은 탭·레이아웃만 담당.

7. **Anti-pattern — 테이블 행 key로 배열 인덱스 사용**  
   - `orders.map((order, idx) => (... <tr key={idx}> ...))`  
   - 리스트가 정렬·필터되거나 항목이 바뀌면 **key 불안정**으로 불필요한 리렌더·버그 가능성이 있다.  
   - **권장**: `key={order.step}` 또는 `key={`${order.step}-${order.price}`}` 등 **안정적 식별자** 사용. (step이 유일하면 step만 사용.)

8. **Edge — 주문표 숫자 필드의 방어 코드 부재**  
   - `OrderLevel`의 숫자 필드(sharesAfter, poolAfter 등)는 타입상 `number`이지만, **레거시/외부 데이터**에서 undefined가 올 수 있다면 `.toFixed(2)`에서 런타임 예외가 난다.  
   - **권장**: 표시 시 `Number(value ?? 0).toFixed(2)` 또는 유한수 체크 후 toFixed 적용.

9. **계획서·구현 불일치 — prop 이름 vrBand vs vrSettings**  
   - 계획서 §4.1.1·§4.3.1에서는 **`vrBand`** 로 기재되어 있으나, 실제 코드는 **`vrSettings`** (타입 `VrBandStrategyParams`)를 사용한다.  
   - SSOT와 일관성을 위해 **계획서와 코드 중 한쪽으로 통일**할 것. (권장: 계획서를 `vrSettings`로 맞추거나, 코드를 `vrBand`로 리네이밍.)

10. **Dead / 불명확 — VrPortfolioData 타입 별칭**  
    - 계획서 §2.2에 `export type VrPortfolioData = VrSnapshot;` 로 되어 있음.  
    - 코드베이스에서 **VrPortfolioData**를 import해 쓰는 곳이 없으면 **Dead 타입**이다.  
    - **결정 필요**: 실제로 사용할 계획이면 export·문서화하고, 없으면 계획서에서 제거해 **VrSnapshot만** 사용하도록 정리.

11. **SRP — VrPortfolioSummary 책임 과다**  
    - 한 컴포넌트가 **요약 박스·배지·maxBuyStep 계산·Fallback/Error UI·모달 state·VrOrderModal**까지 모두 담당한다.  
    - 유지보수 시 변경 영향 범위가 커진다. **선택적 개선**:  
      - "데이터 있을 때만 보이는 내용"을 `VrSummaryContent`로 분리하고,  
      - "Pending/Error"를 `VrSnapshotFallback`으로 분리한 뒤,  
      - `VrPortfolioSummary`는 **조건 분기 + 두 블록 조합**만 담당하도록 쪼개는 것을 계획에 옵션으로 명시.

12. **계획서 §3.5와 구현 차이 — sharesAfter / poolAfter 열 미구현**  
    - 계획서 §3.5에는 주문표에 **sharesAfter, poolAfter** 열이 명시되어 있으나, 현재 `VrOrderModal` 테이블에는 **step, price, qty** 중심으로만 구현되어 있다.  
    - **결정 필요**: 스펙을 현재 구현에 맞춰 열 목록을 수정할지, 아니면 sharesAfter/poolAfter 열을 추가 구현할지 명시. (본 문서에서는 sharesAfter/poolAfter를 필수 열로 승격함.)

---

### 리팩토링 반영 위치 (계획서 본문에 반영 완료)

- **1·4** → **§5.1**: handleVrTrade 진입 시 vrSnapshot 가드 명시; calculatePoolDelta Guard는 assertFiniteNumber/assertPositive/assertNonNegative 헬퍼로 DRY 반영.
- **2·6·7·8** → **§3·§3.5**: renderTable 시그니처 `(orders)` 만, 행 key 안정 식별자, 숫자 필드 방어 표시(sharesAfter/poolAfter 등), (권장) VrOrderTable 분리.
- **3** → **§6**: VR i18n 단일 소스 규칙 및 "모달·요약·배지 문구는 constants에서만 참조" 명시.
- **5** → **§4.2**: Fallback 메시지 `getVrFallbackMessage` 사용으로 인지 복잡도 절감 명시.
- **9** → **§4.1.1**: prop 이름 vrBand/vrSettings 팀 규약에 따라 통일한다고 명시.
- **10** → **§2.2**: VrPortfolioData 제거·VrSnapshot만 사용하도록 정리.
- **11** → **§4.1.6**: (선택) VrSummaryContent / VrSnapshotFallback 분리 옵션 추가.
- **12** → **§3·§3.5**: sharesAfter/poolAfter 열을 선택 구현으로 명시, 필수 열과 구분.

위 반영으로 유지보수성·에지 케이스·인지 복잡도·안티패턴 개선이 계획서 각 항목에 녹아 있다. 체크리스트 "§9.5 리뷰 반영"으로 완료 여부 추적.

### 코드 품질 최종 리팩토링 (시니어 리뷰어 지적 반영)

- **types.ts**
  - **`AppLang`** 타입을 전역으로 선언(`export type AppLang = 'ko' | 'en'`). 모든 컴포넌트의 **lang props**는 이 타입으로 통일한다.
  - **Trade.metadata**: `any` 사용 금지. **`[key: string]: unknown`** 으로 엄격히 관리한다.
- **VrOrderModal.tsx**
  - **TABLE_CONFIG** 매핑 객체에는 **테마(색상·라벨 키)** 만 둔다. `getOrders` 등 실행 로직은 포함하지 않는다. 데이터 선택(sell/buy)은 **컴포넌트 본문**에서 `activeTab === 'sell' ? sellOrders : buyOrders` 로 직접 수행한다.
  - 테이블 헤더는 **`['step', 'price', 'qty', 'sharesAfter', 'poolAfter']`** 배열로 선언하고 **map**으로 렌더하여 중복을 제거한다.
- **vrBandStrategy.ts**
  - **calculatePoolDelta**의 가드 로직은 **assert 유틸(assertPoolDeltaArg)** 또는 **선언적 검사 배열 + forEach**로 압축하여 가독성을 유지한다.
  - **toDisplayNumber**: 유효하지 않은 숫자 유입 시 **fallback 반환 전에 `console.error`** 를 남겨 버그 추적이 가능하도록 한다.
- **VrPortfolioSummary.tsx**
  - **실효성 없는 useMemo** 제거. maxBuyStep 같은 단순 연산은 **렌더 시점에 직접** `calculateMaxBuyStep(vrSnapshot.buyOrders)` 로 수행하여 코드를 평탄하게 유지한다.

---

## 11. 클린 코드 및 리팩토링 확정 내역 (문서화 부채 청산)
실제 코드 구현 단계에서 시스템 유지보수성 및 프로덕션 수준의 안정성을 위해 다음의 아키텍처 원칙이 적용 및 확정되었다. 이 원칙들은 향후 코드 수정 시에도 반드시 유지되어야 한다.

### 11.1 금융 계산 유틸리티 강제화 (DRY & Precision)
- **위치:** `utils/vrBandStrategy.ts`
- **내용:** 부동 소수점 오차 방지를 위한 `toFixedMoney` 함수(`Number.EPSILON` 적용)와, 적립/인출식에 따른 부호 강제 정규화 함수 `getSanitizedDeltaCash`를 구현하여 모든 계산 파이프라인에서 공통으로 사용한다. 중복된 라운딩 로직(`roundPrice2` 등)은 폐기 및 금지한다.

### 11.2 UI 렌더링 책임 분리 (SRP 준수)
- **위치:** `components/VrOrderModal.tsx`
- **내용:** `VrOrderModal` 모달 컴포넌트는 레이아웃과 포탈 렌더링만 담당한다. 복잡한 데이터 테이블 렌더링 로직은 `VrOrderTable`이라는 별도의 독립된 컴포넌트로 완전히 추출하여 인지 복잡도를 낮추고 재사용성을 확보했다. 가격 표시 셀 또한 `PriceCell`로 분리하여 관리한다.

### 11.3 화이트 스크린 방어 및 접근성 표준화 (UX/A11y)
- **위치:** `components/VrPortfolioSummary.tsx`
- **내용:**
  1. **Guard Clause (조기 리턴):** `vrSnapshot` 데이터가 없을 경우 컴포넌트가 크래시되는 것을 막기 위해 최상단에 조기 리턴(Early Return)을 적용하여 Pending 상태 텍스트만 안전하게 표시한다.
  2. **접근성(A11y):** 최상위 컨테이너에 시각장애인용 스크린 리더를 위한 `role="region"` 속성과 다국어 지원 `aria-label` 속성을 강제 적용하여 웹 접근성 표준을 준수한다.

---

## 10. 체크리스트 (구현 완료 시)

- [ ] `types.ts`: **`Trade.metadata`**, `OrderLevel`, `VrSnapshot`, **`VrBandStrategyBase`(필수만)·`VrBandAccumulate`·`VrBandWithdraw`·`VrBandLumpSum`·`VrBandStrategyParams`**, **`getVrDeltaCashForNextV`(switch/never)**, `Strategy.vrBand`, **`Portfolio.vrSnapshot`** 반영. **`VrSettings`·`Portfolio.vrSettings` 삭제(SSOT)** (§0.3, §2.3)
- [ ] `utils/vrBandStrategy.ts`: **`calculateBands(v, bandRateUpper, bandRateLower)`** 비대칭 밴드, generateBuyOrders, generateSellOrders, getVrPortfolioData(파라미터는 Discriminated Union + getVrDeltaCashForNextV), 버퍼 2개 isBuffer 처리 (Edge Function에서 사용)
- [ ] **백엔드**: VR 스냅샷 계산·DB 저장·조회 시 `vrSnapshot` 포함; **매매 체결 시 §5.1 흐름**(vrSnapshot.pool 기준 → newPool → trade.metadata.pool_after → vrSnapshot 덮어쓰기) 구현 (Edge Function + DB 스키마/API)
- [ ] `components/VrOrderModal.tsx`: 생성, **탭(Tab) 기반** (매도/매수 탭), isBuffer 회색+가이드 배지
- [ ] `components/VrBadge.tsx`: **매핑 객체** `BADGE_CONFIG` + `<VrBadge mode={vrMode} lang={lang} />`, 조건 분기 없이 `config = BADGE_CONFIG[mode]` 한 줄로 렌더 (§4.4.0)
- [ ] `components/VrPortfolioSummary.tsx`: 신규 생성, **Props** vrSnapshot/**vrSettings**(`VrBandStrategyParams`, SSOT)/lang, **내부** isModalOpen state·maxBuyStep·Fallback UI, VR 요약·**`<VrBadge />`**·버튼·VrOrderModal (§4.1, §4.2)
- [ ] `Dashboard.tsx`: **역할 축소** — isVrStrategy 판별 후 `<VrPortfolioSummary ... />` **한 줄만** 마운트. VR 인라인 UI·모달 state·maxBuyStep 계산 없음 (§4.3)
- [ ] constants.tsx: VR 관련 문구 (배지: 거치식/적립식/인출식, daily execution 문구)
- [ ] `utils/dailyExecutionSummary.ts`: VR 분기 및 options 확장 (§4.6.4), VR 블록 문자열 포맷
- [ ] `generate-daily-execution-summaries`: VR 포트폴리오 시 스냅샷·N 전달 (§4.6.4)
- [ ] (선택) 토스 미니앱에서 카드/모달 레이아웃 확인
- [ ] (선택) 무한루프 문서 패턴 준수: VR 관련 effect/객체 의존/인라인 콜백 미사용 확인
- [ ] **§9.5 유지보수성·클린코드 리뷰 반영**: handleVrTrade vrSnapshot 가드, Dead 파라미터/타입 정리, i18n·Guard DRY, Fallback 메시지·key·방어 코드·prop 이름 통일·VrPortfolioData 정리·(선택) SRP 분리·sharesAfter/poolAfter 스펙 결정
- [ ] **§9.5 코드 품질 최종 리팩토링**: AppLang 전역·lang props 통일, metadata `[key: string]: unknown`, TABLE_CONFIG 테마만·데이터 선택 본문·헤더 배열 map, calculatePoolDelta assert 압축·toDisplayNumber console.error, VrPortfolioSummary useMemo 제거

이 계획서 검토 후 진행 여부를 알려주시면, 다음 단계에서 위 순서대로 구체 코드 단위로 구현할 수 있다.
