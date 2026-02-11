# toss-bff

토스 미니앱 연동을 위한 BFF(Backend For Frontend). 로그인 code 교환, 결제 검증 등 **mTLS 필수** 토스 API 호출만 이 서버에서 수행합니다.

## Railway 배포

1. Railway **New Project** → **Deploy from GitHub repo** → 이 저장소 선택
2. 서비스 **Settings** → **Root Directory** 를 `toss-bff` 로 설정
3. **Variables** 탭에 아래 환경 변수 추가 (토스 콘솔에서 발급한 값 사용)

### 환경 변수 예시 (Railway Variables)

| 변수명 | 설명 |
|--------|------|
| `PORT` | Railway가 자동 설정. 없으면 3000 사용 |
| `TOSS_CLIENT_CERT` | mTLS 클라이언트 인증서 (PEM 전체) |
| `TOSS_CLIENT_KEY` | mTLS 클라이언트 비밀키 (PEM 전체) |
| `TOSS_API_BASE_URL` | 토스 로그인 API 베이스 (기본: `https://apps-in-toss-api.toss.im`) |
| `TOSS_PAY_API_BASE_URL` | 토스페이 API 베이스 (기본: `https://pay-apps-in-toss-api.toss.im`) |

인증서·키는 여러 줄이므로 Railway에서 Multiline 또는 `\n`으로 줄바꿈 입력 가능합니다.

### API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | 서버 상태 확인 |
| POST | `/auth/toss/code` | 인가 코드 → Access Token 교환. Body: `{ authorizationCode, referrer }` |
| POST | `/payment/toss/verify` | 결제 상태 조회. Header: `x-toss-user-key`, Body: `{ payToken, orderNo, isTestPayment }` |
| POST | `/payment/toss/execute` | 결제 실행(승인). Header: `x-toss-user-key`, Body: `{ payToken, orderNo?, isTestPayment }` |

## 로컬 실행

```bash
cd toss-bff
npm install
npm run dev
```

`/health` 로 서버 동작 확인: `http://localhost:3000/health`
