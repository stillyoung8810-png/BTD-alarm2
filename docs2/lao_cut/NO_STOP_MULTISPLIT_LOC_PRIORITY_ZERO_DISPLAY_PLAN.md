---
name: 무손절 MOC 우선 확정·LOC 재배정·0주 표시 계획
overview: 무손절 다분할의 자금 배분을 MOC 우선 확정 + 남은 전체 예산의 LOC 재배정 구조로 단순화하고, 활성 전략에서 0주 주문도 명시적으로 노출하는 리팩터링 계획과 시뮬레이션 게이트를 문서화합니다.
todos:
  - id: lock-moc-first-remaining-to-loc
    content: appliedLocRatio를 존중한 채 MOC 수량을 먼저 확정하고, 남은 전체 예산을 LOC로 재배정하는 정책을 구현 계약으로 고정한다.
    status: pending
  - id: lock-explicit-zero-share-display
    content: 활성 전략 상태에서는 displayLowLoc/displayMocBuy 0주도 숨기지 않고 요약 라인에 노출하되, executable 주문 데이터와는 분리하는 계약을 고정한다.
    status: pending
  - id: lock-no-stop-production-mapping-boundary
    content: 무손절 전용 execution 타입과 hook 반환 구조를 코어 공용 타입과 분리해 다른 전략으로 타입 오염이 번지지 않도록 계약을 고정한다.
    status: pending
  - id: implement-only-after-simulation
    content: 시뮬레이션 게이트 통과 후 shared calc, summary, dashboard에 실제 구현을 반영한다.
    status: pending
isProject: false
---

# 무손절 MOC 우선 확정·LOC 재배정·0주 표시 계획

> 목적: 프로덕션 코드 구현 전에, `MOC 우선 확정 + 남은 전체 예산의 LOC 재배정`과 `0주 명시 표시` 계약을 `docs2` 전용 시뮬레이션으로 먼저 고정합니다.  
> 실행 하네스: `docs2/no-stop-multisplit-loc-priority-zero-display-simulation-snippets.ts`  
> 자동 실행 게이트: `docs2/no-stop-multisplit-loc-priority-zero-display-simulation.test.ts`  
> 전용 설정: `docs2/no-stop-multisplit-loc-priority-zero-display-vitest.config.ts`

## 로컬 사실 검증

현재 로컬 코드 기준으로 확정된 사실은 아래와 같습니다.

1. **현재 엔진은 LOC를 먼저 계산하고, 남은 돈을 MOC에 넘깁니다.**  
   `supabase/functions/_shared/noStopMultiSplitShared.ts`의 `calculateNoStopExecution()`은 `lowBudget -> lowQuantity -> usedLowBudget -> mocBudget` 순서입니다.
2. **현재 엔진은 appliedLocRatio를 존중하긴 하지만, 계산 흐름이 비즈니스 문장과 1:1로 대응되지는 않습니다.**
3. **0주 주문은 현재 데이터와 요약에서 모두 사라집니다.**  
   `buildOrderEntry()`는 1주 미만이면 `undefined`를 반환하고, `buildNoStopExecutionSummaryLines()`도 존재하는 주문만 출력합니다.

## 리뷰 검토 결론

리뷰 방향에 **동의합니다.**

핵심 이유는 아래와 같습니다.

1. **계산 단계가 더 짧습니다.**  
   기존 “양쪽 잔돈 합산” 모델은 개념적으로 맞지만 변수 수가 많습니다.  
   반면 대표님 방식은 `MOC 수량 확정 -> MOC 사용 금액 차감 -> 남은 전체 예산으로 LOC 계산` 3단계로 읽힙니다.
2. **오차 표면이 더 작습니다.**  
   양쪽 버킷을 각각 계산하고 잔돈을 합치는 방식보다, `remainingForLoc`를 직접 계산하는 쪽이 부동소수점 누적 위험이 작습니다.
