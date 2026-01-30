# 무한루프 수정 정리 (2026-01-29)

커밋 `bbda7c8` (무한루프.)에서 반영된 수정 사항 요약입니다.

---

## 1. App.tsx – Daily Execution 요약 Supabase 캐싱

### 원인
- `summaryToSave`(useMemo)가 바뀔 때마다 `useEffect`가 즉시 DB upsert를 실행
- upsert 후 상위/다른 effect나 상태 갱신이 `summaryToSave`를 다시 바꿀 수 있어 **effect → DB → 상태 갱신 → effect** 루프 가능

### 수정 내용

1. **디바운스 + ref로 중복 저장 방지**
   - `dailyExecutionDebounceRef`: setTimeout ID 저장, 이전 타이머 취소용
   - `lastSavedSummaryRef`: 마지막으로 저장한 요약 문자열 저장
   - 요약 변경 시 **3초 디바운스** 후 한 번만 upsert
   - 디바운스 콜백 안에서 `lastSavedSummaryRef.current === summaryToSave`면 DB 호출 생략
   - 저장 성공 시 `lastSavedSummaryRef.current = summaryToSave`로 갱신

2. **클린업**
   - effect 의존성 변경 또는 언마운트 시 `clearTimeout(dailyExecutionDebounceRef.current)` 및 ref null 처리

```tsx
// 추가된 ref
const dailyExecutionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const lastSavedSummaryRef = useRef<string | null>(null);

// effect 내부: setTimeout(..., 3000) + lastSavedSummaryRef 체크 후 upsert
// return () => { clearTimeout(...); dailyExecutionDebounceRef.current = null; }
```

---

## 2. Dashboard.tsx – 여러 지점에서 상태/콜백 루프 차단

### 2-1. daily execution 요약 → App 콜백

- **원인**: `dailyExecutionBlocks` 변경 시 매번 `onDailyExecutionSummaryChange(summary)` 호출 → App에서 상태 갱신 → summary 재계산 → 다시 콜백 → 루프
- **수정**:
  - `lastDailyExecutionSummaryRef`로 직전에 넘긴 요약 문자열 저장
  - 계산한 `next`가 이전과 같으면 `onDailyExecutionSummaryChange` 호출 안 함
  - 다를 때만 ref 갱신 후 콜백 호출

### 2-2. onDailyExecutionBlock (블록별 입력)

- **원인**: `setDailyExecutionBlocks(prev => ({ ...prev, [p.id]: block }))`만 하면 값이 같아도 새 객체라 리렌더/effect 재실행 가능
- **수정**: `prev[p.id] === nextValue`이면 `return prev`로 상태 변경 생략

### 2-3. getRecentTradingDays (거래일 조회)

- **원인**: `portfolio` 객체가 의존성이라 참조만 바뀌어도 effect 재실행 → `setRecentTradingDays` 반복 → 리렌더 루프
- **수정**:
  - `cancelled` 플래그로 언마운트 후 setState 방지
  - `setRecentTradingDays`를 함수형 업데이트로 바꾸고, `prev`와 새 `days`가 **내용이 완전히 같으면** `return prev`
  - 의존성 배열을 `[portfolio.id, portfolio.strategy.multiSplit?.targetStock]`로 축소

### 2-4. quarterStopLossData (MOC/LOC 등)

- **원인**: 매번 새 객체로 `setQuarterStopLossData({ ... })` 호출 → 참조 변경 → 하위 effect/메모 재실행 가능
- **수정**:
  - 계산 결과를 `next`에 담고, `setQuarterStopLossData(prev => ...)`에서 `JSON.stringify(prev) === JSON.stringify(next)`이면 `return prev`
  - null 설정 시에도 `prev === null ? prev : null`로 불필요한 리렌더 방지

### 2-5. multiSplitExecutionData

- **원인**: null 셋 시에도 새 리렌더 유발
- **수정**: `setMultiSplitExecutionData(prev => (prev === null ? prev : null))`로 동일하면 이전 참조 유지
- **기타**: 디버깅용 `console.log` 제거

### 2-6. 포트폴리오 메트릭 (investedAmount, yieldRate, realizedProfit)

