# 2025-01-28 작업 요약

## 1. 마이그레이션 주석 스타일 통일
- **파일**: `supabase/migrations/20250128003000_add_preferred_language_to_user_profiles.sql`
- **내용**: `telegram_link_tokens.sql`처럼 **목적 / 사용 / 날짜** 한 줄씩 정리하는 형식으로 주석 수정 (실제 SQL 변경 없음 → 재실행 불필요)

---

## 2. 주말 알람 동작 확인
- **결과**: `check-and-trigger-alarms`에 이미 **KST 기준 주말(토·일) 스킵** 로직이 있음
- 토·일에는 알람 트리거하지 않고 `skipped: "weekend"` 로 응답

---

## 3. 다분할 매매 – 쿼터 손절 모드 토글 제거 (플래그 기반으로 전환)

### 3.1 DB·타입
- **마이그레이션**: `20250128004000_add_is_quarter_mode_to_portfolios.sql`  
  - `portfolios` 테이블에 `is_quarter_mode boolean NOT NULL DEFAULT false` 추가
- **타입**: `Portfolio`에 `isQuarterMode?: boolean` 추가

### 3.2 플래그 규칙
- **진입**: T > a-1 이면 `is_quarter_mode = true` (Dashboard에서 1회 갱신 후 DB 저장)
- **해제**  
  - LOC 매도 체결로 보유 수량 **24% 이상 감소** → false  
  - +A% 지정가 매도로 보유 수량 **99% 이상 감소**(수량 0) → false  

### 3.3 코드 변경
- **App.tsx**: 로그인/포트폴리오 로드 시 `is_quarter_mode` 매핑, `handleUpdatePortfolio`에 반영, `handleAddTrade`에서 매도 시 위 규칙으로 해제
- **Dashboard**: 쿼터 손절 **토글 UI 제거**, `isInQuarterMode = portfolio.isQuarterMode === true` 로만 표시·계산, T > a-1 이고 플래그가 false일 때 한 번만 `onUpdatePortfolio`로 true 저장
- **dailyExecutionSummary**: `buildDailyExecutionSummary` 추가, 쿼터 모드 여부는 `portfolio.isQuarterMode` 사용

---

## 4. 텔레그램 알람 메시지 예시 문서화
- **파일**: `docs/TELEGRAM_ALARM_MESSAGE_EXAMPLES.md`
- **내용**: 다분할 매매 기준으로 텔레그램으로 오는 메시지 예시 정리  
  - 전반전 / 후반전 / 쿼터(MOC 전) / 쿼터(MOC 후) / 계산 불가(폴백) 경우별 예시

---

## 5. 텔레그램 상세 daily execution 반영 (완료)
- **PortfolioCard**: `formatPortfolioDailyExecutionBlock`로 전반전/후반전/쿼터별 LOC·MOC·지정가 데이터 포함 블록 생성 후 `onDailyExecutionBlock(block)` 호출
- **App**: `dailyExecutionSummaryFromDashboard` 상태 추가, Dashboard에서 넘어온 요약을 우선 사용해 `daily_execution_summaries`에 upsert (없으면 기존 `buildDailyExecutionSummary` fallback)
- **결과**: 알람 시 텔레그램 메시지에 LOC 매수1·2, LOC 매도, 지정가, MOC 수량, 1회 매수금 등 상세 라인이 포함됨

---

## 실행 필요 사항
- **마이그레이션**: `20250128004000_add_is_quarter_mode_to_portfolios.sql` 한 번 적용 필요  
  (`supabase db push` 또는 `supabase migration up`)
