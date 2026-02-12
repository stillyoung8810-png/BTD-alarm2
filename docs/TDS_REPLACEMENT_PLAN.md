# TDS 컴포넌트 단계적 치환 계획 (유지보수성·클린코드 중심)

> 목적: 주요 화면을 `@toss/tds-mobile` 기반으로 치환하고, DRY·Dead Code·인지 복잡도·안티패턴을 정리한다.

---

## 0. 사전 정리 (중요도: 최상)

### 0.1 공통 레이어 구축 — DRY 및 일관성

**현상:**  
여러 컴포넌트에서 `className` 기반 버튼/모달/폼 스타일이 반복되고, 토스 환경 여부에 따라 분기만 있는 상태.

**계획:**

1. **TDS 래퍼/훅 한곳에 모으기**
   - `src/components/tds/` (또는 `src/tds/`) 생성.
   - **`TDSButton.tsx`**: `useTossApp()` + `@toss/tds-mobile`의 `Button` | 웹용 `button` 래퍼.
   - **`TDSModal.tsx`** (또는 BottomSheet): TDS `Modal` / `BottomSheet` + 웹용 기존 모달 스타일 래퍼.
   - **`TDSTextField.tsx`**: TDS `TextField` + 웹용 `input` 스타일 래퍼.
   - **`useTDSComponent.ts`**: `isInTossApp`일 때만 TDS 컴포넌트를 반환하는 훅으로, 조건부 렌더링을 한 곳에서 처리.

2. **스타일 상수/유틸 통합**
   - `tossStyleHelpers.ts`, `tossTypography.ts`, `tossColors.ts`는 유지하되, **TDS 컴포넌트 사용 시** 이쪽 대신 TDS 테마/토큰을 우선 사용하도록 규칙을 둠.
   - 반복되는 `rounded-2xl`, `py-3`, `font-black` 등은 **공통 버튼/카드 스타일 상수**로 빼기 (예: `components/ui/constants.ts` 또는 기존 `constants.tsx`에 스타일 객체 추가).

**체크:**

- [ ] DRY: 버튼/모달/인풋 스타일이 **한 곳(래퍼 또는 상수)** 에만 정의되는지.
- [ ] Dead Code: TDS 래퍼 도입 후, 기존 `getConditionalTypographyStyle` 등 **미사용 헬퍼** 제거 여부 검토.

---

### 0.2 Dead Code & Unused Props 정리

**대상 파일·패턴:**

| 위치 | 내용 | 조치 |
|------|------|------|
| `App.tsx` | `authModalRef`, `unhandledRejectionHandlerRef` 등 ref 다수 | 실제 사용처가 없으면 제거. |
| `App.tsx` | `TierIcon`, `tierIconClassName` 등 — Nav/헤더에만 쓰이면 유지, 그 외 중복 정의 제거 | tier 표시 로직을 `useTierDisplay(tier)` 같은 훅으로 추출해 한 곳에서만 사용. |
| 각 모달/화면 | `lang` 을 받지만 일부 자식만 사용 | 필요한 최소 컴포넌트에만 전달하거나, Context(`LangContext`)로 내려서 불필요한 props drilling 제거. |
| `AuthModals.tsx` | `buildRedirectUrl` 등 내부 헬퍼 | 사용처가 한 곳이면 인라인 또는 `utils/authHelpers.ts`로 분리해 재사용성·가독성 확보. |

**규칙:**

- **Unused props**: ESLint `react/no-unused-prop-types` 또는 타입에서 `Omit`/필수만 노출해 불필요한 props 제거.
- **Unused import**: 치환 과정에서 `lucide-react` 등 사용하지 않는 아이콘 import 삭제.

**체크:**

- [ ] 선언만 되고 사용되지 않는 변수/함수/import 제거.
- [ ] Props 인터페이스에서 실제로 쓰이지 않는 필드 제거 또는 optional + 문서화.

---

### 0.3 Cognitive Complexity & 분기 단순화

**대상:**

- `App.tsx`: `activeTab` 분기 + 수많은 모달 조건 렌더링 → 한 파일 내 복잡도가 높음.
- `AuthModals.tsx`: `type === 'login' | 'signup' | 'profile' | ...` 에 따른 긴 if-else/switch.

