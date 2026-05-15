# 종가 예측 수명주기 구현 스니펫

이 문서는 `toss_point_prediction_lifecycle_plan.md`의 구현용 스니펫입니다. 실제 적용 시에는 새 Supabase migration 파일과 `supabase/functions/benefits/index.ts`, `services/benefits/benefitQuestClient.ts`, `components/Benefits.tsx`, `components/benefits/PredictionQuestCard.tsx`, `constants/messages/benefitMessages.ts`에 나누어 반영합니다.

이번 스니펫은 배포 실패와 런타임 크래시를 막는 필수 보강만 포함합니다. 과거 날짜 요청 차단, 제출 시 `question_date = attempt_date` 검증, `benefit_ledger_entries.source_id` 변경, `select_benefit_prediction_question`의 `p_attempt_sequence = null` 추가 방어, 수동 cleanup 삭제 SQL의 추가 2중 방어는 이번 구현 범위에서 제외하고 기존 로직을 유지합니다.

## 1. DB 마이그레이션

### 1.1 최근 결과 영업일 정답률 요약 테이블

```sql
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
```

### 1.2 예측 문제 중복 방지와 조회 인덱스

인덱스 생성 전 기존 데이터를 먼저 정리합니다. `benefit_prediction_attempts.question_id`가 문제를 참조하므로, 중복 문제를 삭제하기 전에 시도 기록을 대표 문제로 옮깁니다.

자동 병합은 `symbol`, `question_date`, `base_trade_date`, `base_close`, `result_close`가 모두 같은 문제로만 제한합니다. 기준가나 결과가가 다른 문제는 채점 의미가 달라질 수 있으므로 자동 병합하지 않고 migration에서 명시적으로 실패시켜 수동 확인하게 합니다.

```sql
UPDATE public.benefit_prediction_questions
SET symbol = upper(btrim(symbol))
WHERE symbol <> upper(btrim(symbol));

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
),
duplicate_questions AS (
  SELECT id, keeper_id
  FROM ranked_questions
  WHERE id <> keeper_id
),
rewired_attempts AS (
  UPDATE public.benefit_prediction_attempts a
  SET question_id = duplicate_questions.keeper_id
  FROM duplicate_questions
  WHERE a.question_id = duplicate_questions.id
  RETURNING a.id
)
DELETE FROM public.benefit_prediction_questions q
USING duplicate_questions
WHERE q.id = duplicate_questions.id;

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
```

위 migration이 `prediction_question_duplicate_cleanup_requires_manual_review`로 실패하면, 자동 병합하면 안 되는 중복이 남아 있다는 뜻입니다. 먼저 아래 SQL로 기준가나 결과가가 다른 중복 묶음을 확인합니다.

```sql
WITH duplicate_keys AS (
  SELECT symbol, question_date
  FROM public.benefit_prediction_questions
  GROUP BY symbol, question_date
  HAVING count(*) > 1
)
SELECT
  q.id,
  q.symbol,
  q.question_date,
  q.base_trade_date,
  q.base_close,
  q.result_trade_date,
  q.result_close,
  q.status,
  q.created_at,
  count(a.id) AS attempt_count
FROM public.benefit_prediction_questions q
JOIN duplicate_keys k
  ON k.symbol = q.symbol
 AND k.question_date = q.question_date
LEFT JOIN public.benefit_prediction_attempts a
  ON a.question_id = q.id
GROUP BY
  q.id,
  q.symbol,
  q.question_date,
  q.base_trade_date,
  q.base_close,
  q.result_trade_date,
  q.result_close,
  q.status,
  q.created_at
ORDER BY q.symbol, q.question_date, q.created_at, q.id;
```

수동 정리 원칙:

- `attempt_count = 0`인 중복 row만 삭제 대상으로 삼습니다.
- `attempt_count > 0`인 row는 시도 기록의 채점 기준이므로 자동 병합하지 않습니다.
- 운영 데이터라면 삭제 전 해당 `id`, 기준가, 결과가를 별도 기록으로 남기고, 배포자는 보존할 대표 row를 명시적으로 선택합니다.

삭제 대상 `id`를 확정한 뒤에만 아래 SQL을 실행합니다.

