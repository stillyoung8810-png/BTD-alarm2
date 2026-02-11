# Railway BFF — 토스 mTLS 연동 업무 요청 프롬프트

아래 블록 전체를 **안티그래비티(또는 BFF 구현 담당자)**에게 전달하세요. 복사 후 붙여넣기만 하면 됩니다.

---

## [복사 시작] ————————
[역할] 너는 구글과 메타 출신의 까다롭고 강박적인 '에이스 코드 개발자 & Senior Backend & Security Engineer'야. 다음 기능들의 구현을 위해서 꼼꼼하고 완벽을 추구하는 품질의 극한으로 구현하고 싶어.
당신은 **Railway에 배포되는 BFF(Backend for Frontend)** 서버를 구현하는 개발자입니다.  
**토스 앱인토스(앱인토스)** 의 **mTLS 기반 서버 간 통신** 규격에 맞춰, 아래 두 개의 API를 구현해 주세요.

### 필수 참고 문서 (토스 공식)

- **통합 절차·mTLS 필수 안내**: https://developers-apps-in-toss.toss.im/development/integration-process.html  
  → 토스 로그인·토스페이·기능성 푸시 등은 **반드시 mTLS 인증서를 사용한 서버-서버 통신**으로만 호출 가능합니다.
- **토스 로그인**: https://developers-apps-in-toss.toss.im/login/intro.html  
  → 인증 코드(code)를 토스 서버에 보내 액세스 토큰 등으로 교환하는 방법 확인.
- **토스 페이**: https://developers-apps-in-toss.toss.im/tosspay/intro.html  
  → 결제 검증(Verify) API 스펙 확인.

위 문서에서 **요청 URL, 헤더, body, 인증서/키 설정 방법**을 확인한 뒤, Railway 서버에서 **발급받은 mTLS 인증서(클라이언트 인증서 + 키)** 를 사용해 토스 API를 호출하도록 구현해 주세요.

---

### 구현할 API 1: 토스 로그인 — 인증 코드 → 세션 발급

- **역할**: 클라이언트(토스 미니앱)가 브릿지로부터 받은 **토스 인증 코드(code)** 를 당신 서버로 보내면, **당신 서버가 mTLS로 토스 API를 호출**해 코드를 교환하고, 그 결과를 바탕으로 **Supabase Auth 세션(access_token, refresh_token)** 을 만들어 클라이언트에 돌려줍니다.
- **엔드포인트**: `POST /auth/toss/exchange`
- **요청**
  - **Headers**: `Content-Type: application/json`
  - **Body (JSON)**:
    ```json
    { "code": "토스_브릿지에서_받은_인증_코드" }
    ```
- **응답 (성공 시, 200)**
  - 클라이언트가 **Supabase의 setSession**에 그대로 넣을 수 있도록 다음 형식을 지켜 주세요.
  - **필수 필드**: `access_token`, `refresh_token` (Supabase JWT).
  - **선택 필드**: `user` (id, email 등 — 클라이언트 표시용).
  - 예시:
    ```json
    {
      "access_token": "eyJ...",
      "refresh_token": "abc...",
      "user": { "id": "uuid", "email": "user@example.com" }
    }
    ```
  - `access_token` / `refresh_token`은 **Supabase Auth**에서 발급한 값이어야 합니다.  
    즉, 토스 API로 코드 교환 후 받은 토스 사용자 정보로 **우리 백엔드/Supabase에서 사용자를 생성·조회하고**, Supabase의 `signInWithPassword` 또는 Admin API 등으로 **세션을 생성**한 뒤, 그 세션의 `access_token`, `refresh_token`을 반환해 주세요.
- **응답 (실패 시, 4xx/5xx)**
  - JSON body에 `message` 또는 `error` 필드로 에러 사유를 포함해 주세요.
  - 예: `{ "error": "유효하지 않은 인증 코드입니다." }`

**요약**:  
클라이언트 → `POST /auth/toss/exchange` { code } → **당신 서버가 mTLS로 토스 로그인 API 호출** → 토스 사용자 정보 확보 → **Supabase에서 해당 사용자로 세션 생성** → `access_token`, `refresh_token`, (선택) `user` 반환.

---

### 구현할 API 2: 토스페이 결제 검증 (Verify)