- **원인**: 의존성 `[portfolio]` 때문에 객체 참조가 바뀔 때마다 effect 재실행 → `setInterval(updateMetrics, 30000)`과 맞물려 반복 실행/루프 가능
- **수정**:
  - `metricsInitializedRef`로 **같은 portfolio.id에 대해 한 번만** 초기 실행
  - 의존성 배열을 `[portfolio.id]`만 사용
  - `portfolioRef.current = portfolio`로 최신 portfolio 참조 유지 후, 비동기 내부에서는 `portfolioRef.current` 사용
  - `cancelled` 플래그로 언마운트 후 setState/setIsLoading 방지
  - **30초 interval 제거** → effect는 마운트 시 1회만 실행, cleanup에서 `cancelled = true`, `metricsInitializedRef.current = null` (StrictMode 대응)

---

## 3. services/db.ts

- **목적**: IndexedDB 초기화/사용 시 로그가 반복되며 콘솔 부하·디버깅 혼란 방지
- **수정**: `DEBUG_DB_LOG = false` 상수 도입, `console.log('[IndexedDB] 데이터베이스 초기화 완료')`를 `if (DEBUG_DB_LOG)` 안으로 이동

---

## 4. services/stockService.ts

- **목적**: 주가/지표 로딩 시 로그가 반복되며 성능·디버깅에 영향 주는 것 완화
- **수정**: `DEBUG_STOCK_LOG = false` 상수 도입 후, 다음 로그들을 `if (DEBUG_STOCK_LOG)` 안으로 이동
  - `fetchStockPrices`: IndexedDB 미보유 시 Supabase 조회 로그
  - `loadInitialStockData` / `loadPaidStockData`: 초기 로딩 시작·캐시 사용·부분 업데이트·전체 로딩·완료 로그

---

## 요약 표

| 파일 | 핵심 수정 |
|------|-----------|
| **App.tsx** | Daily execution 요약: 디바운스 3초 + lastSavedSummaryRef로 중복 upsert 및 effect 루프 방지 |
| **Dashboard.tsx** | 요약 콜백·블록 setState·거래일·quarterStopLoss·multiSplit·메트릭 effect에서 “값이 같으면 setState/콜백 생략” + ref/의존성/interval 정리 |
| **db.ts** | IndexedDB 초기화 로그를 DEBUG_DB_LOG로 감쌈 |
| **stockService.ts** | 주가/초기·유료 로딩 로그를 DEBUG_STOCK_LOG로 감쌈 |

---

## 적용 시 유의사항

- **디바운스**: Daily execution 요약은 사용자 입력이 멈춘 뒤 3초 후에만 Supabase에 반영됩니다.
- **메트릭 주기 갱신**: 포트폴리오 메트릭은 더 이상 30초 interval로 갱신되지 않습니다. 화면 전환 후 다시 들어오거나, portfolio가 바뀔 때(portfolio.id 변경) effect가 다시 실행됩니다. 주기 갱신이 필요하면 별도 interval을 두고 의존성을 최소화하는 방식으로 재도입하는 것이 좋습니다.

---

## 이번 변동으로 예상되는 기능 영향

### 1. 사용자가 체감할 수 있는 변동 (실제 동작 변경)

| 항목 | 변경 전 | 변경 후 | 영향 |
|------|--------|--------|------|
| **Daily execution 요약 저장** | 요약이 바뀌면 즉시 Supabase upsert | 요약 변경 후 **3초 뒤**에 한 번만 upsert | 요약 수정 직후 3초 이내에 다른 기기/탭에서 보면 이전 내용이 보일 수 있음. 대부분 3초 지나면 동기화됨. |
| **포트폴리오 메트릭(투자금·수익률·실현손익)** | 30초마다 자동 재계산 | **마운트 시 1회** + **portfolio.id가 바뀔 때만** 재계산 | 같은 카드에 오래 머물면 수익률 등이 최신 주가를 반영하지 않을 수 있음. |
| **메트릭이 매매 반영 시점** | 30초 이내에 자동 반영 가능 | **같은 포트폴리오에서 매매 추가/수정/삭제해도 메트릭이 자동 재계산되지 않음** | 매매 후 투자금·수익률·실현손익이 바로 갱신되지 않고, **대시보드를 나갔다 들어오거나 새로고침**해야 갱신됨. |

