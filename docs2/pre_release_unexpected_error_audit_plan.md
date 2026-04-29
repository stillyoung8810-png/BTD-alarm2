---
name: 출시 전 예상치 못한 오류 감사 계획서
overview: 기존 유료 결제 출시 게이트 감사에서 다루지 않는 전역 P0/P1 리스크를 출시 직전에 읽기 전용으로 점검하기 위한 계획입니다.
stage: pre-release-audit
status: draft
related_plan: docs2/paid_payment_release_gate_audit_plan.md
---

# 출시 전 예상치 못한 오류 감사 계획서

## 목적

이 문서는 `docs2/paid_payment_release_gate_audit_plan.md`에 없는 출시 전 리스크를 별도로 점검하기 위한 감사 계획서입니다.

목표는 100% 모든 미지의 버그를 보장 제거하는 것이 아니라, 출시 직전 기준으로 **P0/P1 장애 가능성을 체계적으로 줄이는 것**입니다. 감사는 먼저 Ask mode 수준의 읽기 전용 조사로 수행하고, 실제 수정은 별도 승인 후 Agent mode에서 진행합니다.

## 기존 결제 게이트 문서와의 분리

아래 항목은 기존 유료 결제 출시 게이트 문서의 주 범위이므로 이 문서에서 반복하지 않습니다.

- Toss IAP 성공, 실패, 취소, 중복 클릭, 중복 지급 방지
- 결제 후 PRO entitlement 반영
- 결제 CTA 노출 조건과 Premium 결제 경로 차단
- Checkout modal의 작은 화면 안정성
- 결제 금액, SKU, Toss IAP 환경변수, 환불 안내
- 결제 CTA 긴급 차단 기준

이 문서는 결제 자체가 아니라, 결제 외부에서 출시를 막을 수 있는 전역 리스크를 다룹니다. 단, 권한/티어, WebView, async, DB, 테스트 게이트처럼 결제와 접점이 있는 항목은 **결제 플로우 세부가 아닌 시스템 전체 관점**으로 점검합니다.

## 감사 원칙

- 추정만으로 결론을 내리지 않고, 실제 파일·테스트·환경 흐름에서 확인한 증거를 남깁니다.
- P0는 출시 차단, P1은 출시 전 수정 또는 명시적 승인 필요, P2는 후속 개선으로 분리합니다.
- 코드 수정 없이 먼저 리스크를 식별하고, 각 이슈에 재현 경로와 최소 수정 방향을 붙입니다.
- 금융 계산, 권한 제한, 데이터 쓰기, 알림 발송처럼 사용자 피해가 큰 경로를 우선합니다.
- 기존 테스트가 없는 영역은 “테스트 없음” 자체를 리스크로 기록합니다.

## 산출물

감사 완료 후 별도 결과 문서를 남깁니다.

- 권장 파일명: `docs2/pre_release_unexpected_error_audit_result.md`
- 포함 내용: P0/P1 발견 목록, 근거 파일, 재현 절차, 출시 차단 여부, 수정 우선순위, 테스트 보강 제안

## P0 감사 영역

### P0-1. 앱 부팅과 인증 세션 복구

검증 대상:

- `App.tsx`
- 인증 provider와 session restore 경로
- Toss 사용자 식별값 저장/조회 경로
- 로그인 전용 화면과 비로그인 fallback

점검 질문:

- 앱 첫 진입, 새로고침, Toss 앱 복귀 시 loading이 영구 고착되지 않는가?
- 세션이 없거나 만료됐을 때 white screen 없이 로그인/안내 화면으로 이동하는가?
- 프로필 조회 실패가 전체 앱 렌더링 실패로 번지지 않는가?
- 로그인 직후 사용자 프로필, 구독 티어, 사용량 제한이 서로 다른 상태로 남지 않는가?

출시 차단 기준:

