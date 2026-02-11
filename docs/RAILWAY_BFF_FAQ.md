# Railway BFF 설정 FAQ

## 1. TOSS_CLIENT_ID는 뭐고, 어디서 받나요? (토스 시크릿 키랑 다른가요?)

**다릅니다.**

| 구분 | 용도 | 발급처 |
|------|------|--------|
| **TOSS_CLIENT_ID** | 토스 **앱인토스** 앱 식별자. 로그인(code → 토큰 교환) 요청 시 body에 넣는 값. | **앱인토스 개발자 콘솔** (앱 생성·mTLS 발급하는 그 콘솔) |
| **TOSS_CLIENT_CERT / TOSS_CLIENT_KEY** | mTLS 인증서·개인키. 서버 ↔ 토스 API 통신 시 클라이언트 인증용. | 같은 앱인토스 콘솔 → mTLS 인증서 발급 |
| **토스페이먼츠 시크릿 키** (TOSS_PAYMENTS_SECRET_KEY 등) | 토스페이 **일반 결제 API** 인증용 (Basic Auth 등). | **토스페이먼츠** 가맹점 콘솔 |

- **TOSS_CLIENT_ID**는 **앱인토스**에서 앱 만들 때 나오는 **앱 키 / Client ID / App ID** 같은 값입니다.  
  콘솔에서 해당 앱 선택 → “앱 정보”, “앱 키”, “연동 정보” 같은 메뉴에서 확인하세요.  
  (문서: [토스 로그인 소개](https://developers-apps-in-toss.toss.im/login/intro.html) 등에서 `client_id` 요구 여부 확인 가능.)
- 아까 받은 **토스 시크릿 키**가 **토스페이먼츠** 쪽 키라면, 그건 **TOSS_CLIENT_ID와 별개**입니다.  
  BFF의 **로그인** 흐름에는 **TOSS_CLIENT_ID**(앱인토스) + **mTLS 인증서**가 쓰이고,  
  **결제** 쪽은 앱인토스 mTLS 전용인지, 토스페이먼츠 API도 쓰는지에 따라 시크릿 키가 추가로 필요할 수 있습니다.

---

## 2. Root Directory를 `toss-bff`에서 `server`로 바꿔도 되나요? 문제 없나요?

**우리 프로젝트 기준으로는 “BFF 배포 대상”을 `server`로 두는 게 맞고, `server`로 바꾸면 문제가 생기는 게 아니라 올바르게 배포됩니다.**

이유:

- 이 리포지터리에는 BFF 관련 폴더가 **두 개** 있습니다.
  - **`server/`**  
    - 지금 우리가 쓰는 BFF (TypeScript, Fastify, `auth/toss/exchange`, `payment/toss/verify`, mTLS `tossClient` 등).  
    - 안티그래비티가 정리한 “Railway 설정”과 **RAILWAY_BFF_TOSS_PROMPT**에 나온 코드가 여기 있습니다.
  - **`toss-bff/`**  
    - 예전/간단 버전 (예: `index.js` 등 소수 파일).  
    - 지금 프론트는 **server**에 구현된 두 API를 호출하도록 되어 있습니다.

- Railway **Root Directory** 의미:
  - `toss-bff` → **`toss-bff`** 폴더를 프로젝트 루트로 보고, 그 안의 `package.json`으로 `npm install` / `npm run build` 실행.
  - `server` → **`server`** 폴더를 프로젝트 루트로 보고, 그 안의 `package.json`으로 빌드·실행.

- 그래서:
  - **지금 우리가 사용하는 BFF = `server/`** 이므로, Railway에서 이걸 배포하려면 Root Directory를 **`server`** 로 두는 것이 맞습니다.
  - **`toss-bff` → `server`로 바꾼다** = “배포할 BFF를 toss-bff가 아니라 server로 바꾼다”는 뜻이지, 기존에 잘 되던 걸 깨는 설정이 아닙니다.  
    단, 예전에 **toss-bff만** 배포하던 서비스였다면, 그때는 **toss-bff**용 설정이었을 수 있고, 지금은 **server**용 설정(아래 환경 변수 등)으로 맞춰야 합니다.

**정리**:  
- 우리 프로젝트에 맞게 쓰려면 Root Directory = **`server`** 가 맞고,  
- 빌드 명령은 예: `npm install && npm run build`,  
- 시작 명령은 예: `npm start` (또는 `node dist/index.js`)  
처럼 **server** 폴더 기준으로 두면 됩니다. `toss-bff`로 두었던 걸 **server**로 바꿔도 문제 없고, 오히려 지금 코드와 맞는 설정입니다.

---

## 3. 우리 프로젝트에 맞는 Railway 설정 요약

- **Root Directory**: `server`
- **Build Command**: `npm install && npm run build` (또는 Railway가 자동 감지)
- **Start Command**: `npm start`
- **Variables (필수)**:
  - `TOSS_CLIENT_CERT` — 앱인토스 mTLS 인증서(.pem) 전체 내용
  - `TOSS_CLIENT_KEY` — 인증서 개인키 내용
  - `SUPABASE_URL` — Supabase 프로젝트 URL
  - `SUPABASE_SERVICE_ROLE_KEY` — Supabase 서비스 롤 키(Admin API용)
  - `TOSS_CLIENT_ID` — 앱인토스 콘솔의 앱 키/Client ID (로그인용)
- **선택**:
  - `TOSS_API_URL` — 기본값 사용 시 생략 가능
  - `CORS_ORIGIN` — 필요 시 지정
  - `PORT` — Railway가 주입하면 생략 가능

이렇게 하면 안티그래비티가 정리한 “다음 단계”가 **우리 프로젝트(server 폴더 BFF)** 에 맞게 적용됩니다.
