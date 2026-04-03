import { FastifyInstance } from "fastify";
import { tossClient } from "../tossClient";
import { supabaseAdmin } from "../supabaseClient";
import { IAP_PRODUCTS } from "../services/iapConstants";
import {
    createPaymentAdminClient,
    fulfillPaidOrder,
    PLAN_DAYS_PER_UNIT,
    type PaidPlanId,
} from "../services/paymentFulfillment";

const PAID_PLAN_IDS = ["pro", "premium"] as const;
const QUANTITY_MAX = 12;
const DEFAULT_PAYMENT_QUANTITY = 1;
const PAYMENT_GATEWAY_ERROR_STATUS = 502;
const PAYMENT_GATEWAY_ERROR_MESSAGE = "Failed to communicate with payment gateway";
const BASIC_AUTH_SUFFIX = ":";

const IAP_ORDER_STATUS_URL = "https://api-partner.toss.im/api-partner/v1/apps-in-toss/order/get-order-status";

// ⚠ PRICE SOURCE OF TRUTH
// 프론트엔드(constants/membership.ts)와 이 서버 환경변수가 반드시 일치해야 합니다.
// 기본값(fallback): PRO = 5907, PREMIUM = 9900
// 변경 시 프론트(.env VITE_PLAN_AMOUNT_*) + 백엔드(PLAN_AMOUNT_*) 모두 갱신 필수.
const PLAN_AMOUNTS: Record<PaidPlanId, number> = {
    pro: Number(process.env.PLAN_AMOUNT_PRO ?? 5907),
    premium: Number(process.env.PLAN_AMOUNT_PREMIUM ?? 9900),
};
const paymentAdminClient = createPaymentAdminClient(supabaseAdmin);

interface VerifyBody {
    paymentId: string;
    planId: PaidPlanId;
    quantity?: number;
}

interface IapVerifyBody {
    orderId: string;
}

interface TossConfirmResponse {
    status?: string;
    totalAmount?: number | string;
}

function deriveQuantityFromAmount(actualAmount: number, unitPrice: number): number | null {
    const safeAmount = Math.round(actualAmount);

    if (unitPrice <= 0 || safeAmount < unitPrice) return null;

    const q = safeAmount / unitPrice;
    const roundedQ = Math.round(q);
    if (Math.abs(roundedQ - q) > Number.EPSILON) return null;

    return roundedQ >= 1 && roundedQ <= QUANTITY_MAX ? roundedQ : null;
}

function isPaidPlanId(value: unknown): value is PaidPlanId {
    return typeof value === "string" && (PAID_PLAN_IDS as readonly string[]).includes(value);
}

function parseVerifyBody(raw: unknown): VerifyBody | null {
    if (typeof raw !== "object" || raw === null) {
        return null;
    }

    const body = raw as Record<string, unknown>;
    if (typeof body.paymentId !== "string" || body.paymentId.trim() === "") {
        return null;
    }
    if (!isPaidPlanId(body.planId)) {
        return null;
    }
    if (
        body.quantity !== undefined &&
        (
            typeof body.quantity !== "number" ||
            !Number.isInteger(body.quantity) ||
            body.quantity < 1 ||
            body.quantity > QUANTITY_MAX
        )
    ) {
        return null;
    }

    if (typeof body.quantity === "number") {
        return { paymentId: body.paymentId, planId: body.planId, quantity: body.quantity };
    }

    return { paymentId: body.paymentId, planId: body.planId };
}

function parseTossConfirmResponse(raw: unknown): TossConfirmResponse {
    if (typeof raw !== "object" || raw === null) {
        return {};
    }

    const data = raw as Record<string, unknown>;
    return {
        status: typeof data.status === "string" ? data.status : undefined,
        totalAmount:
            typeof data.totalAmount === "number" || typeof data.totalAmount === "string"
                ? data.totalAmount
                : undefined,
    };
}

