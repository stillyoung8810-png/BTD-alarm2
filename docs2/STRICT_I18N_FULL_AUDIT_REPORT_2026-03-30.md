# Strict I18N 전수조사 리포트

## 목적

본 문서는 `Rule 3. Strict I18N` 위반 여부를 코드베이스 전반에서 전수 점검한 결과와, 승인 후 일괄 수정(Phase 1b / Phase 2)에 바로 착수할 수 있도록 만든 구현 수준 계획서입니다.

이번 조사의 직접 계기는 다음 사례입니다.

- **실제 누락 사례**: 로그인 성공 안내가 SSOT 사전에 정의되어 있지 않아 정상 노출되지 않음

이 문서는 **즉시 수정하지 않고**, 먼저 승인용 리포트와 수정 스니펫만 제공합니다.

## 조사 범위와 기준

### 포함

- 런타임 UI를 구성하는 `.tsx` / `.ts` 파일
- JSX 텍스트 노드의 직접 문자열
- `label=""`, `title=""`, `placeholder=""`, `aria-label=""` 등 props 내 직접 문자열
- `alert()`, `confirm()`, `window.confirm()` 호출부
- `TDS_DIALOG_MESSAGES`, `LANDING_PAGE_COPY`, `PAYMENT_CHECKOUT_MESSAGES` 및 관련 SSOT 사전

### 제외

- `docs/`, `docs2/`, 테스트 파일, 빌드 산출물
- 순수 주석

### 분류 기준

| 유형 | 정의 |
|---|---|
| `하드코딩` | JSX/TSX/TS 내부에 한글/영문 UI 문자열이 직접 존재 |
| `네이티브 UI` | `alert()` / `confirm()` / `window.confirm()` 사용 |
| `사전 누락` | 로직은 존재하지만 SSOT에 대응 키/문구가 없음 |
| `사전 불일치` | 유사 키는 있으나 실제 코드 문자열과 문구가 다름 |

## 핵심 결론

### 1. 집중 조사 대상 결과

| 파일 | 결과 | 비고 |
|---|---|---|
| `components/Landing.tsx` | **중대 위반 없음** | `getLandingPageCopy(lang)` 경유로 일관됨 |
| `components/CheckoutModal.tsx` | **중대 위반 없음** | 결제 본문은 `PAYMENT_CHECKOUT_MESSAGES`, 제목은 `TDS_DIALOG_MESSAGES.checkout` 사용 |
| `components/AuthModals.tsx` | **중대 위반 다수** | 인증 오류/안내/모달 제목/aria-label 하드코딩 집중 |

### 2. 네이티브 다이얼로그 현황

- 확인된 네이티브 호출은 **총 29건**입니다.
- 분포: `hooks/usePortfolios.ts`, `hooks/useAuth.ts`, `components/StrategyCreator.tsx`, `components/AlarmModal.tsx`, `components/PortfolioDetailsModal.tsx`
- 대부분이 `TDS_DIALOG_MESSAGES` 미등록 상태입니다.

### 3. 가장 위험한 논리 공백

- `tdsDialogMessages.ts`의 실제 현재 코드에는 **`auth.loginSuccess*` 계열 키가 없습니다.**
- 그러나 `docs2/TDS_MIGRATION_PLAN.md`에는 이미 `loginSuccessTitle`, `loginSuccessBody`, `loginSuccessConfirm` 설계가 존재합니다.
- 즉, **계획서에는 있으나 실제 SSOT에는 없는 상태**이며, 이번 로그인 성공 안내 누락과 직접 연결됩니다.

## P0. 확정 위반 목록

아래 표는 즉시 수정 우선순위가 높은 **확정 위반**만 정리한 것입니다.

