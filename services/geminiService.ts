import { supabase } from './supabase';
import {
  fetchJsonWithTimeout,
  isRecord,
  readFiniteNumber,
  readString,
} from './serviceUtils';
import { readTrimmedViteEnv } from '../utils/viteImportMetaEnv';

const FALLBACK_ADVISOR_TEXT =
  'The QQQ-based technical strategy shows strong historical momentum. Ensure rigorous drawdown management is active for leveraged positions.';
const EDGE_BASE_URL = readTrimmedViteEnv('VITE_GEMINI_EDGE_URL');

type Tier = 'free' | 'paid';

interface RecognizedTradesPayload {
  trades: RecognizedTradeItem[];
}

const EMPTY_RECOGNIZED_TRADES: RecognizedTradesPayload = { trades: [] };

const getTier = (isPaidUser: boolean): Tier => (isPaidUser ? 'paid' : 'free');

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) {
    console.warn('[Gemini] getSession error:', error);
  }
  if (session?.access_token) {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  }

  console.warn(
    '[Gemini] no active Supabase session; calling Edge Function without Authorization header',
  );
  return { 'Content-Type': 'application/json' };
};

function decodeAdvisorText(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  return readString(payload, 'text');
}

/** AI가 인식한 단일 매매 항목 (저장 전 확인용) */
export interface RecognizedTradeItem {
  type: 'buy' | 'sell';
  stock: string;
  date: string;
  price: number;
  quantity: number;
  fee?: number;
  isMOC?: boolean;
}

function decodeRecognizedTradeItem(value: unknown): RecognizedTradeItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = readString(value, 'type');
  const stock = readString(value, 'stock');
  const date = readString(value, 'date');
  const price = readFiniteNumber(value, 'price');
  const quantity = readFiniteNumber(value, 'quantity');

  if (
    (type !== 'buy' && type !== 'sell') ||
    stock == null ||
    date == null ||
    price == null ||
    quantity == null ||
    price <= 0 ||
    quantity <= 0
  ) {
    return null;
  }

  const rawFee = value.fee;
  const fee =
    typeof rawFee === 'number' && Number.isFinite(rawFee) && rawFee >= 0
      ? rawFee
      : undefined;
  const isMOC = typeof value.isMOC === 'boolean' ? value.isMOC : undefined;

  return {
    type,
    stock,
    date,
    price,
    quantity,
    fee,
    isMOC,
  };
}

function decodeRecognizedTradesPayload(
  payload: unknown,
): RecognizedTradesPayload | null {
  if (!isRecord(payload) || !Array.isArray(payload.trades)) {
    return null;
  }

  const trades = payload.trades
    .map((item) => decodeRecognizedTradeItem(item))
    .filter((item): item is RecognizedTradeItem => item !== null);

  return { trades };
}

function mapGeminiFailureToThrownError(code: string): Error | null {
  switch (code) {
    case 'RATE_LIMIT':
      return new Error('RATE_LIMIT');
    case 'AUTH_REQUIRED':
      return new Error('AUTH_REQUIRED');
    case 'FORBIDDEN':
      return new Error('FORBIDDEN');
    case 'TIMEOUT':
    case 'NETWORK':
      return new Error('NETWORK_OR_CORS');
    default:
      return null;
  }
}

/** 전략 설명에 대한 짧은 인사이트를 반환. 실제 Gemini 호출은 Supabase Edge Function에서 처리. */
export const getStrategyAdvisor = async (
  strategyDescription: string,
  opts?: { isPaidUser?: boolean },
): Promise<string> => {
  if (EDGE_BASE_URL.length === 0) {
    console.warn(
      '[Gemini] VITE_GEMINI_EDGE_URL not set; using fallback advisor text.',
    );
    return FALLBACK_ADVISOR_TEXT;
  }

  try {
    const headers = await getAuthHeaders();
    const advisorResult = await fetchJsonWithTimeout<null>(
      EDGE_BASE_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'advisor',
          strategyDescription,
          tier: getTier(Boolean(opts?.isPaidUser)),
        }),
      },
      null,
      { context: { mode: 'advisor' } },
    );

    if (!advisorResult.ok) {
      console.error('[Gemini] advisor worker responded with error:', advisorResult.error);
      return FALLBACK_ADVISOR_TEXT;
    }

    return decodeAdvisorText(advisorResult.data) ?? FALLBACK_ADVISOR_TEXT;
  } catch (error) {
    console.error('[Gemini] advisor worker error:', error);
    return FALLBACK_ADVISOR_TEXT;
  }
};

/** 증권사 매매 내역 스크린샷 이미지를 분석해 매매 정보를 JSON 배열로 추출. 실제 Gemini 호출은 Supabase Edge Function에서 처리. */
export const analyzeTradeScreenshot = async (
  imageBase64: string,
  mimeType: string = 'image/png',
  options?: { isPaidUser?: boolean },
): Promise<RecognizedTradesPayload | null> => {
  if (EDGE_BASE_URL.length === 0) {
    console.warn(
      '[Gemini] VITE_GEMINI_EDGE_URL not set; skipping trade screenshot analysis.',
    );
    return EMPTY_RECOGNIZED_TRADES;
  }

  try {
    const headers = await getAuthHeaders();
    const analyzeResult = await fetchJsonWithTimeout<RecognizedTradesPayload>(
      EDGE_BASE_URL,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'analyze-trades',
          imageBase64,
          mimeType,
          tier: getTier(Boolean(options?.isPaidUser)),
        }),
      },
      EMPTY_RECOGNIZED_TRADES,
      { context: { mode: 'analyze-trades' } },
    );

    if (!analyzeResult.ok) {
      const mappedError = mapGeminiFailureToThrownError(analyzeResult.error.code);
      if (mappedError != null) {
        throw mappedError;
      }

      console.error('[Gemini] analyze worker error:', analyzeResult.error);
      return EMPTY_RECOGNIZED_TRADES;
    }

    return decodeRecognizedTradesPayload(analyzeResult.data) ?? EMPTY_RECOGNIZED_TRADES;
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (
        error.message === 'RATE_LIMIT' ||
        error.message === 'AUTH_REQUIRED' ||
        error.message === 'FORBIDDEN' ||
        error.message === 'NETWORK_OR_CORS'
      ) {
        throw error;
      }
    }

    console.error('analyzeTradeScreenshot error:', error);
    throw error;
  }
};
