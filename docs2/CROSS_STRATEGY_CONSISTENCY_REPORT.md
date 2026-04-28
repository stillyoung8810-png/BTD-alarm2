# 전 전략 일관성 감사 리포트

작성일: 2026-04-27

## 감사 목적

`docs2/SMART_SPLIT_OPTIMIZATION_REPORT.md`와 이후 스마트 스플릿 최적화에서 확인한 5개 핵심 포인트가 다른 전략에도 일관되게 적용되어 있는지 확인했습니다.

이번 문서는 **Dry Run 전용 리포트**입니다. 프로덕션 코드는 수정하지 않았습니다.

## 감사 대상

- 스마트 스플릿: `multiSplit`
- 이평선 구간 전략: `rsi_ma_interval` / MA
- 타겟 밸류 채널: `vrBand` / TVC
- 무손절 다분할: `noStopMultiSplit`

## 5대 체크포인트

1. 거래 날짜순 정렬
2. 저예산 처리
3. 첫 매수 데드락 방지
4. Fetch 안정화 및 `lang` 의존성 분리
5. 금융 계산 방어

---

## 전체 요약

| 전략 | 날짜순 정렬 | 저예산 처리 | 첫 매수 | Fetch/lang | 금융 guard | 우선순위 |
|---|---|---|---|---|---|---|
| Smart Split | 충족 | 충족 | 충족 | 충족 | 충족 | 기준선 |
| MA | SPA 충족 / Edge 미흡 | 충족 | 충족 | 부분 미흡 | 부분 충족 | 중간 |
| TVC/VR | 스냅샷 이벤트 순서 의존 | 부분 충족 | 충족 | 충족 | 충족 | 낮음~중간 |
| No-Stop | 미흡 | 부분 충족 | 충족 | 충족 | 신규 경로 충족 / 레거시 약함 | 높음 |

가장 먼저 볼 항목은 **No-Stop의 거래 날짜순 정렬**과 **Edge MA 보유 계산 정렬**입니다. 두 경로 모두 저장 배열이 최신순이면 보유/평단이 달라질 수 있습니다.

---

## 기준선: Smart Split

### 문제 여부

현재 Smart Split은 5개 체크포인트가 대부분 기준선 수준으로 반영되어 있습니다.

### 현재 코드 스니펫

거래 날짜순 정렬:

```ts
export function getChronologicalTrades(trades: TradeInput[]): TradeInput[] {
  return trades
    .map((trade, index) => ({ trade, index }))
    .sort((left, right) => {
      const dateOrder = left.trade.date.localeCompare(right.trade.date);
      if (dateOrder !== 0) {
        return dateOrder;
      }

      return left.index - right.index;
    })
    .map(({ trade }) => trade);
}
```

저예산/첫 매수/data error 분기:

```ts
const isFirstBuy = currentQuantity <= HOLDINGS_QTY_EPSILON;
const isDataError =
  currentQuantity > HOLDINGS_QTY_EPSILON && avgPrice <= MIN_VALID_UNIT_COST;
const isSeedExhausted = totalInvested >= totalSeed;
const isLowBudget =
  remainingBudget > HOLDINGS_QTY_EPSILON && remainingBudget < args.oneTimeAmount;

if (isFirstBuy || isDataError || isSeedExhausted || isLowBudget) {
  return baseState;
}
```

Fetch 안정화:

```ts
const networkErrorMsg = APP_SHELL_MESSAGES[lang].dailySummaryNetworkError;
const networkErrorMsgRef = useRef(networkErrorMsg);

useLayoutEffect(() => {
  networkErrorMsgRef.current = networkErrorMsg;
}, [networkErrorMsg]);

useEffect(() => {
  // fetch deps에는 lang이 없고, toast만 ref를 통해 최신 문구를 사용
}, [
  fetchIndicatorRequirements,
  hasMultiSplitStrategy,
  indicatorCacheKey,
  isDailyBuyAmountValid,
  targetStock,
]);
```

