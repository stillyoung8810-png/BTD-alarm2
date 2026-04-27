import * as WebFramework from '@apps-in-toss/web-framework';
import type { TossIapErrorCode } from '../../constants/paymentCheckoutMessages';
import { getSkuByPlanId } from '../iap/iapConstants';
import { supabase } from '../supabase';
import {
  fetchJsonWithTimeout,
  isRecord,
  normalizeErrorMessage,
  readString,
  wrapBridgeCall,
} from '../serviceUtils';
import { readTrimmedViteEnv } from '../../utils/viteImportMetaEnv';
import { TOSS_IAP_FIXED_PLAN_ID } from './types';

const BFF_URL = readTrimmedViteEnv('VITE_RAILWAY_BFF_URL');

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
  if (!isRecord(value)) {
    return false;
  }
  const errorCodeOk =
    value.errorCode === undefined || typeof value.errorCode === 'string';
  const messageOk =
    value.message === undefined || typeof value.message === 'string';
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
  if (BFF_URL.length === 0) {
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
    const verifyResult = await fetchJsonWithTimeout<null>(
      `${base}/payment/toss/iap-verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ orderId, planId, quantity }),
      },
      null,
      { context: { action: 'iap_verify', orderId, planId } },
    );
    return verifyResult.ok;
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

          const completeResult = await wrapBridgeCall<unknown>(
            () => iap.completeProductGrant({ orderId }),
            null,
            { action: 'completeProductGrant', orderId },
          );
          if (!completeResult.ok) {
            console.error(
              '[IAP] completeProductGrant 실패:',
              completeResult.error.cause,
            );
            settle({
              success: false,
              errorCode: 'PRODUCT_NOT_GRANTED_BY_PARTNER',
              rawMessage: normalizeErrorMessage(
                completeResult.error.cause,
                'complete_product_grant_failed',
              ),
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
  response: unknown,
): TossPendingOrder[] {
  if (response == null) {
    return [];
  }

  if (Array.isArray(response)) {
    return response
      .map((item) => decodePendingOrder(item))
      .filter((item): item is TossPendingOrder => item !== null);
  }

  if (!isRecord(response) || !Array.isArray(response.orders)) {
    return [];
  }

  return response.orders
    .map((item) => decodePendingOrder(item))
    .filter((item): item is TossPendingOrder => item !== null);
}

export async function restorePendingIapOrders(): Promise<void> {
  const iap = getIapBridge();
  if (!iap) {
    return;
  }

  try {
    const pendingOrdersResult = await wrapBridgeCall<unknown>(
      () => iap.getPendingOrders(),
      null,
      { action: 'getPendingOrders' },
    );
    if (!pendingOrdersResult.ok) {
      console.error(
        '[IAP] 미결 주문 조회 실패:',
        normalizeErrorMessage(
          pendingOrdersResult.error.cause,
          'get_pending_orders_failed',
        ),
      );
      return;
    }

    const pendingOrders = getPendingOrderList(pendingOrdersResult.data);

    for (const order of pendingOrders) {
      if (!order?.orderId) {
        continue;
      }
      const isGranted = await verifyAndGrantProductOnServer(
        order.orderId,
        TOSS_IAP_FIXED_PLAN_ID,
        1,
      );
      if (isGranted) {
        const completeResult = await wrapBridgeCall<unknown>(
          () => iap.completeProductGrant({ orderId: order.orderId }),
          null,
          { action: 'completeProductGrant', orderId: order.orderId },
        );
        if (!completeResult.ok) {
          console.error(
            '[IAP] 미결 주문 completeProductGrant 실패:',
            normalizeErrorMessage(
              completeResult.error.cause,
              'complete_product_grant_failed',
            ),
          );
        }
      }
    }
  } catch (error) {
    console.error('[IAP] 미결 주문 복원 실패:', error);
  }
}

function decodePendingOrder(value: unknown): TossPendingOrder | null {
  if (!isRecord(value)) {
    return null;
  }

  const orderId = readString(value, 'orderId');
  if (orderId == null) {
    return null;
  }

  const sku = readString(value, 'sku') ?? undefined;
  const paymentCompletedDate =
    readString(value, 'paymentCompletedDate') ?? undefined;

  return {
    orderId,
    sku,
    paymentCompletedDate,
  };
}
