# 혜택 보상 금액 및 광고 개선 스니펫

## 범위

이 문서는 다음 파일을 수정하기 위한 적용 스니펫입니다.

- `supabase/migrations/YYYYMMDDHHMMSS_update_benefit_reward_amounts.sql`
- `services/benefits/benefitRewardPolicy.ts`
- `constants/messages/benefitMessages.ts`
- `components/benefits/BenefitQuestCard.tsx`
- `components/benefits/AttendanceQuestCard.tsx`
- `components/benefits/PredictionQuestCard.tsx`
- `components/benefits/StockQuizQuestCard.tsx`
- `services/ads/interstitialPlacementConfig.ts`
- `services/ads/globalAdManager.ts`
- `services/ads/AdPreloadProvider.tsx`
- `services/ads/adPlacements.ts`
- `components/Benefits.tsx`

실제 머니 지급액은 DB RPC가 최종 기준입니다. 프론트 상수와 UI 라벨은 DB 지급 정책과 반드시 함께 변경해야 합니다.

## 1. 예측 전면광고 보정 검증

이 섹션은 현재 브랜치 기준 참고/검증용입니다. 이미 반영된 브랜치에서는 코드를 복사하지 않습니다.

검증 체크:

- `services/ads/interstitialPlacementConfig.ts`
  - `InterstitialPlacementDefinition`에 `shouldDeferFirstAttempt: boolean` 존재
  - `BENEFIT_MISSION_REWARD` 정의가 `shouldDeferFirstAttempt: false`
- `services/ads/globalAdManager.ts`
  - `validateShowInstant()` 첫 시도 면제 조건에 `definition.shouldDeferFirstAttempt` 포함
- `services/ads/AdPreloadProvider.tsx`
  - `showInstantAd()`가 `skipped_not_ready`만 재시도

전역 쿨다운 `240초`는 유지합니다. 퀴즈 전면광고가 이미 노출된 직후 4분 안에 예측을 제출하면 예측 전면광고는 의도적으로 스킵될 수 있습니다.

검증 명령:

```powershell
npm run typecheck:app
```

AIT QA에서는 아래 흐름을 확인합니다.

- 혜택 탭 진입 후 예측을 첫 미션으로 제출했을 때 전면광고가 첫 시도 면제로 스킵되지 않는지 확인
- 혜택 탭 진입 직후 빠르게 예측을 제출해도 `skipped_not_ready` 재시도 후 광고가 표시되는지 확인
- 퀴즈 광고 노출 직후 240초 안의 예측 광고는 쿨다운으로 스킵될 수 있음을 확인

## 2. DB RPC 보상 금액 변경

아래는 `supabase/migrations/YYYYMMDDHHMMSS_update_benefit_reward_amounts.sql` 전체 파일입니다. 기존 migration 파일을 수정하지 말고 새 migration으로 추가합니다.