### 다른 전략에 이식할 패턴

```ts
const chronologicalTrades = getChronologicalTrades(trades);
const holding = findTargetHolding(chronologicalTrades, targetStock);

const isFirstBuy = currentQuantity <= HOLDINGS_QTY_EPSILON;
const isDataError =
  currentQuantity > HOLDINGS_QTY_EPSILON && avgPrice <= MIN_VALID_UNIT_COST;
const isLowBudget =
  remainingBudget > HOLDINGS_QTY_EPSILON && remainingBudget < oneTimeAmount;
```

---

## 1. 이평선 구간 전략(MA)

### 체크포인트별 문제 여부

| 체크포인트 | 판단 |
|---|---|
| 거래 날짜순 정렬 | **부분 문제**. 클라이언트 보유 계산은 정렬하지만 Edge 요약 내부 `calculateHoldings`는 정렬하지 않습니다. |
| 저예산 처리 | **충족**. Quick Input의 예산 기반 수량 계산이 0주를 검출하고 안내합니다. |
| 첫 매수 데드락 | **충족**. 중간 익절 라인은 보유/평단/현재가가 없으면 생략합니다. |
| Fetch/lang | **부분 문제**. `lang` 직접 의존은 피하지만, MA 분석 실패 시 ready gate가 해제되지 않을 수 있습니다. |
| 금융 guard | **부분 충족**. 주요 나눗셈 전 지역 guard는 있으나 중앙 `validateFinancialArgs` 수준까지 통일되지는 않았습니다. |

### 1-1. 거래 날짜순 정렬

#### 현재 코드 스니펫

클라이언트 보유 계산은 날짜순 정렬을 적용합니다.

```ts
function getChronologicalTrades(trades: Trade[]): Trade[] {
  return [...trades]
    .reverse()
    .sort((left, right) => left.date.localeCompare(right.date));
}

export const calculateHoldingsFromTrades = (trades: Trade[]): Holdings[] => {
  const chronologicalTrades = getChronologicalTrades(trades);
  // ...
};
```

하지만 Edge 요약의 내부 보유 계산은 `portfolio.trades`를 그대로 순회합니다.

```ts
function calculateHoldings(portfolio: Portfolio): Holdings[] {
  const holdingsMap: Record<string, { quantity: number; totalCost: number }> = {};

  portfolio.trades.forEach((trade) => {
    if (trade.type === "buy") {
      // ...
    } else if (trade.type === "sell") {
      // ...
    }
  });
}
```

#### 문제 설명

클라이언트와 Edge가 서로 다른 정렬 규칙을 사용합니다. 신규 거래가 배열 앞에 붙는 저장 구조에서는 Edge 일별 요약의 보유/평단이 클라이언트와 어긋날 수 있습니다.

#### 수정 제안 스니펫

```ts
function getChronologicalPortfolioTrades(trades: Trade[]): Trade[] {
  return trades
    .map((trade, index) => ({ trade, index }))
    .sort((left, right) => {
      const dateOrder = left.trade.date.localeCompare(right.trade.date);
      return dateOrder !== 0 ? dateOrder : left.index - right.index;
    })
    .map(({ trade }) => trade);
}

function calculateHoldings(portfolio: Portfolio): Holdings[] {
  const chronologicalTrades = getChronologicalPortfolioTrades(portfolio.trades);
  // chronologicalTrades.forEach(...)
}
```

### 1-2. 저예산 처리

#### 현재 코드 스니펫

```ts
export function calculateBudgetBuyQuantity(input: BudgetQuantityInput): number {
  if (!areStrictPositiveFiniteScalars(input.price, input.dailyBuyAmount)) {
    return ZERO_AMOUNT;
  }

  const theoreticalQuantity = floorToNonNegativeInt(
    normalizedBudget / (input.price * unitCostMultiplier),
  );

  let quantity = theoreticalQuantity;
  while (quantity > 0) {
    // 수수료 포함 정산액이 예산 이하면 해당 수량 반환
    if (preview.totalSettlement <= normalizedBudget) {
      return quantity;
    }
    quantity -= 1;
  }

  return ZERO_AMOUNT;
}
```

