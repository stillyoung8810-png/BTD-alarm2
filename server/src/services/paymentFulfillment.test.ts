import { describe, expect, it } from "vitest";
import {
  computeSubscriptionUpdate,
  fulfillPaidOrder,
  getEffectiveSubscriptionState,
  PLAN_DAYS_PER_UNIT,
  type PaymentAdminClient,
} from "./paymentFulfillment";

const PLAN_AMOUNTS = {
  pro: 5907,
  premium: 9900,
} as const;

interface MockProfile {
  id: string;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  pending_plan?: string | null;
  pending_plan_effective_at?: string | null;
  max_portfolios?: number | null;
  max_alarms?: number | null;
}

function createAdminClientMock(options?: {
  claimResponses?: Array<Record<string, unknown>>;
  profile?: Partial<MockProfile>;
}) {
  const state = {
    claimResponses: [...(options?.claimResponses ?? [{ success: true, claimed: true }])],
    profile: {
      id: "user-1",
      subscription_tier: "free",
      subscription_status: "expired",
      subscription_expires_at: null,
      pending_plan: null,
      pending_plan_effective_at: null,
      max_portfolios: 2,
      max_alarms: 2,
      ...(options?.profile ?? {}),
    } satisfies MockProfile,
    orderUpdates: [] as Array<unknown>,
    profileUpdates: [] as Array<unknown>,
  };

  const client: PaymentAdminClient = {
    rpc: async () => ({
      data: state.claimResponses.shift() ?? { success: true, already_processed: true },
      error: null,
    }),
    loadUserProfile: async () => ({ data: state.profile, error: null }),
    updateUserProfile: async (_userId, payload) => {
      state.profile = { ...state.profile, ...payload };
      state.profileUpdates.push(payload);
      return { error: null };
    },
    updateOrderByPaymentId: async (_paymentId, payload) => {
      state.orderUpdates.push(payload);
      return { error: null };
    },
  };

  return {
    client,
    state,
  };
}

describe("computeSubscriptionUpdate", () => {
  it("신규 free -> pro 결제는 현재부터 30일을 부여한다", () => {
    const nowIso = "2026-03-09T00:00:00.000Z";
    const result = computeSubscriptionUpdate({
      currentProfile: {
        subscription_tier: "free",
        subscription_status: "expired",
        subscription_expires_at: null,
      },
      purchasedPlan: "pro",
      quantity: 1,
      planAmounts: PLAN_AMOUNTS,
      nowIso,
    });

    expect(result.appliedCase).toBe(1);
    expect(result.nextTier).toBe("pro");
    expect(result.nextExpiresAt).toBe("2026-04-08T00:00:00.000Z");
    expect(result.maxPortfolios).toBe(5);
    expect(result.maxAlarms).toBe(10);
  });

  it("동일 등급 연장 결제는 기존 만료일 뒤에 30일을 더한다", () => {
    const nowIso = "2026-03-09T00:00:00.000Z";
    const result = computeSubscriptionUpdate({
      currentProfile: {
        subscription_tier: "pro",
        subscription_status: "active",
        subscription_expires_at: "2026-03-20T00:00:00.000Z",
      },
      purchasedPlan: "pro",
      quantity: 1,
      planAmounts: PLAN_AMOUNTS,
      nowIso,
    });

    expect(result.appliedCase).toBe(2);
    expect(result.nextExpiresAt).toBe("2026-04-19T00:00:00.000Z");
  });

  it("만료된 premium 재구매는 신규 결제처럼 현재부터 30일을 부여한다", () => {
    const nowIso = "2026-03-09T00:00:00.000Z";
    const result = computeSubscriptionUpdate({
      currentProfile: {
        subscription_tier: "premium",
        subscription_status: "active",
        subscription_expires_at: "2026-03-01T00:00:00.000Z",
      },
      purchasedPlan: "premium",
      quantity: 1,
      planAmounts: PLAN_AMOUNTS,
      nowIso,
    });

    expect(result.appliedCase).toBe(1);
    expect(result.nextTier).toBe("premium");
    expect(result.nextExpiresAt).toBe("2026-04-08T00:00:00.000Z");
  });

  it("PRO -> PREMIUM 업그레이드는 남은 PRO 가치를 PREMIUM 일수로 올림 환산한다", () => {
    const nowIso = "2026-03-09T00:00:00.000Z";
    const result = computeSubscriptionUpdate({
      currentProfile: {
        subscription_tier: "pro",
        subscription_status: "active",
        subscription_expires_at: "2026-03-24T00:00:00.000Z",
      },
      purchasedPlan: "premium",
      quantity: 1,
      planAmounts: PLAN_AMOUNTS,
      nowIso,
    });

    // 남은 15일 * (5907 / 30) = 2953.5
    // 2953.5 / (9900 / 30 = 330) = 8.95 -> ceil = 9일
    expect(result.appliedCase).toBe(3);
    expect(result.bonusDays).toBe(9);
    expect(result.nextExpiresAt).toBe("2026-04-17T00:00:00.000Z");
  });

  it("PREMIUM -> PRO 추가 결제는 pending_plan 을 예약하고 현재 premium 만료 뒤에 30일을 붙인다", () => {
    const nowIso = "2026-03-09T00:00:00.000Z";
    const result = computeSubscriptionUpdate({
      currentProfile: {
        subscription_tier: "premium",
        subscription_status: "active",
        subscription_expires_at: "2026-03-20T00:00:00.000Z",
      },
      purchasedPlan: "pro",
      quantity: 1,
      planAmounts: PLAN_AMOUNTS,
      nowIso,
    });

    expect(result.appliedCase).toBe(4);
    expect(result.nextTier).toBe("premium");
    expect(result.pendingPlan).toBe("pro");
    expect(result.pendingPlanEffectiveAt).toBe("2026-03-20T00:00:00.000Z");
    expect(result.nextExpiresAt).toBe("2026-04-19T00:00:00.000Z");
  });
});