- 앱 진입 후 사용자가 아무 화면도 보지 못하는 상태가 재현됩니다.
- 세션 만료나 프로필 조회 실패가 무한 loading으로 이어집니다.
- 무료/유료 권한 판단에 필요한 최소 프로필 데이터가 없는데 제한 로직이 열린 상태로 동작합니다.

권장 검증:

```powershell
npm run typecheck
npm test -- App
```

### P0-2. 전역 Toss WebView 안정성

검증 대상:

- Toss WebView 진입점
- `@apps-in-toss/web-framework` bridge 호출부
- viewport, safe-area, keyboard inset을 사용하는 공통 레이아웃
- 앱 background/foreground 복귀 시 실행되는 effect

점검 질문:

- Toss bridge rejection이 unhandled promise rejection으로 남지 않는가?
- Android WebView 작은 화면에서 주요 CTA와 닫기 버튼이 하단 safe-area에 가리지 않는가?
- 앱 복귀 후 stale state로 이전 작업이 다시 실행되지 않는가?
- 네트워크가 끊긴 상태에서 bridge/API 실패 안내와 재시도 경로가 존재하는가?

출시 차단 기준:

- Toss 실제 WebView에서 핵심 CTA가 클릭 불가합니다.
- bridge 실패가 화면 전체 오류나 무응답 상태로 이어집니다.
- 앱 복귀 시 저장, 주문 생성, 알림 설정 같은 쓰기 작업이 의도치 않게 재실행됩니다.

권장 검증:

```powershell
npx vitest run "__tests__/modalLayoutContract.test.ts"
npm run test:e2e
```

### P0-3. 권한/티어 제한의 전역 일관성

검증 대상:

- `utils/subscriptionUtils.ts`
- 포트폴리오 생성 제한
- 알람 생성 제한
- 광고/유료 기능 노출 제한
- 서버 또는 Edge Function에서 free/pro/premium을 판단하는 경로

점검 질문:

- 클라이언트가 free 사용자를 막아도 서버 쓰기 경로가 우회 허용하지 않는가?
- 서버가 pro로 판단하고 클라이언트가 free로 판단하는 불일치 상태가 사용자 피해를 만들지 않는가?
- 만료된 구독이 active처럼 남는 fallback이 없는가?
- 사용량 카운트가 실패하거나 누락됐을 때 제한이 열린 방향으로 실패하지 않는가?

출시 차단 기준:

- free 사용자가 유료 제한을 우회해 포트폴리오/알람을 생성할 수 있습니다.
- pro 사용자가 정상 권한인데 클라이언트 상태 불일치로 핵심 기능을 사용할 수 없습니다.
- 만료된 구독이 서버 쓰기 경로에서 계속 유효하게 처리됩니다.

권장 검증:

```powershell
npm test -- subscription
npm test -- usePortfolioMutations
npm test -- alarm
```

### P0-4. Async 중복 실행과 stale closure

검증 대상:

- 저장, 삭제, 알림 생성, 결제 외 서버 쓰기 handler
- `useEffect` fetch cleanup과 React Strict Mode 재실행 경로
- `useRef` mutex 또는 in-flight promise dedupe가 필요한 경로
- toast, modal close, profile refresh처럼 연쇄 실행되는 callback

점검 질문:

- 버튼 연타로 동일 저장/삭제/API 요청이 중복 실행되지 않는가?
- cleanup에서 abort된 요청 때문에 다음 mount가 fetch를 건너뛰지 않는가?
- 오래된 closure가 이전 portfolio/user/session으로 쓰기 작업을 보내지 않는가?
- 성공 toast가 떴지만 실제 DB 쓰기가 실패하는 partial success 상태가 없는가?

출시 차단 기준:

- 동일 사용자 액션 1회가 DB write 2회 이상으로 이어질 수 있습니다.
- Strict Mode 또는 빠른 화면 전환 후 loading 상태가 풀리지 않습니다.
- stale userId/portfolioId로 다른 데이터가 수정될 가능성이 있습니다.

권장 검증:

```powershell
npm test -- hooks
npm test -- mutations
npm run typecheck
```

### P0-5. Edge Function과 DB 쓰기 원자성

검증 대상:

- `supabase/functions`
- 서버 라우트와 Edge Function의 insert/update/upsert/delete 경로
- RLS 정책과 service role 사용 경계
- 크론 또는 배치 함수의 retry 가능성

점검 질문:

- 중복 실행되어도 같은 결과가 되는 idempotent 설계인가?
- 여러 테이블을 갱신하는 흐름에서 중간 실패 시 partial update가 사용자 상태를 깨지 않는가?
- N+1 쿼리나 무제한 병렬 update가 출시 직후 트래픽에서 타임아웃을 만들지 않는가?
- service role이 필요한 곳과 사용자 JWT가 필요한 곳이 분리되어 있는가?
- RLS가 클라이언트 직접 쓰기와 서버 쓰기 모두에서 의도대로 동작하는가?

출시 차단 기준:

- 배치/크론 재시도 시 알림, 요약, 사용량, 주문성 데이터가 중복 생성됩니다.
- 실패 중간 상태가 다음 실행에서도 복구되지 않습니다.
- RLS 누락으로 다른 사용자의 데이터 조회 또는 수정 가능성이 있습니다.

권장 검증:

```powershell
npm --prefix server run test
npx supabase functions serve
```

### P0-6. 금융 계산과 주문 생성 안전성

검증 대상:

- 전략별 주문 생성 유틸
- 일별 실행 요약 생성
- 가격, 수량, 예산, 수익률, 비율 계산 helper
- 클라이언트 계산과 Edge/shared 계산의 parity

점검 질문:

- shares, price, budget이 0 또는 음수일 때 무한 루프나 0원 주문이 생성되지 않는가?
- currency rounding에 `Number.EPSILON` 기준 보정이 적용되는가?
- 클라이언트 미리보기와 Edge 배치 결과가 같은 입력에서 같은 결과를 내는가?
- 결측 주가, 휴장일, API fallback 실패가 계산 오류로 이어지지 않는가?

출시 차단 기준:

- 0원 주문, 음수 주문, 무한 order generation 가능성이 있습니다.
- 동일 입력에서 클라이언트와 서버 계산 결과가 다릅니다.
- 주가 API 실패 시 사용자에게 잘못된 주문표가 정상처럼 표시됩니다.

권장 검증:

```powershell
npm test -- strategy
npm test -- dailyExecution
npm test -- snapshot
```

## P1 감사 영역

### P1-1. UI 전체 작은 화면과 입력 가능성

검증 대상:

- 모든 modal, drawer, bottom sheet
- 전략 생성/수정 form
- 알림 생성 form
- pricing, profile, dashboard CTA

점검 질문:

- `320px x 568px`에서 primary CTA, 닫기 버튼, 저장 버튼이 보이는가?
- 키보드가 열린 상태에서도 숫자 입력과 제출이 가능한가?
- 스크롤 컨테이너가 중첩되어 body scroll lock이 깨지지 않는가?
- disabled/loading 상태가 시각적으로만 막히고 실제 클릭은 가능한 상태가 아닌가?

통과 기준:

- 핵심 사용자 플로우의 모든 modal에서 닫기, 취소, 제출이 접근 가능합니다.
- 작은 화면에서 버튼이 하단 UI나 safe-area에 가리지 않습니다.
- 입력 실패 시 어떤 필드가 문제인지 사용자가 알 수 있습니다.

### P1-2. i18n과 정책 문구 누락

검증 대상:

- JSX에 직접 들어간 한국어/영어 UI 문구
- toast, alert, placeholder, aria-label
- 약관, 환불, 위험 고지, 투자 관련 disclaimer

점검 질문:

- 새 UI 문구가 `constants/vrMessages.ts` 또는 해당 i18n dictionary에 모여 있는가?
- logic branching이 번역 문자열에 의존하지 않는가?
- 오류 메시지가 사용자가 다음 행동을 알 수 있게 작성되어 있는가?
- 투자/결제/권한 관련 정책 문구가 화면과 실제 기능을 다르게 설명하지 않는가?

