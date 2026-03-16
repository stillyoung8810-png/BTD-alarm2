# VR 밴드 코드 리뷰 — 유지보수성·클린코드 관점 (비판)

**역할**: 구글/메타 스타일 시니어 리뷰어. 칭찬 생략.

**대상**: 계획서(VR_BAND_UI_IMPLEMENTATION_PLAN.md), types.ts, utils/vrBandStrategy.ts, components/VrOrderModal.tsx, VrPortfolioSummary.tsx, VrBadge.tsx

---

## 발견된 문제점 리스트 (중요도 순)

### 1. [Dead Code] VrOrderModal — 선언만 하고 사용하지 않는 변수
- **위치**: `VrOrderModal.tsx` L163.
- **내용**: `const config = TABLE_CONFIG[activeTab];` 선언 후 **어디에서도 사용하지 않음**. 탭 버튼은 `(['sell', 'buy'] as const).map` 안에서 `TABLE_CONFIG[tabId]`를 직접 참조함.
- **영향**: 린트가 경고하지 않으면 그대로 남아 코드만 지저분해짐.

### 2. [DRY 위반] VR 관련 i18n이 세 곳에 파편화
- **위치**: VrOrderModal `LABELS`, VrPortfolioSummary `getVrFallbackMessage` + 인라인 문자열, VrBadge `BADGE_CONFIG`.
- **내용**: 계획서 §6에서는 "VR 문구는 **한 곳(constants.tsx 또는 vrMessages)** 에만 정의, 모달·요약·배지는 해당 모듈만 import" 라고 했으나, 구현은 **각 컴포넌트 파일에 문자열·설정이 흩어져 있음**.
- **영향**: 문구 수정 시 여러 파일을 찾아 수정해야 하고, ko/en 불일치 위험 증가.

### 3. [Error/Edge Case] VrSnapshot.buyOrders / sellOrders 미방어
- **위치**: `VrPortfolioSummary.tsx` — `vrSnapshot.buyOrders`, `vrSnapshot.sellOrders`를 그대로 `VrOrderModal`에 전달.
- **내용**: 타입상 `VrSnapshot`은 `buyOrders: OrderLevel[]` 로 정의되어 있으나, **백엔드/직렬화 오류**로 `undefined`가 올 수 있음. 그때 `orders.map` 등에서 런타임 예외.
- **영향**: 데이터 이상 시 화면 크래시.

### 4. [계획서·구현 불일치] prop 이름 vrBand vs vrSettings
- **위치**: 계획서 §4.1.1·§4.3.1은 **`vrBand`** 로 기재, `VrPortfolioSummaryProps`는 **`vrSettings`** 사용.
- **내용**: SSOT·문서와 코드 일치 원칙 위반. 새로 합류한 개발자가 계획서를 보고 코드를 찾을 때 혼란.
- **영향**: 유지보수·온보딩 비용 증가.

### 5. [Cognitive Complexity] Fallback/배지 라벨의 이중 분기
- **위치**: `getVrFallbackMessage` (isError + lang), `VrBadge`의 `label = lang === 'ko' ? config.textKo : config.textEn`.
- **내용**: 조건이 두 개 결합된 분기. **매핑 객체**(예: `{ ko: { error: '...', pending: '...' }, en: { ... } }`)로 한 번에 선택하면 Flat해짐.
- **영향**: 가독성·확장 시 실수 가능성.

### 6. [타입·확장성] TABLE_COLUMNS.id가 keyof OrderLevel 전체
- **위치**: `VrOrderModal.tsx` — `id: keyof OrderLevel`.
- **내용**: `OrderLevel`에는 `isBuffer`, `sharesAfter`, `poolAfter` 등이 있어, 이론상 `id: 'isBuffer'` 같은 컬럼도 올 수 있음. `defaultCellContent`는 숫자 가정으로 `toDisplayNumber(raw, 0)` 호출. **실제 사용 컬럼만** (`'step'|'price'|'qty'|'costOrProceeds'`) 로 제한하는 편이 안전함.
- **영향**: 잘못된 id 추가 시 타입으로 막기 어렵고, 런타임에서만 이상 동작 발견 가능.

### 7. [Anti-pattern] 탭 이모지 하드코딩
- **위치**: `VrOrderModal.tsx` — `{tabId === 'sell' ? '🔴 ' : '🔵 '}`.
- **내용**: "어떻게 보여줄지"는 TABLE_CONFIG에 두기로 한 데이터 드리븐 원칙과 맞지 않음. 탭별 **아이콘/이모지**도 TABLE_CONFIG(또는 동일한 설정 소스)에 넣고 `tabConfig.tabIcon` 등으로 참조하면 일관됨.
- **영향**: 작은 반복이지만, 설정과 렌더가 분리되어 있지 않음.

### 8. [유틸 설계] validateFinancialArgs — rules에 없는 키는 검증 생략
- **위치**: `vrBandStrategy.ts` — `validateFinancialArgs` 내부 `if (!rule) continue;`.
- **내용**: `args`에 있는 키가 `rules`에 없으면 **아무 검증도 하지 않고 통과**시킴. 실수로 `rules`에서 `feeRate`를 빼먹으면 feeRate는 검증되지 않음. 반대로 `rules`에만 있고 `args`에 없으면 순회 대상이 아니어서 무시됨.
- **영향**: 검증 누락 버그가 조용히 발생할 수 있음. `args`의 모든 키에 대해 `rules`에 대응 규칙이 있어야 한다는 **계약**이 코드/주석에 없음.

