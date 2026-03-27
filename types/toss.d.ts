/**
 * 토스 미니앱 브릿지 전역 객체 타입.
 * 디지털 재화 결제는 @apps-in-toss/web-framework 의 IAP API만 사용합니다(window.TossApp.requestPayment 미사용).
 */
interface TossAppBridgeGlobal {
  /** 토스 로그인: 인증 코드 요청 (토스 앱 내에서만 동작). 공식: authorizationCode, referrer */
  requestAuth?: () => Promise<{ authorizationCode?: string; code?: string; referrer?: string }>;
  /** 광고 표시 (리워드/전면). 실제 API는 토스 문서 확인 후 보강 */
  ads?: {
    showReward?: (placementId: string) => Promise<void>;
    showInterstitial?: (placementId: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    TossApp?: TossAppBridgeGlobal;
    __TOSS_APP__?: TossAppBridgeGlobal;
  }
}

export type { TossAppBridgeGlobal };
