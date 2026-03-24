# 대시보드 일별 매매 실행 헤더 — VR 사이클 기간(`#n: MM/DD ~ MM/DD`) 표시 계획

**목표:** [VR_CYCLE_REFACTORING_PLAN_FINAL.md](./VR_CYCLE_REFACTORING_PLAN_FINAL.md) 에 맞춰, 대시보드 포트폴리오 카드의 **일별 매매 실행** 박스 **헤더**에서 `VrBadge`(거치식·적립식·인출식) 옆에 **현재 사이클 기간**을 표시한다.

**현재 상태:** 헤더에는 `VrBadge`만 있고 사이클 문구는 없음. 동일한 날짜 계산·포맷은 `utils/dailyExecutionSummary.ts` 의 `formatVrBandBlock` 에서만 사용 중(`getVrCyclePeriodText` + `STRINGS.cyclePeriodFormat`).

---

## 1. 설계 원칙

| 원칙 | 내용 |
|------|------|
| **SSOT** | `getVrCyclePeriodText` · `sanitizeVrCycleWeeks` · **타임존**(`alarmconfig?.timezone \|\| DEFAULT_TIMEZONE`) · **문구 포맷**(`#n: s ~ e` / 영문)은 알람 블록과 **동일 인자**로 맞춘다. |
| **cycleIndex** | 스냅샷이 있으면 `portfolio.vrSnapshot?.cycleIndex` 를 넘겨 Edge(T+1)와 UI가 같은 회차를 본다. 없으면 `getVrCyclePeriodText` 내부의 **미국장 기준 logical today** 폴백을 그대로 쓴다. |
| **표시 번호** | `getVrCyclePeriodText` 는 `cycleFormat` 에 **1-based** 인덱스를 넘긴다(`cycleIndex + 1`). `STRINGS.cyclePeriodFormat` 과 일치. |
| **실패 시** | `startDate` 없음 등으로 `'-'` 가 나오면 헤더에는 **아무것도 추가하지 않음**(배지만 유지). |

---

## 2. 권장 구현: 유틸 1곳에 묶고 Dashboard는 호출만

`Dashboard.tsx` 에 `getVrCyclePeriodText` 호출을 복붙하면 `cyclePeriodFormat`·타임존이 알람과 어긋날 위험이 있으므로, **`dailyExecutionSummary.ts` 에 export 헬퍼를 두는 방식**을 권장한다.

### 2.1 `utils/dailyExecutionSummary.ts` 에 추가 (스니펫)

`STRINGS` 는 파일 내부 상수이므로, 동일 규칙으로 라벨만 반환하는 함수를 **파일 하단 근처(export 영역)** 에 추가한다.

```ts
/** 대시보드 VR 일별실행 헤더용. 알람 VR 블록과 동일한 사이클·타임존·포맷 규칙. */
export function getVrDailyExecutionCycleHeaderLabel(
  portfolio: Portfolio,
  lang: Lang,
): string | null {
  const vrParams = portfolio.strategy.vrBand;
  if (!vrParams) return null;

  const s = STRINGS[lang] ?? STRINGS.ko;
  const snapshot = portfolio.vrSnapshot;
  const tz = portfolio.alarmconfig?.timezone || DEFAULT_TIMEZONE;

  const text = getVrCyclePeriodText({
    startDate: portfolio.startDate,
    cycleWeeks: sanitizeVrCycleWeeks(vrParams.cycleWeeks),
    currentCycleIndex: snapshot?.cycleIndex,
    lang,
    timezone: tz,
    cycleFormat: (idx, start, end) => s.cyclePeriodFormat(idx, start, end),
  });

  if (!text || text === '-') return null;
  return text;
}
```

**선택(리팩터):** `formatVrBandBlock` 안의 `cycleText` 계산(동일 블록)을 위 함수 호출로 치환하면 중복이 사라진다.

```ts
// formatVrBandBlock 내부 예시 (개념)
const cycleText = getVrDailyExecutionCycleHeaderLabel(portfolio, lang);
if (cycleText) {
  headerLine += ` (${cycleText})`;
}
```

(알람 블록은 기존처럼 괄호 안에 넣을지, 헤더는 괄호 없이만 넣을지 **UI만 다르게** 가져가면 된다.)

---

## 3. `components/Dashboard.tsx` — `PortfolioCard` 헤더 UI (스니펫)

### 3.1 import

