# Supabase 호출 요약 (현재 상태)

**최종 갱신**: 2026-01-30  
서버에 **언제** 요청이 가는지, **읽기(select)·쓰기(insert/upsert/update/delete)** 로 서버 비용이 언제 발생하는지 정리합니다.

---

## 1. 서버 비용 발생 시점 한눈에 보기

| 구분 | 시점 (트리거) | 테이블/연산 | 비용 |
|------|----------------|-------------|------|
| **앱 로드/새로고침** | 세션 확인 후 로그인 상태면 | `getSession` (Auth) | Auth |
| | | `user_profiles` **select** (fetchUserProfile) | 읽기 1회 |
| | | `portfolios` **select** (fetchPortfoliosFromSupabase) | 읽기 1회 |
| **모달 로그인 성공** | signIn 성공 → onLogin 콜백 | `fetchPortfolios(userId)` → `portfolios` **select** | 읽기 1회 |
| | | `fetchUserProfile(userId)` → `user_profiles` **select** | 읽기 1회 |
| **세션 복구 시 FCM** | checkUser 후 세션 있으면 | `saveFCMToken(userId)` → `user_devices` **upsert** | 쓰기 1회 |
| **SIGNED_IN 이벤트 시 FCM** | onAuthStateChange SIGNED_IN | `saveFCMToken(userId)` → `user_devices` **upsert** | 쓰기 1회 |
| **프로필 모달 열 때** | authModal === 'profile' | `user_profiles` **select** | 읽기 1회 |
| **대시보드 요약 변경** | summaryToSave 변경 후 **3초 디바운스** | `daily_execution_summaries` **upsert** | 쓰기 1회 |
| **언어 변경** | 설정에서 언어 토글 | `user_profiles` **update** (preferred_language) | 쓰기 1회 |
| **포트폴리오 생성** | StrategyCreator에서 저장 | `portfolios` **insert** | 쓰기 1회 |
| **포트폴리오 수정** | 이름/전략/알람/is_quarter_mode 저장 | `portfolios` **update** | 쓰기 1회 |
| **거래 추가** | QuickInput/Execution 모달에서 저장 | `portfolios` **update** (trades) | 쓰기 1회 |
| **거래 삭제** | 상세 모달에서 거래 삭제 | `portfolios` **update** (trades) | 쓰기 1회 |
| **쿼터 모드 해제** | 매도로 24%/99% 감소 시 | `portfolios` **update** (is_quarter_mode: false) | 쓰기 1회 |
| **전략 종료** | handleClosePortfolio | `portfolio_history` **insert** | 쓰기 1회 |
| | | `portfolios` **update** (is_closed, closed_at, trades 등) | 쓰기 1회 |
| **포트폴리오 삭제** | 대시보드에서 삭제 | `portfolios` **delete** | 쓰기 1회 |
| **이력 단건 삭제** | History 탭에서 삭제 | `portfolio_history` **delete** | 쓰기 1회 |
| | | `portfolios` **delete** (해당 종료 포트폴리오) | 쓰기 1회 |
| **이력 전체 삭제** | History 탭에서 전체 삭제 | `portfolio_history` **delete** (user_id) | 쓰기 1회 |
| | | `portfolios` **delete** (is_closed: true) | 쓰기 1회 |
| **로그아웃** | 프로필 모달 등에서 로그아웃 | `signOut` (Auth) | Auth |
| **회원가입** | AuthModals signUp | `signUp` (Auth) | Auth |
| **로그인(이메일)** | AuthModals signInWithPassword | `signInWithPassword` (Auth) | Auth |
| **비밀번호 재설정 요청** | 비밀번호 잊음 | `resetPasswordForEmail` (Auth) | Auth |
| **비밀번호/이메일 변경** | 프로필 모달 | `updateUser` (Auth) | Auth |
| **OAuth 로그인** | 소셜 로그인 | `signInWithOAuth` (Auth) | Auth |
| **텔레그램 연결 요청** | "텔레그램 연결하기" 클릭 | `telegram_link_tokens` **insert** | 쓰기 1회 |
| **주가 조회** | 대시/차트/매매 등 (IndexedDB 미보유 시) | `stock_prices` **select** | 읽기 (종목·기간별) |
| **알람 트리거 (Edge)** | 스케줄/트리거 | `portfolios` **select** (alarm_config) | 읽기 1회 |
| **알람 발송 (Edge)** | check-and-trigger-alarms 호출 시 | RPC `get_alarm_payload` | RPC 1회 |
| | 텔레그램/FCM 발송 후 | `user_profiles` **update** (telegram_last_error 등) | 쓰기 |
| | | `user_devices` **update** (last_notification_sent_at, is_active) | 쓰기 |
| | | `sent_alarms` **insert** (이력) | 쓰기 |
| **텔레그램 봇 /start** | 사용자가 봇에 토큰 입력 | `telegram_link_tokens` **select** → **delete** | 읽기 1회, 쓰기 1회 |
| | | `user_profiles` **update** (telegram_chat_id 등) | 쓰기 1회 |
| **주가 배치 갱신 (Edge)** | update-stock-prices 스케줄 | `stock_prices` **upsert** (배치) | 쓰기 1회 |
| **푸시 알림 (Edge)** | push-notification 호출 시 | `user_devices` **select** → **update** | 읽기, 쓰기 |

