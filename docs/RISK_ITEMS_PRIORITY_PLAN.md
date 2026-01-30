# 위험 요소 우선순위별 계획 및 수정 예시

**작성일**: 2026-01-30  
**목적**: 무한 루프 외 문제가 될 수 있는 위험 요소를 우선순위별로 정리하고, **수정은 하지 않고** 코드로 어떻게 고칠지 예시만 문서로 정리합니다.

---

## P0 — 즉시 점검/설계 필요 (장애 가능성 높음)

### 1. 데이터 일관성 깨짐 가능성 (handleClosePortfolio)

**위치**: `App.tsx` → `handleClosePortfolio`

**위험**:  
`portfolio_history` insert 성공 후 `portfolios` update가 실패하면, **이력은 DB에 남는데 포트폴리오는 종료되지 않은 상태**가 됨. 새로고침 시 사용자 화면과 DB 상태가 어긋남.

**수정 방향 (택일)**:

- **A. Edge Function RPC로 묶기**  
  클라이언트는 RPC 한 번만 호출. RPC 내부에서 `portfolio_history` insert → `portfolios` update 순서로 실행하고, 둘 중 하나라도 실패하면 에러 반환(롤백은 DB 트랜잭션 또는 보상 로직으로 처리).

- **B. 보상 트랜잭션 (클라이언트 유지)**  
  `portfolios` update가 실패했을 때, 방금 insert한 `portfolio_history` 행을 delete하여 “부분 성공” 상태를 정리.

**수정 예시 (B안 — 보상 삭제)**:

```ts
// handleClosePortfolio 내부, 11번 단계 이후

// 11. portfolios 테이블 업데이트 (history 저장 성공 이후)
const { error: updateError } = await supabase
  .from('portfolios')
  .update({ ... })
  .eq('id', terminateTargetId);

if (updateError) {
  console.error('Failed to close portfolio', updateError);
  // 보상: 방금 넣은 portfolio_history 행 삭제 (부분 성공 방지)
  await supabase
    .from('portfolio_history')
    .delete()
    .eq('user_id', user.id)
    .eq('portfolio_id', terminateTargetId);
  alert(lang === 'ko' ? '전략 종료 저장에 실패했습니다.' : 'Failed to save termination.');
  return;
}
```

- **A안 RPC 예시 (시그니처만)**  
  Supabase에 RPC 예: `close_portfolio(p_portfolio_id, p_user_id, p_history_row, p_portfolio_updates)` 를 두고, 내부에서 `portfolio_history` insert 후 `portfolios` update 수행. 실패 시 RPC에서 에러 반환.

---

### 2. 전역 이벤트 리스너 누적 (unhandledrejection)

**위치**: `App.tsx` → 세션/인증 로딩 `useEffect([lang])` 내부

**위험**:  
`lang`이 바뀔 때마다 effect가 다시 실행되며 `window.addEventListener('unhandledrejection', handleAuthError)` 가 호출되는데, cleanup에서 **동일한 함수 참조로** `removeEventListener`를 하지 못해 리스너가 누적될 수 있음.

**수정 방향**:  
핸들러를 **ref에 넣어서** 한 번만 등록하고, cleanup에서 **같은 ref**로 제거. `lang`은 핸들러 내부에서 ref로 읽기.

**수정 예시**:

```ts
// useEffect 바깥: 등록/해제에 쓸 **동일한** 함수 참조를 ref에 보관
const unhandledRejectionHandlerRef = useRef<((e: PromiseRejectionEvent) => void) | null>(null);

useEffect(() => {
  let isMounted = true;
  // ... (기존 checkUser, onAuthStateChange 등)

  const handleAuthError = async (event: PromiseRejectionEvent) => {
    if (!isMounted) return;
    const errorMessage = event.reason?.message?.toLowerCase() ?? '';
    // ... clearAuthState(true) 등
  };
  const fn = (e: PromiseRejectionEvent) => { handleAuthError(e); };
  unhandledRejectionHandlerRef.current = fn;

  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', fn);
  }

  return () => {
    isMounted = false;
    listener.subscription.unsubscribe();
    if (typeof window !== 'undefined' && unhandledRejectionHandlerRef.current) {
      window.removeEventListener('unhandledrejection', unhandledRejectionHandlerRef.current);
      unhandledRejectionHandlerRef.current = null;
    }
  };
}, [lang]);
```

