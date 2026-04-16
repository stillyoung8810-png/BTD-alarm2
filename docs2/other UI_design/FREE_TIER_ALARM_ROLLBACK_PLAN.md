# Free 티어 알림 설정 롤백 — 리팩터링 계획서

**상태:** 구현 반영 완료 (본 문서는 당시 계획·스니펫 기록용)  
**배경:** 토스 미니앱 심사용으로 무료 티어의 알림 설정 진입을 토스트로 막았던 임시 로직을 제거하고, Free 사용자도 알림 설정 모달로 진입할 수 있게 복구한다.  
**근거 문서:** `docs/FREE_TIER_ALARM_TOAST.md`

### `Toast.tsx` 및 문서 언급 (최신 상태)

| 구분 | 상태 |
|------|------|
| **`components/Toast.tsx`** | Free 티어 차단용으로만 쓰이던 파일은 **롤백 시 삭제됨**. 저장소에 파일이 없으며 `import './Toast'` 도 없어야 함. |
| **`docs/FREE_TIER_ALARM_TOAST.md`** | 과거 임시 구현을 설명하는 **역사적 문서**. 상단에 「구현 제거됨·`Toast.tsx` 삭제」 안내를 두는 것을 권장. |
| **`TDS_MIGRATION_PLAN.md` 등** | `Toast` 항목이 남아 있을 수 있음 → **별도 범용 토스트 컴포넌트 계획**과 혼동하지 말 것. 본 롤백으로 제거된 것은 **해당 단일 목적 `components/Toast.tsx`** 뿐. |

---

## 최종 정책 (추가 리뷰·결정 반영)

| 결정 | 내용 |
|------|------|
| **중앙 통합 I18N** | 별도 `dashboardMessages.ts` / `pricingTierMessages.ts` **신규 파일을 만들지 않고**, 루트의 **`constants.tsx`에 정의된 `I18N`** 에 문자열만 추가한다. |
| **웹 종 버튼 `title`** | 모바일·토스 일관성을 위해 **제거**. 마우스 호버 툴팁 없음. |
| **A11y** | 웹 네이티브 `<button>`에는 **`aria-label`만** 유지 (스크린 리더 필수). |

---

## 리뷰에서 식별된 문제점 (1차, Phase 2 스니펫 관련)

계획서 초안의 Phase 2 JSX 스니펫에 대해 아래 이슈가 지적되었으며, 본 문서는 모두 반영한다.

1. **[Critical — Rule 3 / I18N]** JSX 내부에서 `lang === 'ko' ? '…' : '…'` 형태로 한·영 문자열을 직접 하드코딩한 것은 “JSX에 UI 문자열 하드코딩 금지” 규정에 위배된다. 라벨은 반드시 **단일 사전(SSOT)** 에서 주입해야 한다.

2. **[Rule 6 / DRY]** 동일 문자열이 토스 분기와 웹 분기에 중복되면 변경에 취약하다. **`I18N[lang]`의 동일 키**를 토스(`aria-label`)·웹(`aria-label`)이 공유한다.

3. **[Rule 4 / A11y]** 아이콘 전용 버튼에 **`aria-label` 필수**. (후속 정책: **`title`은 부여하지 않음** — 툴팁 없이 `aria-label`만으로 충분.)

---

## 리뷰에서 식별된 문제점 (2차, Phase 2-2 스니펫·문서 품질)

1. **[Rule 6 / DRY · 인지 부하]** `TDSButton`과 웹 `<button>` 자식으로 `{isAlarmEnabled ? <Bell … /> : <BellOff … />}` 가 **동일하게 두 번** 반복되면, 아이콘 변경 시 두 곳을 동기화해야 하고 JSX가 불필요하게 비대해진다. **`return` 직전에 `alarmIcon` 변수로 한 번만 평가**해 두 분기에서 `{alarmIcon}` 으로 재사용한다.

