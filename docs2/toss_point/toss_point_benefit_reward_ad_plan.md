# 혜택 보상 금액 및 광고 개선 계획서

## 목적

혜택 탭의 보상 정책과 광고 노출 위치를 다음 기준으로 정리합니다.

- 출석체크 기본 보상: `1머니`에서 `5머니`로 상향
- 주식 가격 예측 참여 보상: `5머니`에서 `10머니`로 상향
- 주식 상식 퀴즈 참여 보상: `5머니`에서 `10머니`로 상향
- 출석체크, 주식 가격 예측, 주식 상식 퀴즈 카드 제목 옆에 참여 보상 라벨 표시
- 주식 가격 예측 완료 후에도 상식 퀴즈 완료 후와 동일한 전면 광고 경로 사용
- 기존 출석 체크 카드 내부 배너를 유지하고, 혜택 탭 콘텐츠 맨 아래에 피드형 고정 높이 배너를 추가해 2개 배너를 동시에 노출

## 현재 코드 상태

### 전면 광고

`components/Benefits.tsx`에는 이미 퀴즈와 예측 완료 후 `showBenefitInterstitial()` 호출이 모두 존재합니다.

- 퀴즈 완료 후: `handleQuizChoiceSubmitCore()`에서 `showBenefitInterstitial()` 호출
- 예측 완료 후: `handlePredictionSubmitCore()`에서 `showBenefitInterstitial()` 호출
- 전면 광고 그룹 ID는 `INTERSTITIAL_PLACEMENT_KEYS.BENEFIT_MISSION_REWARD`를 통해 기존 전면 광고 설정을 사용

따라서 실제 AIT에서 예측 완료 후 전면 광고가 보이지 않는 문제는 코드 누락보다는 아래 가능성이 큽니다.

- 최신 AIT 빌드 미반영
- 전면 광고 preloading/cooldown 상태
- Toss App/SDK 지원 상태
- 광고 no-fill 또는 show 실패

확인 결과, 호출부 누락보다 광고 매니저 정책 쪽에서 실제 미노출을 만들 수 있는 원인이 더 중요했습니다.

- `GlobalAdManager`는 세션 첫 전면광고 시도를 `skipped_first_action_exemption`으로 1회 건너뛰는 정책을 갖고 있습니다.
- 예측이 사용자의 첫 혜택 미션이면, 예측 제출 후 전면광고 호출 자체는 실행되지만 매니저가 첫 시도 면제로 스킵할 수 있습니다.
- 예측은 퀴즈보다 사용자가 빠르게 제출할 수 있어, 혜택 탭 진입 직후 광고 preload가 아직 `ready`가 아니면 `skipped_not_ready`로 스킵될 수 있습니다.
- 전역 쿨다운 `240초`는 유지합니다. 퀴즈 전면광고가 이미 노출된 직후 4분 안에 예측을 제출하면 예측 전면광고는 의도적으로 스킵될 수 있습니다.

현재 브랜치에서는 아래 보정이 이미 반영된 상태로 간주합니다.

- 혜택 미션 전면광고(`BENEFIT_MISSION_REWARD`)는 세션 첫 전면광고 면제 대상에서 제외되어야 합니다.
- `showInstantAd` 경계에서는 `skipped_not_ready`일 때만 짧게 재시도해야 합니다.
- `components/Benefits.tsx`의 예측/퀴즈 완료 후 `showBenefitInterstitial()` 호출은 그대로 유지합니다.

### 보상 금액

현재 보상 금액은 두 계층에 존재합니다.

- 프론트/순수 정책 상수: `services/benefits/benefitRewardPolicy.ts`
- 실제 지급 DB RPC: `supabase/migrations/20260512153000_create_benefit_rpcs.sql`에서 만든 RPC

중요한 점은 실제 머니 지급은 DB RPC가 단일 진실이라는 점입니다. 프론트 상수만 바꾸면 UI/시뮬레이션과 실제 지급액이 어긋납니다.

현재 DB RPC에는 다음 숫자가 직접 들어가 있습니다.

- `attend_and_claim_reward`: `1`
- `submit_quiz_and_claim_reward`: `5`
- `submit_prediction_and_claim_reward`: `5`
- 연속 출석 보너스: `10` 유지

### 배너 광고

현재 프로젝트는 토스 공식 배너 SDK 경로를 이미 사용합니다.

- `services/tossBannerService.ts`: `TossAds.initialize`, `TossAds.attachBanner`
- `hooks/useTossBanner.ts`: SDK 초기화/attach 추상화
- `components/TossInlineBanner.tsx`: 공통 배너 컴포넌트

토스 공식 문서 기준 배너 광고는 다음을 지켜야 합니다.