```ts
} else if (tradeType === 'buy' && !isVrStrategy && resolvedQuantity === 0) {
  validationMessage = copy.helper.zeroQuantityBudgetLocked;
}
```

#### 판단

스마트 스플릿의 `isLowBudget`과는 형태가 다르지만, MA는 사용자가 직접 빠른 입력에서 매수 금액을 주는 구조라 “계산 수량 0이면 저장 차단/안내”가 자연스러운 변형입니다. 추가 수정 우선순위는 낮습니다.

### 1-3. 첫 매수 데드락

#### 현재 코드 스니펫

```ts
const holding = holdings.find((item) => item.stock === config.stock);
if (holding == null || holding.quantity <= 0 || holding.avgPrice <= 0) {
  return null;
}

const currentPrice = prices[config.stock]?.price ?? 0;
if (currentPrice <= 0) {
  return null;
}

const yieldPct = ((currentPrice - holding.avgPrice) / holding.avgPrice) * 100;
```

#### 판단

보유가 없으면 중간 익절 라인을 만들지 않아 0분모 계산을 피합니다. Smart Split의 `firstBuyGuide`처럼 적극적인 안내 라인을 추가할 수는 있으나, MA 전략의 기본 UI 흐름상 필수 수정은 아닙니다.

### 1-4. Fetch 안정화

#### 현재 코드 스니펫

```ts
useLayoutEffect(() => {
  copyRef.current = copy;
}, [copy]);

useEffect(() => {
  // ...
  try {
    const inputs = await loadMaAnalysisInputs(maAnalysisVm, {
      signal: abortController.signal,
    });
    // 성공 시 setIsMaAnalysisReady(true)
  } catch (error: unknown) {
    if (isAbortLikeError(error) || !isMounted) {
      return;
    }

    console.error('[Dashboard] Failed to load MA analysis inputs:', error);
    showErrorToast(copyRef.current.systemError);
  }
}, [isMultiSplitStrategy, isNoStopMultiSplitStrategy, isVrStrategy, maAnalysisVm]);
```

#### 문제 설명

`lang` 자체를 fetch effect dependency에 직접 넣지 않는 점은 좋습니다. 다만 실패 경로에서 `setIsMaAnalysisReady(true)` 또는 별도 error 상태로 전환하지 않아, 알람용 daily execution block 생성 gate가 계속 닫힐 수 있습니다.

#### 수정 제안 스니펫

```ts
} catch (error: unknown) {
  if (isAbortLikeError(error) || !isMounted) {
    return;
  }

  console.error('[Dashboard] Failed to load MA analysis inputs:', error);
  showErrorToast(copyRef.current.systemError);
  setMaPartialProfitLines([]);
  setMaRsiNotMet(false);
  setMaAlignmentNotMet(false);
  setIsMaAnalysisReady(true);
}
```

### 1-5. 금융 계산 guard

#### 판단

`areStrictPositiveFiniteScalars` 등 지역 guard가 많아 즉시 위험한 0분모는 대부분 막고 있습니다. 다만 Edge 내부 MA 계산(`calculateHoldings`, `calculateMA`, `calculateRSI`)은 중앙 검증 함수와 스타일이 다릅니다. 우선순위는 날짜순 정렬보다 낮습니다.

---

## 2. 타겟 밸류 채널(TVC / VR Band)

### 체크포인트별 문제 여부

