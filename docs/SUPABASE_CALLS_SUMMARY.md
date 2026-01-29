# Supabase 호출 경우의 수 요약

서비스에서 Supabase를 호출하는 **모든 경우**를 테이블·연산·시점 기준으로 정리합니다. (최종 갱신: 2025-01-28)

---

## 최적화 요약 (2025-01-28)

- **send-alarm**: user_profiles + daily_execution_summaries + user_devices 를 **RPC `get_alarm_payload(p_user_id)` 한 번**으로 조회 (기존 3회 select → 1회 RPC). 알람 발송 시 추가 호출은 user_profiles update, user_devices update 만.
- **portfolios**: 모달 로그인 시 onLogin에서 직접 select 하지 않고 `fetchPortfolios(u.id)` + `fetchUserProfile(u.id)` 만 호출. `onAuthStateChange`에서 방금 로그인한 경우 `fetchUserData` 스킵하여 **중복 조회 제거**. 포트폴리오 조회는 **fetchPortfoliosFromSupabase** 단일 경로.
- **update-stock-prices**: **배치 upsert** (rows 배열 한 번에 upsert). 종목별 개별 호출 아님.

---

## 1. Auth (supabase.auth.*)

| 시점 | 호출 | 파일 | 설명 |
|------|------|------|------|
| 로그인(이메일) | `signInWithPassword` | AuthModals.tsx | 이메일·비밀번호 로그인 |
| 로그아웃 | `signOut` | App.tsx, AuthModals.tsx | 로컬/전역 로그아웃 |
| 회원가입 | `signUp` | AuthModals.tsx | 이메일 회원가입 |
| OAuth 로그인 | `signInWithOAuth` | AuthModals.tsx | 소셜 로그인 |
| 비밀번호 재설정 요청 | `resetPasswordForEmail` | AuthModals.tsx | 이메일로 재설정 링크 발송 |
| 비밀번호 변경 | `updateUser({ password })` | AuthModals.tsx | 새 비밀번호 저장 |
| 이메일 변경 | `updateUser({ email })` | AuthModals.tsx | 새 이메일 저장 |
| 세션 조회 | `getSession` | App.tsx, supabase.ts | 현재 세션 확인 |
| 세션 갱신 | `refreshSession` | supabase.ts | 토큰 갱신 |
| 로그인 상태 리스너 | `onAuthStateChange` | App.tsx | 로그인/로그아웃 시 콜백 |

---

## 2. RPC (supabase.rpc)

| RPC 이름 | 시점 | 파일 | 설명 |
|----------|------|------|------|
| **get_alarm_payload** | 알람 발송 시 | send-alarm (Edge) | `p_user_id` 로 프로필·요약 텍스트·FCM 토큰 배열을 한 번에 조회 (user_profiles + daily_execution_summaries + user_devices 대체) |

---

## 3. 테이블별 호출 (supabase.from(...))

### 3.1 user_profiles

| 연산 | 시점 | 파일 | 설명 |
|------|------|------|------|
| **select** | 세션 복구·모달 로그인 후 | App.tsx (fetchUserProfile) | subscription_tier, max_portfolios, telegram_enabled, preferred_language 등 조회 |
| **update** | 언어 토글 시 | App.tsx | preferred_language 업데이트 |
| **update** | 텔레그램 발송 성공/실패 후 | send-alarm (Edge) | telegram_last_error 갱신 |
| **update** | 텔레그램 봇 연결 시 | telegram-webhook (Edge) | telegram_chat_id, telegram_enabled 등 저장 |

※ 알람 발송 시 프로필·구독·언어 조회는 RPC `get_alarm_payload` 결과 사용 (별도 select 없음).

---

### 3.2 portfolios

| 연산 | 시점 | 파일 | 설명 |
|------|------|------|------|
| **select** | 세션 복구·모달 로그인 시 (단일 경로) | App.tsx (fetchPortfoliosFromSupabase) | 해당 user_id 포트폴리오 조회 (필요 컬럼 + is_quarter_mode), 로컬 캐시 후 백그라운드 갱신 |
| **select** | 알람 트리거 시 | check-and-trigger-alarms (Edge) | alarm_config 있는 포트폴리오만 조회 (user_id, alarm_config, is_closed) |
| **insert** | 새 포트폴리오 생성 | App.tsx (handleAddPortfolio) | StrategyCreator에서 저장 시 |
| **update** | 포트폴리오 수정 | App.tsx (handleUpdatePortfolio) | 이름/전략/알람 설정/is_quarter_mode 등 저장 |
| **update** | 거래 추가 | App.tsx (handleAddTrade) | trades 업데이트 |
| **update** | 쿼터 모드 해제 | App.tsx (handleAddTrade 내부) | 매도로 24%/99% 감소 시 is_quarter_mode: false |
| **update** | 거래 삭제 | App.tsx (handleDeleteTrade) | trades 업데이트 |
| **update** | 전략 종료 | App.tsx (handleClosePortfolio) | is_closed, closed_at, final_sell_amount, trades |
| **delete** | 포트폴리오 삭제 | App.tsx (handleDeletePortfolio) | 단일 포트폴리오 삭제 |
| **delete** | 이력 전체 삭제 시 | App.tsx (History) | 종료된 포트폴리오 삭제 |

※ 모달 로그인 시 onLogin에서는 직접 select 하지 않고 fetchPortfolios(u.id) + fetchUserProfile(u.id) 만 호출.

---

### 3.3 portfolio_history