2. **[Rule 9 / 주석]** 계획 스니펫의 `className={/* 기존과 동일 */}` 류는 **What 설명용 플레이스홀더**로, 실제 코드에 그대로 넣으면 규칙 위반 소지가 있다. 문서에서는 **실제 클래스 문자열을 쓰거나 생략**하고, 불필요한 인라인 주석은 넣지 않는다.

---

## 리뷰에서 식별된 문제점 (3차 — 클래스 평탄화·`tiers` 안정화)

1. **[Rule 6 / 인지 부하]** 알람 `TDSButton`·웹 `<button>`의 `className`에 긴 템플릿 리터럴과 `isAlarmEnabled` 삼항이 **JSX 인라인**에 있으면 가독성이 떨어진다. **`return` 직전**(모든 훅 이후)에 `alarmCardBtnBaseClass`, `alarmTossBtnClass`, `alarmWebBtnClass` 등으로 **계산을 평탄화**한다. (`alarmIcon`도 동일 위치 — 훅 순서 규칙 유지.)

2. **[Rule 10 / 렌더 비용]** `Pricing`의 `tiers` 배열을 컴포넌트 본문에서 매 렌더 새 객체로 만들면 GC 부담이 생긴다. 팩토리 + `useMemo`로 참조를 안정화한다. (팩토리 시그니처는 **4차 리뷰**에서 **`buildPricingTiers(t, formatMoney)`** 형태로 정규화 — 카피는 `t`, 금액 서식은 포맷터.)

---

## 리뷰에서 식별된 문제점 (4차 — Tailwind DRY·팩토리 SRP)

1. **[Rule 6 / DRY]** `alarmTossBtnClass`와 `alarmWebBtnClass`에 **동일한 활성 스타일** 문자열(`bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500`)이 두 번 하드코딩되면 디자인 변경 시 이중 수정이 필요하다. **`activeStateClass`(또는 동일 의미의 상수)** 로 한 번만 정의하고 두 클래스 조립식에서 재사용한다.

2. **[Rule 3 / SRP·추상화 누수]** `buildPricingTiers(isKo, t)`는 **`t`가 이미 `lang`에 묶인 번들**인데 `isKo`를 또 넘겨 팩토리 내부에 `isKo ? A : B`가 남는 패턴은 책임이 이중화된다. **목표:** **카피는 전부 `t`의 문자열 키**로만 가져오고, **`isKo`는 팩토리 인자로 넣지 않는다.** **금액 표시(콤마·통화 서식)** 는 `I18N`이 아니라 **별도 숫자·통화 포맷터**에만 맡긴다 — 번역 사전은 **글자(문자열)만** 유지한다. 팩토리 시그니처는 **`buildPricingTiers(t, formatMoney)`** 처럼 **`t` + 포맷터 콜백**이 될 수 있으나, **`formatMoney`는 `I18N`에 속하지 않는다.**

**구현 갭 (계획 vs 저장소):** FREE 플랜 한 줄만 `I18N`으로 옮긴 상태에서는 PRO/PREMIUM 등 **다수 카피가 여전히 `isKo` 분기**일 수 있다. **`buildPricingTiers(t, formatMoney)` 목표에 맞추려면** 나머지 카피를 **`I18N` 문자열로 이전**하고, **금액 표시는 포맷터로만** 통일하는 **후속 작업**이 필요하다. 본 문서는 **목표 형태**를 기록한다.

---

## 리뷰에서 식별된 문제점 (6차 — Nitpicks / 스니펫 최종 마감)

롤백 계획 본문의 논리·성능 방향에는 **치명적 결함 없음**. 다만 프로덕션에 옮기기 전, 아래 **미세 안티패턴**을 계획서 스니펫에서 교정한다.

