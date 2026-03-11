# Free 티어 알림 토스트 임시 처리 설계

## 개요

토스 미니앱 심사 기간 동안 **무료(Free) 티어 사용자의 알림 설정 진입을 막고**, 대신 토스 스타일의 인앱 토스트 메시지를 띄우기 위한 임시 구현입니다.

- 대상 화면: `Dashboard` 의 포트폴리오 카드 (`PortfolioCard` in `components/Dashboard.tsx`)
- 대상 기능: 카드 우측 상단 종 아이콘(알림 설정 버튼)
- 목적:  
  - 무료 사용자에게는 아직 알림 설정 모달을 열어주지 않음  
  - 대신 “곧 제공 예정”을 안내하는 짧은 토스트를 띄움  
  - 추후 정식 알림 기능 오픈 시 **최소 삭제 범위**로 원복 가능하도록 설계

---

## 구현 내용 요약

### 1. 토스트 컴포넌트 (`components/Toast.tsx`)

- 단일 목적 인앱 토스트 컴포넌트.
- 특징:
  - 하단 중앙 고정, 어두운 배경 + 둥근 모서리 + 짧은 문구
  - mount 시 부드러운 fade-in, 일정 시간 후 fade-out
  - `durationMs` (기본 2400ms) 뒤에 자동으로 `onDone()` 호출
  - 외부에서 `open` 상태를 직접 관리하지 않고, **필요 시 mount → 자동 종료** 패턴 사용

핵심 인터페이스:

```ts
interface ToastProps {
  message: string;
  onDone: () => void;
  durationMs?: number;
}
```

### 2. `Dashboard` 의 `PortfolioCard` 변경 (`components/Dashboard.tsx`)

1. **새 상태 추가**

```ts
const [freeAlarmToastSeq, setFreeAlarmToastSeq] = useState(0);
```

- 무료 티어 알림 토스트를 다시 띄울 때마다 숫자를 증가시켜,  
  같은 카드에서 여러 번 클릭해도 새 토스트 인스턴스를 mount 하도록 설계.

2. **토스트 오픈 유틸**

```ts
const openFreeAlarmToast = useCallback(() => {
  setFreeAlarmToastSeq((prev) => prev + 1);
}, []);
```

3. **알람 버튼 공통 핸들러 (토스/웹 공용)**

```ts
const handleAlarmButtonClick = useCallback(() => {
  if (currentTier === 'free') {
    openFreeAlarmToast();
    return;
  }
  onOpenAlarm();
}, [currentTier, onOpenAlarm, openFreeAlarmToast]);
```

- **얼리 리턴 패턴**:
  - `currentTier === 'free'` 이면:
    - 토스트만 띄우고 (`openFreeAlarmToast()`),
    - `return;` 으로 알림 설정 모달 진입(`onOpenAlarm`)을 완전히 차단.
  - 그 외(Pro, Premium)는 기존대로 `onOpenAlarm()` 수행.

4. **웹 버튼 전용 래퍼 (이벤트 전파 차단)**

```ts
const handleAlarmButtonClickWeb = useCallback(
  (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    handleAlarmButtonClick();
  },
  [handleAlarmButtonClick]
);
```

5. **버튼 onClick 연결**

- 토스(TDSButton) 브랜치:

```tsx
<TDSButton
  variant="tertiary"
  size="small"
  onClick={handleAlarmButtonClick}
  ...
>
```

- 웹 버튼 브랜치:

```tsx
<button
  type="button"
  onClick={handleAlarmButtonClickWeb}
  ...
>
```

6. **토스트 렌더링**

`PortfolioCard` JSX 하단에 조건부로 토스트를 렌더링:

```tsx
{freeAlarmToastSeq > 0 && (
  <Toast
    key={freeAlarmToastSeq}
    message={
      lang === 'ko'
        ? '무료 회원을 위한 알림도 곧 만날 수 있어요.'
        : 'Alerts for free members are coming soon.'
    }
    onDone={() => setFreeAlarmToastSeq(0)}
  />
)}
```

- `key={freeAlarmToastSeq}` 로 각 클릭마다 새로운 토스트 인스턴스가 mount 되도록 함.
- `onDone`에서 `setFreeAlarmToastSeq(0)` 으로 상태를 리셋하여, 다음 클릭 때 다시 조건을 만족하게 함.

---

## 실제 동작 정리

### Free 티어

- 종 아이콘(알림 버튼) 터치:
  - 토스트: “무료 회원을 위한 알림도 곧 만날 수 있어요.” 하단에 2.4초 정도 표시.
  - 알림 설정 모달: **열리지 않음**.
  - 여러 번 눌러도 매번 토스트가 새로 뜸.

### Pro / Premium 티어

- 종 아이콘 터치:
  - 기존대로 `onOpenAlarm()` 이 호출되어 알림 설정 모달 진입.
  - 토스트는 표시되지 않음.

---

## 추후 제거(정식 알림 오픈 시) 방법

정식으로 무료 티어에도 알림 기능을 오픈할 때, 이 임시 토스트 처리를 삭제하려면 아래만 수행하면 됩니다.

### 1. 토스트 컴포넌트 삭제

- `components/Toast.tsx` 파일 삭제

### 2. `Dashboard.tsx` (`PortfolioCard`) 변경 롤백

1. **import 제거**

```ts
- import Toast from './Toast';
```

2. **상태 및 핸들러 제거**

아래 항목 삭제:

- `const [freeAlarmToastSeq, setFreeAlarmToastSeq] = useState(0);`
- `openFreeAlarmToast` 함수
- `handleAlarmButtonClick`
- `handleAlarmButtonClickWeb`

3. **버튼 onClick 복구**

- 토스(TDSButton) 브랜치:

```tsx
- onClick={handleAlarmButtonClick}
+ onClick={onOpenAlarm}
```

- 웹 버튼 브랜치:

```tsx
- onClick={handleAlarmButtonClickWeb}
+ onClick={(e) => {
+   e.stopPropagation();
+   onOpenAlarm();
+ }}
```

4. **토스트 JSX 제거**

```tsx
{freeAlarmToastSeq > 0 && (
  <Toast
    ...
  />
)}
```

위 네 가지를 삭제/복구하면:

- 무료/유료 모두 **기존 알림 설정 모달 로직(onOpenAlarm)** 만 남게 되며,
- 나머지 알림/텔레그램/서버 로직은 전혀 건드리지 않으므로 부작용 없이 바로 정식 기능으로 전환할 수 있습니다.

