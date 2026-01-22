/**
 * 토스 앱 환경 Context
 * 컴포넌트에서 토스 앱 환경 여부를 쉽게 확인하고 TDS 스타일을 적용할 수 있도록 합니다.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { isTossApp } from '../services/tossAppBridge';

interface TossAppContextType {
  isInTossApp: boolean;
}

const TossAppContext = createContext<TossAppContextType>({
  isInTossApp: false,
});

export const useTossApp = () => {
  return useContext(TossAppContext);
};

interface TossAppProviderProps {
  children: ReactNode;
}

export const TossAppProvider: React.FC<TossAppProviderProps> = ({ children }) => {
  const [isInTossApp, setIsInTossApp] = React.useState<boolean>(false);

  React.useEffect(() => {
    setIsInTossApp(isTossApp());
  }, []);

  return (
    <TossAppContext.Provider value={{ isInTossApp }}>
      {children}
    </TossAppContext.Provider>
  );
};
