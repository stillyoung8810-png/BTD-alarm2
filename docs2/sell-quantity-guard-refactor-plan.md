# 매도 수량 상한 리팩토링 시뮬레이션 계획서

> 목적: `QuickInputModal`, `TradeExecutionModal`, `AIImageInputModal`에서 매도 입력 수량이 현재 보유 수량을 초과하지 않도록 최소 범위 리팩토링 계획을 고정합니다.  
> 원칙: 실제 프로덕션 코드는 아직 바꾸지 않고, 먼저 시뮬레이션으로 "보유 수량 초과 매도 차단" 불변식을 통과시킨 뒤 구현에 들어갑니다.  
> 실행 하네스: `docs2/sell-quantity-guard-refactor-simulation-snippets.ts`  
> 자동 실행 게이트: `docs2/sell-quantity-guard-refactor-simulation.test.ts`

## 0. 범위와 비범위

### 0.1 이번 단계에서 해결할 범위
1. `QuickInputModal`의 매도 입력은 현재 보유 수량보다 큰 수량을 저장하지 못하게 합니다.
2. `TradeExecutionModal`의 매도 입력도 동일한 상한 규칙을 적용합니다.
3. `AIImageInputModal`은 사용자가 체크한 거래만 대상으로, 실제 저장 순서 그대로 순차 검증합니다.
4. 검증 코어는 `Trade[]` 기반의 순수 유틸로 분리해 UI와 AI 경로가 동일한 규칙을 재사용하도록 맞춥니다.
5. 사용자 메시지는 기존 i18n 사전(`tradeMessages`, `I18N`)에 추가하고, JSX 안에 하드코딩하지 않습니다.

### 0.2 이번 단계에서 하지 않을 것
1. 새 라이브러리, 새 전역 store, 새 endpoint, 서버 스키마 변경은 하지 않습니다.
2. AI 인식 결과를 날짜 기준으로 재정렬하지 않습니다. 검증 순서는 현재 `onSave(trades)`에 전달되는 배열 순서와 동일하게 유지합니다.
3. `SettlementModals`의 종료 정산 입력 UI는 이번 범위에 넣지 않습니다.
4. AI 모달의 업로드/광고/스캔 흐름은 건드리지 않습니다. 이번 단계는 "저장 직전 선택 거래 검증"만 추가합니다.
5. `AIImageInputModal`의 전체 i18n 체계를 `tradeMessages`로 이관하지 않습니다. 기존 `I18N` 구조를 유지한 채 필요한 키만 추가합니다.

## 1. 현재 문제 요약

### 1.1 수동 매도 입력
현재 `QuickInputModal`과 `TradeExecutionModal`은 "매도 가능한 보유 종목이 전혀 없는가"는 막고 있지만, **선택된 종목의 현재 보유 수량보다 큰 매도 수량**은 별도로 막지 않습니다.  
즉 "보유 종목 없음"과 "보유 수량 초과"가 다른 문제인데, 지금 코드는 전자만 다룹니다.

### 1.2 AI 매매 인식
`AIImageInputModal`은 체크된 거래를 `onSave(trades)`로 한 번에 넘깁니다.  
이때 단순히 각 거래를 독립적으로만 보면 안 되고, **선택된 거래들을 저장 순서대로 누적 적용했을 때** 중간에 보유 수량이 음수가 되는지 확인해야 합니다.

예:

1. 현재 `QQQ` 10주 보유
2. 선택한 AI 거래: `QQQ 8주 매도`, `QQQ 5주 매도`

각 거래를 개별적으로만 보면 둘 다 "10주 이하"처럼 보일 수 있지만, 첫 매도 후 남은 수량은 2주이므로 두 번째 매도는 막혀야 합니다.

### 1.3 보유 수량 계산의 전제
이 계획은 **현재 보유 수량 계산이 시간순 기준으로 정확하다**는 전제를 필요로 합니다.  
이미 별도 계획서에서 다룬 `calculateHoldingsFromTrades()`의 최신순 배열 이슈가 정리되지 않았다면, 동일한 정규화가 선행되거나 검증 코어가 그 전제를 직접 보장해야 합니다.

