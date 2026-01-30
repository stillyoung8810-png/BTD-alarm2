# useEffect 무한 루프 후보 전수 조사 리포트 (재검사)

**최종 조사일**: 2026-01-30  
**범위**: 프로젝트 전체 `useEffect` — 의존성 배열·setState·콜백 전달 패턴 재검사.

---

## 이전 검사에서 다분할 알람 무한루프를 놓친 이유

1. **검사 초점**: 이전 문서는 **App → Dashboard** 로 넘기는 콜백(`onDailyExecutionSummaryChange`)만 강조했고, App에서 이미 `useCallback`으로 고정돼 있어 “주의” 수준으로만 기록됨.
2. **실제 원인**: 무한루프는 **Dashboard → PortfolioCard** 로 넘기는 **카드별 콜백** `onDailyExecutionBlock` 에서 발생함.
   - `portfolios.map(p => <PortfolioCard ... onDailyExecutionBlock={(block) => setDailyExecutionBlocks(prev => ({ ...prev, [p.id]: block }))} />)` 처럼 **매 렌더마다 새 함수 참조**가 생성됨.
   - 자식 effect에는 **콜백이 의존성에 없었음** → “의존성에 콜백 없음 = 안전”으로 보기 쉬움.
   - 다분할만 문제인 이유: **비동기 `multiSplitExecutionData`** 가 도착할 때 effect가 다시 실행되고, 그때 콜백을 호출 → 부모 `setDailyExecutionBlocks` → 부모 리렌더 → **새 콜백 참조**가 모든 카드에 전달. 이후 effect가 다른 의존성(`multiSplitExecutionData` 등)으로 인해 한 번 더 돌거나, 콜백을 나중에 의존성에 넣는 경우 **effect → setState → 리렌더 → 새 콜백 → effect** 루프 가능.
3. **교훈**: “콜백을 의존성에 넣지 않았다”만으로는 부모가 **매번 새 콜백을 넘기는 패턴**을 제거한 것이 아님. **부모는 안정된 콜백(useCallback 또는 (id, block) 시그니처로 하나만)** 을 넘기고, **자식은 ref로 최신 콜백만 참조·의존성에서 제외**하는 패턴이 필요함.

---

## 요약 (현재 상태)

| 구분 | 개수 | 비고 |
|------|------|------|
| **고위험 (무한 루프 가능성)** | 0 | 다분할 알람 루프 수정 반영 후 해당 패턴 제거됨 |
| **주의 (불필요한 재실행·객체 의존성)** | 1 | Dashboard PortfolioCard `[portfolio]` ref 동기화 1곳 |
| **안전 (원시값/ref/가드)** | 나머지 | useCallback·원시값 의존·ref 가드 적용됨 |

---

## 1. 수정 완료된 항목 (반영됨)

- **Dashboard → PortfolioCard `onDailyExecutionBlock`**
  - 부모: **`setDailyExecutionBlockForId`** 를 `useCallback((id, block) => setDailyExecutionBlocks(...), [])` 로 고정해 **동일 참조**로 모든 카드에 전달.
  - 자식: **`onDailyExecutionBlockRef.current`** 에만 콜백을 넣고 effect **의존성 배열에 콜백 미포함** → 부모 리렌더로 인한 반복 실행 차단.
- **App `onDailyExecutionSummaryChange`**: `useCallback(..., [])` 유지.
- **QuickInputModal**: L45 `[portfolio.id, targetStockForDate]`, L83 원시값, L91/L102 원시값만 의존성으로 사용.
- **Dashboard quarterStopLossData effect**: `[portfolio.id, portfolio.trades.length, ...]` 등 **원시값만** 의존성.
- **PortfolioDetailsModal**: L86 `[portfolio.id, portfolio.trades.length, isReadOnly]`.

---

## 2. 주의 구간 (무한루프 아님, 개선 권장)

### 2-1. `components/Dashboard.tsx` (PortfolioCard) – portfolioRef 동기화

| 위치 | 의존성 배열 | effect 내 setState | 위험 요약 |
|------|-------------|--------------------|-----------|
| **L708** | `[portfolio]` | 없음 (ref 할당만) | **전체 `portfolio` 객체** 의존. 부모가 매 렌더 새 `portfolio` 참조를 넘기면 effect가 매번 실행됨. **setState 없어 무한루프는 아님.** |

- **권장**: `portfolioRef.current = portfolio` 는 “portfolio가 바뀔 때마다 최신으로 유지”가 목적이므로, 의존성을 **`[portfolio.id, portfolio.trades.length, portfolio.alarmconfig?.enabled]`** 등 필요한 원시값으로 줄이면 불필요한 재실행만 줄일 수 있음. (선택 사항.)

