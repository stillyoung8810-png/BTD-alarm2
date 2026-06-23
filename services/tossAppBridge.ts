/**
 * 토스 앱 브릿지 서비스
 *
 * @apps-in-toss/web-framework 공식 SDK API를 활용하여
 * 토스 앱 환경에서만 동작하는 기능들을 제공합니다.
 *
 * 주요 API:
 *  - partner        : 내비게이션 액세서리 버튼 추가 등
 *  - tdsEvent       : SDK 이벤트 리스너 등록/해제
 *  - SafeAreaInsets  : 안전 영역(노치/홈바) 여백 값 조회·구독
 */

import {
  isRecord,
  normalizeErrorMessage,
  wrapBridgeCall,
} from './serviceUtils';
import { isViteDevBuild } from '../utils/viteImportMetaEnv';
import type {
  RequestNotificationAgreementOptions,
} from '@apps-in-toss/web-framework';

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------
export interface SafeAreaInsetsValue {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface AccessoryButtonOption {
  id: string;
  title: string;
  icon: { name: string };
}

/** SDK 모듈 동적 import 결과 캐시 */
interface WebFrameworkModule {
  partner?: {
    addAccessoryButton: (option: AccessoryButtonOption) => void;
  };
  tdsEvent?: {
    addEventListener: (
      eventName: string,
      handler: { onEvent: (data: { id: string }) => void },
    ) => () => void;
  };
  SafeAreaInsets?: {
    get: () => SafeAreaInsetsValue;
    subscribe: (handler: { onEvent: (insets: SafeAreaInsetsValue) => void }) => () => void;
  };
  /** 외부 URL 열기 (WebView에서는 브라우저 탭으로 열림) — @apps-in-toss 문서 권장 */
  openURL?: (url: string) => Promise<unknown>;
  isMinVersionSupported?: (minVersions: {
    android: `${number}.${number}.${number}` | 'always' | 'never';
    ios: `${number}.${number}.${number}` | 'always' | 'never';
  }) => boolean;
  requestNotificationAgreement?: (
    params: RequestNotificationAgreementOptions,
  ) => () => void;
}

type WebFrameworkPartnerModule = NonNullable<WebFrameworkModule["partner"]>;
type WebFrameworkTdsEventModule = NonNullable<WebFrameworkModule["tdsEvent"]>;
type WebFrameworkSafeAreaModule = NonNullable<WebFrameworkModule["SafeAreaInsets"]>;
type WebFrameworkOpenUrl = NonNullable<WebFrameworkModule["openURL"]>;
type WebFrameworkIsMinVersionSupported =
  NonNullable<WebFrameworkModule["isMinVersionSupported"]>;
type WebFrameworkRequestNotificationAgreement =
  NonNullable<WebFrameworkModule["requestNotificationAgreement"]>;

let _cachedModule: WebFrameworkModule | null = null;

/** 샌드박스 등에서 디버그 로그를 켜는 쿼리 파라미터 (예: ?toss_debug=1) */
const TOSS_DEBUG_QUERY = 'toss_debug';

// ---------------------------------------------------------------------------
// 1. 토스 앱 환경 감지
// ---------------------------------------------------------------------------
/**
 * 현재 실행 환경이 토스 앱 내부인지 확인합니다.
 * - window.TossApp / window.__TOSS_APP__ 전역 객체 존재 여부
 * - UserAgent 문자열에 TossApp 또는 TossIt 포함 여부
 */
export const isTossApp = (): boolean => {
  if (typeof window === 'undefined') return false;

  return !!(
    window.TossApp ||
    window.__TOSS_APP__ ||
    /TossApp|TossIt/i.test(navigator.userAgent)
  );
};

// ---------------------------------------------------------------------------
// 1-1. 토스 앱 환경 디버그 (샌드박스/개발용)
// ---------------------------------------------------------------------------
export interface TossAppDebugSnapshot {
  /** 최종 isTossApp() 결과 */
  isTossApp: boolean;
  /** window.TossApp 존재 여부 */
  hasTossApp: boolean;
  /** window.__TOSS_APP__ 존재 여부 */
  hasTossAppLegacy: boolean;
  /** UserAgent에 TossApp|TossIt 매칭 여부 */
  uaMatch: boolean;
  /** UserAgent 앞 80자 (개인정보 회피) */
  userAgentPreview: string;
  /** 디버그 로그를 출력했는지 (쿼리 또는 DEV) */
  debugLogEnabled: boolean;
}

/**
 * 현재 환경의 토스 앱 감지 상세 스냅샷을 반환합니다.
 * 로그 출력 없이 값만 반환하므로, 샌드박스에서 조건부 로깅에 활용할 수 있습니다.
 */
export const getTossAppDebugSnapshot = (): TossAppDebugSnapshot | null => {
  if (typeof window === 'undefined') return null;

  const hasTossApp = 'TossApp' in window && !!window.TossApp;
  const hasTossAppLegacy = '__TOSS_APP__' in window && !!window.__TOSS_APP__;
  const ua = navigator.userAgent;
  const uaMatch = /TossApp|TossIt/i.test(ua);

  const isDev = isViteDevBuild();
  const queryEnabled =
    typeof window !== 'undefined' &&
    typeof window.location?.search === 'string' &&
    new URLSearchParams(window.location.search).get(TOSS_DEBUG_QUERY) === '1';
  const debugLogEnabled = isDev || !!queryEnabled;

  return {
    isTossApp: !!(hasTossApp || hasTossAppLegacy || uaMatch),
    hasTossApp,
    hasTossAppLegacy,
    uaMatch,
    userAgentPreview: ua.slice(0, 80),
    debugLogEnabled,
  };
};

/**
 * 토스 앱 환경 감지 결과를 콘솔에 구조화해 출력합니다.
 * - 개발 모드(VITE DEV)이거나 URL에 ?toss_debug=1 이 있을 때만 출력합니다.
 * - 샌드박스에서 로그를 보려면 스킴/URL에 toss_debug=1 을 붙이면 됩니다.
 */
export const logTossAppEnvironment = (): void => {
  const snapshot = getTossAppDebugSnapshot();
  if (!snapshot || !snapshot.debugLogEnabled) return;

  const prefix = '[TossApp:Env]';
  // eslint-disable-next-line no-console
  console.groupCollapsed(`${prefix} 토스 앱 환경 감지`);
  // eslint-disable-next-line no-console
  console.log('isTossApp (최종)', snapshot.isTossApp);
  // eslint-disable-next-line no-console
  console.log('window.TossApp', snapshot.hasTossApp);
  // eslint-disable-next-line no-console
  console.log('window.__TOSS_APP__', snapshot.hasTossAppLegacy);
  // eslint-disable-next-line no-console
  console.log('UserAgent TossApp|TossIt', snapshot.uaMatch);
  // eslint-disable-next-line no-console
  console.log('UserAgent (앞 80자)', snapshot.userAgentPreview);
  // eslint-disable-next-line no-console
  console.groupEnd();
};

// ---------------------------------------------------------------------------
// 2. SDK 모듈 동적 로드 (캐싱)
// ---------------------------------------------------------------------------
/**
 * @apps-in-toss/web-framework를 동적 import합니다.
 * 토스 앱 환경이 아니면 null을 반환하며, 한 번 로드 후 캐싱합니다.
 */
export const loadWebFramework = async (): Promise<WebFrameworkModule | null> => {
  if (_cachedModule) return _cachedModule;
  if (!isTossApp()) return null;

  try {
    const mod = await Promise.resolve(import('@apps-in-toss/web-framework'));
    _cachedModule = decodeWebFrameworkModule(mod);
    return _cachedModule;
  } catch (error) {
    console.warn(
      '[TossApp] web-framework 로드 실패:',
      normalizeErrorMessage(error, 'unknown_error'),
    );
    return null;
  }
};

// ---------------------------------------------------------------------------
// 3. Safe Area Insets
// ---------------------------------------------------------------------------
const DEFAULT_INSETS: SafeAreaInsetsValue = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * 현재 Safe Area 여백 값을 가져옵니다.
 * 토스 앱 밖에서는 모두 0을 반환합니다.
 */
export const getSafeAreaInsets = async (): Promise<SafeAreaInsetsValue> => {
  const mod = await loadWebFramework();
  if (!mod?.SafeAreaInsets) return DEFAULT_INSETS;

  try {
    return mod.SafeAreaInsets.get();
  } catch {
    return DEFAULT_INSETS;
  }
};

/**
 * Safe Area 변경을 구독합니다 (화면 회전 등).
 * @returns cleanup 함수 (구독 해제)
 */
export const subscribeSafeAreaInsets = async (
  callback: (insets: SafeAreaInsetsValue) => void,
): Promise<() => void> => {
  const mod = await loadWebFramework();
  if (!mod?.SafeAreaInsets) return () => {};

  try {
    return mod.SafeAreaInsets.subscribe({ onEvent: callback });
  } catch {
    return () => {};
  }
};

// ---------------------------------------------------------------------------
// 4. 내비게이션 액세서리 버튼
// ---------------------------------------------------------------------------
/**
 * 내비게이션바 우측에 액세서리 아이콘 버튼을 추가합니다.
 * 비게임 미니앱에서는 최대 1개까지만 추가 가능합니다.
 */
export const addNavigationAccessoryButton = async (
  option: AccessoryButtonOption,
): Promise<void> => {
  const mod = await loadWebFramework();
  if (!mod?.partner) return;

  try {
    mod.partner.addAccessoryButton(option);
  } catch (error) {
    console.warn(
      '[TossApp] 액세서리 버튼 추가 실패:',
      normalizeErrorMessage(error, 'unknown_error'),
    );
  }
};

// ---------------------------------------------------------------------------
// 5. TDS 이벤트 리스너
// ---------------------------------------------------------------------------
/**
 * 내비게이션 액세서리 버튼 클릭 이벤트를 구독합니다.
 * @returns cleanup 함수 (리스너 해제)
 */
export const onNavigationAccessoryClick = async (
  handler: (buttonId: string) => void,
): Promise<() => void> => {
  const mod = await loadWebFramework();
  if (!mod?.tdsEvent) return () => {};

  try {
    return mod.tdsEvent.addEventListener('navigationAccessoryEvent', {
      onEvent: ({ id }) => handler(id),
    });
  } catch {
    return () => {};
  }
};

// ---------------------------------------------------------------------------
// 6. 외부 URL 열기
// ---------------------------------------------------------------------------
/**
 * 토스 미니앱 내에서는 @apps-in-toss/web-framework의 openURL을 사용해 외부 URL을 엽니다.
 * (WebView에서 window.open은 차단되거나 오동작할 수 있어, 가이드라인에서 openURL 사용을 권장합니다.)
 * 토스가 아닌 환경에서는 window.open으로 폴백합니다.
 */
export const openExternalUrl = async (url: string): Promise<void> => {
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    return;
  }