export async function paymentRoutes(fastify: FastifyInstance) {
    fastify.post(
        "/payment/toss/verify",
        async (request, reply) => {
            const parsedBody = parseVerifyBody(request.body);
            const authHeader = request.headers.authorization;

            if (!parsedBody) {
                return reply.code(400).send({
                    success: false,
                    error: "Invalid payment verification payload",
                });
            }

            if (!authHeader) {
                return reply.code(401).send({
                    success: false,
                    error: "Missing Authorization header",
                });
            }

            const { paymentId, planId, quantity: reqQuantity } = parsedBody;
            const unitPrice = PLAN_AMOUNTS[planId];
            const safeQuantity = typeof reqQuantity === "number" ? reqQuantity : DEFAULT_PAYMENT_QUANTITY;
            const expectedAmount = unitPrice * safeQuantity;

            try {
                const token = authHeader.replace(/^\s*Bearer\s+/i, "");
                const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

                if (authError || !user) {
                    return reply.code(401).send({
                        success: false,
                        error: "Invalid or expired token",
                    });
                }

                let confirmResponse;
                try {
                    confirmResponse = await tossClient.post<TossConfirmResponse>(
                        "/v1/payments/confirm",
                        {
                            paymentKey: paymentId,
                            orderId: paymentId,
                            amount: expectedAmount,
                        },
                        {
                            headers: process.env.TOSS_PAYMENTS_SECRET_KEY
                                ? {
                                    Authorization: `Basic ${Buffer.from(process.env.TOSS_PAYMENTS_SECRET_KEY + BASIC_AUTH_SUFFIX, "utf8").toString("base64")}`,
                                }
                                : {},
                        },
                    );
                } catch (error) {
                    request.log.error({ err: error, paymentId }, "[Payment] Toss confirm API failed");
                    return reply.code(PAYMENT_GATEWAY_ERROR_STATUS).send({
                        success: false,
                        message: PAYMENT_GATEWAY_ERROR_MESSAGE,
                    });
                }

                const paymentData = parseTossConfirmResponse(confirmResponse.data);
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
                    adminClient: paymentAdminClient,
                    paymentId,
                    userId: user.id,
                    planId,
                    quantity,
                    amount: actualAmount,
                    currency: "KRW",
                    payMethod: "CARD",
                    pgProvider: "TOSS_PAYMENTS",
                    pgTxId: paymentId,
                    paidAt: new Date().toISOString(),
                    orderName: `${planId.toUpperCase()} Plan (${quantity * PLAN_DAYS_PER_UNIT}일)`,
                    planAmounts: PLAN_AMOUNTS,
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

                request.log.info(
                    { paymentId, userId: user.id, planId, quantity },
                    "[Payment] Verification & DB update success",
                );

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
                request.log.error({ err: error, paymentId }, "[Payment] Verification failed");
                return reply.code(500).send({ success: false, error: "Internal server error" });
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

                // 2. 토스 서버에 주문 상태 조회
                const orderStatusRes = await fetch(IAP_ORDER_STATUS_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
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
                let finalPlanId: PaidPlanId | null = null;

                if (sku === IAP_PRODUCTS.PRO) {
                    finalPlanId = "pro";
                } else {
                    request.log.warn({ orderId, sku }, "[IAP Verify] Unknown or manipulated SKU");
                    return reply.code(400).send({ success: false, error: "Invalid product SKU" });
                }

                const amountToRecord = PLAN_AMOUNTS[finalPlanId];

                // 5. 공통 Fulfillment 실행
                // 토스 IAP 소모품 특성상 수량은 무조건 1단위(30일)로 강제 고정합니다.
                const fulfillment = await fulfillPaidOrder({
                    adminClient: paymentAdminClient,
                    paymentId: orderId,
                    userId: user.id,
                    planId: finalPlanId,
                    quantity: 1,
                    amount: amountToRecord,
                    currency: "KRW",
                    payMethod: "IAP",
                    pgProvider: "toss_iap",
                    pgTxId: orderId,
                    paidAt: new Date().toISOString(),
                    orderName: `${finalPlanId.toUpperCase()} Plan (${PLAN_DAYS_PER_UNIT}일)`,
                    planAmounts: PLAN_AMOUNTS,
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