- **포인트**: 등록할 때 쓴 `fn`과 제거할 때 쓸 **같은 참조**가 필요하므로, `fn`을 ref에 넣어 두고 cleanup에서는 `unhandledRejectionHandlerRef.current`로 제거. effect가 다시 실행될 때는 **새 fn**이 ref에 들어가므로, 이전 리스너는 cleanup에서 제거된 뒤 새 리스너만 남음.

---

## P1 — 기능 체감 오류/정합성 이슈 가능성

### 3. 의존성 축소로 인한 갱신 누락 (trades.length만 의존)

**위치**: `QuickInputModal.tsx` (MOC 수량 등), `PortfolioDetailsModal.tsx` (보유 종목 주가 조회)

**위험**:  
의존성을 `portfolio.id`, `portfolio.trades.length` 등으로만 두어서, **거래 개수는 그대로인데 수량/가격만 수정된 경우**에는 effect가 다시 실행되지 않음. MOC 수량이나 주가 요약이 갱신되지 않을 수 있음.

**수정 방향**:  
“트레이드 내용이 바뀌었는지”를 반영하는 **시그니처**를 `useMemo`로 만들고, 그 값을 의존성에 추가.

**수정 예시 (QuickInputModal — MOC 수량 effect)**:

```ts
// 의존성에 시그니처 추가 (같은 길이여도 수량/종목이 바뀌면 재실행)
const tradesSignature = useMemo(
  () => portfolio.trades.map(t => `${t.stock}:${t.quantity}:${t.type}`).join('|'),
  [portfolio.trades]
);

useEffect(() => {
  if (type !== 'sell' || !isMOC || price <= 0 || !selectedStock) return;
  const holdings = calculateHoldings(portfolio);
  const holding = holdings.find(h => h.stock === selectedStock);
  if (holding && holding.quantity > 0) {
    const mocQuantity = Math.round((holding.quantity * 0.25) * 10) / 10;
    setQuantity(mocQuantity);
  }
}, [type, isMOC, price, selectedStock, portfolio.id, tradesSignature]);
```

- `PortfolioDetailsModal`의 주가 조회 effect도 동일하게 `[portfolio.id, portfolio.trades.length, tradesSignature, isReadOnly]` 형태로 확장할 수 있음 (필요 시에만).

---

### 4. 의존성 누락으로 인한 구형 값 사용 (TradeExecutionModal / AlarmModal)

**위치**:  
- `TradeExecutionModal.tsx` → `useEffect([type])` 안에서 `strategyStocks`, `holdings` 사용  
- `AlarmModal.tsx` → `useEffect([])` 안에서 `selectedHours` 사용

**위험**:  
- 포트폴리오가 바뀌어도 `type`이 같으면 선택 종목이 갱신되지 않을 수 있음.  
- `selectedHours`가 나중에 바뀌어도 effect가 다시 돌지 않아 AM/PM·시·분 표시가 어긋날 수 있음.

**수정 방향**  
- TradeExecutionModal: `type` 외에 **portfolio 식별/종목 목록**을 반영하는 원시 의존성 추가.  
- AlarmModal: **`selectedHours`를 의존성에 넣고**, 이전 값과 같으면 setState 생략해 불필요한 리렌더만 막기.

**수정 예시 (TradeExecutionModal)**:

```ts
// strategyStocks / holdings 는 portfolio 에서 파생되므로, portfolio.id + trades.length 로 재실행 시점 반영
useEffect(() => {
  if (type === 'buy') {
    setSelectedStock(strategyStocks[0]);
    setIsMOC(false);
  } else {
    setSelectedStock(holdings[0] || '');
  }
}, [type, portfolio.id, portfolio.trades.length]);
```