```sql
DELETE FROM public.benefit_prediction_questions
WHERE id = ANY (
  ARRAY[
    '00000000-0000-0000-0000-000000000000'::uuid
  ]
);
```

삭제 후 중복이 모두 사라졌는지 확인합니다.

```sql
SELECT symbol, question_date, count(*) AS duplicate_count
FROM public.benefit_prediction_questions
GROUP BY symbol, question_date
HAVING count(*) > 1
ORDER BY symbol, question_date;
```

## 2. 문제 생성 RPC

`stock_prices`에서 각 종목의 최신 종가를 읽어 KST 날짜 기준 문제를 생성합니다. 주말/공휴일에는 `question_date`는 오늘이고 `base_trade_date`는 가장 최근 영업일입니다.

```sql
CREATE OR REPLACE FUNCTION public.generate_benefit_prediction_questions(
  p_question_date date DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_count integer := 0;
BEGIN
  IF p_question_date IS NULL THEN
    RAISE EXCEPTION 'question_date_required';
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
    'insertedCount', v_inserted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_benefit_prediction_questions(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_benefit_prediction_questions(date) TO service_role;
```

## 3. 같은 날짜/회차 고정 랜덤 선택 RPC

별도 배정 테이블을 만들지 않고 `md5` 정렬로 안정적인 랜덤을 만듭니다.

```sql
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

REVOKE ALL ON FUNCTION public.select_benefit_prediction_question(uuid, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.select_benefit_prediction_question(uuid, date, integer) TO service_role;
```

## 4. 정산 RPC

`base_trade_date` 이후 첫 영업일 종가가 들어온 문제를 정산합니다. 정산 결과로 사용자별 최근 결과 영업일 정답률 요약값을 남깁니다.

```sql
CREATE OR REPLACE FUNCTION public.settle_benefit_prediction_questions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settled_question_count integer := 0;
  v_settled_attempt_count integer := 0;
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
    (SELECT count(*) FROM settled_attempts)
  INTO v_settled_question_count, v_settled_attempt_count;

  RETURN jsonb_build_object(
    'settledQuestionCount', v_settled_question_count,
    'settledAttemptCount', v_settled_attempt_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_benefit_prediction_questions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_benefit_prediction_questions() TO service_role;
```

## 5. 3영업일 보관 후 정리 RPC

최신 결과 영업일 3개는 보관하고, 그보다 오래된 정산 문제는 시도 기록부터 삭제합니다.

```sql
CREATE OR REPLACE FUNCTION public.cleanup_settled_benefit_prediction_history(
  p_run_date date DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
    LIMIT 3
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
    SELECT id, question_date
    FROM public.benefit_prediction_questions
    WHERE status = 'settled'
      AND result_trade_date < v_cutoff_trade_date
  ),
  deleted_attempts AS (
    DELETE FROM public.benefit_prediction_attempts a
    USING old_questions
    WHERE a.question_id = old_questions.id
    RETURNING a.id
  ),
  deleted_questions AS (
    DELETE FROM public.benefit_prediction_questions q
    USING old_questions
    WHERE q.id = old_questions.id
    RETURNING q.id
  ),
  deleted_states AS (
    DELETE FROM public.benefit_mission_daily_states s
    WHERE s.mission_kind = 'price_prediction'
      AND s.mission_date < v_cutoff_trade_date
    RETURNING s.user_id
  )
  SELECT
    (SELECT count(*) FROM deleted_attempts),
    (SELECT count(*) FROM deleted_questions),
    (SELECT count(*) FROM deleted_states)
  INTO v_deleted_attempt_count, v_deleted_question_count, v_deleted_state_count;

  RETURN jsonb_build_object(
    'cutoffTradeDate', v_cutoff_trade_date,
    'deletedAttemptCount', v_deleted_attempt_count,
    'deletedQuestionCount', v_deleted_question_count,
    'deletedStateCount', v_deleted_state_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_settled_benefit_prediction_history(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_settled_benefit_prediction_history(date) TO service_role;
```

## 6. 통합 유지보수 RPC

스케줄러는 이 함수 하나만 호출합니다.

