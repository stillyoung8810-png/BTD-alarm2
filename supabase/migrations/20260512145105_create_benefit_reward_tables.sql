-- ============================================
-- Benefit reward tables for Toss point Phase 1
-- ============================================
-- RLS is enabled on every table. Policies are intentionally
-- excluded in Phase 1 so server-side APIs can be designed first.
-- ============================================

CREATE TABLE IF NOT EXISTS public.benefit_wallets (
  user_id uuid PRIMARY KEY,
  money_balance integer NOT NULL DEFAULT 0 CHECK (money_balance >= 0),
  lifetime_earned_money integer NOT NULL DEFAULT 0 CHECK (lifetime_earned_money >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.benefit_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL,
  source_id text NOT NULL,
  delta_money integer NOT NULL,
  money_balance_after integer NOT NULL CHECK (money_balance_after >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, source_id)
);

CREATE TABLE IF NOT EXISTS public.benefit_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  attendance_date date NOT NULL,
  consecutive_days integer NOT NULL CHECK (consecutive_days > 0),
  base_money integer NOT NULL DEFAULT 1,
  streak_bonus_money integer NOT NULL DEFAULT 0,
  streak_bonus_ad_shown boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS public.benefit_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  human_id text NOT NULL UNIQUE,
  phase text NOT NULL,
  category text NOT NULL,
  difficulty text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('ox', 'ab')),
  question text NOT NULL,
  choices jsonb NOT NULL CHECK (jsonb_typeof(choices) = 'array'),
  correct_choice_id text NOT NULL,
  explanation text NOT NULL,
  topic text,
  source_note text,
  review_status text NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'approved', 'rejected')),
  is_active boolean NOT NULL DEFAULT false,
  total_attempts integer NOT NULL DEFAULT 0 CHECK (total_attempts >= 0),
  correct_attempts integer NOT NULL DEFAULT 0 CHECK (correct_attempts >= 0),
  CHECK (correct_attempts <= total_attempts),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS benefit_quiz_questions_active_lookup_idx
  ON public.benefit_quiz_questions (category, difficulty, updated_at)
  WHERE is_active = true AND review_status = 'approved';

CREATE TABLE IF NOT EXISTS public.benefit_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES public.benefit_quiz_questions(id),
  attempt_date date NOT NULL,
  attempt_sequence integer NOT NULL CHECK (attempt_sequence BETWEEN 1 AND 5),
  idempotency_key text NOT NULL,
  selected_choice_id text NOT NULL,
  is_correct boolean NOT NULL,
  reward_money integer NOT NULL DEFAULT 5 CHECK (reward_money >= 0),
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, attempt_date, attempt_sequence),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.benefit_mission_daily_states (
  user_id uuid NOT NULL,
  mission_kind text NOT NULL CHECK (mission_kind IN ('price_prediction', 'stock_quiz')),
  mission_date date NOT NULL,
  completed_attempts integer NOT NULL DEFAULT 0 CHECK (completed_attempts BETWEEN 0 AND 5),
  rewarded_ad_unlocks integer NOT NULL DEFAULT 0 CHECK (rewarded_ad_unlocks BETWEEN 0 AND 4),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_kind, mission_date),
  CHECK (completed_attempts <= rewarded_ad_unlocks + 1)
);

CREATE TABLE IF NOT EXISTS public.benefit_prediction_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  question_date date NOT NULL,
  base_trade_date date NOT NULL,
  base_close numeric NOT NULL CHECK (base_close > 0),
  result_trade_date date,
  result_close numeric CHECK (result_close > 0),
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.benefit_prediction_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES public.benefit_prediction_questions(id),
  attempt_date date NOT NULL,
  attempt_sequence integer NOT NULL CHECK (attempt_sequence BETWEEN 1 AND 5),
  idempotency_key text NOT NULL,
  selected_direction text NOT NULL CHECK (selected_direction IN ('up', 'down')),
  is_correct boolean,
  reward_money integer NOT NULL DEFAULT 5 CHECK (reward_money >= 0),
  answered_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (user_id, attempt_date, attempt_sequence),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.benefit_toss_point_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  redeem_request_id text NOT NULL,
  promotion_code text NOT NULL,
  redeemed_money integer NOT NULL CHECK (redeemed_money > 0),
  toss_point_amount integer NOT NULL CHECK (toss_point_amount > 0),
  toss_promotion_key text,
  toss_promotion_key_issued_at timestamptz,
  toss_promotion_key_expires_at timestamptz,
  promotion_attempt_count integer NOT NULL DEFAULT 0 CHECK (promotion_attempt_count >= 0),
  last_promotion_attempt_at timestamptz,
  next_promotion_retry_at timestamptz,
  toss_error_code text,
  toss_error_message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, redeem_request_id)
);

ALTER TABLE public.benefit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_mission_daily_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_prediction_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_prediction_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_toss_point_payouts ENABLE ROW LEVEL SECURITY;