---

## 2. Auth (supabase.auth.*) — 시점별

| 시점 | 호출 | 파일 | 비고 |
|------|------|------|------|
| 앱 로드 | `getSession` | App.tsx (checkUser), supabase.ts | 세션 복구 |
| 로그인(이메일) | `signInWithPassword` | AuthModals.tsx | 이메일·비밀번호 로그인 |
| 로그아웃 | `signOut` | App.tsx, AuthModals.tsx | 로컬/전역 |
| 회원가입 | `signUp` | AuthModals.tsx | 이메일 회원가입 |
| OAuth 로그인 | `signInWithOAuth` | AuthModals.tsx | 소셜 로그인 |
| 비밀번호 재설정 요청 | `resetPasswordForEmail` | AuthModals.tsx | 이메일로 링크 발송 |
| 비밀번호/이메일 변경 | `updateUser({ password })` / `updateUser({ email })` | AuthModals.tsx | 프로필 모달 |
| 세션 갱신 | `refreshSession` | supabase.ts | 토큰 갱신 |
| 로그인 상태 리스너 | `onAuthStateChange` | App.tsx | 로그인/로그아웃 시 콜백 |

---

## 3. 테이블별 호출 — 연산·시점·비용

### 3.1 user_profiles

| 연산 | 시점 | 파일 | 비용 |
|------|------|------|------|
| **select** | 세션 복구·모달 로그인 후 (fetchUserProfile) | App.tsx | 읽기 |
| **select** | 프로필 모달 열릴 때 (authModal === 'profile') | App.tsx | 읽기 |
| **update** | 언어 토글 시 (preferred_language) | App.tsx | 쓰기 |
| **update** | 텔레그램 발송 성공/실패 후 (telegram_last_error) | send-alarm (Edge) | 쓰기 |
| **update** | 텔레그램 봇 연결 시 (telegram_chat_id 등) | telegram-webhook (Edge) | 쓰기 |

### 3.2 portfolios

| 연산 | 시점 | 파일 | 비용 |
|------|------|------|------|
| **select** | 로그인/세션 복구 시 (fetchPortfolios → fetchPortfoliosFromSupabase) | App.tsx | 읽기 |
| **select** | 알람 트리거 시 (alarm_config 있는 포트폴리오) | check-and-trigger-alarms (Edge) | 읽기 |
| **insert** | 새 포트폴리오 생성 (StrategyCreator 저장) | App.tsx | 쓰기 |
| **update** | 포트폴리오 수정 (이름/전략/알람/is_quarter_mode) | App.tsx | 쓰기 |
| **update** | 거래 추가 (trades) | App.tsx | 쓰기 |
| **update** | 거래 삭제 (trades) | App.tsx | 쓰기 |
| **update** | 쿼터 모드 해제 (is_quarter_mode: false) | App.tsx | 쓰기 |
| **update** | 전략 종료 (is_closed, closed_at, trades 등) | App.tsx | 쓰기 |
| **delete** | 포트폴리오 삭제 (대시보드) | App.tsx | 쓰기 |
| **delete** | 이력 단건/전체 삭제 시 (종료된 포트폴리오 행) | App.tsx (History 콜백) | 쓰기 |

### 3.3 portfolio_history

| 연산 | 시점 | 파일 | 비용 |
|------|------|------|------|
| **insert** | 전략 종료 확정 시 (handleClosePortfolio) | App.tsx | 쓰기 |
| **delete** | 이력 단건 삭제 (onDeleteHistory) | App.tsx | 쓰기 |
| **delete** | 이력 전체 삭제 (onClearHistory) | App.tsx | 쓰기 |

### 3.4 daily_execution_summaries

| 연산 | 시점 | 파일 | 비용 |
|------|------|------|------|
| **upsert** | 대시보드 요약(summaryToSave) 변경 후 **3초 디바운스** (user_id + summary_date 기준) | App.tsx | 쓰기 |
| *(조회)* | 알람 발송 시 | send-alarm (Edge) | RPC `get_alarm_payload` 결과로 사용 (별도 select 없음) |

