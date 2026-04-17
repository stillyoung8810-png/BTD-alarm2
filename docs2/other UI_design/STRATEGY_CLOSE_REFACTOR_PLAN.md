# Strategy Close Refactor Plan

> 목적: 전략 종료 흐름을 "잔여 주식 0주일 때만 직접 정산"으로 단순화하고, `History` 탭 수치를 정산 결과와 동일한 계산 원본으로 맞춥니다.  
> 현재 단계 산출물: `docs2/STRATEGY_CLOSE_REFACTOR_PLAN.md`, `docs2/strategy-close-refactor-simulation-snippets.ts`, `docs2/strategy-close-refactor-simulation.test.ts`, `docs2/strategy-close-refactor-vitest.config.ts`  
> 구현 게이트: 아래 시뮬레이션을 먼저 검토/승인받은 뒤에만 프로덕션 `.ts` / `.tsx`를 수정합니다.

## 1. Objective & Scope

### 1.1 이번 변경의 목표
1. `전략 종료하기` 클릭 시 현재 보유 수량이 남아 있으면 종료를 막고, 중앙 i18n 사전에서 읽은 토스트 문구를 노출합니다.
2. 기존 `TerminationInput` 기반의 "잔여 주식 최종 매도 입력" 중간 단계 UI와 관련 타입/시그니처를 제거합니다.
3. 보유 수량이 0이면 종료 버튼이 곧바로 종료 mutation을 실행하고, 성공 시 정산 결과 모달을 바로 엽니다.
4. 정산 결과 모달에서 `최종 매도금`과 `최종 회수금`을 제거해, 새 종료 정책과 맞지 않는 필드를 없앱니다.
5. `History` 탭의 카드 수치와 상단 집계 ROI를 동일한 정산 계산 원본에서 파생시켜, 정산 모달과 표시 숫자/반올림/부호를 정확히 맞춥니다.
6. 상단 집계 ROI는 `개별 수익률 평균`이 아니라 `총 수익 / 총 투자금 * 100`의 자본가중 방식으로 바꿉니다.

### 1.2 이번 단계에서 하지 않을 것
1. 실제 프로덕션 파일 수정은 하지 않습니다. 이번 단계는 계획서와 시뮬레이션만 작성합니다.
2. 새로운 서버 endpoint, 외부 라이브러리, 전역 store는 추가하지 않습니다.
3. 활성 포트폴리오 대시보드의 `buildPortfolioMetricsSnapshot()` 산식은 이번 계획의 직접 변경 대상이 아닙니다.
4. 기존 `History` 상세 보기(`PortfolioDetailsModal`)의 거래 렌더링 방식은 그대로 둡니다.

## 2. Target Files

아래 파일들이 실제 구현 시 수정 대상입니다.

1. `App.tsx`
   `handleOpenTerminate()`를 보유수량 가드 + 직접 종료 실행 흐름으로 교체합니다.
2. `components/SettlementModals.tsx`
   `TerminationInput`을 제거하고, 정산 결과 모달만 남기며 obsolete 필드를 숨깁니다.
3. `constants/messages/dashboardMessages.ts`
   `"보유 주식을 모두 매도해야 종료가 가능해요."` 토스트 키를 추가합니다.
4. `constants/messages/settlementMessages.ts`
   정산 결과 모달 copy를 JSX 하드코딩에서 분리하는 신규 SSOT 파일입니다.
5. `utils/financialMath.ts`
   `HOLDINGS_QTY_EPSILON`를 중앙 상수로 두어 UI/시뮬레이션/계산 로직이 같은 수량 0 기준을 공유하게 합니다.
6. `utils/portfolioSettlement.ts`
   종료 정산 수치와 aggregate ROI 입력 타입을 분리하는 신규 순수 유틸입니다.
7. `hooks/usePortfolioMutations.ts`
   종료 draft / settlement result / history payload가 동일한 정산 helper를 쓰도록 정리합니다.
8. `hooks/portfolioTypes.ts`
   종료 mutation의 입력 surface와 결과 타입을 새 종료 정책에 맞게 정리합니다.
