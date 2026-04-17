# 실현손익 tone 정렬 리팩토링 시뮬레이션 계획서

> 목적: `Dashboard` 포트폴리오 카드의 "실현손익" 행에서 화살표와 색상을 `yieldRate`가 아니라 `realizedProfit` 부호 기준으로 정렬합니다.  
> 원칙: 실제 프로덕션 코드는 아직 바꾸지 않고, 먼저 시뮬레이션으로 "실현손익 숫자/색/화살표 의미 일치" 불변식을 통과시킨 뒤 구현에 들어갑니다.  
> 실행 하네스: `docs2/realized-profit-tone-refactor-simulation-snippets.ts`  
> 자동 실행 게이트: `docs2/realized-profit-tone-refactor-simulation.test.ts`

## 0. 범위와 비범위

### 0.1 이번 단계에서 해결할 범위
1. `Dashboard` 카드의 `realizedProfitText`와 같은 행의 화살표 아이콘/텍스트 색이 같은 의미를 보도록 맞춥니다.
2. 실현손익 행은 표시 자릿수 기준으로 반올림한 뒤 `positive` / `negative` / `neutral` tone을 결정합니다.
3. 반올림 결과 `0.00`인 실현손익은 상승/하락이 아닌 neutral tone으로 표시합니다.
4. `yieldRate`는 계속 상단 ROI 배지 전용으로만 사용합니다.
5. tone별 Tailwind 클래스 선택은 helper 상단의 매핑 객체 한 곳으로 모읍니다.
6. 실현손익 방향 아이콘은 `aria-hidden="true"`로 렌더링해 스크린 리더가 부호와 방향을 중복 낭독하지 않게 합니다.
7. 변경은 `components/Dashboard.tsx` 내부의 순수 helper와 view-model wiring으로 제한합니다.

### 0.2 이번 단계에서 하지 않을 것
1. `buildPortfolioMetricsSnapshot()`, `calculateYieldPercent()`, `realizedProfit` 산식 자체는 바꾸지 않습니다.
2. `SettlementModals`, `History`, 상세 모달 등 다른 화면의 손익 표시는 건드리지 않습니다.
3. 새 전역 store, 새 endpoint, 새 라이브러리는 추가하지 않습니다.
4. ROI 배지의 0% 처리 정책(0도 비음수로 간주)은 이번 단계에서 유지합니다.
5. 실현손익 숫자 포맷(`formatSignedUsdValue`)은 유지하고, tone 판단 기준만 분리합니다.
6. 로딩 점(`...`)은 언어 의존 문구가 아니므로, 이번 단계에서는 새 i18n 키를 만들지 않고 `Dashboard.tsx` 상단 상수로만 추출합니다.

## 1. 현재 문제 요약

현재 `Dashboard` 카드에서는 아래 두 정보원이 섞여 있습니다.

1. 실현손익 숫자: `realizedProfit`
2. 실현손익 행의 색/화살표: `isYieldPositive` (`yieldRate` 기반)

즉 **한 줄 안에서 숫자는 "실현손익", 색과 화살표는 "수익률"**을 보고 있어 의미가 어긋납니다.

예:

1. `yieldRate = 0.0%`
2. `realizedProfit = -$5.26`

이 경우 실제 손실이 이미 실현되었더라도, 행 전체는 초록 + 상승 화살표로 보일 수 있습니다.  
사용자 입장에서는 "손실 숫자 앞에 왜 상승 화살표가 붙는가?"라는 혼란이 생깁니다.

## 2. 통과 게이트

아래 조건이 모두 맞아야 실제 구현을 시작합니다.

1. `yieldRate`가 0 이상이어도 `realizedProfit`이 음수면 실현손익 행은 loss tone이어야 합니다.
2. `yieldRate`가 음수여도 `realizedProfit`이 양수면 실현손익 행은 gain tone이어야 합니다.
3. `realizedProfit`이 표시 자릿수 기준으로 `0.00`으로 반올림되면 실현손익 행은 neutral tone이어야 하며, false up/down cue를 주면 안 됩니다.
4. ROI 배지는 계속 `yieldRate` tone만 따라야 하며, realized profit tone 변경 때문에 뒤집히면 안 됩니다.
5. 실현손익 숫자 문자열은 계속 `formatSignedUsdValue(realizedProfit, 2)` 결과를 사용해야 합니다.
6. 실현손익 방향 아이콘은 SVG 아이콘(`TrendingUp`, `TrendingDown`, `Circle`)로 렌더링되고 `aria-hidden="true"`가 붙어야 합니다.
7. 색상/배지 클래스는 raw string 분기 대신 tone 매핑 객체에서 조회되어야 합니다.
8. 새 hook/state/effect를 추가하지 않고 기존 `Dashboard` view-model/props 범위에서 끝나야 합니다.
9. `docs2/realized-profit-tone-refactor-simulation.test.ts`가 전부 통과해야 실제 구현을 시작합니다.

