# 종가 예측 문제 수명주기 개선 계획

## 결론

사용자 이해는 맞습니다.

- 매일 KST 기준 예측 문제를 생성합니다.
- 사용자는 매일 `price_prediction` 일일 한도 안에서 참여합니다. 주말/공휴일도 날짜가 바뀌면 한도는 다시 열립니다.
- 정답은 `base_trade_date` 이후 처음 들어온 `stock_prices.trade_date` 종가로 확정합니다.
- 정산이 끝나면 사용자별 최근 결과 영업일 정답률 요약값만 남깁니다.
- 정산 후 3영업일이 지난 예측 시도 기록을 먼저 삭제하고, 그다음 문제를 삭제합니다.
- 문제 노출은 랜덤처럼 보이되, 같은 사용자/같은 날짜/같은 회차에서는 항상 같은 문제를 보여줍니다.

이 방향은 현재 코드 구조를 무리하게 뒤집지 않고 구현 가능합니다. 핵심은 `benefit_prediction_questions`와 `benefit_prediction_attempts`를 영구 히스토리로 쓰지 않고, 정산 전후의 임시 작업 테이블처럼 다루는 것입니다.

## 이번 리팩토링 범위

이번 계획서는 배포 실패나 런타임 크래시를 만들 수 있는 필수 보강만 반영합니다.

반영 항목:

- `summary` Edge Function 스니펫의 `predictionAccuracy` 매핑을 현재 코드 구조에 맞게 수정합니다.
- 프론트 클라이언트가 `predictionAccuracy`를 실제로 파싱하도록 디코더 스니펫을 추가합니다.
- `select_benefit_prediction_question` RPC가 잘못된 입력을 조용히 빈 결과로 처리하지 않고 명시적으로 예외를 던지게 합니다.
- `symbol + question_date` 유니크 인덱스 생성 전에 기존 데이터의 대소문자/중복을 정리하는 cleanup SQL을 추가합니다.
- 예측 카드 UI 스니펫은 현재 구조처럼 `PredictionQuestCard -> BenefitQuestCard` prop 전달 방식으로만 확장하고, 제목을 중복 렌더링하지 않습니다.
- cleanup SQL은 `symbol`, `question_date`, `base_trade_date`, `base_close`, `result_close`가 모두 같은 문제만 병합합니다. 기준값이 다른 중복은 자동 병합하지 않고 수동 검토 대상으로 남깁니다.
- 프론트 타입 스니펫은 `BenefitSummary` 전체 필드를 누락 없이 제시합니다.
- 정산 요약 CTE는 사용자별 최신 `result_trade_date`를 1개만 선택한 뒤 해당 날짜 전체 시도를 재집계해 `user_id` PK 충돌을 막습니다.
- UI 스니펫은 prop 타입뿐 아니라 실제 컴포넌트 함수의 구조 분해 할당까지 포함한 1:1 교체 형태로 제시합니다.
- 안전하지 않은 중복 발견 시 확인 SQL과 수동 정리 SQL을 문서에 포함합니다.
- `pg_cron` 등록 스니펫은 같은 이름의 모든 기존 job을 해제한 뒤 새 job을 1개만 등록합니다.
- 문제 생성 RPC는 `stock_prices`의 종목명을 먼저 정규화한 뒤 `DISTINCT ON`으로 최신 기준가를 선택합니다.
- i18n 메시지 스니펫은 `BenefitMessages`와 `BENEFIT_MESSAGES` 전체를 1:1 교체 가능한 코드로 제시합니다.

제외 항목:

- 과거 날짜 요청 차단은 이번 구현 범위에서 제외합니다.
- 제출 시 `question_date = attempt_date` 검증 추가는 이번 구현 범위에서 제외합니다.
- `benefit_ledger_entries.source_id` 변경은 이번 구현 범위에서 제외하고 기존 장부 로직을 유지합니다.
- `select_benefit_prediction_question`의 `p_attempt_sequence = null` 추가 방어는 이번 구현 범위에서 제외하고 기존 RPC 스니펫을 유지합니다.
- 수동 cleanup 삭제 SQL의 추가 2중 방어는 이번 구현 범위에서 제외하고 기존 수동 삭제 스니펫을 유지합니다.

