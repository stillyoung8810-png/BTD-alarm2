/**
 * Toss BFF — 토스 미니앱용 mTLS 백엔드
 * - 로그인 code 교환, 결제 검증 등 토스 API 호출은 이 서버에서만 수행
 * - Railway Root Directory: toss-bff
 * - 환경 변수: TOSS_CLIENT_CERT, TOSS_CLIENT_KEY (PEM 문자열, \\n 가능)
 */

import https from 'https';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ---------------------------------------------------------------------------
// mTLS 클라이언트 (환경 변수에서 인증서 로드)
// ---------------------------------------------------------------------------

/** PEM 문자열 정규화: Railway 등에서 \n으로 저장된 경우 실제 줄바꿈으로 변환 */
function normalizePem(pem) {
  if (!pem || typeof pem !== 'string') return '';
  return pem.replace(/\\n/g, '\n').trim();
}

function createMtlsAgent() {
  const cert = normalizePem(process.env.TOSS_CLIENT_CERT);
  const key = normalizePem(process.env.TOSS_CLIENT_KEY);

  if (!cert || !key) {
    throw new Error('TOSS_CLIENT_CERT, TOSS_CLIENT_KEY 환경 변수가 필요합니다.');
  }

  return new https.Agent({
    cert,
    key,
    rejectUnauthorized: true,
  });
}

let mtlsAgent = null;

function getMtlsAgent() {
  if (!mtlsAgent) {
    mtlsAgent = createMtlsAgent();
  }
  return mtlsAgent;
}

/** 토스 API 호출 (mTLS 적용) */
function tossRequest(host, path, method = 'GET', body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const agent = getMtlsAgent();
    const base = host.replace(/\/$/, '');
    const pathPart = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(pathPart, base);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: url.port || 443,
      method,
      agent,
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            reject(new Error(parsed.reason || parsed.msg || data || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body != null) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// 토스 API 베이스 URL (환경 변수로 오버라이드 가능)
const TOSS_API_BASE = process.env.TOSS_API_BASE_URL || 'https://apps-in-toss-api.toss.im';
const TOSS_PAY_API_BASE = process.env.TOSS_PAY_API_BASE_URL || 'https://pay-apps-in-toss-api.toss.im';

// ---------------------------------------------------------------------------
// Health check (Railway 배포 확인용)
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'toss-bff' });
});

// ---------------------------------------------------------------------------
// 토스 로그인: 인가 코드 → Access Token 교환
// POST /auth/toss/code
// Body: { authorizationCode: string, referrer: string }
// ---------------------------------------------------------------------------
app.post('/auth/toss/code', async (req, res) => {
  try {
    const { authorizationCode, referrer } = req.body || {};
    if (!authorizationCode || !referrer) {
      return res.status(400).json({
        resultType: 'FAIL',
        error: { errorCode: 'BAD_REQUEST', reason: 'authorizationCode, referrer 필수' },
      });
    }

    const host = TOSS_API_BASE.replace(/\/$/, '');
    const result = await tossRequest(
      host,
      '/api-partner/v1/apps-in-toss/user/oauth2/generate-token',
      'POST',
      { authorizationCode, referrer }
    );

    return res.json(result);
  } catch (err) {
    console.error('[auth/toss/code]', err.message);
    return res.status(502).json({
      resultType: 'FAIL',
      error: {
        errorCode: 'TOSS_REQUEST_FAILED',
        reason: err.message || '토스 API 요청 실패',
      },
    });
  }
});

// ---------------------------------------------------------------------------
// 토스페이 결제 검증: payToken + orderNo로 결제 상태 조회
// POST /payment/toss/verify
// Body: { payToken: string, orderNo: string, isTestPayment: boolean }
// Header: x-toss-user-key (토스 로그인 userKey)
// ---------------------------------------------------------------------------
app.post('/payment/toss/verify', async (req, res) => {
  try {
    const userKey = req.headers['x-toss-user-key'];
    if (!userKey) {
      return res.status(400).json({
        resultType: 'FAIL',
        error: { errorCode: 'BAD_REQUEST', reason: 'x-toss-user-key 헤더 필수' },
      });
    }

    const { payToken, orderNo, isTestPayment } = req.body || {};
    if (!payToken || !orderNo || typeof isTestPayment !== 'boolean') {
      return res.status(400).json({
        resultType: 'FAIL',
        error: {
          errorCode: 'BAD_REQUEST',
          reason: 'payToken, orderNo, isTestPayment(boolean) 필수',
        },
      });
    }

    const host = TOSS_PAY_API_BASE.replace(/\/$/, '');
    const result = await tossRequest(
      host,
      '/api-partner/v1/apps-in-toss/pay/get-payment-status',
      'POST',
      { payToken, orderNo, isTestPayment },
      { 'x-toss-user-key': String(userKey) }
    );

    return res.json(result);
  } catch (err) {
    console.error('[payment/toss/verify]', err.message);
    return res.status(502).json({
      resultType: 'FAIL',
      error: {
        errorCode: 'TOSS_REQUEST_FAILED',
        reason: err.message || '토스 결제 API 요청 실패',
      },
    });
  }
});

// ---------------------------------------------------------------------------
// 토스페이 결제 실행 (인증 완료 후 서버에서 승인)
// POST /payment/toss/execute
// Body: { payToken: string, orderNo?: string, isTestPayment: boolean }
// Header: x-toss-user-key
// ---------------------------------------------------------------------------
app.post('/payment/toss/execute', async (req, res) => {
  try {
    const userKey = req.headers['x-toss-user-key'];
    if (!userKey) {
      return res.status(400).json({
        resultType: 'FAIL',
        error: { errorCode: 'BAD_REQUEST', reason: 'x-toss-user-key 헤더 필수' },
      });
    }

    const { payToken, orderNo, isTestPayment } = req.body || {};
    if (!payToken || typeof isTestPayment !== 'boolean') {
      return res.status(400).json({
        resultType: 'FAIL',
        error: {
          errorCode: 'BAD_REQUEST',
          reason: 'payToken, isTestPayment(boolean) 필수',
        },
      });
    }

    const host = TOSS_PAY_API_BASE.replace(/\/$/, '');
    const result = await tossRequest(
      host,
      '/api-partner/v1/apps-in-toss/pay/execute-payment',
      'POST',
      { payToken, orderNo, isTestPayment },
      { 'x-toss-user-key': String(userKey) }
    );

    return res.json(result);
  } catch (err) {
    console.error('[payment/toss/execute]', err.message);
    return res.status(502).json({
      resultType: 'FAIL',
      error: {
        errorCode: 'TOSS_REQUEST_FAILED',
        reason: err.message || '토스 결제 실행 API 요청 실패',
      },
    });
  }
});

// ---------------------------------------------------------------------------
// 서버 기동
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`toss-bff listening on port ${PORT}`);
});
