-- ============================================
-- Benefit prediction lifecycle
-- ============================================

CREATE TABLE IF NOT EXISTS public.benefit_prediction_accuracy_summaries (
  user_id uuid PRIMARY KEY,
  result_trade_date date NOT NULL,
  correct_attempts integer NOT NULL CHECK (correct_attempts >= 0),
  settled_attempts integer NOT NULL CHECK (settled_attempts > 0),
  accuracy_rate numeric(6, 5) NOT NULL CHECK (accuracy_rate >= 0 AND accuracy_rate <= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (correct_attempts <= settled_attempts)
);

ALTER TABLE public.benefit_prediction_accuracy_summaries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS benefit_prediction_accuracy_result_date_idx
  ON public.benefit_prediction_accuracy_summaries (result_trade_date DESC);

UPDATE public.benefit_prediction_questions
SET symbol = upper(btrim(symbol))
WHERE symbol <> upper(btrim(symbol));

DROP TABLE IF EXISTS pg_temp.benefit_prediction_duplicate_questions;

CREATE TEMP TABLE benefit_prediction_duplicate_questions (
  id uuid PRIMARY KEY,
  keeper_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.benefit_prediction_duplicate_questions (id, keeper_id)
WITH ranked_questions AS (
  SELECT
    q.id,
    first_value(q.id) OVER (
      PARTITION BY
        q.symbol,
        q.question_date,
        q.base_trade_date,
        q.base_close,
        q.result_close
      ORDER BY
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM public.benefit_prediction_attempts a
            WHERE a.question_id = q.id
          )
          THEN 0
          ELSE 1
        END,
        q.created_at ASC,
        q.id ASC
    ) AS keeper_id
  FROM public.benefit_prediction_questions q
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.benefit_prediction_questions unsafe
    WHERE unsafe.symbol = q.symbol
      AND unsafe.question_date = q.question_date
      AND (
        unsafe.base_trade_date IS DISTINCT FROM q.base_trade_date
        OR unsafe.base_close IS DISTINCT FROM q.base_close
        OR unsafe.result_close IS DISTINCT FROM q.result_close
      )
  )
)
SELECT id, keeper_id
FROM ranked_questions
WHERE id <> keeper_id;

UPDATE public.benefit_prediction_attempts a
SET question_id = duplicate_questions.keeper_id
FROM pg_temp.benefit_prediction_duplicate_questions duplicate_questions
WHERE a.question_id = duplicate_questions.id;

DELETE FROM public.benefit_prediction_questions q
USING pg_temp.benefit_prediction_duplicate_questions duplicate_questions
WHERE q.id = duplicate_questions.id;

DROP TABLE pg_temp.benefit_prediction_duplicate_questions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.benefit_prediction_questions
    GROUP BY symbol, question_date
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'prediction_question_duplicate_cleanup_requires_manual_review';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS benefit_prediction_questions_symbol_date_key
  ON public.benefit_prediction_questions (symbol, question_date);