| 체크포인트 | 판단 |
|---|---|
| 거래 날짜순 정렬 | **제품 정책 확인 필요**. TVC는 거래 배열 재계산보다 `vrSnapshot` 이벤트 상태를 신뢰합니다. |
| 저예산 처리 | **부분 충족**. `pool <= 0`이면 주문표를 비우고, UI는 `noOrder`를 표시합니다. “저예산” 전용 문구는 없습니다. |
| 첫 매수 데드락 | **충족**. 0주일 때 `minOrderQty` 기반으로 주문표를 생성합니다. |
| Fetch/lang | **충족**. VR 핵심 경로는 MA/Smart Split처럼 별도 indicator fetch를 타지 않습니다. |
| 금융 guard | **충족**. `validateFinancialArgs`, `price <= 0` loop break, Pool/fee guard가 적용되어 있습니다. |

### 2-1. 거래 날짜순 정렬

#### 현재 코드 스니펫

```ts
const nextPortfolio: Portfolio = {
  ...portfolio,
  trades: [nextTrade, ...portfolio.trades],
  vrSnapshot: nextVrSnapshot ?? portfolio.vrSnapshot,
};
```

#### 문제 설명

TVC는 장부를 매번 전체 거래 날짜순으로 재계산하는 구조가 아니라, 체결 이벤트마다 `vrSnapshot`을 갱신하는 이벤트 소싱형 구조입니다. 따라서 “거래 날짜순 정렬”은 단순히 `calcHoldings` 앞에 넣을 문제가 아닙니다.

리스크는 사용자가 과거 날짜 거래를 입력하거나 거래 삭제/수정이 생길 때 `trades`와 `vrSnapshot`이 서로 다른 시간축을 가질 수 있다는 점입니다.

#### 수정 제안 스니펫

두 가지 중 하나로 제품 정책을 명시해야 합니다.

옵션 A: TVC는 입력 순서 기준 이벤트 상태를 신뢰합니다.

```ts
// 정책: VR 스냅샷은 입력/저장 순서의 이벤트 결과이며,
// 과거 날짜 거래를 삽입해도 자동 리플레이하지 않는다.
// UI에서는 과거 날짜 입력 시 경고/차단을 검토한다.
```

옵션 B: 거래 날짜 기준 리플레이로 스냅샷을 재생성합니다.

```ts
function rebuildVrSnapshotFromTrades(args: {
  trades: Trade[];
  params: VrBandStrategyParams;
  initialSnapshot: VrSnapshot;
}): VrSnapshot {
  return getChronologicalTrades(args.trades).reduce(
    (snapshot, trade) =>
      computeVrSnapshotAfterTrade({
        previousSnapshot: snapshot,
        trade,
        params: args.params,
      }),
    args.initialSnapshot,
  );
}
```

### 2-2. 저예산 처리

#### 현재 코드 스니펫

```ts
export function generateBuyOrders({
  shares,
  pool,
  bandLow,
  minOrderQty,
  feeRate,
  poolUsageRateBuy,
}: GenerateBuyOrdersParams): OrderLevel[] {
  validateFinancialArgs(
    { shares, pool, bandLow, minOrderQty, feeRate, poolUsageRateBuy },
    {
      shares: { min: 0 },
      pool: { min: 0 },
      bandLow: { strictPositive: true },
      minOrderQty: { strictPositive: true },
      feeRate: { min: 0 },
      poolUsageRateBuy: { strictPositive: true },
    },
    'generateBuyOrders'
  );

  if (pool <= 0) return [];
}
```

#### 판단

TVC에서 “저예산”은 Smart Split의 `remainingBudget < oneTimeAmount`와 다릅니다. TVC는 Pool 기반 전략이므로 `pool <= 0`, 혹은 `pool * poolUsageRateBuy`로 1개 주문도 만들 수 없는 상황을 “주문 없음”으로 처리하는 것이 자연스럽습니다.

#### 수정 제안 스니펫

```ts
const maxBuyBudget = toFixedMoney(pool * poolUsageRateBuy);
const isLowPoolBudget =
  pool > 0 && maxBuyBudget < minOrderQty * minimumValidBuyPrice * (1 + feeRate);

if (isLowPoolBudget) {
  return {
    buyOrders: [],
    notice: messages.lowPoolBudget,
  };
}
```

