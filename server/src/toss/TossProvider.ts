/**
 * TossProvider: 토스 API 통신 전담.
 * - mTLS 인증서/키를 env에서 로드, HTTPS Agent는 싱글톤으로 한 번만 생성·재사용.
 * - correlation_id를 인자로 받아 모든 로그에 포함 (Request Tracing).
 */

import axios, { type AxiosInstance } from 'axios';
import https from 'https';
import type { RequestLogger } from './logger';
import { parseTokenResponse, parseLoginMeResponse, userKeyToString } from './responseParsers';
import type { TossTokenSuccessDto, TossErrorPayload, NormalizedTossError } from './types';
import { maskToken } from './logger';

const BASE_URL = process.env.TOSS_API_URL || 'https://apps-in-toss-api.toss.im';
const GENERATE_TOKEN_PATH = '/api-partner/v1/apps-in-toss/user/oauth2/generate-token';
const LOGIN_ME_PATH = '/api-partner/v1/apps-in-toss/user/oauth2/login-me';

let singletonAgent: https.Agent | null = null;
let singletonClient: AxiosInstance | null = null;

function getMtlsAgent(): https.Agent {
  if (singletonAgent) return singletonAgent;
  const cert = process.env.TOSS_CLIENT_CERT?.replace(/\\n/g, '\n');
  const key = process.env.TOSS_CLIENT_KEY?.replace(/\\n/g, '\n');
  if (!cert || !key) {
    throw new Error('TOSS_CLIENT_CERT and TOSS_CLIENT_KEY are required for mTLS');
  }
  singletonAgent = new https.Agent({
    cert,
    key,
    rejectUnauthorized: true,
  });
  return singletonAgent;
}

function getClient(): AxiosInstance {
  if (singletonClient) return singletonClient;
  const agent = getMtlsAgent();
  singletonClient = axios.create({
    baseURL: BASE_URL,
    httpsAgent: agent,
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  return singletonClient;
}

function normalizeTossError(data: unknown): NormalizedTossError {
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error?: TossErrorPayload | string }).error;
    if (err && typeof err === 'object' && err !== null) {
      return {
        error: typeof err.reason === 'string' ? err.reason : 'Unknown error',
        errorCode: typeof err.errorCode === 'string' ? err.errorCode : undefined,
      };
    }
    if (typeof err === 'string') return { error: err };
  }
  return { error: 'Internal Server Error' };
}

export interface GetTokenResult {
  success: true;
  data: TossTokenSuccessDto;
}
export interface GetTokenFailure {
  success: false;
  error: NormalizedTossError;
}

/**
 * AccessToken 발급. 성공 시 expiresIn 로그 필수; 토큰 값은 masking.
 */
export async function getToken(
  authorizationCode: string,
  referrer: string,
  log: RequestLogger
): Promise<GetTokenResult | GetTokenFailure> {
  const client = getClient();
  try {
    const res = await client.post(GENERATE_TOKEN_PATH, { authorizationCode, referrer });
    const parsed = parseTokenResponse(res.data);
    if (!parsed) {
      log.warn({ raw: res.data }, 'Toss generate-token response shape invalid');
      return { success: false, error: { error: 'Invalid token response shape' } };
    }
    log.info(
      {
        expiresIn: parsed.expiresIn,
        accessTokenMasked: maskToken(parsed.accessToken),
        refreshTokenMasked: maskToken(parsed.refreshToken),
      },
      'Toss generate-token success'
    );
    return { success: true, data: parsed };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const payload = normalizeTossError(err.response?.data);
      log.warn(
        { status: err.response?.status, errorCode: payload.errorCode, reason: payload.error },
        'Toss generate-token failed'
      );
      return { success: false, error: payload };
    }
    log.error({ err }, 'Toss generate-token unexpected error');
    return { success: false, error: { error: 'Internal Server Error' } };
  }
}

export interface GetLoginMeResult {
  success: true;
  userKey: string;
}
export interface GetLoginMeFailure {
  success: false;
  error: NormalizedTossError;
}

/**
 * login-me 호출. userKey를 string으로 반환 (DB 저장용).
 */
export async function getLoginMe(accessToken: string, log: RequestLogger): Promise<GetLoginMeResult | GetLoginMeFailure> {
  const client = getClient();
  try {
    const res = await client.get(LOGIN_ME_PATH, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const parsed = parseLoginMeResponse(res.data);
    if (!parsed) {
      log.warn({ hasData: !!res.data }, 'Toss login-me response shape invalid');
      return { success: false, error: { error: 'Invalid login-me response shape' } };
    }
    const userKeyStr = userKeyToString(parsed.userKey);
    log.info({ userKey: userKeyStr }, 'Toss login-me success');
    return { success: true, userKey: userKeyStr };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const payload = normalizeTossError(err.response?.data);
      log.warn(
        { status: err.response?.status, errorCode: payload.errorCode, reason: payload.error },
        'Toss login-me failed'
      );
      return { success: false, error: payload };
    }
    log.error({ err }, 'Toss login-me unexpected error');
    return { success: false, error: { error: 'Internal Server Error' } };
  }
}
