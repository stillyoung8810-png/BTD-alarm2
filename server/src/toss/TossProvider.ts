/**
 * TossProvider: 토스 API 통신 전담.
 * - mTLS 인증서/키를 env에서 로드, HTTPS Agent는 싱글톤으로 한 번만 생성·재사용.
 * - Live/샌드박스 구분 없이 단일 TOSS_API_URL + 단일 mTLS만 사용 (공식 문서·커뮤니티 기준 별도 테스트 URL/인증서 없음).
 */

import axios, { type AxiosInstance } from 'axios';
import https from 'https';
import type { RequestLogger } from './logger';
import { parseTokenResponse, parseLoginMeResponse, userKeyToString } from './responseParsers';
import type { TossTokenSuccessDto, TossErrorPayload, NormalizedTossError } from './types';
import { baseLogger, maskToken } from './logger';

const BASE_URL = process.env.TOSS_API_URL || 'https://apps-in-toss-api.toss.im';
const GENERATE_TOKEN_PATH = '/api-partner/v1/apps-in-toss/user/oauth2/generate-token';
const LOGIN_ME_PATH = '/api-partner/v1/apps-in-toss/user/oauth2/login-me';
const SEND_MESSAGE_PATH = '/api-partner/v1/apps-in-toss/messenger/send-message';

/** 스마트 메시지 단건 발송: 템플릿 변수 객체 (userName은 토스가 자동 치환) */
export interface SendMessageContext {
  [key: string]: string;
}

/** 단건 발송 성공 시 result 객체 (문서 기준) */
export interface SendMessageApiResult {
  msgCount?: number;
  sentPushCount?: number;
  sentInboxCount?: number;
  detail?: { sentPush?: unknown[]; sentInbox?: unknown[] };
  fail?: { sentPush?: Array<{ contentId?: string; reachFailReason?: string }>; sentInbox?: unknown[] };
}

export interface SendMessageSuccess {
  success: true;
  data: SendMessageApiResult;
}
export interface SendMessageFailure {
  success: false;
  error: NormalizedTossError;
}

/** 대량 발송 시 한 명당 userKey + context */
export interface BulkMessageItem {
  userKey: string;
  context: SendMessageContext;
}

/** 대량 발송 결과 한 건 */
export interface BulkMessageItemResult {
  userKey: string;
  success: boolean;
  error?: NormalizedTossError;
}

export interface SendBulkMessageResult {
  successCount: number;
  failCount: number;
  results: BulkMessageItemResult[];
}

let singletonAgent: https.Agent | null = null;
let singletonClient: AxiosInstance | null = null;

function maskSecret(value: string, visibleChars = 10): string {
  if (!value || value.length <= visibleChars * 2) return '***';
  return `${value.slice(0, visibleChars)}...${value.slice(-visibleChars)}`;
}