### 2-3. 첫 매수 데드락

#### 현재 코드 스니펫

```ts
const isFirstBuy = type === 'buy' && prevShares <= 0 && shares > 0;

if (isFirstBuy) {
  nextBuyOrders = generateBuyOrders({
    shares,
    pool: newPool,
    bandLow: prev.bandLow,
    minOrderQty: params.minOrderQty,
    feeRate: params.feeRate,
    poolUsageRateBuy: params.poolUsageRateBuy,
  });
}
```

```ts
const effectiveShares =
  shares === 0 ? k * minOrderQty : shares + (k - 1) * minOrderQty;

const targetPrice = bandLow / effectiveShares;
if (!areStrictPositiveFiniteScalars(targetPrice)) break;

const price = toFixedMoney(targetPrice);
if (price <= 0) break;
```

#### 판단

TVC는 첫 매수/0주 데드락 방어가 가장 잘 되어 있는 전략입니다. `shares === 0` 분기가 있고, 가격 0 이하 루프 차단도 있습니다.

### 2-4. Fetch 안정화

#### 판단

VR/TVC 핵심 계산은 별도 indicator fetch가 아니라 저장된 `vrSnapshot`과 예약 주문표를 사용합니다. `Dashboard`의 MA fetch effect는 VR 전략이면 즉시 return하므로 `lang` 변경으로 네트워크가 재시작되는 구조는 발견하지 못했습니다.

### 2-5. 금융 계산 guard

#### 현재 코드 스니펫

```ts
validateFinancialArgs(
  {
    currentV,
    pool,
    baseGrowthRatePct: params.baseGrowthRatePct,
    smartBrakeThresholdPct: params.smartBrakeThresholdPct,
    deltaCash,
  },
  {
    currentV: { strictPositive: true },
    pool: { min: 0 },
    baseGrowthRatePct: { strictPositive: true },
    smartBrakeThresholdPct: { strictPositive: true },
    deltaCash: {},
  },
  'calculateNextV'
);
```

#### 판단

TVC는 중앙 guard 적용 수준이 좋습니다. 다만 `utils/vrBandStrategy.ts`와 `supabase/functions/_shared/vrBandStrategy.ts` 복제본이 계속 동기화되어야 한다는 운영 리스크는 남아 있습니다.

---

## 3. 무손절 다분할(No-Stop Multi-Split)

### 체크포인트별 문제 여부

| 체크포인트 | 판단 |
|---|---|
| 거래 날짜순 정렬 | **문제 있음**. `calcHoldings(trades)`를 입력 순서 그대로 사용합니다. |
| 저예산 처리 | **부분 충족**. 0수량 표시와 실행용 분리는 있으나 “매수금 부족” 상태/문구는 없습니다. |
| 첫 매수 데드락 | **충족**. `isFirstBuy`면 안내만 반환합니다. |
| Fetch/lang | **충족**. `lang`은 ref에 저장하고 fetch deps에서 제외합니다. |
| 금융 guard | **신규 경로 충족**. 단, deprecated 레거시 API는 상대적으로 느슨합니다. |

### 3-1. 거래 날짜순 정렬

#### 현재 코드 스니펫

```ts
function findTargetHolding(
  trades: TradeInput[],
  targetStock: string,
): ReturnType<typeof calcHoldings>[number] | null {
  const normalizedTargetStock = normalizeTickerSymbol(targetStock);
  if (normalizedTargetStock.length === 0) {
    return null;
  }

  const holdings = calcHoldings(trades);
  return holdings.find(/* ... */) ?? null;
}
```

`calcHoldings`는 Smart Split 파일에서 가져오지만, 이 호출부는 `getChronologicalTrades`를 거치지 않습니다.

#### 문제 설명

무손절은 Smart Split과 같은 `TradeInput` 및 `calcHoldings`를 공유하지만 날짜순 정렬만 빠져 있습니다. 최신순 저장 배열에서 매도 → 매수 순서로 처리되면 현재 보유/평단/진행률이 틀어질 수 있습니다.

