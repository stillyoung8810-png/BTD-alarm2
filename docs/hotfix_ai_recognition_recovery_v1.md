# Hotfix AI Recognition Recovery V1

## Goal

Restore AI trade recognition in the Toss mini-app WebView.

The previous `hotfix_usage_check_v1.md` only improves the user-facing error message. It does not make AI recognition succeed. This plan addresses the actual blocker by removing the direct WebView -> Supabase RPC dependency from the AI recognition path.

## Current Failure Path

Current `AIImageInputModal` flow:

1. `ensureValidSession()`
2. `incrementUsage('ai', currentTier)`
3. `analyzeTradeScreenshot(...)`
4. result filtering and save UI

The failure happens before step 3 in Toss WebView:

```text
AIImageInputModal -> incrementUsage() -> supabase.rpc("check_and_increment_usage") -> TypeError: Load failed
```

Local browser works, but Toss WebView can fail on the direct RPC fetch. Therefore the Gemini Edge Function may never be called.

## Recovery Strategy

Move the AI usage check into the existing `gemini` Edge Function for new `mode: "analyze-trades"` requests that explicitly opt in with `usageCheckMode: "edge"`.

New flow:

```text
AIImageInputModal
  -> analyzeTradeScreenshot(...)
    -> gemini Edge Function
      -> validate Supabase user token
      -> check_and_increment_usage via server-side Supabase client
      -> Gemini analysis
      -> return recognized trades
```

This keeps quota enforcement but removes the failing direct RPC request from the Toss WebView.

The opt-in flag is required for rollout safety:

- Old frontend + new Edge Function: old frontend still calls `incrementUsage()` directly and does not send `usageCheckMode: "edge"`, so the Edge Function must not increment usage again.
- New frontend + new Edge Function: new frontend removes the direct RPC call and sends `usageCheckMode: "edge"`, so the Edge Function performs exactly one usage increment.
- New frontend + old Edge Function is not safe because usage would not be checked. Therefore the Edge Function must be deployed first.

## Stability Guardrails

- Do not modify financial math, portfolio mutation, trade save logic, fee calculation, or strategy filtering.
- Do not modify the `check_and_increment_usage` database function.
- Do not modify `incrementUsage()` because backtest and other existing callers may still rely on it.
- Only remove the AI modal's direct call to `incrementUsage('ai', currentTier)`.
- Preserve the current ordering: usage is consumed before Gemini analysis, as it is today.
- Preserve ad unlock behavior: `onStartScan(true)` still sends `skipUsageCheck: true` and bypasses the usage check for that scan.
- Keep `advisor` mode behavior unchanged.
- Keep Gemini prompt and result parsing behavior unchanged except for adding a usage-limit envelope.
- Keep daily/monthly limit UI behavior (`limit_reached`) unchanged.
- Prevent double usage increments during rollout by requiring `usageCheckMode === "edge"` before the Edge Function runs the usage RPC.

## File-Level Plan

### 1. `supabase/functions/gemini/index.ts`

Add Supabase client support using the existing Edge Function import map:

```ts
import { createClient } from "@supabase/supabase-js";
```

Use the same authentication pattern already used by `verify-payment` and `cancel-subscription`:

1. Extract `Authorization: Bearer <token>`.
2. Create `userClient` with `SUPABASE_ANON_KEY` and the user's bearer token.
3. Call `userClient.auth.getUser()` to validate the token.
4. For `mode: "analyze-trades"` only, call `userClient.rpc("check_and_increment_usage", ...)` before Gemini analysis when `usageCheckMode === "edge"` and `skipUsageCheck !== true`.

Why `userClient.rpc`, not service role RPC:

- The database function uses `auth.uid()`.
- Calling it with the user's JWT preserves the existing user-scoped behavior.
- The RPC executes server-side from the Edge Function, so Toss WebView no longer performs the failing direct fetch.

Add server-side quota constants equivalent to the current AI usage policy:

```ts
const UNLIMITED_USAGE_QUOTA = 999;
const PRO_MONTHLY_AI_QUOTA = 50;
const FREE_DAILY_AI_QUOTA = 1;

const AI_USAGE_LIMITS = {
  free: { daily: FREE_DAILY_AI_QUOTA, monthly: UNLIMITED_USAGE_QUOTA },
  pro: { daily: UNLIMITED_USAGE_QUOTA, monthly: PRO_MONTHLY_AI_QUOTA },
  premium: { daily: UNLIMITED_USAGE_QUOTA, monthly: UNLIMITED_USAGE_QUOTA },
} as const;
```