```sql
-- ============================================
-- Update benefit reward amounts
-- ============================================
-- Attendance base reward: 5 money
-- Quiz/prediction participation reward: 10 money
-- Attendance streak bonus remains 10 money
-- ============================================

CREATE OR REPLACE FUNCTION public.attend_and_claim_reward(
  p_user_id uuid,
  p_attendance_date date,
  p_has_watched_interstitial_for_streak_bonus boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_attendance_reward_money integer := 5;
  v_streak_bonus_reward_money integer := 10;
  v_streak_bonus_interval_days integer := 10;
  v_previous_consecutive_days integer := 0;
  v_consecutive_days integer := 1;
  v_attendance public.benefit_attendance%ROWTYPE;
  v_wallet public.benefit_wallets%ROWTYPE;
  v_base_ledger_id uuid;
  v_streak_ledger_id uuid;
  v_base_money integer := 0;
  v_streak_bonus_money integer := 0;
  v_is_streak_bonus_day boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_attendance_date IS NULL THEN
    RAISE EXCEPTION 'attendance_date_required';
  END IF;

  INSERT INTO public.benefit_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_wallet
  FROM public.benefit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  SELECT COALESCE(consecutive_days, 0)
  INTO v_previous_consecutive_days
  FROM public.benefit_attendance
  WHERE user_id = p_user_id
    AND attendance_date = p_attendance_date - 1;

  v_consecutive_days := COALESCE(v_previous_consecutive_days, 0) + 1;

  INSERT INTO public.benefit_attendance (
    user_id,
    attendance_date,
    consecutive_days,
    base_money,
    streak_bonus_money,
    streak_bonus_ad_shown
  )
  VALUES (
    p_user_id,
    p_attendance_date,
    v_consecutive_days,
    v_attendance_reward_money,
    0,
    false
  )
  ON CONFLICT (user_id, attendance_date) DO NOTHING;

  SELECT *
  INTO v_attendance
  FROM public.benefit_attendance
  WHERE user_id = p_user_id
    AND attendance_date = p_attendance_date
  FOR UPDATE;

  INSERT INTO public.benefit_ledger_entries (
    user_id,
    source,
    source_id,
    delta_money,
    money_balance_after
  )
  VALUES (
    p_user_id,
    'attendance_base',
    p_attendance_date::text,
    v_attendance_reward_money,
    v_wallet.money_balance + v_attendance_reward_money
  )
  ON CONFLICT (user_id, source, source_id) DO NOTHING
  RETURNING id INTO v_base_ledger_id;

  IF v_base_ledger_id IS NOT NULL THEN
    v_base_money := v_attendance_reward_money;

    UPDATE public.benefit_wallets
    SET
      money_balance = money_balance + v_attendance_reward_money,
      lifetime_earned_money = lifetime_earned_money + v_attendance_reward_money,
      updated_at = v_now
    WHERE user_id = p_user_id
    RETURNING * INTO v_wallet;
  END IF;

  v_is_streak_bonus_day :=
    v_attendance.consecutive_days % v_streak_bonus_interval_days = 0;

  IF
    v_is_streak_bonus_day
    AND p_has_watched_interstitial_for_streak_bonus
    AND v_attendance.streak_bonus_money = 0
  THEN
    INSERT INTO public.benefit_ledger_entries (
      user_id,
      source,
      source_id,
      delta_money,
      money_balance_after
    )
    VALUES (
      p_user_id,
      'attendance_streak_bonus',
      p_attendance_date::text,
      v_streak_bonus_reward_money,
      v_wallet.money_balance + v_streak_bonus_reward_money
    )
    ON CONFLICT (user_id, source, source_id) DO NOTHING
    RETURNING id INTO v_streak_ledger_id;

    IF v_streak_ledger_id IS NOT NULL THEN
      v_streak_bonus_money := v_streak_bonus_reward_money;

      UPDATE public.benefit_wallets
      SET
        money_balance = money_balance + v_streak_bonus_reward_money,
        lifetime_earned_money = lifetime_earned_money + v_streak_bonus_reward_money,
        updated_at = v_now
      WHERE user_id = p_user_id
      RETURNING * INTO v_wallet;

      UPDATE public.benefit_attendance
      SET
        streak_bonus_money = v_streak_bonus_reward_money,
        streak_bonus_ad_shown = true
      WHERE id = v_attendance.id
      RETURNING * INTO v_attendance;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'attendanceDate', p_attendance_date,
    'consecutiveDays', v_attendance.consecutive_days,
    'baseMoneyGranted', v_base_money,
    'streakBonusMoneyGranted', v_streak_bonus_money,
    'requiresInterstitialForBonus',
      v_is_streak_bonus_day
      AND v_attendance.streak_bonus_money = 0,
    'moneyBalance', v_wallet.money_balance,
    'lifetimeEarnedMoney', v_wallet.lifetime_earned_money
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_quiz_and_claim_reward(
  p_user_id uuid,
  p_question_id uuid,
  p_attempt_date date,
  p_attempt_sequence integer,
  p_idempotency_key text,
  p_selected_choice_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_attempt_reward_money integer := 10;
  v_daily_max_attempts integer := 5;
  v_wallet public.benefit_wallets%ROWTYPE;
  v_state public.benefit_mission_daily_states%ROWTYPE;
  v_question public.benefit_quiz_questions%ROWTYPE;
  v_attempt public.benefit_quiz_attempts%ROWTYPE;
  v_ledger_id uuid;
  v_is_correct boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_question_id IS NULL THEN
    RAISE EXCEPTION 'question_id_required';
  END IF;

  IF p_attempt_date IS NULL THEN
    RAISE EXCEPTION 'attempt_date_required';
  END IF;

  IF p_attempt_sequence NOT BETWEEN 1 AND v_daily_max_attempts THEN
    RAISE EXCEPTION 'attempt_sequence_out_of_range';
  END IF;

  IF btrim(COALESCE(p_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  IF btrim(COALESCE(p_selected_choice_id, '')) = '' THEN
    RAISE EXCEPTION 'selected_choice_id_required';
  END IF;

  INSERT INTO public.benefit_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_wallet
  FROM public.benefit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  INSERT INTO public.benefit_mission_daily_states (
    user_id,
    mission_kind,
    mission_date
  )
  VALUES (
    p_user_id,
    'stock_quiz',
    p_attempt_date
  )
  ON CONFLICT (user_id, mission_kind, mission_date) DO NOTHING;

  SELECT *
  INTO v_state
  FROM public.benefit_mission_daily_states
  WHERE user_id = p_user_id
    AND mission_kind = 'stock_quiz'
    AND mission_date = p_attempt_date
  FOR UPDATE;

  SELECT *
  INTO v_attempt
  FROM public.benefit_quiz_attempts
  WHERE user_id = p_user_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadyProcessed', true,
      'attemptId', v_attempt.id,
      'isCorrect', v_attempt.is_correct,
      'rewardMoney', v_attempt.reward_money,
      'completedAttempts', v_state.completed_attempts,
      'moneyBalance', v_wallet.money_balance
    );
  END IF;

  SELECT *
  INTO v_attempt
  FROM public.benefit_quiz_attempts
  WHERE user_id = p_user_id
    AND attempt_date = p_attempt_date
    AND attempt_sequence = p_attempt_sequence;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadyProcessed', true,
      'attemptId', v_attempt.id,
      'isCorrect', v_attempt.is_correct,
      'rewardMoney', v_attempt.reward_money,
      'completedAttempts', v_state.completed_attempts,
      'moneyBalance', v_wallet.money_balance
    );
  END IF;

  IF v_state.completed_attempts >= v_daily_max_attempts THEN
    RAISE EXCEPTION 'daily_attempt_limit_reached';
  END IF;

  IF v_state.completed_attempts >= v_state.rewarded_ad_unlocks + 1 THEN
    RAISE EXCEPTION 'no_unlocked_attempt_available';
  END IF;

  IF p_attempt_sequence <> v_state.completed_attempts + 1 THEN
    RAISE EXCEPTION 'attempt_sequence_must_match_next_attempt';
  END IF;

  SELECT *
  INTO v_question
  FROM public.benefit_quiz_questions
  WHERE id = p_question_id
    AND is_active = true
    AND review_status = 'approved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quiz_question_not_available';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_question.choices) AS choice
    WHERE choice ->> 'id' = p_selected_choice_id
  ) THEN
    RAISE EXCEPTION 'selected_choice_id_not_in_choices';
  END IF;

  v_is_correct := v_question.correct_choice_id = p_selected_choice_id;

  INSERT INTO public.benefit_quiz_attempts (
    user_id,
    question_id,
    attempt_date,
    attempt_sequence,
    idempotency_key,
    selected_choice_id,
    is_correct,
    reward_money
  )
  VALUES (
    p_user_id,
    p_question_id,
    p_attempt_date,
    p_attempt_sequence,
    p_idempotency_key,
    p_selected_choice_id,
    v_is_correct,
    v_attempt_reward_money
  )
  RETURNING * INTO v_attempt;

  INSERT INTO public.benefit_ledger_entries (
    user_id,
    source,
    source_id,
    delta_money,
    money_balance_after
  )
  VALUES (
    p_user_id,
    'stock_quiz_attempt',
    v_attempt.id::text,
    v_attempt_reward_money,
    v_wallet.money_balance + v_attempt_reward_money
  )
  ON CONFLICT (user_id, source, source_id) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NOT NULL THEN
    UPDATE public.benefit_wallets
    SET
      money_balance = money_balance + v_attempt_reward_money,
      lifetime_earned_money = lifetime_earned_money + v_attempt_reward_money,
      updated_at = v_now
    WHERE user_id = p_user_id
    RETURNING * INTO v_wallet;
  END IF;

  UPDATE public.benefit_mission_daily_states
  SET
    completed_attempts = completed_attempts + 1,
    updated_at = v_now
  WHERE user_id = p_user_id
    AND mission_kind = 'stock_quiz'
    AND mission_date = p_attempt_date
  RETURNING * INTO v_state;

  UPDATE public.benefit_quiz_questions
  SET
    total_attempts = total_attempts + 1,
    correct_attempts = correct_attempts + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
    updated_at = v_now
  WHERE id = p_question_id;

  RETURN jsonb_build_object(
    'alreadyProcessed', false,
    'attemptId', v_attempt.id,
    'isCorrect', v_is_correct,
    'rewardMoney', v_attempt_reward_money,
    'completedAttempts', v_state.completed_attempts,
    'moneyBalance', v_wallet.money_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_prediction_and_claim_reward(
  p_user_id uuid,
  p_question_id uuid,
  p_attempt_date date,
  p_attempt_sequence integer,
  p_idempotency_key text,
  p_selected_direction text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_attempt_reward_money integer := 10;
  v_daily_max_attempts integer := 5;
  v_wallet public.benefit_wallets%ROWTYPE;
  v_state public.benefit_mission_daily_states%ROWTYPE;
  v_question public.benefit_prediction_questions%ROWTYPE;
  v_attempt public.benefit_prediction_attempts%ROWTYPE;
  v_ledger_id uuid;
  v_is_correct boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_question_id IS NULL THEN
    RAISE EXCEPTION 'question_id_required';
  END IF;

  IF p_attempt_date IS NULL THEN
    RAISE EXCEPTION 'attempt_date_required';
  END IF;

  IF p_attempt_sequence NOT BETWEEN 1 AND v_daily_max_attempts THEN
    RAISE EXCEPTION 'attempt_sequence_out_of_range';
  END IF;

  IF btrim(COALESCE(p_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;

  IF p_selected_direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'invalid_selected_direction';
  END IF;

  INSERT INTO public.benefit_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_wallet
  FROM public.benefit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  INSERT INTO public.benefit_mission_daily_states (
    user_id,
    mission_kind,
    mission_date
  )
  VALUES (
    p_user_id,
    'price_prediction',
    p_attempt_date
  )
  ON CONFLICT (user_id, mission_kind, mission_date) DO NOTHING;

  SELECT *
  INTO v_state
  FROM public.benefit_mission_daily_states
  WHERE user_id = p_user_id
    AND mission_kind = 'price_prediction'
    AND mission_date = p_attempt_date
  FOR UPDATE;

  SELECT *
  INTO v_attempt
  FROM public.benefit_prediction_attempts
  WHERE user_id = p_user_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadyProcessed', true,
      'attemptId', v_attempt.id,
      'isCorrect', v_attempt.is_correct,
      'rewardMoney', v_attempt.reward_money,
      'completedAttempts', v_state.completed_attempts,
      'moneyBalance', v_wallet.money_balance
    );
  END IF;

  SELECT *
  INTO v_attempt
  FROM public.benefit_prediction_attempts
  WHERE user_id = p_user_id
    AND attempt_date = p_attempt_date
    AND attempt_sequence = p_attempt_sequence;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadyProcessed', true,
      'attemptId', v_attempt.id,
      'isCorrect', v_attempt.is_correct,
      'rewardMoney', v_attempt.reward_money,
      'completedAttempts', v_state.completed_attempts,
      'moneyBalance', v_wallet.money_balance
    );
  END IF;

  IF v_state.completed_attempts >= v_daily_max_attempts THEN
    RAISE EXCEPTION 'daily_attempt_limit_reached';
  END IF;

  IF v_state.completed_attempts >= v_state.rewarded_ad_unlocks + 1 THEN
    RAISE EXCEPTION 'no_unlocked_attempt_available';
  END IF;

  IF p_attempt_sequence <> v_state.completed_attempts + 1 THEN
    RAISE EXCEPTION 'attempt_sequence_must_match_next_attempt';
  END IF;

  SELECT *
  INTO v_question
  FROM public.benefit_prediction_questions
  WHERE id = p_question_id
    AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prediction_question_not_available';
  END IF;

  IF v_question.result_close IS NULL THEN
    v_is_correct := NULL;
  ELSIF v_question.result_close > v_question.base_close THEN
    v_is_correct := p_selected_direction = 'up';
  ELSIF v_question.result_close < v_question.base_close THEN
    v_is_correct := p_selected_direction = 'down';
  ELSE
    v_is_correct := false;
  END IF;

  INSERT INTO public.benefit_prediction_attempts (
    user_id,
    question_id,
    attempt_date,
    attempt_sequence,
    idempotency_key,
    selected_direction,
    is_correct,
    reward_money
  )
  VALUES (
    p_user_id,
    p_question_id,
    p_attempt_date,
    p_attempt_sequence,
    p_idempotency_key,
    p_selected_direction,
    v_is_correct,
    v_attempt_reward_money
  )
  RETURNING * INTO v_attempt;

  INSERT INTO public.benefit_ledger_entries (
    user_id,
    source,
    source_id,
    delta_money,
    money_balance_after
  )
  VALUES (
    p_user_id,
    'price_prediction_attempt',
    v_attempt.id::text,
    v_attempt_reward_money,
    v_wallet.money_balance + v_attempt_reward_money
  )
  ON CONFLICT (user_id, source, source_id) DO NOTHING
  RETURNING id INTO v_ledger_id;

  IF v_ledger_id IS NOT NULL THEN
    UPDATE public.benefit_wallets
    SET
      money_balance = money_balance + v_attempt_reward_money,
      lifetime_earned_money = lifetime_earned_money + v_attempt_reward_money,
      updated_at = v_now
    WHERE user_id = p_user_id
    RETURNING * INTO v_wallet;
  END IF;

  UPDATE public.benefit_mission_daily_states
  SET
    completed_attempts = completed_attempts + 1,
    updated_at = v_now
  WHERE user_id = p_user_id
    AND mission_kind = 'price_prediction'
    AND mission_date = p_attempt_date
  RETURNING * INTO v_state;

  RETURN jsonb_build_object(
    'alreadyProcessed', false,
    'attemptId', v_attempt.id,
    'isCorrect', v_is_correct,
    'rewardMoney', v_attempt_reward_money,
    'completedAttempts', v_state.completed_attempts,
    'moneyBalance', v_wallet.money_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attend_and_claim_reward(uuid, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_quiz_and_claim_reward(uuid, uuid, date, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_prediction_and_claim_reward(uuid, uuid, date, integer, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.attend_and_claim_reward(uuid, date, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_quiz_and_claim_reward(uuid, uuid, date, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_prediction_and_claim_reward(uuid, uuid, date, integer, text, text) TO service_role;
```

