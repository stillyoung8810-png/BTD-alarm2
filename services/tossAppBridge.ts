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
}

let _cachedModule: WebFrameworkModule | null = null;

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
    (window as any).TossApp ||
    (window as any).__TOSS_APP__ ||
    /TossApp|TossIt/i.test(navigator.userAgent)
  );
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
    const mod = await import('@apps-in-toss/web-framework');
    _cachedModule = mod as WebFrameworkModule;
    return _cachedModule;
  } catch (error) {
    console.warn('[TossApp] web-framework 로드 실패:', (error as Error).message);
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
    console.warn('[TossApp] 액세서리 버튼 추가 실패:', (error as Error).message);
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
// 6. 브릿지 초기화 (종합)
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