- **정리**:  
  - **Daily execution**: 3초 디바운스만 체감 가능하고, 저장/동기화 기능 자체는 유지됨.  
  - **메트릭**: 동작이 바뀌었고, “매매 직후/주기적으로 숫자가 갱신되는 경험”이 줄어듦. 문제처럼 느껴질 수 있는 부분은 **매매 후 메트릭이 즉시 갱신되지 않는 것**과 **30초 자동 갱신이 사라진 것** 두 가지입니다.

### 2. 문제로 이어질 수 있는 경우

- **포트폴리오 메트릭**  
  - 사용자가 같은 포트폴리오 카드에서 매매를 추가/수정/삭제한 직후, “투자금·수익률·실현손익이 안 바뀐다”고 느끼는 경우.  
  - 대응: 해당 포트폴리오 카드가 다시 마운트되도록 하거나(예: 상세 모달을 닫을 때 부모에서 key 갱신), 메트릭 effect에서 `portfolio.id` 외에 **트레이드/보유 변경을 반영하는 안정적인 의존성**(예: `portfolio.trades.length`, 또는 서버 기준 `updated_at` 등)을 추가해 재계산을 한 번 더 트리거하는 방식을 검토할 수 있습니다.
- **Daily execution**  
  - 3초 안에 탭을 닫거나 이탈하면, 그 시점의 최종 요약이 저장되지 않을 수 있음.  
  - 대응: 필요하면 언마운트 시 디바운스 대기 중인 요약을 즉시 한 번 flush하는 로직을 추가할 수 있습니다.

### 3. 영향 거의 없음

- **거래일 / MOC·LOC·multiSplit 데이터**: “값이 같으면 setState 생략”만 추가된 것이므로, 계산 결과나 표시 내용은 이전과 동일. 루프만 제거된 동작입니다.
- **db.ts / stockService.ts**: 로그 출력 여부만 플래그로 감쌌으므로, 기능·성능에는 변화 없음. (`DEBUG_*`를 true로 두면 이전처럼 로그가 보입니다.)

---

## 1. 매매 변경 시 메트릭 즉시 반영 – 코드 변경 계획 (구현 X, 계획만)

목표: **매매가 바뀐 경우에만** 한 번 더 계산해서 투자금·수익률·실현손익이 바로 반영되게 한다.

### 변경 위치
- **파일**: `components/Dashboard.tsx`
- **대상**: `PortfolioCard` 내부의 "수익률/투자금/실현손익 계산" `useEffect` (현재 의존성 `[portfolio.id]`)

### 계획 요약

1. **의존성에 "매매 변경" 반영**
   - 현재: `[portfolio.id]` → 포트폴리오 ID가 바뀔 때만 실행.
   - 변경: **`[portfolio.id, portfolio.trades.length]`** 를 의존성에 추가.
   - 효과: 매매 추가/삭제 시 `trades.length`가 바뀌어 effect가 한 번 더 실행되고, `portfolioRef.current`로 이미 갱신된 포트폴리오 기준으로 재계산됨.
   - **주의**: `portfolio` 객체 전체는 의존성에 넣지 않는다. 참조가 렌더마다 바뀌면 어제 해결한 무한루프와 비슷한 재실행이 날 수 있음.

2. **"한 번만 실행" 가드 제거/조정**
   - 현재: `metricsInitializedRef.current === portfolio.id`이면 실행 스킵 → 같은 ID에서는 한 번만 실행.
   - 변경: **`metricsInitializedRef` 스킵 로직 제거.** 의존성 `[portfolio.id, portfolio.trades.length]`만으로 실행 시점을 제어.
   - StrictMode 대응: cleanup에서 `metricsInitializedRef.current = null` 유지해도 됨(다른 목적으로 쓰지 않는다면 제거해도 무방).

3. **실제 계산은 기존처럼 ref 사용**
   - `portfolioRef.current`는 이미 `useEffect([portfolio])`로 최신 `portfolio`와 동기화되어 있음.
   - effect가 "매매 변경"으로 재실행될 때도 `portfolioRef.current`를 읽어서 `calculateInvestedAmount` / `calculateYield` / `calculateAlreadyRealized` 호출 → setState만 하면 됨. **추가 ref 없이 기존 구조 유지.**