1. **[Rule 2 / React]** **`React.FC` 지양** — React 18+ 권장 흐름에 맞춰 **명시적 props 타입 + 일반 함수 컴포넌트**(`function Pricing(props: PricingProps)` 또는 `const Pricing = (props: PricingProps) => …` 후 분해)를 쓴다. `React.FC`는 암묵적 `children` 등 레거시 이슈로 **새 코드에서는 사용하지 않는다.**

2. **[Rule 7 / TypeScript]** **`(typeof I18N)['ko']` 단독 기준**은 `en`에 키가 빠져도 잡히지 않을 수 있다. **`type AppLang = keyof typeof I18N`** 과 **`type AppI18nStrings = (typeof I18N)[AppLang]`** 로 언어 분기 전체를 반영한다. **한 걸 더 엄격히** 하려면 `interface I18nDictionary { … }` 를 두고 `I18N`에 `satisfies Record<AppLang, I18nDictionary>`(또는 동등 패턴)를 적용해 **ko/en 키 대칭을 컴파일 타임에 강제**한다.

3. **[Rule 6 / 클린 코드]** 알람 버튼 클래스를 **템플릿 리터럴**로 이을 때 `isAlarmEnabled`가 false면 **`''` 때문에 class 문자열 끝에 후행 공백**이 생길 수 있다. **`[…].filter(Boolean).join(' ')`** (또는 최종 `.trim()`)으로 **불필요한 공백을 원천 차단**한다.

---

## 구현 시 필수: `I18N` 스키마 주의 (가상 `GLOBAL_I18N` 스니펫과의 차이)

리뷰 예시에는 `globalCopy.dashboard.alarmSettingsLabel` 형태가 등장하나, **본 저장소의 `I18N.ko` / `I18N.en`에는 이미 `dashboard`가 문자열**(`"대시보드"` / `"Dashboard"`, 탭 라벨)로 존재한다.

따라서 **`dashboard`를 객체로 덮어쓰는 중첩 구조는 사용할 수 없다.** (타입 충돌·기존 참조 전부 깨짐.)

**대응:** 요금제·알람 라벨은 **`I18N`의 플랫(flat) 키**로 추가한다. 의미는 리뷰의 `pricing.freeFeatureCoreAlerts` / 알람 라벨과 동일하다.

| 의도 (리뷰 네이밍) | 확정 `I18N` 키 (플랫, 팀 컨벤션) |
|--------------------|-----------------------------------|
| `pricing.freeFeatureCoreAlerts` | **`membershipFreeCoreAlerts`** (멤버십/요금제 카드 FREE 줄) |
| `dashboard.alarmSettingsLabel` | **`alarmSettingsLabel`** (포트폴리오 카드 종 버튼 `aria-label`) |

**영문 카피 (확정):** `Alarm settings` / `Core alerts & trading history` (계획안 그대로).

### 번역 사전(`I18N`)과 숫자·통화 포맷터의 책임 분리

| 레이어 | 역할 | 금지 사항 |
|--------|------|-----------|
| **`I18N` (번역 사전)** | **문자열(카피)만** 보관 — 라벨, 문장, 고정 토큰(예: `₩`, `$`가 문화권별로 **문자로만** 구분돼야 할 때의 기호 문자 등은 팀 규칙에 따름). | 천 단위 콤마 삽입, `toLocaleString` 결과를 사전에 박아 넣기, 금액 숫자 파싱·반올림 로직. |
| **숫자·통화 전문 도구 (포맷터)** | 원 단위 숫자(`rawAmount` 등) + 로케일/`lang`을 받아 **표시용 문자열** 생성 — 콤마, 소수 자릿수, 통화 기호 위치 등. (예: 기존 `utils/currency`의 `formatPriceKRW`, 또는 동일 SRP를 가진 모듈.) | UI 카피 문장 전체를 포맷터가 만들지 않음 — 문장 틀은 `I18N`, 숫자 끼워 넣기만 포맷터. |