function getMtlsAgent(): https.Agent {
  if (singletonAgent) return singletonAgent;
  const rawCert = process.env.TOSS_CLIENT_CERT || '';
  const rawKey = process.env.TOSS_CLIENT_KEY || '';

  baseLogger.info(
    {
      hasCert: !!rawCert,
      hasKey: !!rawKey,
      certLength: rawCert.length,
      keyLength: rawKey.length,
      certHasEscapedNewlines: rawCert.includes('\\n'),
      keyHasEscapedNewlines: rawKey.includes('\\n'),
      certSnippet: maskSecret(rawCert),
      keySnippet: maskSecret(rawKey),
    },
    'Toss mTLS env vars loaded'
  );

  const cert = rawCert.replace(/\\n/g, '\n');
  const key = rawKey.replace(/\\n/g, '\n');

  if (!cert || !key) {
    baseLogger.error(
      {
        hasCert: !!cert,
        hasKey: !!key,
      },
      'TOSS_CLIENT_CERT and TOSS_CLIENT_KEY are required for mTLS'
    );
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
  singletonClient = axios.create({
    baseURL: BASE_URL,
    httpsAgent: getMtlsAgent(),
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
 * AccessToken 발급. body는 반드시 authorizationCode(camelCase), referrer 로 전송 (스네이크 케이스 시 토스 API 에러).
 * Toss 공식 실패 응답(200 OK + FAIL payload)도 여기서 명시적으로 처리한다.
 */
export async function getToken(
  authorizationCode: string,
  referrer: string,
  log: RequestLogger
): Promise<GetTokenResult | GetTokenFailure> {
  const code = authorizationCode?.trim();
  if (!code) {
    log.warn('getToken: authorizationCode is empty');
    return { success: false, error: { error: 'authorizationCode is required' } };
  }

  const client = getClient();
  const body: { authorizationCode: string; referrer: string } = {
    authorizationCode: code,
    referrer,
  };

  log.info(
    {
      url: `${BASE_URL}${GENERATE_TOKEN_PATH}`,
      referrer,
      bodyKeys: Object.keys(body),
      codeLength: code.length,
    },
    '[Toss] generate-token request (debug)'
  );

  try {
    const res = await client.post(GENERATE_TOKEN_PATH, body);

    // Toss 공식 실패 규격 선제 처리 (HTTP 200 + 실패 payload)
    if (res.data && typeof res.data === 'object') {
      const d = res.data as {
        error?: string | TossErrorPayload;
        resultType?: string;
      };

      // 케이스 A: { error: "invalid_grant" } 형태
      if (typeof d.error === 'string') {
        const payload = normalizeTossError({ error: d.error });
        log.warn(
          {
            raw: res.data,
            error: payload.error,
            errorCode: payload.errorCode,
          },
          'Toss generate-token returned error string'
        );
        return { success: false, error: payload };
      }

      // 케이스 B: { resultType: "FAIL", error: { errorCode, reason } } 형태
      if (d.resultType === 'FAIL') {
        const payload = normalizeTossError({ error: d.error });
        log.warn(
          {
            raw: res.data,
            error: payload.error,
            errorCode: payload.errorCode,
          },
          'Toss generate-token returned FAIL resultType'
        );
        return { success: false, error: payload };
      }
    }

    // 여기까지 왔으면 SUCCESS 케이스만 남음 → 기존 파서 사용
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
        {
          status: err.response?.status,
          errorCode: payload.errorCode,
          reason: payload.error,
          axiosCode: err.code,
          axiosMessage: err.message,
          axiosIsTimeout: err.code === 'ECONNABORTED',
          axiosUrl: err.config ? `${err.config.baseURL || ''}${err.config.url || ''}` : undefined,
          raw: err.response?.data,
        },
        'Toss generate-token failed'
      );
      return { success: false, error: payload };
    }
    const unknownErr = err as Error;
    log.error(
      {
        errName: unknownErr?.name,
        errMessage: unknownErr?.message,
        errStack: unknownErr?.stack,
      },
      'Toss generate-token unexpected error'
    );
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
  log.info(
    { url: `${BASE_URL}${LOGIN_ME_PATH}`, hasToken: !!accessToken },
    '[Toss] login-me request (debug)'
  );
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

/**
 * 스마트 메시지 단건 발송 (기능성 푸시/알림).
 * - 헤더 x-toss-user-key 필수.
 * - 토스 API는 실패 시에도 HTTP 200 + resultType: "FAIL"을 반환하므로, 응답 body로 성공/실패 구분.
 */
export async function sendMessage(
  userKey: string,
  templateSetCode: string,
  context: SendMessageContext,
  log: RequestLogger
): Promise<SendMessageSuccess | SendMessageFailure> {
  const key = String(userKey).trim();
  if (!key) {
    log.warn('sendMessage: userKey is empty');
    return { success: false, error: { error: 'userKey is required' } };
  }
  if (!templateSetCode?.trim()) {
    log.warn('sendMessage: templateSetCode is empty');
    return { success: false, error: { error: 'templateSetCode is required' } };
  }

  const client = getClient();
  const body = { templateSetCode: templateSetCode.trim(), context };

  log.info(
    { path: SEND_MESSAGE_PATH, templateSetCode, userKeyMasked: maskSecret(key, 4), contextKeys: Object.keys(context) },
    '[Toss] send-message request (debug)'
  );

  try {
    const res = await client.post(SEND_MESSAGE_PATH, body, {
      headers: { 'x-toss-user-key': key },
    });

    const data = res.data as {
      resultType?: string;
      result?: SendMessageApiResult;
      error?: TossErrorPayload | string;
    };

    if (data && typeof data === 'object' && data.resultType !== 'SUCCESS') {
      const payload = normalizeTossError({ error: data.error });
      log.warn(
        { resultType: data.resultType, errorCode: payload.errorCode, reason: payload.error },
        'Toss send-message returned non-SUCCESS resultType'
      );
      return { success: false, error: payload };
    }

    const result = data?.result;
    if (!result || typeof result !== 'object') {
      log.warn({ raw: data }, 'Toss send-message response shape invalid');
      return { success: false, error: { error: 'Invalid send-message response shape' } };
    }

    if (result.fail) {
      const pushFails = result.fail.sentPush ?? [];
      for (const item of pushFails) {
        const reason = (item as { reachFailReason?: string }).reachFailReason;
        if (reason) log.warn({ reachFailReason: reason, contentId: (item as { contentId?: string }).contentId }, 'Toss send-message partial fail (push)');
      }
    }

    log.info(
      { msgCount: result.msgCount, sentPushCount: result.sentPushCount, sentInboxCount: result.sentInboxCount },
      'Toss send-message success'
    );
    return { success: true, data: result };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const payload = normalizeTossError(err.response?.data);
      log.warn(
        {
          status: err.response?.status,
          errorCode: payload.errorCode,
          reason: payload.error,
          axiosCode: err.code,
          axiosIsTimeout: err.code === 'ECONNABORTED',
        },
        'Toss send-message failed'
      );
      return { success: false, error: payload };
    }
    const unknownErr = err as Error;
    log.error({ errName: unknownErr?.name, errMessage: unknownErr?.message }, 'Toss send-message unexpected error');
    return { success: false, error: { error: 'Internal Server Error' } };
  }
}

/**
 * 대량 스마트 메시지 발송 (단건 API 순차 호출).
 * 레이트 리밋 완화를 위해 호출 간 delayMs(기본 100) 적용.
 */
export async function sendBulkMessage(
  templateSetCode: string,
  items: BulkMessageItem[],
  log: RequestLogger,
  options?: { delayMs?: number }
): Promise<SendBulkMessageResult> {
  const delayMs = Math.max(0, options?.delayMs ?? 100);
  const results: BulkMessageItemResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < items.length; i++) {
    if (i > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    const item = items[i];
    const out = await sendMessage(item.userKey, templateSetCode, item.context, log);
    if (out.success) {
      successCount++;
      results.push({ userKey: item.userKey, success: true });
    } else {
      failCount++;
      results.push({ userKey: item.userKey, success: false, error: out.error });
    }
  }

  log.info(
    { templateSetCode, total: items.length, successCount, failCount },
    'Toss send-bulk-message finished'
  );
  return { successCount, failCount, results };
}