## 3. 리팩토링 계획

### 3.1 Phase A - tone helper 정규화

핵심은 **표시 자릿수와 tone 판정을 같은 기준으로 맞추는 것**입니다.  
실현손익이 `-$0.004`처럼 미세한 값이면 화면에는 `$0.00`으로 보이므로, tone도 neutral이어야 의미가 맞습니다.

#### 대상 파일
1. `components/Dashboard.tsx`

#### 스니펫 A - `components/Dashboard.tsx`

```ts
const USD_DISPLAY_DECIMAL_PLACES = 2;
const ROI_DISPLAY_DECIMAL_PLACES = 1;
const LOADING_ELLIPSIS_LABEL = '...';

const TONE_TEXT_COLOR_MAP: Record<DashboardChangeTone, string> = {
  positive: 'text-emerald-500',
  negative: 'text-rose-500',
  neutral: 'text-slate-400 dark:text-slate-500',
};

const TONE_BADGE_CLASS_MAP: Record<DashboardChangeTone, string> = {
  positive: 'bg-emerald-500 text-white',
  negative: 'bg-rose-500 text-white',
  neutral: 'bg-slate-500 text-white',
};

const TONE_ROTATION_CLASS_MAP: Record<DashboardChangeTone, string> = {
  positive: '',
  negative: 'rotate-180',
  neutral: '',
};

const REALIZED_PROFIT_INDICATOR_KEY_MAP: Record<
  DashboardChangeTone,
  'up' | 'down' | 'none'
> = {
  positive: 'up',
  negative: 'down',
  neutral: 'none',
};

function getChangeTone(
  value: number,
  digits: number = USD_DISPLAY_DECIMAL_PLACES,
): DashboardChangeTone {
  const rounded = getRounded(value, digits);
  if (rounded > 0) {
    return 'positive';
  }
  if (rounded < 0) {
    return 'negative';
  }
  return 'neutral';
}

function getRealizedProfitIndicatorKey(
  tone: DashboardChangeTone,
): 'up' | 'down' | 'none' {
  return REALIZED_PROFIT_INDICATOR_KEY_MAP[tone];
}
```

#### Phase A 메모
1. `getChangeTone()`에 `digits` 파라미터를 두는 이유는 tone 판정이 화면 표기 자릿수와 어긋나지 않게 하기 위해서입니다.
2. `neutral`을 별도로 두지 않으면 `-$0.004` 같은 tiny residual이 `$0.00`으로 보이면서도 빨강/하락으로 잘못 보일 수 있습니다.
3. 색/배지/회전/방향 key는 모두 매핑 객체로 고정해 디자인 정책 변경 시 수정 지점을 한 곳으로 제한합니다.
4. `DashboardChangeTone` 기존 union을 재사용해 타입 surface를 넓히지 않습니다.

### 3.2 Phase B - view model에서 yield tone과 realized tone 분리

핵심은 **수익률 badge tone**과 **실현손익 row tone**을 서로 다른 필드로 분리하는 것입니다.  
숫자 포맷은 유지하고, "어느 tone을 어느 위치에 연결하는가"만 바로잡습니다.

#### 대상 파일
1. `components/Dashboard.tsx`

#### 스니펫 B - `components/Dashboard.tsx`

```ts
interface PortfolioCardViewProps {
  // ...existing props...
  valuationText: string;
  realizedProfitText: string;
  roiText: string;
  yieldTone: DashboardChangeTone;
  realizedProfitTone: DashboardChangeTone;
  isMetricsLoading: boolean;
  // ...existing props...
}

const cardVm = {
  detailsAriaLabel: copy.openDetailsAria(portfolioName),
  executionAriaLabel: copy.openExecutionAria(portfolioName),
  valuationText: isMetricsLoading
    ? LOADING_ELLIPSIS_LABEL
    : formatUsdValue(currentValuation, USD_DISPLAY_DECIMAL_PLACES),
  realizedProfitText: isMetricsLoading
    ? LOADING_ELLIPSIS_LABEL
    : formatSignedUsdValue(realizedProfit, USD_DISPLAY_DECIMAL_PLACES),
  roiText: isMetricsLoading
    ? LOADING_ELLIPSIS_LABEL
    : formatSignedPercent(yieldRate, ROI_DISPLAY_DECIMAL_PLACES),
  yieldTone: isMetricsLoading
    ? 'neutral'
    : getChangeTone(yieldRate, ROI_DISPLAY_DECIMAL_PLACES),
  realizedProfitTone: isMetricsLoading
    ? 'neutral'
    : getChangeTone(realizedProfit, USD_DISPLAY_DECIMAL_PLACES),
  strategyName: copy.strategyName[strategyKind],
  canOpenVrOrders: portfolio.vrSnapshot != null,
};

<PortfolioCardView
  // ...existing props...
  valuationText={cardVm.valuationText}
  realizedProfitText={cardVm.realizedProfitText}
  roiText={cardVm.roiText}
  yieldTone={cardVm.yieldTone}
  realizedProfitTone={cardVm.realizedProfitTone}
  isMetricsLoading={isMetricsLoading}
  // ...existing props...
/>
```