- **역할**: 클라이언트가 토스 미니앱 내에서 토스페이로 결제를 완료한 뒤, **결제 ID(paymentId)** 와 **플랜 ID(planId)** 를 당신 서버로 보냅니다. **당신 서버는 mTLS로 토스 페이(앱인토스) 결제 검증 API를 호출**해 실제 결제 성공·금액 등을 확인한 뒤, 우리 시스템(DB 등)에 주문/구독을 반영하고 결과를 반환합니다.
- **엔드포인트**: `POST /payment/toss/verify`
- **요청**
  - **Headers**:
    - `Content-Type: application/json`
    - `Authorization: Bearer <Supabase_액세스_토큰>`  
      → 클라이언트가 로그인한 사용자의 Supabase JWT. 서버에서 이 토큰을 검증해 `user_id`를 얻고, 주문/구독을 해당 사용자에게 연결합니다.
  - **Body (JSON)**:
    ```json
    { "paymentId": "order_xxx", "planId": "pro" }
    ```
    - `planId`: `"pro"` 또는 `"premium"` (우리 서비스의 구독 플랜 식별자).
- **응답 (성공 시, 200)**
  - 다음 형식을 지켜 주세요 (클라이언트가 그대로 사용합니다).
  - **필수**: `success: true`, (선택) `message`, (선택) `subscription`.
  - 예시:
    ```json
    {
      "success": true,
      "message": "결제가 완료되었습니다.",
      "subscription": {
        "tier": "pro",
        "status": "active",
        "expiresAt": "2025-03-11T00:00:00.000Z"
      }
    }
    ```
  - **서버에서 해야 할 일**:
    1. **mTLS로 토스 페이 결제 검증 API**를 호출해 해당 `paymentId`의 결제가 실제로 성공했는지, 금액이 맞는지 확인합니다.
    2. 검증이 성공하면, 우리 DB(또는 Supabase)에 **orders** 기록 및 **user_profiles**의 구독( subscription_tier, subscription_status, subscription_expires_at 등)을 업데이트합니다.
    3. 위 예시 형태로 JSON을 반환합니다.
- **응답 (실패 시, 4xx/5xx)**
  - JSON body에 `success: false`, `error` 또는 `message` 포함.
  - 예: `{ "success": false, "error": "결제 검증에 실패했습니다." }`

**요약**:  
클라이언트 → `POST /payment/toss/verify` (Authorization + paymentId, planId) → **당신 서버가 mTLS로 토스 결제 검증 API 호출** → 검증 성공 시 DB에 주문/구독 반영 → `success`, `message`, `subscription` 반환.

---

### 기술 요구사항

1. **플랫폼**: Railway에 배포되는 서버 (Node.js, Python, Go 등 자유).
2. **mTLS**: 토스 앱인토스 콘솔에서 발급한 **클라이언트 인증서(.pem 등)** 와 **비밀키**를 서버 환경(Railway Variables 또는 Secrets)에 안전하게 넣고, 토스 API 호출 시 이 인증서로 **mTLS 클라이언트 인증**을 수행해 주세요.  
   - 참고: https://developers-apps-in-toss.toss.im/development/integration-process.html 의 “API 요청 시 인증서 설정” 섹션.
3. **CORS**: 웹 클라이언트(프론트) 도메인에서 `POST` 요청을 보낼 수 있도록 필요한 CORS 헤더를 설정해 주세요.
4. **보안**:
   - 인증서/키는 반드시 서버 환경 변수 또는 Secrets로만 관리하고, 코드/저장소에 직접 넣지 마세요.
   - `/payment/toss/verify`에서는 반드시 **Authorization** 토큰을 검증해 요청한 사용자와 결제/구독을 연결해 주세요.

---

### 클라이언트(프론트) 동작 요약 (참고용)

- **로그인**: 토스 미니앱에서 “Toss로 계속하기” 클릭 → 브릿지로 인증 코드 획득 → `POST {BFF_URL}/auth/toss/exchange` with `{ code }` → 받은 `access_token`, `refresh_token`으로 Supabase `setSession` 호출.
- **결제**: 토스페이로 결제 요청 후 성공 시 → `POST {BFF_URL}/payment/toss/verify` with `Authorization: Bearer <token>`, body `{ paymentId, planId }` → 응답이 `success: true`일 때만 구독 활성화 처리.

위 두 API를 Railway에서 mTLS로 토스와 연동해 구현해 주세요.  
토스 공식 문서의 최신 스펙(URL, 파라미터명, 응답 형식)을 반드시 확인한 뒤 구현하고, 우리 클라이언트가 기대하는 **응답 필드명(access_token, refresh_token, success, subscription 등)** 은 위와 맞춰 주세요.

## [복사 끝] ————————