---

## 3. 전체 useEffect 목록 (파일별, 현재 기준)

### App.tsx
- 세션/유저/초기화: `[lang]` 등 원시값 또는 ref·가드 사용 → **안전**.
- `onDailyExecutionSummaryChange`: **useCallback** → **안전**.
- 전체 평가액: `[aggregateHoldings]` (useMemo(portfolios)) → **안전**.
- 기타: 디바운스 ref·원시값 의존 → **안전**.

### components/Dashboard.tsx
- **L76**: `[alarmIds, dailyExecutionBlocks, onDailyExecutionSummaryChange]` — lastDailyExecutionSummaryRef 가드, App에서 useCallback → **안전**.
- **L225**: `[portfolio.id, isInQuarterModeByT, portfolio.isQuarterMode]` — 원시값 → **안전**.
- **L306**: `[portfolio.id, portfolio.strategy.multiSplit?.targetStock]` — 원시값, setState 시 이전과 같으면 생략 → **안전**.
- **L415**: `[portfolio.id, portfolio.trades.length, portfolio.strategy.multiSplit?.targetStock, portfolio.feeRate, isInQuarterMode, recentTradingDays]` — 원시값, 함수형 setState·JSON 비교 → **안전**.
- **L505**: `[portfolio.id, ..., multiSplitPhase]` — 원시값, lastMultiSplitExecutionKeyRef → **안전**.
- **L664**: `[isAlarmEnabled, lang, multiSplitExecutionData, quarterStopLossData, multiSplitPhase, isInQuarterMode]` — **onDailyExecutionBlock 미포함**, ref로 콜백 호출 → **안전** (무한루프 수정 반영).
- **L708**: `[portfolio]` — ref 동기화만 → **주의** (무한루프 아님).
- **L714**: `[portfolio.id, portfolio.trades.length]` — portfolioRef 사용 → **안전**.

### components/QuickInputModal.tsx
- L45: `[portfolio.id, targetStockForDate]` → **안전**.
- L83: `[type, activeSection, portfolio.strategy.ma1?.stock, ...]` → **안전**.
- L91: `[type, isMOC, price, selectedStock, portfolio.id, portfolio.trades.length]` → **안전**.
- L102: `[type, price, portfolio.dailyBuyAmount, feeRate]` → **안전**.

### components/PortfolioDetailsModal.tsx
- L49: `[isReadOnly, latestTradeDate]` → **안전**.
- L86: `[portfolio.id, portfolio.trades.length, isReadOnly]` → **안전**.

### components/AlarmModal.tsx
- L60: `[selectedHours]`, prevSelectedHoursKeyRef 로 동일 값 setState 방지 → **안전**.

### components/AuthModals.tsx, TradeExecutionModal.tsx, Markets.tsx, CustomDropdown.tsx, contexts/TossAppContext.tsx
- 의존성 `[]` 또는 원시값·메모된 값, setState 1회 또는 이벤트 기반 → **안전**.

---

## 4. 체크리스트 (추가 수정 시 참고)

- [x] **Dashboard**: `onDailyExecutionBlock` 을 **useCallback(id, block)** 로 고정하고, 카드에서는 **ref** 로만 호출·의존성에서 제외.
- [x] **App**: `onDailyExecutionSummaryChange` useCallback 유지.
- [x] **QuickInputModal**: 의존성 원시값/식별자만 사용.
- [x] **Dashboard quarterStopLossData**: 의존성 원시값만 사용.
- [x] **PortfolioDetailsModal**: 주가 fetch effect 의존성 원시값만 사용.
- [ ] **Dashboard L708** (선택): `[portfolio]` → 필요 시 원시값만 의존성으로 축소.

---

## 5. 정리

- **다분할 알람 무한루프**: 부모가 카드마다 새 콜백을 넘기던 패턴을 제거하고, **안정된 (id, block) 콜백 + 자식에서 ref 사용**으로 해결됨.
- **이전 검사가 놓친 이유**: “의존성에 콜백 없음”만 보았고, **map 안에서 매 렌더 새 콜백 생성**과 **비동기 데이터 도착 시 effect 재실행**이 겹치는 시나리오를 별도로 짚지 않았음.
- **현재**: 고위험 무한루프 후보는 0건. 남은 주의 구간은 Dashboard의 `[portfolio]` ref 동기화 1곳이며, 무한루프 원인은 아님.

이 문서는 “무한 루프 후보” 점검용입니다. 새로 **useEffect + 객체/배열/인라인 콜백 의존성**을 추가할 때는 위 패턴(안정 콜백 + ref)과 비교해 보는 것을 권장합니다.