```sql
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
  v_settlement_result := public.settle_benefit_prediction_questions();
  v_cleanup_result := public.cleanup_settled_benefit_prediction_history(p_run_date);

  RETURN jsonb_build_object(
    'runDate', p_run_date,
    'generation', v_generation_result,
    'settlement', v_settlement_result,
    'cleanup', v_cleanup_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_benefit_prediction_maintenance(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_benefit_prediction_maintenance(date) TO service_role;
```

### 6.1 배치 실행 등록

기본 실행 경로는 Supabase `pg_cron` 예약 작업입니다. KST 오전 7시 5분은 UTC 전날 22시 5분이므로 아래 cron 표현식을 사용합니다.

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
DECLARE
  v_existing_job record;
BEGIN
  FOR v_existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'benefit_prediction_maintenance_kst_0705'
  LOOP
    PERFORM cron.unschedule(v_existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'benefit_prediction_maintenance_kst_0705',
    '5 22 * * *',
    $cron$
      SELECT public.run_benefit_prediction_maintenance(
        (now() AT TIME ZONE 'Asia/Seoul')::date
      );
    $cron$
  );
END;
$$;
```

배포 직후 smoke 확인은 예약 작업을 기다리지 않고 아래 SQL로 1회 실행합니다.

```sql
SELECT public.run_benefit_prediction_maintenance(
  (now() AT TIME ZONE 'Asia/Seoul')::date
);
```

예약 작업 등록 여부는 아래 SQL로 확인합니다.

```sql
SELECT jobid, schedule, command, active
FROM cron.job
WHERE jobname = 'benefit_prediction_maintenance_kst_0705';
```

## 7. Edge Function 스니펫

### 7.1 summary 응답에 정답률 추가

```ts
interface BenefitPredictionAccuracySummaryRow {
  readonly result_trade_date: string;
  readonly correct_attempts: number;
  readonly settled_attempts: number;
  readonly accuracy_rate: number | string;
}

function formatPredictionAccuracySummary(
  row: BenefitPredictionAccuracySummaryRow | null,
): JsonObject | null {
  if (row == null) {
    return null;
  }

  const settledAttempts = readNonNegativeInteger(
    row.settled_attempts,
    "settledAttempts",
  );
  if (settledAttempts <= 0) {
    return null;
  }

  const accuracyRate = Number.parseFloat(String(row.accuracy_rate));
  if (!Number.isFinite(accuracyRate) || accuracyRate < 0 || accuracyRate > 1) {
    throw new Error("prediction_accuracy_rate_invalid");
  }

  const correctAttempts = readNonNegativeInteger(
    row.correct_attempts,
    "correctAttempts",
  );
  if (correctAttempts > settledAttempts) {
    throw new Error("prediction_accuracy_attempt_count_invalid");
  }

  return {
    resultTradeDate: row.result_trade_date,
    correctAttempts,
    settledAttempts,
    accuracyRate,
  };
}

async function readPredictionAccuracySummary(
  adminClient: SupabaseClient,
  userId: string,
): Promise<JsonObject | null> {
  const { data, error } = await adminClient
    .from("benefit_prediction_accuracy_summaries")
    .select("result_trade_date, correct_attempts, settled_attempts, accuracy_rate")
    .eq("user_id", userId)
    .maybeSingle();

  if (error != null) {
    throw new Error(`prediction_accuracy_summary_read_failed:${error.message}`);
  }

  return formatPredictionAccuracySummary(
    data as BenefitPredictionAccuracySummaryRow | null,
  );
}
```

`handleSummary`의 `Promise.all`에 추가합니다.

```ts
const [
  attendance,
  quizMission,
  predictionMission,
  predictionAccuracy,
] = await Promise.all([
  readAttendanceSummary(context.adminClient, context.userId, summaryDate),
  readMissionSummary(context.adminClient, context.userId, "stock_quiz", summaryDate),
  readMissionSummary(context.adminClient, context.userId, "price_prediction", summaryDate),
  readPredictionAccuracySummary(context.adminClient, context.userId),
]);
```

응답에 포함합니다.

```ts
return jsonResponse(req, 200, {
  success: true,
  data: {
    summaryDate,
    wallet: {
      moneyBalance: currentMoneyBalance,
      lifetimeEarnedMoney,
    },
    pendingPayout: {
      tossPointAmount: pendingTossPointAmount,
      hasPendingPayout: pendingTossPointAmount > 0,
    },
    walletBoard,
    attendance,
    missions: {
      stockQuiz: quizMission,
      pricePrediction: predictionMission,
    },
    predictionAccuracy,
  },
});
```

### 7.2 prediction/question에서 선택 RPC 사용

```ts
const attemptSequence = resolveNextAttemptSequence(missionState);
if (attemptSequence == null) {
  return jsonResponse(req, 200, {
    success: true,
    data: {
      attemptDate,
      attemptSequence: null,
      availability,
      question: null,
      reason: "no_unlocked_attempt_available",
    },
  });
}