```ts
import { formatPortfolioDailyExecutionBlock, joinDailyExecutionBlocks, getVrDailyExecutionCycleHeaderLabel } from '../utils/dailyExecutionSummary';
```

(이미 `dailyExecutionSummary` 에서 import 한다면 `getVrDailyExecutionCycleHeaderLabel` 만 추가.)

### 3.2 `PortfolioCard` 본문 — `useMemo` (선택, 과도한 재계산 방지)

`portfolio`·`lang` 이 바뀔 때만 계산:

```ts
const vrCycleHeaderLabel = useMemo(
  () => getVrDailyExecutionCycleHeaderLabel(portfolio, lang),
  [portfolio, lang],
);
```

### 3.3 JSX — `VrBadge` 바로 다음 (기존 841~846 라인 근처)

`VrBadge`와 **다분할 배지** 사이에 삽입:

```tsx
<div className="flex items-center gap-1.5 mb-1.5 opacity-80 flex-wrap">
  <span className="text-[9px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest">
    {t.dailyExecution}
  </span>
  <Info size={10} className="text-blue-700 dark:text-blue-300 shrink-0" />
  {isVrStrategy && vrSettings && (
    <>
      <VrBadge mode={vrSettings.vrMode} lang={lang} />
      {vrCycleHeaderLabel && (
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded-md text-blue-800 dark:text-blue-200 bg-blue-100/60 dark:bg-blue-500/20"
          title={lang === 'ko' ? '현재 리밸런싱 사이클 기간' : 'Current rebalancing cycle'}
        >
          {vrCycleHeaderLabel}
        </span>
      )}
    </>
  )}
  {isMultiSplitStrategy && (multiSplitPhase || isInQuarterMode) && (
    {/* 기존 다분할 배지 블록 유지 */}
  )}
</div>
```

- **`flex-wrap`:** 좁은 폭에서 배지·사이클이 한 줄을 넘기면 줄바꿈.
- **스타일:** 다분할 phase 뱃지와 톤을 맞추되, VR 사이클은 **블루 계열**로 구분(위는 예시 — 디자인 팀 기준에 맞게 조정).
- **접근성:** `title` 또는 부모에 `aria-label` 로 “현재 사이클 기간” 의미 보강 가능.

---

## 4. 대안(비권장): Dashboard에만 인라인 호출

헬퍼를 만들지 않을 경우, `Dashboard` 에서 직접:

```ts
import { getVrCyclePeriodText, sanitizeVrCycleWeeks } from '../utils/vrBandStrategy';
import { DEFAULT_TIMEZONE } from '../constants/vrConstants';
```

그리고 `cycleFormat` 을 ko/en 분기로 **하드코딩**해야 해서 `dailyExecutionSummary` 의 `STRINGS.cyclePeriodFormat` 과 **이중 유지**가 된다. 가능하면 §2 방식을 택한다.

---

## 5. 검증 체크리스트 (수동)

1. **VR 포트폴리오 + 스냅샷 있음** · `cycleIndex` 설정됨 → 헤더에 `#n: … ~ …` 가 배지 옆에 표시, 숫자 n이 알람/텔레그램 VR 줄과 동일한지.
2. **스냅샷 없음**(pending) → 폴백 날짜로라도 유효하면 표시, `startDate` 없으면 라벨 숨김.
3. **알람 타임존 변경** 후 헤더 날짜 표기가 `formatVrBandBlock` 과 여전히 일치하는지(월/일 경계).
4. **en** 언어 → `Cycle n: … to …` 형태.
5. **모바일 좁은 폭** → 줄바꿈 후 레이아웃 깨짐 없음.

---

## 6. 문서·명세 정합

- 구현 후 [VR_CYCLE_REFACTORING_PLAN_FINAL.md](./VR_CYCLE_REFACTORING_PLAN_FINAL.md) §2.6 “Dashboard 헤더 배지” 항목과 실제 UI가 일치하는지 한 줄 업데이트(선택).

---

## 7. 작업 순서 요약

1. `getVrDailyExecutionCycleHeaderLabel` 추가·export (`dailyExecutionSummary.ts`).
2. (선택) `formatVrBandBlock` 에서 동일 로직을 위 함수로 치환.
3. `Dashboard.tsx` `PortfolioCard` 에 import + `useMemo` + 헤더 `span`.
4. 수동 체크리스트 실행.

이 순서면 명세의 **`#n: MM/DD ~ MM/DD`** 를 헤더에 넣으면서, 알람용 VR 블록과 **계산·문구 SSOT** 를 유지할 수 있다.
