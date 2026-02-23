# 토스 로그인 연동 — 시니어 코드 리뷰 (가이드라인 대조 + 유지보수성/클린코드)

참조: [이해하기](https://developers-apps-in-toss.toss.im/login/intro.html) | [콘솔 가이드](https://developers-apps-in-toss.toss.im/login/console.html) | [개발하기](https://developers-apps-in-toss.toss.im/login/develop.html)

---

## Part A. 토스 가이드라인 대조 — 스펙 준수 여부

### 1. generate-token API 스펙 (공식 문서)

[개발하기](https://developers-apps-in-toss.toss.im/login/develop.html) 명시:

- **Method**: `POST`
- **URL**: `/api-partner/v1/apps-in-toss/user/oauth2/generate-token`
- **요청 body (필수)**:
  - `authorizationCode` (string, Y) — 인가코드
  - `referrer` (string, Y) — referrer (샌드박스: `sandbox`, 토스앱: `DEFAULT` 등)
- **성공 응답**:
  - `resultType`: `"SUCCESS"`
  - `success`: `{ tokenType, accessToken, refreshToken, expiresIn, scope }` (camelCase)
- **client_id, grant_type**: 문서에 **전혀 없음** → 이전에 코드에 넣었던 `TOSS_CLIENT_ID`/`grant_type`은 **가이드라인에 없는 값(환각)** 이 맞음.

### 2. 현재 구현 vs 스펙

| 항목 | 공식 스펙 | 현재 구현 | 판정 |
|------|-----------|-----------|------|
| 요청 파라미터 | `authorizationCode`, `referrer` (둘 다 필수) | `code`, `grant_type`, (선택) `client_id` | **위반**: 파라미터 이름·구성 불일치, `referrer` 누락 |
| 응답 파싱 | `data.resultType`, `data.success.accessToken` 등 (camelCase) | `tokenResponse.data.access_token` 등 (snake_case) | **위반**: 응답 구조 잘못 가정 → 런타임 시 토큰 미획득 가능 |
| 사용자 정보 | GET `/api-partner/v1/apps-in-toss/user/oauth2/login-me` (Bearer token) → userKey, scope, 암호화된 개인정보 | 호출 없음. `toss_user_` + code 기반 **목(mock) 사용자** 사용 | **위반**: 실제 사용자 식별 없이 가짜 식별자 사용 |
| 인가 코드 소스 | SDK `appLogin` → `authorizationCode`, `referrer` 반환 | 브릿지 `requestAuth` → `code`만 사용, `referrer` 미전달 | **위반**: `referrer` 필수인데 미전달 |

### 3. Hallucination 검증

- **TOSS_CLIENT_ID**: [콘솔 가이드](https://developers-apps-in-toss.toss.im/login/console.html), [개발하기](https://developers-apps-in-toss.toss.im/login/develop.html) 어디에도 **generate-token 요청에 client_id를 넣으라거나, 콘솔에서 client_id를 확인하라는 설명이 없음**. → 과거에 “client_id 넣으라”고 한 것은 **가이드라인에 근거 없는 설정**이었고, 제거/선택화한 방향이 맞음. 단, 현재도 body에 `grant_type`/`code`를 넣고 있어 **스펙 자체가 여전히 잘못됨**.

---

## Part B. 발견된 문제점 리스트 (중요도 순)

### Critical (기능 오동작·스펙 위반)

1. **generate-token 요청 body가 공식 스펙과 다름**  
   - 스펙: `authorizationCode`, `referrer` (필수).  
   - 현재: `code`, `grant_type`, (선택) `client_id`.  
   - 결과: 토스 서버가 400/401 등으로 거부하거나, 올바른 토큰을 주지 않을 가능성 큼.

2. **generate-token 응답 구조 잘못 가정**  
   - 스펙: `data.resultType`, `data.success.accessToken` (camelCase).  
   - 현재: `tokenResponse.data.access_token` (snake_case) 직접 destructure.  
   - 결과: `access_token`/`refresh_token`이 항상 undefined → 이후 세션 생성 실패.

3. **referrer 미전달**  
   - 스펙: `referrer` 필수 (sandbox / DEFAULT 등).  
   - 클라이언트가 BFF에 `code`만 보냄. BFF는 `referrer`를 body에 넣지 않음.  
   - 결과: API 요청 자체가 스펙 미준수.

4. **실제 사용자 식별 없이 Mock 사용자 사용**  
   - 스펙: AccessToken 발급 후 `login-me`로 userKey·scope·(암호화된) 개인정보 조회.  
   - 현재: `login-me` 미호출, `toss_user_` + code.substring(0,8) 로 이메일 생성.  
   - 결과: 동일 토스 사용자가 환경/재로그인마다 다른 Supabase 유저로 생성될 수 있음, 회원 통합 불가.

### High (유지보수성·안정성)

5. **존재하지 않을 수 있는 RPC 호출**  
   - `supabaseAdmin.rpc('get_user_id_by_email', { email: tossEmail })` 호출하지만, `supabase/migrations` 등에 해당 RPC 정의 없음.  
   - 반환값 `existingUser` → `userId`에 할당 후 **전혀 사용하지 않음** (Dead Code).

6. **에러 응답 형식과 토스 API 불일치**  
   - 토스 실패 응답: `resultType: "FAIL", error: { errorCode, reason }`.  
   - `handleTossError`는 `error.response?.data?.message`, `error.response?.data?.code` 참조.  
   - 실제 필드는 `reason`, `errorCode` → 클라이언트에 잘못된/빈 메시지 전달 가능.

7. **dummy password에 서비스 롤 키 일부 사용**  
   - `dummyPassword = TossLogin_${SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10)}`  
   - 서비스 롤 키가 유출될 경우 추측 가능한 패턴 노출, 보안 권장사항 위반.

### Medium (SRP·DRY·복잡도)

8. **auth 라우트 하나의 핸들러가 과다 책임**  
   - 토스 API 호출 + 응답 변환 + Mock 사용자 생성 + Supabase 조회 + createUser + signIn + 세션 반환을 한 함수에서 수행.  
   - SRP 위반: “토스 토큰 교환”, “Supabase 유저 생성/로그인”, “응답 포맷”이 분리되지 않음.

9. **인지 복잡도**  
   - signIn 실패 분기 안에서 createUser → 다시 signIn, 그 다음에 session/user null 체크.  
   - 중첩과 분기가 많아 읽기 어렵고, 실패 경로가 여러 갈래로 나뉨.

10. **tossAuth.ts 내 중복 에러 메시지 처리**  
    - `err instanceof Error ? err.message : '...'` 패턴이 여러 곳에서 반복.  
    - DRY 위반.

### Low (Dead Code·타입·안티패턴)

11. **Dead Code**  
    - `userId = existingUser` 대입 후 미사용.  
    - `tokenResponse.data`에서 `expires_in` destructure하지만 사용하지 않음 (토스 응답 구조도 잘못 가정한 상태).

12. **handleTossError 반환 타입**  
    - `reply.code(400).send(err)` 시 `err`에 `error`, `code`만 있음. 토스는 `errorCode`, `reason` 사용.  
    - 클라이언트가 기대하는 필드와 서버가 보내는 필드 불일치 가능.

13. **타입 정의와 공식 스펙 불일치**  
    - `toss.d.ts`: `requestAuth?: () => Promise<{ code: string }>`.  
    - 공식: SDK가 `authorizationCode`, `referrer` 반환.  
    - 타입이 스펙을 반영하지 않음 → referrer 전달 불가.

---

## Part C. 리팩토링 개선 코드 제안

### C.1 공식 스펙에 맞는 BFF 요청/응답 (auth.ts)

- 요청: `authorizationCode`, `referrer` 만 전송. `code`/`grant_type`/`client_id` 제거.
- 응답: `data.resultType`, `data.success` 존재 여부 확인 후 `accessToken`, `refreshToken` 등 camelCase로 파싱.
- 에러: `data.error?.reason`, `data.error?.errorCode` 사용해 클라이언트에 전달.

### C.2 referrer 전달

- 클라이언트: 브릿지/SDK에서 `authorizationCode`와 `referrer`를 받아 BFF에 `{ authorizationCode, referrer }` 로 전송.
- BFF: 해당 body를 그대로 토스 generate-token에 전달.

### C.3 사용자 식별 (장기)

- generate-token 성공 후 `GET login-me` (Authorization: Bearer accessToken) 호출.
- 응답의 `userKey`(및 필요 시 복호화 키로 복호화한 식별 정보)로 Supabase 유저 매핑.
- Mock 이메일(`toss_user_` + code) 제거.

### C.4 함수 분리 (SRP)

- `exchangeTossCodeForToken(authorizationCode, referrer)` → 토스 API만 호출, 정규화된 토큰 객체 반환.
- `ensureSupabaseUserForToss(accessToken, userKey)` (또는 mock 제거 후 login-me 결과 기반) → 유저 생성/조회 및 세션 생성.
- 라우트 핸들러는 “body 검증 → exchange → ensureUser → 응답”만 담당.

### C.5 에러 매핑

- `handleTossError`에서 `response?.data?.error` 객체를 보고 `reason`/`errorCode`를 반환 객체에 매핑.
- 클라이언트 계약: `{ error: string, errorCode?: string }` 등로 통일.

### C.6 기타

- `get_user_id_by_email` RPC를 사용하지 않거나, 사용할 경우 Supabase에 RPC 정의 추가 후, 반환값을 실제로 사용할지 결정. 현재처럼 호출만 하고 결과를 버리면 제거.
- dummy password: 토스 userKey 또는 로그인-me 결과에서 파생된 결정적이지만 키와 무관한 값(예: 해시)으로 생성해 서비스 롤 키를 노출하지 않도록 변경.

---

이 문서는 “토스 가이드라인에 맞는가”와 “유지보수성·클린코드” 관점에서만 비평한 것이며, 실제 수정 적용 시에는 테스트·배포 정책과 함께 진행하는 것을 권장합니다.