3. **비즈니스 설명과 코드가 더 직접적으로 일치합니다.**  
   코드를 읽는 사람이 “MOC는 먼저 확정하고, 나머지는 LOC로 넘긴다”라고 바로 이해할 수 있습니다.

다만 로컬 엔진은 아래 현실을 유지해야 합니다.

- `LOC 단가 = avgPrice * (1 + feeRate / 100)`
- `MOC 단가 = currentPrice * 1.15`

즉, 리뷰의 심플한 3단계 흐름은 채택하되, 실제 단가는 로컬 규칙을 그대로 유지합니다.

## 확정할 정책

### 정책 A — MOC First, Remaining Budget to LOC

1. `totalDailyBudget`를 `appliedLocRatio`로 나눠 `baseLocBudget`, `baseMocBudget`를 구합니다.
2. `finalMocQty = floorSafe(baseMocBudget / mocUnitCost)`를 먼저 계산합니다.
3. `remainingForLoc = totalDailyBudget - (finalMocQty * mocUnitCost)`를 계산합니다.
4. `finalLocQty = floorSafe(remainingForLoc / locUnitCost)`로 LOC를 계산합니다.
5. 결과적으로 **비율은 존중하면서도, 수학적으로 버려질 돈은 자연스럽게 LOC에 흡수**됩니다.

대표님 예시($100 예산, $30 가격, 50:50)를 로컬 규칙(`MOC = currentPrice * 1.15`)으로 풀면:

- `baseLocBudget = 50`
- `baseMocBudget = 50`
- `finalMocQty = floor(50 / 34.5) = 1`
- `remainingForLoc = 100 - 34.5 = 65.5`
- `finalLocQty = floor(65.5 / 30) = 2`

최종 결과:

- `LOC = 2`
- `MOC = 1`

즉, 리뷰의 단순화된 3단계는 로컬의 `15%` MOC 안전 버퍼를 유지해도 대표님 의도를 그대로 만족합니다.

### 정책 B — Explicit 0-Share Display with Executable/Display Separation

활성 전략 상태(`!isFirstBuy && !isSplitComplete`)라면:

- `displayLowLoc.quantity === 0`이어도 표시 객체를 유지합니다.
- `displayMocBuy.quantity === 0`이어도 표시 객체를 유지합니다.
- 요약 빌더는 0주를 숨기지 않습니다.
- 추가 설명문(`예산 부족`)은 붙이지 않습니다.
- 실행 경로는 `executableLowLoc` / `executableMocBuy`처럼 **1주 이상일 때만 존재하는 별도 필드**를 사용합니다.
- 즉, **0주 객체는 화면 설명용으로만 존재하고 주문 전송용 페이로드에는 섞이지 않습니다.**

예외:

- **첫 매수 상태**에서는 기존처럼 힌트만 보여줍니다.
- **분할 완료 상태**에서는 기존처럼 익절만 보여줍니다.

### 정책 C — OCP-안전 프로덕션 매핑 경계

실제 프로덕션 반영 시에는 아래 경계를 반드시 지킵니다.

1. `Strategy` 같은 거대한 코어 타입이나 공용 `ExecutionData` 인터페이스를 무손절 요구사항 때문에 직접 확장하지 않습니다.
2. `NoStopExecutionResult`는 **무손절 다분할 도메인 안에서만 소비되는 전용 타입**으로 유지합니다.
3. `NoStopMocOrderEntry`는 끝까지 `quantity`만 가지며, MOC에 가짜 `price`를 덧붙이지 않습니다.
4. `Dashboard`와 요약 빌더는 `displayLowLoc` / `displayMocBuy`만 읽습니다.
5. `useNoStopMultiSplitExecution` 같은 훅은 UI에 표시용 필드와 `onExecute` 콜백만 노출하고, `executableLowLoc` / `executableMocBuy`는 훅 내부에 캡슐화합니다.
6. 실제 주문 전송 payload 조립은 훅 내부의 `handleExecuteOrder` 같은 단일 경로에서만 수행하고, 그 경로는 오직 executable 필드만 읽습니다.
7. 실행 가능한 주문이 하나도 없을 때는 버튼 비활성화와 별개로, 실행 함수 내부에서도 guard clause로 차단합니다.
8. `onExecute`는 비동기 금융 액션이므로 동기식 mutex(`isExecutingRef`)로 중복 제출을 막아야 합니다.
9. 브로커/브릿지 호출은 `await Promise.resolve(...)` 형태로 감싸 동기 throw와 비동기 reject를 같은 `try/finally` 경로에서 처리해야 합니다.