**계획:**

1. **라우팅/탭 구조 단순화**
   - `activeTab` → 화면 컴포넌트 매핑을 **객체 또는 Map**으로 한 곳에 정의.
   - 예: `const TAB_CONTENT: Record<ActiveTab, React.ReactNode> = { dashboard: <Dashboard ... />, ... };` + `TAB_CONTENT[activeTab]` 렌더.  
   → 조건문 수 감소.

2. **AuthModals 서브뷰 분리**
   - `type`별로 **별도 컴포넌트** 분리: `LoginView`, `SignupView`, `ProfileView`, `ResetPasswordView`, `ChangePasswordView`.
   - `AuthModals`는 `type`에 따라 해당 뷰만 렌더.  
   → 각 파일 내 if-else 깊이 감소, 단일 책임.

3. **모달 표시 로직**
   - `alarmTargetId`, `detailsTargetId`, `checkoutPlan` 등 **모달 상태가 많음** → `useModalState()` 같은 훅으로 `{ open, id, openModal(id), closeModal }` 형태로 통일하거나, 모달별로 작은 훅으로 나누어 `App.tsx`의 JSX 블록을 줄임.

**체크:**

- [ ] 한 함수/컴포넌트 내 if-else 중첩 3단계 이하로 유지.
- [ ] 조건이 많은 렌더링은 “설정 객체 + 단일 렌더” 패턴으로 치환 검토.

---

### 0.4 Anti-pattern 점검

| 항목 | 현재 가능성 | 조치 |
|------|-------------|------|
| **index as key** | 리스트에서 `key={index}` 사용 여부 | `key={item.id}` 또는 안정된 고유 ID 사용. |
| **setState in render** | 없을 것으로 예상 | 혹시 있다면 `useEffect` 또는 이벤트 핸들러로 이동. |
| **useEffect 의존성 누락** | `fetchPortfolios`, `fetchUserProfile` 등 | 의존성 배열 정확히 명시, 필요 시 `useCallback`으로 참조 안정화. |
| **Prop drilling** | `lang`, `onClose` 등 깊은 전달 | 자주 쓰는 것은 `LangContext`, `ModalContext` 등으로 대체 검토. |
| **require('@toss/tds-mobile')** | `AlarmModal.tsx`, `StrategyCreator.tsx` | TDS 래퍼로 이전 후, **동적 import** 또는 루트 Provider만 사용하고 하위에서는 래퍼만 import 하도록 통일. |

**체크:**

- [ ] React 권장 패턴만 사용 (불필요한 ref, 동기 require 제거).
- [ ] TDS는 Provider + 래퍼 컴포넌트 패턴으로만 접근.

---

## 1. Phase 1 — 공통 UI 레이어 (버튼·모달·폼)

**목표:**  
모든 화면에서 재사용할 **버튼·모달(또는 바텀시트)·폼 요소**를 TDS 기반으로 통일.

### 1.1 TDS 버튼 통일

- **추가:** `components/tds/TDSButton.tsx`
  - `isInTossApp` → `@toss/tds-mobile` `Button` 사용 (variant: primary / secondary / tertiary 등).
  - 웹 → 기존 Tailwind 스타일과 시각적으로 유사한 `button` (또는 이미 있던 공통 버튼 클래스).
- **치환 대상 (우선순위):**
  1. `Landing.tsx`: "무료로 시작하기", "이미 계정이 있으신가요? 로그인"
  2. `TossLoginView.tsx`: "Toss로 계속하기"
  3. `Footer.tsx`: "토스 미니앱 고객센터", 이용약관/개인정보/환불규정
  4. `AuthModals.tsx`: 로그인/회원가입/비밀번호 변경 등 모든 CTA 버튼
  5. `Pricing.tsx`: 업그레이드/플랜 선택 버튼
  6. `CheckoutModal.tsx`: 결제하기, 취소

**개선 제안 (DRY):**

