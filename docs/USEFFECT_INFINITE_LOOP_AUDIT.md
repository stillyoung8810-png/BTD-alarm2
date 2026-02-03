# useEffect 무한 루프 후보 전수 조사 리포트 (재검사)

**최종 조사일**: 2026-02-03  
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
| **주의 (불필요한 재실행·객체 의존성)** | 0 | 2026-02-03 portfolioRef·maSectionDepsKey 원시값/불리언 의존으로 정리 |
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

- **현재**: 해당 없음. Dashboard portfolioRef·maSectionDepsKey는 2026-02-03에 원시값/불리언 의존으로 정리 완료.

---

## 3. 전체 useEffect 목록 (파일별, 현재 기준)

### App.tsx
- 세션/유저/초기화: `[lang]` 등 원시값 또는 ref·가드 사용 → **안전**.
- `onDailyExecutionSummaryChange`: **useCallback** → **안전**.
- 전체 평가액: `[aggregateHoldings]` (useMemo(portfolios)) → **안전**.
- 기타: 디바운스 ref·원시값 의존 → **안전**.

### components/Dashboard.tsx
- **L76**: `[alarmIds, dailyExecutionBlocks, onDailyExecutionSummaryChange]` — lastDailyExecutionSummaryRef 가드, App에서 useCallback → **안전**.
- **maSectionDepsKey (useMemo)**: `[portfolio.id, !!portfolio.strategy.multiSplit, ma0/ma1/ma2/ma3 원시값]` — 객체 대신 불리언 의존 (2026-02-03) → **안전**.
- **L239 (구간 계산)**: `[maSectionDepsKey, !!portfolio.strategy.multiSplit]` — 원시값/불리언, cancelled 플래그 (2026-02-03 반영) → **안전**.
- **L225**: `[portfolio.id, isInQuarterModeByT, portfolio.isQuarterMode]` — 원시값 → **안전**.
- **L306**: `[portfolio.id, portfolio.strategy.multiSplit?.targetStock]` — 원시값, setState 시 이전과 같으면 생략 → **안전**.
- **L415**: `[portfolio.id, portfolio.trades.length, portfolio.strategy.multiSplit?.targetStock, portfolio.feeRate, isInQuarterMode, recentTradingDays]` — 원시값, 함수형 setState·JSON 비교 → **안전**.
- **L505**: `[portfolio.id, ..., multiSplitPhase]` — 원시값, lastMultiSplitExecutionKeyRef → **안전**.
- **L253 (maPartialProfitLines)**: `[portfolio.id, portfolio.trades.length, portfolio.strategy.multiSplit, ma1/ma2/ma3 원시값]` — 원시값만, setState 시 prev와 내용 같으면 생략, cancelled 플래그 → **안전** (2026-02-02 추가).
- **L646 (multiSplitInsufficientAmount)**: `[portfolio.id, !!portfolio.strategy.multiSplit, portfolio.strategy.multiSplit?.targetStock, portfolio.dailyBuyAmount]` — **원시값만** 의존, fetch 후 setState(boolean), cancelled 플래그. setState가 의존성 변경 없음 → **안전** (2026-02-03 다분할 금액 부족 알림 추가).
- **L664 (daily execution 블록)**: `[..., multiSplitInsufficientAmount, ...]` — **onDailyExecutionBlock 미포함**, ref로 콜백 호출, lastDailyExecutionBlockRef 가드. multiSplitInsufficientAmount true 시에도 동일 블록이면 report 생략 → **안전** (무한루프 수정 반영).
- **L891**: `[portfolio.id, portfolio.trades.length]` — portfolioRef 동기화 (원시값만 의존, 2026-02-03 반영) → **안전**.
- **L897**: `[portfolio.id, portfolio.trades.length]` — portfolioRef 사용(메트릭) → **안전**.

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
- [x] **Dashboard portfolioRef** (2026-02-03): `[portfolio]` → `[portfolio.id, portfolio.trades.length]` 원시값만 의존으로 축소 반영.

---

## 5. 정리

- **다분할 알람 무한루프**: 부모가 카드마다 새 콜백을 넘기던 패턴을 제거하고, **안정된 (id, block) 콜백 + 자식에서 ref 사용**으로 해결됨.
- **이전 검사가 놓친 이유**: “의존성에 콜백 없음”만 보았고, **map 안에서 매 렌더 새 콜백 생성**과 **비동기 데이터 도착 시 effect 재실행**이 겹치는 시나리오를 별도로 짚지 않았음.
- **현재**: 고위험 무한루프 후보는 0건. 주의 구간(객체 의존성)은 2026-02-03에 portfolioRef·maSectionDepsKey 원시값/불리언 의존으로 정리 완료.

이 문서는 “무한 루프 후보” 점검용입니다. 새로 **useEffect + 객체/배열/인라인 콜백 의존성**을 추가할 때는 위 패턴(안정 콜백 + ref)과 비교해 보는 것을 권장합니다.

---

## 6. 최근 변경 점검 (Toggle / AuthModals / App – 2026-01-30)

