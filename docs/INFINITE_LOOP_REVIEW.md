# 무한루프·위험요소 검토 (오늘 개선 작업 기준)

오늘 진행한 개선(텔레그램 Free 비활성화, 다분할 총투자금 초과 문구, 이평선 로직 수정, 로그아웃 clearAuthStorage 등)과 기존 코드를 대상으로 **무한루프·연쇄 리렌더** 위험을 검토한 결과입니다.

---

## 1. 검토 요약

| 구역 | 위험요소 | 조치 여부 |
|------|----------|-----------|
| Dashboard – Daily Execution 블록 effect | 콜백 변경 시 effect 반복 실행 | **안전**: ref + 동일 블록 시 report 생략, 콜백은 useCallback 고정 |
| Dashboard – 요약 전달 effect | blocks 변경 시 연쇄 리렌더 | **안전**: “모든 블록 준비” 시에만 전달, lastRef로 동일 요약 시 생략 |
| Dashboard – 다분할 실행 데이터 effect | setState → 재실행 루프 | **안전**: inputKey ref로 중복 계산 방지, 결과 동일 시 setState 생략 |
| Dashboard – 쿼터 모드 갱신 effect | onUpdatePortfolio → portfolio 변경 → 재실행 | **안전**: isQuarterMode true 시 early return, ref로 1회만 전송 |
| Dashboard – recentTradingDays effect | setState → 의존성 변경 | **안전**: 이전 값과 완전 동일 시 setState 생략 |
| 이평선 determineActiveSection | React 상태 없음, 비동기만 사용 | **안전**: 무한루프 요인 없음 |
| 로그아웃 clearAuthStorage | 로컬 스토리지만 정리, API 호출 없음 | **안전**: 부작용 없음 |

**결론: 오늘 수정으로 인한 새로운 무한루프·연쇄 리렌더 위험요소는 없음.**

---

## 2. 기존에 이미 적용된 방어 패턴

### 2.1 Daily Execution 블록 (PortfolioCard 내부)

- **원인**: 다분할은 비동기로 `multiSplitExecutionData`를 채운 뒤 블록을 만든다. 데이터 도착 전에 블록을 보내면, 상위에서 상태가 바뀌고 effect가 다시 돌면서 연쇄 리렌더/무한루프가 날 수 있음.
- **방어**:
  1. 다분할인 경우 `multiSplitExecutionData == null`이면 **블록을 만들지 않고 return** (679–681행).
  2. 만들어진 블록 문자열이 **이전과 동일하면** `report()`를 호출하지 않음 (`lastDailyExecutionBlockRef`).
  3. 상위로 전달하는 콜백은 **ref에 넣어 사용** (`onDailyExecutionBlockRef.current`)하고, Dashboard에서는 **useCallback으로 고정** (`setDailyExecutionBlockForId`).

→ 콜백 참조가 바뀌어도 effect가 같은 블록으로 report를 반복 호출하지 않으며, 데이터 준비 전에 상위 상태를 바꾸지 않음.

### 2.2 요약 전달 (Dashboard 상단 effect)

- **위험**: 각 카드가 report할 때마다 `dailyExecutionBlocks`가 바뀌고, 이게 의존성이라 effect가 매번 실행됨.
- **방어**:
  1. **모든 알람 포트폴리오의 블록이 준비된 경우에만** 요약 생성·전달 (`blocks.length !== alarmIds.length`이면 return).
  2. **요약 문자열이 이전과 같으면** `onDailyExecutionSummaryChange` 호출 안 함 (`lastDailyExecutionSummaryRef`).

→ 불완전한 블록 상태로 요약을 보내지 않고, 동일 요약으로 상위 상태를 반복 갱신하지 않음.

### 2.3 다분할 실행 데이터 계산 effect