| 파일명 | 라인 넘버 | 발견된 문구 또는 메서드 | 위반 유형 |
|---|---:|---|---|
| `components/AuthModals.tsx` | 140-144 | 비밀번호 정책 문구 5종 직접 반환 | 하드코딩 |
| `components/AuthModals.tsx` | 154 | `모든 비밀번호 입력란을 채워주세요.` | 하드코딩 |
| `components/AuthModals.tsx` | 171 | `이메일 정보를 불러오지 못했습니다...` | 하드코딩 |
| `components/AuthModals.tsx` | 182 | `현재 비밀번호가 올바르지 않습니다.` | 하드코딩 |
| `components/AuthModals.tsx` | 193, 206, 238, 250 | `비밀번호 변경에 실패했습니다.` | 하드코딩 |
| `components/AuthModals.tsx` | 267, 398 | `이용약관과 개인정보 처리방침에 동의해야 합니다.` | 하드코딩 |
| `components/AuthModals.tsx` | 291-292 | `이미 가입된 이메일입니다.` / `Sign up failed.` | 하드코딩 |
| `components/AuthModals.tsx` | 300-303 | 회원가입 완료 후 이메일 인증 안내 | 하드코딩 + 사전 누락 |
| `components/AuthModals.tsx` | 346-357 | 인증 오류 변환 분기 전체 | 하드코딩 + 사전 누락 |
| `components/AuthModals.tsx` | 370 | `비밀번호 재설정을 위해 이메일을 입력해주세요.` | 하드코딩 |
| `components/AuthModals.tsx` | 383-389 | 재설정 메일 전송 성공/실패, `Failed to send reset email` | 하드코딩 + 사전 누락 |
| `components/AuthModals.tsx` | 456-459 | `${provider} 로그인에 실패했습니다...` | 하드코딩 + 사전 누락 |
| `components/AuthModals.tsx` | 475-477 | 세션 만료 / `Account deletion failed` | 하드코딩 + 사전 누락 |
| `components/AuthModals.tsx` | 481-490 | `Reset Password`, `Change Password`, `User Profile` | 하드코딩 |
| `components/AuthModals.tsx` | 512 | `aria-label="닫기"` | 하드코딩 |
| `App.tsx` | 676 | `백테스트 로딩 중…` | 하드코딩 |
| `App.tsx` | 842 | `t.membership ?? '멤버십'/'Membership'` 폴백 | 하드코딩 |
| `App.tsx` | 849-853 | 백테스트 비활성 툴팁 | 하드코딩 |
| `App.tsx` | 860, 866 | `게시판`, `aria-label="게시판"` | 하드코딩 |
| `hooks/useAuth.ts` | 156 | 세션 만료 `alert(...)` | 네이티브 UI + 사전 누락 |
| `hooks/useAuth.ts` | 204 | 비밀번호 변경 성공 `alert(...)` | 네이티브 UI + 사전 불일치 |
| `hooks/usePortfolios.ts` | 134 | 세션 만료 `alert(...)` | 네이티브 UI + 사전 누락 |
| `hooks/usePortfolios.ts` | 142-146 | 포트폴리오 생성 한도 `alert(...)` | 네이티브 UI + 사전 불일치 |
| `hooks/usePortfolios.ts` | 162, 166, 170, 174, 178, 182 | 입력 검증 `alert(...)` 6종 | 네이티브 UI + 사전 누락 |
| `hooks/usePortfolios.ts` | 201, 208 | 저장 실패/성공 `alert(...)` | 네이티브 UI + 사전 누락 |
| `hooks/usePortfolios.ts` | 273-277, 297 | 종료/이력 저장 실패 `alert(...)` | 네이티브 UI + 사전 누락 |
| `hooks/usePortfolios.ts` | 318, 327, 336, 358 | 수정 검증/업데이트 실패 `alert(...)` | 네이티브 UI + 사전 누락 |
| `hooks/usePortfolios.ts` | 437, 477 | 거래 추가/삭제 실패 `alert(...)` | 네이티브 UI + 사전 누락 |
| `hooks/usePortfolios.ts` | 489-493 | 포트폴리오 삭제 `window.confirm(msg)` | 네이티브 UI + 사전 누락 |
| `hooks/usePortfolios.ts` | 496 | 삭제 실패 `alert(...)` | 네이티브 UI + 사전 누락 |
| `hooks/usePortfolios.ts` | 518, 528-532, 540 | 종료 내역 삭제/전체 삭제 | 네이티브 UI + 사전 누락 |
| `components/StrategyCreator.tsx` | 293-295 | 생성 한도 `alert(...)` | 네이티브 UI + 사전 불일치 |
| `components/StrategyCreator.tsx` | 306 | 중복 종목 불가 `alert(msg)` | 네이티브 UI + 사전 누락 |
| `components/AlarmModal.tsx` | 124 | `프리미엄 전용 기능입니다.` | 네이티브 UI + 사전 누락 |
| `components/PortfolioDetailsModal.tsx` | 346 | `정산금:` | 하드코딩 |
| `components/PortfolioDetailsModal.tsx` | 359 | 거래 삭제 `confirm(...)` | 네이티브 UI + 사전 누락 |
| `components/tds/TDSModal.tsx` | 53 | `aria-label="닫기"` | 하드코딩 |
| `components/InfoModal.tsx` | 25 | `INFO` | 하드코딩 |
| `components/InfoModal.tsx` | 32 | `aria-label="Close"` | 하드코딩 |
| `components/InfoModal.tsx` | 50 | `confirmText || '확인'` | 하드코딩 |

