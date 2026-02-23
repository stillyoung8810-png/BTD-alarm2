# 토스 로그인 — 테스트 시나리오 (Edge Case 포함)

성공 플로우뿐 아니라 **Edge Case**를 반드시 검증한다.

---

## 1. 이미 가입된 유저가 다른 브라우저/기기에서 다시 로그인 (프로필 중복 생성 방지)

### 목적
동일 `toss_user_key`로 여러 기기에서 로그인해도 **user_profiles 행이 하나만 유지**되고, **auth.users 계정이 중복 생성되지 않는지** 확인.

### 사전 조건
- 토스 샌드박스(또는 실서비스)에서 한 번 로그인하여 `user_profiles.toss_user_key`와 auth user가 생성된 상태.

### 절차
1. **기기 A**: 토스 미니앱에서 로그인 → `POST /auth/toss/exchange` 호출 → 세션 수신. DB에서 해당 `toss_user_key`로 `user_profiles` 1건, `auth.users` 1건 확인.
2. **기기 B** (다른 브라우저 또는 시크릿): 동일 토스 계정으로 미니앱 접속 후 로그인 → `POST /auth/toss/exchange` (다른 인가코드, 동일 사용자) 호출.
3. **검증**  
   - 응답: 200, 새 `access_token`/`refresh_token` 수신.  
   - DB: `user_profiles`에서 해당 `toss_user_key`로 조회 시 **행이 1개**.  
   - DB: `auth.users`에서 해당 이메일(`toss_<userKey>@toss.placeholder`)로 **1건만 존재**.  
   - `auth.admin.createUser`가 **두 번째 요청에서 호출되지 않음** (기존 유저로 `signInWithPassword`만 수행).

### 자동화 포인트
- Supabase Admin API를 모킹하여 `from('user_profiles').select().eq('toss_user_key', key).maybeSingle()`가 첫 요청 후 동일 키로 **기존 행 반환**하도록 설정.
- 두 번째 호출에서 `createUser`가 호출되지 않고 `signInWithPassword`만 호출되는지 어설트.

---

## 2. 토스 API 점검/타임아웃 시 TossProvider → 상위 계층 에러 전파

### 목적
토스 API가 5xx, 타임아웃, 네트워크 오류일 때 **TossProvider가 규격화된 실패 결과를 반환**하고, **tossAuthRoute가 400/500과 규격화된 body**로 응답하는지 확인.

### 시나리오 2-1: generate-token 타임아웃
1. **조건**: TossProvider의 axios `timeout`(예: 10s) 내에 토스 서버가 응답하지 않음 (또는 네트워크 차단).
2. **기대**:  
   - `getToken()`이 `{ success: false, error: { error: '...' } }` 반환 (예: `"Internal Server Error"` 또는 토스 에러 메시지).  
   - `tossAuthRoute`가 **400**으로 `{ error, errorCode?, requestId }` 반환.  
   - 로그에 해당 요청의 **correlation_id**와 실패 사유가 남음.

### 시나리오 2-2: 토스 5xx / 점검 응답
1. **조건**: 토스가 503 또는 500 + JSON body 반환.
2. **기대**:  
   - `getToken()` 또는 `getLoginMe()`가 `normalizeTossError`로 파싱한 `{ success: false, error }` 반환.  
   - 라우트가 400 + `requestId` 포함하여 클라이언트에 전달.  
   - 에러 로그에 **correlation_id** 포함.

### 시나리오 2-3: login-me 실패 후 세션 생성 시도하지 않음
1. **조건**: generate-token은 성공, login-me가 401/500.
2. **기대**:  
   - `ensureSessionForTossUserKey`는 **호출되지 않음**.  
   - 응답은 400 + login-me 실패 사유.  
   - DB/세션 생성 로직이 실행되지 않음.

### 자동화 포인트
- Axios 인스턴스를 모킹하여 `post(GENERATE_TOKEN_PATH)` / `get(LOGIN_ME_PATH)`에서 `ECONNABORTED`, 503, 500 응답 시뮬레이션.
- 반환값이 `GetTokenFailure` / `GetLoginMeFailure` 형태인지, `error` 필드가 채워지는지 어설트.

---

## 3. userKey가 매우 큰 숫자일 때 DB에 문자열로 정확히 저장

### 목적
토스 API가 `userKey`를 **number**로 주더라도, JS `Number` 한계(MAX_SAFE_INTEGER) 내에서 **string으로 변환해 DB에 저장**할 때 값이 깨지지 않는지 확인.

### 절차
1. **단위 테스트**: `userKeyToString(number)`  
   - `0` → `"0"`  
   - `1` → `"1"`  
   - `Number.MAX_SAFE_INTEGER` → `"9007199254740991"`  
   - 음수(문서에 없으나 방어): 예외 또는 문자열로 일관되게 처리 여부 확인.
2. **통합/수동**: 토스가 실제로 반환하는 userKey 범위(예: 10자리 이하)에서 로그인 후 DB `user_profiles.toss_user_key` 컬럼에 **문자열로 동일 값**이 들어갔는지 확인.
3. **주의**: `userKey > Number.MAX_SAFE_INTEGER`이면 JS 파싱 단계에서 정밀도 손실 가능. 공식 스펙이 number인 한, 그 이상은 토스 측 string 지원 시 추가 대응.

### 자동화 포인트
- `responseParsers.userKeyToString`에 대해 위 경계값으로 단위 테스트 작성.
- `parseLoginMeResponse`가 `userKey`를 number로 추출한 뒤 `userKeyToString(parsed.userKey)`로 전달하는 경로가 테스트/통합에서 한 번이라도 거치면 좋음.

---

## 체크리스트 요약

| # | 시나리오 | 검증 내용 | 자동화 |
|---|----------|-----------|--------|
| 1 | 다른 기기 재로그인 | 프로필·auth 1건, createUser 미호출 | Supabase 모킹 + ensureSession 플로우 |
| 2 | 토스 타임아웃/5xx | TossProvider → 라우트 에러 전파, requestId/correlation_id | Axios 모킹 + getToken/getLoginMe |
| 3 | 큰 userKey | userKeyToString 및 DB 문자열 저장 | responseParsers 단위 테스트 + 수동 DB 확인 |

---

## 테스트 실행

- **서버 단위 테스트**: `server/` 디렉터리에서 `npm run test` (Vitest).  
  - `responseParsers.test.ts`: userKeyToString 경계값, parseLoginMeResponse/parseTokenResponse.  
  - `AuthService.test.ts`: 기존 프로필 있을 때 createUser 미호출 (Supabase 모킹).  
  - `TossProvider.test.ts`: 시그니처 검증 (타임아웃/5xx 전파는 수동·통합).
- **수동/통합**: 위 표의 시나리오 1·2는 실제 환경 또는 통합 테스트로 검증.
