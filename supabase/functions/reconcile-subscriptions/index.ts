import { serve } from "std/http/server";
import { createClient } from "@supabase/supabase-js";
import { getNormalizedProfileUpdate } from "../../../server/src/services/paymentFulfillment.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("SUBSCRIPTION_RECONCILE_SECRET") ?? "";

const jsonHeaders = {
  "Content-Type": "application/json",
};

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  if (INTERNAL_SECRET) {
    const supplied = req.headers.get("X-Internal-Reconcile-Secret") ?? "";
    if (supplied !== INTERNAL_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const nowIso = new Date().toISOString();

  const { data: profiles, error } = await adminClient
    .from("user_profiles")
    .select("id, subscription_tier, subscription_status, subscription_expires_at, pending_plan, pending_plan_effective_at, max_portfolios, max_alarms")
    .or(`subscription_expires_at.lte.${nowIso},pending_plan_effective_at.lte.${nowIso}`)
    .limit(500);

  if (error) {
    console.error("[reconcile-subscriptions] select failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  let updated = 0;
  for (const profile of profiles ?? []) {
    const patch = getNormalizedProfileUpdate(profile, nowIso);
    if (!patch) continue;

    const { error: updateError } = await adminClient
      .from("user_profiles")
      .update({
        ...patch,
        updated_at: nowIso,
      })
      .eq("id", profile.id);

    if (updateError) {
      console.error("[reconcile-subscriptions] update failed:", profile.id, updateError.message);
      continue;
    }
    updated += 1;
  }

  return new Response(JSON.stringify({
    success: true,
    checked: profiles?.length ?? 0,
    updated,
    nowIso,
  }), {
    status: 200,
    headers: jsonHeaders,
  });
});