### 2-4. DB smoke test

적용 후 테스트 계정으로 각 RPC를 1회씩 실행해 반환값과 지갑을 확인합니다.

```sql
SELECT
  money_balance,
  lifetime_earned_money,
  updated_at
FROM public.benefit_wallets
WHERE user_id = '<TEST_USER_ID>'::uuid;
```

```sql
SELECT
  source,
  delta_money,
  money_balance_after,
  created_at
FROM public.benefit_ledger_entries
WHERE user_id = '<TEST_USER_ID>'::uuid
ORDER BY created_at DESC
LIMIT 10;
```

## 3. 프론트 보상 정책 상수

대상 파일:

```text
services/benefits/benefitRewardPolicy.ts
```

기존 상수를 아래 값으로 맞춥니다.

```ts
export const FIXED_ATTEMPT_REWARD_MONEY = 10;
export const ATTENDANCE_REWARD_MONEY = 5;
export const ATTENDANCE_STREAK_BONUS_MONEY = 10;
```

## 4. i18n 메시지 1:1 교체

대상 파일:

```text
constants/messages/benefitMessages.ts
```

아래는 파일 전체 교체본입니다. 모든 기존 필드와 신규 보상 라벨 필드를 함께 포함합니다.

```ts
import type { AppLang } from '@/types';

export interface BenefitWalletBoardItemCopy {
  readonly id: 'balance' | 'lifetime' | 'redeemable' | 'pending';
  readonly label: string;
  readonly value: string;
}

export interface BenefitMessages {
  readonly navLabel: string;
  readonly pageTitle: string;
  readonly pageSubtitle: string;
  readonly actionLoadingLabel: string;
  readonly retryCta: string;
  readonly moneyUnit: string;
  readonly tossPointUnit: string;
  readonly walletTitle: string;
  readonly walletSubtitle: string;
  readonly walletSkeletonLabel: string;
  readonly walletItems: readonly BenefitWalletBoardItemCopy[];
  readonly guestLockedStatus: string;
  readonly guestNoticeMessage: string;
  readonly summaryLoadError: string;
  readonly authRequiredMessage: string;
  readonly networkErrorMessage: string;
  readonly genericActionError: string;
  readonly attendanceTitle: string;
  readonly attendanceRewardLabel: string;
  readonly attendanceSubtitle: string;
  readonly attendanceCta: string;
  readonly attendanceStatus: string;
  readonly attendanceReadyStatus: string;
  readonly attendanceCompletedStatus: string;
  readonly attendanceSuccessMessage: string;
  readonly attendanceStreakSuccessMessage: string;
  readonly predictionTitle: string;
  readonly predictionRewardLabel: string;
  readonly predictionSubtitle: string;
  readonly predictionCta: string;
  readonly predictionStatus: string;
  readonly predictionReadyStatus: string;
  readonly predictionUnavailableStatus: string;
  readonly predictionCompletedStatus: string;
  readonly predictionQuestionLoadCta: string;
  readonly predictionUnlockCta: string;
  readonly predictionUpCta: string;
  readonly predictionDownCta: string;
  readonly predictionBasePriceLabel: string;
  readonly predictionNoQuestionMessage: string;
  readonly predictionSubmitSuccessMessage: string;
  readonly predictionPendingResultMessage: string;
  readonly predictionLastAccuracyLabel: string;
  readonly predictionLastAccuracyEmptyLabel: string;
  readonly quizTitle: string;
  readonly quizRewardLabel: string;
  readonly quizSubtitle: string;
  readonly quizCta: string;
  readonly quizStatus: string;
  readonly quizReadyStatus: string;
  readonly quizUnavailableStatus: string;
  readonly quizCompletedStatus: string;
  readonly quizQuestionLoadCta: string;
  readonly quizUnlockCta: string;
  readonly quizChoiceAriaPrefix: string;
  readonly quizNoQuestionMessage: string;
  readonly quizCorrectMessage: string;
  readonly quizIncorrectMessage: string;
  readonly tossPointTitle: string;
  readonly tossPointSubtitle: string;
  readonly tossPointCta: string;
  readonly tossPointStatus: string;
  readonly tossPointReadyStatus: string;
  readonly tossPointPendingStatus: string;
  readonly tossPointNotEnoughMessage: string;
  readonly tossPointPendingMessage: string;
  readonly tossPointMockPendingMessage: string;
  readonly tossPointSuccessMessage: string;
  readonly tossPointPreparingMessage: string;
  readonly tossPointUnavailableMessage: string;
  readonly tossPointBudgetRetryMessage: string;
  readonly tossPointKeyRetryMessage: string;
  readonly tossPointResultMissingMessage: string;
  readonly tossPointRequestLimitMessage: string;
  readonly tossPointRestoreCompletedMessage: string;
  readonly missionNotUnlockedMessage: string;
  readonly missionQuestionUnavailableMessage: string;
  readonly missionInvalidAttemptMessage: string;
  readonly benefitApiSetupMessage: string;
  readonly benefitApiRouteMissingMessage: string;
  readonly benefitServerErrorMessage: string;
  readonly rewardAdNotCompletedMessage: string;
  readonly rewardAdUnlockSuccessMessage: string;
  readonly attemptLimitReachedMessage: string;
  readonly unlockLimitReachedMessage: string;
  readonly apiPendingNotice: string;
}

export const BENEFIT_MESSAGES: Record<AppLang, BenefitMessages> = {
  ko: {
    navLabel: '혜택',
    pageTitle: '혜택',
    pageSubtitle: '출석, 예측, 퀴즈로 머니를 모으고 토스 포인트 받기를 준비합니다.',
    actionLoadingLabel: '처리 중',
    retryCta: '다시 시도',
    moneyUnit: '머니',
    tossPointUnit: 'P',
    walletTitle: '내 혜택 지갑',
    walletSubtitle: '미션 보상과 토스 포인트 지급 대기 상태를 실시간으로 동기화합니다.',
    walletSkeletonLabel: '혜택 지갑 정보를 불러오는 중',
    walletItems: [
      { id: 'balance', label: '현재 머니', value: '0머니' },
      { id: 'lifetime', label: '누적 적립', value: '0머니' },
      { id: 'redeemable', label: '받을 수 있는 토스 포인트', value: '0P' },
      { id: 'pending', label: '처리 중인 포인트', value: '0P' },
    ],
    guestLockedStatus: '로그인 후 이용 가능',
    guestNoticeMessage: '로그인하면 출석, 예측, 퀴즈와 토스 포인트 받기를 이용할 수 있습니다.',
    summaryLoadError: '혜택 지갑 정보를 불러오지 못했습니다.',
    authRequiredMessage: '로그인 세션을 확인한 뒤 다시 시도해 주세요.',
    networkErrorMessage: '네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
    genericActionError: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    attendanceTitle: '출석체크',
    attendanceRewardLabel: '참여 보상 5머니',
    attendanceSubtitle: '하루 한 번 출석하고 연속 출석 보너스를 준비합니다.',
    attendanceCta: '출석체크하기',
    attendanceStatus: '상태 확인 중',
    attendanceReadyStatus: '오늘 출석 가능',
    attendanceCompletedStatus: '오늘 출석 완료',
    attendanceSuccessMessage: '출석 보상이 지갑에 반영되었습니다.',
    attendanceStreakSuccessMessage: '출석 보상과 연속 출석 보너스가 지갑에 반영되었습니다.',
    predictionTitle: '주식 가격 예측',
    predictionRewardLabel: '참여 보상 10머니',
    predictionSubtitle: '서비스 지원 종목의 다음 영업일 종가 상승/하락을 예측합니다.',
    predictionCta: '예측 문제 보기',
    predictionStatus: '상태 확인 중',
    predictionReadyStatus: '예측 참여 가능',
    predictionUnavailableStatus: '예측 준비 중',
    predictionCompletedStatus: '오늘 예측 완료',
    predictionQuestionLoadCta: '예측 문제 새로고침',
    predictionUnlockCta: '광고 보고 추가 예측',
    predictionUpCta: '상승',
    predictionDownCta: '하락',
    predictionBasePriceLabel: '기준가',
    predictionNoQuestionMessage: '지금 참여 가능한 예측 문제가 없습니다.',
    predictionSubmitSuccessMessage: '예측 보상이 지갑에 반영되었습니다.',
    predictionPendingResultMessage: '예측 참여 보상이 지갑에 반영되었습니다. 정답 판정은 정산 시 확정됩니다.',
    predictionLastAccuracyLabel: '직전 정답률',
    predictionLastAccuracyEmptyLabel: '직전 정답률 없음',
    quizTitle: '주식 상식 퀴즈',
    quizRewardLabel: '참여 보상 10머니',
    quizSubtitle: '쉬운 주식·ETF·경제 상식 문제를 풉니다.',
    quizCta: '퀴즈 시작하기',
    quizStatus: '상태 확인 중',
    quizReadyStatus: '퀴즈 참여 가능',
    quizUnavailableStatus: '퀴즈 준비 중',
    quizCompletedStatus: '오늘 퀴즈 완료',
    quizQuestionLoadCta: '퀴즈 문제 새로고침',
    quizUnlockCta: '광고 보고 추가 퀴즈',
    quizChoiceAriaPrefix: '퀴즈 선택지',
    quizNoQuestionMessage: '지금 풀 수 있는 퀴즈 문제가 없습니다.',
    quizCorrectMessage: '정답입니다. 퀴즈 보상이 지갑에 반영되었습니다.',
    quizIncorrectMessage: '참여 보상이 지갑에 반영되었습니다.',
    tossPointTitle: '토스 포인트 받기',
    tossPointSubtitle: '1,000머니 단위로 토스 포인트 지급 요청을 준비합니다.',
    tossPointCta: '토스 포인트 받기',
    tossPointStatus: '상태 확인 중',
    tossPointReadyStatus: '지급 요청 가능',
    tossPointPendingStatus: '지급 대기 중',
    tossPointNotEnoughMessage: '토스 포인트를 받으려면 1,000머니 이상이 필요합니다.',
    tossPointPendingMessage: '이미 지급 대기 중인 토스 포인트가 있습니다.',
    tossPointMockPendingMessage: '토스 포인트 지급 요청이 대기 상태로 생성되었습니다.',
    tossPointSuccessMessage: '토스 포인트 지급 요청이 완료되었습니다.',
    tossPointPreparingMessage: '토스 포인트 혜택 준비가 아직 완료되지 않았습니다.',
    tossPointUnavailableMessage: '현재 받을 수 없는 토스 포인트 혜택입니다.',
    tossPointBudgetRetryMessage: '프로모션 예산 확인 후 다시 받을 수 있습니다.',
    tossPointKeyRetryMessage: '지급 키를 다시 확인하고 있습니다. 잠시 후 다시 시도해 주세요.',
    tossPointResultMissingMessage: '지급 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    tossPointRequestLimitMessage: '1회 최대 5,000P까지만 받을 수 있습니다.',
    tossPointRestoreCompletedMessage: '토스 포인트 지급이 실패해 차감된 머니를 복구했습니다.',
    missionNotUnlockedMessage: '광고 시청으로 추가 문제를 먼저 해금해 주세요.',
    missionQuestionUnavailableMessage: '지금은 참여 가능한 문제가 없습니다. 잠시 후 다시 확인해 주세요.',
    missionInvalidAttemptMessage: '미션 상태가 바뀌었습니다. 새로고침 후 다시 시도해 주세요.',
    benefitApiSetupMessage: '혜택 API 설정을 확인한 뒤 다시 시도해 주세요.',
    benefitApiRouteMissingMessage: '혜택 API 경로를 찾지 못했습니다. 앱을 새로고침해 주세요.',
    benefitServerErrorMessage: '혜택 서버가 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    rewardAdNotCompletedMessage: '광고 시청이 완료되지 않아 추가 문제가 해금되지 않았습니다.',
    rewardAdUnlockSuccessMessage: '추가 문제가 해금되었습니다.',
    attemptLimitReachedMessage: '오늘 참여 가능한 횟수를 모두 사용했습니다.',
    unlockLimitReachedMessage: '오늘 광고 해금 가능 횟수를 모두 사용했습니다.',
    apiPendingNotice:
      '혜택 API와 연결되었습니다. 문제가 보이지 않으면 잠시 후 다시 시도해 주세요.',
  },
  en: {
    navLabel: 'Benefits',
    pageTitle: 'Benefits',
    pageSubtitle: 'Collect money through attendance, predictions, and quizzes.',
    actionLoadingLabel: 'Processing',
    retryCta: 'Retry',
    moneyUnit: 'money',
    tossPointUnit: 'P',
    walletTitle: 'Benefit Wallet',
    walletSubtitle: 'Mission rewards and pending Toss Point payouts stay in sync.',
    walletSkeletonLabel: 'Loading benefit wallet',
    walletItems: [
      { id: 'balance', label: 'Current Money', value: '0 money' },
      { id: 'lifetime', label: 'Lifetime Earned', value: '0 money' },
      { id: 'redeemable', label: 'Redeemable Toss Points', value: '0P' },
      { id: 'pending', label: 'Processing Points', value: '0P' },
    ],
    guestLockedStatus: 'Available after login',
    guestNoticeMessage: 'Log in to use attendance, predictions, quizzes, and Toss Point redemption.',
    summaryLoadError: 'Could not load your benefit wallet.',
    authRequiredMessage: 'Please check your login session and try again.',
    networkErrorMessage: 'Please check your network connection and try again.',
    genericActionError: 'We could not process the request. Please try again later.',
    attendanceTitle: 'Attendance',
    attendanceRewardLabel: 'Participation reward 5 money',
    attendanceSubtitle: 'Check in once a day and prepare streak bonuses.',
    attendanceCta: 'Check In',
    attendanceStatus: 'Checking status',
    attendanceReadyStatus: 'Ready today',
    attendanceCompletedStatus: 'Checked in today',
    attendanceSuccessMessage: 'Attendance reward has been added to your wallet.',
    attendanceStreakSuccessMessage: 'Attendance and streak bonus rewards have been added to your wallet.',
    predictionTitle: 'Stock Price Prediction',
    predictionRewardLabel: 'Participation reward 10 money',
    predictionSubtitle: 'Predict whether a supported symbol closes up or down on the next trading day.',
    predictionCta: 'View Prediction',
    predictionStatus: 'Checking status',
    predictionReadyStatus: 'Prediction ready',
    predictionUnavailableStatus: 'Prediction pending',
    predictionCompletedStatus: 'Prediction complete today',
    predictionQuestionLoadCta: 'Refresh Prediction',
    predictionUnlockCta: 'Watch Ad for More',
    predictionUpCta: 'Up',
    predictionDownCta: 'Down',
    predictionBasePriceLabel: 'Base price',
    predictionNoQuestionMessage: 'No prediction is available to join right now.',
    predictionSubmitSuccessMessage: 'Prediction reward has been added to your wallet.',
    predictionPendingResultMessage: 'Participation reward has been added. The final result will be settled later.',
    predictionLastAccuracyLabel: 'Last accuracy',
    predictionLastAccuracyEmptyLabel: 'No settled accuracy yet',
    quizTitle: 'Stock Basics Quiz',
    quizRewardLabel: 'Participation reward 10 money',
    quizSubtitle: 'Answer easy stock, ETF, and economy basics questions.',
    quizCta: 'Start Quiz',
    quizStatus: 'Checking status',
    quizReadyStatus: 'Quiz ready',
    quizUnavailableStatus: 'Quiz pending',
    quizCompletedStatus: 'Quiz complete today',
    quizQuestionLoadCta: 'Refresh Quiz',
    quizUnlockCta: 'Watch Ad for More',
    quizChoiceAriaPrefix: 'Quiz choice',
    quizNoQuestionMessage: 'No quiz is available right now.',
    quizCorrectMessage: 'Correct. The quiz reward has been added to your wallet.',
    quizIncorrectMessage: 'Participation reward has been added to your wallet.',
    tossPointTitle: 'Receive Toss Points',
    tossPointSubtitle: 'Prepare requests in 1,000 money bundles.',
    tossPointCta: 'Receive Toss Points',
    tossPointStatus: 'Checking status',
    tossPointReadyStatus: 'Ready to request',
    tossPointPendingStatus: 'Payout pending',
    tossPointNotEnoughMessage: 'You need at least 1,000 money to receive Toss Points.',
    tossPointPendingMessage: 'You already have Toss Points pending payout.',
    tossPointMockPendingMessage: 'Your Toss Point payout request is pending.',
    tossPointSuccessMessage: 'Your Toss Point payout request has been completed.',
    tossPointPreparingMessage: 'This Toss Point benefit is not ready yet.',
    tossPointUnavailableMessage: 'This Toss Point benefit is not available right now.',
    tossPointBudgetRetryMessage: 'You can try again after the promotion budget is checked.',
    tossPointKeyRetryMessage: 'We are checking the payout key. Please try again shortly.',
    tossPointResultMissingMessage: 'We could not verify the payout result. Please try again shortly.',
    tossPointRequestLimitMessage: 'You can receive up to 5,000P per request.',
    tossPointRestoreCompletedMessage: 'The Toss Point payout failed, so your money was restored.',
    missionNotUnlockedMessage: 'Please unlock an extra question by watching an ad first.',
    missionQuestionUnavailableMessage: 'No mission question is available right now. Please check again later.',
    missionInvalidAttemptMessage: 'Mission status has changed. Please refresh and try again.',
    benefitApiSetupMessage: 'Please check the Benefits API setup and try again.',
    benefitApiRouteMissingMessage: 'The Benefits API route was not found. Please refresh the app.',
    benefitServerErrorMessage: 'The Benefits server could not process the request. Please try again later.',
    rewardAdNotCompletedMessage: 'The ad was not completed, so the extra question was not unlocked.',
    rewardAdUnlockSuccessMessage: 'An extra question has been unlocked.',
    attemptLimitReachedMessage: 'You have used all attempts available today.',
    unlockLimitReachedMessage: 'You have used all ad unlocks available today.',
    apiPendingNotice:
      'Benefits API is connected. If no question appears, please try again shortly.',
  },
} as const;

export function getBenefitMessages(lang: AppLang): BenefitMessages {
  return BENEFIT_MESSAGES[lang];
}
```