## P1. 추가 하드코딩 Hotspot 인벤토리

아래는 전수 스캔에서 반복 패턴이 확인된 대표 군입니다. 승인 후 일괄 수정 범위에 포함해야 합니다.

| 파일명 | 라인 넘버 | 발견된 문구 또는 패턴 | 위반 유형 |
|---|---:|---|---|
| `components/auth/LoginView.tsx` | 62 | `placeholder="name@example.com"` | 하드코딩 |
| `components/auth/LoginView.tsx` | 98 | `처리 중...` / `Working...` | 하드코딩 |
| `components/auth/LoginView.tsx` | 105 | `비밀번호를 잊으셨나요? 재설정 메일 보내기` | 하드코딩 |
| `components/auth/LoginView.tsx` | 109 | `또는 소셜 계정으로 로그인` | 하드코딩 |
| `components/auth/LoginView.tsx` | 116 | `카카오` / `Kakao` | 하드코딩 |
| `components/auth/LoginView.tsx` | 125 | `계정이 없으신가요? 회원가입` | 하드코딩 |
| `components/auth/SignupView.tsx` | 62 | `placeholder="name@example.com"` | 하드코딩 |
| `components/auth/SignupView.tsx` | 85-105 | 필수 동의/이용약관/개인정보 처리방침 전체 | 하드코딩 |
| `components/auth/SignupView.tsx` | 119 | `처리 중...` / `Working...` | 하드코딩 |
| `components/auth/SignupView.tsx` | 126 | `비밀번호를 잊으셨나요? 재설정 메일 보내기` | 하드코딩 |
| `components/auth/SignupView.tsx` | 130 | `또는 소셜 계정으로 로그인` | 하드코딩 |
| `components/auth/SignupView.tsx` | 134 | `카카오` / `Kakao` | 하드코딩 |
| `components/auth/SignupView.tsx` | 140 | `이미 계정이 있으신가요? 로그인` | 하드코딩 |
| `components/auth/ProfileView.tsx` | 70 | `토큰 생성에 실패했습니다.` | 하드코딩 |
| `components/auth/ProfileView.tsx` | 104 | `환불 처리가 완료되었습니다.` | 하드코딩 |
| `components/auth/ProfileView.tsx` | 137-138 | `알 수 없는 오류`, `회원 탈퇴 실패` | 하드코딩 |
| `components/auth/ProfileView.tsx` | 165-168 | `ACCOUNT CONNECTED`, `unknown`, `FREE 회원` 등 | 하드코딩 |
| `components/auth/ProfileView.tsx` | 176-215 | 텔레그램 섹션 전체 | 하드코딩 |
| `components/Markets.tsx` | 679 | `title="PRO/PREMIUM 전용"` | 하드코딩 |
| `components/CustomDropdown.tsx` | 162 | `title="PRO/PREMIUM 전용"` | 하드코딩 |
| `components/StrategyCreator.tsx` | 2093 | `title="PRO/PREMIUM 전용"` | 하드코딩 |
| `components/VrOrderModal.tsx` | 253 | `aria-label="Close"` | 하드코딩 |
| `components/Terms.tsx` | 32-181 | 약관 섹션 제목 전체 | 하드코딩 |
| `components/Privacy.tsx` | 64-612 | 개인정보 처리방침 섹션 제목 전체 | 하드코딩 |

## 사전(SSOT) 미등록 / 불일치 분석

### A. `TDS_DIALOG_MESSAGES.auth`의 확정 누락

현재 실제 타입/데이터에는 아래 키가 없습니다.

- `loginSuccessTitle`
- `loginSuccessBody`
- `loginSuccessConfirm`
- `signupEmailVerificationInfo`
- `resetPasswordEmailSent`
- `resetPasswordSendFailed`
- `sessionExpired`
- `oauthLoginFailed`
- `accountDeletionFailed`
- `termsConsentRequired`

### B. `TDS_DIALOG_MESSAGES.auth`의 불일치