- **위험**: 비동기 계산 후 `setMultiSplitExecutionData` → 리렌더 → effect 의존성에 multiSplitExecutionData가 없어서 effect 자체는 다시 안 돌지만, 다른 effect(Daily Execution 블록)가 이 데이터에 의존함.
- **방어**:
  1. **입력 조합이 같으면** 계산·setState 생략 (`lastMultiSplitExecutionKeyRef`와 `inputKey` 비교).
  2. **계산 결과가 이전과 같으면** setState 시 이전 상태 반환 (`prevJson === nextJson`).

→ 같은 입력에 대해 상태가 불필요하게 바뀌지 않아, Daily Execution effect가 같은 블록으로 반복 실행될 여지가 없음.

### 2.4 쿼터 모드 DB 갱신 effect

- **위험**: `onUpdatePortfolio({ ...portfolio, isQuarterMode: true })` 호출 시 상위에서 portfolio가 갱신되고, 해당 카드에 새 portfolio가 내려옴.
- **방어**:
  1. `portfolio.isQuarterMode === true`이면 **아무것도 하지 않고 return**.
  2. **한 번만 전송**하도록 `quarterModeUpdateSentRef` 사용.

→ 갱신 후 내려오는 portfolio로 effect가 다시 돌아도, 즉시 return하므로 루프 없음.

### 2.5 최근 영업일 (recentTradingDays)

- **위험**: `setRecentTradingDays(days)`가 호출될 때마다 리렌더.
- **방어**: **이전 배열과 길이·요소가 완전히 같으면** setState를 하지 않고 이전 상태를 그대로 반환.

→ 불필요한 리렌더와 그에 따른 연쇄 effect 실행을 막음.

---

## 3. 오늘 추가·변경된 부분 검토

### 3.1 Daily Execution effect에 `currentRound` 의존성 추가

- **역할**: 다분할 총투자금 초과 시 `multiSplitOverLimit`로 블록 문구를 바꾸기 위해, `currentRound`가 바뀔 때 블록을 다시 계산해야 함.
- **위험**: `currentRound`는 `useMemo([portfolio])` 결과라, portfolio가 바뀔 때만 바뀜. 블록이 바뀌어도 **동일 블록이면 report 생략**하므로, 상위 상태가 같은 값으로 반복 갱신되지 않음.
- **결론**: 무한루프·연쇄 리렌더 요인 없음.

### 3.2 이평선 구간 판별 (portfolioCalculations)

- **역할**: `determineActiveSection`에서 기준 주식만 사용, 20/60/120은 캐시 MA, 그 외는 가격 이력으로 MA 계산.
- **위험**: React 상태를 건드리지 않고, 비동기 fetch + 계산만 수행. 호출처(QuickInput 열기 등)에서만 사용.
- **결론**: 무한루프·연쇄 리렌더 요인 없음.

### 3.3 로그아웃 시 clearAuthStorage()

- **역할**: `signOut()` 후 localStorage의 Supabase 관련 키(sb-* 등) 제거.
- **위험**: 로컬 스토리지 정리만 하며, Supabase API를 추가로 호출하지 않음.
- **결론**: 부작용·추가 요청 없음.

### 3.4 AuthModals – Free 티어 텔레그램 버튼

- **역할**: Free일 때 비활성 버튼 + 툴팁 표시. 조건부 렌더만 추가.
- **위험**: useEffect나 콜백 의존성 변경 없음.
- **결론**: 무한루프·위험요소 없음.

---

## 4. 권장 사항 (유지)

- **Daily Execution / 요약**: 콜백은 **useCallback**으로, 상위 전달은 **ref + “이전 값과 같으면 전달 생략”** 패턴 유지.
- **다분할 실행 데이터**: **inputKey ref**로 동일 입력 시 재계산·setState 생략 유지.
- **새 effect 추가 시**: 의존성 배열에 **객체/배열을 넣지 말고**, 필요한 **원시값·id·length**만 넣어서 불필요한 재실행을 막을 것.

이 문서는 2025-01-31 기준 검토 결과입니다. 이후 effect·상태 구조가 크게 바뀌면 한 번 더 점검하는 것을 권장합니다.