## 5. `BenefitQuestCard` 1:1 교체

대상 파일:

```text
components/benefits/BenefitQuestCard.tsx
```

아래는 파일 전체 교체본입니다. 기존 단독 `<h3>`는 제거되고, 제목과 보상 라벨을 같은 제목 영역에서 렌더링합니다.

```tsx
import React from 'react';
import { ArrowRight } from 'lucide-react';

interface BenefitQuestCardProps {
  readonly title: string;
  readonly subtitle: string;
  readonly ctaLabel?: string;
  readonly loadingLabel: string;
  readonly statusLabel: string;
  readonly icon: React.ReactNode;
  readonly accentClassName: string;
  readonly metaLabel?: string;
  readonly rewardLabel?: string;
  readonly isCtaLoading?: boolean;
  readonly isCtaDisabled?: boolean;
  readonly children?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly onCtaClick?: () => void;
}

export function BenefitQuestCard({
  title,
  subtitle,
  ctaLabel,
  loadingLabel,
  statusLabel,
  icon,
  accentClassName,
  metaLabel,
  rewardLabel,
  isCtaLoading = false,
  isCtaDisabled = false,
  children,
  actions,
  onCtaClick,
}: BenefitQuestCardProps): React.ReactElement {
  const shouldRenderDefaultAction = ctaLabel != null;
  const shouldDisableCta = isCtaDisabled || isCtaLoading || onCtaClick == null;
  const ctaClassName = shouldDisableCta
    ? 'bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500'
    : 'bg-slate-950 text-white shadow-lg shadow-slate-950/10 hover:-translate-y-0.5 dark:bg-white dark:text-slate-950';
  const resolvedCtaLabel = isCtaLoading ? loadingLabel : ctaLabel;

  return (
    <article className="group rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/50 transition-all hover:-translate-y-0.5 hover:shadow-xl dark:border-white/10 dark:bg-[#080B15] dark:shadow-black/20">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className={`rounded-2xl p-3 text-white shadow-lg ${accentClassName}`}>
          {icon}
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-white/5 dark:text-slate-400">
          {statusLabel}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
          {title}
        </h3>
        {rewardLabel != null && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
            {rewardLabel}
          </span>
        )}
      </div>
      {metaLabel != null && (
        <p className="mt-1 text-xs font-black text-blue-500 dark:text-blue-300">
          {metaLabel}
        </p>
      )}
      <p className="mt-2 min-h-[48px] text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
        {subtitle}
      </p>
      {children}
      {actions}
      {shouldRenderDefaultAction && (
        <button
          type="button"
          onClick={onCtaClick}
          disabled={shouldDisableCta}
          className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition-all ${ctaClassName}`}
        >
          {resolvedCtaLabel}
          <ArrowRight size={16} aria-hidden />
        </button>
      )}
    </article>
  );
}
```

## 6. 카드별 보상 라벨 1:1 교체

### 6-1. 출석 카드 전체 교체

대상 파일:

```text
components/benefits/AttendanceQuestCard.tsx
```

```tsx
import React from 'react';
import { CalendarCheck } from 'lucide-react';
import type { BenefitMessages } from '@/constants/messages/benefitMessages';
import { getResolvedHistoryBannerAdGroupId } from '@/services/ads/adPlacements';
import { TossInlineBanner } from '../TossInlineBanner';
import { BenefitQuestCard } from './BenefitQuestCard';