const { data, error } = await context.adminClient.rpc(
  "select_benefit_prediction_question",
  {
    p_user_id: context.userId,
    p_attempt_date: attemptDate,
    p_attempt_sequence: attemptSequence,
  },
);

if (error != null) {
  throw new Error(`prediction_question_select_failed:${error.message}`);
}

const rows = (data ?? []) as readonly BenefitPredictionQuestionRow[];
const selectedQuestion = rows[0] ?? null;
if (selectedQuestion == null) {
  return jsonResponse(req, 200, {
    success: true,
    data: {
      attemptDate,
      attemptSequence,
      availability,
      question: null,
      reason: "prediction_question_not_ready",
    },
  });
}

return jsonResponse(req, 200, {
  success: true,
  data: {
    attemptDate,
    attemptSequence,
    availability,
    question: formatPredictionQuestion(selectedQuestion),
  },
});
```

## 8. 프론트 타입과 UI 스니펫

### 8.1 클라이언트 타입

```ts
export interface BenefitPredictionAccuracySummary {
  readonly resultTradeDate: string;
  readonly correctAttempts: number;
  readonly settledAttempts: number;
  readonly accuracyRate: number;
}

export interface BenefitSummary {
  readonly summaryDate: string;
  readonly wallet: {
    readonly moneyBalance: number;
    readonly lifetimeEarnedMoney: number;
  };
  readonly pendingPayout: {
    readonly tossPointAmount: number;
    readonly hasPendingPayout: boolean;
  };
  readonly walletBoard: BenefitWalletBoardSummary;
  readonly attendance: BenefitAttendanceSummary;
  readonly missions: {
    readonly stockQuiz: BenefitMissionSummary;
    readonly pricePrediction: BenefitMissionSummary;
  };
  readonly predictionAccuracy: BenefitPredictionAccuracySummary | null;
}
```

### 8.2 클라이언트 디코더

`services/benefits/benefitQuestClient.ts`의 기존 `decodeBenefitSummary()` 흐름에 맞춰 추가합니다.

```ts
const RATIO_MIN = 0;
const RATIO_MAX = 1;

function readRatioNumber(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const candidate = value[key];
  if (
    typeof candidate !== 'number' ||
    !Number.isFinite(candidate) ||
    candidate < RATIO_MIN ||
    candidate > RATIO_MAX
  ) {
    return null;
  }

  return candidate;
}

