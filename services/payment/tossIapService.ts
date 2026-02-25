import * as WebFramework from '@apps-in-toss/web-framework';
import { getSkuByPlanId } from '../iap/iapConstants';
import { supabase } from '../supabase';

const BFF_URL = import.meta.env.VITE_RAILWAY_BFF_URL as string | undefined;

export interface IapResult {
  success: boolean;
  cancel?: boolean;
  message?: string;
  orderId?: string;
}

async function verifyAndGrantProductOnServer(orderId: string, planId: string, quantity: number): Promise<boolean> {
  if (!BFF_URL) return false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;

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
  if (!sku) return { success: false, message: `등록되지 않은 IAP 상품입니다.` };

  const iap = (WebFramework as any).IAP;
  if (!iap || typeof iap.createOneTimePurchaseOrder !== 'function') {
    return { success: false, message: '현재 환경에서 토스 인앱결제를 지원하지 않습니다.' };
  }

  return new Promise((resolve) => {
    iap.createOneTimePurchaseOrder({
      options: { sku },
      processProductGrant: async ({ orderId }: { orderId: string }) => {
        try {
          const isGranted = await verifyAndGrantProductOnServer(orderId, planId, quantity);
          if (isGranted) {
            await iap.completeProductGrant({ orderId });
            resolve({ success: true, orderId });
          } else {
            throw new Error('서버 상품 지급 실패');
          }
        } catch (error) {
          console.error('[IAP] 지급 처리 중 오류:', error);
          throw error;
        }
      },
      onEvent: (event: any) => {
        if (event.type === 'canceled') {
          resolve({ success: false, cancel: true, message: '사용자가 결제를 취소했습니다.' });
        }
      },
      onError: (error: any) => {
        resolve({ success: false, message: error?.message || '결제 진행 중 오류가 발생했습니다.' });
      }
    });
  });
}

export async function restorePendingIapOrders() {
  const iap = (WebFramework as any).IAP;
  if (!iap || typeof iap.getPendingOrders !== 'function') return;

  try {
    const pendingOrders = await iap.getPendingOrders();
    for (const order of pendingOrders) {
      console.log('[IAP] 미결 주문 복원 시도:', order.orderId);
      const isGranted = await verifyAndGrantProductOnServer(order.orderId, 'restore', 1);
      if (isGranted) {
        await iap.completeProductGrant({ orderId: order.orderId });
      }
    }
  } catch (err) {
    console.error('[IAP] 미결 주문 복원 실패:', err);
  }
}