| 연산 | 시점 | 파일 | 설명 |
|------|------|------|------|
| **insert** | 전략 종료 확정 시 | App.tsx (handleClosePortfolio) | 종료된 포트폴리오 스냅샷 저장 |
| **delete** | 이력 단건 삭제 | App.tsx (History) | 해당 history 행 삭제 |
| **delete** | 이력 전체 삭제 | App.tsx (History) | 해당 user의 history 전부 삭제 |

---

### 3.4 daily_execution_summaries

| 연산 | 시점 | 파일 | 설명 |
|------|------|------|------|
| **upsert** | 로그인/포트폴리오/언어/대시보드 요약 변경 시 | App.tsx | 알람 메시지용 요약 텍스트 저장 (user_id + summary_date 기준) |
| *(조회)* | 알람 발송 시 | send-alarm (Edge) | RPC `get_alarm_payload` 결과의 summary_text 사용 (별도 select 없음) |

---

### 3.5 user_devices (FCM 푸시)

| 연산 | 시점 | 파일 | 설명 |
|------|------|------|------|
| **upsert** | FCM 토큰 등록/갱신 | App.tsx | user_id, fcm_token, device_type 등 저장 |
| *(조회)* | 알람 발송 시 | send-alarm (Edge) | RPC `get_alarm_payload` 결과의 fcm_tokens 사용 (별도 select 없음) |
| **update** | 알람 발송 후 (유효하지 않은 토큰) | send-alarm (Edge) | is_active: false |
| **update** | 알람 발송 후 (성공한 토큰) | send-alarm (Edge) | last_notification_sent_at 갱신 |
| **select** | 푸시 알림 발송 시 | push-notification (Edge) | fcm_token, device_name 조회 |
| **update** | 푸시 발송 후 | push-notification (Edge) | last_notification_sent_at, is_active, notifications 테이블 등 |

---

### 3.6 telegram_link_tokens

| 연산 | 시점 | 파일 | 설명 |
|------|------|------|------|
| **insert** | "텔레그램 연결하기" 클릭 | AuthModals.tsx | user_id + token 저장 |
| **select** | 봇이 /start &lt;token&gt; 수신 시 | telegram-webhook (Edge) | token으로 user_id 조회 |
| **delete** | 봇 연결 처리 완료 후 | telegram-webhook (Edge) | 사용한 토큰 삭제 |

---

### 3.7 stock_prices

| 연산 | 시점 | 파일 | 설명 |
|------|------|------|------|
| **select** | 주가 조회 | stockService.ts | symbol, close, trade_date 등 조회 (다양한 함수에서 사용) |
| **upsert** | 주가 배치 갱신 | update-stock-prices (Edge) | rows 배열 한 번에 upsert (symbol + trade_date 기준) |

---

### 3.8 notifications (Edge Function 내부)

| 연산 | 시점 | 파일 | 설명 |
|------|------|------|------|
| **update** | 푸시 발송 처리 후 | push-notification (Edge) | 알림 읽음/처리 상태 등 갱신 |

---

## 4. 호출 주체별 요약

| 주체 | Auth | RPC | 테이블 호출 |
|------|------|-----|-------------|
| **앱 (App.tsx)** | getSession, onAuthStateChange, signOut(로그아웃 시) | — | user_profiles select/update, portfolios select/insert/update/delete, portfolio_history insert/delete, daily_execution_summaries upsert, user_devices upsert |
| **앱 (AuthModals.tsx)** | signInWithPassword, signUp, signInWithOAuth, updateUser, resetPasswordForEmail | — | telegram_link_tokens insert |
| **앱 (stockService.ts)** | — | — | stock_prices select |
| **앱 (supabase.ts)** | getSession, refreshSession | — | — |
| **Edge: check-and-trigger-alarms** | — | — | portfolios select |
| **Edge: send-alarm** | — | get_alarm_payload | user_profiles update, user_devices update |
| **Edge: telegram-webhook** | — | — | telegram_link_tokens select/delete, user_profiles update |
| **Edge: update-stock-prices** | — | — | stock_prices upsert (배치) |
| **Edge: push-notification** | — | — | user_devices select/update, notifications update |

---

## 5. 한 줄 요약

- **Auth**: 로그인/로그아웃/회원가입/OAuth/비밀번호·이메일 변경/세션 조회·갱신·리스너  
- **RPC**: get_alarm_payload (알람 발송 시 프로필·요약·FCM 토큰 한 번에 조회)  
- **user_profiles**: 조회(앱 fetchUserProfile), 언어 업데이트(앱), 텔레그램 에러 업데이트(send-alarm), 봇 연결 시 업데이트(telegram-webhook)  
- **portfolios**: 조회(앱 fetchPortfoliosFromSupabase 단일 경로), 추가·수정·거래·종료·삭제(앱), 알람 트리거 시 조회(Edge)  
- **portfolio_history**: 종료 시 insert, 이력 삭제 시 delete(앱)  
- **daily_execution_summaries**: 요약 upsert(앱), 알람 시 조회는 RPC 결과 사용(Edge)  
- **user_devices**: FCM 토큰 upsert(앱), 알람 시 조회는 RPC 결과 사용(Edge), 알람/푸시 후 update(Edge)  
- **telegram_link_tokens**: 연결 요청 시 insert(앱), 봇 /start 시 select·delete(Edge)  
- **stock_prices**: 주가 조회(앱 stockService), 배치 upsert(Edge update-stock-prices)
