# 토스 로그인 연동 — API SPEC 테이블 및 전면 리팩토링 수정계획

**Zero-Assumption Policy**: 아래 스펙은 [공식 개발 가이드](https://developers-apps-in-toss.toss.im/login/develop.md)에 명시된 내용만 포함합니다. 문서에 없는 `client_id`, `grant_type`, `appKey` 등은 포함하지 않습니다.

**컨펌**: 이 API SPEC 테이블 및 수정계획에 대한 승인 후에만 구현 코드를 작성합니다.

**시니어 Refinement 반영 (v2)**  
- 1.1 mTLS: 인증서/키를 env에서 불러와 HTTPS Agent에 주입하는 로직을 **TossProvider 내부에만** 캡슐화. **Agent는 싱글톤으로 한 번만 생성·재사용** (매 요청 생성 시 Handshake Overhead).  
- 1.5 userKey: API는 number이나 **DB 저장 시 string으로 변환**하여 JS Number 범위 이슈 방지.  
- 1.3 referrer: **Enum(`sandbox` \| `DEFAULT`)으로 관리**, 그 외 값 즉시 거부.  
- ① 옵션 A 지향: **public.profiles + toss_user_key Unique Index** 권장; auth.users 사용 시 비밀번호 비유출·비재사용 보장.  
- ② Zod **`.strict()`** 는 **요청(Request) body에만** 적용. **응답(Response)** 은 **필요 필드만 Selective Picking**, `.strict()` 미적용(Postel's Law — 토스가 새 필드 추가 시 우리 파싱이 깨지지 않도록).  
- ③ **성공 로그 필수**: 토큰 교환 성공 시 **expiresIn** 로그; **토큰 값은 절대 로그에 찍지 않음(masking)**. **correlation_id** 는 TossRoute에서 생성 후 **AuthService → TossProvider** 로 인자 전달하여 전체 요청 흐름이 한 트레이스로 묶이도록 한다.

---

## 1. API SPEC 테이블 (공식 문서 기준)

### 1.1 공통

| 항목 | 값 | 출처 |
|------|-----|------|
| BaseURL | `https://apps-in-toss-api.toss.im` | 개발하기 문서 |
| Content-Type | `application/json` | 개발하기 문서 (각 API 명시) |
| 인증 | mTLS | 앱인토스 연동 전제 |

**mTLS 실체 (구현 시 필수)**  
“클라이언트 인증서”로 퉁치지 않는다. 실제 구현 시 다음을 명확히 한다.

- **인증서(.crt)와 개인키(.key)** 를 환경 변수(Secrets)에서 **안전하게** 불러온다 (예: `TOSS_CLIENT_CERT`, `TOSS_CLIENT_KEY`, PEM 문자열 내 `\n` 정규화).
- 이 PEM 문자열을 **HTTPS Agent**(Node의 `https.Agent` 옵션 `cert`, `key`)에 주입하여 토스 API 호출 시에만 사용한다.
- **이 로직 전체는 TossProvider 내부에만 두고**, 인증서/키를 읽거나 Agent를 만드는 코드가 라우트·AuthService 등 다른 계층에 노출되지 않도록 캡슐화한다.
- **mTLS Agent 재사용**: `https.Agent` 인스턴스는 **한 번만 생성하여 싱글톤(Singleton)으로 재사용**한다. 매 요청마다 인증서를 읽고 Agent를 생성하면 Handshake Overhead로 성능이 크게 떨어진다.

---

### 1.2 인가 코드 받기 (클라이언트/SDK)

| 항목 | 타입 | 필수 | 설명 |
|------|------|------|------|
| 출처 | SDK `appLogin` | — | 인가 코드는 SDK를 통해 연동 |
| 반환 필드 | `authorizationCode` | Y | 인가코드 |
| 반환 필드 | `referrer` | Y | 샌드박스: `sandbox`, 토스앱: `DEFAULT` |
| 인가코드 유효시간 | — | — | 10분 |

**문서에 없는 것**: `code`, `grant_type`, `client_id` 등은 문서에 없음. 사용 금지.

---

### 1.3 AccessToken 받기 (generate-token)

| 구분 | 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|------|
| **요청** | `authorizationCode` | string | Y | 인가코드 |
| **요청** | `referrer` | string | Y | referrer (엄격 Enum, 아래 참조) |
| Method | — | — | — | `POST` |
| URL | — | — | — | `/api-partner/v1/apps-in-toss/user/oauth2/generate-token` |

**Referrer 엄격함**  
문서상 값은 `sandbox`(샌드박스앱), `DEFAULT`(토스앱) 두 가지뿐이다. **이 외 값이 들어오면 즉시 거부**한다. 구현 시 **Enum으로 관리**하고, 파싱 단계에서 `referrer`가 Enum에 없으면 400을 반환한다. (예: `z.enum(['sandbox', 'DEFAULT'])` + `.strict()`)

**성공 응답 (200)**  
최상위: `resultType`, `success` 객체.

| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `resultType` | string | Y | `"SUCCESS"` |
| `success.tokenType` | string | Y | `"Bearer"` 고정 |
| `success.accessToken` | string | Y | accessToken |
| `success.refreshToken` | string | Y | refreshToken |
| `success.expiresIn` | string \| number | Y | 만료시간(초). 문서 표는 string, 예시는 number → 검증 시 둘 다 허용 권장 |
| `success.scope` | string | Y | 인가된 scope(구분) |

**실패 응답**

- 케이스 A: `{ "error": "invalid_grant" }` (인가코드 만료 또는 중복 사용)
- 케이스 B: `{ "resultType": "FAIL", "error": { "errorCode": string, "reason": string } }`

**문서에 없는 요청 필드**: `code`, `grant_type`, `client_id`, `client_secret`, `appKey` 등. 전송 금지.

---

### 1.4 AccessToken 재발급 (refresh-token)

| 구분 | 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|------|
| **요청** | `refreshToken` | string | Y | 발급받은 RefreshToken |
| Method | — | — | — | `POST` |
| URL | — | — | — | `/api-partner/v1/apps-in-toss/user/oauth2/refresh-token` |

**성공 응답**: generate-token과 동일 구조 (`resultType`, `success` 내부 camelCase).

**실패 응답**: `errorCode`, `reason` (문서 표).

---

### 1.5 사용자 정보 받기 (login-me)

| 구분 | 이름 | 타입 | 필수 | 암호화 | 설명 |
|------|------|------|------|--------|------|
| **요청 헤더** | `Authorization` | string | Y | — | `Bearer ${AccessToken}` |
| Method | — | — | — | — | `GET` |
| URL | — | — | — | — | `/api-partner/v1/apps-in-toss/user/oauth2/login-me` |

**성공 응답 (200)**  
최상위: `resultType`, `success` 객체.

| 이름 | 타입 | 필수 | 암호화 | 설명 |
|------|------|------|--------|------|
| `success.userKey` | number | Y | N | 사용자 고유 식별값(API 응답 타입). **저장 시 string으로 변환** (아래 Refinement 참조) |
| `success.scope` | string | Y | N | 인가된 scope 목록 |
| `success.agreedTerms` | list | Y | N | 사용자가 동의한 약관 목록 |
| `success.name` | string | N | Y | 사용자 이름 (암호화) |
| `success.phone` | string | N | Y | 휴대전화번호 (암호화) |
| `success.birthday` | string | N | Y | yyyyMMdd (암호화) |
| `success.ci` | string | N | Y | CI (암호화) |
| `success.di` | string | N | Y | 항상 `null` |
| `success.gender` | string | N | Y | MALE/FEMALE (암호화) |
| `success.nationality` | string | N | Y | LOCAL/FOREIGNER (암호화) |
| `success.email` | string | N | Y | 이메일 (점유 인증 안 함, 암호화) |

**실패 응답**

- `{ "error": "invalid_grant" }` (유효하지 않은 토큰)
- `{ "resultType": "FAIL", "error": { "errorCode": string, "reason": string } }`  
  문서 명시 errorCode 예: `INTERNAL_ERROR`, `USER_KEY_NOT_FOUND`, `USER_NOT_FOUND`, `BAD_REQUEST_RETRIEVE_CERT_RESULT_EXCEED_LIMIT`

**userKey 타입 Refinement**  
문서상 `userKey`는 number이지만, JavaScript의 `Number` 허용 범위(2^53 등)를 넘어서는 큰 값이 올 수 있다. **데이터베이스 저장·비교·인덱스 시에는 반드시 string으로 변환**하여 처리한다. (예: 수신 직후 `String(success.userKey)` 또는 `success.userKey.toString()`로 정규화 후, DB 컬럼은 `text`/`varchar`, Unique Index는 이 string 기준으로 건다.)

---

### 1.6 로그인 끊기 (참고용, 본 리팩토링 범위 외)

| API | Method | URL |
|-----|--------|-----|
| accessToken으로 끊기 | POST | `/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-access-token` |
| userKey로 끊기 | POST | `/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-user-key` |

---

## 2. 수정계획 — 세 가지 결함 반영

### ① 아키텍처: “Social Login에 Password가 존재하는가?” — 진짜 제거

**비판 반영**  
dummy password 생성은 **보안 부채**로 간주하고, “비밀번호 기반 Mock 유저 생성”을 **금지**합니다.

**추가 비판**  
옵션 B(1회성 랜덤 패스워드)는 **여전히 타협안**이다. "패스워드를 만들지 않는다"가 아니라 "한 번만 만들고 안 쓴다"에 그치므로, 구조적으로 제거를 지향해야 한다.

**교정 방향**

- **옵션 A(Custom JWT / Identity)를 지향**한다.  
  - **auth.users에 직접 삽입하지 않고**, `public.profiles`(또는 동등한 별도 테이블)에 **`toss_user_key`(string)를 Unique Index로 걸어 관리**하는 방식을 권장한다.  
  - 토스 login-me에서 받은 userKey(string으로 정규화)를 이 테이블의 주 식별·조회 키로 쓰고, 세션/인증은 Custom JWT 또는 Supabase가 허용하는 Identity 패턴으로만 발급한다.
- **auth.users를 반드시 써야만 하는 경우**에 한해:  
  - 패스워드는 **완전 랜덤으로 1회 생성**하되, **DB 외부로 유출·재사용될 수 없는 구조**를 보장한다. (저장하지 않거나, 저장해도 조회/로깅/API 노출이 절대 되지 않도록 한다.)  
  - 로그인은 **항상 토스 code → 토큰 → login-me → userKey** 경로만 허용하고, 패스워드 로그인 엔드포인트는 노출하지 않는다.

**구현 시 원칙**  
"비밀번호를 아는 주체가 없는" 연동. **옵션 A(profiles + toss_user_key)를 우선**하고, 부득이할 때만 auth.users + 비유출·비재사용 보장 구조를 쓴다.

---

  - (구 문단 삭제)  
    - 옵션 A: Supabase **Custom Auth / JWT** 또는 **Custom OAuth Provider** 패턴을 사용해, 토스가 검증한 identity만으로 세션 발급. (문서 조사 후 가능 여부 확정.)  
    - 옵션 B: 부득이하게 `createUser`를 쓰는 경우, password는 **1회성 랜덤 생성·저장·로깅 금지**. 로그인은 **항상 토스 code → 토큰 → login-me → userKey** 경로만 허용하고, 패스워드 로그인 경로는 노출하지 않음.
- **식별자**: `toss_user_` + code 등 **가짜 이메일/가짜 식별자 사용 중단**. **login-me 응답의 `userKey`(number)** 를 유일한 토스 측 식별자로 사용하고, Supabase 유저 매핑은 `userKey`(또는 `toss:${userKey}` 같은 결정적 문자열) 기준으로만 수행.

**구현 시 원칙**  
“비밀번호를 아는 주체가 없는” 연동. 가능하면 Supabase Link Identity 또는 Custom Auth Provider로 **비밀번호 없이** 연동하도록 아키텍처를 전면 재설계합니다.

---

### ② 검증 계층(Validation Layer) — "Strict" 모드 강제

**비판 반영**  
파라미터/응답을 “수동 확인”에만 의존하지 않고, **런타임에 스펙과 1바이트라도 다르면 400**을 내도록 방어합니다.

**추가 비판**  
Zod를 "쓴다"는 것만으로는 부족하다. 스키마에 정의되지 않은 필드가 body에 섞여 들어와도 통과할 수 있으면, Zero-Assumption이 코드 수준에서 강제되지 않는다.

**교정 방향**

- **요청(Request)에만 `.strict()` 적용**  
  - **Zod의 `.strict()`** 는 **BFF 요청 body**에만 반드시 사용한다. 문서에 없는 파라미터가 **하나라도** 들어오면 파싱 에러 → 즉시 400(또는 422). "문서에 명시된 필드만 허용"하는 Zero-Assumption을 코드로 강제한다.  
  - 적용: `authorizationCode`, `referrer`(Enum `sandbox` \| `DEFAULT`) 만 허용하는 스키마에 `.strict()` 적용.

**주의: 응답(Response)에는 `.strict()`를 걸지 않는다**  
- **리스크**: 토스가 가이드라인 업데이트 없이 응답에 새 필드(예: `lastLoginAt`)를 추가하면, 응답 스키마에 `.strict()`를 쓴 경우 **우리 파싱이 깨져 서비스가 멈춘다**(Breaking Change).
- **교정**: **응답 파싱 스키마에서는 `.strict()` 대신 필요한 필드만 정의(Selective Picking)**하고, 나머지 필드는 **무시**하도록 설계한다.  
  - **"나갈 때는 엄격하게, 들어올 때는 관대하게(Postel's Law)"**가 대규모 분산 시스템의 원칙이다.  
- 적용: 토스 generate-token / login-me **응답**은 `resultType`, `success.accessToken`, `success.userKey` 등 **사용하는 필드만** 검증·추출하고, 그 외 키는 무시한다. `.strict()` 사용 금지.

---

### ③ 관찰 가능성(Observability) — 로그에 '맥락' 담기

**비판 반영**  
에러를 클라이언트에만 넘기는 것이 아니라, **서버에서 구조화 로그와 추적**으로 5초 안에 원인 파악이 가능하도록 합니다.

**추가 비판**  
성공 로그를 “선택”으로 두면, 갱신 로직 버그나 만료 이슈 발생 시 추적이 불가능하다. **성공 로그는 선택이 아니라 필수**이다.

**교정 방향**

- **Structured Logging** (예: **Pino**, Winston)을 전제로:
  - **요청 전**: **TossRoute**에서 `correlation_id`(또는 request_id)를 **한 번 생성**한 뒤, **AuthService를 거쳐 TossProvider까지 인자로 전달**한다. 최종 토스 API 호출 로그에도 이 ID가 포함되어야 **전체 요청 흐름(Request Tracing)**이 하나로 묶인다.
  - **실패 시**: `errorCode`, `reason`, `correlation_id`, 엔드포인트, (민감 정보 제외) 요청 요약을 **한 줄 구조화 로그**로 기록.
  - **성공 시 (필수)**:  
    - **토큰 교환 성공 시** 반드시 **AccessToken 만료 시간(`expiresIn`)** 을 로그에 남긴다. 나중에 갱신(refresh) 로직 버그 발생 시 추적할 수 있도록 한다.  
    - 단, **토큰 값(accessToken, refreshToken) 자체는 로그에 절대 출력하지 않는다**. 출력 전 **masking** 처리(예: 앞/뒤 일부만 노출, 나머지 `***`)를 반드시 포함한다.
- **에러 응답**: 클라이언트에는 규격화된 `{ error, errorCode? }`(및 필요 시 `requestId`/`correlation_id`)만 전달. 서버 로그에서 `correlation_id`로 바로 추적 가능하도록 한다.

**Correlation ID 전파**  
TossRoute에서 생성한 `correlation_id`를 **AuthService를 거쳐 TossProvider까지 인자로 전달**하여, 토스 API 호출 로그에도 동일한 ID가 찍히게 한다. 그래야 한 요청의 라우트 → AuthService → TossProvider 구간이 하나의 트레이스로 조회된다.

---

## 3. 리팩토링 요구사항 정리 (기존 + 위 3가지 반영)

| # | 요구사항 | 반영 내용 |
|---|----------|-----------|
| 1 | API 파라미터 교정 | **authorizationCode**, **referrer**(Enum `sandbox`\|`DEFAULT`만) 사용. **요청**에만 Zod **.strict()**; **응답**은 Selective Picking(Postel's Law). |
| 2 | 타입 안전성·DTO | 토스 응답은 **camelCase**만 사용. Interface + DTO, **응답은 필요한 필드만 추출**·검증(.strict() 미적용). |
| 3 | Mock 로직 제거 | `toss_user_` 가짜 이메일·dummy password **즉시 중단**. **GET login-me** 호출 후 **userKey**를 식별자로 사용. |
| 4 | SRP·계층 분리 | **TossProvider**: 토스 API 통신 전담(mTLS Agent **싱글톤**). **AuthService**: Supabase 유저 매핑·세션. **TossRoute**: 요청 수신·검증·에러·로깅, **correlation_id 생성 후 AuthService→TossProvider 전파**. |
| 5 | 에러 핸들링 | 토스 `errorCode`·`reason` 캡처 → **구조화 로그(correlation_id 포함)** + 클라이언트에는 **규격화된 에러 객체**만 반환. |

---

## 4. 컨펌 요청 사항

1. **API SPEC 테이블(1.1~1.6)**  
   - 공식 문서와 1바이트라도 다르면 수정하겠습니다. 추가/삭제할 항목이 있으면 알려주세요.

2. **수정계획(2, 3)**  
   - ① 비밀번호 제거·userKey 식별자·Supabase 연동 방식  
   - ② Zod 검증 범위(요청 body / generate-token 응답 / login-me 응답)  
   - ③ Pino(또는 팀 선택 로거) + correlation_id 정책  
   에 대해 승인 또는 수정 지시를 주시면, **컨펌 후에만** 구현 코드를 작성하겠습니다.

---

**문서 버전**: 3 (응답 .strict() 제외, mTLS 싱글톤, correlation_id 전파 반영)  
**기준 문서**: [토스 로그인 개발하기](https://developers-apps-in-toss.toss.im/login/develop.md)