  if (isTossApp()) {
    const mod = await loadWebFramework();
    if (typeof mod?.openURL === 'function') {
      const openResult = await wrapBridgeCall<unknown>(
        () => mod.openURL?.(trimmedUrl),
        null,
        { action: 'openURL' },
      );
      if (openResult.ok) {
        return;
      }

      console.warn(
        '[TossApp] openURL 실패, window.open 폴백:',
        normalizeErrorMessage(openResult.error.cause, 'unknown_error'),
      );
    }
  }
  if (typeof window !== 'undefined') {
    window.open(trimmedUrl, '_blank', 'noopener,noreferrer');
  }
};

// ---------------------------------------------------------------------------
// 7. 브릿지 초기화 (종합)
// ---------------------------------------------------------------------------
export interface TossBridgeState {
  isInTossApp: boolean;
  safeAreaInsets: SafeAreaInsetsValue;
  cleanups: Array<() => void>;
}

/**
 * 토스 앱 브릿지를 초기화하고 Safe Area / 이벤트 리스너를 설정합니다.
 * TossAppContext에서 호출됩니다.
 */
export const initializeTossBridge = async (
  onSafeAreaChange?: (insets: SafeAreaInsetsValue) => void,
): Promise<TossBridgeState> => {
  const isInApp = isTossApp();

  if (!isInApp) {
    return { isInTossApp: false, safeAreaInsets: DEFAULT_INSETS, cleanups: [] };
  }

  const cleanups: Array<() => void> = [];

  // Safe Area 초기값 가져오기
  const insets = await getSafeAreaInsets();

  // Safe Area 변경 구독
  if (onSafeAreaChange) {
    const unsubscribe = await subscribeSafeAreaInsets(onSafeAreaChange);
    cleanups.push(unsubscribe);
  }

  return { isInTossApp: true, safeAreaInsets: insets, cleanups };
};

