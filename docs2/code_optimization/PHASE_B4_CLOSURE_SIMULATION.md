# PHASE B4 Closure Simulation

> 목적: Phase B4 잔여 UI 타깃의 **설계·규칙·스니펫**과 **현재 레포 구현**을 한 문서에서 맞춥니다.  
> 원칙: 본 문서는 B4 클로저 **사후 SSOT**로 쓰이며, 아래 **§0.7**에 열거한 실제 파일이 구현의 단일 기준입니다. 스니펫은 `@/` 별칭으로 적되, 일부 파일은 동일 모듈을 **상대 경로(`../../…`)**로 import합니다(tsconfig `paths`와 동일 해석).  
> 기준: BTD 11대 Core Rule, Strict TS, A11y, I18N, Mutex 정책을 준수하며, **오버코딩 여부 검토** 원칙은 유지합니다.

---

## 0. Closure 선언

### 0.1 이번 문서의 직접 목표

1. Phase B4 2차 잔여 타깃의 실제 경로와 현재 결함을 고정합니다.
2. 리팩토링 후 구조를 **Container/View/Helper/Message SSoT** 기준으로 시뮬레이션합니다.
3. 구현 직전 전수 스캔 범위와 패턴을 명시합니다.
4. `npm run typecheck` + IDE lint 기준의 종료 조건을 문서로 고정합니다.

### 0.2 실제 잔여 타깃 경로 확정

마스터 플랜 및 기존 B4 문서의 잔여 타깃 중, 실제 레포 경로는 아래로 확정합니다.

- `components/AlarmModal.tsx`
- `components/PortfolioDetailsModal.tsx`
- `components/portfolio/PortfolioCardActions.tsx`
- `components/auth/SessionExpiredAlertGate.tsx`

경로 보정:

- 기존 문서에는 `PortfolioCardActions.tsx`가 루트 `components/`에 있는 것처럼 적힌 흔적이 있으나, 실제 산 코드는 `components/portfolio/PortfolioCardActions.tsx`입니다.

### 0.3 이번 문서에서 하지 않을 것

- B4 클로저 **범위 밖**의 광역 리팩터(Phase C/C8 규모)
- B1/B2/B3 수학식 재정의
- 새 전역 상태관리 도입 (`XState`, Context 증설, reducer 프레임워크 추가)
- 범용 모달 프레임워크나 “나중에 쓸지도 모르는” generic abstraction 추가
- `SessionExpiredAlertGate` 같은 단순 컴포넌트를 억지로 Container/View로 쪼개는 과잉 설계

### 0.4 Closure 성공 조건

1. 잔여 타깃 4개가 B4 메인 타깃과 동일한 무결성 기준으로 정리됩니다.
2. JSX 렌더 바디의 한국어/영어 하드코딩이 기능별 typed message SSoT로 이동합니다.
3. 네이티브 `alert` / `confirm` / `window.confirm`이 해당 범위에서 0건입니다.
4. `onClick`이 달린 비상호작용 태그는 전부 `role`, `tabIndex`, `onKeyDown`, `aria-label`을 갖습니다.
5. `any`, `Record<string, unknown>`, non-null assertion(`!`)이 B4 범위에서 0건입니다.
6. 단순 O(1) 계산용 blind `useMemo`, 3중첩 삼항, 거대한 숨은 props 객체 생성이 제거됩니다.
7. 최종 검증은 `npm run typecheck` + IDE lint로 0건을 확인합니다.  
   참고: 현재 레포 `package.json`에는 `lint` 스크립트가 없으므로, Closure 검증의 lint는 IDE diagnostics 기준으로 수행합니다.

### 0.5 외부 아키텍처 리뷰 반영 요약

- 시니어 아키텍트는, 제3자 리뷰에서 제안된 **영어 하드코딩 토스트(Rule 3 위반)**를 역으로 짚어 채택하지 않은 판단을 긍정했고, 다국어 SSoT 고수와 제품 카피 정합성에 대한 엔지니어링 통찰을 극찬했다.
- `SessionExpiredAlertGate`: 다국어 조각 누락 시 **침묵 종료 금지** → SSoT 토스트 + `onClose`(하드코딩 영문 토스트는 채택하지 않음 — Rule 3). 복구 토스트 문구는 **`TDS_DIALOG_MESSAGES[lang].auth.authCopyMissingFallback`** 전용 키로만 고정한다(`ko`/`en` 명시). **`common.refundActionFailed` 등 맥락이 다른 키 재활용은 금지**(환불/결제 실패 카피와 혼동 방지).
- `useAlarmModalController`: **12h→24h 도메인 수식 교정** + 삼항 중첩 제거, **`onSave` Promise + Mutex(`ref` + `finally`)**, **안정 핸들러(`useCallback`)** 반환.
- `usePortfolioDetailsController`(스니펫 D): **Rule 6·11** — `fetchStockPrices`에 `.catch` 없이 `void …then`만 두면 **Unhandled Rejection·무한 로딩 위험**이므로 **체이닝 + `isCancelled` + 실패 시 `setStockPrices({})` 폴백 + `unknown` 로깅**으로 멸균. **Rule 2·6** — 미사용 `latestTradeDate` 및 그 위의 **blind `useMemo`는 데드 코드로 전면 제거**(작은 배열 max 연산에 `useMemo` 금지 예시와 정면 충돌).
- **후속 리뷰(금융·데드코드·Rule 3):** `holdingsSummary`를 `calculateHoldings` 결과 위에 **종목별 `reduce`로 다시 합치면서 `avgPrice`를 마지막 행으로 덮어쓰는 패턴**은 **가중 평균 단가를 파괴**하므로 금지(Rule 1·6). **`holdings` 배열을 `map` 한 번으로만** 요약한다. **총 평가금액·시가·수량·삭제 다이얼로그 토스트 SSOT** 등 제품 정책은 아래 **§0.6**에 확정 반영한다. **Rule 1(Zero-Tolerance):** View로 넘기는 **단가·평가금 등 화폐 스칼라**는 `Number.EPSILON` 포함 **센트(2자리) 반올림**을 적용한다(스니펫 D). 구현 시 레포의 `roundMoney` 등 중앙 유틸이 동일 계약이면 그쪽 호출로 치환 가능. `useAlarmModalController`에는 **호출되지 않는 모듈 레벨 헬퍼**를 두지 않으며, 첫 선택 시각 파생은 **`useEffect` 내부 인라인**으로만 둔다(스니펫 B). `PortfolioCardActions` 삭제 트리거 `aria-label`/`title`은 **`openDeleteConfirm` + `''`** 만(Rule 3). **확인 다이얼로그** 필드 누락 시 **`auth.authCopyMissingFallback` 토스트만**(신규 키 금지) — 빈 껍데기 모달 금지(Rule 11, 스니펫 E).
- `SessionExpiredAlertGate`(스니펫 F): **Rule 10** — 개발 모드 Strict Mode에서 복구 `useEffect`가 이중 실행될 수 있으므로 **`hasRecoveryToastFiredRef` 1회 가드**를 스니펫 본문에 명시한다(`isOpen`이 닫힐 때 ref 초기화).
- 상위 `UiMutationCommand`와 이중 Mutex 가능성은 wiring 시 **한 축만 잠금 소유**로 검증.