- 실행 환경은 Toss App
- `TossAds.initialize`를 먼저 호출
- `TossAds.attachBanner`로 빈 DOM 요소에 부착
- 컨테이너 width는 `100%`
- 피드형 배너를 고정형으로 사용할 경우 컨테이너 높이 `410px` 권장
- 반환된 `destroy()`를 언마운트 시 호출

기존 `TossInlineBanner`는 위 조건 대부분을 이미 만족합니다. 새 구현은 새로운 SDK 코드를 만들지 않고 이 컴포넌트를 재사용합니다.

## 구현 방침

### 0. 예측 전면광고 보정 검증

현재 워크스페이스 기준으로 전면광고 보정은 이미 반영된 상태입니다. 이 단계에서는 코드를 다시 수정하지 않고 아래 항목만 확인합니다.

검증 대상:

- `services/ads/interstitialPlacementConfig.ts`
  - `InterstitialPlacementDefinition.shouldDeferFirstAttempt`가 존재
  - `BENEFIT_MISSION_REWARD`가 `shouldDeferFirstAttempt: false`
- `services/ads/globalAdManager.ts`
  - 첫 전면광고 면제가 placement별 `shouldDeferFirstAttempt`를 기준으로 동작
- `services/ads/AdPreloadProvider.tsx`
  - `showInstantAd`가 `skipped_not_ready`일 때만 짧게 재시도

이미 반영된 브랜치에서는 이 항목과 관련된 코드를 다시 수정하지 않습니다. 전면광고가 no-fill, SDK 미지원, 전역 쿨다운으로 표시되지 않아도 보상 지급과 화면 갱신은 기존대로 진행됩니다.

### 1. 보상 금액 상향은 새 migration으로 처리

기존 migration을 수정하지 않고 새 migration을 추가합니다.

예상 파일명:

```text
supabase/migrations/YYYYMMDDHHMMSS_update_benefit_reward_amounts.sql
```

이 migration에서 아래 RPC를 `CREATE OR REPLACE FUNCTION`으로 재정의합니다.

- `attend_and_claim_reward(uuid, date, boolean)`
- `submit_quiz_and_claim_reward(uuid, uuid, date, integer, text, text)`
- `submit_prediction_and_claim_reward(uuid, uuid, date, integer, text, text)`

원칙:

- 이미 받은 과거 보상 기록은 수정하지 않습니다.
- 새 요청부터 변경된 보상 금액을 적용합니다.
- 함수 내부에는 의미 있는 변수명을 둡니다.
  - `v_attendance_reward_money integer := 5`
  - `v_attempt_reward_money integer := 10`
  - `v_streak_bonus_money_amount integer := 10`
- ledger와 wallet, response의 `rewardMoney`/`baseMoneyGranted` 값이 같은 상수를 사용하게 합니다.
- `FOR UPDATE` 잠금과 `ON CONFLICT` idempotency 구조는 기존 그대로 유지합니다.

### 2. 프론트 정책 상수도 DB와 맞춤

`services/benefits/benefitRewardPolicy.ts`를 다음과 같이 맞춥니다.

- `FIXED_ATTEMPT_REWARD_MONEY = 10`
- `ATTENDANCE_REWARD_MONEY = 5`
- `ATTENDANCE_STREAK_BONUS_MONEY = 10` 유지

### 3. 카드 보상 라벨은 i18n 기반으로 추가

UI 텍스트를 JSX에 직접 쓰지 않습니다.

`constants/messages/benefitMessages.ts`에 아래 키를 추가합니다.

- `attendanceRewardLabel`
- `predictionRewardLabel`
- `quizRewardLabel`

`BenefitQuestCard`에는 `rewardLabel?: string` prop을 추가합니다.

`metaLabel`은 예측 카드의 직전 정답률에 이미 사용 중이므로, 보상 표시는 별도 `rewardLabel`로 분리합니다.

### 4. 혜택 탭 하단 피드형 고정 높이 배너

하단 피드형 배너 광고 그룹 ID는 승인된 라이브 ID `ait.v2.live.a13a724ed4f94512`를 사용합니다. 기존 배너 그룹 ID를 빌려 쓰는 임시 alias는 폐기하고, 테스트 광고 ID나 QA 전용 환경 변수 분기는 도입하지 않습니다.

확정 정책:

- 기존 `AttendanceQuestCard` 내부 배너는 끄지 않습니다.
- `Benefits.tsx`에서 `AttendanceQuestCard`에 전달하는 `shouldShowBannerAd={shouldShowAds}`는 그대로 유지합니다.
- 새 하단 피드형 배너를 혜택 탭 콘텐츠 맨 아래 일반 문서 흐름에 추가해, 출석 카드 내부 배너와 동시에 노출합니다.

구현:

- `services/ads/adPlacements.ts`
  - `BENEFIT_FEED_BANNER_LIVE_AD_GROUP_ID` 추가
  - 승인된 라이브 ID `ait.v2.live.a13a724ed4f94512` 직접 할당
  - 향후 광고 그룹을 교체할 때도 이 상수만 변경
- `components/Benefits.tsx`
  - `TossInlineBanner`와 `getResolvedBenefitFeedBannerAdGroupId()` import
  - `shouldShowAds`, `isInTossApp`, `adGroupId.trim() !== ''` 조건으로 렌더링
  - 화면에 붙이는 CSS 위치 고정 방식은 사용하지 않습니다.
  - 혜택 탭 콘텐츠 맨 아래, 안내 `aside` 뒤에 인라인으로 배치합니다.
  - 피드형 고정형 가이드에 맞춰 컨테이너 높이를 `410px`로 고정합니다.
  - 사용자는 스크롤을 아래로 내렸을 때 하단 피드형 배너를 봅니다.

주의:

- 현재 `AttendanceQuestCard` 내부에도 `TossInlineBanner`가 있습니다.
- 비즈니스 확정 정책상 출석 카드 내부 배너와 하단 피드형 배너는 동시에 노출합니다.
- 광고 상품이 "피드형"인지 여부는 콘솔에서 발급된 `adGroupId`의 광고 그룹 설정이 결정합니다. 코드에서는 공식 `attachBanner`의 `variant: 'card' | 'expanded'`만 설정합니다.

## 구현 순서

1. 예측 전면광고 보정 검증
   - 현재 브랜치에 `shouldDeferFirstAttempt`가 존재하는지 확인
   - `BENEFIT_MISSION_REWARD`가 `shouldDeferFirstAttempt: false`인지 확인
   - `showInstantAd`가 `skipped_not_ready`만 짧게 재시도하는지 확인
   - 이미 반영된 브랜치에서는 코드를 다시 수정하지 않음

2. DB migration 추가
   - 보상 지급 RPC 3개 재정의
   - Supabase SQL Editor 또는 migration 배포로 적용

3. 프론트 정책 상수 변경
   - `benefitRewardPolicy.ts`
   - 관련 시뮬레이션/테스트 기대값이 있다면 함께 수정

4. i18n 및 카드 UI 확장
   - `BenefitMessages` 키 추가
   - `BenefitQuestCard.rewardLabel` 추가
   - `AttendanceQuestCard`, `PredictionQuestCard`, `StockQuizQuestCard`에 전달

5. 혜택 하단 피드형 배너 추가
   - 피드형 광고 그룹 ID 추가
   - `Benefits.tsx` 콘텐츠 맨 아래 인라인 feed banner 추가
   - 출석 카드 내부 배너는 그대로 유지

6. 검증
   - `npm run typecheck:app`
   - `deno check --config "supabase/functions/benefits/deno.json" "supabase/functions/benefits/index.ts"`는 Edge 변경이 없으면 생략 가능
   - Supabase에서 보상 지급 smoke test
   - Toss QA에서 배너 렌더링, no-fill, 하단 탭바 overlap 확인

## QA 체크리스트

- 출석체크 후 `baseMoneyGranted = 5`
- 퀴즈 제출 후 `rewardMoney = 10`
- 예측 제출 후 `rewardMoney = 10`
- wallet의 `money_balance`, `lifetime_earned_money`가 지급 금액과 일치
- 카드 제목 옆 보상 라벨 표시
  - 출석체크: `참여 보상 5머니`
  - 주식 가격 예측: `참여 보상 10머니`
  - 주식 상식 퀴즈: `참여 보상 10머니`
- 예측 완료 후 전면 광고 호출 경로 유지
- 예측이 세션 첫 혜택 미션이어도 `skipped_first_action_exemption`으로 스킵되지 않음
- 혜택 탭 진입 직후 빠르게 예측을 제출해도 `skipped_not_ready`일 때 짧게 재시도
- 퀴즈 광고 직후 240초 안의 예측 광고는 전역 쿨다운으로 스킵될 수 있음
- 혜택 탭 하단 피드형 배너가 Toss App에서만 표시
- 출석 카드 내부 배너와 하단 피드형 배너가 동시에 표시
- 하단 피드형 배너가 콘텐츠 맨 아래에서 스크롤로 노출되고, 하단 탭바/토스트/CTA를 가리지 않음
- `BENEFIT_FEED_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.a13a724ed4f94512'`가 반영됨

## 사용자가 직접 해야 하는 작업

- 승인된 하단 피드형 배너 광고 그룹 ID 확인
- DB migration 적용
- AIT 프론트 재빌드/배포
- Toss 콘솔/QA에서 광고 노출 확인
