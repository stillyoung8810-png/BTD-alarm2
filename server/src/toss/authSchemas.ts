/**
 * BFF 요청 검증: Zod .strict() 로 문서에 없는 파라미터 1개라도 있으면 400.
 * Zero-Assumption 강제.
 */

import { z } from 'zod';

/** 공식 문서: sandbox | DEFAULT 만 허용 */
export const TOSS_REFERRER_ENUM = z.enum(['sandbox', 'DEFAULT']);

export const tossExchangeBodySchema = z
  .object({
    authorizationCode: z.string().min(1, 'authorizationCode is required'),
    referrer: TOSS_REFERRER_ENUM,
  })
  .strict();

export type TossExchangeBody = z.infer<typeof tossExchangeBodySchema>;

export function parseTossExchangeBody(body: unknown): { success: true; data: TossExchangeBody } | { success: false; error: string } {
  const result = tossExchangeBodySchema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  const first = result.error.flatten().fieldErrors;
  const msg = Object.entries(first)
    .map(([k, v]) => (Array.isArray(v) ? v.join(', ') : String(v)))
    .join('; ') || result.error.message;
  return { success: false, error: msg };
}