| 파일명 | 라인 넘버 | 현재 코드 | 사전 상태 | 분류 |
|---|---:|---|---|---|
| `hooks/useAuth.ts` | 204 | `Password updated successfully.` | 사전 en은 `Your password was updated successfully.` | 사전 불일치 |
| `hooks/usePortfolios.ts` | 142-146 | 티어명 포함 한도 문구 | 사전은 `portfolioLimitBody(maxCount)`만 있음 | 사전 불일치 |
| `components/StrategyCreator.tsx` | 293-295 | 한도 안내 영문이 `Please upgrade to create more.` | 사전은 `Please upgrade for more.` | 사전 불일치 |
| `components/AuthModals.tsx` | 512 | `닫기` | 사전 actions에는 `closeAriaLabel: '모달 닫기'` 존재 | 사전 불일치 |

### C. `LANDING_PAGE_COPY`

- `components/Landing.tsx` 기준 **논리 공백 없음**
- `LANDING_FEATURES_CONFIG`의 `id`와 `landingMessages.ts`의 `featureLabels`가 대응됨

### D. `Checkout`

- `components/CheckoutModal.tsx`의 결제 본문은 `PAYMENT_CHECKOUT_MESSAGES`에 존재
- `TDS_DIALOG_MESSAGES.checkout`은 제목 전용(`resultNoticeTitle`)만 담당
- 따라서 **결제 실패/검증 실패/네트워크 오류는 누락이 아니라 SSOT 분리 구조**로 판단

## 근거 스니펫

### 1. 실제 현재 SSOT에는 로그인 성공 키가 없음

```ts
auth: {
  passwordChangedTitle: string;
  passwordChangedBody: string;
  passwordChangedReloginTitle: string;
  passwordChangedReloginBody: string;
  accountDeletedTitle: string;
  accountDeletedBody: string;
};
```

### 2. `AuthModals.tsx` 내부에 인증 문구가 직접 박혀 있음

```ts
if (pw.length < 8) return lang === 'ko' ? '비밀번호는 최소 8자 이상이어야 합니다.' : 'Password must be at least 8 characters.';
if (!/[A-Z]/.test(pw)) return lang === 'ko' ? '대문자를 1개 이상 포함해야 합니다.' : 'Must include at least 1 uppercase letter.';
if (!/[a-z]/.test(pw)) return lang === 'ko' ? '소문자를 1개 이상 포함해야 합니다.' : 'Must include at least 1 lowercase letter.';
```

```ts
setInfo(
  lang === 'ko'
    ? '회원가입이 완료되었습니다. 이메일을 확인하여 계정을 인증해주세요. 인증 링크를 클릭하면 자동으로 로그인됩니다.'
    : 'Sign up successful! Please check your email to verify your account. Click the verification link to automatically log in.'
);
```

### 3. `App.tsx` 셸 문구도 일부가 SSOT 밖에 있음

```ts
<React.Suspense fallback={<div>백테스트 로딩 중…</div>}>
```

```ts
<a href="/posts" aria-label="게시판">
  <span>게시판</span>
</a>
```

### 4. 훅 레벨에서 네이티브 UI가 직접 호출됨

```ts
alert(lang === 'ko' ? '로그인 세션이 만료되었습니다. 다시 로그인해주세요.' : 'Session expired. Please log in again.');
if (!window.confirm(msg)) return;
alert(lang === 'ko' ? '거래 삭제에 실패했습니다.' : 'Failed to delete trade.');
```

## 수정 계획서

승인 후 수정은 아래 두 단계로 나누는 것이 가장 안전합니다.

### Phase 1b. P0 차단 이슈 수습

대상:

- `components/AuthModals.tsx`
- `hooks/useAuth.ts`
- `App.tsx`
- `components/tds/TDSModal.tsx`
- `components/InfoModal.tsx`

목표:

- 로그인 성공/인증 안내 누락 복구
- `AuthModals`와 앱 셸의 직접 문자열 제거
- 이미 존재하는 `TDS_DIALOG_MESSAGES.actions.closeAriaLabel` 재사용

#### Phase 1b 제안 스니펫 1: `constants/authMessages.ts`