describe("getEffectiveSubscriptionState", () => {
  it("pending_plan_effective_at 이 지난 premium 계정은 실효적으로 pro 로 본다", () => {
    const result = getEffectiveSubscriptionState({
      subscription_tier: "premium",
      subscription_status: "active",
      subscription_expires_at: "2026-04-19T00:00:00.000Z",
      pending_plan: "pro",
      pending_plan_effective_at: "2026-03-20T00:00:00.000Z",
    }, "2026-03-21T00:00:00.000Z");

    expect(result.tier).toBe("pro");
    expect(result.maxPortfolios).toBe(5);
    expect(result.maxAlarms).toBe(10);
  });
});

describe("fulfillPaidOrder", () => {
  it("동일 payment_id 재호출 시 두 번째 호출은 alreadyProcessed 로 끝난다", async () => {
    const { client, state } = createAdminClientMock({
      claimResponses: [
        { success: true, claimed: true },
        { success: true, already_processed: true },
      ],
    });

    const first = await fulfillPaidOrder({
      adminClient: client,
      paymentId: "pay-1",
      userId: "user-1",
      planId: "pro",
      quantity: 1,
      amount: PLAN_AMOUNTS.pro,
      currency: "KRW",
      payMethod: "CARD",
      pgProvider: "nicepay",
      orderName: `PRO Plan (${PLAN_DAYS_PER_UNIT}일)`,
      planAmounts: PLAN_AMOUNTS,
      nowIso: "2026-03-09T00:00:00.000Z",
    });

    const second = await fulfillPaidOrder({
      adminClient: client,
      paymentId: "pay-1",
      userId: "user-1",
      planId: "pro",
      quantity: 1,
      amount: PLAN_AMOUNTS.pro,
      currency: "KRW",
      payMethod: "CARD",
      pgProvider: "nicepay",
      orderName: `PRO Plan (${PLAN_DAYS_PER_UNIT}일)`,
      planAmounts: PLAN_AMOUNTS,
      nowIso: "2026-03-09T00:00:00.000Z",
    });

    expect(first.success).toBe(true);
    expect(second.alreadyProcessed).toBe(true);
    expect(state.profileUpdates).toHaveLength(1);
  });
});