#### 수정 제안 스니펫

```ts
import {
  calcHoldings,
  getChronologicalTrades,
  type TradeInput,
} from './multiSplitShared.ts';

function findTargetHolding(
  trades: TradeInput[],
  targetStock: string,
): ReturnType<typeof calcHoldings>[number] | null {
  const normalizedTargetStock = normalizeTickerSymbol(targetStock);
  if (normalizedTargetStock.length === 0) {
    return null;
  }

  const holdings = calcHoldings(getChronologicalTrades(trades));
  return holdings.find(/* ... */) ?? null;
}
```

`calcNoStopCurrentRound`도 같은 정렬 규칙을 써야 합니다.

```ts
const chronologicalTrades = getChronologicalTrades(trades);
const totalInvested = hasTargetStock
  ? findTargetHolding(chronologicalTrades, targetStock)?.totalCost ?? 0
  : calcHoldings(chronologicalTrades).reduce(/* ... */);
```

### 3-2. 저예산 처리

#### 현재 코드 스니펫

```ts
const allocation = calculateMocFirstRemainingToLocAllocation({
  oneTimeAmount: args.oneTimeAmount,
  feeRate: args.feeRate,
  avgPrice,
  currentPrice: args.snapshot.currentPrice,
  appliedLocRatio,
});
const displayLowLoc = buildDisplayOrderEntry(avgPrice, allocation.finalLocQty);
const displayMocBuy = buildDisplayQuantityOnlyOrder(allocation.finalMocQty);

result.displayLowLoc = displayLowLoc;
result.displayMocBuy = displayMocBuy;
result.executableLowLoc = deriveExecutableOrder(displayLowLoc);
result.executableMocBuy = deriveExecutableOrder(displayMocBuy);
```

#### 판단

무손절은 display와 executable을 분리해 0주 표시를 허용합니다. 이 점은 Smart Split의 최신 정책과 일관됩니다. 다만 `oneTimeAmount` 자체가 너무 작아 LOC/MOC가 모두 0인 상황을 “매수금 부족”으로 설명하는 별도 상태는 없습니다.

#### 수정 제안 스니펫

무손절 전략 특성상 Smart Split의 `remainingBudget < oneTimeAmount`를 그대로 쓰기보다, “이번 회차 계산 결과가 모두 0이고 아직 분할 완료가 아님”을 저예산으로 보는 쪽이 자연스럽습니다.

```ts
const isLowBudget =
  !isFirstBuy &&
  !isSplitComplete &&
  allocation.finalLocQty === 0 &&
  allocation.finalMocQty === 0;

return {
  ...result,
  isLowBudget,
};
```

문구는 0주를 모두 보여주는 정책과 충돌하지 않게 “예산상 실행 가능 주문 없음” 정도가 적합합니다.

### 3-3. 첫 매수 데드락

#### 현재 코드 스니펫

```ts
const isFirstBuy =
  currentQuantity <= HOLDINGS_QTY_EPSILON || avgPrice <= HOLDINGS_QTY_EPSILON;

const result: NoStopExecutionData = {
  appliedLocRatio,
  progressPct,
  isFirstBuy,
  isSplitComplete,
};

if (isFirstBuy) {
  return result;
}
```

#### 판단

첫 매수에서 계산이 멈추는 것이 아니라, `noStopExecutionMessages.ts`가 첫 매수 안내를 출력합니다. 데드락 문제는 현재 발견되지 않았습니다.

### 3-4. Fetch 안정화

#### 현재 코드 스니펫

```ts
const networkErrorMsg = APP_SHELL_MESSAGES[lang].dailySummaryNetworkError;
const networkErrorMsgRef = useRef(networkErrorMsg);

useLayoutEffect(() => {
  networkErrorMsgRef.current = networkErrorMsg;
}, [networkErrorMsg]);

useEffect(() => {
  // fetch 수행
}, [
  fetchIndicatorRequirements,
  indicatorCacheKey,
  isDailyBuyAmountValid,
  isNoStopMultiSplit,
  targetStock,
]);
```