```ts
import type { AppLang } from '../types';

export interface AuthMessages {
  modalTitleResetPassword: string;
  modalTitleChangePassword: string;
  modalTitleUserProfile: string;
  passwordPolicyMinLength: string;
  passwordPolicyUppercase: string;
  passwordPolicyLowercase: string;
  passwordPolicyNumber: string;
  passwordPolicySpecial: string;
  allPasswordFieldsRequired: string;
  currentPasswordIncorrect: string;
  termsConsentRequired: string;
  signupFailed: string;
  signupAlreadyRegistered: string;
  signupEmailVerificationInfo: string;
  authenticationError: string;
  invalidEmail: string;
  weakPassword: string;
  emailRateLimitExceeded: string;
  resetPasswordEmailRequired: string;
  resetPasswordEmailSent: string;
  resetPasswordSendFailed: string;
  oauthLoginFailed: (providerLabel: string, detail: string) => string;
}

export const AUTH_MESSAGES: Record<AppLang, AuthMessages> = {
  ko: {
    modalTitleResetPassword: '비밀번호 재설정',
    modalTitleChangePassword: '비밀번호 변경',
    modalTitleUserProfile: '사용자 프로필',
    passwordPolicyMinLength: '비밀번호는 최소 8자 이상이어야 합니다.',
    passwordPolicyUppercase: '대문자를 1개 이상 포함해야 합니다.',
    passwordPolicyLowercase: '소문자를 1개 이상 포함해야 합니다.',
    passwordPolicyNumber: '숫자를 1개 이상 포함해야 합니다.',
    passwordPolicySpecial: '특수문자를 1개 이상 포함해야 합니다.',
    allPasswordFieldsRequired: '모든 비밀번호 입력란을 채워주세요.',
    currentPasswordIncorrect: '현재 비밀번호가 올바르지 않습니다.',
    termsConsentRequired: '이용약관과 개인정보 처리방침에 동의해야 합니다.',
    signupFailed: '회원가입에 실패했습니다.',
    signupAlreadyRegistered: '이미 가입된 이메일입니다.',
    signupEmailVerificationInfo: '회원가입이 완료되었습니다. 이메일을 확인하여 계정을 인증해주세요. 인증 링크를 클릭하면 자동으로 로그인됩니다.',
    authenticationError: '인증 중 오류가 발생했습니다.',
    invalidEmail: '유효하지 않은 이메일 주소입니다.',
    weakPassword: '비밀번호가 너무 짧거나 약합니다.',
    emailRateLimitExceeded: '이메일 전송 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
    resetPasswordEmailRequired: '비밀번호 재설정을 위해 이메일을 입력해주세요.',
    resetPasswordEmailSent: '비밀번호 재설정 메일을 전송했습니다. 이메일을 확인해주세요.',
    resetPasswordSendFailed: '비밀번호 재설정 메일 전송에 실패했습니다.',
    oauthLoginFailed: (providerLabel, detail) => `${providerLabel} 로그인에 실패했습니다: ${detail}`,
  },
  en: {
    modalTitleResetPassword: 'Reset Password',
    modalTitleChangePassword: 'Change Password',
    modalTitleUserProfile: 'User Profile',
    passwordPolicyMinLength: 'Password must be at least 8 characters.',
    passwordPolicyUppercase: 'Must include at least 1 uppercase letter.',
    passwordPolicyLowercase: 'Must include at least 1 lowercase letter.',
    passwordPolicyNumber: 'Must include at least 1 number.',
    passwordPolicySpecial: 'Must include at least 1 special character.',
    allPasswordFieldsRequired: 'Please fill in all password fields.',
    currentPasswordIncorrect: 'Current password is incorrect.',
    termsConsentRequired: 'You must agree to the Terms of Service and Privacy Policy.',
    signupFailed: 'Sign up failed.',
    signupAlreadyRegistered: 'This email is already registered.',
    signupEmailVerificationInfo: 'Sign up successful! Please check your email to verify your account. Click the verification link to automatically log in.',
    authenticationError: 'Authentication error occurred.',
    invalidEmail: 'Invalid email address.',
    weakPassword: 'Password is too short or weak.',
    emailRateLimitExceeded: 'Email rate limit exceeded. Please try again later.',
    resetPasswordEmailRequired: 'Please enter your email to reset password.',
    resetPasswordEmailSent: 'Password reset email sent. Please check your inbox.',
    resetPasswordSendFailed: 'Failed to send reset email.',
    oauthLoginFailed: (providerLabel, detail) => `${providerLabel} login failed: ${detail}`,
  },
};
```

