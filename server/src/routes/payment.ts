import { FastifyInstance } from "fastify";
import { handleTossError, tossClient } from "../tossClient";
import { supabaseAdmin } from "../supabaseClient";
import { IAP_PRODUCTS } from "../services/iapConstants";
import {
    fulfillPaidOrder,
    PLAN_DAYS_PER_UNIT,
    type PaidPlanId,
} from "../services/paymentFulfillment";

const QUANTITY_MAX = 12;

const IAP_ORDER_STATUS_URL = "https://api-partner.toss.im/api-partner/v1/apps-in-toss/order/get-order-status";
const TOSS_PARTNER_API_SECRET = process.env.TOSS_PARTNER_API_SECRET;

// ⚠ PRICE SOURCE OF TRUTH
// 프론트엔드(constants/membership.ts)와 이 서버 환경변수가 반드시 일치해야 합니다.
// 기본값(fallback): PRO = 5907, PREMIUM = 9900
// 변경 시 프론트(.env VITE_PLAN_AMOUNT_*) + 백엔드(PLAN_AMOUNT_*) 모두 갱신 필수.
const PLAN_AMOUNTS: Record<string, number> = {
    pro: Number(process.env.PLAN_AMOUNT_PRO ?? 5907),
    premium: Number(process.env.PLAN_AMOUNT_PREMIUM ?? 9900),
};

interface VerifyBody {
    paymentId: string;
    planId: string;
    quantity?: number;
}

interface IapVerifyBody {
    orderId: string;
}

function deriveQuantityFromAmount(actualAmount: number, unitPrice: number): number | null {
    if (unitPrice <= 0 || actualAmount < unitPrice || actualAmount % unitPrice !== 0) return null;
    const q = actualAmount / unitPrice;
    return q >= 1 && q <= QUANTITY_MAX ? q : null;
}