**조립 패턴 (요금제 카드 등):** `price` 필드는 `formatXxx(amount, lang)` 결과와 `t.pricingProPriceNote` 같은 **순수 문자열 접미**를 JSX/팩토리에서 이어붙이거나, 템플릿 문자열은 `I18N`에 `'{amount} / 월'` 형태로 두고 `{amount}` 자리만 포맷터 출력으로 치환한다. **콤마가 찍인 긴 금액 문자열을 `I18N`에 저장하지 않는다.**

---

## Phase 1: Component Deletion (`Toast.tsx`)

**목표 (롤백 시 수행):** `components/Toast.tsx` **파일 전체 삭제**.

**사유:** Free 티어 알림 진입 차단 전용 인앱 토스트만을 위해 존재했으며, 롤백 후 다른 모듈에서 참조하면 안 된다.

**현재 코드베이스:** 위 삭제는 **이미 적용됨**. 확인용으로 저장소에서 `from './Toast'` / `components/Toast` 를 검색해 참조 0건인지 본다.

**문서 (선택):** `docs/FREE_TIER_ALARM_TOAST.md`는 설계 흔적으로 남을 수 있으므로, 상단에 **「`Toast.tsx` 제거·동작 롤백 완료」** 한 줄을 두면 혼선이 줄어든다.

---

## Phase 2: `constants.tsx` + `Dashboard.tsx` Refactoring

### 2-0. 전역 `I18N`에 키 추가 (**신규 파일 없음**)

**대상 파일:** 프로젝트 루트의 `constants.tsx` (기존 `export const I18N = { ko: { ... }, en: { ... } }`).

`I18N.ko` 객체 안(다른 키들과 동일한 들여쓰기)에 예시:

```ts
// I18N.ko 내부에 추가
alarmSettingsLabel: '알람 설정',
membershipFreeCoreAlerts: '기본 알람 · 기록 기능',
```

`I18N.en` 객체 안에 대응 항목:

```ts
// I18N.en 내부에 추가
alarmSettingsLabel: 'Alarm settings',
membershipFreeCoreAlerts: 'Core alerts & trading history',
```

- **`import` 경로:** 기존과 동일하게 `Dashboard.tsx`는 이미 `import { I18N, ... } from '../constants';` 패턴을 사용한다. **`constants/messages.ts`는 존재하지 않으므로 만들지 않는다.**

---

### 2-1. 제거할 항목 (Before — 삭제 대상)

**Import:**

```ts
import Toast from './Toast';
```

**`PortfolioCard` 내부 — 상태 및 콜백 (대략 312~332행 부근):**

```ts
const [freeAlarmToastSeq, setFreeAlarmToastSeq] = useState(0);

const openFreeAlarmToast = useCallback(() => {
  setFreeAlarmToastSeq((prev) => prev + 1);
}, []);

const handleAlarmButtonClick = useCallback(() => {
  if (currentTier === 'free') {
    openFreeAlarmToast();
    return;
  }
  onOpenAlarm();
}, [currentTier, onOpenAlarm, openFreeAlarmToast]);

const handleAlarmButtonClickWeb = useCallback(
  (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    handleAlarmButtonClick();
  },
  [handleAlarmButtonClick]
);
```

**`PortfolioCard` JSX 하단 — 조건부 토스트 (대략 832~841행 부근):**

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

**참고:** 위 블록 제거 후 `PortfolioCard`에서 `currentTier`가 알림 버튼 분기에만 쓰였다면, 상위에서 넘기는 props 설계를 검토할 수 있다. 다만 카드 내 다른 UI/로직에서 `currentTier`를 쓰면 **props는 유지**한다.

---

### 2-2. 추가·교체할 항목 (After) — **최종 스니펫 (3·4·6차 리뷰 반영)**

`PortfolioCard`에는 이미 `const t = I18N[lang];`가 있다. **`t.alarmSettingsLabel`** 로 라벨을 주입한다.

**웹 클릭 전파 차단용 핸들러:** (훅 섹션 상단에 유지)