```tsx
// components/tds/TDSButton.tsx (예시)
import { useTossApp } from '../../contexts/TossAppContext';
import { Button as TDSButton } from '@toss/tds-mobile';

type Variant = 'primary' | 'secondary' | 'tertiary';

export const TDSButton: React.FC<{
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}> = ({ variant = 'primary', disabled, loading, children, onClick, className }) => {
  const { isInTossApp } = useTossApp();
  if (isInTossApp) {
    return (
      <TDSButton variant={variant} disabled={disabled || loading} onClick={onClick}>
        {loading ? '...' : children}
      </TDSButton>
    );
  }
  const baseClass = 'py-3 rounded-2xl font-bold transition-all';
  const variantClass = variant === 'primary' ? 'bg-[#3182F6] text-white' : 'border border-slate-300 text-slate-700';
  return (
    <button type="button" className={`${baseClass} ${variantClass} ${className ?? ''}`} onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  );
};
```

- 실제 TDS `Button` API(variant 이름 등)는 패키지 문서에 맞게 조정.

### 1.2 TDS 모달/바텀시트 통일

- **추가:** `components/tds/TDSModal.tsx` (또는 `TDSBottomSheet.tsx`)
  - 토스: `BottomSheet` 또는 `Modal` 사용.
  - 웹: 기존 `fixed inset-0 z-[150] ... backdrop-blur-sm` 패턴을 한 컴포넌트로 모음.
- **치환 대상:**
  - `AuthModals.tsx` 컨테이너
  - `CheckoutModal.tsx` 전체 껍데기
  - `AlarmModal.tsx`, `PortfolioDetailsModal.tsx`, `SettlementModals.tsx` (TerminationInput, Result) 등 **모든 모달의 외곽 레이아웃**.

**개선 제안:**

- 모달 **헤더(타이틀 + 닫기)** 를 공통 컴포넌트로 추출 (예: `TDSModal.Header`).
- 모달 **푸터(확인/취소 버튼)** 를 `TDSButton` + 레이아웃으로 공통화.
- 각 모달은 **내용(Content)** 만 담당하도록 해서 중복 마크업 제거 (DRY).

### 1.3 TDS 폼 요소 (TextField 등)

- **추가:** `components/tds/TDSTextField.tsx`
  - 토스: `TextField` 사용.
  - 웹: 기존 `input` + Tailwind (라벨, 에러 메시지 위치 통일).
- **치환 대상:**
  - `AuthModals.tsx`: 이메일, 비밀번호, 새 비밀번호, 확인 비밀번호
  - `SettlementModals.tsx`: 숫자 입력 필드
  - `CheckoutModal.tsx`: 결제 수단 선택 외 텍스트 입력이 있다면 해당 필드

**체크:**

- [ ] 모든 “버튼”은 TDS 래퍼 또는 공통 스타일 상수를 통해서만 스타일 적용.
- [ ] 모든 “모달”은 TDS 모달/바텀시트 래퍼 또는 공통 모달 레이아웃 컴포넌트 사용.
- [ ] 폼 입력은 TDS TextField 래퍼 또는 공통 Input 컴포넌트 사용.

---

## 2. Phase 2 — 메인 화면 (Dashboard)

**목표:**  
메인 탭인 Dashboard를 TDS List·카드·버튼으로 정리.

### 2.1 구조

- 상단: 총 평가금액·변동 — **TDS Typography/색상** 또는 이미 있는 `tossTypography`/`tossColors`와 정렬.
- 포트폴리오 카드 리스트: `@toss/tds-mobile`의 **List / ListRow** 로 치환 (토스 환경일 때).
- 카드 내 버튼(알람, 상세, 퀵입력 등): `TDSButton` (tertiary 또는 icon 스타일).
- FAB 또는 “+” 버튼: TDS 권장 패턴이 있으면 사용, 없으면 기존 유지하되 스타일만 TDS 색/타이포와 맞춤.

### 2.2 DRY·품질

- **Dashboard 내 반복:**  
  포트폴리오 카드 하나를 `PortfolioCard.tsx`로 분리하고, 카드 내 액션(알람, 상세, 퀵입력 등)은 **같은 인터페이스**로 받아서 한 컴포넌트에서만 버튼 구성을 하도록 함.
- **Dead Code:**  
  `onDailyExecutionSummaryChange` 등 사용처가 명확한지 확인하고, 미사용 콜백/상태 제거.

**체크:**

- [ ] 메인 화면이 토스 앱에서 List/ListRow + TDS 버튼으로 일관되게 보이는지.
- [ ] 카드/리스트 아이템 렌더링 로직이 한 곳에만 있는지 (DRY).

