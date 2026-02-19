import { FastifyInstance } from "fastify";
import { handleTossError, tossClient } from "../tossClient";
import { supabaseAdmin } from "../supabaseClient";

const PLAN_DAYS_PER_UNIT = 30;
const QUANTITY_MAX = 12;

const PLAN_AMOUNTS: Record<string, number> = {
    pro: Number(process.env.PLAN_AMOUNT_PRO ?? 5900),
    premium: Number(process.env.PLAN_AMOUNT_PREMIUM ?? 9900),
};

interface VerifyBody {
    paymentId: string;
    planId: string;
    quantity?: number;
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
}