interface AttendanceQuestCardProps {
  readonly copy: BenefitMessages;
  readonly statusLabel: string;
  readonly isLoading: boolean;
  readonly isDisabled: boolean;
  readonly shouldShowBannerAd: boolean;
  readonly isInTossApp: boolean;
  readonly onCheckIn: () => void;
}

export function AttendanceQuestCard({
  copy,
  statusLabel,
  isLoading,
  isDisabled,
  shouldShowBannerAd,
  isInTossApp,
  onCheckIn,
}: AttendanceQuestCardProps): React.ReactElement {
  const attendanceBannerAdGroupId = getResolvedHistoryBannerAdGroupId();
  const shouldRenderBannerAd =
    shouldShowBannerAd &&
    isInTossApp &&
    attendanceBannerAdGroupId.trim() !== '';

  return (
    <BenefitQuestCard
      title={copy.attendanceTitle}
      subtitle={copy.attendanceSubtitle}
      rewardLabel={copy.attendanceRewardLabel}
      ctaLabel={copy.attendanceCta}
      loadingLabel={copy.actionLoadingLabel}
      statusLabel={statusLabel}
      icon={<CalendarCheck size={24} aria-hidden />}
      accentClassName="bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20"
      isCtaLoading={isLoading}
      isCtaDisabled={isDisabled}
      onCtaClick={onCheckIn}
    >
      {shouldRenderBannerAd ? (
        <TossInlineBanner
          adGroupId={attendanceBannerAdGroupId}
          shouldShowAd
          isInTossApp
          containerClassName="h-[96px] min-h-[96px]"
          variant="card"
        />
      ) : null}
    </BenefitQuestCard>
  );
}
```

### 6-2. 예측 카드 전체 교체

대상 파일:

```text
components/benefits/PredictionQuestCard.tsx
```

```tsx
import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { BenefitMessages } from '@/constants/messages/benefitMessages';
import type {
  BenefitPredictionQuestionResponse,
  PredictionDirection,
} from '@/services/benefits/benefitQuestClient';
import type { AppLang } from '@/types';
import { BenefitQuestCard } from './BenefitQuestCard';