Important:

- This is a short-term duplication of the AI quota policy to unblock release.
- Match the current client policy: only `free`, `pro`, and `premium` are explicit; unknown tiers, including `enterprise`, must fall back to `free`.
- Do not import frontend `utils/subscriptionUtils.ts` into the Edge Function.
- After release, centralize shared quota rules in an Edge-safe shared module.

Add request fields for `analyze-trades`:

```ts
usageCheckMode?: "edge";
usageTier?: string;
skipUsageCheck?: boolean;
```

Usage check gate:

```ts
const shouldRunEdgeUsageCheck =
  body.mode === "analyze-trades" &&
  body.usageCheckMode === "edge" &&
  body.skipUsageCheck !== true;
```

This gate is the release safety mechanism. Without it, deploying the Edge Function before the frontend can double-charge legacy frontend requests.

Response shape on usage limit:

```json
{ "trades": [], "usageLimit": "DAILY_LIMIT_REACHED" }
```

or

```json
{ "trades": [], "usageLimit": "MONTHLY_LIMIT_REACHED" }
```

Return `200` for usage limit responses so the client can route to the existing `limit_reached` UI instead of treating it as a generic network/AI service failure.

If the usage RPC returns `success: false` for any reason other than the normalized daily/monthly limit, stop and return a stable error response. Never continue to Gemini after a failed usage check.

### 2. `services/geminiService.ts`

Extend the analyzed trades payload:

```ts
interface RecognizedTradesPayload {
  trades: RecognizedTradeItem[];
  usageLimit?: "DAILY_LIMIT_REACHED" | "MONTHLY_LIMIT_REACHED";
}
```

Update `decodeRecognizedTradesPayload()` so it preserves `usageLimit`. Adding the type field alone is not enough; the decoder must explicitly read and narrow the value.

Extend `analyzeTradeScreenshot` options:

```ts
options?: {
  isPaidUser?: boolean;
  usageTier?: string;
  skipUsageCheck?: boolean;
}
```

Send these fields to the Edge Function:

```ts
usageCheckMode: 'edge',
usageTier: options?.usageTier,
skipUsageCheck: options?.skipUsageCheck === true,
```

Keep existing `tier: getTier(Boolean(options?.isPaidUser))` for Gemini API key selection.

### 3. `components/AIImageInputModal.tsx`

Remove only this direct usage-check block from the AI scan path:

```ts
if (!bypassUsageCheck) {
  const usageResult = await incrementUsage('ai', currentTier);
  // ...
}
```

Then call `analyzeTradeScreenshot` once:

```ts
const result = await analyzeTradeScreenshot(base64, imageMime, {
  isPaidUser: shouldApplyPremiumAI,
  usageTier: currentTier,
  skipUsageCheck: bypassUsageCheck,
});
```

Before handling `result.trades`, add:

```ts
if (result?.usageLimit === 'DAILY_LIMIT_REACHED' || result?.usageLimit === 'MONTHLY_LIMIT_REACHED') {
  setLimitType(result.usageLimit === 'DAILY_LIMIT_REACHED' ? 'daily' : 'monthly');
  setStep('limit_reached');
  return;
}
```

Remove the unused `incrementUsage` import from this component only.

Do not change:

- image loading
- portfolio strategy stock filtering
- recognized trade selection
- sell quantity validation
- save logic
- ad reward flow except passing `skipUsageCheck`

## Limit Handling Contract

The Edge Function should normalize RPC errors exactly like the current client does:

- `"Daily limit reached"` -> `"DAILY_LIMIT_REACHED"`
- `"Monthly limit reached"` -> `"MONTHLY_LIMIT_REACHED"`

If the RPC fails for a reason other than usage limit:

- Return a JSON error response with a stable error code.
- The client can continue using the existing generic AI error path.
- Do not call Gemini after a failed usage check.

The Edge Function must validate the RPC payload shape before trusting it:

```ts
interface UsageRpcPayload {
  success: boolean;
  error?: string;
  current_daily?: number;
  current_monthly?: number | null;
}
```

Rules:

- `error != null` from `userClient.rpc(...)` -> return `USAGE_CHECK_FAILED`, do not call Gemini.
- malformed payload -> return `USAGE_CHECK_FAILED`, do not call Gemini.
- `success === false` with daily/monthly limit -> return `{ trades: [], usageLimit }`, do not call Gemini.
- `success === false` with any other reason -> return `USAGE_CHECK_FAILED`, do not call Gemini.
- `success === true` -> proceed to Gemini.