- `strategyStocks`/`holdings`는 매 렌더 새 배열이므로 의존성에 넣지 않고, **portfolio.id, portfolio.trades.length** 로 “포트폴리오/거래가 바뀌었을 때”만 다시 실행되게 함.

**수정 예시 (AlarmModal)**:

```ts
const prevSelectedHoursRef = useRef<string | null>(null);

useEffect(() => {
  if (selectedHours.length === 0) return;
  const key = selectedHours.join(',');
  if (prevSelectedHoursRef.current === key) return;
  prevSelectedHoursRef.current = key;

  const firstTime = selectedHours[0];
  const [hourStr, minuteStr] = firstTime.split(':');
  const hour = parseInt(hourStr, 10);
  if (hour >= 12) {
    setPeriod('PM');
    const pmHour = hour === 12 ? 0 : hour - 12;
    setSelectedHour(pmHour.toString().padStart(2, '0'));
  } else {
    setPeriod('AM');
    setSelectedHour(hourStr === '00' ? '00' : hourStr.padStart(2, '0'));
  }
  setSelectedMinute(minuteStr || '00');
}, [selectedHours]);
```

---

## P2 — 비용 증가/중복 호출 리스크

### 5. FCM 토큰 중복 upsert 가능성

**위치**: `App.tsx` → `saveFCMToken`

**위험**:  
세션 복구와 SIGNED_IN 이벤트가 짧은 시간에 연달아 오면 `saveFCMToken`이 두 번 호출될 수 있음. 동일 토큰에 대한 중복 upsert로 서버 비용이 늘어남.

**수정 방향**:  
**user당 “한 번만 진행 중”**이 되도록 ref로 가드. 호출 시 ref 확인 후 진행 중이면 return, 완료 후 ref 해제.

**수정 예시**:

```ts
const saveFCMTokenInProgressRef = useRef<string | null>(null);

const saveFCMToken = async (userId: string): Promise<void> => {
  if (typeof window === 'undefined') return;
  if (saveFCMTokenInProgressRef.current === userId) {
    console.log('[FCM] saveFCMToken already in progress for user:', userId);
    return;
  }
  saveFCMTokenInProgressRef.current = userId;
  try {
    const permission = getNotificationPermission();
    if (permission === 'denied') return;
    const token = await requestForToken();
    if (!token) return;
    const deviceInfo = parseDeviceInfo();
    const { error } = await supabase.from('user_devices').upsert({ ... }, { ... });
    if (error) console.error('[FCM] Failed to save FCM token:', error);
  } finally {
    saveFCMTokenInProgressRef.current = null;
  }
};
```

---

## 우선순위별 요약

| 우선순위 | 항목 | 위치 | 수정 요약 |
|----------|------|------|-----------|
| **P0** | 데이터 일관성 깨짐 | App.tsx `handleClosePortfolio` | RPC로 묶거나, update 실패 시 history 보상 삭제 |
| **P0** | 전역 리스너 누적 | App.tsx `useEffect([lang])` | 핸들러를 ref로 고정해 add/remove 시 동일 참조 사용 |
| **P1** | trades 갱신 누락 | QuickInputModal, PortfolioDetailsModal | trades 시그니처 useMemo 후 의존성에 추가 |
| **P1** | 구형 값 사용 | TradeExecutionModal, AlarmModal | portfolio.id/trades.length 또는 selectedHours 의존성 추가 + setState 조건 |
| **P2** | FCM 중복 upsert | App.tsx `saveFCMToken` | user당 진행 중 ref 가드로 중복 호출 방지 |

---

이 문서는 **계획과 예시만** 담고 있으며, 저장소 코드는 수정하지 않습니다. 반영 시에는 각 파일의 현재 코드에 맞춰 위 예시를 조정해 적용하면 됩니다.
