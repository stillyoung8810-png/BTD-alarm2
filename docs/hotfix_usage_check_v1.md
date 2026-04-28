# Hotfix Usage Check V1

## Scope

This document is a pre-implementation review for the Toss mini-app AI trade recognition failure observed right before release. It does not authorize changes to portfolio mutation, financial math, trade conversion, strategy filtering, or Gemini result parsing.

Only the user-facing handling of the usage-check failure path is in scope for the immediate hotfix.

## Symptom

In the Toss mini-app WebView, AI trade recognition can fail with:

```text
TypeError: Load failed
```

The same flow works in a local browser. The error appears inside the AI trade recognition modal before the Gemini result screen is reached.

## Local Fact Check

The current `AIImageInputModal` flow runs in this order:

1. Validate the Supabase session with `ensureValidSession()`.
2. Call `incrementUsage('ai', currentTier)` unless the ad unlock path bypasses usage checking.
3. Call `analyzeTradeScreenshot(base64, imageMime, { isPaidUser })`.
4. Filter recognized trades by portfolio strategy symbols.
5. Render result or error state.

The relevant usage-check branch currently displays `usageResult.message` directly when the failure is not a daily or monthly limit:

```ts
setErrorMessage(
  lang === 'ko'
    ? usageResult.message || '사용량 확인 중 오류가 발생했습니다.'
    : usageResult.message || 'Usage limit reached or verification failed.'
);
```

`incrementUsage()` calls Supabase RPC `check_and_increment_usage` and returns `error.message` as `UsageResult.message` when the RPC client reports an error. Therefore a WebView fetch failure such as `TypeError: Load failed` can be surfaced directly to the user.

## Likely Cause

The immediate failure is most likely a Toss WebView network/fetch failure around the direct Supabase RPC call:

```text
https://<project>.supabase.co/rest/v1/rpc/check_and_increment_usage
```

This does not prove that the database function is wrong. The function contract still matches the client:

- `success: boolean`
- `error?: string`
- `current_daily?: number`
- `current_monthly?: number | null`

The observed issue is that the consumer currently trusts and displays a low-level transport message.

## Immediate Hotfix

Add a small consumer-side mapper in `AIImageInputModal` for usage-check failures only, and add the user-facing copy to the existing app i18n dictionary (`constants.tsx`). Do not hardcode the Korean or English UI strings inside the component.

Goals:

- Preserve daily/monthly limit behavior exactly.
- Preserve the existing `incrementUsage()` function and shared usage policy.
- Avoid touching Gemini analysis, trade filtering, fee calculation, save logic, or subscription quota constants.
- Convert known WebView/network transport messages into a user-friendly dictionary message.
- Convert unknown usage-check failures into a generic dictionary message instead of showing raw server or browser text.

Recommended `constants.tsx` Korean keys:

```ts
aiUsageCheckNetworkError: "네트워크 연결 또는 토스 WebView 요청이 차단되었습니다. 앱을 다시 열거나 잠시 후 다시 시도해주세요.",
aiUsageCheckError: "사용량 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
```

Recommended `constants.tsx` English keys:

```ts
aiUsageCheckNetworkError: "The usage check request was blocked by network connectivity or the Toss WebView. Reopen the app or try again shortly.",
aiUsageCheckError: "An error occurred while verifying usage. Please try again shortly.",
```

The exact snippet is prepared in `docs/snippets/usage_hotfix_snippet.ts`.

### Immediate Hotfix Guardrails

- Do not modify `incrementUsage()`.
- Do not modify Supabase RPC `check_and_increment_usage`.
- Do not modify Gemini request or response parsing.
- Do not modify recognized trade filtering, trade conversion, fee calculation, or save logic.
- Keep `DAILY_LIMIT_REACHED` and `MONTHLY_LIMIT_REACHED` behavior exactly as-is.
- Keep boolean variable names compliant with the project rule (`has...`, `is...`, `should...`, `can...`).
- Do not leave `Hotfix*` temporary names in production source code.
- Do not add snippet-only simulation helpers to production source code.
- Do not introduce duplicate local types for `UsageResult`; use the existing `incrementUsage()` result shape directly.
- In the actual component, type the copy argument as `typeof I18N.ko` after adding the two dictionary keys.
- Keep network-failure patterns minimal and non-overlapping.

## Structural Follow-Up

After release, move usage check and Gemini analysis behind a single application service boundary instead of calling Supabase RPC directly from the WebView.

Recommended shape:

- UI port: `analyzeAiTradeScreenshot(input): Promise<Result>`
- Adapter: Supabase Edge Function call from the client
- Edge Function responsibilities:
  - Authenticate the user token.
  - Check and increment usage server-side.
  - Call Gemini only after usage is accepted.
  - Return stable machine-readable error codes such as `USAGE_DAILY_LIMIT`, `USAGE_MONTHLY_LIMIT`, `NETWORK`, `AUTH_REQUIRED`, `ANALYSIS_FAILED`.

Benefits:

- The Toss WebView makes one Edge Function request instead of separate RPC and Gemini calls.
- Quota increment and analysis can be ordered atomically from the product perspective.
- UI receives stable domain errors rather than browser-specific fetch strings.
- Future retry, rollback, and observability can be centralized.

## Regression Test Plan

Static verification:

- Confirm the hotfix only changes the `!usageResult.success` branch in `AIImageInputModal`.
- Confirm the new user-facing copy is read from `constants.tsx` through the existing `t = I18N[lang]` object.
- Confirm helper functions do not introduce new local result interfaces, unused simulation functions, or dead code.
- Confirm `USAGE_NETWORK_FAILURE_PATTERNS` does not contain redundant entries such as both `typeerror: load failed` and `load failed`.
- Confirm `DAILY_LIMIT_REACHED` and `MONTHLY_LIMIT_REACHED` still set `limit_reached`.
- Confirm successful usage check still proceeds to `analyzeTradeScreenshot()`.
- Confirm `bypassUsageCheck === true` still skips `incrementUsage()`.
- Confirm the `catch` block for Gemini errors remains unchanged.
- Confirm unknown usage-check failures do not display raw `usageResult.message`.

Manual verification:

1. Normal browser, successful image analysis: result screen still appears.
2. Free tier daily limit: limit reached screen still appears.
3. Simulated `usageResult.message = 'TypeError: Load failed'`: error screen shows the friendly WebView/network message.
4. Simulated `usageResult.message = 'Profile not found'`: error screen shows the generic usage-check error, not the raw message.
5. Ad unlock path: `onStartScan(true)` still bypasses usage checking and proceeds to analysis.

Risk:

- This first hotfix improves UX and avoids leaking raw browser errors, but it does not remove the underlying direct RPC dependency from the WebView. The structural follow-up is still recommended.