## 2. 통과 게이트

아래 조건이 모두 맞아야 실제 구현을 시작합니다.

1. `QuickInputModal`에서 매도 수량이 현재 보유 수량을 초과하면 저장 버튼은 비활성화됩니다.
2. `TradeExecutionModal`도 동일한 초과 매도 차단 규칙을 따릅니다.
3. 보유 수량과 정확히 같은 매도 수량은 허용됩니다.
4. 매도 가능한 종목이 아예 없을 때는 기존 `noHoldings` 메시지가 우선하고, 초과 매도 메시지로 바뀌지 않습니다.
5. AI 검증은 체크된 거래만 대상으로 하며, 체크하지 않은 초과 매도 항목은 저장 차단 사유에 포함되지 않습니다.
6. AI 검증은 선택된 거래 배열을 실제 저장 순서 그대로 순차 적용합니다.
7. AI에서 앞선 선택 거래 때문에 남은 보유 수량이 줄어든 경우, 뒤의 초과 매도는 저장 직전에 차단됩니다.
8. 기존 거래 배열이 최신순으로 저장되어 있어도, 보유 수량 조회 결과는 시간순 계산과 동일해야 합니다.
9. 수동 입력 컴포넌트는 O(N) 보유 수량 계산을 렌더 루트에서 직접 반복하지 않고, `tradeType`, `selectedStock`, `portfolio.trades` 변경 시에만 재계산합니다.
10. 기초 입력값(종목, 가격, 수량) 검증이 실패하면 초과 매도 검증은 실행되지 않아야 합니다.
11. `AIImageInputModal` 결과 화면 하단에는 "보유 수량 내 매도만 저장 가능" 예방 문구가 기존 안내 문구 바로 아래 줄에 표시되어야 합니다.
12. 예방 문구는 JSX 하드코딩 없이 `constants.tsx`의 기존 `I18N` 사전에 등록한 키에서만 읽어야 합니다.
13. 예방 문구 아이콘은 `aria-hidden="true"` 처리되어 스크린 리더 중복 낭독을 만들지 않아야 합니다.
14. `AIImageInputModal`의 "확인 후 저장" 액션은 동기 `useRef` mutex로 1-tick repaint gap의 더블 클릭을 차단해야 합니다.
15. AI 저장 mutex는 `onSave`의 비동기 완료 또는 실패까지 유지되어야 하며, Promise rejection을 삼키지 않아야 합니다.
16. `AIImageInputModal` 업로드 뷰에는 "요청이 많아 실패할 경우, 잠시 후 다시 시도" 예방 문구가 기존 스캔 안내 문구 바로 아래 줄에 표시되어야 합니다.
17. 업로드 뷰 예방 문구도 JSX 하드코딩 없이 `constants.tsx`의 기존 `I18N` 사전에 등록한 키에서만 읽어야 합니다.
18. 이번 단계 구현으로 새 라이브러리, 새 전역 store, 새 endpoint는 추가하지 않습니다.

## 3. 리팩토링 계획

### 3.1 Phase A - 공유 검증 코어 분리

핵심은 "수동 입력 1건 검증"과 "선택된 AI 거래 배치 검증"이 같은 규칙을 쓰게 만드는 것입니다.  
다만 과한 범용 validator는 만들지 않고, **매도 수량 상한**만 다루는 작은 유틸 하나로 제한합니다.

#### 대상 파일
1. `utils/tradeSellValidation.ts` (신규)
2. `utils/portfolioCalculations.ts` (의존만 사용, 이번 문서의 스니펫에서는 직접 수정하지 않음)

#### 스니펫 - `utils/tradeSellValidation.ts`