#### 판단

Smart Split이 따라가야 할 기준이 된 안정화 패턴입니다. `lang`은 fetch deps에 없고, 에러 메시지만 ref로 최신화합니다.

### 3-5. 금융 계산 guard

#### 현재 코드 스니펫

```ts
validateFinancialArgs(
  {
    oneTimeAmount: args.oneTimeAmount,
    feeRate: args.feeRate,
    currentPrice: args.snapshot.currentPrice,
    baseLocRatio: args.strategy.baseLocRatio,
    takeProfitPct: args.strategy.takeProfitPct,
    totalSplitCount: args.strategy.totalSplitCount,
  },
  {
    oneTimeAmount: { strictPositive: true },
    feeRate: { min: 0 },
    currentPrice: { strictPositive: true },
    baseLocRatio: { min: 0 },
    takeProfitPct: { min: 0 },
    totalSplitCount: { strictPositive: true },
  },
  'calculateNoStopExecution',
);
```

#### 판단

신규 `calculateNoStopExecution` 경로는 guard가 우수합니다. 다만 deprecated `calcNoStopMultiSplitOrders`는 `areFiniteNonNegativeScalars` 중심이라 신규 경로보다 느슨합니다.

#### 수정 제안 스니펫

```ts
/**
 * @deprecated 신규 실행 경로에서 사용 금지.
 * 제거 전까지는 calculateNoStopExecution과 동일한 validateFinancialArgs를 적용한다.
 */
```

또는 호출부가 없다면 레거시 API 제거를 별도 Step으로 분리하는 것이 좋습니다.

---

## 전략별 수정 우선순위

### 1순위: No-Stop 날짜순 정렬

Smart Split과 같은 장부 계산 유틸을 공유하면서 정렬만 빠져 있어 실제 왜곡 가능성이 가장 큽니다.

### 2순위: Edge MA `calculateHoldings` 정렬

클라이언트 MA 보유 계산은 정렬되어 있으나 Edge 일별 요약은 정렬이 없어 클라이언트/서버 불일치가 발생할 수 있습니다.

### 3순위: MA 분석 실패 시 daily execution gate 해제

네트워크 실패 시 카드가 깨지는 문제는 아니지만, 알람/일별 실행 블록이 계속 대기할 수 있습니다.

### 4순위: No-Stop 저예산 상태 명시

현재 0주 표시로 투명성은 확보되어 있습니다. 다만 사용자가 “왜 둘 다 0주인가”를 이해하기 위한 전용 문구는 보강 여지가 있습니다.

### 5순위: TVC 거래 리플레이 정책 명시

TVC는 스냅샷 기반 전략이라 단순 정렬 적용보다 정책 결정이 먼저입니다. 과거 날짜 거래를 허용할지, 허용한다면 스냅샷을 리플레이할지 제품 정책이 필요합니다.

---

## 결론

스마트 스플릿 최적화에서 얻은 교훈은 다른 전략에도 일부 남아 있습니다. 특히 **날짜순 장부 계산**은 No-Stop과 Edge MA에서 실제 수정 후보입니다.

반면 TVC는 장부 재계산형 전략이 아니라 스냅샷 누적형 전략이므로, Smart Split의 `getChronologicalTrades`를 그대로 이식하면 오히려 전략 계약이 흐려질 수 있습니다. TVC는 “스냅샷 이벤트 순서” 정책을 명시하고, 필요할 경우 별도 리플레이/복구 기능으로 다루는 편이 안전합니다.

이번 리포트 기준으로 즉시 코드 수정을 권장하는 항목은 아래 두 가지입니다.

1. `noStopMultiSplitShared.ts`에서 `getChronologicalTrades` 적용
2. `generate-daily-execution-summaries/index.ts`의 MA `calculateHoldings` 정렬 적용