#### Phase 1b 제안 스니펫 2: `tdsDialogMessages.ts`에 로그인 성공 키 추가

```ts
auth: {
  loginSuccessTitle: string;
  loginSuccessBody: string;
  loginSuccessConfirm: string;
  passwordChangedTitle: string;
  passwordChangedBody: string;
  passwordChangedReloginTitle: string;
  passwordChangedReloginBody: string;
  accountDeletedTitle: string;
  accountDeletedBody: string;
};
```

```ts
auth: {
  loginSuccessTitle: '로그인 완료',
  loginSuccessBody: '환영합니다. 로그인되었습니다.',
  loginSuccessConfirm: '확인',
  passwordChangedTitle: '비밀번호 변경',
  passwordChangedBody: '비밀번호가 성공적으로 변경되었습니다.',
  passwordChangedReloginTitle: '비밀번호 변경',
  passwordChangedReloginBody: '비밀번호가 변경되었습니다. 다시 로그인해 주세요.',
  accountDeletedTitle: '회원 탈퇴',
  accountDeletedBody: '회원 탈퇴가 완료되었습니다.',
},
```

#### Phase 1b 제안 스니펫 3: `AuthModals.tsx`에서 SSOT 주입 사용

```ts
import { AUTH_MESSAGES } from '../constants/authMessages';
import { TDS_DIALOG_MESSAGES } from '../constants/tdsDialogMessages';

const authMessages = AUTH_MESSAGES[lang];
const dialogMessages = TDS_DIALOG_MESSAGES[lang];

const validatePassword = (pw: string): string | null => {
  if (pw.length < 8) return authMessages.passwordPolicyMinLength;
  if (!/[A-Z]/.test(pw)) return authMessages.passwordPolicyUppercase;
  if (!/[a-z]/.test(pw)) return authMessages.passwordPolicyLowercase;
  if (!/[0-9]/.test(pw)) return authMessages.passwordPolicyNumber;
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw)) return authMessages.passwordPolicySpecial;
  return null;
};

const modalTitle = type === 'login'
  ? t.login
  : type === 'signup'
  ? t.signup
  : type === 'reset-password'
  ? authMessages.modalTitleResetPassword
  : type === 'change-password'
  ? authMessages.modalTitleChangePassword
  : authMessages.modalTitleUserProfile;

// 웹 닫기 버튼
aria-label={dialogMessages.actions.closeAriaLabel}
```

#### Phase 1b 제안 스니펫 4: `App.tsx` 셸 사전 분리

```ts
import type { AppLang } from '../types';

export const APP_SHELL_MESSAGES: Record<AppLang, {
  backtestLoading: string;
  boardAriaLabel: string;
  boardLabel: string;
  backtestTooltip: string;
}> = {
  ko: {
    backtestLoading: '백테스트 로딩 중…',
    boardAriaLabel: '게시판으로 이동',
    boardLabel: '게시판',
    backtestTooltip: '더 나은 백테스트 경험을 위해\n다듬는 중이니 조금만 기다려 주세요.',
  },
  en: {
    backtestLoading: 'Loading backtest…',
    boardAriaLabel: 'Open board',
    boardLabel: 'Board',
    backtestTooltip: 'Polishing for a better backtest experience.\nPlease wait a bit.',
  },
};
```

```ts
const shellMessages = APP_SHELL_MESSAGES[lang];

<React.Suspense fallback={<div>{shellMessages.backtestLoading}</div>}>
...
tooltip={shellMessages.backtestTooltip}
...
aria-label={shellMessages.boardAriaLabel}
...
<span>{shellMessages.boardLabel}</span>
```

### Phase 2. 네이티브 UI 제거 + 사전 완성

대상:

- `hooks/usePortfolios.ts`
- `components/StrategyCreator.tsx`
- `components/AlarmModal.tsx`
- `components/PortfolioDetailsModal.tsx`
- `components/auth/LoginView.tsx`
- `components/auth/SignupView.tsx`
- `components/auth/ProfileView.tsx`

목표:

- `alert/confirm` 제거
- Hook 레벨 메시지와 View 레벨 문구를 SSOT로 이전
- TDS confirm/alert adapter를 사용하는 경로로 통일

#### Phase 2 제안 스니펫 1: 포트폴리오 메시지 SSOT