통과 기준:

- 신규 hardcoded UI text가 없습니다.
- 오류와 빈 상태 문구가 누락되어 빈 화면만 보이는 경로가 없습니다.

권장 검증:

```powershell
npm run typecheck
```

추가 조사:

```powershell
rg "[가-힣]" components constants hooks utils
```

### P1-3. 접근성 기본 계약

검증 대상:

- overlay, backdrop, clickable div/span
- modal title, close button, destructive action confirmation
- keyboard navigation, Enter/Space 처리
- aria-label과 focus 이동

점검 질문:

- `onClick`이 있는 non-interactive element에 role, tabIndex, keyboard handler, aria-label이 있는가?
- modal open 시 focus가 화면 밖에 남지 않는가?
- destructive action은 버튼 문구와 확인 절차가 명확한가?
- screen reader가 loading, error, success 상태 변화를 인지할 수 있는가?

통과 기준:

- 키보드만으로 핵심 생성/수정/삭제 플로우를 완료하거나 취소할 수 있습니다.
- modal 닫기와 backdrop 닫기가 접근성 계약을 지킵니다.

### P1-4. 네트워크 실패와 empty state

검증 대상:

- 주가 조회
- 포트폴리오/알람/요약 데이터 fetch
- Supabase fallback
- 캐시 hit/miss와 stale data 표시

점검 질문:

- 네트워크 실패가 빈 배열, null, undefined로 내려올 때 화면이 깨지지 않는가?
- 캐시된 오래된 데이터를 최신값처럼 표시하지 않는가?
- 재시도 버튼 또는 사용자가 이해할 수 있는 안내가 있는가?
- 부분 데이터만 있는 상태에서 계산과 UI가 일관된 fallback을 쓰는가?

통과 기준:

- 실패, 빈 상태, 부분 성공 상태가 모두 white screen 없이 표시됩니다.
- 자동 재시도가 있다면 중복 요청이나 무한 루프가 없습니다.

### P1-5. 운영 관측과 장애 대응

검증 대상:

- 운영 로그
- error boundary 또는 전역 오류 처리
- 고객 문의에 필요한 식별자
- 수동 복구 절차가 필요한 데이터

점검 질문:

- P0 오류 발생 시 운영자가 userId, portfolioId, orderId, function name 중 필요한 식별자를 확인할 수 있는가?
- 정상 흐름 debug log가 운영 로그를 과도하게 오염시키지 않는가?
- 사용자가 문의할 때 화면에서 전달할 수 있는 정보가 있는가?
- 수동 복구가 필요한 케이스와 복구 SQL/API가 문서화되어 있는가?

통과 기준:

- 장애 원인 파악에 필요한 최소 로그가 남습니다.
- 개인정보나 민감한 토큰이 로그에 남지 않습니다.
- 사용자가 “아무 일도 일어나지 않음” 상태로 방치되지 않습니다.

## 테스트 게이트

출시 전 최소 실행:

```powershell
npm run typecheck
npm test
npm --prefix server run test
npx vitest run "__tests__/modalLayoutContract.test.ts"
```

권장 실행:

```powershell
npm run build
npm run test:e2e
npx vitest run --config docs2/miniapp_modal_layout_vitest.config.ts
```

테스트 결과 기록 기준:

- 명령어
- 실행 환경
- 통과/실패 여부
- 실패 로그 요약
- 실패가 출시 차단인지 후속 조치인지 판단

## 수동 스모크 시나리오

### 앱 진입과 세션

1. Toss 미니앱에서 신규 사용자로 진입합니다.
2. 로그인 또는 인증 흐름을 완료합니다.
3. 앱을 background로 보냈다가 다시 복귀합니다.
4. 새로고침 또는 재진입 후 dashboard가 정상 표시되는지 확인합니다.