## 시뮬레이션 통과 게이트

아래 조건이 모두 통과돼야 실제 코드 구현에 들어갑니다.

1. 현재 엔진과 새 정책의 차이가 숫자로 재현돼야 합니다.
2. 새 정책은 `appliedLocRatio`를 먼저 존중해야 합니다.
3. 새 정책은 **MOC 수량을 먼저 확정한 뒤**, 그 실제 사용 금액만 빼고 남은 전체 예산을 LOC로 보내야 합니다.
4. 남은 전체 예산은 LOC로만 재배정돼야 하며, MOC 수량은 추가로 부풀면 안 됩니다.
5. 대표님 엣지 케이스(`예산 100 / 가격 30 / 비율 50:50`)에서 최종 결과가 `LOC 2주 / MOC 1주`여야 합니다.
6. 예산이 부족해도 활성 전략 상태에서는 `LOC 0주 / MOC 0주` 표시 라인이 보여야 합니다.
7. 같은 상황에서도 실행 가능 주문 데이터는 비어 있어야 합니다.
8. 첫 매수 상태에서는 0주 라인 대신 기존 힌트만 보여야 합니다.
9. 분할 완료 상태에서는 추가 매수 라인이 사라지고 익절 라인만 남아야 합니다.
10. 훅 외부에 노출되는 뷰 모델은 display 필드와 `onExecute`만 제공해야 하며 executable 필드를 직접 노출하지 않아야 합니다.
11. `onExecute`는 display 데이터가 아니라 executable 데이터만으로 broker payload를 만들어야 합니다.
12. executable 주문이 하나도 없으면 `onExecute`는 즉시 실패해야 합니다.
13. `onExecute`는 중복 클릭 시 두 번째 요청을 브로커로 보내지 않아야 합니다.
14. 시뮬레이션의 allocation 반환형은 최종 수량만 노출하고, 테스트도 삭제된 중간 예산 필드를 검증하지 않아야 합니다.
15. 동일한 입력으로 재렌더될 때는 훅 내부 `execution`, `onExecute`, 반환 view model의 참조를 재사용해야 합니다.
16. `appliedLocRatio`는 항상 `0 <= ratio <= 100` 범위여야 하며, 100% 초과 입력은 검증 단계에서 차단해야 합니다.

## 시뮬레이션 실행 방법

```bash
yarn test -- --config docs2/no-stop-multisplit-loc-priority-zero-display-vitest.config.ts
```

## 구체 스니펫

### 스니펫 A — MOC First, Remaining Budget to LOC

대상 파일:

- `supabase/functions/_shared/noStopMultiSplitShared.ts`
- `utils/noStopMultiSplitCalc.ts`