### 0.6 제품 정책·SSoT 확정 (구현 준비)

1. **Valuation(총 평가금액):** 제품 정책에 따라 **`stockPrices[ticker]`(현재 시장가)를 우선** 적용해 **시가**로 계산한다. 시세가 없을 때만 `holding.avgPrice`로 fallback한다.
2. **삭제 트리거 라벨:** 동작을 가장 잘 묘사하는 **`TDS_DIALOG_MESSAGES[lang].portfolio.openDeleteConfirm`** 만 사용한다.
3. **에러(빈 다이얼로그) 토스트:** 별도 번역 키를 추가하지 않고, 기존 **`auth.authCopyMissingFallback`** 만 재사용한다.
4. **주식 수량(quantity):** **정수 주**만 지원하므로 수량 자체에 대한 소수 반올림은 **생략**한다. 다만 **`valuation`에 대한 `Number.EPSILON` 포함 2소수 반올림은 필수**이다(스니펫 D와 동일).

### 0.7 구현 반영 상태 (레포 SSoT)

아래 경로가 **현재 구현**이며, 본 문서 스니펫은 이와 **의미·계약이 동일**해야 한다.

| 역할 | 경로 |
|------|------|
| 알람 shell | `components/AlarmModal.tsx` |
| 알람 View | `components/alarm/AlarmModalView.tsx` |
| 알람 컨트롤러 | `components/alarm/useAlarmModalController.ts` |
| 상세 shell | `components/PortfolioDetailsModal.tsx` (`onDeleteTrade`: `Promise<void> \| void`) |
| 상세 View | `components/portfolioDetails/PortfolioDetailsView.tsx` |
| 상세 컨트롤러 | `components/portfolioDetails/usePortfolioDetailsController.ts` |
| 카드 액션 | `components/portfolio/PortfolioCardActions.tsx` |
| 세션 만료 게이트 | `components/auth/SessionExpiredAlertGate.tsx` |

메시지 SSoT: `constants/messages/alarmMessages.ts`, `constants/messages/portfolioDetailsMessages.ts` 등 — 스니펫 A/C는 요약이며 **전체 키는 해당 파일이 정본**이다.

**B4 스캔 부수 조치:** `components/Markets.tsx` `StockCard` 내 RSI 색상/배경에 있던 **3중첩 삼항**을 if 기반으로 평탄화함(Rule 2·6). 본 파일은 B4 직접 타깃은 아니나 §4.3 허용 범위의 핫픽스다.

---

## 1. 구현 완료 후 상태 요약

### 1.1 `components/AlarmModal.tsx` + `alarm/*`

- 네이티브 `alert` 제거. `getAlarmMessages` SSoT + `AlarmModalView`에서 backdrop **A11y 계약**(`role`/`tabIndex`/`onKeyDown`/`aria-label`) 적용.
- 상태·12h↔24h·저장 Mutex는 `useAlarmModalController`에 집중. 시간 표시 포맷은 View 내 `formatAlarmTime` 등 헬퍼로 처리(한국어/영문 표기는 `lang`과 메시지 조합).

### 1.2 `components/PortfolioDetailsModal.tsx` + `portfolioDetails/*`

- 네이티브 `confirm` 제거. 거래 삭제는 `useAsyncTdsConfirm` + `TdsConfirmDialog`.
- 캘린더 격자·일자별 거래 묶음·선택일 리스트·보유 요약·주가 fetch는 **`usePortfolioDetailsController`**에서 파생. View는 표시·이벤트 위임.
- `holdingsSummary`: §0.6 시가 우선 + `roundMoneyScalar2`로 단가·평가금 반올림. `fetchStockPrices`는 `.catch` + `isCancelled` + 실패 시 `{}` 폴백.

### 1.3 `components/portfolio/PortfolioCardActions.tsx`

- `TDS_DIALOG_MESSAGES` + `getDashboardMessages`. 삭제 트리거 라벨은 `portfolio.openDeleteConfirm ?? ''`.
- 다이얼로그 필드 trim 후 하나라도 비면 모달 미오픈 + `auth.authCopyMissingFallback` 토스트만.

### 1.4 `components/auth/SessionExpiredAlertGate.tsx`

- `labels`/`auth` 누락 시 **토스트(SSoT) + `onClose`**. `hasRecoveryToastFiredRef`로 Strict Mode 이중 토스트 방지. `export default` 동시 제공(`App.tsx` default import 호환).

### 1.5 추가 포함 대상 판단

B4 Closure 구현 범위에는 우선 아래만 직접 리팩토링합니다.

- `AlarmModal`
- `PortfolioDetailsModal`
- `PortfolioCardActions`
- `SessionExpiredAlertGate`

단, Task 2의 전수 스캔 중 아래 파일에서 **치명 결함이 재확인되면** “잔여 B4 클로저 핫픽스”로 같은 PR/작업 단위에 포함합니다.

- `components/Dashboard.tsx`
- `components/QuickInputModal.tsx`
- `components/TradeExecutionModal.tsx`
- `components/strategyCreator/*`
- `components/CustomDropdown.tsx`
- `components/InfoModal.tsx`
- `App.tsx`

원칙:

- 직접 리팩토링은 잔여 4타깃 중심
- 스캔 기반 추가 수정은 **B4 계약을 깨는 직접 blocker만**
- Phase C/C8 규모의 광역 재설계는 금지

---

## 2. 오버코딩 검토

### 2.1 분리 허용

아래 2개는 Container/View 분리가 **정당화**됩니다.

- `AlarmModal.tsx`
- `PortfolioDetailsModal.tsx`

이유:

- 로컬 상태, 순수 파생 계산, 저장/삭제 명령, 렌더링이 한 파일에 과밀
- B4에서 이미 `TradeExecutionModal`, `StrategyCreator`에 동일 패턴이 성공적으로 적용됨
- 재사용보다도 **SRP 회복과 테스트/검증 단위 분리**가 목적

### 2.2 분리 금지

아래 2개는 단일 컴포넌트 유지가 맞습니다.

- `components/portfolio/PortfolioCardActions.tsx`
- `components/auth/SessionExpiredAlertGate.tsx`

이유:

- 현재 책임이 작고 단순함
- 억지 Container/View 분리는 파일 수만 늘리고 의미 있는 복잡도 감소가 없음
- Senior 기준으로는 “작은 컴포넌트를 더 쪼개는 것”이 아니라 “불필요한 계층을 만들지 않는 것”이 더 중요

### 2.3 이번 Phase에서 금지할 과잉 설계

- `useReducer`로 단순 폼 상태를 전부 재작성
- 공용 `ModalViewModelFactory` 같은 범용 팩토리 도입
- `InfoModal`/`TdsAlertDialog`를 또 감싸는 추상 레이어 추가
- 스캔 자동화 전용 커스텀 런타임 도구 제작
- 단일 파일 전용 util을 굳이 전역 `utils/`로 승격