9. `src/hooks/usePortfolioUiCommands.ts`
   obsolete `FinalSellInput` 의존을 제거하고 close command 시그니처를 단순화합니다.
10. `components/History.tsx`
   카드별 수치와 상단 aggregate ROI가 새 settlement helper를 사용하도록 바꿉니다.

이번 단계에서만 생성하는 검토 산출물은 아래 파일입니다.

1. `docs2/STRATEGY_CLOSE_REFACTOR_PLAN.md`
2. `docs2/strategy-close-refactor-simulation-snippets.ts`
3. `docs2/strategy-close-refactor-simulation.test.ts`
4. `docs2/strategy-close-refactor-vitest.config.ts`

## 3. Architectural Changes

### 3.1 종료 플로우 평탄화

현재 흐름은 `Dashboard -> App.handleOpenTerminate -> TerminationInput -> executeClosePortfolio` 순서입니다.  
새 흐름은 `Dashboard -> App.handleRequestCloseStrategy -> executeClosePortfolio -> SettlementResult` 순서로 줄입니다.

핵심 변화는 아래 4가지입니다.

1. 종료 버튼 클릭 직후 `calculateHoldings(portfolio)`로 잔여 수량을 확인합니다.
2. 잔여 수량이 하나라도 남아 있으면 토스트만 띄우고 종료 mutation 자체를 호출하지 않습니다.
3. 잔여 수량이 0이면 동기식 `useRef` 뮤텍스로 즉시 잠금을 획득한 뒤 종료 mutation을 실행합니다.
4. 종료 성공/실패와 관계없이 `finally`에서 잠금을 해제합니다.

이렇게 하면 UI 책임이 명확해집니다.

1. `App.tsx`는 "종료를 허용할지"만 판단합니다.
2. `usePortfolioMutations`는 "종료 결과를 어떻게 계산하고 저장할지"만 담당합니다.
3. `SettlementModals.tsx`는 "계산된 결과를 어떻게 보여줄지"만 담당합니다.

### 3.1.1 종료 액션 뮤텍스

종료는 금전/상태 mutation이므로 `disabled`나 로딩 스피너만으로는 충분하지 않습니다.  
렌더가 다시 그려지기 전 1-tick 틈에서 더블탭이 들어오면 종료 요청이 2번 날아갈 수 있기 때문입니다.

따라서 실제 구현은 아래 원칙을 따라야 합니다.

1. `App.tsx`에 `const isClosingRef = useRef(false)`를 둡니다.
2. 클릭 핸들러 맨 앞에서 `if (isClosingRef.current) return;`으로 즉시 차단합니다.
3. 보유 수량이 0인 것이 확인된 뒤 `isClosingRef.current = true`로 락을 획득합니다.
4. `try/finally`로 성공/실패와 무관하게 락을 반드시 해제합니다.
5. 실패 시에는 콘솔 로그만 남기지 않고 공통 에러 토스트도 띄웁니다.

### 3.2 정산 수치 SSOT 통합

현재는 종료 시점 정산은 `hooks/usePortfolioMutations.ts` 안에서 계산되고, `History.tsx`는 닫힌 `Portfolio`를 다시 별도 방식으로 계산합니다.  
이 구조 때문에 종료 모달과 투자이력 탭이 서로 다른 산식을 사용합니다.

리팩토링 후에는 `utils/portfolioSettlement.ts`에 순수 helper를 두고 아래 세 군데가 같은 계산 결과를 공유합니다.

1. 종료 직후 보여주는 `SettlementResult`
2. `portfolio_history`에 저장하는 payload
3. `History` 탭의 카드 VM / aggregate ROI

즉, **숫자 계산은 helper 한 곳**, **포맷팅은 각 화면**으로 분리합니다.

### 3.3 Settlement Modal 정리

정산 결과 모달은 데이터 기반 row config로 바꿉니다.

1. `총 투자금`
2. `기 회수금`
3. `최종 수익금`
4. `최종 수익률`

위 4개만 row config에 남기고, `최종 매도금` / `최종 회수금`은 config에서 제거합니다.  
이렇게 하면 JSX 복붙을 줄이고, 향후 row 추가/삭제도 배열 한 곳만 수정하면 됩니다.