```ts
import type { Trade } from '../types';
import { calculateHoldingsFromTrades } from './portfolioCalculations';
import { validateFinancialArgs } from './vrBandStrategy';

const HOLDINGS_QTY_EPSILON = 1e-10;

type SellValidationTrade = Pick<Trade, 'type' | 'stock' | 'quantity'>;

export interface SellQuantityLimitViolation {
  stock: string;
  availableQuantity: number;
  requestedQuantity: number;
  tradeIndex?: number;
}

function normalizeTradeStock(stock: string): string {
  return stock.trim().toUpperCase();
}

function normalizeTradeQuantity(quantity: number): number {
  const normalizedQuantity = Math.abs(Number(quantity));
  validateFinancialArgs(
    { quantity: normalizedQuantity },
    { quantity: { strictPositive: true } },
    'normalizeTradeQuantity',
  );
  return normalizedQuantity;
}

function buildHoldingQuantityMap(trades: readonly Trade[]): Map<string, number> {
  return new Map(
    // 보유 수량 SSOT는 기존 holdings 계산기를 재사용하되, 호출자는 이 O(N) 작업을
    // 렌더 루트에서 남발하지 않고 memoized selector처럼 사용해야 합니다.
    calculateHoldingsFromTrades([...trades]).map((holding) => [
      normalizeTradeStock(holding.stock),
      holding.quantity,
    ]),
  );
}

export function getHoldingQuantityForStock(
  trades: readonly Trade[],
  stock: string,
): number {
  const normalizedStock = normalizeTradeStock(stock);
  if (normalizedStock.length === 0) {
    return 0;
  }

  return buildHoldingQuantityMap(trades).get(normalizedStock) ?? 0;
}

export function getSellQuantityLimitViolation(args: {
  stock: string;
  availableQuantity: number;
  requestedQuantity: number;
}): SellQuantityLimitViolation | null {
  const normalizedStock = normalizeTradeStock(args.stock);
  const availableQuantity = Math.max(0, args.availableQuantity);
  const requestedQuantity = normalizeTradeQuantity(args.requestedQuantity);

  validateFinancialArgs(
    { availableQuantity },
    { availableQuantity: { min: 0 } },
    'getSellQuantityLimitViolation',
  );

  if (normalizedStock.length === 0) {
    return null;
  }

  if (requestedQuantity <= availableQuantity + HOLDINGS_QTY_EPSILON) {
    return null;
  }

  return {
    stock: normalizedStock,
    availableQuantity,
    requestedQuantity,
  };
}

export function validateSelectedTradesAgainstHoldings(
  existingTrades: readonly Trade[],
  selectedTrades: readonly SellValidationTrade[],
): SellQuantityLimitViolation | null {
  const holdingQuantityMap = buildHoldingQuantityMap(existingTrades);

  for (let index = 0; index < selectedTrades.length; index += 1) {
    const trade = selectedTrades[index];
    const normalizedStock = normalizeTradeStock(trade.stock);
    const normalizedQuantity = normalizeTradeQuantity(trade.quantity);
    const currentQuantity = holdingQuantityMap.get(normalizedStock) ?? 0;

    if (trade.type === 'buy') {
      holdingQuantityMap.set(
        normalizedStock,
        currentQuantity + normalizedQuantity,
      );
      continue;
    }

    const violation = getSellQuantityLimitViolation({
      stock: normalizedStock,
      availableQuantity: currentQuantity,
      requestedQuantity: normalizedQuantity,
    });

    if (violation != null) {
      return {
        ...violation,
        tradeIndex: index,
      };
    }

    holdingQuantityMap.set(
      normalizedStock,
      currentQuantity - normalizedQuantity,
    );
  }

  return null;
}
```

#### Phase A 메모
1. 입력 타입을 `Trade[]`와 `Pick<Trade, ...>`로 좁혀 `Portfolio` 통객체 의존을 피합니다.
2. 수량 검증은 `validateFinancialArgs`로 모으고, 보유 수량 비교 로직은 한 곳에만 둡니다.
3. 부동소수점 오차 때문에 전량 매도 차단이 발생하지 않도록 `HOLDINGS_QTY_EPSILON`을 비교식에 포함합니다.
4. AI 검증은 선택된 배열의 **현재 순서**를 그대로 사용합니다. 날짜 재정렬은 이번 단계 scope 밖입니다.

### 3.2 Phase B - 수동 매도 입력 경로 적용

핵심은 기존 `noHoldings`/`invalidQuantity` 흐름을 깨지 않으면서, **유효한 매도 수량이 입력된 뒤에만** 초과 매도 메시지를 얹는 것입니다.