---

## 3. Phase 3 — 로그인/온보딩 (Landing + AuthModals + TossLoginView)

**목표:**  
Landing·로그인·회원가입·프로필을 TDS로 통일하고, 인지 복잡도 감소.

### 3.1 Landing

- 히어로 영역: 제목/부제는 TDS Typography 토큰 또는 `tossTypography`와 동일한 스타일로 맞춤.
- CTA: `TDSButton` 2개 (primary: 무료로 시작하기, secondary: 로그인).
- 피처 pills: 리스트는 TDS `List` 또는 동일한 스타일 상수로 정리.

### 3.2 AuthModals / TossLoginView

- **뷰 분리:**  
  `LoginView`, `SignupView`, `ProfileView`, `ResetPasswordView`, `ChangePasswordView` 로 파일/컴포넌트 분리.  
  `AuthModals`는 `type`에 따라 위 컴포넌트 중 하나만 렌더.
- **폼:**  
  이메일/비밀번호 등 모든 입력은 `TDSTextField`.
- **버튼:**  
  제출/취소/로그아웃 등은 `TDSButton`.
- **컨테이너:**  
  모달 껍데기는 `TDSModal`(또는 TDS BottomSheet).

**개선 제안 (인지 복잡도):**

```tsx
// AuthModals.tsx 단순화 예시
const AUTH_VIEW_MAP = {
  login: LoginView,
  signup: SignupView,
  profile: ProfileView,
  'reset-password': ResetPasswordView,
  'change-password': ChangePasswordView,
} as const;

// 렌더: const View = AUTH_VIEW_MAP[type]; return <View ... />;
```

- 토스 전용 로그인은 `TossLoginView`를 그대로 두되, 내부 버튼만 `TDSButton`으로 교체.

**체크:**

- [ ] 로그인/온보딩/프로필 화면이 TDS 버튼·텍스트필드·모달로 통일되었는지.
- [ ] AuthModals 내부가 type별 서브뷰로 나뉘어 if-else가 짧아졌는지.

---

## 4. Phase 4 — 결제/구독 (Pricing + CheckoutModal)

**목표:**  
구독 플랜 선택과 결제 모달을 TDS로 통일.

### 4.1 Pricing

- 플랜 카드: TDS `List` / `ListRow` 또는 카드 스타일을 TDS 색·타이포와 맞춤.
- “업그레이드” 등 CTA: `TDSButton`.
- 토스 환경에서는 가능하면 TDS 권장 레이아웃(여백, 타이틀 크기) 적용.

### 4.2 CheckoutModal

- 전체 레이아웃: `TDSModal` 또는 `TDSBottomSheet`.
- 결제 수단 선택: TDS에 선택 리스트/라디오 패턴이 있으면 사용.
- “결제하기” / “취소”: `TDSButton`.
- 주문 요약 텍스트: TDS Typography 또는 동일 스타일.

**체크:**

- [ ] 결제/구독 화면이 TDS 모달·버튼·리스트와 시각적으로 일관되는지.
- [ ] CheckoutModal 내부에 반복되는 스타일이 없다면 상수/공통 컴포넌트로 추출.

---

## 5. Phase 5 — 설정/탈퇴 (Footer + AuthModals 프로필 + 정책 화면)

**목표:**  
설정·탈퇴·이용약관/개인정보/환불 규정 접근을 TDS로 통일.

### 5.1 Footer

- “토스 미니앱 고객센터”: `TDSButton`.
- 이용약관/개인정보처리방침/환불규정: 링크 스타일을 TDS 텍스트 버튼 또는 링크 스타일로 통일.

### 5.2 프로필(설정)·탈퇴

- `AuthModals`의 `ProfileView` 내 “회원 탈퇴”, “구독 취소” 등: `TDSButton` (tertiary 또는 destructive 스타일이 있다면 사용).
- 탈퇴 확인 다이얼로그: `TDSModal` + `TDSButton`.

### 5.3 Privacy / Terms

- “뒤로가기” 등 버튼: `TDSButton`.
- 본문은 기존 유지하되, 제목/섹션 제목만 TDS 타이포 또는 동일 스타일로 맞추면 됨.