### 3.5 user_devices (FCM 푸시)

| 연산 | 시점 | 파일 | 비용 |
|------|------|------|------|
| **upsert** | 세션 복구 후·SIGNED_IN 시 saveFCMToken | App.tsx | 쓰기 |
| *(조회)* | 알람 발송 시 | send-alarm (Edge) | RPC `get_alarm_payload` 결과 사용 |
| **update** | 알람 발송 후 (last_notification_sent_at, is_active) | send-alarm (Edge) | 쓰기 |
| **select** | 푸시 알림 발송 시 | push-notification (Edge) | 읽기 |
| **update** | 푸시 발송 후 | push-notification (Edge) | 쓰기 |

### 3.6 telegram_link_tokens

| 연산 | 시점 | 파일 | 비용 |
|------|------|------|------|
| **insert** | "텔레그램 연결하기" 클릭 | AuthModals.tsx | 쓰기 |
| **select** | 봇이 /start &lt;token&gt; 수신 시 | telegram-webhook (Edge) | 읽기 |
| **delete** | 봇 연결 처리 완료 후 | telegram-webhook (Edge) | 쓰기 |

### 3.7 stock_prices

| 연산 | 시점 | 파일 | 비용 |
|------|------|------|------|
| **select** | 주가 조회 (IndexedDB 미보유 시) | stockService.ts (fetchStockPrices, loadInitialStockData, loadPaidStockData, fetchStockPriceHistory 등) | 읽기 (호출 횟수·종목 수에 비례) |
| **upsert** | 주가 배치 갱신 | update-stock-prices (Edge) | 쓰기 (배치 1회) |

### 3.8 sent_alarms (Edge)

| 연산 | 시점 | 파일 | 비용 |
|------|------|------|------|
| **insert** | 알람 발송 이력 저장 | send-alarm (Edge) | 쓰기 |

### 3.9 notifications (Edge)

| 연산 | 시점 | 파일 | 비용 |
|------|------|------|------|
| **update** | 푸시 발송 처리 후 | push-notification (Edge) | 쓰기 |

---

## 4. RPC

| RPC | 시점 | 파일 | 비용 |
|-----|------|------|------|
| **get_alarm_payload** | 알람 발송 시 (p_user_id) | send-alarm (Edge) | RPC 1회 (user_profiles + daily_execution_summaries + user_devices 대체 조회) |

---

## 5. 호출 주체별 요약

| 주체 | 읽기(select/RPC 조회) | 쓰기(insert/upsert/update/delete) |
|------|------------------------|-----------------------------------|
| **앱 (App.tsx)** | user_profiles select (fetchUserProfile, 프로필 모달), portfolios select (fetchPortfoliosFromSupabase) | daily_execution_summaries upsert, user_devices upsert, user_profiles update(언어), portfolios insert/update/delete, portfolio_history insert/delete |
| **앱 (AuthModals.tsx)** | — | telegram_link_tokens insert |
| **앱 (stockService.ts)** | stock_prices select (다양한 함수) | — |
| **앱 (supabase.ts)** | getSession, refreshSession (Auth) | — |
| **Edge: check-and-trigger-alarms** | portfolios select | — |
| **Edge: send-alarm** | get_alarm_payload (RPC) | user_profiles update, user_devices update, sent_alarms insert |
| **Edge: telegram-webhook** | telegram_link_tokens select | telegram_link_tokens delete, user_profiles update |
| **Edge: update-stock-prices** | — | stock_prices upsert (배치) |
| **Edge: push-notification** | user_devices select | user_devices update, notifications update |

---

## 6. 서버 비용이 자주 걸릴 수 있는 구간 (참고)

- **daily_execution_summaries upsert**: 요약이 바뀔 때마다 3초 디바운스 후 1회. 동일 내용이면 lastSavedSummaryRef로 생략.
- **portfolios select**: 로그인/세션 복구 시 1회 + 10초 타임아웃. 중복 요청은 AbortController로 정리.
- **stock_prices select**: IndexedDB 캐시가 없거나 갱신 조건 만족 시에만 호출 (stockService 내부 로직).
- **user_profiles select**: fetchUserProfile(세션/로그인 시), 프로필 모달 열 때 1회씩.
- **user_devices upsert**: 세션 복구 시 1회, SIGNED_IN 시 1회 (FCM 토큰 저장).

이 문서는 현재 코드 기준으로, Supabase에 요청이 나가는 **시점**과 **읽기/쓰기 비용**을 정리한 것입니다.