### 3.4 투자이력 집계 방식 교정

현재 상단 ROI는 `recordVms`의 `yieldRate` 평균입니다.  
이 방식은 작은 투자금의 고수익률이 큰 투자금의 저수익률보다 과도하게 반영되는 문제가 있습니다.

새 집계는 아래 원칙으로 바꿉니다.

1. 포트폴리오별 수익률 평균을 내지 않습니다.
2. 먼저 모든 포트폴리오의 `profit`을 합산합니다.
3. 모든 포트폴리오의 `totalInvested`를 합산합니다.
4. `sumProfit / sumInvested * 100`으로 단일 ROI를 계산합니다.

이 계산은 자본가중 기준이라 정산 총계와 해석이 일치합니다.

### 3.5 레거시 데이터 리스크 메모

이 계획은 **새 종료 정책 이후 생성되는 데이터**를 기준으로 가장 단순하고 유지보수 가능한 구조를 제안합니다.  
다만 과거 `TerminationInput` 흐름에서 별도 추가 수수료가 들어간 닫힌 포트폴리오는 `Portfolio` 객체만으로 과거 정산 총계를 완벽히 복원하지 못할 가능성이 있습니다.

따라서 구현 검증 시 아래를 함께 확인해야 합니다.

1. 신규 종료 데이터: helper 기반 `History`와 직후 `SettlementResult`가 100% 일치하는지
2. 레거시 종료 데이터: 차이가 남는다면 후속 단계에서 `portfolio_history`를 `History` 카드 수치 SSOT로 승격할지

이번 시뮬레이션은 **To-Be 정책** 검증이 목적이므로, 신규 종료 정책 기준으로 작성합니다.

## 4. Data Flow & Math

### 4.1 종료 허용 조건

```ts
const hasActiveShares = calculateHoldings(portfolio).some(
  (holding) => holding.quantity > HOLDINGS_QTY_EPSILON,
);
```

1. `hasActiveShares === true`이면 종료 차단 + 토스트
2. `hasActiveShares === false`이면 종료 mutation 실행

여기서 `HOLDINGS_QTY_EPSILON`을 두는 이유는 부동소수점 잔차 때문에 `0.0000000001` 같은 유령 수량이 종료를 막지 않게 하기 위해서입니다.  
이 값은 `App.tsx` 로컬 상수가 아니라 `utils/financialMath.ts` 같은 중앙 유틸의 SSOT 상수여야 합니다.

### 4.1.1 종료 액션 동기식 잠금

```ts
if (isClosingRef.current) {
  return;
}
```

1. 락 체크는 핸들러 진입 즉시 실행합니다.
2. 락은 `await executeClosePortfolio(...)` 전 구간을 감싸야 합니다.
3. 실패 시에도 `finally` 해제가 없으면 사용자가 다시 종료를 시도할 수 없으므로 반드시 `finally`를 사용합니다.

### 4.2 정산 요약 산식

새 SSOT helper는 아래 숫자를 만듭니다.

1. `totalInvested = Σ(buy.price * buy.quantity + abs(buy.fee))`
2. `totalReturn = Σ(sell.price * sell.quantity - abs(sell.fee))`
3. `profit = totalReturn - totalInvested`
4. `yieldRate = totalInvested > 0 ? (profit / totalInvested) * 100 : 0`

모든 money / percent 결과는 `roundMoney()` 또는 `Math.round((value + Number.EPSILON) * scale) / scale` 정책으로 반올림합니다.

### 4.3 History 카드와 Settlement Modal 동기화 방식

동기화 원칙은 간단합니다.

1. `History`가 자체 산식을 새로 만들지 않습니다.
2. `buildHistoryRecordVm()`는 `buildClosedStrategySettlementSummary()`가 반환한 숫자를 그대로 받아 포맷만 합니다.
3. `SettlementResult`도 같은 summary를 사용합니다.

이렇게 하면 아래 3개가 항상 같은 원본을 공유합니다.

1. 총 투자금
2. 최종 수익금
3. 최종 수익률

### 4.4 Aggregate ROI 산식

```ts
const aggregateRoi =
  totalInvested > 0
    ? roundMoney((sumProfit / totalInvested) * 100)
    : 0;
```