```ts
import type { AppLang } from '../types';

export interface PortfolioMessages {
  sessionExpired: string;
  createLimitBody: (tierName: string, maxPortfolios: number) => string;
  nameRequired: string;
  nameTooLong: string;
  dailyBuyAmountInvalid: string;
  dailyBuyAmountTooHigh: string;
  feeRateInvalid: string;
  startDateInvalid: string;
  saveFailed: (detail: string) => string;
  saveSucceeded: string;
  deleteConfirmBody: string;
  deleteFailed: (detail: string) => string;
  clearHistoryConfirmBody: string;
}
```

#### Phase 2 제안 스니펫 2: `usePortfolios.ts`에서 문자열 제거

```ts
import { PORTFOLIO_MESSAGES } from '../constants/portfolioMessages';

const pm = PORTFOLIO_MESSAGES[lang];

if (!userIdOption) {
  alert(pm.sessionExpired);
  return;
}

if (!rest.name?.trim()) {
  alert(pm.nameRequired);
  return;
}

const msg = pm.deleteConfirmBody;
if (!window.confirm(msg)) return;
```

위 스니펫은 1차적으로 **문자열을 SSOT로 이동**시키는 단계입니다. 승인 범위가 네이티브 UI 제거까지 포함되면 이후 아래 형태로 전환합니다.

```ts
confirmDialog.open({
  title: portfolioDialogMessages.deleteTitle,
  body: portfolioDialogMessages.deleteBody,
  confirmLabel: portfolioDialogMessages.deleteConfirm,
  tone: 'danger',
  action: async () => {
    await deletePortfolio(id);
  },
});
```

#### Phase 2 제안 스니펫 3: `InfoModal.tsx` / `TDSModal.tsx` 정리

```ts
const actions = TDS_DIALOG_MESSAGES[lang].actions;

<button aria-label={actions.closeAriaLabel}>
...
{confirmText ?? actions.confirm}
```

## 시뮬레이션 체크리스트

승인 후 수정이 완료되면 아래 시나리오로 회귀 검증할 수 있어야 합니다.

1. **로그인 성공**
   - 로그인 성공 시 하드코딩 문자열 없이 SSOT 문구가 노출됩니다.
   - `AuthModals.tsx` 내부에서 직접 `"환영합니다"`를 만들지 않습니다.
2. **회원가입 후 이메일 인증**
   - 인증 안내 문구가 `AUTH_MESSAGES.signupEmailVerificationInfo`에서만 공급됩니다.
3. **비밀번호 재설정**
   - 이메일 미입력 / 메일 발송 성공 / 실패 문구가 모두 사전에서 공급됩니다.
4. **포트폴리오 생성 제한**
   - 한도 초과 안내가 더 이상 inline template literal이 아니라 SSOT 함수에서 생성됩니다.
5. **포트폴리오 삭제**
   - `window.confirm`이 제거되거나 최소한 메시지가 SSOT에서 공급됩니다.
6. **앱 셸**
   - `백테스트 로딩 중…`, `게시판`, 툴팁이 모두 셸 사전에서 공급됩니다.
7. **접근성**
   - 닫기 버튼 `aria-label`이 `TDS_DIALOG_MESSAGES.actions.closeAriaLabel`로 통일됩니다.

## 권고 우선순위

1. **즉시 승인 권고**
   - `AuthModals.tsx`
   - `hooks/useAuth.ts`
   - `App.tsx`
   - `components/tds/TDSModal.tsx`
   - `components/InfoModal.tsx`
2. **다음 배치**
   - `hooks/usePortfolios.ts`
   - `components/StrategyCreator.tsx`
   - `components/PortfolioDetailsModal.tsx`
   - `components/AlarmModal.tsx`
   - `components/auth/*`
3. **정책 결정 후 처리**
   - `components/Terms.tsx`
   - `components/Privacy.tsx`

## 최종 판단

- **현재 코드베이스는 Strict I18N Rule 3을 부분적으로만 충족합니다.**
- `Landing.tsx`, `CheckoutModal.tsx`는 비교적 양호하지만, 인증/프로필/포트폴리오/앱 셸 영역에 **사전 밖 인라인 문자열**과 **네이티브 UI 호출**이 넓게 남아 있습니다.
- 특히 **로그인 성공 안내 SSOT 누락**은 이미 실서비스 결함으로 관측되었고, `AuthModals.tsx`는 이번 정리의 최우선 대상입니다.

승인 후에는 본 문서의 `Phase 1b`부터 순차 적용하는 것이 가장 안전합니다.