```ts
const handleOpenAlarmWeb = useCallback(
  (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onOpenAlarm();
  },
  [onOpenAlarm],
);
```

**`return` 직전 (모든 훅 이후):** `alarmIcon`, 공통·토스·웹 클래스 문자열을 한곳에서 계산한다. **활성(알람 켜짐) 시 공통 Tailwind 조각은 `activeStateClass` 한 번만 정의**한다 (4차 DRY).

```tsx
const alarmIcon = isAlarmEnabled ? (
  <Bell size={16} fill="currentColor" />
) : (
  <BellOff size={16} />
);

const baseBtnClass = 'w-9 h-9 rounded-lg flex items-center justify-center';
const activeStateClass = 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-500';

const alarmTossBtnClass = [baseBtnClass, 'min-w-0 p-0', isAlarmEnabled && activeStateClass]
  .filter(Boolean)
  .join(' ');

const alarmWebBtnClass = [
  baseBtnClass,
  'transition-all duration-300',
  isAlarmEnabled
    ? `${activeStateClass} border border-amber-200 dark:border-amber-500/30`
    : 'bg-transparent text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
]
  .filter(Boolean)
  .join(' ');
```

동일 파일에 다른 “기본 버튼” 클래스와 이름이 겹치면 `alarmBaseBtnClass` / `alarmActiveStateClass` 처럼 **`alarm` 접두**를 붙인다.

**종 버튼 JSX:** `useTossApp()`의 **`isInTossApp`** 으로 분기. **`title` 없음.**

```tsx
{isInTossApp ? (
  <TDSButton
    variant="tertiary"
    size="small"
    onClick={onOpenAlarm}
    className={alarmTossBtnClass}
    aria-label={t.alarmSettingsLabel}
  >
    {alarmIcon}
  </TDSButton>
) : (
  <button
    type="button"
    onClick={handleOpenAlarmWeb}
    className={alarmWebBtnClass}
    aria-label={t.alarmSettingsLabel}
  >
    {alarmIcon}
  </button>
)}
```

- **I18N:** JSX에 한·영 리터럴 없음; 전역 `I18N`만 수정.  
- **DRY:** `t.alarmSettingsLabel` 공유 + **`alarmIcon` 단일 정의** + **클래스 문자열도 JSX 밖에서 조립** + **활성 amber 토큰은 `activeStateClass` 단일 출처**.  
- **클래스 문자열:** **`filter(Boolean).join(' ')`** 로 **비활성 시 후행 공백(Trailing Whitespace)** 이 생기지 않게 한다 (6차).  
- **A11y:** 웹에서 `aria-label`만 유지, `title` 미사용.  
- **인라인 핸들러:** 종 버튼 `onClick`은 `onOpenAlarm` 또는 `handleOpenAlarmWeb` 참조만 사용.  
- **훅 순서:** `alarmIcon` / 클래스 변수는 **모든 `useEffect` 등 훅 다음**, `return` 바로 위에 둔다.

**Toss 가이드라인:** 본 단계는 **기존 `TDSButton` / 라우팅 없이 콜백만 복구**하는 수준이며, `sendMessage`·`loginMe` 등 **공식 문서에 없는 Toss SDK 시그니처는 도입하지 않는다.**

**타입:** `React.MouseEvent<HTMLButtonElement>` 유지, `any` / non-null assertion 없음.

---

## Phase 3: `Pricing.tsx` & 전역 I18n

**요구사항:** FREE 티어 기능 문구에서 “준비 중”을 제거하고, **하드코딩·`isKo ? …` 분기 없이** `I18N`에서 읽는다.

**신규 파일 없음:** Phase 2-0에서 추가한 **`membershipFreeCoreAlerts`** 키를 그대로 사용한다.

**가격 표기:** 위 「번역 사전과 숫자·통화 포맷터의 책임 분리」를 따른다 — `formatPriceKRW` 등 **기존 통화 유틸**이 그 역할을 맡고, `I18N`에는 `/ 월 (예정)` 같은 **순수 접미·라벨 문자열만** 둔다.