#### Phase B 메모
1. `yieldTone`과 `realizedProfitTone`을 분리해야 "수익률은 수익률 자리", "실현손익은 실현손익 자리"에서만 쓰이게 됩니다.
2. loading 중에는 `neutral`을 사용해 아직 숫자가 없는 상태에서 gain/loss cue를 먼저 그리지 않게 합니다.
3. `LOADING_ELLIPSIS_LABEL`은 새 전역 i18n 사전을 도입하지 않으면서도 inline literal 반복을 제거하는 최소 변경입니다.
4. 새 state나 memo를 추가하지 않아도 현재 `cardVm` 단계에서 충분히 해결 가능합니다.

### 3.3 Phase C - `PortfolioCardView` 렌더 연결

핵심은 **ROI badge는 기존 정책을 유지**하고, **실현손익 행만 별도 tone helper를 쓰게** 만드는 것입니다.

#### 대상 파일
1. `components/Dashboard.tsx`

#### 스니펫 C - `components/Dashboard.tsx`

```tsx
import {
  Camera,
  Circle,
  Target,
  TrendingDown,
  TrendingUp,
  // ...other icons...
} from 'lucide-react';

const roiBadgeClassName = TONE_BADGE_CLASS_MAP[yieldTone];
const roiIconClassName = TONE_ROTATION_CLASS_MAP[yieldTone];
const realizedProfitTextClassName = TONE_TEXT_COLOR_MAP[realizedProfitTone];
const realizedProfitIndicatorKey =
  getRealizedProfitIndicatorKey(realizedProfitTone);
const realizedProfitIndicatorIconMap: Record<
  'up' | 'down' | 'none',
  React.ReactElement
> = {
  up: <TrendingUp size={12} />,
  down: <TrendingDown size={12} />,
  none: <Circle size={4} className="fill-current" />,
};
const realizedProfitIndicatorIcon =
  realizedProfitIndicatorIconMap[realizedProfitIndicatorKey];

<div
  className={`absolute -top-2 left-1/2 -translate-x-1/2 z-20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg ${roiBadgeClassName}`}
>
  <TrendingUp
    size={10}
    className={roiIconClassName}
    aria-hidden="true"
  />
  <span className="text-[10px] font-black">
    {isMetricsLoading ? LOADING_ELLIPSIS_LABEL : roiText}
  </span>
</div>

<p
  className={`text-2xl font-black tracking-tight leading-tight flex items-center gap-1 ${realizedProfitTextClassName}`}
>
  <span className="text-[11px] flex items-center" aria-hidden="true">
    {realizedProfitIndicatorIcon}
  </span>
  <span>{realizedProfitText}</span>
</p>
```

#### Phase C 메모
1. ROI badge는 계속 `yieldTone`만 사용하므로 기존 의미를 유지합니다.
2. 실현손익 행은 더 이상 `yieldTone`을 참조하지 않으므로 지표 의미가 섞이지 않습니다.
3. 방향 아이콘에 `aria-hidden="true"`를 넣어 스크린 리더가 아이콘 방향과 `+/-` 부호를 중복 낭독하지 않게 합니다.
4. realized profit indicator는 key → icon 매핑 객체로 평탄화해 JSX 바디의 삼항 분기를 제거합니다.
5. `realizedProfitText` 자체는 이미 `+/-` 부호를 포함하므로, 이번 단계는 tone과 direction cue만 바로잡으면 됩니다.

## 4. 시뮬레이션 실행

아래 명령이 통과되어야 실제 구현에 들어갑니다.

```bash
npx vitest run --config docs2/realized-profit-tone-vitest.config.ts
```

예상 통과 항목:

1. 양수 수익률 + 음수 실현손익에서도 실현손익 행이 loss tone을 유지하는지
2. 음수 수익률 + 양수 실현손익에서도 실현손익 행이 gain tone을 유지하는지
3. 반올림 결과 `0.00`인 실현손익이 neutral tone으로 표시되는지
4. loading 상태에서 실현손익 행이 direction cue를 선행하지 않는지
5. 방향 아이콘 key와 `aria-hidden` 정책이 시뮬레이션 데이터에서 분리돼 있는지