중요한 점은 `average(yieldRate)`가 아니라는 점입니다.  
예를 들어 `100달러 투자 + 50달러 수익` 포트폴리오와 `900달러 투자 + 0달러 수익` 포트폴리오를 단순 평균하면 `25%`처럼 보이지만, 실제 총계 ROI는 `50 / 1000 * 100 = 5%`여야 합니다.

### 4.5 표시 자릿수

표시 자릿수는 기존 formatter를 재사용합니다.

1. 금액: `formatUsdValue()` / `formatSignedUsdValue()`
2. 수익률: `formatSignedPercent()`

숫자 생성 helper와 포맷 helper를 분리하면, 계산은 숫자로 검증하고 UI는 기존 포맷 정책만 유지할 수 있습니다.

## 5. Implementation Snippets

### 5.1 `App.tsx` - 종료 가드 + 직접 정산 + 뮤텍스

```ts
const isClosingRef = useRef(false);

const handleRequestCloseStrategy = useCallback(
  async (portfolioId: string): Promise<void> => {
    if (isClosingRef.current) {
      return;
    }

    const targetPortfolio =
      portfolios.find((portfolio) => portfolio.id === portfolioId) ?? null;

    if (targetPortfolio == null) {
      showErrorToast(shellCopyRef.current.dailySummaryNetworkError);
      return;
    }

    const hasActiveShares = calculateHoldings(targetPortfolio).some(
      (holding) => holding.quantity > HOLDINGS_QTY_EPSILON,
    );

    if (hasActiveShares) {
      showErrorToast(copyRef.current.closeStrategyRequiresNoSharesToast);
      return;
    }

    isClosingRef.current = true;
    try {
      const result = await executeClosePortfolio(portfolioId);
      if (result == null) {
        return;
      }

      setSettlementResult(result);
      scheduleInterstitialAd(INTERSTITIAL_PLACEMENT_KEYS.SETTLEMENT_DETAIL);
    } catch (error: unknown) {
      console.error('[Portfolio] close failed:', error);
      showErrorToast(shellCopyRef.current.systemError);
    } finally {
      isClosingRef.current = false;
    }
  },
  [executeClosePortfolio, portfolios, scheduleInterstitialAd],
);
```

### 5.2 `utils/financialMath.ts` + `utils/portfolioSettlement.ts` - 상수 SSOT + 인터페이스 분리

```ts
// utils/financialMath.ts
export const HOLDINGS_QTY_EPSILON = 1e-10;
```

```ts
// utils/portfolioSettlement.ts
import type { Portfolio } from '../types';
import { roundMoney } from './financialMath';
import {
  calculateTotalInvested,
  getTotalSellProceeds,
} from './portfolioCalculations';

export interface ClosedStrategySettlementSummary {
  totalInvested: number;
  alreadyRealized: number;
  totalReturn: number;
  profit: number;
  yieldRate: number;
}

type AggregateRoiInput = Pick<
  ClosedStrategySettlementSummary,
  'totalInvested' | 'profit'
>;

export function buildClosedStrategySettlementSummary(
  portfolio: Portfolio,
): ClosedStrategySettlementSummary {
  const totalInvested = roundMoney(calculateTotalInvested(portfolio));
  const totalReturn = roundMoney(getTotalSellProceeds(portfolio));
  const profit = roundMoney(totalReturn - totalInvested);
  const yieldRate =
    totalInvested > 0 ? roundMoney((profit / totalInvested) * 100) : 0;

  return {
    totalInvested,
    // 새 정책에서는 종료 시 잔여 주식이 0이어야 하므로, 모든 회수금은 이미 실현된 매도금입니다.
    alreadyRealized: totalReturn,
    totalReturn,
    profit,
    yieldRate,
  };
}

export function calculateAggregateHistoryRoi(
  summaries: readonly AggregateRoiInput[],
): number {
  const totalInvested = roundMoney(
    summaries.reduce((sum, summary) => sum + summary.totalInvested, 0),
  );

  if (totalInvested <= 0) {
    return 0;
  }

  const totalProfit = roundMoney(
    summaries.reduce((sum, summary) => sum + summary.profit, 0),
  );

  return roundMoney((totalProfit / totalInvested) * 100);
}
```