```ts
interface NoStopBudgetAllocation {
  finalLocQty: number;
  finalMocQty: number;
}

const PERCENT_DENOMINATOR = 100;
const MOC_SAFETY_BUFFER_MULTIPLIER = 1.15;

function calculateMocFirstRemainingToLocAllocation(args: {
  oneTimeAmount: number;
  feeRate: number;
  avgPrice: number;
  currentPrice: number;
  appliedLocRatio: number;
}): NoStopBudgetAllocation {
  validateFinancialArgs(
    args,
    {
      oneTimeAmount: { strictPositive: true },
      feeRate: { min: 0 },
      avgPrice: { strictPositive: true },
      currentPrice: { strictPositive: true },
      appliedLocRatio: { min: 0, max: PERCENT_DENOMINATOR },
    },
    'calculateMocFirstRemainingToLocAllocation',
  );

  // 로컬 validateFinancialArgs는 현재 min/strictPositive만 실제로 강제하므로,
  // 중앙 validator가 max를 지원하기 전까지는 상한 가드를 명시적으로 유지합니다.
  if (args.appliedLocRatio > PERCENT_DENOMINATOR) {
    throw new Error(
      `calculateMocFirstRemainingToLocAllocation.appliedLocRatio must be <= ${PERCENT_DENOMINATOR}`,
    );
  }

  const locUnitCost = args.avgPrice * (1 + args.feeRate / PERCENT_DENOMINATOR);
  const mocUnitCost = args.currentPrice * MOC_SAFETY_BUFFER_MULTIPLIER;
  const baseLocBudget =
    args.oneTimeAmount * (args.appliedLocRatio / PERCENT_DENOMINATOR);
  const baseMocBudget = Math.max(0, args.oneTimeAmount - baseLocBudget);
  const finalMocQty = floorSafeQuantity(baseMocBudget / mocUnitCost);
  const remainingForLoc = Math.max(
    0,
    args.oneTimeAmount - finalMocQty * mocUnitCost,
  );
  const finalLocQty = floorSafeQuantity(remainingForLoc / locUnitCost);

  return {
    finalLocQty,
    finalMocQty,
  };
}
```

Why:

- 핵심은 **비율은 지키되, 계산 흐름은 MOC -> remaining budget -> LOC로 단순화**하는 것입니다.
- 기존 “양쪽 잔돈 합산”과 같은 비즈니스 결과를 더 짧고 읽기 쉬운 코드로 표현할 수 있습니다.
- `baseLocBudget`, `baseMocBudget`, `remainingForLoc` 같은 중간 계산값은 함수 내부에서만 사용하고, 외부 계약에는 `finalLocQty`, `finalMocQty`만 남깁니다.

### 스니펫 B — 표시용 0주와 실행용 주문을 분리하는 order builder

대상 파일:

- `supabase/functions/_shared/noStopMultiSplitShared.ts`
- `supabase/functions/_shared/noStopExecutionMessages.ts`

```ts
function buildDisplayOrderEntry(
  price: number,
  quantity: number,
): NoStopOrderEntry | undefined {
  if (!Number.isFinite(price) || price <= 0) {
    return undefined;
  }

  return {
    price: roundMoney(price),
    quantity: Math.max(0, floorSafeQuantity(quantity)),
  };
}

function buildDisplayQuantityOnlyOrder(quantity: number): NoStopMocOrderEntry {
  return {
    quantity: Math.max(0, floorSafeQuantity(quantity)),
  };
}

function deriveExecutableOrder<T extends { quantity: number }>(
  displayOrder?: T,
): T | undefined {
  return displayOrder != null && displayOrder.quantity >= 1
    ? displayOrder
    : undefined;
}

const displayLowLoc = buildDisplayOrderEntry(avgPrice, allocation.finalLocQty);
const displayMocBuy = buildDisplayQuantityOnlyOrder(allocation.finalMocQty);

result.displayLowLoc = displayLowLoc;
result.displayMocBuy = displayMocBuy;
result.executableLowLoc = deriveExecutableOrder(displayLowLoc);
result.executableMocBuy = deriveExecutableOrder(displayMocBuy);
```

### 스니펫 C — 요약 빌더는 단일 문자열 헬퍼로 LOC/MOC/익절 라인을 통합한다

대상 파일:

- `supabase/functions/_shared/noStopExecutionMessages.ts`
- `components/Dashboard.tsx`
- `utils/dailyExecutionSummary.ts`