## Secret Checklist

The attached Supabase dashboard screenshot shows the required secrets exist. Before deployment, verify the `gemini` Edge Function can read:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY_FREE`
- `GEMINI_API_KEY_PAID`

`SUPABASE_SERVICE_ROLE_KEY` exists but is not required for this hotfix path because the usage RPC must run with the user's JWT so `auth.uid()` remains user-scoped.

## Rollout Steps

1. Implement and typecheck locally.
2. Deploy the updated `gemini` Edge Function first. This is safe for the old frontend because old requests do not include `usageCheckMode: "edge"`:

```powershell
npx supabase functions deploy gemini --no-verify-jwt
```

3. Verify the deployed Edge Function accepts both:
   - legacy requests without `usageCheckMode` without running the Edge usage RPC
   - new requests with `usageCheckMode: "edge"` with exactly one usage increment
4. Build the frontend:

```powershell
npm run build
```

5. Deploy the frontend/Toss mini-app bundle.
6. Test AI recognition in Toss WebView.

## Verification Plan

Static checks:

- `AIImageInputModal` no longer imports or calls `incrementUsage`.
- Backtest still imports and uses `incrementUsage` unchanged.
- `analyzeTradeScreenshot` still sends Authorization from `getAuthHeaders()`.
- `analyzeTradeScreenshot` sends `usageCheckMode: "edge"` for `analyze-trades`.
- `decodeRecognizedTradesPayload()` preserves valid `usageLimit` values.
- Unknown usage tiers fall back to `free`, matching current `getUsageLimits()`.
- The Edge Function checks RPC transport errors, malformed payloads, and `success === false` before Gemini is called.
- `gemini` Edge Function validates the user token with `auth.getUser()`.
- `gemini` calls `check_and_increment_usage` only when `mode: "analyze-trades"`, `usageCheckMode === "edge"`, and `skipUsageCheck !== true`.
- Legacy requests without `usageCheckMode` do not trigger Edge usage increment.
- `advisor` mode does not consume AI usage.

Manual scenarios:

1. Free user with unused daily quota:
   - AI scan reaches Gemini.
   - Recognized trades appear or normal "not recognized" UI appears.
   - `ai_daily_usage` increments.

2. Free user after daily limit:
   - Edge Function returns `usageLimit: "DAILY_LIMIT_REACHED"`.
   - Modal shows existing ad unlock UI.
   - Gemini is not called.

3. Pro user under monthly quota:
   - AI scan reaches Gemini.
   - `ai_monthly_usage` increments.

4. Pro user at monthly quota:
   - Modal shows existing monthly limit UI.
   - Gemini is not called.

5. Reward ad unlock:
   - `onStartScan(true)` passes `skipUsageCheck: true`.
   - AI scan reaches Gemini without calling usage RPC.
   - Existing `rewardWatched` save path remains unchanged.

6. Toss WebView:
   - No direct request to `/rest/v1/rpc/check_and_increment_usage` from the WebView during AI scan.
   - One request to `/functions/v1/gemini` is made.

7. Rollout safety:
   - Old frontend against new Edge Function increments usage once in the old frontend path only.
   - New frontend against new Edge Function increments usage once in the Edge Function path only.

## Risk Assessment

Low-to-medium risk, because the fix touches the AI scan request path and the `gemini` Edge Function.

Risk reducers:

- The direct RPC call is removed only from `AIImageInputModal`.
- The `usageCheckMode: "edge"` opt-in prevents double increments when the Edge Function is deployed before the frontend.
- The same DB function remains the quota source.
- The same user JWT drives `auth.uid()`.
- Gemini prompt and recognized trade parsing remain unchanged.
- Usage is still consumed before Gemini analysis, matching existing behavior.

Known limitation:

- `usageTier` still comes from the client, matching the current client-side quota behavior. For a stronger post-release design, the Edge Function should derive tier from `user_profiles` server-side and share the same subscription normalization used by the app.

## Post-Release Follow-Up

Create a dedicated `ai-recognition` Edge Function or service module that owns:

- auth validation
- tier derivation from `user_profiles`
- usage check/increment
- Gemini analysis
- stable machine-readable error codes

This removes duplicated quota constants and makes AI recognition a single server-side transaction boundary.