CREATE INDEX IF NOT EXISTS benefit_prediction_questions_open_lookup_idx
  ON public.benefit_prediction_questions (question_date, status, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS benefit_prediction_questions_settled_cleanup_idx
  ON public.benefit_prediction_questions (result_trade_date, status)
  WHERE status = 'settled';

CREATE INDEX IF NOT EXISTS benefit_prediction_attempts_question_settle_idx
  ON public.benefit_prediction_attempts (question_id, settled_at);

CREATE OR REPLACE FUNCTION public.generate_benefit_prediction_questions(
  p_question_date date DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_question_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
  IF p_question_date IS NULL THEN
    RAISE EXCEPTION 'question_date_required';
  END IF;

  SELECT count(*)
  INTO v_existing_question_count
  FROM public.benefit_prediction_questions
  WHERE question_date = p_question_date;

  IF v_existing_question_count > 0 THEN
    RETURN jsonb_build_object(
      'questionDate', p_question_date,
      'insertedCount', 0,
      'existingQuestionCount', v_existing_question_count,
      'reason', 'question_date_already_generated'
    );
  END IF;

  WITH normalized_prices AS (
    SELECT
      upper(btrim(symbol)) AS normalized_symbol,
      trade_date,
      close
    FROM public.stock_prices
    WHERE btrim(symbol) <> ''
      AND close > 0
      AND trade_date <= p_question_date
  ),
  latest_prices AS (
    SELECT DISTINCT ON (normalized_symbol)
      normalized_symbol AS symbol,
      trade_date,
      close
    FROM normalized_prices
    ORDER BY normalized_symbol, trade_date DESC
  ),
  inserted AS (
    INSERT INTO public.benefit_prediction_questions (
      symbol,
      question_date,
      base_trade_date,
      base_close,
      status
    )
    SELECT
      latest_prices.symbol,
      p_question_date,
      latest_prices.trade_date,
      latest_prices.close,
      'open'
    FROM latest_prices
    ON CONFLICT (symbol, question_date) DO NOTHING
    RETURNING id
  )
  SELECT count(*)
  INTO v_inserted_count
  FROM inserted;

  RETURN jsonb_build_object(
    'questionDate', p_question_date,
    'insertedCount', v_inserted_count,
    'existingQuestionCount', v_existing_question_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.select_benefit_prediction_question(
  p_user_id uuid,
  p_attempt_date date,
  p_attempt_sequence integer
)
RETURNS TABLE (
  id uuid,
  symbol text,
  question_date date,
  base_trade_date date,
  base_close numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF p_attempt_date IS NULL THEN
    RAISE EXCEPTION 'attempt_date_required';
  END IF;

  IF p_attempt_sequence NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'attempt_sequence_out_of_range';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.symbol,
    q.question_date,
    q.base_trade_date,
    q.base_close
  FROM public.benefit_prediction_questions q
  WHERE q.status = 'open'
    AND q.question_date = p_attempt_date
  ORDER BY md5(
    p_user_id::text || ':' ||
    p_attempt_date::text || ':' ||
    p_attempt_sequence::text || ':' ||
    q.id::text
  )
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_benefit_prediction_rewards()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settled_question_count integer := 0;
  v_settled_attempt_count integer := 0;
  v_upserted_summary_count integer := 0;
BEGIN
  WITH next_prices AS (
    SELECT DISTINCT ON (q.id)
      q.id AS question_id,
      sp.trade_date AS result_trade_date,
      sp.close AS result_close
    FROM public.benefit_prediction_questions q
    JOIN public.stock_prices sp
      ON upper(btrim(sp.symbol)) = q.symbol
     AND sp.trade_date > q.base_trade_date
     AND sp.close > 0
    WHERE q.status = 'open'
      AND q.result_close IS NULL
    ORDER BY q.id, sp.trade_date ASC
  ),
  settled_questions AS (
    UPDATE public.benefit_prediction_questions q
    SET
      result_trade_date = next_prices.result_trade_date,
      result_close = next_prices.result_close,
      status = 'settled'
    FROM next_prices
    WHERE q.id = next_prices.question_id
    RETURNING
      q.id,
      q.base_close,
      q.result_trade_date,
      q.result_close
  ),
  settled_attempts AS (
    UPDATE public.benefit_prediction_attempts a
    SET
      is_correct = CASE
        WHEN sq.result_close > sq.base_close THEN a.selected_direction = 'up'
        WHEN sq.result_close < sq.base_close THEN a.selected_direction = 'down'
        ELSE false
      END,
      settled_at = now()
    FROM settled_questions sq
    WHERE a.question_id = sq.id
      AND a.settled_at IS NULL
    RETURNING
      a.user_id,
      sq.result_trade_date,
      a.is_correct
  ),
  latest_result_dates AS (
    SELECT user_id, max(result_trade_date) AS result_trade_date
    FROM settled_attempts
    GROUP BY user_id
  ),
  user_result_summaries AS (
    SELECT
      a.user_id,
      q.result_trade_date,
      count(*) FILTER (WHERE a.is_correct) AS correct_attempts,
      count(*) AS settled_attempts
    FROM latest_result_dates l
    JOIN public.benefit_prediction_attempts a
      ON a.user_id = l.user_id
    JOIN public.benefit_prediction_questions q
      ON q.id = a.question_id
     AND q.result_trade_date = l.result_trade_date
     AND q.status = 'settled'
    WHERE a.settled_at IS NOT NULL
      AND a.is_correct IS NOT NULL
    GROUP BY a.user_id, q.result_trade_date
    HAVING count(*) > 0
  ),
  upserted_summaries AS (
    INSERT INTO public.benefit_prediction_accuracy_summaries (
      user_id,
      result_trade_date,
      correct_attempts,
      settled_attempts,
      accuracy_rate,
      updated_at
    )
    SELECT
      user_id,
      result_trade_date,
      correct_attempts::integer,
      settled_attempts::integer,
      round((correct_attempts::numeric / NULLIF(settled_attempts, 0)), 5),
      now()
    FROM user_result_summaries
    ON CONFLICT (user_id) DO UPDATE
    SET
      result_trade_date = EXCLUDED.result_trade_date,
      correct_attempts = EXCLUDED.correct_attempts,
      settled_attempts = EXCLUDED.settled_attempts,
      accuracy_rate = EXCLUDED.accuracy_rate,
      updated_at = now()
    WHERE public.benefit_prediction_accuracy_summaries.result_trade_date <= EXCLUDED.result_trade_date
    RETURNING user_id
  )
  SELECT
    (SELECT count(*) FROM settled_questions),
    (SELECT count(*) FROM settled_attempts),
    (SELECT count(*) FROM upserted_summaries)
  INTO
    v_settled_question_count,
    v_settled_attempt_count,
    v_upserted_summary_count;

  RETURN jsonb_build_object(
    'settledQuestionCount', v_settled_question_count,
    'settledAttemptCount', v_settled_attempt_count,
    'upsertedSummaryCount', v_upserted_summary_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_benefit_prediction_data(
  p_run_date date DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retained_trade_date_count constant integer := 3;
  v_cutoff_trade_date date;
  v_deleted_attempt_count integer := 0;
  v_deleted_question_count integer := 0;
  v_deleted_state_count integer := 0;
BEGIN
  IF p_run_date IS NULL THEN
    RAISE EXCEPTION 'run_date_required';
  END IF;

  SELECT min(trade_date)
  INTO v_cutoff_trade_date
  FROM (
    SELECT DISTINCT trade_date
    FROM public.stock_prices
    WHERE trade_date <= p_run_date
    ORDER BY trade_date DESC
    LIMIT v_retained_trade_date_count
  ) retained_trade_dates;

  IF v_cutoff_trade_date IS NULL THEN
    RETURN jsonb_build_object(
      'deletedAttemptCount', 0,
      'deletedQuestionCount', 0,
      'deletedStateCount', 0,
      'reason', 'trade_date_not_ready'
    );
  END IF;

  WITH old_questions AS (
    SELECT id
    FROM public.benefit_prediction_questions
    WHERE status = 'settled'
      AND result_trade_date < v_cutoff_trade_date
  )
  DELETE FROM public.benefit_prediction_attempts a
  USING old_questions
  WHERE a.question_id = old_questions.id;

  GET DIAGNOSTICS v_deleted_attempt_count = ROW_COUNT;

  WITH old_questions AS (
    SELECT id
    FROM public.benefit_prediction_questions
    WHERE status = 'settled'
      AND result_trade_date < v_cutoff_trade_date
  )
  DELETE FROM public.benefit_prediction_questions q
  USING old_questions
  WHERE q.id = old_questions.id;

  GET DIAGNOSTICS v_deleted_question_count = ROW_COUNT;

  DELETE FROM public.benefit_mission_daily_states s
  WHERE s.mission_kind = 'price_prediction'
    AND s.mission_date < v_cutoff_trade_date;

  GET DIAGNOSTICS v_deleted_state_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoffTradeDate', v_cutoff_trade_date,
    'deletedAttemptCount', v_deleted_attempt_count,
    'deletedQuestionCount', v_deleted_question_count,
    'deletedStateCount', v_deleted_state_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_benefit_prediction_maintenance(
  p_run_date date DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_generation_result jsonb;
  v_settlement_result jsonb;
  v_cleanup_result jsonb;
BEGIN
  v_generation_result := public.generate_benefit_prediction_questions(p_run_date);
  v_settlement_result := public.settle_benefit_prediction_rewards();
  v_cleanup_result := public.cleanup_benefit_prediction_data(p_run_date);

  RETURN jsonb_build_object(
    'runDate', p_run_date,
    'generation', v_generation_result,
    'settlement', v_settlement_result,
    'cleanup', v_cleanup_result
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_benefit_prediction_questions(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.select_benefit_prediction_question(uuid, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_benefit_prediction_rewards() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_benefit_prediction_data(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_benefit_prediction_maintenance(date) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_benefit_prediction_questions(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.select_benefit_prediction_question(uuid, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_benefit_prediction_rewards() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_benefit_prediction_data(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_benefit_prediction_maintenance(date) TO service_role;