function decodePredictionAccuracySummary(
  value: unknown,
): BenefitPredictionAccuracySummary | null {
  if (value == null) {
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const resultTradeDate = readDateString(value, 'resultTradeDate');
  const correctAttempts = readNonNegativeInteger(value, 'correctAttempts');
  const settledAttempts = readNonNegativeInteger(value, 'settledAttempts');
  const accuracyRate = readRatioNumber(value, 'accuracyRate');
  const hasInvalidAttemptCounts =
    settledAttempts == null ||
    settledAttempts <= 0 ||
    correctAttempts == null ||
    correctAttempts > settledAttempts;

  if (
    resultTradeDate == null ||
    hasInvalidAttemptCounts ||
    accuracyRate == null
  ) {
    return null;
  }

  return {
    resultTradeDate,
    correctAttempts,
    settledAttempts,
    accuracyRate,
  };
}
```

기존 `decodeBenefitSummary()` 함수 전체를 다음으로 교체합니다.

```ts
function decodeBenefitSummary(value: unknown): BenefitSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const summaryDate = readDateString(value, 'summaryDate');
  const wallet = isRecord(value.wallet) ? value.wallet : null;
  const pendingPayout = isRecord(value.pendingPayout) ? value.pendingPayout : null;
  const missions = isRecord(value.missions) ? value.missions : null;
  const walletBoard = decodeWalletBoardSummary(value.walletBoard);
  const attendance = decodeAttendanceSummary(value.attendance);
  const stockQuiz = decodeMissionSummary(missions?.stockQuiz);
  const pricePrediction = decodeMissionSummary(missions?.pricePrediction);
  const predictionAccuracy = decodePredictionAccuracySummary(
    value.predictionAccuracy,
  );

  if (
    summaryDate == null ||
    wallet == null ||
    pendingPayout == null ||
    walletBoard == null ||
    attendance == null ||
    stockQuiz == null ||
    pricePrediction == null
  ) {
    return null;
  }

  const moneyBalance = readNonNegativeInteger(wallet, 'moneyBalance');
  const lifetimeEarnedMoney = readNonNegativeInteger(
    wallet,
    'lifetimeEarnedMoney',
  );
  const tossPointAmount = readNonNegativeInteger(
    pendingPayout,
    'tossPointAmount',
  );
  const hasPendingPayout = readBoolean(pendingPayout, 'hasPendingPayout');
  if (
    moneyBalance == null ||
    lifetimeEarnedMoney == null ||
    tossPointAmount == null ||
    hasPendingPayout == null
  ) {
    return null;
  }

  return {
    summaryDate,
    wallet: {
      moneyBalance,
      lifetimeEarnedMoney,
    },
    pendingPayout: {
      tossPointAmount,
      hasPendingPayout,
    },
    walletBoard,
    attendance,
    missions: {
      stockQuiz,
      pricePrediction,
    },
    predictionAccuracy,
  };
}
```

### 8.3 메시지

`constants/messages/benefitMessages.ts`는 다음처럼 전체 교체합니다.

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
  readonly attendanceSubtitle: string;
  readonly attendanceCta: string;
  readonly attendanceStatus: string;
  readonly attendanceReadyStatus: string;
  readonly attendanceCompletedStatus: string;
  readonly attendanceSuccessMessage: string;
  readonly attendanceStreakSuccessMessage: string;
  readonly predictionTitle: string;
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
      { id: 'pending', label: '지급 대기', value: '0P' },
    ],
    guestLockedStatus: '로그인 후 이용 가능',
    guestNoticeMessage: '로그인하면 출석, 예측, 퀴즈와 토스 포인트 받기를 이용할 수 있습니다.',
    summaryLoadError: '혜택 지갑 정보를 불러오지 못했습니다.',
    authRequiredMessage: '로그인 세션을 확인한 뒤 다시 시도해 주세요.',
    networkErrorMessage: '네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
    genericActionError: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    attendanceTitle: '출석체크',
    attendanceSubtitle: '하루 한 번 출석하고 연속 출석 보너스를 준비합니다.',
    attendanceCta: '출석체크하기',
    attendanceStatus: '상태 확인 중',
    attendanceReadyStatus: '오늘 출석 가능',
    attendanceCompletedStatus: '오늘 출석 완료',
    attendanceSuccessMessage: '출석 보상이 지갑에 반영되었습니다.',
    attendanceStreakSuccessMessage: '출석 보상과 연속 출석 보너스가 지갑에 반영되었습니다.',
    predictionTitle: '주식 가격 예측',
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
      { id: 'pending', label: 'Pending', value: '0P' },
    ],
    guestLockedStatus: 'Available after login',
    guestNoticeMessage: 'Log in to use attendance, predictions, quizzes, and Toss Point redemption.',
    summaryLoadError: 'Could not load your benefit wallet.',
    authRequiredMessage: 'Please check your login session and try again.',
    networkErrorMessage: 'Please check your network connection and try again.',
    genericActionError: 'We could not process the request. Please try again later.',
    attendanceTitle: 'Attendance',
    attendanceSubtitle: 'Check in once a day and prepare streak bonuses.',
    attendanceCta: 'Check In',
    attendanceStatus: 'Checking status',
    attendanceReadyStatus: 'Ready today',
    attendanceCompletedStatus: 'Checked in today',
    attendanceSuccessMessage: 'Attendance reward has been added to your wallet.',
    attendanceStreakSuccessMessage: 'Attendance and streak bonus rewards have been added to your wallet.',
    predictionTitle: 'Stock Price Prediction',
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

### 8.4 표시 포맷터

```ts
const PERCENT_SCALE = 100;
const PERCENT_DECIMAL_PLACES = 0;
const PERCENT_ROUNDING_SCALE = 10 ** PERCENT_DECIMAL_PLACES;