**변경 내용**: 공통 Toggle 컴포넌트 도입, AlarmModal 아이콘 → Toggle 교체, AuthModals에 텔레그램 알림 토글 추가, App에서 `onTelegramAlertsEnabledChange` 인라인 콜백 전달.

| 위치 | 점검 결과 |
|------|-----------|
| **App.tsx** | `onTelegramAlertsEnabledChange`는 **인라인 async 함수**로 매 렌더 새 참조. 단, **AuthModals 쪽에서 useEffect 의존성으로 사용하지 않음** → 콜백은 클릭 시에만 호출되므로 리렌더→effect 재실행 루프 없음. |
| **AuthModals** | `useEffect`는 `[type]`만 의존, `onTelegramAlertsEnabledChange` 미사용. 토글은 `onChange`에서만 콜백 호출 → **무한루프 위험 없음**. |
| **AlarmModal** | Toggle은 `checked`/`onChange`만 사용, 부모에서 넘긴 `setEnabled`(useState setter)는 안정 참조. **effect 추가 없음** → **무한루프 위험 없음**. |
| **Toggle** | 비제어/제어 컴포넌트, useEffect 없음. **위험 없음**. |

**결론**: 이번 변경으로 인한 **무한루프 위험 없음**. 인라인 콜백은 이벤트 핸들러로만 사용되며, effect 의존성에 포함되지 않음.

---

## 7. 코드 변경 시 무한루프 점검 권장 사항

앞으로 **모든 코드 변경**에서 아래를 기본적으로 점검할 것을 권장합니다.

1. **부모 → 자식 콜백**: `map` 안에서 인라인 콜백을 넘기지 말고, **useCallback**으로 고정하거나 **(id, payload)** 형태의 단일 콜백으로 전달. 자식에서는 **ref에 보관 후 effect 의존성에서 제외**.
2. **effect 내 setState**: setState가 부모 리렌더를 유발하고, 그 부모가 해당 effect의 의존성(객체/배열/인라인 함수)을 새로 넘기면 **effect → setState → 리렌더 → effect** 루프 가능. 의존성은 **원시값·ref·안정 콜백**으로 제한.
3. **새로 추가하는 useEffect**: 의존성 배열에 **객체/배열/인라인 함수**가 들어가면, 그 참조가 매 렌더 바뀌지 않는지 확인. 필요 시 **원시값만** 의존하거나 **ref + 의존성에서 제외** 패턴 사용.
4. **인라인 콜백**: 이벤트 핸들러(`onClick`, `onChange` 등)로만 쓰이고 **effect 의존성에 넣지 않으면** 루프 원인이 되지 않음. effect에서 호출하거나 의존성에 넣는 경우에만 **useCallback** 등으로 안정화 필요.

---

## 8. 최근 변경 점검 (이평선 구간매수 – 구간2 분할 제거, 구간별 중간 이익 실현, 2026-02-02)

**변경 내용**: 구간2 "매수한 종목 분할 횟수" UI 제거, 구간3 안내문 제거, 구간 1~3에 "중간 이익 실현" 체크·목표 % 추가, daily execution에 "구간N 익절: 종목 수량주" 표시.

| 위치 | 점검 결과 |
|------|-----------|
| **Dashboard.tsx – maPartialProfitLines effect** | **의존성**: `[portfolio.id, portfolio.trades.length, portfolio.strategy.multiSplit, portfolio.strategy.ma1?.stock, ...]` 등 **원시값만** 사용. 객체/인라인 함수 없음. **setState**: `setMaPartialProfitLines` 호출 시 **이전 lines와 내용이 같으면 return prev** 로 불필요한 리렌더·블록 effect 재실행 방지. **cancelled** 플래그로 언마운트 후 setState 방지. **fetchStockPrices**는 의존성 변경 시에만 호출 → **무한루프·불필요한 요청 반복 없음**. |
| **Dashboard.tsx – daily execution 블록 effect** | **maPartialProfitLines** 를 의존성에 추가. maPartialProfitLines는 **state(배열)** 이므로 참조가 바뀔 때만 effect 재실행. effect 내부에서 **setMaPartialProfitLines 호출 없음** → setState → 리렌더 → effect 재실행 루프 없음. **lastDailyExecutionBlockRef** 로 동일 블록 시 report 생략 유지. **onDailyExecutionBlock** 은 ref로만 호출·의존성 미포함 → **안전**. |
| **StrategyCreator.tsx** | **useEffect 추가 없음**. state(ma1TakePartialProfit 등) 및 전략 빌드 시 값만 변경. **무한루프 위험 없음**. |
| **utils/dailyExecutionSummary.ts** | **순수 함수**만 추가. React 상태·effect 없음. **위험 없음**. |

**결론**: 이번 변경으로 인한 **무한루프·불필요한 요청/계산 반복 없음**. maPartialProfitLines effect는 원시값만 의존하고, setState 시 "값이 같으면 생략" 패턴 적용됨.

---

## 9. 이평선 전략 로직 수정 후 점검 (2026-02-03)

