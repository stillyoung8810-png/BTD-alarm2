# 샌드박스 로그인 OAUTH_ISSUE_TOKEN_ERROR / clientId — 커뮤니티 질의 초안

## 1. 토스 가이드라인·문서 검토 결과 (clientId/앱 설정)

### 1.1 공식 문서에서 확인한 내용

- **generate-token API**  
  - 요청 body: `authorizationCode`, `referrer` 만 필수로 안내됨.  
  - **client_id, client_secret, grant_type** 등은 **문서에 없는 요청 필드**로, 우리 내부 스펙 정리 문서에서도 “전송 금지”로 명시함.
- **콘솔 가이드** (토스 로그인 설정)  
  - 약관 동의, 연동 서비스, 동의 항목, 약관 등록, 연결 끊기 콜백, 복호화 키 확인만 안내.  
  - **앱별 clientId 확인 방법**, **샌드박스 vs 실서비스 앱/인증서 분리**에 대한 설명 **없음**.
- **테스트 환경**  
  - “토스인증” 테스트용 `client_id`/`client_secret`은 문서에 있으나, **토스 인증(본인확인)** 전용.  
  - **앱인토스 로그인**(generate-token / login-me)용 별도 client_id/테스트 키 안내 **없음**.

### 1.2 개발자 커뮤니티 검토 결과

- 샌드박스 로그인 실패 관련 스레드들(예: “샌드박스 로그인 오류”, “샌드박스 앱 로그인 에러/실패”)에서는 다음만 안내됨:  
  - SDK 2.0.2 업데이트 권장  
  - 샌드박스 앱에서 로그아웃 후 재로그인  
  - 비즈니스 계정 이상 시 채널톡으로 계정 전달·확인 요청  
- **generate-token 응답의 OAUTH_ISSUE_TOKEN_ERROR / invalid_grant**, **“clientId 불일치”** 가능성, **샌드박스 전용 mTLS·API URL**에 대한 공식 답변 또는 가이드 **없음**.

### 1.3 결론

- 가이드라인·문서에는 **clientId 또는 샌드박스 전용 앱/인증서 설정**에 대한 내용이 **없음**.  
- 커뮤니티에도 **우리와 동일한 증상(토스앱에서는 성공, 샌드박스에서만 invalid_grant)** 에 대한 해결책이 **명시되어 있지 않음**.  
- 따라서 **토스 측에 상황 설명 + 질의를 올리는 것이 타당**함.

---

## 2. 앱인토스 개발자 커뮤니티에 올릴 질의 초안

아래 내용을 [앱인토스 개발자 커뮤니티 > 개발](https://techchat-apps-in-toss.toss.im/c/development/5) 카테고리에 새 주제로 붙여넣기 하시면 됩니다. 필요 시 태그: `webview`, `sdk`, `운영` 등.

---

### 제목 (예시)

**샌드박스에서만 generate-token 실패 (OAUTH_ISSUE_TOKEN_ERROR / invalid_grant, clientId 불일치 가능성)**

---

### 본문

**1. 글의 성격**  
질문 / 문제 해결

**2. 상황 요약**

- **토스앱(실서비스)** 에서는 미니앱 토스 로그인이 **정상 동작**합니다.
- **샌드박스** 환경에서만 로그인 시 **실패**하며, BFF에서 토스 `generate-token` API를 호출했을 때 아래 응답을 받습니다.

**3. 토스 API 응답 (요약)**

- HTTP 200 + body 내 `resultType: "FAIL"`
- `errorCode`: `OAUTH_ISSUE_TOKEN_ERROR`
- `reason`:  
  `400 BAD_REQUEST : invalid_grant. 사유: 1. authorization_code 가 이미 사용되었거나 만료됨. 2. 존재하지 않는 authorization_code(혹은 clientId 불일치).`

**4. 우리 측 구현 요약**

- **클라이언트**: `appLogin()`으로 받은 `authorizationCode`, `referrer`를 BFF로 전달합니다. 샌드박스일 때는 `referrer: "sandbox"`로 보냅니다.
- **BFF**: 단일 `TOSS_API_URL`(https://apps-in-toss-api.toss.im), 단일 mTLS 인증서(`TOSS_CLIENT_CERT`, `TOSS_CLIENT_KEY`)로  
  `POST /api-partner/v1/apps-in-toss/user/oauth2/generate-token`  
  호출 시 body에 **`authorizationCode`, `referrer`만** 넣고 있습니다. (공식 문서 기준으로 `client_id` 등은 넣지 않음)
- 인가 코드는 **매 요청 새로 발급**받아 한 번만 사용하고 있으며, referrer·앱 버전·재사용 여부는 확인 완료했습니다.

**5. 문의 드리고 싶은 점**

1. **샌드박스에서 발급된 authorization_code**를 **실서비스와 동일한 mTLS 인증서·동일한 API URL**로 `generate-token`에 보내도 되는 구조인가요, 아니면 샌드박스 전용 API URL·인증서(또는 별도 앱/ clientId 설정)가 필요한가요?
2. 에러 사유 중 **“존재하지 않는 authorization_code(혹은 clientId 불일치)”**가 나오는 경우,  
   - 샌드박스 앱과 실서비스 앱(또는 콘솔에 등록한 앱) 간 **clientId/앱 식별이 다르게** 되어 있어서 그런 것인지,  
   - 그렇다면 콘솔에서 확인할 수 있는 **clientId 또는 앱–인증서 매핑** 안내가 있는지  
   알려주시면 감사하겠습니다.
3. 위와 같은 **“실서비스는 성공, 샌드박스만 실패”** 사례에서 토스 측에서 권장하는 **점검 순서나 설정 확인 방법**이 있다면 안내 부탁드립니다.

**6. 환경**

- WebView 미니앱, SDK 2.0.2
- BFF: Node.js, 단일 API URL + 단일 mTLS로 generate-token / login-me 호출

---

이 초안을 그대로 또는 수정해서 커뮤니티에 올리시면 됩니다. 필요하면 로그 스니펫(개인정보·인증서 제외)을 짧게 추가하셔도 됩니다.
