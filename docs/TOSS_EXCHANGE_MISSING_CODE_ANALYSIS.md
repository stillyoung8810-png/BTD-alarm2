# BFF "missing authentication code" 원인 분석 및 수정 계획

## 공식 스펙 (사용자 제공)

- **엔드포인트**: `POST /api-partner/v1/apps-in-toss/user/oauth2/generate-token`
- **Request Body 필수**: `authorizationCode` (Type: string, Required)

---

## 1. 현재 BFF 흐름 점검

### 1.1 프론트엔드 → BFF

| 단계 | 위치 | 내용 |
|------|------|------|
| 발급 | `services/toss/tossAuth.ts` | `appLogin()` → `authorizationCode`, `referrer` |
| 전송 | 동일 | `POST {BFF_URL}/auth/toss/exchange`, `Content-Type: application/json`, `body: JSON.stringify({ authorizationCode: code, referrer })` |

→ 프론트는 **키 이름 `authorizationCode`** 로 보내고 있음. **정상**.

### 1.2 BFF 수신·파싱

| 단계 | 위치 | 내용 |
|------|------|------|
| 라우트 | `server/src/routes/tossAuthRoute.ts` | `POST /auth/toss/exchange` |
| body 소스 | 동일 | `request.body` (Fastify 기본 JSON 파서) |
| 검증 | `server/src/toss/authSchemas.ts` | `parseTossExchangeBody(request.body)` → Zod `authorizationCode`(string, min(1)), `referrer`(enum) `.strict()` |

**가능한 원인 후보:**

1. **`request.body` 미파싱**  
   - 프록시/배포 환경에서 body가 비어 오거나, Content-Type 문제로 Fastify가 파싱하지 않으면 `request.body`가 `undefined`일 수 있음.  
   - 이 경우 Zod가 실패해 BFF에서 400이 나와야 하는데, **토스에서 "missing authentication code"가 난다면** BFF 검증은 통과한 뒤 토스까지 요청이 간 상태임.
2. **토스로 나가는 body 형태**  
   - BFF 검증은 통과했지만, **실제 토스 API로 나가는 HTTP body**에 `authorizationCode`가 빠지거나 키/값이 잘못 나갈 수 있음.  
   - 예: Axios가 body를 보낼 때 키 이름이 달라지거나, 직렬화 이슈로 값이 비어 보내지는 경우.

따라서 **원인은 “BFF가 토스로 보내는 요청 body에 authorizationCode가 확실히 포함되도록 하지 않은 것”**으로 좁혀서 대응하는 것이 맞음.

### 1.3 BFF → 토스 (generate-token)

| 단계 | 위치 | 내용 |
|------|------|------|
| 호출 | `server/src/toss/TossProvider.ts` | `getToken(authorizationCode, referrer, log)` |
| 전송 | 동일 | `client.post(GENERATE_TOKEN_PATH, { authorizationCode, referrer })` |

- Axios는 기본적으로 위 객체를 `JSON.stringify`로 보내고 `Content-Type: application/json`을 붙임.
- 스펙상 키는 `authorizationCode`로 맞음. **다만** 값이 `undefined`이거나, 직렬화 과정에서 빠지는 경우 토스가 "missing authentication code"를 줄 수 있음.

---

## 2. 결론 (공식 가이드라인 기준)

- **파싱**: 프론트는 `authorizationCode`를 올바르게 보내고, BFF는 Zod로 `authorizationCode`를 검증하고 있음. **파싱 자체는 스펙에 맞음.**
- **전송**: 토스로 나가는 **한 번의 HTTP body**를 “공식 스펙에 맞는 필수 필드만 넣은 객체”로 **명시적으로 구성**하지 않아, 환경/직렬화에 따라 `authorizationCode`가 비거나 빠질 가능성이 있음.

따라서 **원인**: BFF가 토스 generate-token API로 보낼 때, Request Body를 **공식 스펙(필수: authorizationCode)에 맞게 명시적으로만** 구성하지 않은 것.

---

## 3. 수정 계획 (요청 body에 authorizationCode 확실히 담기)

1. **라우트 (tossAuthRoute.ts)**  
   - `request.body`가 없으면 즉시 400 반환 (body 미파싱 구간 명확히 함).  
   - Zod 통과 후 `authorizationCode`를 `.trim()`한 값만 사용하고, trim 후 빈 문자열이면 400.  
   - 토스에는 **trim된 `authorizationCode`와 `referrer`만** 전달.

2. **TossProvider (getToken)**  
   - 토스로 보낼 body를 **한 번만** 공식 스펙에 맞게 구성:  
     `{ authorizationCode: string, referrer: string }`  
   - `authorizationCode`는 호출부에서 이미 검증된 non-empty string이어야 하며, 내부에서 한 번 더 비어 있으면 토스 호출 전에 실패 반환.  
   - `client.post(GENERATE_TOKEN_PATH, body)` 시 **위에서 만든 `body`만 사용**하여, 항상 동일한 형태로 전송.

3. **검증**  
   - 수정 후 실제 요청에서 토스로 나가는 body가 `{ "authorizationCode": "<실제 코드>", "referrer": "DEFAULT"|"sandbox" }` 형태인지 로그(마스킹) 또는 디버깅으로 확인 가능하면 좋음.

---

## 4. 적용할 코드 변경 요약

| 파일 | 변경 |
|------|------|
| `server/src/routes/tossAuthRoute.ts` | body 없음 시 400; Zod 후 `authorizationCode.trim()`, 빈 문자열 시 400; `getToken(trimmedCode, referrer)` 호출 |
| `server/src/toss/TossProvider.ts` | `getToken` 내부에서 전송용 body를 `{ authorizationCode, referrer }`로 명시적 구성; authorizationCode가 비어 있으면 토스 호출 전 에러 반환; 해당 body만으로 `client.post` 호출 |

이렇게 하면 **공식 스펙(필수: authorizationCode)**에 맞게, BFF가 토스 generate-token API로 보낼 때 Request Body에 `authorizationCode`가 항상 포함되도록 할 수 있음.