### 3-1. `Pricing.tsx` 적용 (Before → After)

**Before (하드코딩):**

```ts
{ text: isKo ? '기본 알림 (준비 중이에요)' : 'Core notifications (coming soon)' },
```

**After — 원칙 요약**

- 팩토리 **`buildPricingTiers(t, formatMoney)`** 는 컴포넌트 **밖**에 둔다.  
- **`t`:** 순수 카피(문자열만). **`formatMoney`:** 원 단위 숫자 → 표시 문자열(콤마·통화). 팩토리 **내부에 `isKo` 인자·분기 없음.**  
- **`formatMoney`:** `useCallback(..., [lang])`. **`tiers`:** `useMemo(() => buildPricingTiers(t, formatMoney), [t, formatMoney])`.  
- **금액 원본**은 **`MembershipConfig.PRO.rawAmount`** 등 **SSOT**에서만 참조한다 — **리터럴 `29000` 등 매직 넘버 금지.**

---

### 3-2. 확정 스니펫 (`Pricing.tsx` — Cursor 구현·최종 확인용, **6차 마감**)

아래는 위 원칙을 **한 파일 흐름으로 묶은 확정 예시**다. 실제 적용 시 **나머지 `features`·카드 UI**는 기존 `Pricing.tsx`와 맞춘다. **`constants.tsx`의 `I18N`** 에 스니펫이 참조하는 키가 없으면 추가한다. **`React.FC` 미사용**, **`AppI18nStrings`는 `keyof typeof I18N` 기반**(6차).

```ts
import { useMemo, useCallback } from 'react';
import { I18N } from '../constants';
import { MembershipConfig } from '../constants/membership';
import { formatPriceKRW } from '../utils/currency';

type AppLang = keyof typeof I18N;
type AppI18nStrings = (typeof I18N)[AppLang];

function buildPricingTiers(
  t: AppI18nStrings,
  formatMoney: (rawAmount: number) => string,
) {
  return [
    {
      id: 'free',
      price: t.pricingFreePriceLabel,
      priceNote: t.pricingFreePriceNote,
      features: [{ text: t.membershipFreeCoreAlerts }],
    },
    {
      id: 'pro',
      price: formatMoney(MembershipConfig.PRO.rawAmount),
      priceNote: t.pricingProPriceNote,
      features: [],
    },
    {
      id: 'premium',
      price: formatMoney(MembershipConfig.PREMIUM.rawAmount),
      priceNote: t.pricingPremiumPriceNote,
      features: [],
    },
  ];
}

const Pricing = ({ lang, currentTier, onUpgrade }: PricingProps) => {
  const t = I18N[lang];

  const formatMoney = useCallback(
    (rawAmount: number) => {
      if (lang === 'ko') {
        return formatPriceKRW(rawAmount);
      }
      return formatPriceUSDForDisplay(rawAmount);
    },
    [lang],
  );

  const tiers = useMemo(() => buildPricingTiers(t, formatMoney), [t, formatMoney]);

  return (
    <div>
      {tiers.map((tier) => (
        <div key={tier.id}>
          {/* currentTier, onUpgrade 등은 실제 카드 UI에서 반드시 사용 — Dead code 방지 */}
        </div>
      ))}
    </div>
  );
};

export default Pricing;
```