#### 대상 파일
1. `constants/messages/tradeMessages.ts`
2. `components/QuickInputModal.tsx`
3. `components/TradeExecutionModal.tsx`

#### 스니펫 A - `constants/messages/tradeMessages.ts`

```ts
helper: {
  // ...기존 키 유지...
  sellQuantityExceedsHoldings: (
    availableQuantityText: string,
    requestedQuantityText: string,
  ) =>
    `현재 보유 ${availableQuantityText}주를 초과한 ${requestedQuantityText}주 매도는 저장할 수 없습니다.`,
}
```

영문도 같은 구조로 추가합니다.

#### 스니펫 B - `components/QuickInputModal.tsx`

```ts
import { useMemo } from 'react';
import {
  getHoldingQuantityForStock,
  getSellQuantityLimitViolation,
} from '../utils/tradeSellValidation';

const MAX_SHARE_DECIMAL_PLACES = 4;

const availableSellQuantity = useMemo(() => {
  if (tradeType !== 'sell' || selectedStock === '') {
    return 0;
  }

  return getHoldingQuantityForStock(portfolio.trades, selectedStock);
}, [tradeType, selectedStock, portfolio.trades]);

let validationMessage: string | null = null;
if (tradeType === 'sell' && selectedStock === '') {
  validationMessage = copy.helper.noHoldings;
} else if (!areStrictPositiveFiniteScalars(price)) {
  validationMessage = copy.helper.invalidPrice;
} else if (tradeType === 'buy' && !isVrStrategy && resolvedQuantity === 0) {
  validationMessage = copy.helper.zeroQuantityBudgetLocked;
} else if (!areStrictPositiveFiniteScalars(resolvedQuantity)) {
  validationMessage = copy.helper.invalidQuantity;
} else if (tradeType === 'sell') {
  const sellLimitViolation = getSellQuantityLimitViolation({
    stock: selectedStock,
    availableQuantity: availableSellQuantity,
    requestedQuantity: resolvedQuantity,
  });

  if (sellLimitViolation != null) {
    validationMessage = copy.helper.sellQuantityExceedsHoldings(
      formatShareQuantity(
        sellLimitViolation.availableQuantity,
        MAX_SHARE_DECIMAL_PLACES,
      ),
      formatShareQuantity(
        sellLimitViolation.requestedQuantity,
        MAX_SHARE_DECIMAL_PLACES,
      ),
    );
  }
}
```

#### 스니펫 C - `components/TradeExecutionModal.tsx`

```ts
import { useMemo } from 'react';
import {
  getHoldingQuantityForStock,
  getSellQuantityLimitViolation,
} from '../utils/tradeSellValidation';

const MAX_SHARE_DECIMAL_PLACES = 4;

const availableSellQuantity = useMemo(() => {
  if (tradeType !== 'sell' || selectedStock === '') {
    return 0;
  }

  return getHoldingQuantityForStock(portfolio.trades, selectedStock);
}, [tradeType, selectedStock, portfolio.trades]);

let validationMessage: string | null = null;
if (selectedStock === '') {
  if (tradeType === 'sell') {
    validationMessage = copy.helper.noHoldings;
  } else {
    validationMessage = copy.helper.chooseStockFirst;
  }
} else if (!areStrictPositiveFiniteScalars(price)) {
  validationMessage = copy.helper.invalidPrice;
} else if (!areStrictPositiveFiniteScalars(quantity)) {
  validationMessage = copy.helper.invalidQuantity;
} else if (tradeType === 'sell') {
  const sellLimitViolation = getSellQuantityLimitViolation({
    stock: selectedStock,
    availableQuantity: availableSellQuantity,
    requestedQuantity: quantity,
  });

  if (sellLimitViolation != null) {
    validationMessage = copy.helper.sellQuantityExceedsHoldings(
      formatShareQuantity(
        sellLimitViolation.availableQuantity,
        MAX_SHARE_DECIMAL_PLACES,
      ),
      formatShareQuantity(
        sellLimitViolation.requestedQuantity,
        MAX_SHARE_DECIMAL_PLACES,
      ),
    );
  }
}
```