### 5.3 `hooks/usePortfolioMutations.ts` - 종료 결과와 history payload를 같은 summary로 묶기

```ts
const nextPortfolio: Portfolio = {
  ...portfolio,
  isClosed: true,
  closedAt: endDate.toISOString(),
};

const settlement = buildClosedStrategySettlementSummary(nextPortfolio);

return {
  nextPortfolio,
  settlementResult: {
    portfolio: nextPortfolio,
    ...settlement,
  },
  historyPayload: {
    portfolio_id: portfolio.id,
    user_id: userId,
    portfolio_name: portfolio.name,
    total_invested: settlement.totalInvested,
    total_return: settlement.totalReturn,
    total_profit: settlement.profit,
    yield_rate: settlement.yieldRate,
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString(),
    strategy_detail: {
      strategy: portfolio.strategy,
      daily_buy_amount: portfolio.dailyBuyAmount,
      fee_rate: portfolio.feeRate,
      alarmconfig: portfolio.alarmconfig,
    },
  },
};
```

### 5.4 `components/History.tsx` - 카드 수치와 상단 ROI 동기화

```ts
const recordVms = useMemo(
  () =>
    sortedPortfolios.map((portfolio) => {
      const settlement = buildClosedStrategySettlementSummary(portfolio);

      return {
        id: portfolio.id,
        name: portfolio.name,
        startDateLabel: copy.startDate(portfolio.startDate),
        closedDateLabel: copy.closedDate(portfolio.closedAt ?? ''),
        investedText: formatUsdValue(settlement.totalInvested),
        yieldText: formatSignedPercent(settlement.yieldRate),
        profitText: formatSignedUsdValue(settlement.profit),
        totalInvested: settlement.totalInvested,
        yieldRate: settlement.yieldRate,
        profitAmount: settlement.profit,
        isProfitPositive: getRounded(settlement.profit) >= 0,
      };
    }),
  [copy, sortedPortfolios],
);

const aggregateRoi = useMemo(
  () =>
    calculateAggregateHistoryRoi(
      recordVms.map((vm) => ({
        totalInvested: vm.totalInvested,
        profit: vm.profitAmount,
      })),
    ),
  [recordVms],
);
```

### 5.5 `components/SettlementModals.tsx` - obsolete row 제거 + data-driven 렌더링

```ts
const SETTLEMENT_METRIC_KEYS = [
  'totalInvested',
  'alreadyRealized',
  'profit',
  'yieldRate',
] as const;

type SettlementMetricKey = (typeof SETTLEMENT_METRIC_KEYS)[number];

{SETTLEMENT_METRIC_KEYS.map((metricKey) => (
  <SettlementMetricCard
    key={metricKey}
    metricKey={metricKey}
    result={result}
    copy={copy}
  />
))}
```

### 5.6 `constants/messages/dashboardMessages.ts` - 종료 차단 토스트 SSOT

```ts
export interface DashboardMessageSet {
  // ...existing keys...
  closeStrategyRequiresNoSharesToast: string;
}

ko: {
  // ...existing keys...
  closeStrategyRequiresNoSharesToast:
    '보유 주식을 모두 매도해야 종료가 가능해요.',
}

en: {
  // ...existing keys...
  closeStrategyRequiresNoSharesToast:
    'You need to sell all held shares before closing the strategy.',
}
```

---

검토 포인트는 3가지입니다.

1. 종료 차단 정책을 `App.tsx`에서 중앙 집중적으로 처리할지
2. 정산 숫자 SSOT를 신규 helper로 둘지
3. 레거시 종료 데이터까지 즉시 맞춰야 하면 `portfolio_history`를 후속 SSOT 후보로 올릴지

추가 시뮬레이션 게이트는 아래 2가지입니다.

1. 종료 버튼 더블탭 시 close mutation이 1회만 호출되는지
2. 종료 실패 후 뮤텍스가 풀려 재시도가 가능한지

시뮬레이션은 위 To-Be 설계를 기준으로 작성했고, 프로덕션 파일은 아직 수정하지 않습니다.