- **`formatPriceUSDForDisplay`:** 스니펫상 placeholder다. 저장소에 없으면 **`utils/currency`에 영문 달러 표기 전용 함수**를 두거나, 팀 규칙에 맞는 단일 헬퍼로 대체한다. **달러 서식도 `I18N`이 아니라 포맷터 책임.**  
- 리뷰 예시에 있던 **`formatMoney(29000)` 는 계획서에서 채택하지 않음** — 반드시 **`MembershipConfig.*.rawAmount`** (또는 동일 SSOT).  
- `features: []` 는 자리 표시이며, 완성 시 **각 줄 `t.someKey`** 로 채운다.  
- **`PricingProps`:** 스니펫 위에 기존과 동일하게 `interface PricingProps { … }` 선언을 둔다.  
- **타입 완전성:** `ko`/`en` 키 대칭을 **강제**하려면 별도 **`I18nDictionary` + `satisfies`** 를 `constants.tsx`에 도입하는 것을 권장한다 (6차).

**범위·갭:** 단기 롤백으로 FREE 한 줄만 `I18N`에 올린 상태에서는 위 시그니처를 **완전히 만족하려면** PRO/PREMIUM 등 나머지 카피·`I18N` 키·포맷터 정리가 **추가 범위**다. (위 「4차 — 구현 갭」 참고.)

---

## Phase 4: Simulation Checklist

| 항목 | 확인 |
|------|------|
| **DRY** | Free 티어 알림 차단 로직이 `Dashboard` 한 경로(`onOpenAlarm`)로만 수렴하는지, 토스트/시퀀스 상태가 완전히 제거되었는지 |
| **DRY (라벨)** | 알람 버튼 토스/웹 모두 **`t.alarmSettingsLabel`** 만 사용하는지 (하드코딩·중복 없음) |
| **DRY (아이콘)** | Bell/BellOff가 **`alarmIcon` 한 곳**에서만 정의되고 두 버튼은 `{alarmIcon}` 만 쓰는지 |
| **평탄화 (Dashboard)** | 알람 버튼 `className`이 **`alarmTossBtnClass` / `alarmWebBtnClass`** 처럼 `return` 이전 변수로만 조립되는지 (JSX 인라인 장문 템플릿 최소화) |
| **DRY (Tailwind)** | 활성 알람 스타일 조각이 **`activeStateClass` 등 단일 상수**에서만 정의되는지 (토스/웹 이중 하드코딩 없음) |
| **클래스 문자열 (6차)** | 알람 버튼 `className` 조립이 **`[…].filter(Boolean).join(' ')`** 등으로 **후행 공백 없이** 끝나는지 |
| **React (6차)** | **`React.FC` 미사용**; 컴포넌트는 **명시적 `PricingProps`** 로 타이핑했는지 |
| **TypeScript (6차)** | `AppI18nStrings`가 **`(typeof I18N)[keyof typeof I18N]`** 패턴인지; 필요 시 **`I18nDictionary` + `satisfies`** 로 ko/en 키 대칭 검증을 강화했는지 |
| **Rule 10 (Pricing)** | `tiers`가 **`useMemo(() => buildPricingTiers(t, formatMoney), [t, formatMoney])`** 처럼 캐시되는지 (**목표**; 과도기 시그니처는 다를 수 있음) |
| **SRP / I18N (Pricing)** | 카피는 **`t`만**; **`isKo ?` 이중 채널**이 팩토리에 남지 않았는지. **금액 표시**는 **`formatMoney` 등 포맷터**만 담당하고 **`I18N`에 콤마·서식된 숫자 문자열을 넣지 않았는지** |
| **SRP** | `Toast.tsx` 삭제로 “차단용 토스트” 책임 제거; 요금제 해당 줄은 **`t.membershipFreeCoreAlerts`** 단일 출처 |
| **I18N** | `PortfolioCard`·해당 `Pricing` 줄에 JSX 하드코딩된 한·영 문자열이 없는지 |
| **A11y** | 웹 종 버튼에 **`aria-label`** 이 `I18N` 값으로 채워지는지; **`title` 미부여** (정책 준수) |
| **Toss 가이드라인** | 새 Toss SDK 호출/가상 API를 추가하지 않았는지; `TDSButton`은 기존과 동일하게 `onClick`에 콜백만 연결하는지 |
| **Dead code** | `Toast` import, `freeAlarmToastSeq`, `openFreeAlarmToast`, 기존 `handleAlarmButtonClick` 계열 제거 후 미사용 import/변수 없음 |
| **TypeScript** | `handleOpenAlarmWeb`의 이벤트 타입이 `React.MouseEvent<HTMLButtonElement>`로 명시되는지; `any` / `!` 미사용 |
| **`I18N` 스키마** | `dashboard` 키를 객체로 바꾸지 않았는지 (기존 탭 라벨 유지) |
| **동작 시뮬레이션** | Free 티어에서 종 아이콘 클릭 시 **즉시** `onOpenAlarm()` → 상위 알림 모달 플로우로 진입하는지; 웹에서 `stopPropagation` 유지 |