function formatPredictionAccuracyText(
  summary: BenefitSummary | null,
  copy: BenefitMessages,
): string {
  const predictionAccuracy = summary?.predictionAccuracy ?? null;
  if (predictionAccuracy == null || predictionAccuracy.settledAttempts <= 0) {
    return copy.predictionLastAccuracyEmptyLabel;
  }

  const rawPercent = predictionAccuracy.accuracyRate * PERCENT_SCALE;
  const roundedPercent =
    Math.round((rawPercent + Number.EPSILON) * PERCENT_ROUNDING_SCALE) /
    PERCENT_ROUNDING_SCALE;

  return `${copy.predictionLastAccuracyLabel}: ${roundedPercent.toFixed(PERCENT_DECIMAL_PLACES)}%`;
}
```

### 8.5 BenefitQuestCard prop

정답률 라벨은 제목을 다시 렌더링하지 않고 공통 카드의 보조 라벨로만 전달합니다.

```ts
interface BenefitQuestCardProps {
  readonly title: string;
  readonly subtitle: string;
  readonly ctaLabel?: string;
  readonly loadingLabel: string;
  readonly statusLabel: string;
  readonly icon: React.ReactNode;
  readonly accentClassName: string;
  readonly metaLabel?: string;
  readonly isCtaLoading?: boolean;
  readonly isCtaDisabled?: boolean;
  readonly children?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly onCtaClick?: () => void;
}
```

`BenefitQuestCard`의 기존 제목 아래에만 보조 라벨을 추가합니다.

```tsx
export function BenefitQuestCard({
  title,
  subtitle,
  ctaLabel,
  loadingLabel,
  statusLabel,
  icon,
  accentClassName,
  metaLabel,
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
      <h3 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
        {title}
      </h3>
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

### 8.6 PredictionQuestCard prop

```ts
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
```

`PredictionQuestCard`는 현재 구조처럼 제목을 직접 렌더링하지 않고 `BenefitQuestCard`에 prop으로 전달합니다.

```tsx
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

`Benefits.tsx`에서 전달:

```tsx
const predictionLastAccuracyLabel = formatPredictionAccuracyText(summary, copy);

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
```

## 9. QA SQL

### 9.1 오늘 생성된 문제 수

```sql
SELECT
  question_date,
  status,
  count(*) AS question_count
FROM public.benefit_prediction_questions
GROUP BY question_date, status
ORDER BY question_date DESC, status;
```

### 9.2 정산 대기 문제

```sql
SELECT
  q.symbol,
  q.question_date,
  q.base_trade_date,
  q.base_close
FROM public.benefit_prediction_questions q
WHERE q.status = 'open'
  AND NOT EXISTS (
    SELECT 1
    FROM public.stock_prices sp
    WHERE upper(btrim(sp.symbol)) = q.symbol
      AND sp.trade_date > q.base_trade_date
      AND sp.close > 0
  )
ORDER BY q.question_date DESC, q.symbol;
```

### 9.3 사용자별 최근 정답률

```sql
SELECT
  user_id,
  result_trade_date,
  correct_attempts,
  settled_attempts,
  round(accuracy_rate * 100, 2) AS accuracy_percent
FROM public.benefit_prediction_accuracy_summaries
ORDER BY updated_at DESC;
```

### 9.4 정리 후 잔여 오래된 기록

```sql
SELECT
  q.result_trade_date,
  count(a.id) AS attempt_count,
  count(DISTINCT q.id) AS question_count
FROM public.benefit_prediction_questions q
LEFT JOIN public.benefit_prediction_attempts a
  ON a.question_id = q.id
WHERE q.status = 'settled'
GROUP BY q.result_trade_date
ORDER BY q.result_trade_date;
```