const BASE_PRICE_MAX_FRACTION_DIGITS = 2;
const PREDICTION_LOCALE_BY_LANG: Record<AppLang, string> = {
  ko: 'ko-KR',
  en: 'en-US',
} as const;

interface PredictionQuestCardProps {
  readonly copy: BenefitMessages;
  readonly lang: AppLang;
  readonly statusLabel: string;
  readonly lastAccuracyLabel: string;
  readonly questionResponse: BenefitPredictionQuestionResponse | null;
  readonly isLoading: boolean;
  readonly isBusy: boolean;
  readonly isDisabled: boolean;
  readonly canUnlockWithAd: boolean;
  readonly onRefreshQuestion: () => void;
  readonly onSelectDirection: (direction: PredictionDirection) => void;
  readonly onUnlockWithAd: () => void;
}

export function PredictionQuestCard({
  copy,
  lang,
  statusLabel,
  lastAccuracyLabel,
  questionResponse,
  isLoading,
  isBusy,
  isDisabled,
  canUnlockWithAd,
  onRefreshQuestion,
  onSelectDirection,
  onUnlockWithAd,
}: PredictionQuestCardProps): React.ReactElement {
  const question = questionResponse?.question ?? null;
  const hasSubmittableQuestion =
    question != null && questionResponse?.attemptSequence != null;
  const primaryCtaLabel = canUnlockWithAd
    ? copy.predictionUnlockCta
    : copy.predictionQuestionLoadCta;
  const handlePrimaryClick = canUnlockWithAd ? onUnlockWithAd : onRefreshQuestion;
  const shouldDisablePrimary = isBusy || isLoading || isDisabled;
  const unavailableMessage =
    questionResponse?.reason === 'no_unlocked_attempt_available'
      ? copy.missionNotUnlockedMessage
      : copy.predictionNoQuestionMessage;
  const basePriceText =
    question == null
      ? ''
      : question.baseClose.toLocaleString(PREDICTION_LOCALE_BY_LANG[lang], {
          maximumFractionDigits: BASE_PRICE_MAX_FRACTION_DIGITS,
        });

  return (
    <BenefitQuestCard
      title={copy.predictionTitle}
      subtitle={copy.predictionSubtitle}
      rewardLabel={copy.predictionRewardLabel}
      metaLabel={lastAccuracyLabel}
      ctaLabel={hasSubmittableQuestion ? undefined : primaryCtaLabel}
      loadingLabel={copy.actionLoadingLabel}
      statusLabel={statusLabel}
      icon={<TrendingUp size={24} aria-hidden />}
      accentClassName="bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/20"
      isCtaLoading={isLoading || isBusy}
      isCtaDisabled={shouldDisablePrimary}
      onCtaClick={handlePrimaryClick}
      actions={
        hasSubmittableQuestion ? (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSelectDirection('up')}
              disabled={isBusy || isDisabled}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copy.predictionUpCta}
            </button>
            <button
              type="button"
              onClick={() => onSelectDirection('down')}
              disabled={isBusy || isDisabled}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950"
            >
              {copy.predictionDownCta}
            </button>
          </div>
        ) : null
      }
    >
      {question == null ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
          {unavailableMessage}
        </p>
      ) : (
        <div className="mt-4 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-100 dark:bg-blue-400/10 dark:ring-blue-400/20">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-500">
            {question.symbol}
          </p>
          <p className="mt-2 text-sm font-black leading-6 text-slate-900 dark:text-white">
            {copy.predictionBasePriceLabel}: {basePriceText}
          </p>
        </div>
      )}
    </BenefitQuestCard>
  );
}
```

### 6-3. 퀴즈 카드 전체 교체

대상 파일:

```text
components/benefits/StockQuizQuestCard.tsx
```

```tsx
import React from 'react';
import { Brain } from 'lucide-react';
import type { BenefitMessages } from '@/constants/messages/benefitMessages';
import type { BenefitQuizQuestionResponse } from '@/services/benefits/benefitQuestClient';
import { BenefitQuestCard } from './BenefitQuestCard';

