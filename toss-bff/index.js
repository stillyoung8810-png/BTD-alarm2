/**
 * Toss BFF — 토스 미니앱용 mTLS 백엔드
 * - 로그인 code 교환, 결제 검증 등 토스 API 호출은 이 서버에서만 수행
 * - Railway Root Directory: toss-bff
 */

import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check (Railway 배포 확인용)
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'toss-bff' });
});

// TODO: 토스 로그인 code → access_token 교환 (mTLS 클라이언트로 토스 API 호출)
// app.post('/auth/toss/code', ...);

// TODO: 토스페이 결제 검증 (mTLS로 토스 결제 API 호출)
// app.post('/payment/toss/verify', ...);

app.listen(PORT, () => {
  console.log(`toss-bff listening on port ${PORT}`);
});