통과 기준:

- white screen 없음
- loading 영구 고착 없음
- 프로필/구독/사용량 상태가 일관됨

### 네트워크 끊김

1. 주요 화면 진입 후 네트워크를 차단합니다.
2. 포트폴리오 조회, 알림 생성, 전략 수정 중 하나를 시도합니다.
3. 네트워크를 복구하고 재시도합니다.

통과 기준:

- 실패 안내가 표시됨
- 버튼 loading이 풀림
- 재시도 가능
- 중복 저장 없음

### 작은 화면 입력

1. `320px x 568px` viewport로 dashboard, pricing, profile, 전략 form을 엽니다.
2. 숫자 입력 필드를 focus해 키보드 겹침을 확인합니다.
3. 저장, 취소, 닫기 버튼을 모두 눌러봅니다.

통과 기준:

- 핵심 CTA가 화면 안에 있음
- 스크롤 가능
- 입력값과 오류 메시지가 가려지지 않음

### 배치/크론 재실행

1. staging에서 주요 Edge Function을 2회 연속 실행합니다.
2. 알림, 일별 요약, 스냅샷, 사용량 데이터 중복 여부를 확인합니다.
3. 실패를 강제로 만든 뒤 다음 실행에서 복구되는지 확인합니다.

통과 기준:

- 중복 데이터 없음
- partial update 복구 가능
- 실패 로그에 원인 추적 정보가 있음

## 출시 차단 기준

아래 중 하나라도 발생하면 출시 전 수정하거나 기능을 닫아야 합니다.

- 앱 진입 또는 주요 화면에서 white screen이 재현됩니다.
- 인증/프로필/구독 상태 불일치로 free/pro 권한이 잘못 적용됩니다.
- 동일 사용자 액션이 중복 DB write로 이어집니다.
- Edge Function 재실행이 중복 알림, 중복 요약, 중복 사용량 반영을 만듭니다.
- RLS 또는 서버 권한 경계 문제로 다른 사용자 데이터 접근 가능성이 있습니다.
- 금융 계산에서 0원 주문, 음수 주문, 무한 루프 가능성이 있습니다.
- 작은 화면에서 저장/닫기/주요 CTA가 접근 불가합니다.
- 네트워크 실패 후 loading이 풀리지 않거나 재시도가 불가능합니다.
- 테스트 게이트 중 typecheck 또는 핵심 unit test가 실패합니다.

## 실행 순서

1. 기존 `paid_payment_release_gate_audit_plan.md`의 결제 전용 P0/P1 범위를 제외합니다.
2. 앱 부팅, 인증, 권한, async write, Edge/DB, 금융 계산 순서로 P0를 먼저 감사합니다.
3. UI, i18n, 접근성, empty state, 운영 관측 순서로 P1을 감사합니다.
4. 자동 테스트 게이트를 실행하고 실패를 P0/P1/P2로 분류합니다.
5. 실제 발견 사항을 `pre_release_unexpected_error_audit_result.md`에 기록합니다.
6. 출시 차단 항목만 별도 수정 계획으로 분리합니다.

## 최종 체크리스트

| 항목 | 상태 |
|---|---|
| 앱 부팅/세션 복구 P0 감사 | TODO |
| 전역 Toss WebView P0 감사 | TODO |
| 권한/티어 전역 일관성 P0 감사 | TODO |
| async 중복 실행/stale closure P0 감사 | TODO |
| Edge Function/DB 원자성 P0 감사 | TODO |
| 금융 계산/주문 생성 P0 감사 | TODO |
| 작은 화면 UI P1 감사 | TODO |
| i18n/정책 문구 P1 감사 | TODO |
| 접근성 P1 감사 | TODO |
| 네트워크 실패/empty state P1 감사 | TODO |
| 운영 관측/장애 대응 P1 감사 | TODO |
| 자동 테스트 게이트 결과 기록 | TODO |
| 수동 스모크 결과 기록 | TODO |