**요청**: 이평선 전략 로직 수정으로 여러 코드 변동이 있었을 수 있으므로, docs 폴더의 infinite loop 관련 문서를 참조해 **쓸데없이 요청이 반복되거나 에러·무한루프 위험요소**를 체크.

### 점검 결과 요약

| 구역 | 점검 항목 | 결과 |
|------|-----------|------|
| **StrategyCreator.tsx** | RSI 게이지·구간2 레이아웃·중간 이익 실현 긴 박스 등 UI 변경 | **useEffect 없음**. state·폼 제출만 사용 → **무한루프·반복 요청 위험 없음**. |
| **Dashboard – setDailyExecutionBlockForId** | 카드별 콜백 전달 | **useCallback(..., [])** 유지, **ref로만 호출**·의존성 미포함 → **안전**. |
| **Dashboard – daily execution 블록 effect** | maBlockVersion, maPartialProfitLines, report | **lastDailyExecutionBlockRef** 로 동일 블록 시 report 생략. **onDailyExecutionBlock** ref 사용·의존성 미포함 → **안전**. |
| **Dashboard – maPartialProfitLines effect** | 의존성·setState | **원시값만** 의존, setState 시 **prev와 내용 같으면 return prev**·cancelled 플래그 → **안전**. |
| **Dashboard – maRsiNotMet effect** | rsiThreshold 등 | **원시값만** 의존, fetch 후 setState·cancelled → **안전**. |
| **Dashboard – portfolioRef 동기화** | 의존성 `[portfolio]` | **개선 반영**: `[portfolio.id, portfolio.trades.length]` 로 변경 → 불필요한 재실행·객체 의존 제거. |
| **Dashboard – maSectionDepsKey / 구간 계산 effect** | `portfolio.strategy.multiSplit` 객체 의존 | **개선 반영**: useMemo·effect 의존성을 **`!!portfolio.strategy.multiSplit`** 로 변경 → 참조만 바뀌어도 재실행되던 부분 제거. |
| **App.tsx** | onDailyExecutionSummaryChange 등 | **useCallback** 유지, daily execution 요약 디바운스·lastSavedSummaryRef 유지 → **안전**. |

### 적용한 개선 (문서 권장 사항 반영)

1. **portfolioRef 동기화 (Dashboard)**  
   - 의존성 `[portfolio]` → **`[portfolio.id, portfolio.trades.length]`**  
   - 목적: 메트릭 계산 시 최신 portfolio만 필요하므로, id·trades 변경 시에만 ref 갱신. 객체 참조만 바뀌는 리렌더 시 effect 재실행 방지.

2. **maSectionDepsKey 및 구간 계산 effect (Dashboard)**  
   - useMemo 의존성: `portfolio.strategy.multiSplit` → **`!!portfolio.strategy.multiSplit`**  
   - effect 의존성: `portfolio.strategy.multiSplit` → **`!!portfolio.strategy.multiSplit`**  
   - 목적: multiSplit 객체 참조만 바뀌어도 effect가 도는 일을 막고, “다분할 여부”만으로 실행 여부 결정.

### 정리

- **이평선 전략 관련 최근 UI/로직 변경**으로 인한 **무한루프·불필요한 API/계산 반복·에러 위험요소는 없음**.  
- 문서에 있던 **주의 구간 2건(portfolioRef, maSectionDepsKey)** 은 위와 같이 원시값/불리언 의존으로 정리해 **주의 구간 0건**으로 반영함.

---

## 10. 다분할 1회 매수금 부족 알림 추가 후 점검 (2026-02-03)

**변경 내용**: 1회 매수금 < 1주 가격 시 백테스트 중단·Daily 요약/카드 경고 문구·Backtest API 에러 표시.

| 구역 | 점검 항목 | 결과 |
|------|-----------|------|
| **Dashboard – multiSplitInsufficientAmount effect (신규)** | 의존성 `[portfolio.id, !!multiSplit, targetStock, dailyBuyAmount]` — 원시값만. setState(boolean)은 의존성 중 어느 것도 변경하지 않음. fetch 후 setState, cancelled 플래그 사용 | **안전**. 무한루프 요인 없음. |
| **Dashboard – daily execution 블록 effect** | `multiSplitInsufficientAmount` 의존성 추가. 금액 부족 시 `multiSplitExecutionData == null`이어도 블록 전달하도록 early return 조건 변경. report 시 **lastDailyExecutionBlockRef** 로 동일 블록이면 생략 유지. onDailyExecutionBlock은 ref로만 호출·의존성 미포함 | **안전**. |
| **dailyExecutionSummary.ts** | 옵션·문자열 추가만. 순수 함수·effect 없음 | **위험 없음**. |
| **Backtest.tsx** | backtestError state·API 응답 body.error 표시. useEffect 없음, 클릭/비동기 후 setState만 | **위험 없음**. |

**결론**: 다분할 금액 부족 알림 추가로 인한 **무한루프·연쇄 리렌더·에러 위험요소 없음**. 고위험 0건·주의 0건 유지.