```ts
interface FormatExecutionLineArgs {
  label: string;
  price?: number;
  quantity: number;
  formatPrice: (price: number) => string;
  formatQuantity: (quantity: number) => string;
  sharesUnit: string;
}

function formatExecutionLine(
  args: FormatExecutionLineArgs,
): string {
  const quantityText = `${args.formatQuantity(args.quantity)}${args.sharesUnit}`;
  if (args.price == null) {
    return `${args.label}: ${quantityText}`;
  }

  return `${args.label}: ${args.formatPrice(args.price)} / ${quantityText}`;
}

if (args.execution.displayLowLoc != null) {
  lines.push(
    formatExecutionLine({
      label: messages[NO_STOP_EXECUTION_MESSAGE_IDS.lowLoc],
      price: args.execution.displayLowLoc.price,
      quantity: args.execution.displayLowLoc.quantity,
      formatPrice: args.formatPrice,
      formatQuantity: args.formatQuantity,
      sharesUnit,
    }),
  );
}

if (args.execution.displayMocBuy != null) {
  lines.push(
    formatExecutionLine({
      label: messages[NO_STOP_EXECUTION_MESSAGE_IDS.mocBuy],
      quantity: args.execution.displayMocBuy.quantity,
      formatPrice: args.formatPrice,
      formatQuantity: args.formatQuantity,
      sharesUnit,
    }),
  );
}

if (args.execution.takeProfit != null) {
  lines.push(
    formatExecutionLine({
      label: messages[NO_STOP_EXECUTION_MESSAGE_IDS.takeProfit],
      price: args.execution.takeProfit.price,
      quantity: args.execution.takeProfit.quantity,
      formatPrice: args.formatPrice,
      formatQuantity: args.formatQuantity,
      sharesUnit,
    }),
  );
}
```

### 스니펫 D — 훅은 참조 안정성을 유지하면서 display surface만 노출한다

대상 파일:

- `hooks/useNoStopMultiSplitExecution.ts`
- 무손절 전용 타입 파일(`supabase/functions/_shared/noStopMultiSplitShared.ts` 또는 별도 전용 파일)

```ts
interface UseNoStopExecutionArgs {
  trades: readonly TradeHistoryEntry[];
  oneTimeAmount: number;
  feeRate: number;
  currentPrice: number;
  strategy: NoStopStrategy;
  executeBrokerOrders: (orders: readonly BrokerOrderPayload[]) => Promise<void>;
}

interface NoStopExecutionResult {
  progressPct: number;
  isFirstBuy: boolean;
  isSplitComplete: boolean;
  displayLowLoc?: NoStopOrderEntry;
  displayMocBuy?: NoStopMocOrderEntry;
  takeProfit?: NoStopOrderEntry;
  executableLowLoc?: NoStopOrderEntry;
  executableMocBuy?: NoStopMocOrderEntry;
}

interface BrokerOrderPayload {
  type: 'LIMIT' | 'MARKET_ON_CLOSE';
  price?: number;
  quantity: number;
}

const NO_STOP_EXECUTION_ERROR_CODES = {
  noExecutableOrders: 'ERROR_NO_EXECUTABLE_ORDERS',
} as const;

function buildNoStopExecutableOrders(
  execution: NoStopExecutionResult,
): BrokerOrderPayload[] {
  const orders: BrokerOrderPayload[] = [];

  if (execution.executableLowLoc != null) {
    orders.push({
      type: 'LIMIT',
      price: execution.executableLowLoc.price,
      quantity: execution.executableLowLoc.quantity,
    });
  }

  if (execution.executableMocBuy != null) {
    orders.push({
      type: 'MARKET_ON_CLOSE',
      quantity: execution.executableMocBuy.quantity,
    });
  }

  if (orders.length === 0) {
    throw new Error(NO_STOP_EXECUTION_ERROR_CODES.noExecutableOrders);
  }

  return orders;
}

function useNoStopMultiSplitExecution(args: UseNoStopExecutionArgs) {
  const execution = useMemo(
    () =>
      calculateNoStopExecution({
        trades: args.trades,
        oneTimeAmount: args.oneTimeAmount,
        feeRate: args.feeRate,
        currentPrice: args.currentPrice,
        strategy: args.strategy,
      }),
    [
      args.trades,
      args.oneTimeAmount,
      args.feeRate,
      args.currentPrice,
      args.strategy,
    ],
  );
  const isExecutingRef = useRef(false);

  const handleExecuteOrder = useCallback(async () => {
    if (isExecutingRef.current) {
      return;
    }

    isExecutingRef.current = true;

    try {
      const orders = buildNoStopExecutableOrders(execution);
      await Promise.resolve(args.executeBrokerOrders(orders));
    } finally {
      isExecutingRef.current = false;
    }
  }, [execution, args.executeBrokerOrders]);

  return useMemo(
    () => ({
      progressPct: execution.progressPct,
      isFirstBuy: execution.isFirstBuy,
      isSplitComplete: execution.isSplitComplete,
      displayLowLoc: execution.displayLowLoc,
      displayMocBuy: execution.displayMocBuy,
      takeProfit: execution.takeProfit,
      onExecute: handleExecuteOrder,
    }),
    [execution, handleExecuteOrder],
  );
}
```

