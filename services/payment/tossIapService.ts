import * as WebFramework from '@apps-in-toss/web-framework';
import type { TossIapErrorCode } from '../../constants/paymentCheckoutMessages';
import { getSkuByPlanId } from '../iap/iapConstants';
import { supabase } from '../supabase';
import { TOSS_IAP_FIXED_PLAN_ID } from './types';

const BFF_URL = import.meta.env.VITE_RAILWAY_BFF_URL;

export interface IapResult {
  success: boolean;
  cancel?: boolean;
  errorCode?: TossIapErrorCode;
  rawMessage?: string;
  orderId?: string;
}

interface TossIapBridgeOrderGrantParams {
  orderId: string;
}

interface TossIapSuccessEvent {
  type: 'success';
  data: {
    orderId: string;
    displayName: string;
    displayAmount: string;
    amount: number;
    currency: string;
    fraction: number;
    miniAppIconUrl: string | null;
  };
}

interface TossIapCancelEvent {
  type: 'canceled';
}

type TossIapEvent = TossIapSuccessEvent | TossIapCancelEvent;

interface TossIapSdkError {
  errorCode?: string;
  message?: string;
}

interface TossPendingOrder {
  orderId: string;
  sku?: string;
  paymentCompletedDate?: string;
}

interface TossIapBridge {
  createOneTimePurchaseOrder(params: {
    options: {
      sku: string;
      processProductGrant: (params: TossIapBridgeOrderGrantParams) => boolean | Promise<boolean>;
    };
    onEvent: (event: TossIapEvent) => void | Promise<void>;
    onError: (error: unknown) => void | Promise<void>;
  }): () => void;
  completeProductGrant(params: { orderId: string }): Promise<boolean | undefined>;
  getPendingOrders(): Promise<TossPendingOrder[] | { orders: TossPendingOrder[] } | undefined>;
}

function isTossIapSdkError(value: unknown): value is TossIapSdkError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const errorCodeOk = candidate.errorCode === undefined || typeof candidate.errorCode === 'string';
  const messageOk = candidate.message === undefined || typeof candidate.message === 'string';
  return errorCodeOk && messageOk;
}

function getIapBridge(): TossIapBridge | null {
  const candidate = (WebFramework as { IAP?: unknown }).IAP;
  if (candidate === undefined || candidate === null || typeof candidate !== 'object') {
    return null;
  }
  const bridge = candidate as Partial<TossIapBridge>;
  if (
    typeof bridge.createOneTimePurchaseOrder !== 'function' ||
    typeof bridge.completeProductGrant !== 'function' ||
    typeof bridge.getPendingOrders !== 'function'
  ) {
    return null;
  }
  return bridge as TossIapBridge;
}

function normalizeTossIapErrorCode(code: string | undefined): TossIapErrorCode {
  switch (code) {
    case 'INVALID_PRODUCT_ID':
    case 'PAYMENT_PENDING':
    case 'NETWORK_ERROR':
    case 'INVALID_USER_ENVIRONMENT':
    case 'APP_MARKET_VERIFICATION_FAILED':
    case 'TOSS_SERVER_VERIFICATION_FAILED':
    case 'INTERNAL_ERROR':
    case 'KOREAN_ACCOUNT_ONLY':
    case 'USER_CANCELED':
    case 'PRODUCT_NOT_GRANTED_BY_PARTNER':
      return code;
    case undefined:
      return 'UNKNOWN';
    default: {
      console.warn('[IAP] Unknown Toss error code:', code);
      return 'UNKNOWN';
    }
  }
}

function toTossIapResultFromError(error: unknown): IapResult {
  if (!isTossIapSdkError(error)) {
    return {
      success: false,
      errorCode: 'UNKNOWN',
      rawMessage: undefined,
    };
  }
  const errorCode = normalizeTossIapErrorCode(error.errorCode);
  return {
    success: false,
    cancel: errorCode === 'USER_CANCELED',
    errorCode,
    rawMessage: error.message,
  };
}

async function verifyAndGrantProductOnServer(
  orderId: string,
  planId: string,
  quantity: number,
): Promise<boolean> {
  if (!BFF_URL) {
    return false;
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return false;
    }

    const base = BFF_URL.replace(/\/+$/, '');
    const res = await fetch(`${base}/payment/toss/iap-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ orderId, planId, quantity }),
    });
    return res.ok;
  } catch (err) {
    console.error('[IAP Server Verify Error]', err);
    return false;
  }
}

export async function requestTossIAP(planId: string, quantity: number = 1): Promise<IapResult> {
  const sku = getSkuByPlanId(planId);
  if (!sku) {
    return {
      success: false,
      errorCode: 'INVALID_PRODUCT_ID',
    };
  }

  const iap = getIapBridge();
  if (!iap) {
    return {
      success: false,
      errorCode: 'INVALID_USER_ENVIRONMENT',
    };
  }

  return new Promise((resolve) => {
    let isSettled = false;
    const settle = (result: IapResult): void => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      resolve(result);
    };

    const cleanup = iap.createOneTimePurchaseOrder({
      options: {
        sku,
        processProductGrant: async ({ orderId }) => {
          const isGranted = await verifyAndGrantProductOnServer(orderId, planId, quantity);
          if (!isGranted) {
            settle({
              success: false,
              errorCode: 'PRODUCT_NOT_GRANTED_BY_PARTNER',
              rawMessage: 'server_grant_failed',
            });
            return false;
          }

          try {
            await iap.completeProductGrant({ orderId });
          } catch (completeErr) {
            console.error('[IAP] completeProductGrant 실패:', completeErr);
            settle({
              success: false,
              errorCode: 'PRODUCT_NOT_GRANTED_BY_PARTNER',
              rawMessage: completeErr instanceof Error ? completeErr.message : undefined,
            });
            return false;
          }

          settle({ success: true, orderId });
          return true;
        },
      },
      onEvent: (event) => {
        if (event.type !== 'canceled') {
          return;
        }
        settle({
          success: false,
          cancel: true,
          errorCode: 'USER_CANCELED',
        });
      },
      onError: (error) => {
        settle(toTossIapResultFromError(error));
      },
    });

    void cleanup;
  });
}

function getPendingOrderList(
  response: TossPendingOrder[] | { orders: TossPendingOrder[] } | undefined,
): TossPendingOrder[] {
  if (!response) {
    return [];
  }
  if (Array.isArray(response)) {
    return response;
  }
  return Array.isArray(response.orders) ? response.orders : [];
}

export async function restorePendingIapOrders(): Promise<void> {
  const iap = getIapBridge();
  if (!iap) {
    return;
  }

  try {
    const pendingResponse = await iap.getPendingOrders();
    const pendingOrders = getPendingOrderList(pendingResponse);

    for (const order of pendingOrders) {
      if (!order?.orderId) {
        continue;
      }
      console.log('[IAP] 미결 주문 복원 시도:', order.orderId);
      const isGranted = await verifyAndGrantProductOnServer(
        order.orderId,
        TOSS_IAP_FIXED_PLAN_ID,
        1,
      );
      if (isGranted) {
        await iap.completeProductGrant({ orderId: order.orderId });
      }
    }
  } catch (error) {
    console.error('[IAP] 미결 주문 복원 실패:', error);
  }
}