**체크:**

- [ ] 설정/탈퇴/정책 관련 모든 버튼과 모달이 TDS 래퍼를 쓰는지.
- [ ] Footer 링크가 웹/토스에서 동일한 UX로 동작하는지.

---

## 6. Phase 6 — 나머지 모달 및 공통 요소

**대상:**  
AlarmModal, PortfolioDetailsModal, QuickInputModal, TradeExecutionModal, AIImageInputModal, SettlementModals (TerminationInput, Result).

### 6.1 공통 적용

- **모달 껍데기:** `TDSModal`(또는 BottomSheet) 래퍼 사용.
- **헤더/푸터:** 공통 `TDSModal.Header`, `TDSModal.Footer` 사용.
- **내부 버튼:** `TDSButton`.
- **내부 입력:** 숫자/텍스트 모두 `TDSTextField` 또는 공통 Input.

### 6.2 AlarmModal 특이사항

- 이미 `Menu`(TossMenu)를 동적 require로 사용 중 → TDS 래퍼 폴더로 옮기고, “드롭다운/메뉴”는 TDS `Menu` 또는 동일 컴포넌트를 래퍼를 통해만 사용하도록 정리.
- 시간 선택 등 복잡한 폼은 작은 단위로 쪼개어 **Cognitive Complexity** 를 낮춤.

### 6.3 Navigation (NavIcon)

- `App.tsx`의 `NavIcon`: 토스 환경에서는 TDS 탭/네비게이션 패턴이 있으면 적용. 없으면 아이콘·라벨 스타일만 TDS 색/타이포와 맞춤.
- **Disabled + tooltip** 은 유지하되, 툴팁 스타일을 TDS에 맞게 조정.

**체크:**

- [ ] 모든 모달이 동일한 레이아웃 래퍼와 버튼/입력 컴포넌트를 사용하는지.
- [ ] AlarmModal 등 복잡한 폼이 서브 컴포넌트로 나뉘어 가독성이 좋아졌는지.

---

## 7. 리팩토링 우선순위 요약 (중요도 순)

1. **공통 레이어 (0 + Phase 1)**  
   TDS 래퍼(TDSButton, TDSModal, TDSTextField) + 스타일 상수 정리, Dead Code/Unused Props 정리, AuthModals 뷰 분리 및 모달 상태 훅화.
2. **메인 화면 (Phase 2)**  
   Dashboard List/카드/버튼 TDS 치환 및 PortfolioCard 추출.
3. **로그인/온보딩 (Phase 3)**  
   Landing + AuthModals + TossLoginView 버튼/폼/모달 TDS 통일.
4. **결제/구독 (Phase 4)**  
   Pricing + CheckoutModal TDS 통일.
5. **설정/탈퇴 (Phase 5)**  
   Footer + 프로필/탈퇴 + Privacy/Terms 버튼·스타일 통일.
6. **나머지 모달 (Phase 6)**  
   Alarm, PortfolioDetails, QuickInput, TradeExecution, AIImage, Settlement 모달 공통화 및 TDS 적용.

---

## 8. 품질 체크리스트 (매 Phase 후)

- [ ] **DRY:** 동일한 버튼/모달/입력 스타일이 두 곳 이상에 하드코딩되어 있지 않은가?
- [ ] **Dead Code:** 사용되지 않는 변수, 함수, import, props가 없는가?
- [ ] **Cognitive Complexity:** 한 컴포넌트/함수 내 조건 분기가 과하지 않은가? (서브뷰/설정 객체로 분리했는가?)
- [ ] **Anti-patterns:** key, setState, useEffect 의존성, prop drilling, TDS 사용 방식이 권장 패턴인가?
- [ ] **토스 앱:** 실제 토스 앱에서 TDS 컴포넌트가 정상 렌더링·동작하는가?
- [ ] **웹:** 웹에서는 기존과 동일하거나 개선된 UX가 유지되는가?

---

이 문서를 기준으로 Phase 1부터 순서대로 진행하면, 유지보수성과 클린 코드를 만족하면서 TDS 치환을 단계적으로 완료할 수 있습니다. 각 Phase 완료 후 위 체크리스트를 한 번씩 돌리면 품질을 유지하기 좋습니다.
