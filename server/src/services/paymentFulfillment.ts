import type { SupabaseClient } from "@supabase/supabase-js";

export const PLAN_DAYS_PER_UNIT = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PaidPlanId = "pro" | "premium";
export type SubscriptionTier = "free" | "pro" | "premium" | "enterprise";
export type SubscriptionStatus =
  | "active"
  | "cancelled"
  | "expired"
  | "trial"
  | "refunded"
  | null;

export interface PlanAmounts {
  pro: number;
  premium: number;
}

export interface SubscriptionProfileSnapshot {
  id?: string;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  pending_plan?: string | null;
  pending_plan_effective_at?: string | null;
  max_portfolios?: number | null;
  max_alarms?: number | null;
}

export interface EffectiveSubscriptionState {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  expiresAt: string | null;
  pendingPlan: PaidPlanId | null;
  pendingPlanEffectiveAt: string | null;
  isActive: boolean;
  isExpired: boolean;
  maxPortfolios: number;
  maxAlarms: number;
}

export interface SubscriptionUpdateResult {
  nextTier: SubscriptionTier;
  nextStatus: Exclude<SubscriptionStatus, "cancelled" | "refunded">;
  nextExpiresAt: string;
  pendingPlan: PaidPlanId | null;
  pendingPlanEffectiveAt: string | null;
  maxPortfolios: number;
  maxAlarms: number;
  bonusDays: number;
  appliedCase: 1 | 2 | 3 | 4;
}

export interface FulfillPaidOrderParams {
  adminClient: SupabaseClient;
  paymentId: string;
  userId: string;
  planId: PaidPlanId;
  quantity: number;
  amount: number;
  currency: string;
  payMethod: string;
  pgProvider: string;
  pgTxId?: string | null;
  paidAt?: string | null;
  orderName: string;
  planAmounts: PlanAmounts;
  metadata?: Record<string, unknown>;
  nowIso?: string;
}

export interface FulfillPaidOrderResult {
  success: boolean;
  alreadyProcessed?: boolean;
  inProgress?: boolean;
  message?: string;
  subscription?: EffectiveSubscriptionState;
  fulfillment?: SubscriptionUpdateResult;
}

interface ClaimOrderResult {
  success: boolean;
  claimed?: boolean;
  already_processed?: boolean;
  in_progress?: boolean;
  order_id?: string;
  status?: string;
  error?: string;
}

interface OrderProfileRow extends SubscriptionProfileSnapshot {
  id: string;
}

function normalizeTier(value?: string | null): SubscriptionTier {
  if (value === "premium" || value === "pro" || value === "enterprise") {
    return value;
  }
  return "free";
}

function normalizePendingPlan(value?: string | null): PaidPlanId | null {
  return value === "premium" || value === "pro" ? value : null;
}