## 현재 구현 상태

현재 DB 구조는 이미 예측 문제와 시도 기록을 분리하고 있습니다.

- `benefit_prediction_questions`
  - `symbol`, `question_date`, `base_trade_date`, `base_close`
  - `result_trade_date`, `result_close`
  - `status`
- `benefit_prediction_attempts`
  - `user_id`, `question_id`, `attempt_date`, `attempt_sequence`
  - `selected_direction`, `is_correct`, `settled_at`
- `submit_prediction_and_claim_reward`
  - 참여 시 즉시 5머니를 지급합니다.
  - `result_close`가 없으면 `is_correct = null`로 저장합니다.
- `supabase/functions/benefits/index.ts`
  - `/prediction/question`에서 열린 예측 문제를 조회합니다.
  - 현재는 문제 생성/정산/정리 배치가 없습니다.
- `PredictionQuestCard`
  - 문제의 `symbol`, `baseClose`와 상승/하락 버튼을 보여줍니다.
  - 최근 정답률 표시는 아직 없습니다.

## 목표 동작

### 1. 문제 생성

매일 KST 날짜 기준으로 `stock_prices`의 각 종목 최신 종가를 읽어 `benefit_prediction_questions`를 생성합니다.

예시:

| symbol | question_date | base_trade_date | base_close | result_trade_date | result_close | status |
|---|---:|---:|---:|---:|---:|---|
| QQQ | 2026-05-16 | 2026-05-15 | 430.12 | null | null | open |
| TQQQ | 2026-05-16 | 2026-05-15 | 62.34 | null | null | open |

주말/공휴일에는 `question_date`는 해당 날짜가 되고, `base_trade_date`는 가장 최근 영업일이 됩니다. 정답은 이후 처음 들어온 영업일 종가로 확정합니다.

### 2. 랜덤 노출

별도 배정 테이블을 만들지 않습니다.

대신 DB에서 다음 값을 조합해 안정적인 해시 정렬을 합니다.

- `user_id`
- `attempt_date`
- `attempt_sequence`
- `question_id`

그러면 저장 공간을 늘리지 않고도 다음 조건을 만족합니다.

- 같은 사용자
- 같은 날짜
- 같은 회차

위 세 값이 같으면 항상 같은 문제가 나옵니다. 날짜나 회차가 바뀌면 다른 문제가 나올 수 있습니다.

단, 같은 날짜 안에서 후보 문제 목록 자체가 바뀌면 해시 정렬 결과도 바뀔 수 있습니다. 따라서 문제 생성 배치는 사용자 노출 전에 1회 완료하고, 운영 중간에는 같은 `question_date`에 새 문제를 추가하지 않는 정책을 권장합니다.

### 3. 정산

`base_trade_date`보다 이후인 첫 번째 `stock_prices.trade_date`가 생기면 정산합니다.

- `result_trade_date` 저장
- `result_close` 저장
- `benefit_prediction_attempts.is_correct` 업데이트
- `benefit_prediction_attempts.settled_at` 업데이트
- 사용자별 최근 결과 영업일 정답률 요약값 업데이트

정답률은 전체 누적이 아니라 최근 결과 영업일 기준입니다.

예시:

| user_id | result_trade_date | correct_attempts | settled_attempts | accuracy_rate |
|---|---:|---:|---:|---:|
| user-a | 2026-05-18 | 3 | 5 | 0.6000 |

프론트에는 `직전 정답률: 60%`처럼 표시합니다.

### 4. 정리

정산 후 3영업일은 문제와 시도 기록을 보관합니다.

3영업일이 지나면 다음 순서로 정리합니다.

