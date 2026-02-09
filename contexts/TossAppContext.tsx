/**
 * 토스 앱 환경 Context
 *
 * 컴포넌트에서 토스 앱 환경 여부, Safe Area 여백 값 등을
 * useTossApp() 훅 하나로 간편하게 사용할 수 있습니다.
 *
 * 초기화 흐름:
 *  1. TossAppProvider 마운트 → initializeTossBridge() 호출
 *  2. 브릿지가 Safe Area / 이벤트 리스너를 설정
 *  3. Context value로 isInTossApp, safeAreaInsets 제공
 *  4. 언마운트 시 모든 cleanup 함수 실행
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  isTossApp,
  initializeTossBridge,
  type SafeAreaInsetsValue,
} from '../services/tossAppBridge';

// ---------------------------------------------------------------------------
// Context 타입
// ---------------------------------------------------------------------------
interface TossAppContextType {
  /** 현재 토스 앱 내부에서 실행 중인지 여부 */
  isInTossApp: boolean;
  /** 디바이스 안전 영역 여백 (노치, 홈바 등). 토스 앱 밖에서는 모두 0 */
  safeAreaInsets: SafeAreaInsetsValue;
}

const DEFAULT_INSETS: SafeAreaInsetsValue = { top: 0, bottom: 0, left: 0, right: 0 };

const TossAppContext = createContext<TossAppContextType>({
  isInTossApp: false,
  safeAreaInsets: DEFAULT_INSETS,
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export const useTossApp = (): TossAppContextType => {
  return useContext(TossAppContext);
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
interface TossAppProviderProps {
  children: ReactNode;
}

export const TossAppProvider: React.FC<TossAppProviderProps> = ({ children }) => {
  const [isInTossApp, setIsInTossApp] = useState<boolean>(false);
  const [safeAreaInsets, setSafeAreaInsets] = useState<SafeAreaInsetsValue>(DEFAULT_INSETS);

  const handleSafeAreaChange = useCallback((insets: SafeAreaInsetsValue) => {
    setSafeAreaInsets(insets);
  }, []);

  useEffect(() => {
    // 동기적으로 먼저 감지 (렌더링 블로킹 방지)
    const detected = isTossApp();
    setIsInTossApp(detected);

    if (!detected) return;

    // 비동기 브릿지 초기화
    let cleanups: Array<() => void> = [];

    initializeTossBridge(handleSafeAreaChange)
      .then((state) => {
        setIsInTossApp(state.isInTossApp);
        setSafeAreaInsets(state.safeAreaInsets);
        cleanups = state.cleanups;
      })
      .catch((error) => {
        console.warn('[TossAppContext] 브릿지 초기화 실패:', (error as Error).message);
      });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [handleSafeAreaChange]);

  return (
    <TossAppContext.Provider value={{ isInTossApp, safeAreaInsets }}>
      {children}
    </TossAppContext.Provider>
  );
};
