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
| `TOSS_API_BASE_URL` | 토스 API 베이스 URL (개발/운영 구분) |

인증서·키는 여러 줄이므로 Railway에서 Multiline 또는 한 줄로 이스케이프해서 입력합니다.

## 로컬 실행

```bash
cd toss-bff
npm install
npm run dev
```

`/health` 로 서버 동작 확인: `http://localhost:3000/health`