4. **선택: 매매 "수정"까지 반영하고 싶을 때**
   - `trades.length`만 쓰면 "매매 추가/삭제"만 반영되고, "같은 개수 안에서 수량/단가 수정"은 반영 안 됨.
   - 수정까지 반영하려면: `useMemo`로 `portfolio.trades`의 **시그니처 문자열**을 만들고, 이를 의존성에 넣는 방식 검토.
     - 예: `tradesSignature = useMemo(() => JSON.stringify(portfolio.trades.map(t => ({ d: t.date, s: t.stock, q: t.quantity, t: t.type }))), [portfolio.trades])` 후 의존성 `[portfolio.id, tradesSignature]`.
     - 트레이드 수가 많으면 `JSON.stringify` 비용이 부담될 수 있으므로, 우선은 `[portfolio.id, portfolio.trades.length]`만 적용하고, 필요 시 시그니처 방식 도입.

### 정리 (할 일 목록)
- [ ] `Dashboard.tsx` 메트릭 effect 의존성 배열을 `[portfolio.id, portfolio.trades.length]`로 변경.
- [ ] 해당 effect 안의 `metricsInitializedRef` 스킵 로직 제거(또는 의존성과 맞게 재정의).
- [ ] (선택) 매매 수정 반영이 필요하면 `tradesSignature` useMemo + 의존성 추가 검토.

---

## 2. setInterval / setTimeout 사용처 및 주기 실행 위험 검토

프로젝트 전체에서 **setInterval** 사용처는 **없음** (어제 무한루프 수정 시 30초 interval 제거된 상태).

**setTimeout** 사용처는 아래 5곳.

| # | 파일 | 위치 | 용도 | 주기/지연 | 무한루프·성능 위험 |
|---|------|------|------|-----------|---------------------|
| 1 | **App.tsx** | 199 | Daily execution 요약 Supabase upsert **디바운스** | 3초 1회 (연속 변경 시 재설정) | **없음.** effect cleanup에서 `clearTimeout` 호출, `lastSavedSummaryRef`로 중복 저장 방지. |
| 2 | **App.tsx** | 826 | `fetchPortfoliosFromSupabase` **요청 타임아웃** | 10초 후 1회 `controller.abort()` | **잠재 이슈:** `await supabase...`에서 **예외가 나면** `clearTimeout(timeoutId)`에 도달하지 않음. 10초 뒤 타임아웃이 그대로 실행되어 불필요한 `abort()` 호출 가능. **권장:** `try { ... } finally { clearTimeout(timeoutId); }`로 옮겨서 예외 시에도 타임아웃 정리. |
| 3 | **AuthModals.tsx** | 205 | 회원가입 성공 후 로그인 화면 전환 | 3초 후 1회 | **없음.** 일회성 지연, setState만 하고 반복 없음. |
| 4 | **supabase/functions/send-alarm/index.ts** | 123, 133 | 텔레그램 전송 실패 시 **재시도 전 대기** | 1초×(retryCount+1) | **없음.** 서버 함수 내 1회 대기 후 재귀 재시도, 주기 폴링 아님. |
| 5 | **supabase/functions/check-and-trigger-alarms/index.ts** | 23 | `sleep(ms)` 유틸 (배치 간 딜레이) | 인자에 따른 1회 대기 | **없음.** Promise 기반 sleep만 제공. |

### 주기 실행(30초·1분 등) 코드
- **없음.** 30초/1분 주기로 돌아가는 `setInterval`/반복 `setTimeout`은 현재 코드베이스에 없음.
- 따라서 **어제 해결한 무한루프(effect ↔ setState ↔ 재실행)** 와 같은 패턴의 **주기 실행으로 인한 성능 저하/루프 위험**은 현재 없음.

### 요약
- **조치 권장:** App.tsx `fetchPortfoliosFromSupabase`에서 10초 타임아웃을 **finally에서 clearTimeout** 하도록 수정하면, 예외 시에도 타이머가 정리되어 더 안전함.
- **나머지 setTimeout 사용처:** 디바운스·타임아웃·일회 지연·재시도 대기 용도로만 쓰이고, 주기 반복이나 effect 의존성과 엮인 루프 가능성 없음.