#### Phase B 메모
1. `getHoldingQuantityForStock()`는 내부적으로 O(N) holdings 계산을 수행하므로, 호출 자체를 `useMemo`로 감싸 `tradeType`, `selectedStock`, `portfolio.trades`가 바뀔 때만 재계산합니다.
2. `noHoldings`와 `invalidQuantity`는 기존 의미를 유지하고, 초과 매도 메시지는 그 다음 순서에만 둡니다.
3. 초과 매도 검증은 가격/수량 같은 기초 입력이 모두 유효할 때만 마지막에 실행합니다.
4. 수량 표시 소수점 정책은 `MAX_SHARE_DECIMAL_PLACES` 상수 하나로 묶어 하드코딩된 `4`를 제거합니다.
5. 수동 입력 두 경로 모두 동일 유틸을 쓰되, 각 컴포넌트의 기존 수량 계산 방식(`resolvedQuantity` vs `quantity`)은 그대로 유지합니다.
6. 이 단계에서는 `getSellableStocks()` 자체는 그대로 두고, "선택된 종목의 상한"만 추가합니다.

### 3.3 Phase C - AI 선택 거래 저장 전 순차 검증

핵심은 **체크된 거래만**, **현재 저장 순서 그대로**, **저장 직전 한 번** 검증하는 것입니다.  
이 단계에서는 App 저장 루프를 크게 바꾸지 않고, AI 모달에서 preflight를 끝냅니다.

#### 대상 파일
1. `constants.tsx`
2. `components/AIImageInputModal.tsx`

#### 스니펫 A - `constants.tsx`

```ts
aiSellQuantityExceedsHoldings: (
  stock: string,
  availableQuantityText: string,
  requestedQuantityText: string,
) =>
  `${stock} 보유 ${availableQuantityText}주를 초과한 ${requestedQuantityText}주 매도는 저장할 수 없습니다. 선택한 거래를 조정해주세요.`,
aiTradeSaveError:
  'AI 인식 거래 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
```

영문도 같은 구조로 추가합니다.

#### 스니펫 B - `components/AIImageInputModal.tsx`

```ts
import { useRef } from 'react';
import { formatShareQuantity } from '../src/utils/tradeModalCalculations';
import { validateSelectedTradesAgainstHoldings } from '../utils/tradeSellValidation';

const MAX_SHARE_DECIMAL_PLACES = 4;

const AIImageInputModal: React.FC<AIImageInputModalProps> = ({
  lang,
  portfolio,
  geminiApiKey,
  isPaidUser,
  currentTier,
  onClose,
  onSave,
}) => {
  const t = I18N[lang];
  const isSavingRef = useRef(false);

  const handleConfirmSave = async (): Promise<void> => {
    if (isSavingRef.current) {
      return;
    }

    if (selectedIndexes.size === 0) {
      onClose();
      return;
    }

    const selectedTrades = recognizedTrades
      .map((recognizedTrade, index) => ({ recognizedTrade, index }))
      .filter(({ index }) => selectedIndexes.has(index))
      .map(({ recognizedTrade, index }) => toTrade(recognizedTrade, index));

    const sellLimitViolation = validateSelectedTradesAgainstHoldings(
      portfolio.trades,
      selectedTrades,
    );

    if (sellLimitViolation != null) {
      setErrorMessage(
        t.aiSellQuantityExceedsHoldings(
          sellLimitViolation.stock,
          formatShareQuantity(
            sellLimitViolation.availableQuantity,
            MAX_SHARE_DECIMAL_PLACES,
          ),
          formatShareQuantity(
            sellLimitViolation.requestedQuantity,
            MAX_SHARE_DECIMAL_PLACES,
          ),
        ),
      );
      return;
    }

    isSavingRef.current = true;

    try {
      setErrorMessage(null);
      await Promise.resolve(onSave(selectedTrades, rewardWatched));
      onClose();
    } catch (error: unknown) {
      console.error('[AIImageInputModal] save failed', error);
      setErrorMessage(t.aiTradeSaveError);
    } finally {
      isSavingRef.current = false;
    }
  };

  return (
    // ...기존 렌더링...
  );
};
```