## 실제 코드에서 바뀌는 파일 범위

### 핵심 계산

- `supabase/functions/_shared/noStopMultiSplitShared.ts`
- `utils/noStopMultiSplitCalc.ts`

### 요약/대시보드

- `supabase/functions/_shared/noStopExecutionMessages.ts`
- `components/Dashboard.tsx`
- `utils/dailyExecutionSummary.ts`

### 훅/전용 타입 경계

- `hooks/useNoStopMultiSplitExecution.ts`
- 무손절 전용 타입 파일 또는 `supabase/functions/_shared/noStopMultiSplitShared.ts`

### 테스트

- `utils/noStopMultiSplitCalc.test.ts`
- `utils/noStopMultiSplitCrossValidation.test.ts`
- 필요 시 `components/Dashboard.test.tsx`

## 구현 전 체크리스트

1. `MOC First, Remaining Budget to LOC`를 실제 제품 규칙으로 승인받기
2. 0주 표시 객체와 실행용 주문 필드가 섞이지 않는지 소비처(`Dashboard`, 주문 안내, 모달)를 전수 점검하기
3. 무손절 전용 execution 타입을 코어 공용 타입에 무리하게 합치지 말고, 도메인 내부 타입으로 격리하기
4. 훅이 executable 필드를 외부에 직접 노출하지 않는지 확인하기
5. 훅의 `onExecute`가 mutex와 `Promise.resolve` 보호를 모두 갖추는지 확인하기
6. 동일 입력 재렌더에서 `execution`, `onExecute`, 반환 view model 참조가 안정적으로 재사용되는지 확인하기
7. `appliedLocRatio`의 최대값 검증이 shared calc와 hook 입력 검증에 모두 반영되는지 확인하기
8. 시뮬레이션 통과 후에만 shared calc → hook → summary → dashboard 순서로 구현하기

## 난이도 평가

- **MOC First + Remaining Budget to LOC:** `중상`  
  이유: `calculateNoStopExecution()`의 자금 배분 심장을 바꾸는 작업이지만, 이전 “양쪽 잔돈 합산”안보다 구현은 더 단순합니다.
- **0주 명시 표시:** `중`  
  이유: 단순 문구 변경이 아니라 `표시용 0주 유지 -> 실행용 주문 분리 -> 요약 숨김 해제`까지 같이 반영해야 합니다.
- **합산 체감 난이도:** `7/10`  
  shared calc + summary + dashboard + 테스트가 같이 움직이지만, persisted strategy schema를 새로 늘리지 않는 범위라 통제 가능합니다.