---

## 3. 리팩토링 전략

### 3.1 `AlarmModal` 전략

**상태:** 아래 목표는 **구현 반영 완료**(§0.7).

목표:

- 메시지 SSoT 분리
- 시간 선택 상태/파생 계산을 컨트롤러로 이동
- backdrop A11y 정규화
- 네이티브 `alert` 제거
- 토스/웹 렌더 분기 최소화

예상 파일 구조:

```ts
components/
  alarm/
    AlarmModalView.tsx
    useAlarmModalController.ts
constants/messages/
  alarmMessages.ts
components/AlarmModal.tsx
```

**Shell (`components/AlarmModal.tsx`) — 구현과 동일 계약**

- `onSave: (config: AlarmConfig) => Promise<void> | void`
- `useAlarmModalController({ lang, portfolio, maxAlarms, onSave })` → `AlarmModalView`에 `controller` 전달

구현 원칙:

- 루트 `components/AlarmModal.tsx`는 얇은 shell 유지 가능
- `useAlarmModalController`는 순수 숫자/문자열 파생 + 저장 handler만 담당
- “프리미엄 전용 기능”은 네이티브 `alert` 대신 기존 `InfoModal` 또는 TDS alert 경로로 통일
- `lang === 'ko'` 직접 분기는 helper 내부에서만 허용하지 않고, 메시지 사전으로 완전 이전
- View의 저장 버튼은 `disabled={controller.isSaving}` 및 `aria-busy={controller.isSaving}` 등으로 Mutex 상태를 노출(상위 command와 이중 잠금이면 한쪽만 사용)

#### 시뮬레이션 스니펫 A — `constants/messages/alarmMessages.ts`

**구현 정본:** `constants/messages/alarmMessages.ts`의 `ALARM_MESSAGES` / `getAlarmMessages`. 타입 셰이프는 구현과 아래가 동일하다.

```ts
import type { AppLang } from '@/types';

export interface AlarmMessageSet {
  title: string;
  slotSystem: (maxAlarms: number) => string;
  statusLabel: string;
  enabledDescription: string;
  configuredTimes: string;
  addTime: string;
  periodLabel: string;
  hourLabel: string;
  minuteLabel: string;
  minuteIntervalHeader: string;
  minuteIntervalNotice: string;
  minuteUnit: string;
  addAction: string;
  saveAction: string;
  onState: string;
  offState: string;
  allSlotsFilledNotice: string;
  premiumFeatureNoticeTitle: string;
  premiumFeatureNoticeBody: string;
  aria: {
    closeModal: string;
    closeBackdrop: string;
    toggleAlarm: string;
    removeTime: (timeLabel: string) => string;
    selectPeriod: (period: 'AM' | 'PM') => string;
    saveAlarmSettings: string;
    minuteMenuTrigger: string;
  };
  period: {
    am: string;
    pm: string;
  };
}

// export const ALARM_MESSAGES: Record<AppLang, AlarmMessageSet>
// export function getAlarmMessages(lang: AppLang): AlarmMessageSet
```

#### 시뮬레이션 스니펫 B — `components/alarm/useAlarmModalController.ts`

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlarmConfig, Portfolio } from '@/types';
import { getAlarmMessages } from '@/constants/messages/alarmMessages';

const MINUTE_STEP = 10;
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, index) =>
  (index * MINUTE_STEP).toString().padStart(2, '0'),
);
const HOURS = Array.from({ length: 12 }, (_, index) =>
  index.toString().padStart(2, '0'),
);

interface UseAlarmModalControllerParams {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  maxAlarms: number;
  /** Rule 11: 저장이 네트워크를 탈 수 있으므로 Promise 허용 + 아래 Mutex로 연타 차단 */
  onSave: (config: AlarmConfig) => Promise<void> | void;
}

export interface UseAlarmModalControllerResult {
  copy: ReturnType<typeof getAlarmMessages>;
  isEnabled: boolean;
  selectedTimes: string[];
  period: 'AM' | 'PM';
  selectedHour: string;
  selectedMinute: string;
  isAllSlotsFilled: boolean;
  isInfoOpen: boolean;
  isSaving: boolean;
  hourOptions: string[];
  minuteOptions: Array<{ value: string; label: string }>;
  handleSetEnabled: (checked: boolean) => void;
  handleSetPeriod: (period: 'AM' | 'PM') => void;
  handleSetSelectedHour: (hour: string) => void;
  handleSetSelectedMinute: (minute: string) => void;
  handleAddTime: () => void;
  handleRemoveTime: (time: string) => void;
  handleCloseInfo: () => void;
  handleSave: () => Promise<void>;
}