#### 스니펫 C - 결과 단계 에러 표시

```tsx
{errorMessage != null ? (
  <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/50 dark:bg-rose-500/10 p-4">
    <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
      {errorMessage}
    </p>
  </div>
) : null}
```

#### Phase C 메모
1. 검증 실패 시 `step`을 `error`로 바꾸지 않습니다. 결과 화면을 유지해야 사용자가 offending trade만 체크 해제하고 다시 저장할 수 있기 때문입니다.
2. AI 검증은 체크된 거래만 본다는 점이 핵심입니다. 인식 결과 전체를 대상으로 검증하면 사용자가 제외한 거래 때문에 저장이 막히는 역효과가 생깁니다.
3. 저장 버튼의 `disabled`만으로는 1-tick repaint gap을 막지 못하므로, `useRef` mutex를 별도로 둡니다.
4. mutex는 `await Promise.resolve(onSave(...))`가 끝날 때까지 유지해야 합니다. 동기 `finally`로 즉시 풀면 더블 클릭 방지가 무의미해집니다.
5. `useRef`는 반드시 `AIImageInputModal` 컴포넌트 바디 내부에 선언해 Invalid Hook Call 여지를 없앱니다.
6. AI 수량 표시 소수점 정책도 `MAX_SHARE_DECIMAL_PLACES` 상수 하나로 고정합니다.
7. 이번 단계는 AI 저장 preflight와 저장 mutex만 추가합니다. 저장 후 광고/모달 종료 흐름은 기존 코드를 유지합니다.

### 3.4 Phase C UI - AI 예방 문구 추가

핵심은 **검증 로직이 실제로 실행되기 전에도**, 사용자가 "보유 수량을 넘는 매도는 저장되지 않는다"는 규칙을 먼저 이해하도록 만드는 것입니다.  
이 단계는 새로운 상태나 effect를 추가하지 않는 **정적 안내 문구**만 다루며, 렌더 트리를 흔드는 구조 변경은 하지 않습니다.

#### 대상 파일
1. `constants.tsx`
2. `components/AIImageInputModal.tsx`

#### 스니펫 A - `constants.tsx`

```ts
aiRecognizedTradesSaveGuide:
  '실제로 포트폴리오에 반영할 매매만 선택한 뒤, 아래에서 확인 후 저장해 주세요.',
aiSellQuantityPreventativeNotice:
  '기존 보유 수량 내에서만 매도 저장이 가능해요. 에러시 매수 내역 먼저 저장해 주세요.',
```

영문도 같은 위치에 등록합니다.  
이 모달은 현재 `tradeMessages`가 아니라 `constants.tsx`의 `I18N`을 사용하므로, 이번 단계에서는 기존 SSOT를 따릅니다.

#### 스니펫 B - `components/AIImageInputModal.tsx`

```tsx
<p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
  {t.aiRecognizedTradesSaveGuide}
</p>
<p className="mt-1.5 flex items-start gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400">
  <span aria-hidden="true" className="shrink-0">
    💡
  </span>
  <span>{t.aiSellQuantityPreventativeNotice}</span>
</p>
```

위치는 반드시 **기존 회색 안내 문구 바로 아래**, 그리고 **하단 버튼 영역 바로 위**로 유지합니다.

#### 스니펫 C - JSX 구조 안전 메모

```ts
// 새 state / effect / callback 추가 없음
// 기존 `t = I18N[lang]` 참조만 재사용
// 조건부 분기 추가 없음 -> 결과 단계 subtree shape 유지
```

#### Phase C UI 메모
1. 예방 문구는 검증 에러 메시지와 역할이 다릅니다. 에러 발생 후 설명이 아니라, 저장 전에 규칙을 미리 알려 사용자의 시행착오를 줄이는 copy입니다.
2. 새 상태를 만들지 않고 기존 `t` 객체에 키 하나만 추가하므로, 불필요한 리렌더 원인을 만들지 않습니다.
3. 아이콘은 장식 요소이므로 `aria-hidden="true"`를 붙여 텍스트만 읽히게 합니다.
4. 현재 `AIImageInputModal`은 `constants.tsx`의 `I18N`을 사용하므로, 이 문구만 별도 사전으로 빼지 않습니다. 한 컴포넌트 안의 copy SSOT를 유지하는 쪽이 이번 범위에서는 더 단순합니다.