---

## 부록: 대상 파일 요약

| 파일 | 조치 |
|------|------|
| `components/Toast.tsx` | **삭제 완료** (재도입 시 별도 목적·명명으로 새로 작성) |
| `constants.tsx` | `I18N.ko` / `I18N.en`에 `alarmSettingsLabel`, `membershipFreeCoreAlerts` 플랫 키 추가 |
| `components/Dashboard.tsx` | 위 + **`activeStateClass`**; **`alarmTossBtnClass` / `alarmWebBtnClass`** 는 **`filter(Boolean).join(' ')`** (후행 공백 방지, 6차); **`alarmIcon`·클래스는 모든 훅 이후·`return` 직전** |
| `components/Pricing.tsx` | **목표:** §3-2 확정 스니펫 — **`React.FC` 금지**; **`AppLang` / `AppI18nStrings`**; `buildPricingTiers(t, formatMoney)` + **`useMemo`/`useCallback`**; **`export default`**; props **Dead code 없이** 카드 UI에 사용. (**과도기:** 4차 갭 참고) |
| `App.tsx` | `Dashboard`에 넘기던 `currentTier` prop 제거 |
| `docs/FREE_TIER_ALARM_TOAST.md` | 선택적 갱신/아카이브 |

**생성하지 않을 파일:** `constants/messages.ts`, `constants/dashboardMessages.ts`, `constants/pricingTierMessages.ts` (본 최종 계획에서는 사용하지 않음).

---

## 결정 사항 (회신 반영)

- **영문 카피:** 제안 문구 그대로 적용 (`Alarm settings`, `Core alerts & trading history`).
- **플랫 키:** 기존 `I18N` 키 스타일(`aiScan`, `closePortfolioDetailsBackdrop` 등 camelCase·도메인 접두)에 맞춰 **`alarmSettingsLabel`**, **`membershipFreeCoreAlerts`** 로 확정.
- **4차 계획 (문서 목표):** 알람 버튼 Tailwind **활성 조각 단일화** (`activeStateClass`); 요금제 팩토리에서 **카피는 `t`만**, **`isKo` 미전달**; **`useMemo`로 tiers 안정화**.  
- **번역 vs 포맷터:** **`I18N`은 순수 문자열(카피)만** — **콤마·통화 표시는 숫자·통화 전문 포맷터**(예: `utils/currency`)에만 맡긴다.
- **Phase 3-2 확정 스니펫:** `Pricing.tsx`에 위 규칙을 적용할 때 **Cursor가 혼동하지 않도록** `buildPricingTiers` + `useCallback(formatMoney)` + `useMemo(tiers)` 흐름을 **문서상 단일 확정 예시**로 둔다. 금액은 **SSOT(`MembershipConfig`)** 만 사용하고 **매직 넘버 금액 리터럴은 쓰지 않는다.**  
- **6차 마감:** **`React.FC` 제거**; **`type AppI18nStrings = (typeof I18N)[keyof typeof I18N]`**; 알람 버튼 클래스는 **`[…].filter(Boolean).join(' ')`** 로 후행 공백 방지; ko/en 키 **완전 대칭**이 필요하면 **`I18nDictionary` + `satisfies`** 검토.