1. `benefit_prediction_attempts`에서 오래된 정산 시도 기록 삭제
2. `benefit_prediction_questions`에서 오래된 정산 문제 삭제
3. 필요하면 `benefit_mission_daily_states`의 오래된 `price_prediction` 상태도 삭제

이 순서를 지키면 `question_id` FK 때문에 삭제가 막히지 않습니다.

단, `benefit_ledger_entries`는 머니 지급 감사 장부이므로 삭제하지 않습니다. 시도 기록은 지워도, 지급 장부에는 `source = price_prediction_attempt`, `delta_money = 5`, `money_balance_after`가 남습니다.

## 설계 변경

### DB

추가할 항목:

- 사용자별 최근 예측 정답률 요약 테이블
- `benefit_prediction_questions(symbol, question_date)` 중복 방지 인덱스
- 예측 문제 선택 RPC
- 문제 생성 RPC
- 정산 RPC
- 정리 RPC

기존 테이블은 유지합니다. `benefit_prediction_attempts`는 정산 전후 3영업일 동안만 유지되는 임시성 기록으로 역할을 바꿉니다.

### Edge Function

`supabase/functions/benefits/index.ts` 변경:

- `/summary` 응답에 `predictionAccuracy` 추가
- `/prediction/question`에서 직접 첫 번째 문제를 고르지 않고, 안정적 랜덤 선택 RPC 호출
- 문제 조회 조건을 `question_date <= attemptDate`에서 `question_date = attemptDate`로 바꿉니다.

운영 배치:

- 기본 실행 경로는 Supabase DB의 `pg_cron` 예약 작업입니다.
- `pg_cron`에서 매일 KST 오전 7시 5분에 `run_benefit_prediction_maintenance()`를 호출합니다.
- 외부 Cron은 DB cron 장애 시 임시 fallback으로만 사용합니다.

### Frontend

`BenefitSummary` 타입에 최근 예측 정답률 필드 추가:

- `resultTradeDate`
- `correctAttempts`
- `settledAttempts`
- `accuracyRate`

`PredictionQuestCard`에 primitive prop으로 전달:

- `lastAccuracyLabel`

카드에서는 제목/아이콘 근처에 `직전 정답률: 60%`를 표시합니다.

## 구현 순서

1. DB 마이그레이션 추가
   - 요약 테이블
   - 인덱스
   - 생성/선택/정산/정리 RPC
2. Edge Function 수정
   - `/summary`에 정답률 요약 포함
   - `/prediction/question` 선택 RPC 사용
3. Frontend 타입과 UI 수정
   - `BenefitSummary` 타입 확장
   - i18n 메시지 추가
   - `PredictionQuestCard`에 정답률 표시
4. 배치 실행 경로 추가
   - Supabase DB의 `pg_cron` 예약 작업으로 `run_benefit_prediction_maintenance()` 호출
5. QA
   - 문제 생성
   - 같은 사용자/날짜/회차 고정 확인
   - 날짜/회차 변경 시 다른 후보 가능 확인
   - 정산 후 요약값 저장 확인
   - 3영업일 이후 시도 기록과 문제 삭제 확인

## 배포 체크리스트

- 마이그레이션 적용
- `benefits` Edge Function 재배포
- 배치 실행 경로 등록
- Cloudflare/AIT 프론트 재배포
- `VITE_BENEFIT_PREVIEW_ENABLED`는 운영에서 `false`

## 리스크와 방어

- `stock_prices`가 비어 있으면 문제를 만들지 않습니다.
- `base_close <= 0`인 데이터는 문제 생성 대상에서 제외합니다.
- 정답률 계산은 `settled_attempts > 0`일 때만 수행해 0 나눗셈을 막습니다.
- 같은 문제를 여러 번 생성하지 않도록 `symbol + question_date` 유니크 인덱스를 둡니다.
- 문제 선택은 별도 상태 저장 없이 해시 정렬로 처리해 데이터 증가를 막습니다.
- 정산/삭제는 RPC 하나 안에서 순서를 고정해 FK 오류를 방지합니다.