### 3.5 Phase C UI - 업로드 뷰 API 지연 예방 문구 추가

핵심은 **업로드/스캔 시작 전 단계**에서, 사용자 몰림으로 AI 스캔이 일시 실패할 수 있음을 미리 알려 재시도 기대치를 맞추는 것입니다.  
이 단계도 상태나 effect를 추가하지 않는 **정적 안내 문구**만 다루며, 기존 업로드 카드 하단 안내 블록 안에 한 줄을 추가하는 수준으로 유지합니다.

#### 대상 파일
1. `constants.tsx`
2. `components/AIImageInputModal.tsx`

#### 스니펫 A - `constants.tsx`

```ts
aiUploadGuide:
  '증권사 앱의 체결 내역 화면을 캡쳐해서 올려주시면 자동으로 정보를 입력합니다.',
aiUploadDelayNotice:
  '요청이 많아 실패할 경우, 잠시 후 다시 시도해 주세요.',
```

영문도 같은 위치에 등록합니다.  
이 모달은 현재 `I18N[lang]`을 직접 사용하므로, 이번 문구도 같은 사전 안에 두는 것이 SSOT 원칙에 맞습니다.

#### 스니펫 B - `components/AIImageInputModal.tsx`

```tsx
<div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
  <Sparkles size={14} className="text-amber-500 shrink-0" />
  <span>{t.aiUploadGuide}</span>
</div>
<p className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
  {t.aiUploadDelayNotice}
</p>
```

위치는 반드시 **업로드 뷰의 기존 스캔 안내 문구 바로 아래 줄**로 유지합니다.  
메인 문구보다 시각적 위계를 한 단계 낮추기 위해 `text-xs`와 회색 계열만 사용하고, 별도 강조색은 주지 않습니다.

#### 스니펫 C - 시니어 리뷰 메모

```ts
// 새 state / effect / callback 추가 없음
// 기존 `t = I18N[lang]` 참조만 재사용
// 업로드 뷰 subtree에 정적 텍스트 노드 1개만 추가 -> AST 구조와 렌더 비용 영향 미미
```

#### Phase C UI 업로드 메모
1. 이 문구는 에러 메시지가 아니라 사전 기대치 조정용 copy입니다. 실제 실패 처리(`aiScanRateLimit`, `aiScanError`)를 대체하지 않습니다.
2. 기존 안내 문구와 같은 영역 안에 두되, 더 작은 글자와 중립 색상으로 위계를 낮춰 메인 기능을 방해하지 않게 합니다.
3. 기존 `Sparkles` 행을 유지하고 그 아래에 텍스트만 추가하므로, 레이아웃 리스크와 불필요한 리렌더 가능성은 매우 낮습니다.

## 4. 시뮬레이션 체크리스트

1. 최신순 저장 거래 배열에서도 현재 보유 수량 조회 결과가 정확한가
2. 수동 매도 입력에서 보유 초과 수량이 즉시 검증되는가
3. 동일 수량 전량 매도는 허용되는가
4. `noHoldings`가 초과 매도 메시지보다 우선하는가
5. `HOLDINGS_QTY_EPSILON` 때문에 부동소수점 잔차가 있어도 전량 매도가 허용되는가
6. 기초 입력 오류가 있는 경우 초과 매도 검증이 실행되지 않는가
7. AI 검증이 선택된 거래만 대상으로 하는가
8. 선택된 거래를 현재 저장 순서대로 누적 적용하는가
9. 앞선 선택 거래가 보유를 감소시킨 뒤의 초과 매도를 차단하는가
10. AI 저장 버튼을 같은 틱에 연속 클릭해도 `onSave`는 1회만 호출되는가
11. AI 저장 실패 후 mutex가 해제되어 사용자가 재시도할 수 있는가

위 11개를 `docs2/sell-quantity-guard-refactor-simulation-snippets.ts`와 `docs2/sell-quantity-guard-refactor-simulation.test.ts`에서 자동 검증합니다.
