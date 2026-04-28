/**
 * Pre-implementation snippet only.
 *
 * Target files:
 * - constants.tsx: add the two i18n keys shown below.
 * - components/AIImageInputModal.tsx: add the helper and replace only the
 *   non-limit usage-check failure branch inside onStartScan().
 *
 * This snippet intentionally does not modify incrementUsage(), Gemini analysis,
 * trade conversion, or save logic.
 *
 * The declaration below exists only so this docs snippet can be type-checked.
 * Do not copy it into AIImageInputModal.tsx; that file already imports I18N.
 */

declare const I18N: {
  ko: {
    aiUsageCheckNetworkError: string;
    aiUsageCheckError: string;
  };
};

const USAGE_NETWORK_FAILURE_PATTERNS = [
  'load failed',
  'failed to fetch',
  'network request failed',
] as const;

function isUsageNetworkFailureMessage(message: string | undefined): boolean {
  const normalizedMessage = message?.trim().toLowerCase() ?? '';
  if (normalizedMessage.length === 0) {
    return false;
  }

  return USAGE_NETWORK_FAILURE_PATTERNS.some((pattern) =>
    normalizedMessage.includes(pattern),
  );
}

function getUsageCheckFailureMessage(
  copy: typeof I18N.ko,
  rawMessage: string | undefined,
): string {
  if (isUsageNetworkFailureMessage(rawMessage)) {
    return copy.aiUsageCheckNetworkError;
  }

  return copy.aiUsageCheckError;
}

/*
 * constants.tsx additions:
 *
 * ko:
 * aiUsageCheckNetworkError: "네트워크 연결 또는 토스 WebView 요청이 차단되었습니다. 앱을 다시 열거나 잠시 후 다시 시도해주세요.",
 * aiUsageCheckError: "사용량 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
 *
 * en:
 * aiUsageCheckNetworkError: "The usage check request was blocked by network connectivity or the Toss WebView. Reopen the app or try again shortly.",
 * aiUsageCheckError: "An error occurred while verifying usage. Please try again shortly.",
 */

/*
 * AIImageInputModal.onStartScan() replacement branch:
 *
 * const usageResult = await incrementUsage('ai', currentTier);
 * if (!usageResult.success) {
 *   if (
 *     usageResult.message === 'DAILY_LIMIT_REACHED' ||
 *     usageResult.message === 'MONTHLY_LIMIT_REACHED'
 *   ) {
 *     setLimitType(
 *       usageResult.message === 'DAILY_LIMIT_REACHED' ? 'daily' : 'monthly',
 *     );
 *     setStep('limit_reached');
 *     return;
 *   }
 *
 *   setErrorMessage(getUsageCheckFailureMessage(t, usageResult.message));
 *   setStep('error');
 *   return;
 * }
 */