function parseIsoMs(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoUtc(ms: number): string {
  return new Date(ms).toISOString();
}

function addDaysUtc(ms: number, days: number): number {
  return ms + days * MS_PER_DAY;
}

export function getTierLimits(tier: SubscriptionTier): {
  maxPortfolios: number;
  maxAlarms: number;
} {
  if (tier === "premium") return { maxPortfolios: 20, maxAlarms: 40 };
  if (tier === "pro") return { maxPortfolios: 5, maxAlarms: 10 };
  return { maxPortfolios: 2, maxAlarms: 2 };
}

export function getServiceExpiresAt(days: number, nowIso?: string): string {
  const baseMs = nowIso ? parseIsoMs(nowIso) ?? Date.now() : Date.now();
  return toIsoUtc(addDaysUtc(baseMs, days));
}

function buildEffectiveState(
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  expiresAt: string | null,
  pendingPlan: PaidPlanId | null,
  pendingPlanEffectiveAt: string | null,
  nowMs: number,
): EffectiveSubscriptionState {
  const limits = getTierLimits(tier);
  const expiresMs = parseIsoMs(expiresAt);
  const isExpired = expiresMs != null && expiresMs <= nowMs;
  const isActiveStatus = status === "active" || status === "trial" || status == null;
  return {
    tier: isExpired ? "free" : tier,
    status: isExpired ? "expired" : status,
    expiresAt,
    pendingPlan,
    pendingPlanEffectiveAt,
    isActive: !isExpired && isActiveStatus && tier !== "free",
    isExpired,
    maxPortfolios: isExpired ? 2 : limits.maxPortfolios,
    maxAlarms: isExpired ? 2 : limits.maxAlarms,
  };
}

export function getEffectiveSubscriptionState(
  profile: SubscriptionProfileSnapshot | null | undefined,
  nowIso?: string,
): EffectiveSubscriptionState {
  const nowMs = nowIso ? parseIsoMs(nowIso) ?? Date.now() : Date.now();
  const tier = normalizeTier(profile?.subscription_tier);
  const status = (profile?.subscription_status as SubscriptionStatus | undefined) ?? null;
  const expiresAt = profile?.subscription_expires_at ?? null;
  const expiresMs = parseIsoMs(expiresAt);
  const pendingPlan = normalizePendingPlan(profile?.pending_plan);
  const pendingEffectiveAt = profile?.pending_plan_effective_at ?? null;
  const pendingEffectiveMs = parseIsoMs(pendingEffectiveAt);

  if (expiresMs != null && expiresMs <= nowMs) {
    return buildEffectiveState("free", "expired", expiresAt, null, null, nowMs);
  }

  if (
    pendingPlan &&
    pendingEffectiveMs != null &&
    pendingEffectiveMs <= nowMs &&
    expiresMs != null &&
    expiresMs > nowMs
  ) {
    return buildEffectiveState(
      pendingPlan,
      "active",
      expiresAt,
      pendingPlan,
      pendingEffectiveAt,
      nowMs,
    );
  }

  return buildEffectiveState(tier, status, expiresAt, pendingPlan, pendingEffectiveAt, nowMs);
}

export function getNormalizedProfileUpdate(
  profile: SubscriptionProfileSnapshot | null | undefined,
  nowIso?: string,
): Partial<OrderProfileRow> | null {
  if (!profile) return null;

  const nowMs = nowIso ? parseIsoMs(nowIso) ?? Date.now() : Date.now();
  const effective = getEffectiveSubscriptionState(profile, nowIso);
  const rawTier = normalizeTier(profile.subscription_tier);
  const rawStatus = (profile.subscription_status as SubscriptionStatus | undefined) ?? null;
  const rawPendingPlan = normalizePendingPlan(profile.pending_plan);
  const rawPendingEffectiveAt = profile.pending_plan_effective_at ?? null;
  const expiresMs = parseIsoMs(profile.subscription_expires_at);

  if (expiresMs != null && expiresMs <= nowMs) {
    if (
      rawTier === "free" &&
      rawStatus === "expired" &&
      rawPendingPlan == null &&
      rawPendingEffectiveAt == null
    ) {
      return null;
    }
    return {
      subscription_tier: "free",
      subscription_status: "expired",
      pending_plan: null,
      pending_plan_effective_at: null,
      max_portfolios: 2,
      max_alarms: 2,
    };
  }

  if (
    rawPendingPlan &&
    rawPendingEffectiveAt &&
    parseIsoMs(rawPendingEffectiveAt) != null &&
    parseIsoMs(rawPendingEffectiveAt)! <= nowMs
  ) {
    return {
      subscription_tier: effective.tier,
      subscription_status: "active",
      pending_plan: null,
      pending_plan_effective_at: null,
      max_portfolios: effective.maxPortfolios,
      max_alarms: effective.maxAlarms,
    };
  }

  return null;
}

export function computeSubscriptionUpdate(input: {
  currentProfile: SubscriptionProfileSnapshot | null | undefined;
  purchasedPlan: PaidPlanId;
  quantity: number;
  planAmounts: PlanAmounts;
  nowIso?: string;
}): SubscriptionUpdateResult {
  const nowMs = input.nowIso ? parseIsoMs(input.nowIso) ?? Date.now() : Date.now();
  const baseProfile = input.currentProfile ?? null;
  const normalizedPatch = getNormalizedProfileUpdate(baseProfile, toIsoUtc(nowMs));
  const normalizedProfile = normalizedPatch
    ? { ...baseProfile, ...normalizedPatch }
    : baseProfile;
  const current = getEffectiveSubscriptionState(normalizedProfile, toIsoUtc(nowMs));
  const purchasedDays = PLAN_DAYS_PER_UNIT * Math.max(1, input.quantity);
  const purchasedPlan = input.purchasedPlan;

  if (!current.isActive || current.tier === "free") {
    const nextTier = purchasedPlan;
    const nextExpiresAt = toIsoUtc(addDaysUtc(nowMs, purchasedDays));
    const limits = getTierLimits(nextTier);
    return {
      nextTier,
      nextStatus: "active",
      nextExpiresAt,
      pendingPlan: null,
      pendingPlanEffectiveAt: null,
      maxPortfolios: limits.maxPortfolios,
      maxAlarms: limits.maxAlarms,
      bonusDays: 0,
      appliedCase: 1,
    };
  }

  const currentExpiresMs = parseIsoMs(current.expiresAt) ?? nowMs;
  const rollingBaseMs = Math.max(currentExpiresMs, nowMs);

  if (current.tier === purchasedPlan) {
    const nextTier = current.tier;
    const nextExpiresAt = toIsoUtc(addDaysUtc(rollingBaseMs, purchasedDays));
    const limits = getTierLimits(nextTier);
    return {
      nextTier,
      nextStatus: "active",
      nextExpiresAt,
      pendingPlan: null,
      pendingPlanEffectiveAt: null,
      maxPortfolios: limits.maxPortfolios,
      maxAlarms: limits.maxAlarms,
      bonusDays: 0,
      appliedCase: 2,
    };
  }

  if (current.tier === "pro" && purchasedPlan === "premium") {
    const remainingMs = Math.max(currentExpiresMs - nowMs, 0);
    const remainingDays = Math.ceil(remainingMs / MS_PER_DAY);
    const remainingValue = remainingDays * (input.planAmounts.pro / PLAN_DAYS_PER_UNIT);
    const bonusDays = Math.ceil(
      remainingValue / (input.planAmounts.premium / PLAN_DAYS_PER_UNIT),
    );
    const totalDays = purchasedDays + bonusDays;
    const nextExpiresAt = toIsoUtc(addDaysUtc(nowMs, totalDays));
    const limits = getTierLimits("premium");
    return {
      nextTier: "premium",
      nextStatus: "active",
      nextExpiresAt,
      pendingPlan: null,
      pendingPlanEffectiveAt: null,
      maxPortfolios: limits.maxPortfolios,
      maxAlarms: limits.maxAlarms,
      bonusDays,
      appliedCase: 3,
    };
  }

  if (current.tier === "premium" && purchasedPlan === "pro") {
    const pendingPlanEffectiveAt = toIsoUtc(currentExpiresMs);
    const nextExpiresAt = toIsoUtc(addDaysUtc(rollingBaseMs, purchasedDays));
    const limits = getTierLimits("premium");
    return {
      nextTier: "premium",
      nextStatus: "active",
      nextExpiresAt,
      pendingPlan: "pro",
      pendingPlanEffectiveAt,
      maxPortfolios: limits.maxPortfolios,
      maxAlarms: limits.maxAlarms,
      bonusDays: 0,
      appliedCase: 4,
    };
  }

  const fallbackTier = purchasedPlan;
  const fallbackExpiresAt = toIsoUtc(addDaysUtc(nowMs, purchasedDays));
  const fallbackLimits = getTierLimits(fallbackTier);
  return {
    nextTier: fallbackTier,
    nextStatus: "active",
    nextExpiresAt: fallbackExpiresAt,
    pendingPlan: null,
    pendingPlanEffectiveAt: null,
    maxPortfolios: fallbackLimits.maxPortfolios,
    maxAlarms: fallbackLimits.maxAlarms,
    bonusDays: 0,
    appliedCase: 1,
  };
}

async function claimOrderForProcessing(
  adminClient: SupabaseClient,
  params: FulfillPaidOrderParams,
): Promise<ClaimOrderResult> {
  const { data, error } = await adminClient.rpc("claim_order_processing", {
    p_payment_id: params.paymentId,
    p_user_id: params.userId,
    p_plan_id: params.planId,
    p_order_name: params.orderName,
    p_amount: params.amount,
    p_currency: params.currency,
    p_pay_method: params.payMethod,
    p_pg_provider: params.pgProvider,
    p_pg_tx_id: params.pgTxId ?? null,
    p_paid_at: params.paidAt ?? null,
    p_metadata: {
      quantity: params.quantity,
      ...(params.metadata ?? {}),
    },
  });

  if (error) {
    throw new Error(`[claim_order_processing] ${error.message}`);
  }

  return (data ?? {}) as ClaimOrderResult;
}

async function markOrderStatus(
  adminClient: SupabaseClient,
  paymentId: string,
  status: "pending" | "paid",
  metadata: Record<string, unknown>,
  paidAt?: string | null,
  pgTxId?: string | null,
): Promise<void> {
  const updatePayload: Record<string, unknown> = {
    status,
    metadata,
  };
  if (paidAt) updatePayload.paid_at = paidAt;
  if (pgTxId !== undefined) updatePayload.pg_tx_id = pgTxId;

  const { error } = await adminClient
    .from("orders")
    .update(updatePayload)
    .eq("payment_id", paymentId);

  if (error) {
    throw new Error(`[orders:${status}] ${error.message}`);
  }
}

export async function fulfillPaidOrder(
  params: FulfillPaidOrderParams,
): Promise<FulfillPaidOrderResult> {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const claim = await claimOrderForProcessing(params.adminClient, params);

  if (!claim.success) {
    throw new Error(claim.error || "주문 처리권 확보에 실패했습니다.");
  }

  if (claim.already_processed) {
    return {
      success: true,
      alreadyProcessed: true,
      message: "이미 처리된 결제입니다.",
    };
  }

  if (claim.in_progress && !claim.claimed) {
    return {
      success: false,
      inProgress: true,
      message: "동일 결제 건을 다른 요청이 처리 중입니다.",
    };
  }

  const { data: profile, error: profileError } = await params.adminClient
    .from("user_profiles")
    .select("id, subscription_tier, subscription_status, subscription_expires_at, pending_plan, pending_plan_effective_at, max_portfolios, max_alarms")
    .eq("id", params.userId)
    .single();

  if (profileError || !profile) {
    await markOrderStatus(
      params.adminClient,
      params.paymentId,
      "pending",
      {
        quantity: params.quantity,
        ...(params.metadata ?? {}),
        fulfillment_error: profileError?.message ?? "user profile not found",
      },
      params.paidAt,
      params.pgTxId,
    );
    throw new Error(profileError?.message ?? "user profile not found");
  }

  const normalizedPatch = getNormalizedProfileUpdate(profile as OrderProfileRow, nowIso);
  const normalizedProfile = normalizedPatch
    ? { ...(profile as OrderProfileRow), ...normalizedPatch }
    : (profile as OrderProfileRow);

  const fulfillment = computeSubscriptionUpdate({
    currentProfile: normalizedProfile,
    purchasedPlan: params.planId,
    quantity: params.quantity,
    planAmounts: params.planAmounts,
    nowIso,
  });

  const profileUpdate: Record<string, unknown> = {
    subscription_tier: fulfillment.nextTier,
    subscription_status: fulfillment.nextStatus,
    subscription_expires_at: fulfillment.nextExpiresAt,
    pending_plan: fulfillment.pendingPlan,
    pending_plan_effective_at: fulfillment.pendingPlanEffectiveAt,
    max_portfolios: fulfillment.maxPortfolios,
    max_alarms: fulfillment.maxAlarms,
    updated_at: nowIso,
  };

  const previousEffective = getEffectiveSubscriptionState(normalizedProfile, nowIso);
  const { error: updateError } = await params.adminClient
    .from("user_profiles")
    .update(profileUpdate)
    .eq("id", params.userId);

  if (updateError) {
    await markOrderStatus(
      params.adminClient,
      params.paymentId,
      "pending",
      {
        quantity: params.quantity,
        ...(params.metadata ?? {}),
        fulfillment_error: updateError.message,
      },
      params.paidAt,
      params.pgTxId,
    );
    throw new Error(updateError.message);
  }

  const finalMetadata = {
    quantity: params.quantity,
    ...(params.metadata ?? {}),
    fulfillment: {
      previousTier: previousEffective.tier,
      previousExpiresAt: previousEffective.expiresAt,
      appliedCase: fulfillment.appliedCase,
      bonusDays: fulfillment.bonusDays,
      pendingPlan: fulfillment.pendingPlan,
      pendingPlanEffectiveAt: fulfillment.pendingPlanEffectiveAt,
      fulfilledAt: nowIso,
      fulfillmentVersion: 1,
    },
  };

  await markOrderStatus(
    params.adminClient,
    params.paymentId,
    "paid",
    finalMetadata,
    params.paidAt ?? nowIso,
    params.pgTxId,
  );

  const finalState = getEffectiveSubscriptionState(
    {
      ...normalizedProfile,
      subscription_tier: fulfillment.nextTier,
      subscription_status: fulfillment.nextStatus,
      subscription_expires_at: fulfillment.nextExpiresAt,
      pending_plan: fulfillment.pendingPlan,
      pending_plan_effective_at: fulfillment.pendingPlanEffectiveAt,
    },
    nowIso,
  );

  return {
    success: true,
    message: "결제 Fulfillment가 완료되었습니다.",
    subscription: finalState,
    fulfillment,
  };
}