### 9. [계획서 구버전] §5.1 코드 블록이 현재 구현과 다름
- **위치**: 계획서 — calculatePoolDelta 예시가 **assertFiniteNumber / assertPositive / assertNonNegative** 조합으로 되어 있음.
- **내용**: 실제 구현은 **validateFinancialArgs** 단일 호출 방식. 계획서가 이전 리팩터링 결과를 반영하지 않음.
- **영향**: 계획서를 따라 구현하면 현재 코드와 다른 스타일이 되어 일관성 깨짐.

### 10. [계획서] §2.1 metadata 요구사항에 any 기재
- **위치**: 계획서 "metadata?: { pool_after?: number; [key: string]: any; } 형태로".
- **내용**: 구현과 리뷰에서 **any 금지, [key: string]: unknown** 으로 정리했는데, 계획서 본문에는 여전히 `any`가 남아 있음.
- **영향**: 타입 엄격함 원칙과 문서 불일치.

---

## 리팩토링된 개선 코드 제안

### 1. VrOrderModal — Dead 변수 제거
```diff
-  const config = TABLE_CONFIG[activeTab];
   const orders = activeTab === 'sell' ? sellOrders : buyOrders;
```

### 2. VR i18n 단일 소스 (constants 또는 vrMessages)
- **제안**: `constants/vrMessages.ts` (또는 기존 `constants.tsx` 확장)에 다음을 정의하고, VR 컴포넌트는 여기만 import.
  - 모달: title, tabSell, tabBuy, step, price, qty, costOrProceeds, guide.
  - 요약: fallback.error.ko, fallback.error.en, fallback.pending.ko, fallback.pending.en, buttonLabel, maxBuyHint (N 대입).
  - 배지: lump_sum / accumulate / withdraw 의 textKo, textEn, classes.
- **VrPortfolioSummary**: `getVrFallbackMessage` 제거, `VR_MESSAGES.fallback[lang][isError ? 'error' : 'pending']` 등으로 치환.
- **VrBadge**: BADGE_CONFIG 텍스트·classes를 constants에서 가져오거나, BADGE_CONFIG만 constants로 이전.

### 3. VrPortfolioSummary — buyOrders/sellOrders 방어
```tsx
<VrOrderModal
  buyOrders={vrSnapshot.buyOrders ?? []}
  sellOrders={vrSnapshot.sellOrders ?? []}
  ...
/>
```

### 4. 계획서·코드 prop 이름 통일
- **옵션 A**: 계획서를 구현에 맞춰 **vrSettings** 로 통일.
- **옵션 B**: 구현을 계획서에 맞춰 **vrSettings → vrBand** 로 리네이밍 (Dashboard에서 넘기는 prop 이름 포함).

### 5. getVrFallbackMessage / VrBadge 라벨 — 매핑으로 Flat
```ts
// 예: getVrFallbackMessage 대체
const VR_FALLBACK: Record<AppLang, { error: string; pending: string }> = {
  ko: { error: '전략 데이터 생성에 실패했거나...', pending: '로봇이 전략 데이터를 계산 중입니다...' },
  en: { error: 'Strategy data failed to load...', pending: 'Calculating strategy data...' },
};
// 사용: VR_FALLBACK[lang][isError ? 'error' : 'pending']
```
```tsx
// VrBadge
const label = config[lang === 'ko' ? 'textKo' : 'textEn'];
// 또는 BADGE_CONFIG를 Record<VrMode, Record<AppLang, string>> 형태로 바꾸면
// const label = config[lang];
```

### 6. TABLE_COLUMNS.id 타입 좁히기
```ts
type OrderTableColumnId = 'step' | 'price' | 'qty' | 'costOrProceeds';

const TABLE_COLUMNS: Array<{
  id: OrderTableColumnId;
  labelKey: keyof (typeof LABELS)['ko'];
  ...
}> = [ ... ];
```
- `defaultCellContent`에서 `order[column.id]`는 항상 숫자 컬럼만 오므로 타입도 명확해짐.

### 7. TABLE_CONFIG에 탭 이모지 추가
```ts
const TABLE_CONFIG: Record<TabId, {
  tabLabelKey: 'tabSell' | 'tabBuy';
  tabIcon: string;  // '🔴 ' / '🔵 '
  ...
}> = {
  sell: { ..., tabIcon: '🔴 ' },
  buy:  { ..., tabIcon: '🔵 ' },
};
// 렌더: {t[tabConfig.tabLabelKey]} → {tabConfig.tabIcon}{t[tabConfig.tabLabelKey]}
```

### 8. validateFinancialArgs — args와 rules 일치 강제 (선택)
- **옵션 A**: 주석/문서로 "args의 모든 키에 대해 rules에 규칙이 있어야 함" 명시.
- **옵션 B**: 검증 루프 전에 `const ruleKeys = new Set(Object.keys(rules)); Object.keys(args).forEach(k => { if (!ruleKeys.has(k)) throw new Error(\`Missing rule for ${k}\`); });` 로 런타임 체크 추가.

### 9. 계획서 §5.1 코드 블록 갱신
- calculatePoolDelta 예시를 **validateFinancialArgs** 한 번 호출하는 현재 구현과 동일하게 수정.
- assertFiniteNumber/assertPositive 예시 블록은 "이전 방식" 참고용으로 옮기거나 삭제.

### 10. 계획서 §2.1 metadata 문구 수정
- `[key: string]: any` → `[key: string]: unknown` 으로 변경.

---

이 문서는 계획서 §9.5 "유지보수성·클린코드 리뷰" 및 "코드 품질 최종 리팩토링" 항목과 연계하여, 체크리스트에 "VR_BAND_CODE_REVIEW.md 반영"을 추가해 추적하는 것을 권장한다.
