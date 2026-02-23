# TDS 완전 롤백 → 원포인트 재적용 계획

> 역할: 시니어 리뷰어·강박적 코드 품질 기준.  
> 목표: (1) TDS 완전 롤백 패치로 기준선 확보, (2) 이후 버튼/글귀 등 원포인트 단위로 TDS 재적용.  
> 참고: [TDS Mobile](https://tossmini-docs.toss.im/tds-mobile/), [TDS Button](https://tossmini-docs.toss.im/tds-mobile/components/button)

---

## Part 1. TDS 완전 롤백 패치 계획

### 1.1 롤백 범위 정의

**제거/비활성화할 것**

| 대상 | 내용 | 목적 |
|------|------|------|
| TDS Provider | `TDSWrapper`에서 `TDSMobileAITProvider` 감싸기 제거 | 미니앱에서도 TDS 테마/컨텍스트 미적용 → 웹과 동일한 렌더 |
| TDS 분기 | 모든 TDS 래퍼 컴포넌트 내 `isInTossApp` 분기 제거, **항상 웹 브랜치만 사용** | 한 코드 경로만 사용해 디자인·동작 일원화 |
| TDS 동적 로딩 | `@toss/tds-mobile-ait` / `@toss/tds-mobile` require·import 제거 또는 dead code화 | 번들·실행 경로 단순화 |

**유지할 것**

| 대상 | 이유 |
|------|------|
| `TossAppProvider` / `isTossApp()` / 토스 브릿지 | 로그인·결제·딥링크 등 **기능**은 토스 환경 감지에 의존 |
| `components/tds/*` 디렉터리 및 export | 롤백 후에는 “웹 스타일만 렌더”하도록 내부만 수정. 나중에 원포인트 재적용 시 같은 컴포넌트를 다시 TDS 분기 넣어 사용 |
| `components/ui/constants.ts` (BUTTON, INPUT, MODAL) | 웹 UI의 단일 소스. TDS 롤백 후에도 이 상수 기반으로만 렌더 |

### 1.2 롤백 패치 단계 (작업 순서)

#### Phase R1: 루트 레이어 (App.tsx)

1. **TDSWrapper 동작 변경**
   - `isInTossApp` 여부와 관계없이 **항상 `children`만 렌더** (Provider 감싸지 않음).
   - 또는 TDSWrapper를 제거하고 `TossAppProvider` 직하위에 `MainContent`만 두기.
   - 선택: TDSWrapper는 유지하되 내부에서 `TDSMobileAITProvider` 로딩/감싸기를 제거하고 `return <>{children}</>;` 만 하도록 수정 (나중에 원포인트 재적용 시 다시 켜기 쉬움).

2. **검증**
   - 웹: 기존과 동일.
   - 샌드박스: TDS Provider 없이 앱 진입 → 현재 웹과 동일한 UI가 나와야 함.

#### Phase R2: TDS 래퍼 컴포넌트 (항상 웹 브랜치)

3. **TDSButton.tsx**
   - `useTossApp()` 및 `if (isInTossApp) { require('@toss/tds-mobile') ... }` 블록 제거.
   - 항상 `BUTTON` 상수 기반 `<button>` 만 렌더.

4. **TDSTextField.tsx**
   - 동일하게 `isInTossApp` 분기 제거, 항상 `INPUT` 상수 기반 `label` + `input` 렌더.

5. **TDSModal.tsx**
   - `isInTossApp` 분기 제거, 항상 `MODAL` 상수 기반 오버레이/패널 구조 렌더.
   - 내부에서 `TDSButton` 사용하는 부분은 그대로 두어도 됨 (이미 웹 브랜치만 타므로).

6. **TDSList.tsx / TDSListRow.tsx**
   - TDS List 컴포넌트 사용 분기 제거, 항상 `children` / `className`만 적용하는 단순 div/스타일 래퍼로 렌더.

7. **useTDSMenu.ts**
   - `isInTossApp`일 때 TDS Menu 반환하는 부분 제거. **항상 `{ Menu: null }`** 반환.
   - `StrategyCreator.tsx`, `AlarmModal.tsx` 등에서 `Menu`가 null이면 기존 웹용 드롭다운/메뉴 UI만 사용하도록 이미 분기되어 있는지 확인 후, 없으면 추가.

#### Phase R3: 외부 의존 정리 (선택)

8. **@toss/tds-mobile-ait**
   - 롤백 기간에는 사용처가 없으므로 `package.json`에서 제거해도 됨.  
   - 원포인트 재적용 시 다시 추가.

9. **@toss/tds-colors** (`utils/tossColors.ts`)
   - 색상만 참조하는 경우 웹 기준 색으로 대체 가능.  
   - 롤백 시 `tossColors.ts`를 웹용 팔레트만 쓰도록 수정하거나, 상수 파일로 대체.

#### Phase R4: 회귀 테스트 체크리스트

- [ ] 웹(데스크톱/모바일): 로그인, 회원가입, 비밀번호 재설정, 프로필, 로그아웃, 탈퇴/환불 플로우.
- [ ] 웹: 대시보드 진입, 포트폴리오 추가/수정/삭제, 거래 추가, 알람 설정/해제.
- [ ] 웹: 결제 플로우(요금제 선택 → 결제 버튼 → 완료/취소).
- [ ] 샌드박스: 위와 동일 시나리오. 알람 설정 후 실제 알람 동작 여부 확인.
- [ ] 콘솔/네트워크: `@toss/tds-mobile` 등 로드 에러 없음.

---

## Part 2. 원포인트 재적용 계획 (롤백 이후)

### 2.1 원칙

- **한 번에 한 “단위”만** TDS로 되돌린다.
- 단위 = 토스 가이드의 **컴포넌트 종류(Button, TextField, Modal 등)** 또는 **화면/플로우 단위(로그인만, 결제만)** 중 하나로 정한다.
- 각 단위 적용 후: 웹·샌드박스 모두에서 스타일·접근성·동작 확인 후 다음 단위로 진행.

### 2.2 재적용 우선순위 (권장)

| 순서 | 단위 | 설명 | 리스크 |
|------|------|------|--------|
| 1 | **로그인/온보딩 플로우** | Landing 로그인·회원가입 버튼, TossLoginView, AuthModals 내 버튼/텍스트필드/모달 | 낮음. 검수에서 민감한 영역이라 우선 TDS 적용 권장. |
| 2 | **결제 플로우** | CheckoutModal 내 버튼·모달 | 낮음. CTA 단일 포인트. |
| 3 | **설정/계정 플로우** | ProfileView, ChangePasswordView, ResetPasswordView (버튼·TextField·모달) | 낮음. |
| 4 | **대시보드 CTA** | Dashboard 포트폴리오 추가 버튼, 우측 상단 버튼 그룹, 하단 액션 버튼 | 중간. 개수 많음. |
| 5 | **Footer / Pricing** | Footer 고객센터·약관 버튼, Pricing 요금제 선택 버튼 | 낮음. |
| 6 | **리스트/메뉴** | TDSList/TDSListRow, useTDSMenu(Menu) | 중간. 레이아웃 영향 가능. |

### 2.3 원포인트 “단위” 선택 방식

- **A: 컴포넌트 타입 단위**  
  예: “전체 앱에서 TDSButton만 다시 켠다” → `TDSButton` 내부에 `isInTossApp` 분기 복구 + `@toss/tds-mobile` 사용.
- **B: 화면/플로우 단위**  
  예: “로그인 플로우만 TDS” → 로그인 관련 화면에서만 TDS 컴포넌트를 쓰고, 나머지는 웹 컴포넌트 유지.  
  (이 경우 TDS 래퍼는 “특정 화면에서만 TDS를 켜는” 식으로 조건을 넣거나, 로그인 전용 TDS 버튼/인풋을 두는 방식 필요.)

권장: **먼저 A(컴포넌트 타입)** 로 “TDSButton만 전역 복구” → “TDSTextField만 전역 복구” 순으로 하면, 코드 변경이 래퍼 한 곳씩이라 관리하기 쉽고, 이후 B(플로우)로 “이 화면만 TDS 강화” 보정 가능.

---

## Part 3. 토스 가이드 기준 단위 분류

TDS Mobile 문서([소개](https://tossmini-docs.toss.im/tds-mobile/), [Button](https://tossmini-docs.toss.im/tds-mobile/components/button)) 기준으로, **우리 프로젝트에서 쓰는 UI를 “TDS 컴포넌트 단위”로 분류**한 결과입니다.  
(문서에 나온 컴포넌트: Button, Bubble, Checkbox, TextField, Modal, List, Menu 등으로 추정; 우리는 그중 아래만 사용.)

### 3.1 TDS 컴포넌트 단위 ↔ 프로젝트 사용처

| TDS 가이드 단위 (추정) | 우리 래퍼 | 사용 파일 | 롤백 시 대체 |
|------------------------|-----------|-----------|----------------|
| **Button** | TDSButton | Footer, TossLoginView, ChangePasswordView, ProfileView, Landing, CheckoutModal, Dashboard, Pricing, AuthModals, TDSModal | `BUTTON` 상수 + `<button>` |
| **TextField** | TDSTextField | ChangePasswordView, ResetPasswordView | `INPUT` 상수 + `<label>` + `<input>` |
| **Modal** | TDSModal, TDSModalHeader, TDSModalFooter | CheckoutModal, AuthModals, TDSModal 내부 | `MODAL` 상수 + div 구조 |
| **List / ListRow** | TDSList, TDSListRow | Dashboard (포트폴리오 리스트) | div + 기존 스타일 클래스 |
| **Menu** | useTDSMenu → Menu | StrategyCreator, AlarmModal | 기존 웹용 드롭다운/메뉴 UI |

### 3.2 “글귀(텍스트)” 단위

토스 가이드에 **Typography** 또는 **Text** 컴포넌트가 있다면, “글귀”는 다음처럼 나눌 수 있음.

| 단위 | 설명 | 우리 적용 예 |
|------|------|--------------|
| **제목/헤딩** | 화면 제목, 모달 제목 | Landing, AuthModals 헤더, Pricing 제목 |
| **본문** | 설명 문단 | 약관/개인정보 문단, 에러 메시지 |
| **캡션/라벨** | 라벨, 힌트, 보조 텍스트 | TDSTextField label, 버튼 옆 설명 |

문서에서 Typography/Text 페이지를 확인할 수 있으면, 그 스펙에 맞춰 “제목만 TDS”, “본문만 TDS” 식으로 원포인트 적용 가능.

### 3.3 단위별 “바꿀지 말지” 정리 (원포인트 시 참고)

| 단위 | 롤백 시 | 원포인트 재적용 시 권장 |
|------|--------|-------------------------|
| **Button** | 전부 웹 | ✅ 로그인/결제/설정 → 대시/Footer 순으로 재적용 |
| **TextField** | 전부 웹 | ✅ 로그인·비밀번호·프로필 폼부터 재적용 |
| **Modal** | 전부 웹 | ✅ Auth/Checkout 모달부터 재적용 |
| **List/ListRow** | 전부 웹 | ⚠️ 대시보드 리스트는 영향 범위 넓음 → 나중에 선택 적용 |
| **Menu** | 전부 웹 | ⚠️ StrategyCreator/AlarmModal 메뉴만 필요 시 재적용 |
| **글귀(Typography)** | 현재 TDS 전용 Typography 미사용 | 가이드 확인 후, 필요하면 제목/본문/캡션 단위로 선택 적용 |

---

## Part 4. 요약

1. **TDS 완전 롤백**  
   - R1: App.tsx에서 TDS Provider 미적용(또는 TDSWrapper가 항상 children만 렌더).  
   - R2: TDSButton, TDSTextField, TDSModal, TDSList/TDSListRow, useTDSMenu에서 TDS 분기 제거 → 항상 웹 브랜치.  
   - R3: (선택) tds-mobile-ait 제거, tossColors 웹용으로 정리.  
   - R4: 회귀 테스트로 기능(알람·로그인·결제·설정) 검증.

2. **원포인트 재적용**  
   - 컴포넌트 타입 단위(Button → TextField → Modal → List/Menu)로 재적용하거나,  
   - 플로우 단위(로그인 → 결제 → 설정 → 대시보드 → 기타)로 재적용.  
   - 토스 가이드의 Button/TextField/Modal 등 **단위별로 “바꿀지 말지”** Part 3 표를 기준으로 결정.

3. **토스 가이드 기준 분류**  
   - 우리가 쓰는 건 **Button, TextField, Modal, List, Menu** 수준이며,  
   - “글귀”는 가이드에 Typography/Text가 있으면 제목·본문·캡션 단위로 나누어 적용 가능.  
   - 위 단위별로 롤백/재적용을 나누면, 품질·일관성을 유지하면서 단계적으로 TDS를 다시 넣을 수 있음.

이 계획대로 진행하면, 롤백으로 기준선을 확보한 뒤 원포인트만 골라 TDS를 다시 넣는 방식으로 코드 품질과 출시 요건을 동시에 맞출 수 있습니다.
