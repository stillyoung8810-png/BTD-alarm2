/**
 * Pre-implementation snippets for docs/hotfix_ai_recognition_recovery_v1.md.
 *
 * These snippets show the rollout-safe shape only. Do not copy this whole file
 * into production. Apply the relevant fragments to:
 *
 * - supabase/functions/gemini/index.ts
 * - services/geminiService.ts
 * - components/AIImageInputModal.tsx
 */

type UsageCheckMode = 'edge';
type UsageLimitCode = 'DAILY_LIMIT_REACHED' | 'MONTHLY_LIMIT_REACHED';
type UsageTier = 'free' | 'pro' | 'premium';
type GeminiMode = 'advisor' | 'analyze-trades';

interface AnalyzeTradesRecoveryRequest {
  mode: GeminiMode;
  usageCheckMode?: UsageCheckMode;
  usageTier?: string;
  skipUsageCheck?: boolean;
}

interface RecognizedTradesPayloadShape {
  trades: readonly unknown[];
  usageLimit?: UsageLimitCode;
}

interface AnalyzeTradeScreenshotRecoveryOptions {
  isPaidUser?: boolean;
  usageTier?: string;
  skipUsageCheck?: boolean;
}

interface UsageRpcPayload {
  success: boolean;
  error?: string;
  current_daily?: number;
  current_monthly?: number | null;
}

const UNLIMITED_USAGE_QUOTA = 999;
const PRO_MONTHLY_AI_QUOTA = 50;
const FREE_DAILY_AI_QUOTA = 1;

const AI_USAGE_LIMITS: Record<
  UsageTier,
  { daily: number; monthly: number }
> = {
  free: { daily: FREE_DAILY_AI_QUOTA, monthly: UNLIMITED_USAGE_QUOTA },
  pro: { daily: UNLIMITED_USAGE_QUOTA, monthly: PRO_MONTHLY_AI_QUOTA },
  premium: { daily: UNLIMITED_USAGE_QUOTA, monthly: UNLIMITED_USAGE_QUOTA },
};

function normalizeUsageTier(tier: string | undefined): UsageTier {
  const normalizedTier = tier?.trim().toLowerCase();
  if (
    normalizedTier === 'pro' ||
    normalizedTier === 'premium'
  ) {
    return normalizedTier;
  }

  return 'free';
}

function getAiUsageLimits(tier: string | undefined): {
  daily: number;
  monthly: number;
} {
  return AI_USAGE_LIMITS[normalizeUsageTier(tier)];
}

function shouldRunEdgeUsageCheck(
  body: AnalyzeTradesRecoveryRequest,
): boolean {
  return (
    body.mode === 'analyze-trades' &&
    body.usageCheckMode === 'edge' &&
    body.skipUsageCheck !== true
  );
}

function normalizeUsageLimitMessage(error: unknown): UsageLimitCode | null {
  if (typeof error !== 'string') {
    return null;
  }

  const normalizedError = error.trim().toLowerCase();
  if (normalizedError === 'daily limit reached') {
    return 'DAILY_LIMIT_REACHED';
  }

  if (normalizedError === 'monthly limit reached') {
    return 'MONTHLY_LIMIT_REACHED';
  }

  return null;
}

function isUsageRpcPayload(value: unknown): value is UsageRpcPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return typeof (value as { success?: unknown }).success === 'boolean';
}

function readUsageLimit(payload: Record<string, unknown>): UsageLimitCode | undefined {
  const usageLimit = payload.usageLimit;
  if (
    usageLimit === 'DAILY_LIMIT_REACHED' ||
    usageLimit === 'MONTHLY_LIMIT_REACHED'
  ) {
    return usageLimit;
  }

  return undefined;
}

function decodeRecognizedTradesPayloadShape(
  payload: Record<string, unknown>,
): RecognizedTradesPayloadShape | null {
  if (!Array.isArray(payload.trades)) {
    return null;
  }

  return {
    trades: payload.trades,
    usageLimit: readUsageLimit(payload),
  };
}

function buildAnalyzeTradesRequestBody(
  imageBase64: string,
  mimeType: string,
  tier: 'free' | 'paid',
  options: AnalyzeTradeScreenshotRecoveryOptions | undefined,
): Record<string, unknown> {
  return {
    mode: 'analyze-trades',
    imageBase64,
    mimeType,
    tier,
    usageCheckMode: 'edge',
    usageTier: options?.usageTier,
    skipUsageCheck: options?.skipUsageCheck === true,
  };
}

/*
 * Edge Function usage gate:
 *
 * const shouldCheckUsage = shouldRunEdgeUsageCheck(body);
 * if (shouldCheckUsage) {
 *   const limits = getAiUsageLimits(body.usageTier);
 *   const { data, error } = await userClient.rpc("check_and_increment_usage", {
 *     p_usage_type: "ai",
 *     p_max_daily: limits.daily,
 *     p_max_monthly: limits.monthly,
 *   });
 *
 *   if (error || !isUsageRpcPayload(data)) {
 *     return new Response(JSON.stringify({ error: "USAGE_CHECK_FAILED" }), {
 *       status: 500,
 *       headers: jsonHeaders,
 *     });
 *   }
 *
 *   if (!data.success) {
 *     const usageLimit = normalizeUsageLimitMessage(data.error);
 *     if (usageLimit != null) {
 *       return new Response(JSON.stringify({ trades: [], usageLimit }), {
 *         status: 200,
 *         headers: jsonHeaders,
 *       });
 *     }
 *
 *     return new Response(JSON.stringify({ error: "USAGE_CHECK_FAILED" }), {
 *       status: 500,
 *       headers: jsonHeaders,
 *     });
 *   }
 * }
 */

/*
 * AIImageInputModal integration:
 *
 * const result = await analyzeTradeScreenshot(base64, imageMime, {
 *   isPaidUser: shouldApplyPremiumAI,
 *   usageTier: currentTier,
 *   skipUsageCheck: bypassUsageCheck,
 * });
 *
 * if (
 *   result?.usageLimit === 'DAILY_LIMIT_REACHED' ||
 *   result?.usageLimit === 'MONTHLY_LIMIT_REACHED'
 * ) {
 *   setLimitType(result.usageLimit === 'DAILY_LIMIT_REACHED' ? 'daily' : 'monthly');
 *   setStep('limit_reached');
 *   return;
 * }
 */