interface StockQuizQuestCardProps {
  readonly copy: BenefitMessages;
  readonly statusLabel: string;
  readonly questionResponse: BenefitQuizQuestionResponse | null;
  readonly isLoading: boolean;
  readonly isBusy: boolean;
  readonly isDisabled: boolean;
  readonly canUnlockWithAd: boolean;
  readonly onRefreshQuestion: () => void;
  readonly onSelectChoice: (choiceId: string) => void;
  readonly onUnlockWithAd: () => void;
}

export function StockQuizQuestCard({
  copy,
  statusLabel,
  questionResponse,
  isLoading,
  isBusy,
  isDisabled,
  canUnlockWithAd,
  onRefreshQuestion,
  onSelectChoice,
  onUnlockWithAd,
}: StockQuizQuestCardProps): React.ReactElement {
  const question = questionResponse?.question ?? null;
  const hasSubmittableQuestion =
    question != null && questionResponse?.attemptSequence != null;
  const primaryCtaLabel = canUnlockWithAd
    ? copy.quizUnlockCta
    : copy.quizQuestionLoadCta;
  const handlePrimaryClick = canUnlockWithAd ? onUnlockWithAd : onRefreshQuestion;
  const shouldDisablePrimary = isBusy || isLoading || isDisabled;
  const unavailableMessage =
    questionResponse?.reason === 'no_unlocked_attempt_available'
      ? copy.missionNotUnlockedMessage
      : copy.quizNoQuestionMessage;

  return (
    <BenefitQuestCard
      title={copy.quizTitle}
      subtitle={copy.quizSubtitle}
      rewardLabel={copy.quizRewardLabel}
      ctaLabel={hasSubmittableQuestion ? undefined : primaryCtaLabel}
      loadingLabel={copy.actionLoadingLabel}
      statusLabel={statusLabel}
      icon={<Brain size={24} aria-hidden />}
      accentClassName="bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-violet-500/20"
      isCtaLoading={isLoading || isBusy}
      isCtaDisabled={shouldDisablePrimary}
      onCtaClick={handlePrimaryClick}
      actions={
        hasSubmittableQuestion ? (
          <div className="mt-5 grid grid-cols-1 gap-2">
            {question.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => onSelectChoice(choice.id)}
                disabled={isBusy || isDisabled}
                aria-label={`${copy.quizChoiceAriaPrefix} ${choice.label}`}
                className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-left text-sm font-black text-violet-700 transition hover:-translate-y-0.5 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-100"
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : null
      }
    >
      {question == null ? (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-500 dark:bg-white/[0.03] dark:text-slate-400">
          {unavailableMessage}
        </p>
      ) : (
        <div className="mt-4 rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-100 dark:bg-violet-400/10 dark:ring-violet-400/20">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-500">
            {question.category}
          </p>
          <p className="mt-2 text-sm font-black leading-6 text-slate-900 dark:text-white">
            {question.question}
          </p>
        </div>
      )}
    </BenefitQuestCard>
  );
}
```

## 7. 하단 피드형 배너 광고 ID 추가

대상 파일:

```text
services/ads/adPlacements.ts
```

아래는 파일 전체 교체본입니다. 승인된 하단 피드형 배너 라이브 ID `ait.v2.live.a13a724ed4f94512`를 직접 사용하며, 테스트 광고 ID나 QA 전용 환경 변수 분기는 추가하지 않습니다.

```ts
import { isViteProdBuild } from '@/utils/viteImportMetaEnv';

/**
 * 광고 플레이스먼트 ID 단일 소스.
 * 콘솔에서 발급한 광고 그룹 ID를 사용합니다. 변경 시 이 파일만 수정하면 됩니다.
 */
export const INTERSTITIAL_LIVE_AD_GROUP_ID = 'ait.v2.live.3f570e10ec374139';
export const MARKET_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.b1d77d31f3b14d57';
export const HISTORY_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.59f9f0b02a5b4114';
export const BENEFIT_FEED_BANNER_LIVE_AD_GROUP_ID = 'ait.v2.live.a13a724ed4f94512';
export const REWARD_UNLOCK_AI_AD_GROUP_ID = 'ait.v2.live.f71d668772bf4bf4';

function resolveBannerAdGroupId(liveAdGroupId: string): string {
  if (isViteProdBuild()) {
    return liveAdGroupId;
  }

  return '';
}

export function getResolvedMarketBannerAdGroupId(): string {
  return resolveBannerAdGroupId(MARKET_BANNER_LIVE_AD_GROUP_ID);
}

export function getResolvedHistoryBannerAdGroupId(): string {
  return resolveBannerAdGroupId(HISTORY_BANNER_LIVE_AD_GROUP_ID);
}

export function getResolvedBenefitFeedBannerAdGroupId(): string {
  return resolveBannerAdGroupId(BENEFIT_FEED_BANNER_LIVE_AD_GROUP_ID);
}
```

## 8. `Benefits.tsx` 하단 피드형 배너 추가

대상 파일:

```text
components/Benefits.tsx
```

아래는 파일 상단 import 블록의 최종 형태입니다. 기존 `REWARD_UNLOCK_AI_AD_GROUP_ID` 단독 import를 중복으로 남기지 말고, 광고 관련 import를 이 형태로 정리합니다.

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBenefitMessages,
  type BenefitMessages,
  type BenefitWalletBoardItemCopy,
} from '@/constants/messages/benefitMessages';
import { useMutexAction } from '@/hooks/useMutexAction';
import { showErrorToast } from '@/components/tds-adapter/showErrorToast';
import { useAdPreload } from '@/services/ads/AdPreloadProvider';
import {
  getResolvedBenefitFeedBannerAdGroupId,
  REWARD_UNLOCK_AI_AD_GROUP_ID,
} from '@/services/ads/adPlacements';
import { INTERSTITIAL_PLACEMENT_KEYS } from '@/services/ads/interstitialPlacementConfig';
import { requestRewardAd } from '@/services/ads/rewardAdService';
import {
  checkInBenefitAttendance,
  loadBenefitPredictionQuestion,
  loadBenefitQuizQuestion,
  loadBenefitSummary,
  redeemBenefitTossPoint,
  submitBenefitPredictionAttempt,
  submitBenefitQuizAttempt,
  unlockBenefitMissionAd,
  type BenefitAdUnlockReason,
  type BenefitAdUnlockResult,
  type BenefitPredictionQuestionResponse,
  type BenefitQuizQuestionResponse,
  type BenefitSummary,
  type BenefitTossPointRedeemResult,
  type PredictionDirection,
} from '@/services/benefits/benefitQuestClient';
import type { MissionKind } from '@/services/benefits/benefitRewardPolicy';
import type {
  ServiceError,
  ServiceErrorCode,
  ServiceResult,
} from '@/services/serviceUtils';
import type { AppLang } from '@/types';
import { useTossApp } from '@/contexts/TossAppContext';
import { AttendanceQuestCard } from './benefits/AttendanceQuestCard';
import { BenefitWalletBoard } from './benefits/BenefitWalletBoard';
import { PredictionQuestCard } from './benefits/PredictionQuestCard';
import { StockQuizQuestCard } from './benefits/StockQuizQuestCard';
import { TossPointReceiveCard } from './benefits/TossPointReceiveCard';
import { TossInlineBanner } from './TossInlineBanner';
```

컴포넌트 밖 모듈 레벨 상수 영역에서 기존 토스 포인트 상태 상수 바로 뒤에 피드형 고정 높이 클래스를 추가합니다. `Benefits()` 함수 내부에 넣지 않습니다.

```tsx
const ERROR_TOAST_DEDUP_WINDOW_MS = 1_200;
const TOSS_PAYOUT_STATUS_PENDING = 'pending';
const TOSS_PAYOUT_STATUS_FAILED = 'failed';
const BENEFIT_FEED_BANNER_CONTAINER_CLASS = 'h-[410px] min-h-[410px] w-full';
```

아래는 `noticeText` 변수 선언부터 `return` 끝까지의 tail replacement입니다. 출석 카드 내부 배너는 `shouldShowBannerAd={shouldShowAds}` 그대로 유지하고, 하단 피드형 배너만 안내 `aside` 뒤에 추가합니다.

```tsx
const noticeText = shouldLockGuestBenefits
  ? copy.guestNoticeMessage
  : noticeMessage ?? copy.apiPendingNotice;
const benefitFeedBannerAdGroupId = getResolvedBenefitFeedBannerAdGroupId();
const shouldRenderBenefitFeedBanner =
  shouldShowAds &&
  isInTossApp &&
  benefitFeedBannerAdGroupId.trim() !== '';

return (
  <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in duration-500">
    <header className="flex flex-col gap-3">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          {copy.pageTitle}
        </h1>
        <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-slate-500 dark:text-slate-400">
          {copy.pageSubtitle}
        </p>
      </div>
    </header>

    <BenefitWalletBoard
      copy={copy}
      items={walletItems}
      isLoading={isSummaryLoading}
    />

    <section
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      aria-label={copy.pageTitle}
    >
      <AttendanceQuestCard
        copy={copy}
        statusLabel={attendanceStatusLabel}
        isLoading={attendanceCommand.isExecuting}
        isDisabled={isAttendanceDisabled}
        shouldShowBannerAd={shouldShowAds}
        isInTossApp={isInTossApp}
        onCheckIn={attendanceCommand.run}
      />
      <PredictionQuestCard
        copy={copy}
        lang={lang}
        statusLabel={predictionStatusLabel}
        lastAccuracyLabel={predictionLastAccuracyLabel}
        questionResponse={predictionState.response}
        isLoading={predictionState.status === 'loading'}
        isBusy={isPredictionBusy}
        isDisabled={summary == null}
        canUnlockWithAd={canUnlockPredictionWithAd}
        onRefreshQuestion={handleRefreshPredictionQuestion}
        onSelectDirection={predictionSubmitCommand.run}
        onUnlockWithAd={predictionUnlockCommand.run}
      />
      <StockQuizQuestCard
        copy={copy}
        statusLabel={quizStatusLabel}
        questionResponse={quizState.response}
        isLoading={quizState.status === 'loading'}
        isBusy={isQuizBusy}
        isDisabled={summary == null}
        canUnlockWithAd={canUnlockQuizWithAd}
        onRefreshQuestion={handleRefreshQuizQuestion}
        onSelectChoice={quizSubmitCommand.run}
        onUnlockWithAd={quizUnlockCommand.run}
      />
      <TossPointReceiveCard
        copy={copy}
        statusLabel={tossPointStatusLabel}
        isLoading={tossPointRedeemCommand.isExecuting}
        isDisabled={isTossPointRedeemDisabled}
        onRedeem={tossPointRedeemCommand.run}
      />
    </section>

    <aside
      className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400"
      aria-live="polite"
    >
      {noticeText}
    </aside>

    {shouldRenderBenefitFeedBanner ? (
      <TossInlineBanner
        adGroupId={benefitFeedBannerAdGroupId}
        shouldShowAd
        isInTossApp={isInTossApp}
        className="!my-0"
        containerClassName={BENEFIT_FEED_BANNER_CONTAINER_CLASS}
        variant="card"
      />
    ) : null}
  </div>
);
```

토스 공식 문서상 피드형 배너의 고정형 컨테이너는 `height: 410px`가 권장됩니다. 여기서 고정형은 CSS 위치 고정이 아니라 광고 컨테이너 높이를 고정한다는 뜻입니다. `!my-0`은 기존 인라인 배너의 기본 상하 여백이 혜택 탭 하단 레이아웃을 과도하게 늘리지 않도록 하단 피드형 배너에만 적용합니다. `TossInlineBanner`는 내부 DOM을 비운 상태로 `TossAds.attachBanner`를 호출하고, 언마운트 시 `destroy()`를 호출하므로 새 SDK 코드를 만들지 않습니다.

## 9. 검증 명령

프론트 타입 체크:

```powershell
npm run typecheck:app
```

DB migration 적용 후 smoke query:

```sql
SELECT
  source,
  delta_money,
  money_balance_after,
  created_at
FROM public.benefit_ledger_entries
WHERE user_id = '<TEST_USER_ID>'::uuid
ORDER BY created_at DESC
LIMIT 10;
```

pg 함수 정의 확인:

```sql
SELECT
  proname,
  pg_get_functiondef(oid) AS definition
FROM pg_proc
WHERE proname IN (
  'attend_and_claim_reward',
  'submit_quiz_and_claim_reward',
  'submit_prediction_and_claim_reward'
);
```