export function useAlarmModalController({
  lang,
  portfolio,
  maxAlarms,
  onSave,
}: UseAlarmModalControllerParams): UseAlarmModalControllerResult {
  const copy = getAlarmMessages(lang);
  const initialConfig = portfolio.alarmconfig ?? {
    enabled: false,
    selectedHours: [],
  };

  const [isEnabled, setIsEnabled] = useState(initialConfig.enabled);
  const [selectedTimes, setSelectedTimes] = useState<string[]>(
    initialConfig.selectedHours?.slice(0, maxAlarms) ?? [],
  );
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const previousSelectedTimesKeyRef = useRef<string | null>(null);

  const isAllSlotsFilled = selectedTimes.length >= maxAlarms;

  const minuteOptions = useMemo(
    () =>
      MINUTES.map((minute) => ({
        value: minute,
        label: `${minute}${copy.minuteUnit}`,
      })),
    [copy.minuteUnit],
  );

  // Rule 6: 모듈 최상단에 두고 단 한 곳에서도 안 쓰는 헬퍼(예: getSelectionFromTime) 금지.
  // 첫 선택 시각 → AM/PM·시·분 동기화는 이 effect 안에서만 인라인 파생한다.
  useEffect(() => {
    if (selectedTimes.length === 0) {
      previousSelectedTimesKeyRef.current = null;
      return;
    }

    const nextKey = selectedTimes.join(',');
    if (previousSelectedTimesKeyRef.current === nextKey) {
      return;
    }

    previousSelectedTimesKeyRef.current = nextKey;

    const firstTime = selectedTimes[0];
    const [hourString, minuteString = '00'] = firstTime.split(':');
    const hour24 = Number.parseInt(hourString, 10);

    if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) {
      setPeriod('AM');
      setSelectedHour('09');
      setSelectedMinute(minuteString);
      return;
    }

    if (hour24 >= 12) {
      setPeriod('PM');
      setSelectedHour((hour24 === 12 ? 0 : hour24 - 12).toString().padStart(2, '0'));
    } else {
      setPeriod('AM');
      setSelectedHour(hourString.padStart(2, '0'));
    }
    setSelectedMinute(minuteString);
  }, [selectedTimes]);

  const handleAddTime = useCallback(() => {
    let hour24Num = Number.parseInt(selectedHour, 10);
    if (Number.isNaN(hour24Num)) {
      return;
    }

    // Rule 2 & 6: 12h → 24h는 삼항 중첩 없이 if-return으로 고정 (12 AM → 00, 12 PM → 12, 그 외 PM +12)
    if (period === 'AM') {
      if (hour24Num === 12) {
        hour24Num = 0;
      }
    } else if (hour24Num !== 12) {
      hour24Num += 12;
    }

    const hour24 = hour24Num.toString().padStart(2, '0');
    const nextTime = `${hour24}:${selectedMinute}`;

    if (selectedTimes.includes(nextTime)) {
      setSelectedTimes((previous) => previous.filter((time) => time !== nextTime));
      return;
    }

    if (selectedTimes.length >= maxAlarms) {
      setIsInfoOpen(true);
      return;
    }

    setSelectedTimes((previous) => [...previous, nextTime].sort());
  }, [maxAlarms, period, selectedHour, selectedMinute, selectedTimes]);

  const handleRemoveTime = useCallback((time: string) => {
    setSelectedTimes((previous) => {
      const next = previous.filter((value) => value !== time);
      if (next.length === 0) {
        setIsEnabled(false);
      }
      return next;
    });
  }, []);

  const handleCloseInfo = useCallback(() => {
    setIsInfoOpen(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) {
      return;
    }

    const shouldEnable = isEnabled && selectedTimes.length > 0;
    const nextConfig: AlarmConfig = {
      enabled: shouldEnable,
      selectedHours: shouldEnable ? selectedTimes : [],
    };

    try {
      isSavingRef.current = true;
      setIsSaving(true);
      await Promise.resolve(onSave(nextConfig));
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [isEnabled, onSave, selectedTimes]);

  return {
    copy,
    isEnabled,
    selectedTimes,
    period,
    selectedHour,
    selectedMinute,
    isAllSlotsFilled,
    isInfoOpen,
    isSaving,
    hourOptions: HOURS,
    minuteOptions,
    handleSetEnabled: setIsEnabled,
    handleSetPeriod: setPeriod,
    handleSetSelectedHour: setSelectedHour,
    handleSetSelectedMinute: setSelectedMinute,
    handleAddTime,
    handleRemoveTime,
    handleCloseInfo,
    handleSave,
  };
}
```

오버코딩 검토:

- `useReducer` 불필요
- `hourOptions`, `minuteOptions` 정도까지만 허용
- **Rule 6:** export·호출되지 않는 모듈 레벨 함수 블록을 남기지 않는다. 시각 파생은 위 `useEffect` 인라인이 SSOT.
- **Rule 11:** `isSavingRef` + `finally`로 Mutex 해제를 보장(네트워크 실패·예외에도 무한 로딩/영구 잠금 방지)
- **Rule 10:** View에 넘길 핸들러는 `useCallback`으로 고정, 렌더마다 새 익명 함수를 return 객체에 심지 않음
- 상위가 `UiMutationCommand`를 쓰는 경우 `disabled={command.isExecuting}`와 이중 잠금이 되지 않도록 **한 축만 Mutex 소유**하도록 wiring 검증 필요

### 3.2 `PortfolioDetailsModal` 전략

**상태:** **구현 반영 완료**(§0.7).

목표:

- 하드코딩 문자열 및 `confirm` 제거
- 삭제 UX를 TDS/Info 계열 confirm으로 승격
- 캘린더/보유요약/선택일 거래내역을 View로 이동
- 보유 요약과 캘린더 파생을 컨트롤러로 이동

예상 파일 구조:

```ts
components/
  portfolioDetails/
    PortfolioDetailsView.tsx
    usePortfolioDetailsController.ts
constants/messages/
  portfolioDetailsMessages.ts
components/PortfolioDetailsModal.tsx
```

**Shell (`components/PortfolioDetailsModal.tsx`) — 구현과 동일 계약**

- `onDeleteTrade: (tradeId: string) => Promise<void> | void`
- `usePortfolioDetailsController({ lang, portfolio, isHistory, onDeleteTrade })` → `PortfolioDetailsView`에 `controller` 전달

#### 시뮬레이션 스니펫 C — `constants/messages/portfolioDetailsMessages.ts`

구현 정본은 **`constants/messages/portfolioDetailsMessages.ts`** 전체(`PORTFOLIO_DETAILS_MESSAGES`, `getPortfolioDetailsMessages`)이다. 타입 셰이프만 아래와 같다.

```ts
import type { AppLang } from '@/types';

export interface PortfolioDetailsMessageSet {
  settledBadge: string;
  holdingsSummaryTitle: string;
  noHoldings: string;
  avgPrice: string;
  totalValuation: string;
  weekdayCalendarTitle: string;
  weekdayHeaders: readonly string[];
  selectedDateTradesTitle: string;
  noTrades: string;
  finalSettlementSellPrefix: string;
  settlementAmount: string;
  buyLabel: string;
  sellLabel: string;
  tradeExecutionSuffix: string;
  executionPrice: string;
  quantity: string;
  fee: string;
  closeAction: string;
  monthTitle: (year: number, month: number) => string;
  deleteTradeDialog: {
    title: string;
    body: string;
    confirm: string;
  };
  aria: {
    closeModal: string;
    closeBackdrop: string;
    previousMonth: string;
    nextMonth: string;
    selectDate: (date: string) => string;
    openTradeDeleteDialog: (ticker: string, date: string) => string;
  };
}

// export const PORTFOLIO_DETAILS_MESSAGES: Record<AppLang, PortfolioDetailsMessageSet>
// export function getPortfolioDetailsMessages(lang: AppLang): PortfolioDetailsMessageSet
```

#### 시뮬레이션 스니펫 D — `components/portfolioDetails/usePortfolioDetailsController.ts`

아래는 **구현 파일과 동일**하다(`lang` 파라미터는 View 연동용으로 훅 시그니처에 유지).

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Portfolio, Trade } from '@/types';
import { fetchStockPrices } from '@/services/stockService';
import { calculateHoldings } from '@/utils/portfolioCalculations';
import {
  getPortfolioDetailsMessages,
  type PortfolioDetailsMessageSet,
} from '@/constants/messages/portfolioDetailsMessages';
import { useAsyncTdsConfirm } from '@/components/tds-adapter/useAsyncTdsConfirm';
import { TDS_DIALOG_MESSAGES } from '@/constants/tdsDialogMessages';

/** USD 등 2소수 화폐 스칼라 — Rule 1: EPSILON 포함 센트 반올림 */
const MONEY_DECIMAL_SCALE = 100;

function roundMoneyScalar2(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_DECIMAL_SCALE) / MONEY_DECIMAL_SCALE;
}

type CalendarCell =
  | { key: string; kind: 'empty' }
  | { key: string; kind: 'date'; date: Date };

interface HoldingSummaryItem {
  ticker: string;
  quantity: number;
  avgPrice: number;
  valuation: number;
}

interface UsePortfolioDetailsControllerParams {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  isHistory?: boolean;
  onDeleteTrade: (tradeId: string) => void | Promise<void>;
}

export interface UsePortfolioDetailsControllerResult {
  copy: PortfolioDetailsMessageSet;
  labels: (typeof TDS_DIALOG_MESSAGES)['ko']['actions'];
  deleteDialogProps: ReturnType<typeof useAsyncTdsConfirm>['dialogProps'];
  isReadOnly: boolean;
  selectedDate: string;
  currentMonth: Date;
  calendarGrid: CalendarCell[];
  holdingsSummary: HoldingSummaryItem[];
  selectedDayTrades: Trade[];
  getTradesForDate: (date: string) => Trade[];
  handleSetSelectedDate: (date: string) => void;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;
  handleRequestDeleteTrade: (tradeId: string) => void;
}

function getDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildCalendarGrid(currentMonth: Date): CalendarCell[] {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekday = firstDay.getDay();
  const leadingEmptyCount =
    firstWeekday >= 1 && firstWeekday <= 5 ? firstWeekday - 1 : 0;

  const cells: CalendarCell[] = [];
  for (let index = 0; index < leadingEmptyCount; index += 1) {
    cells.push({
      key: `empty-${year}-${month}-${index}`,
      kind: 'empty',
    });
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(year, month, day);
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) {
      continue;
    }
    cells.push({
      key: getDateKey(date),
      kind: 'date',
      date,
    });
  }

  return cells;
}

export function usePortfolioDetailsController({
  lang,
  portfolio,
  isHistory,
  onDeleteTrade,
}: UsePortfolioDetailsControllerParams): UsePortfolioDetailsControllerResult {
  const copy = getPortfolioDetailsMessages(lang);
  const labels = TDS_DIALOG_MESSAGES[lang].actions;
  const deleteDialog = useAsyncTdsConfirm(lang);
  const [selectedDate, setSelectedDate] = useState(() => getDateKey(new Date()));
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [stockPrices, setStockPrices] = useState<Record<string, number>>({});

  const isReadOnly = isHistory ?? Boolean(portfolio.isClosed);

  const holdings = useMemo(() => {
    if (isReadOnly) {
      return [];
    }
    return calculateHoldings(portfolio);
  }, [isReadOnly, portfolio]);

  useEffect(() => {
    if (isReadOnly || holdings.length === 0) {
      setStockPrices({});
      return;
    }

    let isCancelled = false;

    fetchStockPrices(holdings.map((holding) => holding.stock))
      .then((prices) => {
        if (isCancelled) {
          return;
        }

        const nextPrices = Object.fromEntries(
          Object.entries(prices).map(([ticker, data]) => [ticker, data.price]),
        );
        setStockPrices(nextPrices);
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }

        console.error('Failed to fetch stock prices', error);
        setStockPrices({});
      });

    return () => {
      isCancelled = true;
    };
  }, [holdings, isReadOnly]);

  // Rule 1 & 6: calculateHoldings가 이미 종목별 가중 평균 단가를 반환하므로 reduce로 다시 합치지 않는다.
  // 잘못된 avgPrice 덮어쓰기는 금융 수학 파괴. O(N) map 한 번만 허용.
  // §0.6: valuation = 시가 우선 — unitPrice = stockPrices[ticker] ?? avgPrice (제품 정책).
  // Rule 1: avgPrice·valuation 등 화폐 스칼라는 EPSILON 포함 2소수 반올림. quantity는 정수 주만 가정 → 별도 반올림 생략.
  const holdingsSummary = useMemo(() => {
    if (isReadOnly || holdings.length === 0) {
      return [];
    }

    return holdings.map((holding) => {
      const unitPrice = stockPrices[holding.stock] ?? holding.avgPrice;
      const rawValuation = holding.quantity * unitPrice;

      return {
        ticker: holding.stock,
        quantity: holding.quantity,
        avgPrice: roundMoneyScalar2(holding.avgPrice),
        valuation: roundMoneyScalar2(rawValuation),
      };
    });
  }, [holdings, isReadOnly, stockPrices]);

  const tradesByDate = useMemo(() => {
    return portfolio.trades.reduce<Record<string, Trade[]>>((acc, trade) => {
      const currentTrades = acc[trade.date] ?? [];
      currentTrades.push(trade);
      acc[trade.date] = currentTrades;
      return acc;
    }, {});
  }, [portfolio.trades]);

  const selectedDayTrades = tradesByDate[selectedDate] ?? [];
  const calendarGrid = useMemo(() => buildCalendarGrid(currentMonth), [currentMonth]);
  const getTradesForDate = useCallback(
    (date: string) => tradesByDate[date] ?? [],
    [tradesByDate],
  );

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((previous) =>
      new Date(previous.getFullYear(), previous.getMonth() - 1, 1),
    );
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((previous) =>
      new Date(previous.getFullYear(), previous.getMonth() + 1, 1),
    );
  }, []);

  const handleRequestDeleteTrade = useCallback(
    (tradeId: string) => {
      deleteDialog.open({
        title: copy.deleteTradeDialog.title,
        body: copy.deleteTradeDialog.body,
        confirmLabel: copy.deleteTradeDialog.confirm,
        tone: 'danger',
        action: () => onDeleteTrade(tradeId),
      });
    },
    [copy.deleteTradeDialog, deleteDialog, onDeleteTrade],
  );

  return {
    copy,
    labels,
    deleteDialogProps: deleteDialog.dialogProps,
    isReadOnly,
    selectedDate,
    currentMonth,
    calendarGrid,
    holdingsSummary,
    selectedDayTrades,
    getTradesForDate,
    handleSetSelectedDate: setSelectedDate,
    handlePrevMonth,
    handleNextMonth,
    handleRequestDeleteTrade,
  };
}
```

오버코딩 검토:

- **`holdingsSummary`:** `calculateHoldings` 결과를 **종목별 `reduce`로 재집계하지 않는다**. 중복 티커를 수동으로 합칠 때 `avgPrice = last.avgPrice`로 덮어쓰면 **가중 평균이 깨진다**(Rule 1). 스니펫은 **`holdings.map` 단일 패스**만 사용한다. **`valuation`은 `stockPrices` 시가 우선**(§0.6). **`avgPrice`/`valuation`은 `Number.EPSILON` 포함 2소수 반올림**(Rule 1). **`quantity`는 정수 주 도메인**으로 별도 소수 반올림 없음(§0.6).
- **`latestTradeDate` 제거:** 어떤 렌더/핸들러에도 소비되지 않는 파생은 **데드 코드**이며, 그 위의 `useMemo`는 **blind `useMemo`**에 해당 → 스니펫에서 삭제한다(Rule 2·6).
- **`holdings`의 `useMemo`:** `isReadOnly` 분기 + `calculateHoldings(portfolio)` 호출이 묶여 있어 **정당한 파생 캐시**로 유지한다.
- **`fetchStockPrices`:** `void …then`만 두고 `.catch`를 빼면 Rule 6·11 위반이므로 **항상 `.catch` + 취소 플래그 + 실패 시 `setStockPrices({})`**로 UI 붕괴를 막는다. `console.error`는 **삼킴 방지용 관측**이며, 사용자-facing 토스트가 필요하면 `portfolioDetailsMessages` 등 **전용 SSoT 키**를 추가한 뒤 `showErrorToast`를 호출하는 경로를 별도로 합의한다(Rule 3).
- **캘린더·거래 인덱스:** `buildCalendarGrid`, `tradesByDate`, `selectedDayTrades`, `getTradesForDate`, `calendarGrid`의 `useMemo`는 **컨트롤러**에 둔다(현재 구현과 동일). View는 렌더만 담당.
- 삭제 UX는 기존 `TdsConfirmDialog` 재사용이므로 새 모달 abstraction 금지
- **히스토리(`isReadOnly`) 초기 날짜:** 구현은 `selectedDate`/`currentMonth`를 **항상 `new Date()` 기준**으로 초기화한다. 종료 포트폴리오에서 **마지막 거래일로 자동 이동**하는 UX는 넣지 않았다(과거 중간 구현 논의와 다를 수 있음 — 아래 §8 참고).

### 3.3 `PortfolioCardActions` 전략

**상태:** **구현 반영 완료**(§0.7).

목표:

- 레거시 `I18N` 의존 제거
- 알람/삭제 버튼 중복 평탄화
- 삭제 확인 경로는 현재 `useAsyncTdsConfirm` 유지
- **Rule 3:** 삭제 트리거의 `aria-label`/`title` 등에 **영어·한글 raw fallback**(예: `'Delete portfolio'`) 금지 — SSoT 누락 시 **`''`**만 허용(이는 **툴팁/아이콘 트리거**에 한함).
- **Rule 11:** `deleteTitle`/`deleteBody`/`deleteConfirm` 등 **확인 다이얼로그 필드**가 비어 있으면 **`deleteDialog.open`을 호출하지 않고** **`auth.authCopyMissingFallback` 토스트만** 호출(신규 키 금지, §0.6) — 빈 껍데기 다이얼로그 금지.
- 작은 컴포넌트로 유지

권장 구조:

- 파일 분리 없음
- `dashboardMessages` 또는 `portfolio` 메시지에 필요한 aria/key만 추가
- 버튼 클래스 조합 helper만 소규모 추출

#### 시뮬레이션 스니펫 E — 단일 파일 리팩토링 방향

```tsx
import React, { useCallback } from 'react';
import { Bell, BellOff, Trash2 } from 'lucide-react';
import { TDS_DIALOG_MESSAGES } from '@/constants/tdsDialogMessages';
import { getDashboardMessages } from '@/constants/messages/dashboardMessages';
import { useTossApp } from '@/contexts/TossAppContext';
import { TDSButton } from '@/components/tds';
import { TdsConfirmDialog } from '@/components/tds-adapter/TdsConfirmDialog';
import { showErrorToast } from '@/components/tds-adapter/showErrorToast';
import { useAsyncTdsConfirm } from '@/components/tds-adapter/useAsyncTdsConfirm';

interface PortfolioCardActionsProps {
  lang: 'ko' | 'en';
  isAlarmEnabled: boolean;
  onOpenAlarm: () => void;
  onDeletePortfolio: () => Promise<void> | void;
}

function getAlarmButtonClassName(isAlarmEnabled: boolean, isInTossApp: boolean): string {
  const base = 'w-9 h-9 rounded-lg flex items-center justify-center';
  if (isInTossApp) {
    return isAlarmEnabled
      ? `${base} min-w-0 p-0 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500`
      : `${base} min-w-0 p-0`;
  }

  if (isAlarmEnabled) {
    return `${base} transition-all duration-300 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500 border border-amber-200 dark:border-amber-500/30`;
  }

  return `${base} transition-all duration-300 bg-transparent text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800`;
}

export const PortfolioCardActions: React.FC<PortfolioCardActionsProps> = ({
  lang,
  isAlarmEnabled,
  onOpenAlarm,
  onDeletePortfolio,
}) => {
  const { isInTossApp } = useTossApp();
  const dashboardCopy = getDashboardMessages(lang);
  const labels = TDS_DIALOG_MESSAGES[lang].actions;
  const portfolioCopy = TDS_DIALOG_MESSAGES[lang]?.portfolio;
  const deleteDialog = useAsyncTdsConfirm(lang);
  // Rule 3: 트리거 A11y — openDeleteConfirm SSOT만. 누락 시 '' (§0.6).
  const triggerLabel = portfolioCopy?.openDeleteConfirm ?? '';

  const handleRequestDelete = useCallback(() => {
    const titleText = portfolioCopy?.deleteTitle?.trim() ?? '';
    const bodyText = portfolioCopy?.deleteBody?.trim() ?? '';
    const confirmText = portfolioCopy?.deleteConfirm?.trim() ?? '';

    // Rule 11 & 3: 필드 누락 시 모달 미오픈. 토스트는 auth.authCopyMissingFallback 만 재사용(신규 키·영문 리터럴 금지, §0.6).
    if (titleText === '' || bodyText === '' || confirmText === '') {
      const fallbackMsg =
        TDS_DIALOG_MESSAGES[lang]?.auth?.authCopyMissingFallback?.trim() ?? '';
      if (fallbackMsg !== '') {
        showErrorToast(fallbackMsg);
      }
      return;
    }

    deleteDialog.open({
      title: titleText,
      body: bodyText,
      confirmLabel: confirmText,
      tone: 'danger',
      action: onDeletePortfolio,
    });
  }, [
    deleteDialog,
    lang,
    onDeletePortfolio,
    portfolioCopy?.deleteBody,
    portfolioCopy?.deleteConfirm,
    portfolioCopy?.deleteTitle,
  ]);

  const alarmIcon = isAlarmEnabled ? (
    <Bell size={16} fill="currentColor" />
  ) : (
    <BellOff size={16} />
  );

  const alarmButtonClassName = getAlarmButtonClassName(isAlarmEnabled, isInTossApp);

  return (
    <>
      {isInTossApp ? (
        <>
          <TDSButton
            variant="tertiary"
            size="small"
            onClick={onOpenAlarm}
            className={alarmButtonClassName}
            aria-label={dashboardCopy.openAlarmSettingsAria}
          >
            {alarmIcon}
          </TDSButton>
          <TDSButton
            variant="tertiary"
            size="small"
            onClick={handleRequestDelete}
            className="flex h-9 w-9 min-w-0 items-center justify-center rounded-lg p-0 text-slate-500"
            aria-label={triggerLabel}
          >
            <Trash2 size={16} strokeWidth={2} />
          </TDSButton>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onOpenAlarm}
            className={alarmButtonClassName}
            aria-label={dashboardCopy.openAlarmSettingsAria}
          >
            {alarmIcon}
          </button>
          <button
            type="button"
            onClick={handleRequestDelete}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-transparent text-slate-500 transition-all duration-200 hover:border-red-600 hover:bg-red-600 hover:text-white dark:border-slate-700 active:scale-95"
            title={triggerLabel}
            aria-label={triggerLabel}
          >
            <Trash2 size={16} strokeWidth={2} />
          </button>
        </>
      )}

      <TdsConfirmDialog {...deleteDialog.dialogProps} labels={labels} />
    </>
  );
};
```

**구현 정합:** `PortfolioCardActions.tsx`는 `components/portfolio/` 하위이므로 import는 스니펫의 `@/` 별칭 대신 **`../../constants/...`**, **`../tds`** 등 **상대 경로**를 쓴다(동일 모듈).

주의:

- `dashboardMessages.ts`에는 `openAlarmSettingsAria` 같은 전용 key를 추가하는 것으로 문서 기준을 고정합니다.
- 삭제 아이콘의 접근 가능 이름은 **`portfolio.openDeleteConfirm`** 만 사용한다(§0.6). **`?? 'Delete portfolio'`** 등 raw 문자열은 **금지**(Rule 3). `deleteTitle`/`deleteBody`/`deleteConfirm`은 **확인 다이얼로그**용이며, **하나라도 공백이면 `open`하지 않고** **`auth.authCopyMissingFallback` 토스트만** 호출한다(신규 번역 키 추가 없음, `common.refundActionFailed` 2차 폴백 없음 — §0.6). 외부 리뷰의 `dashboardCopy.deleteConfirmBody` 등은 **본 레포 SSOT와 불일치**하므로 스니펫은 **`portfolio` 블록 키**만 사용한다.
- 이 컴포넌트는 “리팩토링”이지 “재설계”가 아니므로 파일 수 증가를 금지합니다.

### 3.4 `SessionExpiredAlertGate` 전략

**상태:** **구현 반영 완료**(§0.7).

목표:

- 현재 단순 구조 유지
- blind `useMemo` 금지
- **Rule 11:** 다국어 조각 누락 시 **침묵(`return null`만)** 금지 — SSoT 토스트 + `onClose`로 사용자 유폐 방지
- 토스트 문구는 **절대** JSX/스니펫에 리터럴을 박지 않고, 인증·세션 UI 카피 조회 실패 전용 **`TDS_DIALOG_MESSAGES[lang].auth.authCopyMissingFallback`**만 사용(Rule 3). **다른 도메인 키**(`common.refundActionFailed` 등)를 세션 만료 게이트 복구용으로 빌려 쓰지 않는다.
- 과잉 분리 금지

#### 시뮬레이션 스니펫 F — 최소 수정안

```tsx
import React, { useEffect, useRef } from 'react';
import type { AppLang } from '@/types';
import { TDS_DIALOG_MESSAGES } from '@/constants/tdsDialogMessages';
import { TdsAlertDialog } from '@/components/tds-adapter/TdsAlertDialog';
import { showErrorToast } from '@/components/tds-adapter/showErrorToast';

interface SessionExpiredAlertGateProps {
  lang: AppLang;
  isOpen: boolean;
  onClose: () => void;
}

export const SessionExpiredAlertGate: React.FC<SessionExpiredAlertGateProps> = ({
  lang,
  isOpen,
  onClose,
}) => {
  const labels = TDS_DIALOG_MESSAGES[lang]?.actions;
  const authMessages = TDS_DIALOG_MESSAGES[lang]?.auth;
  const fallbackToastMessage = TDS_DIALOG_MESSAGES[lang]?.auth?.authCopyMissingFallback;
  const hasRecoveryToastFiredRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasRecoveryToastFiredRef.current = false;
      return;
    }
    if (labels != null && authMessages != null) {
      return;
    }
    if (
      !hasRecoveryToastFiredRef.current &&
      fallbackToastMessage != null &&
      fallbackToastMessage !== ''
    ) {
      hasRecoveryToastFiredRef.current = true;
      showErrorToast(fallbackToastMessage);
    }
    onClose();
  }, [authMessages, fallbackToastMessage, isOpen, labels, onClose]);

  if (!isOpen || labels == null || authMessages == null) {
    return null;
  }

  return (
    <TdsAlertDialog
      isOpen={isOpen}
      title={authMessages.sessionExpiredTitle}
      body={authMessages.sessionExpiredBody}
      confirmLabel={authMessages.sessionExpiredAcknowledge}
      labels={labels}
      onClose={onClose}
    />
  );
};

export default SessionExpiredAlertGate;
```

**구현 정합:** import는 `@/` 대신 **`../../types`**, **`../../constants/tdsDialogMessages`**, **`../tds-adapter/...`** 상대 경로. 위와 동일 로직.

오버코딩 검토:

- 새 전용 컨트롤러/뷰 파일 금지
- `useEffect` 한 개 + 기존 토스트 SSOT로 Rule 11만 만족시키는 **최소 침습**
- **Rule 10:** Strict Mode에서 복구 경로가 이중 실행될 때 **동일 토스트 중복**을 막기 위해 **`hasRecoveryToastFiredRef`를 스니펫에 명시**한다. `isOpen`이 false로 내려갈 때 ref를 초기화해 다음 오픈 사이클에서 다시 1회만 발화할 수 있게 한다.
- 장기적으로는 `TDS_DIALOG_MESSAGES` 타입을 `Record<AppLang, ...>`로 강제해 **빌드 타임에 키 누락을 0으로** 만드는 것이 1순위이며, 본 스니펫은 **런타임 안전망**

**확정:** `constants/tdsDialogMessages.ts`의 `auth` 블록에 **`authCopyMissingFallback`**을 `ko`/`en` 모두 명시한다(예: ko *「안내 문구를 불러오지 못했습니다. 다시 로그인해 주세요.」*, en *「We could not load the dialog text. Please sign in again.」*). 스니펫 F의 `fallbackToastMessage`는 **이 키만** 참조한다.

---

## 4. 7대 안전수칙 전수 스캔 계획

### 4.1 스캔 대상 범위

직접 스캔 범위:

- `components/Dashboard.tsx`
- `components/AlarmModal.tsx`
- `components/PortfolioDetailsModal.tsx`
- `components/QuickInputModal.tsx`
- `components/TradeExecutionModal.tsx`
- `components/portfolio/PortfolioCardActions.tsx`
- `components/auth/*`
- `components/strategyCreator/*`
- `components/CustomDropdown.tsx`
- `components/InfoModal.tsx`
- `components/Markets.tsx` (B4 스캔 부수 핫픽스 실적 — §0.7)
- `App.tsx`

### 4.2 스캔 패턴

#### Rule 11 — Mutex/finally 해제 누락

```txt
검색: isExecutingRef.current = true / false, finally, onSave, onSubmit, run:
판정: lock 획득 경로가 있는데 finally에서 해제가 보장되지 않으면 수정
조치: try/finally 강제, Promise.resolve 래핑 유지, UI command 계약과 동기화
```

#### Rule 6 & 11 — 비동기 거부 삼킴(Swallowed rejection) / 네트워크 실패 방치

```txt
검색: void .*\.then\(|\.then\([^)]+\)\s*;\s*$|fetch\(|fetchStockPrices|axios\.|supabase\.
판정: Promise 체인에 .catch(또는 try/catch in async)가 없고 void로 무시되면 수정
조치: isCancelled(또는 AbortController) + .catch에서 unknown 로깅 + UI 폴백(빈 상태/스켈레톤). 사용자 알림은 SSoT 문구로만
```

#### Rule 7 — `any` / `Record<string, unknown>` / `!`

```txt
검색: \bany\b, Record<string, unknown>, !, non-null assertion 패턴
판정: UI prop/상태/헬퍼에 남아 있으면 수정
조치: unknown + narrowing, 명시 타입, early return, ?? fallback
```

#### Rule 3 — Raw string 하드코딩

```txt
검색: lang === 'ko', JSX text node, title="...", aria-label="..."
판정: 기능별 SSoT 없이 JSX에 직접 박힌 문구면 수정
조치: constants/messages/* typed dictionary로 이동
```

#### Rule 4 — 비상호작용 태그의 클릭 A11y 누락

```txt
검색: <div ... onClick= / <span ... onClick=
판정: role/tabIndex/onKeyDown/aria-label 중 하나라도 빠지면 수정
조치: handlePressEnterOrSpace + full a11y contract
```

#### Rule 2 — blind `useMemo`

```txt
검색: useMemo(() => boolean/string/단순 조건문)
판정: 원시값 O(1) 도출이면 제거
조치: 즉시 평가 또는 소형 helper로 치환
참고: 작은 배열에서 max/min 한 번 찾기, 미사용 변수에만 대입되는 파생 등은 blind useMemo + 데드 코드 후보로 스니펫 D 사례를 기준선으로 삼는다
```

#### Rule 2 & 6 — 3중첩 삼항

```txt
검색: A ? B : C ? D : E 형태
판정: JSX/파생 계산부에 남아 있으면 수정
조치: helper function, guard clause, lookup object
```

#### Rule 1 & 10 — GC churn / UI freezing

```txt
검색: 보이지 않는 모달용 대형 props 객체 생성, while 루프, 렌더마다 대형 map/filter 조립
판정: 숨은 모달에 props 꾸러미를 상시 생성하거나, 메인 스레드 블로킹 루프가 있으면 수정
조치: visible branch에서만 계산, controller로 이동, price <= 0 break 같은 금융 guard 유지
```

### 4.3 스캔 후 허용되는 추가 수정

- 직접 타깃 파일이 아니더라도, 위 7규칙 위반이 **B4 영역의 실제 blocker**면 즉시 수정
- 단, unrelated cleanup은 금지

---

## 5. 실행 순서 (완료 기준으로 정리)

1. `AlarmModal` — 메시지 SSoT + `useAlarmModalController` / `AlarmModalView` 분리 **구현 완료**
2. `PortfolioDetailsModal` — confirm 제거, 스니펫 D 계약, shell 타입 **구현 완료**
3. `PortfolioCardActions` — 스니펫 E 계약 **구현 완료**
4. `SessionExpiredAlertGate` — 스니펫 F 계약 **구현 완료**
5. 7대 안전수칙 스캔 — §4 패턴 적용(필요 시 §4.3 범위 핫픽스, 예: `Markets.tsx`)
6. 검증 — `npm run typecheck` + IDE lint 0건

---

## 6. 시뮬레이션 통과 체크리스트 (구현 반영)

- [x] `AlarmModal`은 메시지 SSoT + controller/view 분리가 적용되었다.
- [x] `useAlarmModalController`가 **12h→24h 변환**, **저장 Mutex(`finally`)**, **`UseAlarmModalControllerResult` export**를 만족한다.
- [x] 스니펫 B에 **미사용 모듈 레벨 헬퍼**가 없고, 첫 시각 동기화는 **`useEffect` 인라인**만 사용한다.
- [x] `PortfolioDetailsModal`에서 네이티브 confirm이 제거되고 TDS 확인 경로가 명확하다.
- [x] 스니펫 D는 **주가 `.catch`·취소 플래그·실패 시 `stockPrices` 폴백**을 포함하고, **캘린더/거래 인덱스가 컨트롤러**에 있다.
- [x] **`holdingsSummary`는 `holdings.map` 한 번**이며 시가 우선·EPSILON 반올림(§0.6)을 만족한다.
- [x] 스니펫 E: **`openDeleteConfirm ?? ''`**, 빈 다이얼로그 필드 시 **`authCopyMissingFallback`만**.
- [x] `SessionExpiredAlertGate`: 토스트 + `onClose` + `hasRecoveryToastFiredRef` + default export.
- [x] 7대 안전수칙 검색 패턴과 검증 절차가 §4·본문과 일치한다.

---

## 7. 구현 후 유지보수 시 확인

1. 스니펫과 구현을 양방향으로 맞출 때 **§0.7 테이블**을 먼저 갱신한다.
2. Rule 2, 3, 4, 6, 7, 10, 11 회귀는 §4 패턴으로 스캔한다.
3. 검증은 **`npm run typecheck` + IDE lint**를 기본으로 한다.

---

## 8. 계획서 대비 구현에서 달라졌던 점 (문서 개정 시 반영함)

| 구분 | 이전 계획서/스니펫 | 현재 구현 |
|------|-------------------|-----------|
| 문서 성격 | “시뮬레이션만, 코드 수정 금지” | **구현 완료 후 SSOT**로 역할 변경(§머리말·§0.3·§1·§5–7). |
| 스니펫 A | 긴 `ALARM_MESSAGES` ko/en 인라인 | **`AlarmMessageSet` 타입만** 문서에 두고, **문구 레코드는 `alarmMessages.ts` 정본**. |
| 스니펫 B | `UseAlarmModalControllerResult` 없음, return 필드 순서 상이 | **인터페이스 export + `hourOptions`/`minuteOptions` 순서**가 코드와 동일. |
| 스니펫 D | `holdings`·`stockPrices`·`handleSetCurrentMonth`를 return에 노출 | **비노출**. 대신 `calendarGrid`·`selectedDayTrades`·`getTradesForDate`·월 핸들러가 컨트롤러에 있음. |
| 스니펫 D | 캘린더 파생을 View 쪽으로 두자는 문구 | **컨트롤러**에 `buildCalendarGrid` 등 집중(구현과 맞춤). |
| 스니펫 C | 메시지 인터페이스가 축약됨 | **실제 `PortfolioDetailsMessageSet` 필드**로 확장; 레코드 본문은 파일이 정본. |
| 스니펫 E/F | `@/` import만 | 구현은 **`../../` 상대 경로** — 문서에 **구현 정합** 주석 추가. |
| 스니펫 F | default export 없음 | 구현에 **`export default SessionExpiredAlertGate`** 추가 반영. |
| 히스토리 UX | (중간 논의) `latestTradeDate` 동기화 제거 | 구현은 **초기 `selectedDate`/`currentMonth` = 오늘** — 종료 포트폴리오 **마지막 거래일 자동 포커스 없음**(의도적 스코프). |
| B4 스캔 | 문서에만 계획 | **`components/Markets.tsx`** RSI 클래스 3중 삼항 제거 **실제 핫픽스**(§0.7). |