export async function paymentRoutes(fastify: FastifyInstance) {
    fastify.post<{ Body: VerifyBody }>(
        "/payment/toss/verify",
        async (request, reply) => {
            const { paymentId, planId, quantity: reqQuantity } = request.body;
            const authHeader = request.headers.authorization;

            if (!paymentId || !planId) {
                return reply.code(400).send({
                    success: false,
                    error: "Missing paymentId or planId",
                });
            }

            if (!authHeader) {
                return reply.code(401).send({
                    success: false,
                    error: "Missing Authorization header",
                });
            }

            const unitPrice = PLAN_AMOUNTS[planId];
            if (unitPrice == null || unitPrice <= 0) {
                return reply.code(400).send({
                    success: false,
                    error: `Invalid planId: ${planId}`,
                });
            }

            try {
                const token = authHeader.replace("Bearer ", "");
                const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

                if (authError || !user) {
                    return reply.code(401).send({
                        success: false,
                        error: "Invalid or expired token",
                    });
                }

                const expectedAmount = unitPrice * (typeof reqQuantity === "number" && reqQuantity >= 1 && reqQuantity <= QUANTITY_MAX ? reqQuantity : 1);

                const confirmResponse = await tossClient.post(
                    "/v1/payments/confirm",
                    {
                        paymentKey: paymentId,
                        orderId: paymentId,
                        amount: expectedAmount,
                    },
                    {
                        headers: process.env.TOSS_PAYMENTS_SECRET_KEY
                            ? {
                                Authorization: `Basic ${Buffer.from(process.env.TOSS_PAYMENTS_SECRET_KEY + ":", "utf8").toString("base64")}`,
                            }
                            : {},
                    },
                );

                const paymentData = confirmResponse.data as { status?: string; totalAmount?: number };
                if (paymentData.status !== "DONE") {
                    return reply.send({
                        success: false,
                        message: "Payment status is not DONE",
                    });
                }

                const actualAmount = Number(paymentData.totalAmount) || 0;
                const quantity = deriveQuantityFromAmount(actualAmount, unitPrice);
                if (quantity == null) {
                    return reply.code(400).send({
                        success: false,
                        error: "Payment amount does not match any allowed plan quantity.",
                    });
                }

                const fulfillment = await fulfillPaidOrder({
                    adminClient: supabaseAdmin,
                    paymentId,
                    userId: user.id,
                    planId: planId as PaidPlanId,
                    quantity,
                    amount: actualAmount,
                    currency: "KRW",
                    payMethod: "CARD",
                    pgProvider: "TOSS_PAYMENTS",
                    pgTxId: paymentId,
                    paidAt: new Date().toISOString(),
                    orderName: `${planId.toUpperCase()} Plan (${quantity * PLAN_DAYS_PER_UNIT}일)`,
                    planAmounts: PLAN_AMOUNTS as { pro: number; premium: number },
                    metadata: {
                        source: "toss-payments-verify",
                    },
                });

                if (fulfillment.inProgress) {
                    return reply.code(202).send({
                        success: false,
                        error: fulfillment.message || "Payment fulfillment is already in progress",
                    });
                }

                console.log("[Payment] Verification & DB Update Successful");

                return reply.send({
                    success: true,
                    message: fulfillment.alreadyProcessed
                        ? "Payment already processed."
                        : "Payment verified successfully.",
                    subscription: {
                        tier: fulfillment.subscription?.tier ?? planId,
                        status: fulfillment.subscription?.status ?? "active",
                        expiresAt: fulfillment.subscription?.expiresAt ?? null,
                    },
                });
            } catch (error) {
                const err = handleTossError(error, "Payment Verify");
                return reply.code(400).send({ success: false, ...err });
            }
        },
    );

    fastify.post<{ Body: IapVerifyBody }>(
        "/payment/toss/iap-verify",
        async (request, reply) => {
            const { orderId } = request.body ?? {};
            const authHeader = request.headers.authorization;

            if (!orderId || typeof orderId !== "string") {
                return reply.code(400).send({ success: false, error: "Missing orderId" });
            }

            if (!authHeader) {
                return reply.code(401).send({ success: false, error: "Missing Authorization header" });
            }

            try {
                const token = authHeader.replace(/^\s*Bearer\s+/i, "");
                const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
                if (authError || !user) {
                    return reply.code(401).send({ success: false, error: "Invalid or expired token" });
                }

                // 1. 유저의 토스 고유 식별자 가져오기
                const { data: profile, error: profileError } = await supabaseAdmin
                    .from("user_profiles")
                    .select("toss_user_key")
                    .eq("id", user.id)
                    .single();

                if (profileError || !profile?.toss_user_key) {
                    return reply.code(400).send({ success: false, error: "toss_user_key not found. Toss login required." });
                }

                if (!TOSS_PARTNER_API_SECRET) {
                    request.log.error("[IAP Verify] TOSS_PARTNER_API_SECRET not configured");
                    return reply.code(500).send({ success: false, error: "Server configuration error" });
                }

                // 2. 토스 서버에 주문 상태 및 영수증 진위 여부 조회
                const orderStatusRes = await fetch(IAP_ORDER_STATUS_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${TOSS_PARTNER_API_SECRET}`,
                        "x-toss-user-key": profile.toss_user_key,
                    },
                    body: JSON.stringify({ orderId }),
                });

                const orderStatusData = await orderStatusRes.json().catch(() => ({}));
                const successPayload = orderStatusData?.success ?? orderStatusData;
                const status = successPayload?.status;

                if (!orderStatusRes.ok) {
                    request.log.warn({ orderId, status: orderStatusRes.status, data: orderStatusData }, "[IAP Verify] get-order-status failed");
                    return reply.code(500).send({ success: false, error: "Order status verification failed" });
                }

                // 3. 결제 완료 상태 검증
                const completed = status === "COMPLETED" || status === "PURCHASED";
                if (!completed) {
                    return reply.code(400).send({ success: false, error: `Order not in completed state: ${status}` });
                }

                // 4. SKU 무조건 검증 (Zero-Trust: 클라이언트 값 무시)
                const sku = successPayload?.product?.id ?? successPayload?.sku ?? successPayload?.productId;
                let finalPlanId = "";
                let amountToRecord = PLAN_AMOUNTS.pro;

                if (sku === IAP_PRODUCTS.PRO) {
                    finalPlanId = "pro";
                    amountToRecord = PLAN_AMOUNTS.pro;
                } else {
                    request.log.warn({ orderId, sku }, "[IAP Verify] Unknown or manipulated SKU");
                    return reply.code(400).send({ success: false, error: "Invalid product SKU" });
                }

                // 5. 공통 Fulfillment 실행
                // 토스 IAP 소모품 특성상 수량은 무조건 1단위(30일)로 강제 고정합니다.
                const fulfillment = await fulfillPaidOrder({
                    adminClient: supabaseAdmin,
                    paymentId: orderId,
                    userId: user.id,
                    planId: finalPlanId as PaidPlanId,
                    quantity: 1,
                    amount: amountToRecord,
                    currency: "KRW",
                    payMethod: "IAP",
                    pgProvider: "toss_iap",
                    pgTxId: orderId,
                    paidAt: new Date().toISOString(),
                    orderName: `${finalPlanId.toUpperCase()} Plan (${PLAN_DAYS_PER_UNIT}일)`,
                    planAmounts: PLAN_AMOUNTS as { pro: number; premium: number },
                    metadata: {
                        source: "toss-iap-verify",
                        sku,
                        orderStatus: status,
                    },
                });

                if (fulfillment.inProgress) {
                    return reply.code(202).send({
                        success: false,
                        error: fulfillment.message || "Transaction is already processing",
                    });
                }

                request.log.info({ orderId, userId: user.id, planId: finalPlanId, result: fulfillment.message }, "[IAP Verify] Success");
                return reply.send({ success: true, message: fulfillment.message });

            } catch (error) {
                request.log.error(error, "[IAP Verify] unexpected error");
                return reply.code(500).send({ success: false, error: "Internal server error" });
            }
        },
    );
}
