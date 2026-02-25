import { FastifyInstance } from "fastify";
import { handleTossError, tossClient } from "../tossClient";
import { supabaseAdmin } from "../supabaseClient";
import { IAP_PRODUCTS } from "../services/iapConstants";

const PLAN_DAYS_PER_UNIT = 30;
const QUANTITY_MAX = 12;

const IAP_ORDER_STATUS_URL = "https://api-partner.toss.im/api-partner/v1/apps-in-toss/order/get-order-status";
const TOSS_PARTNER_API_SECRET = process.env.TOSS_PARTNER_API_SECRET;

const PLAN_AMOUNTS: Record<string, number> = {
    pro: Number(process.env.PLAN_AMOUNT_PRO ?? 5900),
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

                const totalDays = PLAN_DAYS_PER_UNIT * quantity;
                const expiresAt = new Date(Date.now() + totalDays * 24 * 60 * 60 * 1000);

                const { error: updateError } = await supabaseAdmin
                    .from("user_profiles")
                    .update({
                        subscription_tier: planId,
                        subscription_status: "active",
                        subscription_expires_at: expiresAt.toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", user.id);

                if (updateError) {
                    console.error("[Payment] DB Update Error:", updateError);
                    return reply.send({
                        success: false,
                        error: "Payment verified but DB update failed",
                    });
                }

                await supabaseAdmin.from("orders").insert({
                    user_id: user.id,
                    payment_id: paymentId,
                    plan_id: planId,
                    order_name: `${planId.toUpperCase()} Plan (${totalDays}일)`,
                    amount: actualAmount,
                    currency: "KRW",
                    pay_method: "CARD",
                    status: "paid",
                    pg_provider: "TOSS_PAYMENTS",
                    paid_at: new Date().toISOString(),
                    metadata: { quantity },
                });

                console.log("[Payment] Verification & DB Update Successful");

                return reply.send({
                    success: true,
                    message: "Payment verified successfully.",
                    subscription: {
                        tier: planId,
                        status: "active",
                        expiresAt: expiresAt.toISOString(),
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
                let amountToRecord = 5900; // PRO 기본값

                if (sku === IAP_PRODUCTS.PRO) {
                    finalPlanId = "pro";
                    amountToRecord = Number(process.env.PLAN_AMOUNT_PRO ?? 5900);
                } else {
                    request.log.warn({ orderId, sku }, "[IAP Verify] Unknown or manipulated SKU");
                    return reply.code(400).send({ success: false, error: "Invalid product SKU" });
                }

                // 5. DB 트랜잭션 실행 (중복 확인 -> 영수증 저장 -> 구독 30일 연장)
                // 토스 IAP 소모품 특성상 수량은 무조건 1단위(30일)로 강제 고정합니다.
                const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc("process_iap_order", {
                    p_user_id: user.id,
                    p_order_id: orderId,
                    p_plan_id: finalPlanId,
                    p_amount: amountToRecord,
                    p_days_to_add: PLAN_DAYS_PER_UNIT,
                });

                if (rpcError) {
                    request.log.error({ error: rpcError.message }, "[IAP Verify] RPC process_iap_order failed");
                    return reply.code(500).send({ success: false, error: "Transaction failed" });
                }

                const rpcResult = rpcData as { success: boolean; message?: string; error?: string };
                if (!rpcResult.success) {
                    request.log.error({ error: rpcResult.error }, "[IAP Verify] RPC logic failed");
                    return reply.code(500).send({ success: false, error: rpcResult.error || "Transaction logic failed" });
                }

                request.log.info({ orderId, userId: user.id, planId: finalPlanId, result: rpcResult.message }, "[IAP Verify] Success");
                return reply.send({ success: true, message: rpcResult.message });

            } catch (error) {
                request.log.error(error, "[IAP Verify] unexpected error");
                return reply.code(500).send({ success: false, error: "Internal server error" });
            }
        },
    );
}
