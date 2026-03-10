# 샌드박스 로그인 실패 — Live vs Test API 키 충돌 검토

## 요약

**가능성: 높음.**  
샌드박스에서 로그인이 안 될 때, 백엔드가 **토스 실서버(Live) API + Live mTLS 인증서**만 사용하고 있어서, 샌드박스에서 발급된 **테스트용 인가 코드**를 Live 검증소에 보내 401/실패가 나는 경우가 있을 수 있습니다.

---

## 현재 구현

| 구분 | 코드 위치 | 내용 |
|------|-----------|------|
| API URL | `server/src/toss/TossProvider.ts` | `TOSS_API_URL` 단일 값만 사용 (기본: `https://apps-in-toss-api.toss.im`). **샌드박스 전용 URL 없음.** |
| mTLS | 동일 | `TOSS_CLIENT_CERT`, `TOSS_CLIENT_KEY` 단일 세트만 사용. **테스트(샌드박스)용 인증서 분리 없음.** |
| referrer | `tossAuthRoute.ts` → `TossProvider.getToken()` | 프론트에서 `referrer: 'sandbox' \| 'DEFAULT'` 전달하고, **generate-token 요청 body에만 포함**. API URL·인증서는 referrer와 무관하게 동일. |

즉, **referrer는 토스 서버에 “이 코드는 샌드박스용이에요”라고 알려주는 용도**로만 쓰이고,  
우리 서버가 **“샌드박스일 때는 다른 URL/다른 인증서를 쓴다”는 분기는 없음.**

---

## 왜 문제가 되는지 (가설)

1. **샌드박스**에서 `appLogin()` → 토스가 **테스트용 인가 코드** 발급 (실제 Live 유저가 아님).
2. 우리 BFF는 **항상** `TOSS_API_URL`(실서버) + **Live mTLS 인증서**로 `generate-token` 호출.
3. 토스 실서버는 “이 코드는 샌드박스/테스트 전용인데, 지금 요청은 Live 인증서로 왔음” → **401 또는 “해당 사용자 없음”** 등으로 거절.
4. 결과: 샌드박스에서만 로그인 실패, Live(실서비스)에서는 정상.

공식 문서에는 **generate-token 요청에 `referrer`(SANDBOX/DEFAULT)를 넣으라**고만 되어 있고,  
**샌드박스용 별도 API URL 또는 테스트용 mTLS 인증서**에 대한 명시적 설명은 없습니다.  
다만 일반적인 파트너 연동에서는 **테스트 환경 = 테스트 전용 URL/키**를 쓰는 경우가 많아, 위와 같은 **Live vs Test 키 충돌** 가능성이 있습니다.

---

## 공식 문서·커뮤니티 검토 결과 (2026년 기준)

### 공식 문서 (앱인토스 풀 문서)

- **API Base URL**  
  - 문서 전역에서 **`https://apps-in-toss-api.toss.im` 하나만** 사용.  
  - **테스트/샌드박스 전용 별도 API Base URL**은 **언급 없음.**
- **mTLS 인증서**  
  - “콘솔에서 발급”하는 **한 종류**만 안내.  
  - **테스트용·샌드박스용 별도 mTLS 발급** 안내 **없음.**
- **참고**  
  - 토스 **인증**(본인확인)은 `oauth2.cert.toss.im` 등 **테스트용 client_id/secret**이 문서에 있음.  
  - 앱인토스 **로그인**(generate-token / login-me)은 위 **동일 도메인**만 사용.

### 앱인토스 개발자 커뮤니티

- [테스트시 서버환경 분리 방법](https://techchat-apps-in-toss.toss.im/t/topic/199)  
  - “테스트 배포 vs 운영 배포의 API 호출 환경 분리” 질문에, 앱인토스(Dylan) 답변은 **미니앱이 호출하는 자사 서버** 분기만 안내.  
    - `https://<appName>.private-apps.tossmini.com` (콘솔 QR 테스트)  
    - `https://<appName>.apps.tossmini.com` (실서비스)  
  - **토스 파트너 API(`apps-in-toss-api.toss.im`) 쪽 테스트/운영 URL 분리는 언급 없음.**
- [AccessToken 발급이 안됩니다](https://techchat-apps-in-toss.toss.im/t/accesstoken/1543)  
  - request body 필드명 오류(`authorization_code` → `authorizationCode`)로 실패한 사례.  
  - **동일 호스트 `apps-in-toss-api.toss.im` + 동일 mTLS**로 처리. 샌드박스 전용 URL/인증서 언급 없음.

### 정리

- 문서·커뮤니티 기준으로 **테스트용 별도 API Base URL**, **테스트용 mTLS 인증서** 안내는 **없음.**
- 앱인토스 로그인은 **동일 URL + 동일 mTLS**로, 요청 body의 **referrer(sandbox/DEFAULT)** 로 구분하는 구조로 보는 것이 타당함.
- 따라서 샌드박스 로그인 실패 시 **우선 점검할 것**: referrer 전달 여부·값, body 필드명(`authorizationCode`), 인증서(앱 일치·만료), 네트워크/방화벽.  
  “Live vs Test 키 충돌” 가능성은 문서로 배제할 수 없으나, **별도 테스트 URL/인증서가 공식 제공되지 않음**이 확인됨.

---

## 확인 방법

1. **BFF 로그**  
   - `POST /auth/toss/exchange` 호출 시 **referrer** 값과,  
   - 실패 시 **어느 단계에서 실패했는지** (generate-token vs login-me) 확인.  
   - `Toss generate-token failed` + 401/403 등이면, **코드/환경 불일치** 가능성 높음.
2. **토스 앱인토스 콘솔·문의**  
   - 샌드박스 테스트 시 **별도 API Base URL** 또는 **테스트용 mTLS 인증서** 사용 여부 확인.  
   - “샌드박스에서 발급한 인가 코드는 반드시 샌드박스(테스트) API/인증서로만 검증해야 한다”는 안내가 있는지 확인.

---

## 대응 방안 (referrer 기준 분리)

토스 측에서 **샌드박스용 URL/인증서**를 제공한다면, 아래처럼 **referrer에 따라 API URL과 mTLS를 분리**하는 구성을 권장합니다.

- **환경 변수 예시**
  - Live(기존): `TOSS_API_URL`, `TOSS_CLIENT_CERT`, `TOSS_CLIENT_KEY`
  - Sandbox(선택): `TOSS_SANDBOX_API_URL`, `TOSS_SANDBOX_CLIENT_CERT`, `TOSS_SANDBOX_CLIENT_KEY`
- **로직**
  - `referrer === 'sandbox'` 이고 샌드박스용 env가 설정되어 있으면 → **샌드박스 URL + 샌드박스 인증서**로 generate-token / login-me 호출.
  - 그 외 → 기존처럼 Live URL + Live 인증서.
- **login-me**  
  - AccessToken이 어떤 환경에서 발급됐는지 알 수 있어야 하므로, **getToken과 동일한 referrer**를 사용해 **같은 환경의 클라이언트**로 login-me를 호출해야 합니다.

이렇게 하면 “샌드박스 코드를 Live 검증소에 보내서 401” 상황을 피할 수 있습니다.

---

## 참고

- `server/src/routes/tossAuthRoute.ts`: `referrer`를 파싱해 `getToken(code, referrer, log)`에 전달.
- `server/src/toss/TossProvider.ts`: 현재 단일 `BASE_URL`·단일 mTLS Agent만 사용.
- 토스 로그인 공식: generate-token 요청 body에 `authorizationCode`, `referrer`(SANDBOX | DEFAULT) 필수.