function decodeWebFrameworkModule(value: unknown): WebFrameworkModule | null {
  if (!isRecord(value)) {
    return null;
  }

  const partner = isRecord(value.partner) &&
    typeof value.partner.addAccessoryButton === 'function'
    ? {
        addAccessoryButton:
          value.partner.addAccessoryButton as WebFrameworkPartnerModule["addAccessoryButton"],
      }
    : undefined;

  const tdsEvent = isRecord(value.tdsEvent) &&
    typeof value.tdsEvent.addEventListener === 'function'
    ? {
        addEventListener:
          value.tdsEvent.addEventListener as WebFrameworkTdsEventModule["addEventListener"],
      }
    : undefined;

  const safeAreaInsets = isRecord(value.SafeAreaInsets) &&
    typeof value.SafeAreaInsets.get === 'function' &&
    typeof value.SafeAreaInsets.subscribe === 'function'
    ? {
        get: value.SafeAreaInsets.get as WebFrameworkSafeAreaModule["get"],
        subscribe:
          value.SafeAreaInsets.subscribe as WebFrameworkSafeAreaModule["subscribe"],
      }
    : undefined;

  const openURL =
    typeof value.openURL === 'function'
      ? value.openURL as WebFrameworkOpenUrl
      : undefined;
  const isMinVersionSupported =
    typeof value.isMinVersionSupported === 'function'
      ? value.isMinVersionSupported as WebFrameworkIsMinVersionSupported
      : undefined;
  const requestNotificationAgreement =
    typeof value.requestNotificationAgreement === 'function'
      ? value.requestNotificationAgreement as WebFrameworkRequestNotificationAgreement
      : undefined;

  if (
    partner == null &&
    tdsEvent == null &&
    safeAreaInsets == null &&
    openURL == null &&
    isMinVersionSupported == null &&
    requestNotificationAgreement == null
  ) {
    return null;
  }

  return {
    partner,
    tdsEvent,
    SafeAreaInsets: safeAreaInsets,
    openURL,
    isMinVersionSupported,
    requestNotificationAgreement,
  };
}
